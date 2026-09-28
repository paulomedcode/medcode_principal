// ============================================================================
// Camada de dados do Workspace (módulo Compromisso estilo Notion).
//
// Toda a conversa com o Supabase fica aqui, para a UI não conhecer detalhes de
// tabela/coluna. Tabelas: workspace_pages (árvore), workspace_db_properties,
// workspace_db_values, workspace_db_views (ver migration 20260621120000).
//
// Convenção: funções retornam dados já tratados ou lançam erro (try/catch fica
// na UI, junto do toast). Páginas excluídas (deleted_at != null) nunca vêm nas
// listagens normais — só em listTrash().
// ============================================================================
import { supabase } from './supabase';

const PAGES = 'workspace_pages';
const PROPS = 'workspace_db_properties';
const VALUES = 'workspace_db_values';
const VIEWS = 'workspace_db_views';
const MENTIONS = 'workspace_mentions';

// Campos da página que a árvore lateral precisa (sem o content pesado).
const TREE_FIELDS = 'id, parent_id, type, title, icon, position, categoria_id, visibility, created_by, updated_at';
// Sem a coluna `visibility` — usado como fallback em hospitais onde a migration
// 20260730120000 ainda não rodou (não quebra a tela até a migration aplicar).
const TREE_FIELDS_LEGACY = 'id, parent_id, type, title, icon, position, categoria_id, created_by, updated_at';
// Campos do seletor de banco (exibição vinculada) — precisa da visibilidade
// para não oferecer banco particular de outra pessoa. Mesmo par com/sem a
// coluna `visibility` do fallback acima.
const DB_PICK_FIELDS = 'id, title, icon, visibility, categoria_id, created_by';
const DB_PICK_FIELDS_LEGACY = 'id, title, icon, categoria_id, created_by';

// ----------------------------------------------------------------------------
// Visibilidade (puros — regra única de quem enxerga o quê)
//
// Enforcement de verdade só com RLS; aqui é nível de app. Mas a regra precisa
// ser UMA só: a sidebar esconder uma página "somente eu" não adianta nada se o
// bloco de exibição vinculada oferecer o mesmo banco para todo mundo.
// ----------------------------------------------------------------------------

/**
 * Normaliza a visibilidade de uma página para { scope, ids? }.
 * Compat: sem `visibility`, cai para categoria_id (uma categoria) ou "toda a equipe".
 */
export function pageVisScope(p) {
  const v = p?.visibility;
  if (v && v.scope) return v;
  return p?.categoria_id ? { scope: 'categories', ids: [p.categoria_id] } : { scope: 'all' };
}

/**
 * Esta página aparece para este usuário?
 *  • toda a equipe → todos veem
 *  • somente eu    → só o criador (nem Admin/Dev)
 *  • categorias    → quem tem uma das categorias, o criador, e Admin/Dev
 */
export function podeVerPagina(p, user) {
  const v = pageVisScope(p);
  if (v.scope === 'private') return p?.created_by === user?.id;
  if (v.scope === 'categories') {
    const veTudo = user?.role === 'Desenvolvedor' || user?.role === 'Administrador';
    return veTudo || p?.created_by === user?.id
      || (Array.isArray(v.ids) && v.ids.includes(user?.categoria_agenda_id));
  }
  return true; // 'all'
}

// ----------------------------------------------------------------------------
// Helpers de árvore (puros — fáceis de testar)
// ----------------------------------------------------------------------------

/**
 * Monta uma árvore a partir da lista plana de páginas.
 * Cada nó ganha `children: []`, ordenado por `position` e depois `title`.
 * Páginas-filhas de um database (linhas) NÃO entram na árvore da sidebar.
 */
export function buildTree(flatPages, { databaseIds = new Set() } = {}) {
  const byId = new Map();
  flatPages.forEach((p) => byId.set(p.id, { ...p, children: [] }));

  const roots = [];
  byId.forEach((node) => {
    // Linhas de database (pai é um database) ficam fora da árvore de navegação.
    if (node.parent_id && databaseIds.has(node.parent_id)) return;

    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const sortRec = (nodes) => {
    nodes.sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title, 'pt-BR'));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/**
 * IDs de todos os descendentes a partir da lista PLANA de páginas (inclui
 * linhas de database, que não aparecem na árvore visual). Use ao excluir para
 * não deixar linhas órfãs.
 */
export function descendantIdsFlat(flatPages, pageId) {
  const childrenOf = new Map();
  flatPages.forEach((p) => {
    const arr = childrenOf.get(p.parent_id) || [];
    arr.push(p.id);
    childrenOf.set(p.parent_id, arr);
  });
  const out = [];
  const stack = [...(childrenOf.get(pageId) || [])];
  while (stack.length) {
    const cur = stack.pop();
    out.push(cur);
    (childrenOf.get(cur) || []).forEach((k) => stack.push(k));
  }
  return out;
}

/** IDs de todos os descendentes de uma página (para mover/excluir com segurança). */
export function collectDescendantIds(tree, pageId) {
  const out = [];
  const walk = (nodes) => {
    nodes.forEach((n) => {
      if (n.id === pageId) collect(n.children);
      else walk(n.children);
    });
  };
  const collect = (nodes) => {
    nodes.forEach((n) => { out.push(n.id); collect(n.children); });
  };
  walk(tree);
  return out;
}

// ----------------------------------------------------------------------------
// Páginas
// ----------------------------------------------------------------------------

/**
 * Lista plana das páginas da ÁRVORE (sem content e sem as linhas de database).
 * Use buildTree() para a hierarquia.
 *
 * Linhas de database são páginas-filhas de um database — podem ser milhares e
 * a sidebar as descarta de qualquer forma. Buscá-las aqui deixava a abertura do
 * Compromisso lenta à toa, então elas ficam de fora: quem precisa delas é o
 * DatabaseView, via listRows(). Para os descendentes na exclusão, ver
 * fetchDescendantIds().
 */
export async function listPages() {
  const run = async (fields) => {
    const { data: dbs, error: dbErr } = await supabase
      .from(PAGES).select('id').eq('type', 'database').is('deleted_at', null);
    if (dbErr) return { error: dbErr };

    let q = supabase.from(PAGES).select(fields).is('deleted_at', null);
    const ids = (dbs || []).map((d) => d.id);
    // Exclui as linhas (filhas de um database), mantendo raízes e subpáginas.
    if (ids.length) q = q.or(`parent_id.is.null,parent_id.not.in.(${ids.join(',')})`);
    return q.order('position', { ascending: true });
  };

  let { data, error } = await run(TREE_FIELDS);
  // Coluna `visibility` ainda não existe neste banco → degrada sem quebrar.
  if (error && /visibility/i.test(`${error.message || ''} ${error.details || ''}`)) {
    ({ data, error } = await run(TREE_FIELDS_LEGACY));
  }
  if (error) throw error;
  return data || [];
}

/**
 * Bancos de dados que ESTE usuário pode escolher como fonte de um bloco
 * (exibição vinculada).
 *
 * Banco marcado "somente eu" é individual de verdade: não pode nem aparecer na
 * lista dos outros — senão bastaria alguém vinculá-lo numa página compartilhada
 * para o conteúdo particular ir parar na tela de todo mundo.
 */
export async function listDatabases(user) {
  const run = (fields) => supabase
    .from(PAGES).select(fields).eq('type', 'database').is('deleted_at', null).order('title');

  let { data, error } = await run(DB_PICK_FIELDS);
  // Coluna `visibility` ainda não existe neste banco → degrada sem quebrar.
  if (error && /visibility/i.test(`${error.message || ''} ${error.details || ''}`)) {
    ({ data, error } = await run(DB_PICK_FIELDS_LEGACY));
  }
  if (error) throw error;
  return (data || []).filter((p) => podeVerPagina(p, user));
}

/**
 * Ids de TODOS os descendentes de uma página, direto do banco (inclui as linhas
 * de database, que não vêm mais em listPages). Usado ao excluir, para não
 * deixar linha órfã. Faz uma consulta por nível — árvores aqui são rasas.
 */
export async function fetchDescendantIds(pageId) {
  const out = [];
  let camada = [pageId];
  while (camada.length) {
    const { data, error } = await supabase
      .from(PAGES).select('id').in('parent_id', camada).is('deleted_at', null);
    if (error) throw error;
    const ids = (data || []).map((r) => r.id);
    if (!ids.length) break;
    out.push(...ids);
    camada = ids;
  }
  return out;
}

/** Carrega uma página completa (com content) para edição. */
export async function getPage(id) {
  const { data, error } = await supabase.from(PAGES).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Cria uma página. Coloca no fim da lista de irmãos (maior position + 1).
 * `type` = 'page' (padrão) ou 'database'.
 */
export async function createPage({ parentId = null, type = 'page', title = '', icon = null, categoriaId = null, createdBy = null } = {}) {
  const position = await nextPosition(parentId);
  const { data, error } = await supabase
    .from(PAGES)
    .insert([{ parent_id: parentId, type, title, icon, categoria_id: categoriaId, created_by: createdBy, position }])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Atualiza campos avulsos (title, icon, cover, categoria_id, visibility, content...). */
export async function updatePage(id, patch) {
  // Retorna campos legados de propósito: edições comuns (título/ícone/mover)
  // não dependem da coluna `visibility` em bancos sem a migration 20260730120000.
  const { data, error } = await supabase.from(PAGES).update(patch).eq('id', id).select(TREE_FIELDS_LEGACY).single();
  if (error) throw error;
  return data;
}

/** Salva apenas o conteúdo (blocos do editor). Usado no autosave. */
export async function saveContent(id, content) {
  const { error } = await supabase.from(PAGES).update({ content }).eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Menções (@fulano)
// ----------------------------------------------------------------------------

/**
 * Registra que alguém foi marcado numa página. É o que faz a menção virar aviso
 * no sino da pessoa (ver migration 20260731180000).
 *
 * Falha em silêncio de propósito: quem está escrevendo não pode ser
 * interrompido por um erro de registro — a menção já está no texto de qualquer
 * jeito. Marcar a si mesmo não gera aviso.
 */
export async function registrarMencao({ pageId, userId, autorId = null }) {
  if (!pageId || !userId || userId === autorId) return;
  const { error } = await supabase
    .from(MENTIONS)
    .insert([{ page_id: pageId, user_id: userId, autor_id: autorId }]);
  if (error) console.error('Erro ao registrar menção:', error);
}

/** Menções ainda não lidas de um usuário, da mais nova para a mais velha. */
export async function mencoesPendentes(userId, limite = 20) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from(MENTIONS)
    .select('id, page_id, autor_id, criado_em')
    .eq('user_id', userId)
    .is('lida_em', null)
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

/** Marca menções como lidas (ao abrir o sino). */
export async function marcarMencoesLidas(ids) {
  if (!ids?.length) return;
  const { error } = await supabase
    .from(MENTIONS)
    .update({ lida_em: new Date().toISOString() })
    .in('id', ids);
  if (error) console.error('Erro ao marcar menções como lidas:', error);
}

/** Move/aninha uma página sob novo pai e (opcional) reposiciona. */
export async function movePage(id, newParentId, newPosition = null) {
  const patch = { parent_id: newParentId };
  patch.position = newPosition == null ? await nextPosition(newParentId) : newPosition;
  const { error } = await supabase.from(PAGES).update(patch).eq('id', id);
  if (error) throw error;
}

/** Reordena uma lista de irmãos: aplica positions 0,1,2... na ordem recebida. */
export async function reorderSiblings(orderedIds) {
  const updates = orderedIds.map((id, i) =>
    supabase.from(PAGES).update({ position: i }).eq('id', id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

/** Lixeira recuperável: marca a página (e descendentes) como excluída. */
export async function softDeletePage(id, descendantIds = []) {
  const ids = [id, ...descendantIds];
  const { error } = await supabase.from(PAGES).update({ deleted_at: new Date().toISOString() }).in('id', ids);
  if (error) throw error;
}

/** Restaura uma página da lixeira (e descendentes informados). */
export async function restorePage(id, descendantIds = []) {
  const ids = [id, ...descendantIds];
  const { error } = await supabase.from(PAGES).update({ deleted_at: null }).in('id', ids);
  if (error) throw error;
}

/** Lista o que está na lixeira (ordenado por exclusão mais recente). */
export async function listTrash() {
  const { data, error } = await supabase
    .from(PAGES)
    .select(TREE_FIELDS + ', deleted_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Exclui de vez (irreversível). Cascata cuida de filhos/valores/visões. */
export async function hardDeletePage(id) {
  const { error } = await supabase.from(PAGES).delete().eq('id', id);
  if (error) throw error;
}

/** Maior position entre os irmãos + 1 (coloca novo item no fim). */
async function nextPosition(parentId) {
  let q = supabase.from(PAGES).select('position').is('deleted_at', null).order('position', { ascending: false }).limit(1);
  q = parentId == null ? q.is('parent_id', null) : q.eq('parent_id', parentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data && data.length ? Number(data[0].position) : 0) + 1;
}

// ----------------------------------------------------------------------------
// Databases — propriedades, valores, visões e linhas (Fase 2)
// A base já está pronta; a UI dessas visões é o próximo incremento.
// ----------------------------------------------------------------------------

export async function listProperties(databaseId) {
  const { data, error } = await supabase
    .from(PROPS).select('*').eq('database_id', databaseId).order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createProperty({ databaseId, name, type, options = [], position = 0 }) {
  const { data, error } = await supabase
    .from(PROPS).insert([{ database_id: databaseId, name, type, options, position }]).select('*').single();
  if (error) throw error;
  return data;
}

export async function listViews(databaseId) {
  const { data, error } = await supabase
    .from(VIEWS).select('*').eq('database_id', databaseId).order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createView({ databaseId, name, type, config = {}, position = 0 }) {
  const { data, error } = await supabase
    .from(VIEWS).insert([{ database_id: databaseId, name, type, config, position }]).select('*').single();
  if (error) throw error;
  return data;
}

/** Linhas de um database = páginas-filhas + seus valores de propriedade. */
export async function listRows(databaseId) {
  const { data: rows, error } = await supabase
    .from(PAGES).select('id, title, icon, created_at, updated_at')
    .eq('parent_id', databaseId).is('deleted_at', null)
    .order('position', { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const { data: values, error: vErr } = await supabase
    .from(VALUES).select('*').in('row_id', rows.map((r) => r.id));
  if (vErr) throw vErr;

  const byRow = new Map(rows.map((r) => [r.id, { ...r, values: {} }]));
  (values || []).forEach((v) => {
    const row = byRow.get(v.row_id);
    if (row) row.values[v.property_id] = v.value;
  });
  return Array.from(byRow.values());
}

/**
 * Prévia do que está escrito DENTRO de cada tarefa (bloco de observações).
 *
 * Fica numa consulta separada de propósito: `content` é o campo mais pesado da
 * linha e a tabela precisa aparecer antes dele. A tela pinta com listRows() e
 * só depois preenche as prévias — quem tem centenas de tarefas não paga o
 * conteúdo delas na abertura.
 */
export async function listRowExcerpts(databaseId) {
  const { data, error } = await supabase
    .from(PAGES).select('id, content')
    .eq('parent_id', databaseId).is('deleted_at', null);
  if (error) throw error;
  const out = {};
  (data || []).forEach((r) => { out[r.id] = r.content; });
  return out;
}

/** Define o valor de uma propriedade numa linha (upsert idempotente). */
export async function setRowValue(rowId, propertyId, value) {
  const { error } = await supabase
    .from(VALUES).upsert({ row_id: rowId, property_id: propertyId, value }, { onConflict: 'row_id,property_id' });
  if (error) throw error;
}

/** Grava vários valores de uma linha de uma vez. `map` = { propertyId: value }. */
export async function setRowValues(rowId, map) {
  const payload = Object.entries(map)
    .filter(([, v]) => v !== undefined)
    .map(([property_id, value]) => ({ row_id: rowId, property_id, value }));
  if (payload.length === 0) return;
  const { error } = await supabase.from(VALUES).upsert(payload, { onConflict: 'row_id,property_id' });
  if (error) throw error;
}

export async function updateProperty(id, patch) {
  const { data, error } = await supabase.from(PROPS).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteProperty(id) {
  const { error } = await supabase.from(PROPS).delete().eq('id', id);
  if (error) throw error;
}

/** Reordena colunas: aplica positions 0,1,2... na ordem recebida. */
export async function reorderProperties(orderedIds) {
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from(PROPS).update({ position: i }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

export async function updateView(id, patch) {
  const { data, error } = await supabase.from(VIEWS).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteView(id) {
  const { error } = await supabase.from(VIEWS).delete().eq('id', id);
  if (error) throw error;
}

/** Cria uma linha do database (página-filha) e devolve já no formato de listRows. */
export async function createRow(databaseId, { title = '', createdBy = null } = {}) {
  const page = await createPage({ parentId: databaseId, type: 'page', title, createdBy });
  return { id: page.id, title: page.title, icon: page.icon, created_at: page.created_at, updated_at: page.updated_at, values: {} };
}

/** Remove uma linha (vai para a lixeira, recuperável). */
export async function deleteRow(rowId) {
  await softDeletePage(rowId);
}

/** Duplica uma linha (título + conteúdo + todos os valores de propriedade). */
export async function duplicateRow(databaseId, sourceRow, { createdBy = null } = {}) {
  const full = await getPage(sourceRow.id); // pega o content dos blocos
  const page = await createPage({
    parentId: databaseId, type: 'page',
    title: (full?.title || sourceRow.title || '') + ' (cópia)',
    icon: full?.icon || null, createdBy,
  });
  if (full?.content) await saveContent(page.id, full.content);
  const values = sourceRow.values || {};
  await setRowValues(page.id, values);
  return { id: page.id, title: page.title, icon: page.icon, created_at: page.created_at, updated_at: page.updated_at, values: { ...values } };
}

// ----------------------------------------------------------------------------
// Provisionamento de um database pronto-para-uso
// ----------------------------------------------------------------------------

const uid = () =>
  (globalThis.crypto?.randomUUID?.() || `opt-${Math.random().toString(36).slice(2)}-${Date.now()}`);

/** Options padrão de Status (id estável + cor no padrão dos selects). */
function defaultStatusOptions() {
  return [
    { id: uid(), name: 'Pendente', color: 'amber' },
    { id: uid(), name: 'Em andamento', color: 'blue' },
    { id: uid(), name: 'Concluído', color: 'green' },
  ];
}

/**
 * Cria propriedades + 4 visões padrão para um database recém-criado.
 * Com `seedCompromissos`, já monta o conjunto de colunas da agenda
 * (Status, Data, Hora, Categoria, Responsável) e popula Categoria a partir
 * de agenda_categorias — deixando o database pronto para receber a agenda.
 */
export async function provisionDatabase(databaseId, { seedCompromissos = false } = {}) {
  let categoriaOptions = [];
  if (seedCompromissos) {
    const { data: cats } = await supabase.from('agenda_categorias').select('id, nome');
    categoriaOptions = (cats || []).map((c) => ({ id: c.id, name: c.nome, color: 'gray' }));
  }

  // Propriedades (na ordem em que aparecem na tabela). Title da página é a 1ª coluna implícita.
  // Duas datas de propósito: "Data Criação" é quando a tarefa entrou;
  // "Expectativa de conclusão" é o prazo — é ela que manda no calendário.
  const propsSpec = seedCompromissos
    ? [
        { name: 'Status', type: 'status', options: defaultStatusOptions() },
        { name: 'Data Criação', type: 'date', options: [] },
        { name: 'Expectativa de conclusão', type: 'date', options: [] },
        { name: 'Hora', type: 'time', options: [] },
        { name: 'Categoria', type: 'select', options: categoriaOptions },
        { name: 'Responsável', type: 'person', options: [] },
      ]
    : [
        { name: 'Status', type: 'status', options: defaultStatusOptions() },
        { name: 'Data Criação', type: 'date', options: [] },
        { name: 'Expectativa de conclusão', type: 'date', options: [] },
      ];

  const created = [];
  for (let i = 0; i < propsSpec.length; i++) {
    const p = propsSpec[i];
    created.push(await createProperty({ databaseId, name: p.name, type: p.type, options: p.options, position: i }));
  }

  const byName = (n) => created.find((p) => p.name === n);
  const statusProp = byName('Status');
  const prazoProp = byName('Expectativa de conclusão');

  // Visões padrão (config aponta para os ids reais das propriedades).
  await createView({ databaseId, name: 'Tabela', type: 'table', position: 0, config: {} });
  await createView({ databaseId, name: 'Quadro', type: 'board', position: 1, config: { groupBy: statusProp?.id || null } });
  await createView({ databaseId, name: 'Calendário', type: 'calendar', position: 2, config: { dateProp: prazoProp?.id || null } });
  await createView({ databaseId, name: 'Lista', type: 'list', position: 3, config: {} });

  return created;
}

/**
 * Cria um database completo (página type='database' + provisionamento) e devolve a página.
 */
export async function createDatabase({ parentId = null, title = 'Novo database', icon = '📊', createdBy = null, seedCompromissos = false } = {}) {
  const page = await createPage({ parentId, type: 'database', title, icon, createdBy });
  await provisionDatabase(page.id, { seedCompromissos });
  return page;
}

// ----------------------------------------------------------------------------
// Migração da agenda atual (agenda_pessoal) para um database "Compromissos".
// Idempotente: uma propriedade "Ref. agenda" guarda o id de origem; re-rodar
// só importa o que ainda não veio. Não apaga nada da agenda original.
// ----------------------------------------------------------------------------
export async function importAgendaToDatabase(databaseId, { createdBy = null } = {}) {
  // 1) Garante a propriedade de rastreio (id de origem).
  let dbProps = await listProperties(databaseId);
  const findByName = (n) => dbProps.find((p) => p.name.toLowerCase() === n.toLowerCase());
  let refProp = findByName('Ref. agenda');
  if (!refProp) {
    refProp = await createProperty({ databaseId, name: 'Ref. agenda', type: 'text', position: dbProps.length });
    dbProps = await listProperties(databaseId);
  }

  // A data da agenda é quando a coisa acontece — isso é prazo, não cadastro.
  const dataProp = findByName('Expectativa de conclusão') || findByName('Data Criação') || findByName('Data');
  const horaProp = findByName('Hora');
  const catProp = findByName('Categoria');
  const respProp = findByName('Responsável');
  const statusProp = findByName('Status');
  const statusOptByName = (name) =>
    statusProp ? (statusProp.options || []).find((o) => o.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;
  const statusPendente = statusOptByName('Pendente');
  const statusConcluido = statusOptByName('Concluído');

  // 2) Ids de origem já importados (para não duplicar).
  const existingRows = await listRows(databaseId);
  const already = new Set(
    existingRows.map((r) => r.values[refProp.id]).filter(Boolean).map(String)
  );

  // 3) Lê a agenda e filtra o que falta importar.
  const { data: agenda, error } = await supabase
    .from('agenda_pessoal')
    .select('id, texto, data_agendada, hora_agendada, categoria_id, user_id, concluido')
    .order('data_agendada', { ascending: true });
  if (error) throw error;

  const pending = (agenda || []).filter((a) => !already.has(String(a.id)));
  let imported = 0;

  // 4) Cria uma linha por compromisso e grava os valores num único upsert.
  for (const a of pending) {
    const row = await createRow(databaseId, { title: a.texto || 'Sem título', createdBy });
    const values = { [refProp.id]: String(a.id) };
    if (dataProp && a.data_agendada) values[dataProp.id] = a.data_agendada;
    if (horaProp && a.hora_agendada) values[horaProp.id] = String(a.hora_agendada).substring(0, 5);
    if (catProp && a.categoria_id) values[catProp.id] = a.categoria_id; // option.id == agenda_categorias.id
    if (respProp && a.user_id) values[respProp.id] = a.user_id;
    if (statusProp) values[statusProp.id] = a.concluido ? statusConcluido : statusPendente;
    await setRowValues(row.id, values);
    imported += 1;
  }

  return { imported, skipped: (agenda || []).length - pending.length, total: (agenda || []).length };
}
