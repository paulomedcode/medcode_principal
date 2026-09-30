import { supabase } from './supabase';
import { logAction } from '../utils/logger';
import * as ws from './workspace';
import { servicosDe } from '../config/servicos';

/*
 * CRM, funil e projetos. Tabelas em supabase/migrations/20260929140000_crm_vendas_projetos.sql.
 *
 * "Empresa" é a linha de finance_parties — o mesmo cadastro que o financeiro
 * usa como cliente/fornecedor. Não existe um cadastro paralelo de clientes.
 */

const ok = ({ data, error }) => { if (error) throw error; return data; };

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------
export async function listarEmpresas() {
    return ok(await supabase
        .from('finance_parties')
        .select('*, responsavel:users!finance_parties_responsavel_id_fkey(id, name)')
        .order('name'));
}

export async function obterEmpresa(id) {
    return ok(await supabase
        .from('finance_parties')
        .select('*, responsavel:users!finance_parties_responsavel_id_fkey(id, name)')
        .eq('id', id)
        .maybeSingle());
}

const CAMPOS_EMPRESA = ['name', 'kind', 'tipo_pessoa', 'nome_fantasia', 'document', 'email', 'telefone', 'site',
    'instagram', 'segmento', 'origem', 'cidade', 'uf', 'responsavel_id', 'notes', 'ativo'];

const soCampos = (obj, campos) => Object.fromEntries(
    campos.filter((c) => obj[c] !== undefined).map((c) => [c, obj[c] === '' ? null : obj[c]])
);

export async function salvarEmpresa(empresa) {
    const dados = soCampos(empresa, CAMPOS_EMPRESA);
    if (empresa.id) {
        const row = ok(await supabase.from('finance_parties')
            .update({ ...dados, updated_at: new Date().toISOString() }).eq('id', empresa.id).select().single());
        await logAction('CRM - EMPRESA', `Editou empresa: ${row.name}`);
        return row;
    }
    const row = ok(await supabase.from('finance_parties').insert([dados]).select().single());
    await logAction('CRM - EMPRESA', `Cadastrou empresa: ${row.name}`);
    return row;
}

export async function excluirEmpresa(empresa) {
    // No banco o vínculo com lançamentos é "set null": apagar a empresa deixaria
    // o dinheiro sem contraparte em silêncio. Aqui a exclusão é barrada.
    const { count, error } = await supabase.from('finance_transactions')
        .select('id', { count: 'exact', head: true }).eq('party_id', empresa.id);
    if (error) throw error;
    if (count > 0) {
        const e = new Error(`${empresa.name} tem ${count} lançamento(s) no financeiro.`);
        e.code = '23503';
        throw e;
    }
    ok(await supabase.from('finance_parties').delete().eq('id', empresa.id));
    await logAction('CRM - EMPRESA', `Excluiu empresa: ${empresa.name}`);
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------
export async function listarContatos(partyId) {
    return ok(await supabase.from('crm_contatos').select('*')
        .eq('party_id', partyId).order('principal', { ascending: false }).order('nome'));
}

export async function salvarContato(contato) {
    const dados = soCampos(contato, ['party_id', 'nome', 'cargo', 'email', 'telefone', 'principal', 'notas']);
    if (contato.id) return ok(await supabase.from('crm_contatos').update(dados).eq('id', contato.id).select().single());
    return ok(await supabase.from('crm_contatos').insert([dados]).select().single());
}

export async function excluirContato(id) {
    ok(await supabase.from('crm_contatos').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Atividades (linha do tempo)
// ---------------------------------------------------------------------------
export async function listarAtividades({ partyId, oportunidadeId, projetoId } = {}) {
    let q = supabase.from('crm_atividades')
        .select('*, autor:users!crm_atividades_autor_id_fkey(id, name), oportunidade:crm_oportunidades(id, titulo), projeto:projetos(id, nome)')
        .order('data', { ascending: false }).limit(200);
    if (partyId) q = q.eq('party_id', partyId);
    if (oportunidadeId) q = q.eq('oportunidade_id', oportunidadeId);
    if (projetoId) q = q.eq('projeto_id', projetoId);
    return ok(await q);
}

export async function registrarAtividade(atividade, autorId) {
    const dados = soCampos(atividade, ['party_id', 'oportunidade_id', 'projeto_id', 'tipo', 'titulo', 'descricao',
        'data', 'proximo_passo', 'proximo_passo_em']);
    return ok(await supabase.from('crm_atividades').insert([{ ...dados, autor_id: autorId || null }]).select().single());
}

export async function excluirAtividade(id) {
    ok(await supabase.from('crm_atividades').delete().eq('id', id));
}

/** Próximos passos combinados e não concluídos (os atrasados inclusive), para o painel e a home. */
export async function proximosPassos({ ate = null, autorId = null } = {}) {
    let q = supabase.from('crm_atividades')
        .select('id, titulo, proximo_passo, proximo_passo_em, party_id, oportunidade_id, projeto_id, autor_id, empresa:finance_parties(name)')
        .not('proximo_passo_em', 'is', null)
        .is('proximo_passo_concluido_em', null)
        .order('proximo_passo_em');
    if (ate) q = q.lte('proximo_passo_em', ate);
    if (autorId) q = q.eq('autor_id', autorId);
    return ok(await q);
}

export async function concluirProximoPasso(id) {
    ok(await supabase.from('crm_atividades').update({ proximo_passo_concluido_em: new Date().toISOString() }).eq('id', id));
}

// ---------------------------------------------------------------------------
// Funil
// ---------------------------------------------------------------------------
export async function listarEtapas() {
    return ok(await supabase.from('crm_etapas').select('*').order('ordem'));
}

export async function salvarEtapa(etapa) {
    const dados = soCampos(etapa, ['nome', 'ordem', 'probabilidade', 'tipo', 'cor']);
    if (etapa.id) return ok(await supabase.from('crm_etapas').update(dados).eq('id', etapa.id).select().single());
    return ok(await supabase.from('crm_etapas').insert([dados]).select().single());
}

export async function excluirEtapa(id) {
    ok(await supabase.from('crm_etapas').delete().eq('id', id));
}

const SELECT_OPORTUNIDADE = '*, empresa:finance_parties(id, name, kind), contato:crm_contatos(id, nome), responsavel:users!crm_oportunidades_responsavel_id_fkey(id, name)';

export async function listarOportunidades({ partyId } = {}) {
    let q = supabase.from('crm_oportunidades').select(SELECT_OPORTUNIDADE)
        .order('posicao').order('created_at', { ascending: false });
    if (partyId) q = q.eq('party_id', partyId);
    return ok(await q);
}

const CAMPOS_OPORTUNIDADE = ['titulo', 'party_id', 'contato_id', 'servicos', 'valor', 'valor_recorrente', 'etapa_id',
    'responsavel_id', 'origem', 'previsao_fechamento', 'notas', 'posicao'];

export async function salvarOportunidade(op) {
    const dados = soCampos(op, CAMPOS_OPORTUNIDADE);
    if (op.id) {
        const row = ok(await supabase.from('crm_oportunidades').update(dados).eq('id', op.id).select(SELECT_OPORTUNIDADE).single());
        return row;
    }
    const row = ok(await supabase.from('crm_oportunidades').insert([dados]).select(SELECT_OPORTUNIDADE).single());
    await logAction('VENDAS - OPORTUNIDADE', `Criou oportunidade: ${row.titulo}`);
    return row;
}

/** Arrastar no quadro: muda de etapa e/ou de posição. */
export async function moverOportunidade(id, etapaId, posicao) {
    ok(await supabase.from('crm_oportunidades').update({ etapa_id: etapaId, posicao }).eq('id', id));
}

export async function perderOportunidade(op, etapaPerdidoId, motivo, autorId) {
    ok(await supabase.from('crm_oportunidades').update({
        etapa_id: etapaPerdidoId, perdido_em: new Date().toISOString(), motivo_perda: motivo || null,
    }).eq('id', op.id));
    await registrarAtividade({
        party_id: op.party_id, oportunidade_id: op.id, tipo: 'SISTEMA',
        titulo: 'Oportunidade perdida', descricao: motivo || null,
    }, autorId);
    await logAction('VENDAS - OPORTUNIDADE', `Perdeu oportunidade: ${op.titulo}${motivo ? ` (${motivo})` : ''}`);
}

/** Tira a oportunidade de GANHO/PERDIDO e devolve ao funil (não desfaz projeto nem parcelas). */
export async function reabrirOportunidade(op, etapaId) {
    ok(await supabase.from('crm_oportunidades').update({
        etapa_id: etapaId, perdido_em: null, motivo_perda: null,
    }).eq('id', op.id));
}

export async function excluirOportunidade(op) {
    ok(await supabase.from('crm_oportunidades').delete().eq('id', op.id));
    await logAction('VENDAS - OPORTUNIDADE', `Excluiu oportunidade: ${op.titulo}`);
}

/**
 * Ganha a oportunidade: RPC atômica (etapa GANHO, lead→cliente, projeto,
 * parcelas a receber, mensalidade). Depois, fora da transação, monta a página
 * de entregas — se ela falhar, o projeto fica e a página pode ser criada na
 * tela do projeto.
 */
export async function ganharOportunidade(op, dados, { criarEntregas = true, userId = null } = {}) {
    const projeto = ok(await supabase.rpc('ganhar_oportunidade', { p_oportunidade_id: op.id, p_dados: dados }));
    await logAction('VENDAS - OPORTUNIDADE', `Ganhou oportunidade: ${op.titulo} → projeto ${projeto.nome}`);
    let entregasErro = null;
    if (criarEntregas) {
        try { await criarPaginaDeEntregas(projeto, { userId }); }
        catch (e) { console.error('Página de entregas', e); entregasErro = e; }
    }
    return { projeto, entregasErro };
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------
const SELECT_PROJETO = '*, empresa:finance_parties(id, name), responsavel:users!projetos_responsavel_id_fkey(id, name), oportunidade:crm_oportunidades(id, titulo)';

export async function listarProjetos({ partyId } = {}) {
    let q = supabase.from('projetos').select(SELECT_PROJETO).order('created_at', { ascending: false });
    if (partyId) q = q.eq('party_id', partyId);
    return ok(await q);
}

export async function obterProjeto(id) {
    return ok(await supabase.from('projetos').select(SELECT_PROJETO).eq('id', id).maybeSingle());
}

const CAMPOS_PROJETO = ['nome', 'party_id', 'servicos', 'status', 'responsavel_id', 'data_inicio', 'prazo',
    'concluido_em', 'valor_contratado', 'valor_recorrente', 'descricao', 'workspace_page_id'];

export async function salvarProjeto(projeto) {
    const dados = soCampos(projeto, CAMPOS_PROJETO);
    if (projeto.id) {
        const row = ok(await supabase.from('projetos').update(dados).eq('id', projeto.id).select(SELECT_PROJETO).single());
        await logAction('PROJETOS', `Editou projeto: ${row.nome}`);
        return row;
    }
    const row = ok(await supabase.from('projetos').insert([dados]).select(SELECT_PROJETO).single());
    await logAction('PROJETOS', `Criou projeto: ${row.nome}`);
    return row;
}

export async function excluirProjeto(projeto) {
    ok(await supabase.from('projetos').delete().eq('id', projeto.id));
    await logAction('PROJETOS', `Excluiu projeto: ${projeto.nome}`);
}

/** Lançamentos do projeto (receitas e custos) — base da margem. */
export async function financeiroDoProjeto(projetoId) {
    return ok(await supabase.from('finance_transactions')
        .select('id, type, amount, paid_amount, status, due_date, transaction_date, description, installment_number, installment_total, finance_categories(name)')
        .eq('projeto_id', projetoId)
        .is('transfer_group_id', null)
        .order('due_date', { ascending: true, nullsFirst: false }));
}

export async function mensalidadesDoProjeto(projetoId) {
    return ok(await supabase.from('finance_recurrences').select('*').eq('projeto_id', projetoId));
}

/** Receitas e despesas lançadas por empresa (tela do cliente). */
export async function financeiroDaEmpresa(partyId) {
    return ok(await supabase.from('finance_transactions')
        .select('id, type, amount, paid_amount, status, due_date, description, projeto_id')
        .eq('party_id', partyId)
        .is('transfer_group_id', null));
}

// ---------------------------------------------------------------------------
// Página de entregas (módulo Compromissos)
//
// Cada projeto ganha um database "Entregas" dentro da pasta "Projetos" do
// workspace, com as fases dos serviços vendidos como colunas do quadro e as
// tarefas-modelo já cadastradas. Com mais de um serviço, as fases se somam
// (sem repetir) e cada tarefa leva o emoji do serviço a que pertence.
// ---------------------------------------------------------------------------
const PASTA_PROJETOS = 'Projetos';

async function pastaDeProjetos(userId) {
    const { data, error } = await supabase.from('workspace_pages')
        .select('id').is('parent_id', null).eq('type', 'page').eq('title', PASTA_PROJETOS)
        .is('deleted_at', null).limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0].id;
    const pasta = await ws.createPage({ title: PASTA_PROJETOS, icon: '🚀', createdBy: userId });
    return pasta.id;
}

const CORES_FASE = ['gray', 'blue', 'purple', 'yellow', 'orange', 'green', 'pink'];
const opt = (name, color) => ({ id: globalThis.crypto?.randomUUID?.() || `opt-${Math.random().toString(36).slice(2)}`, name, color });

export async function criarPaginaDeEntregas(projeto, { userId = null } = {}) {
    const servicos = servicosDe(projeto);
    const varios = servicos.length > 1;
    const pastaId = await pastaDeProjetos(userId);
    const empresa = projeto.empresa?.name ? ` · ${projeto.empresa.name}` : '';
    const db = await ws.createPage({
        parentId: pastaId, type: 'database', title: `${projeto.nome}${empresa}`,
        icon: servicos[0].emoji, createdBy: userId,
    });

    const fases = [...new Set(servicos.flatMap((s) => s.fases))].map((f, i) => opt(f, CORES_FASE[i % CORES_FASE.length]));
    const status = [opt('A fazer', 'gray'), opt('Fazendo', 'blue'), opt('Concluído', 'green')];
    const props = [];
    const specs = [
        { name: 'Fase', type: 'select', options: fases },
        { name: 'Status', type: 'status', options: status },
        { name: 'Responsável', type: 'person', options: [] },
        { name: 'Prazo', type: 'date', options: [] },
    ];
    for (let i = 0; i < specs.length; i++) {
        props.push(await ws.createProperty({ databaseId: db.id, ...specs[i], position: i }));
    }
    const [pFase, pStatus, pResp, pPrazo] = props;

    await ws.createView({ databaseId: db.id, name: 'Quadro', type: 'board', position: 0, config: { groupBy: pFase.id } });
    await ws.createView({ databaseId: db.id, name: 'Tabela', type: 'table', position: 1, config: {} });
    await ws.createView({ databaseId: db.id, name: 'Calendário', type: 'calendar', position: 2, config: { dateProp: pPrazo.id } });

    const tarefas = servicos.flatMap((s) => s.tarefas.map(([titulo, fase]) => [varios ? `${s.emoji} ${titulo}` : titulo, fase]));
    for (const [titulo, fase] of tarefas) {
        const row = await ws.createRow(db.id, { title: titulo, createdBy: userId });
        await ws.setRowValues(row.id, {
            [pFase.id]: fases.find((f) => f.name === fase)?.id ?? null,
            [pStatus.id]: status[0].id,
            [pResp.id]: projeto.responsavel_id || undefined,
        });
    }

    await supabase.from('projetos').update({ workspace_page_id: db.id }).eq('id', projeto.id);
    return db;
}

/**
 * Progresso das entregas: tarefas com Status "Concluído" ÷ total, por quadro.
 * Devolve { [workspacePageId]: { feitas, total } }.
 */
export async function progressoDasEntregas(pageIds = []) {
    const ids = pageIds.filter(Boolean);
    if (!ids.length) return {};
    const [{ data: props, error: e1 }, { data: linhas, error: e2 }] = await Promise.all([
        supabase.from('workspace_db_properties').select('id, database_id, options').in('database_id', ids).eq('name', 'Status'),
        supabase.from('workspace_pages').select('id, parent_id').in('parent_id', ids).is('deleted_at', null),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const out = Object.fromEntries(ids.map((id) => [id, { feitas: 0, total: 0 }]));
    (linhas || []).forEach((l) => { out[l.parent_id].total += 1; });
    const statusProps = props || [];
    if (!statusProps.length || !(linhas || []).length) return out;
    const { data: valores, error: e3 } = await supabase.from('workspace_db_values')
        .select('row_id, property_id, value').in('property_id', statusProps.map((p) => p.id));
    if (e3) throw e3;
    const concluida = new Map(statusProps.map((p) => [p.id, (p.options || []).find((o) => /conclu/i.test(o.name))?.id]));
    const pai = new Map((linhas || []).map((l) => [l.id, l.parent_id]));
    (valores || []).forEach((v) => {
        const db = pai.get(v.row_id);
        if (db && v.value && v.value === concluida.get(v.property_id)) out[db].feitas += 1;
    });
    return out;
}

/** Últimas atividades registradas (feed da tela inicial). */
export async function atividadesRecentes(limite = 8) {
    return ok(await supabase.from('crm_atividades')
        .select('id, tipo, titulo, data, party_id, oportunidade_id, projeto_id, autor:users!crm_atividades_autor_id_fkey(name), empresa:finance_parties(name)')
        .order('data', { ascending: false }).limit(limite));
}
