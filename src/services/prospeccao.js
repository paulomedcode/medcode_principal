import { supabase } from './supabase';
import { logAction } from '../utils/logger';
import { salvarEmpresa } from './crm';

/*
 * Prospecção: lista crua de possíveis clientes.
 * Tabelas em supabase/migrations/20261004120000_prospeccao.sql.
 */

const ok = ({ data, error }) => { if (error) throw error; return data; };

const CAMPOS = ['nome', 'categoria', 'telefone', 'email', 'site', 'instagram', 'endereco', 'cidade', 'uf', 'maps_url',
    'nota_google', 'avaliacoes', 'origem', 'status', 'prioridade', 'tentativas', 'ultimo_contato_em',
    'proximo_contato_em', 'notas', 'extras', 'party_id', 'responsavel_id'];

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
 * "A abordar", passa para "Abordado". Devolve o lead atualizado.
 */
export async function registrarTentativa(lead, canal, autorId) {
    const dados = {
        tentativas: (lead.tentativas || 0) + 1,
        ultimo_contato_em: new Date().toISOString(),
        ...(lead.status === 'NOVO' ? { status: 'CONTATADO' } : {}),
    };
    const row = ok(await supabase.from('prospeccao_leads').update(dados).eq('id', lead.id).select().single());
    await registrarEvento({ lead_id: lead.id, tipo: 'CONTATO', texto: canal ? `Tentativa por ${canal}` : 'Tentativa de contato' }, autorId);
    return row;
}

/** Cria a empresa no CRM (como LEAD) com os dados do lead e grava o vínculo. */
export async function converterEmCliente(lead) {
    const notas = [lead.notas, lead.maps_url && `Google Maps: ${lead.maps_url}`,
        lead.endereco && `Endereço: ${lead.endereco}`].filter(Boolean).join('\n');
    const empresa = await salvarEmpresa({
        name: lead.nome, kind: 'LEAD', tipo_pessoa: 'PJ', telefone: lead.telefone, email: lead.email,
        site: lead.site, instagram: lead.instagram, segmento: lead.categoria, origem: lead.origem || 'Prospecção',
        cidade: lead.cidade, uf: lead.uf, responsavel_id: lead.responsavel_id, notes: notas || null,
    });
    const row = ok(await supabase.from('prospeccao_leads').update({ party_id: empresa.id }).eq('id', lead.id).select().single());
    await logAction('PROSPECÇÃO', `Converteu em cliente: ${lead.nome}`);
    return { lead: row, empresa };
}
