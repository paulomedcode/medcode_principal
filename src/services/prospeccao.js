import { supabase } from './supabase';
import { logAction } from '../utils/logger';
import { TOQUES, hojeISO, diaDoToque } from '../config/cadencia';

/*
 * Prospecção: lista crua de possíveis clientes.
 * Tabelas em supabase/migrations/20261004120000_prospeccao.sql.
 */

const ok = ({ data, error }) => { if (error) throw error; return data; };

const CAMPOS = ['nome', 'categoria', 'telefone', 'email', 'site', 'instagram', 'endereco', 'cidade', 'uf', 'maps_url',
    'nota_google', 'avaliacoes', 'origem', 'status', 'prioridade', 'tentativas', 'ultimo_contato_em',
    'proximo_contato_em', 'notas', 'extras', 'party_id', 'responsavel_id', 'cadencia_inicio', 'cadencia_etapa'];

const soCampos = (obj) => Object.fromEntries(
    CAMPOS.filter((c) => obj[c] !== undefined).map((c) => [c, obj[c] === '' ? null : obj[c]])
);

/** Todos os leads. O PostgREST corta em 1000 por pedido, então pagina. */
export async function listarLeads() {
    const todos = [];
    for (let de = 0; ; de += 1000) {
        const lote = ok(await supabase.from('prospeccao_leads').select('*')
            .order('created_at', { ascending: false }).order('id').range(de, de + 999));
        todos.push(...lote);
        if (lote.length < 1000) return todos;
    }
}

export async function salvarLead(lead) {
    const dados = soCampos(lead);
    if (lead.id) return ok(await supabase.from('prospeccao_leads').update(dados).eq('id', lead.id).select().single());
    return ok(await supabase.from('prospeccao_leads').insert([dados]).select().single());
}

/** Mesma alteração em vários leads (status, prioridade…). */
export async function alterarLeads(ids, dados) {
    return ok(await supabase.from('prospeccao_leads').update(soCampos(dados)).in('id', ids).select());
}

export async function excluirLeads(ids) {
    ok(await supabase.from('prospeccao_leads').delete().in('id', ids));
    await logAction('PROSPECÇÃO', `Excluiu ${ids.length} lead(s)`);
}

/** Importa em lotes de 200. Devolve as linhas criadas. */
export async function importarLeads(linhas, onProgresso) {
    const criadas = [];
    for (let i = 0; i < linhas.length; i += 200) {
        const lote = ok(await supabase.from('prospeccao_leads').insert(linhas.slice(i, i + 200).map(soCampos)).select());
        criadas.push(...lote);
        onProgresso?.(Math.min(i + 200, linhas.length));
    }
    await logAction('PROSPECÇÃO', `Importou ${criadas.length} lead(s)`);
    return criadas;
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------
export async function listarEventos(leadId) {
    return ok(await supabase.from('prospeccao_eventos')
        .select('*, autor:users!prospeccao_eventos_autor_id_fkey(id, name)')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(100));
}

export async function registrarEvento(evento, autorId) {
    return ok(await supabase.from('prospeccao_eventos')
        .insert([{ ...evento, autor_id: autorId || null }]).select().single());
}

export async function excluirEvento(id) {
    ok(await supabase.from('prospeccao_eventos').delete().eq('id', id));
}

/**
 * Tentativa de contato: conta +1, carimba a data e, se o lead ainda estava
 * "A abordar", passa para "Abordado" e entra na cadência de acompanhamento
 * (src/config/cadencia.js). Devolve o lead atualizado.
 */
export async function registrarTentativa(lead, canal, autorId) {
    const primeira = lead.status === 'NOVO' && lead.cadencia_etapa == null;
    const dados = {
        tentativas: (lead.tentativas || 0) + 1,
        ultimo_contato_em: new Date().toISOString(),
        ...(lead.status === 'NOVO' ? { status: 'CONTATADO' } : {}),
        ...(primeira ? { cadencia_inicio: hojeISO(), cadencia_etapa: 0, proximo_contato_em: diaDoToque(hojeISO(), 0) } : {}),
    };
    const row = ok(await supabase.from('prospeccao_leads').update(dados).eq('id', lead.id).select().single());
    await registrarEvento({ lead_id: lead.id, tipo: 'CONTATO', texto: canal ? `Tentativa por ${canal}` : 'Tentativa de contato' }, autorId);
    return row;
}

// ---------------------------------------------------------------------------
// Cadência de acompanhamento (toques de 2, 5 e 10 dias)
// ---------------------------------------------------------------------------
const atualizar = async (id, dados) => ok(await supabase.from('prospeccao_leads').update(dados).eq('id', id).select().single());

/** Começa (ou recomeça) a contagem a partir do dia em que a abordagem foi enviada. */
export async function iniciarCadencia(lead, inicio, autorId) {
    const row = await atualizar(lead.id, {
        cadencia_inicio: inicio, cadencia_etapa: 0, proximo_contato_em: diaDoToque(inicio, 0),
        ...(['NOVO', 'SEM_RESPOSTA'].includes(lead.status) ? { status: 'CONTATADO' } : {}),
    });
    const [y, m, d] = inicio.split('-');
    await registrarEvento({ lead_id: lead.id, tipo: 'SISTEMA', texto: `Acompanhamento contando a partir de ${d}/${m}/${y}` }, autorId);
    return row;
}

/**
 * O toque da vez foi enviado: conta como tentativa e agenda o próximo. Depois
 * do último (agradecer e encerrar) o lead vai para "Sem resposta".
 */
export async function registrarToque(lead, autorId) {
    const etapa = lead.cadencia_etapa;
    const toque = TOQUES[etapa];
    if (!toque) throw new Error('Lead fora da cadência');
    const proxima = etapa + 1;
    const row = await atualizar(lead.id, {
        tentativas: (lead.tentativas || 0) + 1,
        ultimo_contato_em: new Date().toISOString(),
        ...(toque.encerra || !TOQUES[proxima]
            ? { cadencia_etapa: null, proximo_contato_em: null, status: 'SEM_RESPOSTA' }
            : { cadencia_etapa: proxima, proximo_contato_em: diaDoToque(lead.cadencia_inicio || hojeISO(), proxima, { aPartirDeAmanha: true }) }),
    });
    await registrarEvento({ lead_id: lead.id, tipo: 'CONTATO', texto: `${toque.titulo} (dia ${toque.dias}) enviado pelo WhatsApp` }, autorId);
    return row;
}

/** Respondeu: para a cadência e o lead fica pronto para virar oportunidade. */
export async function marcarRespondeu(lead) {
    return atualizar(lead.id, { status: 'RESPONDEU', cadencia_etapa: null, proximo_contato_em: null });
}

export async function pararCadencia(lead, autorId) {
    const row = await atualizar(lead.id, { cadencia_etapa: null, proximo_contato_em: null });
    await registrarEvento({ lead_id: lead.id, tipo: 'SISTEMA', texto: 'Acompanhamento parado' }, autorId);
    return row;
}

/**
 * Cria a empresa (se ainda não existe) e a oportunidade no Vendas, leva o
 * histórico para o cliente e marca o lead como convertido — tudo numa
 * transação (supabase/migrations/20261004190000_jornada_unica.sql).
 */
export async function virarOportunidade(lead, oportunidade) {
    const op = ok(await supabase.rpc('prospeccao_virar_oportunidade', { p_lead: lead.id, p_op: oportunidade }));
    await logAction('PROSPECÇÃO', `Virou oportunidade: ${lead.nome}`);
    const row = ok(await supabase.from('prospeccao_leads').select('*').eq('id', lead.id).single());
    return { lead: row, oportunidade: op };
}

/** Onde cada lead convertido está no Vendas: party_id → oportunidade mais recente com a etapa. */
export async function situacaoNoVendas(partyIds) {
    if (!partyIds.length) return {};
    const ops = ok(await supabase.from('crm_oportunidades')
        .select('id, titulo, party_id, created_at, etapa:crm_etapas(nome, tipo, cor)')
        .in('party_id', partyIds).order('created_at', { ascending: false }));
    const mapa = {};
    ops.forEach((o) => { if (!mapa[o.party_id]) mapa[o.party_id] = o; });
    return mapa;
}
