// ============================================================================
// Compromissos da equipe para a agenda da tela inicial.
//
// "Agenda" aqui é todo database da RAIZ do Compromisso que tem uma visão de
// Calendário (hoje: PLANEJAMENTO GERAL). Os quadros de entrega dos projetos
// ficam de fora de propósito: deles a tela inicial já mostra só as tarefas
// atribuídas à pessoa (tarefasAtribuidas), senão a agenda viraria a lista de
// todas as tarefas de todos os projetos.
//
// A data usada é a mesma que o Calendário do database usa (config.dateProp da
// visão), para o que aparece no Início bater com o que aparece lá.
// ============================================================================
import { supabase } from './supabase';
import { podeVerPagina } from './workspace';
import { findStatusProp, isRowDone } from '../components/workspace/databaseUtils';

const CAMPOS = 'id, title, icon, visibility, categoria_id, created_by';

export async function compromissosDaAgenda(user) {
  let { data: dbs, error } = await supabase.from('workspace_pages')
    .select(CAMPOS).eq('type', 'database').is('parent_id', null).is('deleted_at', null);
  // Banco sem a coluna `visibility` ainda → degrada sem quebrar.
  if (error && /visibility/i.test(`${error.message || ''} ${error.details || ''}`)) {
    ({ data: dbs, error } = await supabase.from('workspace_pages')
      .select('id, title, icon, created_by').eq('type', 'database').is('parent_id', null).is('deleted_at', null));
  }
  if (error) throw error;
  const visiveis = (dbs || []).filter((p) => podeVerPagina(p, user));
  if (!visiveis.length) return [];

  const ids = visiveis.map((p) => p.id);
  const [{ data: views }, { data: props }] = await Promise.all([
    supabase.from('workspace_db_views').select('database_id, type, config').in('database_id', ids).eq('type', 'calendar'),
    supabase.from('workspace_db_properties').select('id, database_id, name, type, options').in('database_id', ids),
  ]);

  const agendas = visiveis.map((db) => {
    const doDb = (props || []).filter((p) => p.database_id === db.id);
    const cal = (views || []).find((v) => v.database_id === db.id);
    if (!cal) return null;
    const data = doDb.find((p) => p.id === cal.config?.dateProp)
      || doDb.find((p) => p.type === 'date' && /expectativa|conclus|prazo|vencimento|entrega/i.test(p.name))
      || doDb.find((p) => p.type === 'date' && !/cria[çc]/i.test(p.name))
      || doDb.find((p) => p.type === 'date');
    if (!data) return null;
    return {
      db, props: doDb, data,
      hora: doDb.find((p) => p.type === 'time') || doDb.find((p) => /^(hora|hor[aá]rio)$/i.test(p.name)) || null,
      status: findStatusProp(doDb),
      pessoa: doDb.find((p) => p.type === 'person') || null,
    };
  }).filter(Boolean);
  if (!agendas.length) return [];

  const { data: linhas, error: lErr } = await supabase.from('workspace_pages')
    .select('id, title, parent_id').in('parent_id', agendas.map((a) => a.db.id)).is('deleted_at', null);
  if (lErr) throw lErr;
  if (!linhas?.length) return [];

  const { data: vals, error: vErr } = await supabase.from('workspace_db_values')
    .select('row_id, property_id, value').in('row_id', linhas.map((l) => l.id));
  if (vErr) throw vErr;
  const porLinha = new Map();
  (vals || []).forEach((v) => {
    const m = porLinha.get(v.row_id) || {};
    m[v.property_id] = v.value;
    porLinha.set(v.row_id, m);
  });

  return linhas.map((l) => {
    const a = agendas.find((x) => x.db.id === l.parent_id);
    const values = porLinha.get(l.id) || {};
    const dataISO = values[a.data.id];
    if (!dataISO) return null;
    const hora = a.hora ? values[a.hora.id] : null;
    return {
      rowId: l.id,
      titulo: l.title || 'Sem título',
      dataISO: String(dataISO).slice(0, 10),
      hora: hora ? String(hora).substring(0, 5) : null,
      feito: isRowDone({ values }, a.props, a.status),
      responsavelId: a.pessoa ? values[a.pessoa.id] || null : null,
      agenda: a.db.title || 'Compromissos',
    };
  }).filter(Boolean);
}
