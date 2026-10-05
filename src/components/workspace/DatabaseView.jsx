// ============================================================================
// DatabaseView — renderiza um database (type='database') com 4 visões:
// Tabela, Quadro (kanban), Calendário e Lista.
//
// Recursos: filtros + ordenação por visão (salvos em view.config), editor de
// coluna (renomear/tipo/opções/excluir), skeletons, transição de troca de visão,
// kanban com reordenação e placeholder, calendário com semana/dia + arrastar
// para remarcar, criar/renomear/excluir visões e abrir linha como página (peek).
// ============================================================================
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import toast from 'react-hot-toast';
import {
  Plus, Table2, KanbanSquare, CalendarDays, List, Trash2, GripVertical, Download,
  ChevronDown, ChevronRight, Copy, FileText, X, Settings2, MoreHorizontal, Layers, Columns3,
  CheckCircle2, Printer,
} from 'lucide-react';
import '../../styles/workspace.css';
import { supabase } from '../../services/supabase';
import * as ws from '../../services/workspace';
import { useDatabaseSync } from '../../hooks/useDatabaseSync';
import { usePermission } from '../../contexts/PermissionContext';
import { PropertyCell, PropertyValue } from './PropertyCell';
import PropertyMenu, { NewColumnMenu } from './PropertyMenu';
import ViewToolbar from './ViewToolbar';
// Só é montado quando alguém pede para imprimir — leva junto o printReport.
const PrintDialog = lazy(() => import('./PrintDialog'));
import Popover from './Popover';
import { assinarAberturaDeTarefa, pedidoAtendido } from './abrirTarefa';
import {
  applyFilters, applySort, formatDateBR, optionId, COLOR_KEYS, OPTION_TYPES,
  PROP_TYPE_LABELS, colWidth, todayISO, plainTextFromBlocks, dotClass,
  findStatusProp, isRowDone, findDoneOption,
} from './databaseUtils';
import { useAuth } from '../../contexts/AuthContext';
import { carimboDeRegistro } from './registroDeAndamento';

// Carregados sob demanda: react-big-calendar e o BlockNote são os dois pesos
// pesados do módulo. Deixá-los fora do chunk principal faz o Compromisso abrir
// bem mais rápido — o custo só chega para quem abre o calendário ou uma linha.
const CalendarBoard = lazy(() => import('./CalendarBoard'));
const BlockEditor = lazy(() => import('./BlockEditor'));

const VIEW_ICON = { table: Table2, board: KanbanSquare, calendar: CalendarDays, list: List };
const VIEW_TYPES = [
  { type: 'table', name: 'Tabela', icon: Table2 },
  { type: 'board', name: 'Quadro', icon: KanbanSquare },
  { type: 'calendar', name: 'Calendário', icon: CalendarDays },
  { type: 'list', name: 'Lista', icon: List },
];

// Qual coluna é o PRAZO (ganha o realce de atrasado/hoje) e qual é a data de
// cadastro (não ganha). A busca é por nome porque é assim que o usuário pensa
// nas colunas — e ele pode renomeá-las sem quebrar nada além do realce.
const isPrazoProp = (p) => p?.type === 'date' && /expectativa|conclus|prazo|vencimento|entrega/i.test(p.name);
const isCriacaoProp = (p) => p?.type === 'date' && /cria[çc]/i.test(p.name);

/**
 * `pinnedViewId` (opcional): fixa UMA visão — usado pelo bloco de database
 * vinculado, para embutir só o Calendário (ou só o Quadro) numa página.
 * Nesse modo o switcher de abas, o alternador de layout e a gestão de visões
 * somem: elas pertencem à página do database, não ao bloco embutido.
 */
export default function DatabaseView({
  databaseId,
  createdBy,
  pinnedViewId = null,
  filterOverride = null,          // filtro do BLOCO (substitui o da visão)
  onFilterOverrideChange = null,  // se vier, a barra edita o filtro do bloco
}) {
  const [props, setProps] = useState([]);
  const [views, setViews] = useState([]);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [peekRowId, setPeekRowId] = useState(null);
  // Prévia do texto escrito dentro de cada tarefa ({ rowId: 'texto' }).
  const [excerpts, setExcerpts] = useState({});
  // Linha recém-criada que deve receber o cursor no campo Nome.
  const [focusRowId, setFocusRowId] = useState(null);
  // Visão que está sendo impressa (null = diálogo fechado).
  const [printViewId, setPrintViewId] = useState(null);

  // ESTRUTURA (colunas, visões, filtros, ordenação) x CONTEÚDO (linhas).
  // Mexer na estrutura muda o database para todo mundo que o usa; escrever uma
  // tarefa é o trabalho do dia a dia e segue livre para quem acessa o módulo.
  const { hasPermission } = usePermission();
  const podeEditarEstrutura = hasPermission('Editar Bancos Compromisso');
  const barrar = () => { toast.error('Você não tem permissão para alterar a estrutura deste banco de dados.', { id: 'ws-estrutura' }); };

  const load = useCallback(async () => {
    const [p, v, r] = await Promise.all([
      ws.listProperties(databaseId),
      ws.listViews(databaseId),
      ws.listRows(databaseId),
    ]);
    setProps(p); setViews(v); setRows(r);
    setActiveViewId((cur) => cur || (v[0]?.id ?? null));
  }, [databaseId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      load(),
      supabase.from('users').select('id, name, email').then(({ data }) => setUsers(data || [])),
    ]).catch((e) => { console.error(e); toast.error('Erro ao carregar o database.'); })
      .finally(() => setLoading(false));
  }, [load]);

  // As prévias vêm DEPOIS da tabela aparecer: `content` é o campo pesado da
  // linha e ninguém deve esperar por ele para ver as tarefas.
  const loadExcerpts = useCallback(async () => {
    try {
      const map = await ws.listRowExcerpts(databaseId);
      const out = {};
      Object.entries(map).forEach(([id, content]) => {
        const t = plainTextFromBlocks(content);
        if (t) out[id] = t;
      });
      setExcerpts(out);
    } catch (e) { console.error(e); }
  }, [databaseId]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(loadExcerpts, 150);
    return () => clearTimeout(t);
  }, [loading, loadExcerpts]);

  const clearFocusRow = useCallback(() => setFocusRowId(null), []);

  // Alguém pediu para abrir uma tarefa (clique no sino → ?abrir=). O pedido
  // pode chegar antes das linhas: guarda e atende quando a linha for desta
  // tabela. Um mesmo pedido chega a todas as tabelas abertas — só a dona dele
  // reconhece o id e o consome.
  const [pedidoRowId, setPedidoRowId] = useState(null);
  useEffect(() => assinarAberturaDeTarefa(setPedidoRowId), []);
  useEffect(() => {
    if (!pedidoRowId || !rows.some((r) => r.id === pedidoRowId)) return;
    setPeekRowId(pedidoRowId);
    pedidoAtendido(pedidoRowId);
    setPedidoRowId(null);
  }, [pedidoRowId, rows]);

  // Editou as observações no painel: a prévia da tabela acompanha na hora.
  const patchExcerpt = useCallback((rowId, blocks) => {
    const t = plainTextFromBlocks(blocks);
    setExcerpts((s) => {
      if ((s[rowId] || '') === t) return s;
      const next = { ...s };
      if (t) next[rowId] = t; else delete next[rowId];
      return next;
    });
  }, []);

  // -- sincronização entre visões / abas / usuários -------------------------
  // Aplica UMA mudança vinda de fora no estado já carregado, em vez de recarregar
  // tudo: quem está com o cursor numa célula não perde o que está digitando por
  // causa de uma tarefa que o colega criou do outro lado.
  const reloadStructure = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([ws.listProperties(databaseId), ws.listViews(databaseId)]);
      setProps(p); setViews(v);
    } catch (e) { console.error(e); }
  }, [databaseId]);

  const applyEvent = useCallback((evt) => {
    const { table, eventType } = evt;

    if (table === 'workspace_pages') {
      const rec = evt.new && Object.keys(evt.new).length ? evt.new : null;
      const id = rec?.id || evt.old?.id;
      if (!id) return;

      // Excluir uma linha é apagar de vez (DELETE) ou mandar para a lixeira
      // (UPDATE com deleted_at) — para a tabela dá no mesmo.
      if (eventType === 'DELETE' || rec?.deleted_at) {
        setRows((rs) => (rs.some((r) => r.id === id) ? rs.filter((r) => r.id !== id) : rs));
        return;
      }
      if (!rec) return;
      // INSERT e UPDATE andam juntos: linha que ainda não está aqui entra
      // (tarefa nova do colega, ou uma restaurada da lixeira) e linha conhecida
      // só recebe o que mudou. Se nada mudou, o estado volta igual — sem
      // re-render e sem piscar a tabela de quem está com a mão nela.
      setRows((rs) => {
        const i = rs.findIndex((r) => r.id === id);
        if (i < 0) return [...rs, {
          id, title: rec.title || '', icon: rec.icon || null,
          created_at: rec.created_at, updated_at: rec.updated_at,
          values: evt.values || {}, _new: true,
        }];
        const title = 'title' in rec ? rec.title : rs[i].title;
        const icon = 'icon' in rec ? rec.icon : rs[i].icon;
        if (title === rs[i].title && icon === rs[i].icon) return rs;
        const next = [...rs];
        next[i] = { ...next[i], title, icon };
        return next;
      });
      // O evento traz a página inteira, então a prévia do texto da tarefa vem
      // junto de graça.
      if (rec && 'content' in rec) patchExcerpt(id, rec.content);
      return;
    }

    if (table === 'workspace_db_values') {
      const rec = evt.new && Object.keys(evt.new).length ? evt.new : evt.old;
      if (!rec?.row_id || !rec?.property_id) return;
      const value = eventType === 'DELETE' ? null : rec.value;
      setRows((rs) => {
        const i = rs.findIndex((r) => r.id === rec.row_id);
        if (i < 0) return rs; // linha de outro database (o canal de valores é geral)
        if (JSON.stringify(rs[i].values[rec.property_id] ?? null) === JSON.stringify(value ?? null)) return rs;
        const next = [...rs];
        next[i] = { ...next[i], values: { ...next[i].values, [rec.property_id]: value } };
        return next;
      });
      return;
    }

    if (table === 'workspace_db_properties' || table === 'workspace_db_views') {
      reloadStructure();
      return;
    }

    // Mexidas em bloco (reordenar, importar agenda): recarrega e pronto.
    if (eventType === 'RELOAD') load().catch((e) => console.error(e));
  }, [load, patchExcerpt, reloadStructure]);

  const emitSync = useDatabaseSync(databaseId, applyEvent);

  // Mexer em coluna ou em visão é raro e mexe na tabela inteira: as outras
  // visões só ouvem "a estrutura mudou" e releem colunas e visões.
  const propsChanged = useCallback(() => emitSync({ table: 'workspace_db_properties', eventType: 'UPDATE' }), [emitSync]);
  const viewsChanged = useCallback(() => emitSync({ table: 'workspace_db_views', eventType: 'UPDATE' }), [emitSync]);

  // Com visão fixada, ela manda; se tiver sido excluída, cai na primeira.
  const pinnedView = useMemo(
    () => (pinnedViewId ? views.find((v) => v.id === pinnedViewId) || null : null),
    [views, pinnedViewId]
  );
  const pinnedMissing = !!pinnedViewId && !pinnedView && views.length > 0;

  const activeView = useMemo(
    () => (pinnedViewId ? (pinnedView || views[0]) : (views.find((v) => v.id === activeViewId) || views[0])),
    [views, activeViewId, pinnedViewId, pinnedView]
  );

  // Layout: 'tabs' (uma visão por vez) ou 'stacked' (todas empilhadas na página).
  // Preferência por database, guardada localmente (sem schema novo).
  const layoutKey = `ws-db-layout-${databaseId}`;
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem(layoutKey) || 'tabs'; } catch { return 'tabs'; } });
  const changeLayout = useCallback((v) => { setLayout(v); try { localStorage.setItem(layoutKey, v); } catch { /* ignore */ } }, [layoutKey]);

  // Linhas de UMA visão, já filtradas + ordenadas conforme o config dela.
  const rowsForView = useCallback(
    (view) => applySort(applyFilters(rows, filterOverride || view?.config?.filter, props), view?.config?.sort, props),
    [rows, props, filterOverride]
  );

  const canImportAgenda = useMemo(
    () => props.some((p) => p.name.toLowerCase() === 'categoria' || p.type === 'date'),
    [props]
  );

  // -- config de visão (filtros/ordenação/groupBy/dateProp) -----------------
  const patchViewConfig = useCallback(async (viewId, patch) => {
    if (!viewId) return;
    if (!podeEditarEstrutura) return barrar();
    let nextConfig;
    setViews((vs) => vs.map((v) => {
      if (v.id !== viewId) return v;
      nextConfig = { ...(v.config || {}), ...patch };
      return { ...v, config: nextConfig };
    }));
    try { await ws.updateView(viewId, { config: nextConfig }); viewsChanged(); }
    catch (e) { console.error(e); toast.error('Erro ao salvar a visão.'); }
  }, [viewsChanged, podeEditarEstrutura]);

  // -- importar agenda ------------------------------------------------------
  const runImport = useCallback(async () => {
    if (!window.confirm(
      'Importar os compromissos da agenda atual para este database?\n\n' +
      '• Não apaga nada da agenda original.\n' +
      '• Re-rodar não duplica (só traz novos).'
    )) return;
    setImporting(true);
    const t = toast.loading('Importando agenda...');
    try {
      const res = await ws.importAgendaToDatabase(databaseId, { createdBy });
      await load();
      emitSync({ table: '*', eventType: 'RELOAD' });
      toast.success(`Importados: ${res.imported} · já existiam: ${res.skipped}`, { id: t });
    } catch (e) { console.error(e); toast.error('Erro ao importar a agenda.', { id: t }); }
    finally { setImporting(false); }
  }, [databaseId, createdBy, load, emitSync]);

  // -- mutações de célula/linha --------------------------------------------
  // Cada uma avisa as outras visões abertas nesta aba (`emitSync`); para as
  // outras abas e os outros usuários quem avisa é o Postgres, pelo canal.
  const updateCell = useCallback(async (rowId, propId, value) => {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [propId]: value } } : r)));
    emitSync({ table: 'workspace_db_values', eventType: 'UPDATE', new: { row_id: rowId, property_id: propId, value } });
    try { await ws.setRowValue(rowId, propId, value); }
    catch (e) { console.error(e); toast.error('Erro ao salvar.'); load(); }
  }, [load, emitSync]);

  const updateTitle = useCallback(async (rowId, title) => {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, title } : r)));
    emitSync({ table: 'workspace_pages', eventType: 'UPDATE', new: { id: rowId, parent_id: databaseId, title } });
    try { await ws.updatePage(rowId, { title }); }
    catch (e) { console.error(e); }
  }, [databaseId, emitSync]);

  // Toda tarefa nova já nasce preenchida no que é óbvio: Pendente e a data de
  // hoje como criação. Quem cria uma tarefa quer digitar o nome, não catar
  // status e data em três cliques.
  const defaultValues = useCallback(() => {
    const out = {};
    const statusProp = props.find((p) => p.type === 'status') || props.find((p) => p.type === 'select' && /status|situa/i.test(p.name));
    if (statusProp) {
      const pendente = (statusProp.options || []).find((o) => /pendente|a fazer|aberto|novo/i.test(o.name)) || (statusProp.options || [])[0];
      if (pendente) out[statusProp.id] = pendente.id;
    }
    const criacao = props.find(isCriacaoProp) || props.filter((p) => p.type === 'date')[0];
    if (criacao) out[criacao.id] = todayISO();
    return out;
  }, [props]);

  const addRow = useCallback(async (presetValues = {}, { focus = false, title = '' } = {}) => {
    try {
      // O preset (ex.: a coluna do kanban onde soltou) manda sobre o padrão.
      const values = { ...defaultValues(), ...presetValues };
      const row = await ws.createRow(databaseId, { createdBy, title });
      await ws.setRowValues(row.id, values);
      setRows((rs) => [...rs, { ...row, values, _new: true }]);
      emitSync({ table: 'workspace_pages', eventType: 'INSERT', new: { ...row, parent_id: databaseId }, values });
      if (focus) setFocusRowId(row.id);
      return row;
    } catch (e) { console.error(e); toast.error('Erro ao adicionar tarefa.'); }
  }, [databaseId, createdBy, defaultValues, emitSync]);

  const removeRow = useCallback(async (rowId) => {
    setRows((rs) => rs.filter((r) => r.id !== rowId));
    emitSync({ table: 'workspace_pages', eventType: 'DELETE', old: { id: rowId } });
    try { await ws.deleteRow(rowId); }
    catch (e) { console.error(e); toast.error('Erro ao excluir.'); load(); }
  }, [load, emitSync]);

  const duplicateRow = useCallback(async (row) => {
    try {
      const copy = await ws.duplicateRow(databaseId, row, { createdBy });
      setRows((rs) => { const i = rs.findIndex((r) => r.id === row.id); const next = [...rs]; next.splice(i + 1, 0, { ...copy, _new: true }); return next; });
      emitSync({ table: 'workspace_pages', eventType: 'INSERT', new: { ...copy, parent_id: databaseId }, values: copy.values });
    } catch (e) { console.error(e); toast.error('Erro ao duplicar.'); }
  }, [databaseId, createdBy, emitSync]);

  // Reordena linhas (kanban / dnd) e persiste positions.
  const reorderRows = useCallback(async (orderedIds) => {
    setRows((rs) => { const byId = new Map(rs.map((r) => [r.id, r])); return orderedIds.map((id) => byId.get(id)).filter(Boolean); });
    try { await ws.reorderSiblings(orderedIds); emitSync({ table: '*', eventType: 'RELOAD' }); }
    catch (e) { console.error(e); toast.error('Erro ao reordenar.'); load(); }
  }, [load, emitSync]);

  // -- propriedades (colunas) ----------------------------------------------
  const onPropSaved = useCallback((updated) => {
    setProps((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
    propsChanged();
  }, [propsChanged]);
  const onPropDeleted = useCallback((id) => {
    setProps((ps) => ps.filter((p) => p.id !== id));
    propsChanged();
  }, [propsChanged]);

  const addColumn = useCallback(async ({ name, type, options }) => {
    if (!podeEditarEstrutura) return barrar();
    try {
      const created = await ws.createProperty({ databaseId, name, type, options, position: props.length });
      setProps((ps) => [...ps, created]);
      propsChanged();
    } catch (e) { console.error(e); toast.error('Erro ao criar coluna.'); }
  }, [databaseId, props.length, propsChanged, podeEditarEstrutura]);

  // Reordenar colunas (arrastar o cabeçalho). Aplica na hora e persiste depois:
  // arrastar tem que responder no ato, não esperar a rede.
  const moveColumn = useCallback(async (sourceId, targetId, before) => {
    if (!sourceId || sourceId === targetId) return;
    if (!podeEditarEstrutura) return barrar();
    let ordered = [];
    setProps((ps) => {
      const from = ps.findIndex((p) => p.id === sourceId);
      if (from < 0) return ps;
      const next = [...ps];
      const [moved] = next.splice(from, 1);
      const to = next.findIndex((p) => p.id === targetId);
      next.splice(to < 0 ? next.length : (before ? to : to + 1), 0, moved);
      ordered = next.map((p) => p.id);
      return next;
    });
    try { await ws.reorderProperties(ordered); propsChanged(); }
    catch (e) { console.error(e); toast.error('Erro ao reordenar as colunas.'); load(); }
  }, [load, propsChanged, podeEditarEstrutura]);

  // Ordenação rápida a partir do menu da coluna.
  const quickSort = useCallback((viewId, propId, dir) => patchViewConfig(viewId, { sort: [{ propId, dir }] }), [patchViewConfig]);

  // -- visões ---------------------------------------------------------------
  const addView = useCallback(async (type) => {
    if (!podeEditarEstrutura) return barrar();
    const def = VIEW_TYPES.find((v) => v.type === type);
    const statusProp = props.find((p) => p.type === 'status' || p.type === 'select');
    const dateProp = props.find((p) => p.type === 'date');
    const config = type === 'board' ? { groupBy: statusProp?.id || null } : type === 'calendar' ? { dateProp: dateProp?.id || null } : {};
    try {
      const v = await ws.createView({ databaseId, name: def.name, type, position: views.length, config });
      setViews((vs) => [...vs, v]);
      setActiveViewId(v.id);
      viewsChanged();
    } catch (e) { console.error(e); toast.error('Erro ao criar visão.'); }
  }, [databaseId, views.length, props, viewsChanged, podeEditarEstrutura]);

  const renameView = useCallback(async (id, name) => {
    if (!podeEditarEstrutura) return barrar();
    setViews((vs) => vs.map((v) => (v.id === id ? { ...v, name } : v)));
    try { await ws.updateView(id, { name }); viewsChanged(); } catch (e) { console.error(e); }
  }, [viewsChanged, podeEditarEstrutura]);

  const deleteView = useCallback(async (id) => {
    if (!podeEditarEstrutura) return barrar();
    if (views.length <= 1) { toast.error('O database precisa de ao menos uma visão.'); return; }
    setViews((vs) => vs.filter((v) => v.id !== id));
    setActiveViewId((cur) => (cur === id ? views.find((v) => v.id !== id)?.id : cur));
    try { await ws.deleteView(id); viewsChanged(); } catch (e) { console.error(e); toast.error('Erro ao excluir visão.'); load(); }
  }, [views, load, viewsChanged, podeEditarEstrutura]);

  if (loading) return <DatabaseSkeleton />;

  const handlers = {
    props, users, excerpts,
    onCell: updateCell, onTitle: updateTitle, onAddRow: addRow, onRemoveRow: removeRow,
    onDuplicate: duplicateRow, onOpenRow: setPeekRowId,
    focusRowId, onFocused: clearFocusRow,
  };

  // Barra de filtros/ordenação/config de UMA visão (reusada nas abas e no empilhado).
  const renderToolbar = (view) => (
    <div className="flex items-center gap-2 flex-wrap">
      {(onFilterOverrideChange || podeEditarEstrutura) && <ViewToolbar
        props={props} users={users}
        // Num bloco vinculado o filtro é do BLOCO, não da visão: assim dois
        // blocos da mesma visão podem mostrar recortes diferentes (por setor).
        filters={filterOverride ? filterOverride : view?.config?.filter}
        sorts={view?.config?.sort}
        onFilters={(filter) => (onFilterOverrideChange ? onFilterOverrideChange(filter) : patchViewConfig(view.id, { filter }))}
        onSorts={(sort) => patchViewConfig(view.id, { sort })}
      />}
      {podeEditarEstrutura && <ColumnsManager props={props} onSaved={onPropSaved} onDeleted={onPropDeleted} onCreate={addColumn} />}
      {view?.type === 'board' && podeEditarEstrutura && (
        <ConfigSelect
          label="Agrupar" value={view.config?.groupBy || ''}
          options={props.filter((p) => OPTION_TYPES.has(p.type)).map((p) => ({ id: p.id, name: p.name }))}
          onChange={(id) => patchViewConfig(view.id, { groupBy: id || null })}
        />
      )}
      {view?.type === 'calendar' && podeEditarEstrutura && (
        <ConfigSelect
          label="Data" value={view.config?.dateProp || ''}
          options={props.filter((p) => p.type === 'date').map((p) => ({ id: p.id, name: p.name }))}
          onChange={(id) => patchViewConfig(view.id, { dateProp: id || null })}
        />
      )}
      {/* Imprimir é leitura: quem enxerga a visão pode levar para o papel. */}
      <button
        onClick={() => setPrintViewId(view?.id || null)}
        title="Imprimir um relatório destas tarefas"
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <Printer size={13} /> Imprimir
      </button>
    </div>
  );

  // Corpo de UMA visão sobre as linhas já filtradas/ordenadas dela.
  const renderBody = (view) => {
    const vrows = rowsForView(view);
    if (view?.type === 'table') return <TableView rows={vrows} {...handlers} podeEditarEstrutura={podeEditarEstrutura} onAddColumn={addColumn} onPropSaved={onPropSaved} onPropDeleted={onPropDeleted} onMoveColumn={moveColumn} onQuickSort={(propId, dir) => quickSort(view.id, propId, dir)} doneKey={`ws-done-open:${databaseId}:${view?.id}`} />;
    if (view?.type === 'board') return <BoardView rows={vrows} {...handlers} podeEditarEstrutura={podeEditarEstrutura} groupById={view.config?.groupBy} onReorder={reorderRows} onPropSaved={onPropSaved} />;
    if (view?.type === 'calendar') return (
      <Suspense fallback={<div className="ws-skel rounded-xl" style={{ height: 620 }} />}>
        <CalendarBoard rows={vrows} props={props} datePropId={view.config?.dateProp} onCell={updateCell} onAddRow={addRow} onOpenRow={setPeekRowId} />
      </Suspense>
    );
    if (view?.type === 'list') return <ListBoard rows={vrows} {...handlers} />;
    return null;
  };

  // Diálogo de impressão da visão pedida — imprime exatamente as linhas que a
  // visão mostra (filtro e ordenação dela já aplicados).
  const printView = printViewId ? (views.find((v) => v.id === printViewId) || activeView) : null;
  const printDialog = printView && (
    <Suspense fallback={null}>
      <PrintDialog
        databaseId={databaseId}
        viewName={printView.name}
        rows={rowsForView(printView)}
        props={props}
        users={users}
        onClose={() => setPrintViewId(null)}
      />
    </Suspense>
  );

  const goToView = (id) => {
    setActiveViewId(id);
    if (layout === 'stacked') document.getElementById(`vsec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Modo embutido: uma visão só, sem gestão de visões (isso é da página do database).
  if (pinnedViewId) {
    const Icon = VIEW_ICON[activeView?.type] || Table2;
    return (
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          {/* <div> e não <h3>: o BlockNote reseta o tamanho de p/h1..h6/li
              dentro do editor e engoliria o text-[13px] daqui. */}
          <div className="flex items-center gap-1.5 text-[13px] font-black text-slate-700">
            <Icon size={15} className="text-slate-400" /> {activeView?.name || 'Visão'}
            {pinnedMissing && <span className="text-[11px] font-bold text-amber-600 normal-case">· visão original foi excluída</span>}
          </div>
          {renderToolbar(activeView)}
        </div>
        <div key={activeView?.id} className="ws-view-fade">{renderBody(activeView)}</div>

        {peekRowId && (
          <RowPeek
            rowId={peekRowId} props={props} users={users} createdBy={createdBy}
            onClose={() => setPeekRowId(null)}
            onCell={updateCell} onTitle={updateTitle} onDelete={(id) => { removeRow(id); setPeekRowId(null); }}
            onContentSaved={patchExcerpt}
          />
        )}
        {printDialog}
      </div>
    );
  }

  return (
    <div>
      {/* SWITCHER DE VISÕES + AÇÕES */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 mb-3">
        <div className="flex items-center gap-1 flex-wrap">
          {views.map((v) => (
            <ViewTab
              key={v.id} view={v} active={v.id === activeView?.id && layout === 'tabs'}
              onSelect={() => goToView(v.id)} onRename={renameView}
              onDelete={() => deleteView(v.id)} canDelete={podeEditarEstrutura && views.length > 1}
              podeRenomear={podeEditarEstrutura}
            />
          ))}
          {podeEditarEstrutura && <AddViewButton onAdd={addView} />}
        </div>
        <div className="flex items-center gap-2 pb-1">
          <LayoutToggle layout={layout} onChange={changeLayout} />
          {canImportAgenda && (
            <button onClick={runImport} disabled={importing} title="Trazer os compromissos da agenda atual"
              className="flex items-center gap-1.5 px-2.5 h-7 text-[11.5px] font-semibold text-slate-500 border border-slate-200 rounded-lg hover:text-slate-900 hover:border-slate-300 hover:bg-blue-50 transition-colors disabled:opacity-50">
              {importing ? <span className="ws-skel w-3.5 h-3.5 rounded-full" /> : <Download size={13} />} Importar agenda
            </button>
          )}
        </div>
      </div>

      {/* CORPO */}
      {layout === 'stacked' ? (
        <div className="flex flex-col gap-8">
          {views.map((v) => {
            const Icon = VIEW_ICON[v.type] || Table2;
            return (
              <section key={v.id} id={`vsec-${v.id}`} className="ws-view-fade scroll-mt-4">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-1.5 text-[13px] font-black text-slate-700"><Icon size={15} className="text-slate-400" /> {v.name}</div>
                  {renderToolbar(v)}
                </div>
                {renderBody(v)}
              </section>
            );
          })}
        </div>
      ) : (
        <div key={activeView?.id} className="ws-view-fade">
          <div className="flex justify-end mb-2">{renderToolbar(activeView)}</div>
          {renderBody(activeView)}
        </div>
      )}

      {peekRowId && (
        <RowPeek
          rowId={peekRowId} props={props} users={users} createdBy={createdBy}
          onClose={() => setPeekRowId(null)}
          onCell={updateCell} onTitle={updateTitle} onDelete={(id) => { removeRow(id); setPeekRowId(null); }}
          onContentSaved={patchExcerpt}
        />
      )}
      {printDialog}
    </div>
  );
}

// Alternador de layout: Abas (uma visão por vez) x Empilhado (todas na página).
function LayoutToggle({ layout, onChange }) {
  return (
    <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
      <button onClick={() => onChange('tabs')} className={`flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-medium transition-colors ${layout === 'tabs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
        <Table2 size={12} /> Abas
      </button>
      <button onClick={() => onChange('stacked')} className={`flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-medium transition-colors ${layout === 'stacked' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
        <Layers size={12} /> Empilhado
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba de visão (com menu renomear/excluir)
// ---------------------------------------------------------------------------
function ViewTab({ view, active, onSelect, onRename, onDelete, canDelete, podeRenomear = true }) {
  const Icon = VIEW_ICON[view.type] || Table2;
  const ref = useRef(null);
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative flex items-center">
      <button
        onClick={() => (active && podeRenomear ? setMenu((v) => !v) : onSelect())}
        ref={ref}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${active ? 'text-slate-900 border-slate-900' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'}`}
      >
        <Icon size={14} /> {view.name}
        {active && podeRenomear && <ChevronDown size={11} className="opacity-50" />}
      </button>
      {menu && (
        <Popover anchorRef={ref} onClose={() => setMenu(false)} width={200}>
          <div className="p-2">
            <input
              autoFocus defaultValue={view.name} key={view.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== view.name) onRename(view.id, v); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) onRename(view.id, v); setMenu(false); } }}
              className="w-full h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-800 outline-none focus:border-blue-400"
            />
            <button
              disabled={!canDelete}
              onClick={() => { onDelete(); setMenu(false); }}
              className="mt-1.5 flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[12px] font-bold text-rose-500 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <Trash2 size={14} /> Excluir visão
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}

function AddViewButton({ onAdd }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button ref={ref} onClick={() => setOpen((v) => !v)} title="Nova visão" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
        <Plus size={16} />
      </button>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} width={180}>
          <div className="p-1.5 flex flex-col gap-0.5">
            {VIEW_TYPES.map((v) => (
              <button key={v.type} onClick={() => { onAdd(v.type); setOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] font-semibold text-slate-600 hover:bg-slate-50 text-left">
                <v.icon size={15} className="text-slate-400" /> {v.name}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

// Gerenciador de colunas — disponível em TODAS as visões (Tabela, Quadro,
// Lista e Calendário). Antes só dava para renomear/trocar tipo pelo cabeçalho
// da tabela, então quem trabalhava no Quadro ou na Lista ficava sem acesso.
function ColumnsManager({ props, onSaved, onDeleted, onCreate }) {
  const btnRef = useRef(null);
  const newRef = useRef(null);
  const [open, setOpen] = useState(false);
  // Guarda { prop, anchor } no clique: o elemento vem do evento, não de um ref
  // lido durante o render (que o React desaconselha).
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const closeAll = () => { setOpen(false); setEditing(null); setCreating(false); };

  return (
    <div className="relative">
      <button ref={btnRef} onClick={() => (open ? closeAll() : setOpen(true))} title="Renomear colunas, trocar tipo, gerenciar opções"
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        <Columns3 size={13} /> Colunas
      </button>

      {open && (
        <Popover anchorRef={btnRef} onClose={() => { if (!editing && !creating) setOpen(false); }} width={230}>
          <div className="p-1.5">
            <p className="px-2 py-1 text-[12px] font-medium text-slate-400">Editar coluna</p>
            <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
              {props.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => setEditing(editing?.prop?.id === p.id ? null : { prop: p, anchor: e.currentTarget })}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-semibold text-left transition-colors ${editing?.prop?.id === p.id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[12px] font-medium text-slate-400 shrink-0">{PROP_TYPE_LABELS[p.type] || p.type}</span>
                </button>
              ))}
              {props.length === 0 && <p className="px-2 py-2 text-[12px] font-semibold text-slate-400">Nenhuma coluna ainda.</p>}
            </div>
            <button ref={newRef} onClick={() => setCreating(true)}
              className="mt-1 flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors">
              <Plus size={13} /> Nova coluna
            </button>
          </div>
        </Popover>
      )}

      {open && editing && (
        <PropertyMenu
          prop={editing.prop}
          anchorRef={{ current: editing.anchor }}
          onClose={() => setEditing(null)}
          onSaved={(updated) => { onSaved(updated); setEditing((s) => (s ? { ...s, prop: updated } : s)); }}
          onDeleted={(id) => { onDeleted(id); setEditing(null); }}
        />
      )}
      {open && creating && (
        <NewColumnMenu anchorRef={newRef} onClose={() => setCreating(false)} onCreate={onCreate} />
      )}
    </div>
  );
}

// Pequeno seletor de config (agrupar por / data) na barra.
function ConfigSelect({ label, value, options, onChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const sel = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button ref={ref} onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        <Settings2 size={13} /> {label}: <span className="text-slate-700">{sel?.name || '—'}</span>
      </button>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} width={180}>
          <div className="p-1.5 flex flex-col gap-0.5">
            {options.length === 0 && <p className="px-2 py-2 text-[12px] text-slate-400 font-semibold">Nenhuma coluna compatível.</p>}
            {options.map((o) => (
              <button key={o.id} onClick={() => { onChange(o.id); setOpen(false); }} className={`px-2 py-1.5 rounded-lg text-[12px] font-semibold text-left hover:bg-slate-50 ${o.id === value ? 'text-blue-600' : 'text-slate-600'}`}>{o.name}</button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TABELA
// ---------------------------------------------------------------------------
function TableView({
  rows, props, users, excerpts, onCell, onTitle, onAddRow, onAddColumn, onRemoveRow,
  onDuplicate, onOpenRow, onPropSaved, onPropDeleted, onMoveColumn, onQuickSort,
  focusRowId, onFocused, doneKey, podeEditarEstrutura = true,
}) {
  const addColRef = useRef(null);
  const [addingCol, setAddingCol] = useState(false);
  const [dragCol, setDragCol] = useState(null);   // id da coluna arrastada
  const [colHint, setColHint] = useState(null);   // { id, before }

  // O que já acabou não precisa ocupar a tela: as tarefas concluídas saem da
  // lista e ficam num bloco recolhido no rodapé, que abre quando se quer olhar.
  // A escolha de deixar aberto fica salva por visão — quem gosta de ver tudo
  // não precisa reabrir toda vez.
  const [doneOpen, setDoneOpen] = useState(() => {
    try { return localStorage.getItem(doneKey) === '1'; } catch { return false; }
  });
  const toggleDone = () => setDoneOpen((v) => {
    try { localStorage.setItem(doneKey, v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });

  const statusProp = useMemo(() => findStatusProp(props), [props]);
  const { abertas, concluidas } = useMemo(() => {
    if (!statusProp) return { abertas: rows, concluidas: [] };
    const a = []; const c = [];
    rows.forEach((r) => (isRowDone(r, props, statusProp) ? c : a).push(r));
    return { abertas: a, concluidas: c };
  }, [rows, props, statusProp]);

  const dropColumn = (targetId) => {
    if (dragCol && colHint) onMoveColumn(dragCol, targetId, colHint.before);
    setDragCol(null); setColHint(null);
  };

  // Piso de largura: as colunas fixas + um mínimo digno para o nome. Abaixo
  // disso a tabela rola na horizontal em vez de espremer a tarefa.
  const minWidth = 300 + 34 + props.reduce((s, p) => s + colWidth(p), 0);

  return (
    <div className="ws-table-wrap">
      <div className="overflow-x-auto">
        {/* table-fixed para as larguras valerem de fato: em layout automático o
            cabeçalho longo de uma coluna estica ela e rouba o espaço do nome. */}
        <table className="w-full table-fixed border-collapse text-left" style={{ minWidth }}>
          <colgroup>
            <col />
            {props.map((p) => <col key={p.id} style={{ width: colWidth(p) }} />)}
            <col style={{ width: 34 }} />
          </colgroup>
          <thead>
            <tr className="ws-thead">
              <th className="ws-th pl-9">Tarefa</th>
              {props.map((p) => (
                <HeaderCell
                  key={p.id} prop={p}
                  podeEditarEstrutura={podeEditarEstrutura}
                  onSaved={onPropSaved} onDeleted={onPropDeleted} onQuickSort={onQuickSort}
                  dragging={dragCol === p.id}
                  hint={colHint?.id === p.id ? colHint.before : null}
                  onDragStart={() => setDragCol(p.id)}
                  onDragOver={(e) => {
                    if (!dragCol || dragCol === p.id) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    const before = (e.clientX - r.left) < r.width / 2;
                    setColHint((h) => (h && h.id === p.id && h.before === before ? h : { id: p.id, before }));
                  }}
                  onDrop={() => dropColumn(p.id)}
                  onDragEnd={() => { setDragCol(null); setColHint(null); }}
                />
              ))}
              <th className="ws-th px-0 text-center">
                {podeEditarEstrutura && (
                  <>
                    <button ref={addColRef} onClick={() => setAddingCol(true)} title="Nova coluna" className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-200/50 transition-colors"><Plus size={14} /></button>
                    {addingCol && <NewColumnMenu anchorRef={addColRef} onClose={() => setAddingCol(false)} onCreate={onAddColumn} />}
                  </>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {abertas.map((row) => (
              <TableRow
                key={row.id} row={row} props={props} users={users}
                excerpt={excerpts?.[row.id]}
                onCell={onCell} onTitle={onTitle} onOpenRow={onOpenRow}
                onDuplicate={onDuplicate} onRemove={onRemoveRow}
                autoFocus={focusRowId === row.id} onFocused={onFocused}
              />
            ))}
            {/* Linha sempre livre no fim: dá para ir emendando tarefa atrás de
                tarefa sem procurar botão. Só vira linha de verdade quando algo
                é digitado — clicar sem escrever não suja a tabela. */}
            <GhostRow props={props} onCreate={(title) => onAddRow({}, { title })} />

            {concluidas.length > 0 && (
              <tr className="ws-done-bar">
                <td className="ws-td px-0 py-0" colSpan={props.length + 2}>
                  <button onClick={toggleDone} className="ws-done-toggle" aria-expanded={doneOpen}>
                    {doneOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    Concluídos
                    <span className="ws-done-count">{concluidas.length}</span>
                  </button>
                </td>
              </tr>
            )}
            {doneOpen && concluidas.map((row) => (
              <TableRow
                key={row.id} row={row} props={props} users={users}
                excerpt={excerpts?.[row.id]}
                onCell={onCell} onTitle={onTitle} onOpenRow={onOpenRow}
                onDuplicate={onDuplicate} onRemove={onRemoveRow}
                autoFocus={focusRowId === row.id} onFocused={onFocused}
                dim
              />
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => onAddRow({}, { focus: true })} className="ws-add-row">
        <Plus size={14} /> Nova tarefa
      </button>
    </div>
  );
}

// Linha fantasma do rodapé da tabela.
// Enter grava e mantém o cursor aqui — é o fluxo de quem despeja uma lista
// inteira de uma vez. Sair do campo com texto também grava, para não perder
// o que foi escrito.
function GhostRow({ props, onCreate }) {
  const [texto, setTexto] = useState('');
  const ref = useRef(null);
  const gravando = useRef(false);

  const gravar = async (manterFoco) => {
    const v = texto.trim();
    if (!v || gravando.current) return;
    gravando.current = true;
    setTexto('');
    try { await onCreate(v); } finally { gravando.current = false; }
    if (manterFoco) ref.current?.focus();
  };

  return (
    <tr className="ws-tr ws-ghost group">
      <td className="ws-td pl-1 pr-1">
        <div className="flex items-center">
          <Plus size={12} className="mt-[1px] ml-1 mr-1 text-slate-300 shrink-0" />
          <input
            ref={ref}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => gravar(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); gravar(true); }
              if (e.key === 'Escape') setTexto('');
            }}
            placeholder="Nova tarefa…"
            className="ws-cell flex-1 bg-transparent text-[12.5px] font-medium text-slate-800 dark:text-slate-100 outline-none px-1.5 py-1 rounded-md placeholder:text-slate-400"
          />
        </div>
      </td>
      {props.map((p) => <td key={p.id} className="ws-td" />)}
      <td className="ws-td" />
    </tr>
  );
}

// Uma linha da tabela. Duplo clique em qualquer ponto abre a tarefa inteira —
// as células de propriedade seguram o evento para não atrapalhar quem só quer
// trocar um status.
function TableRow({ row, props, users, excerpt, onCell, onTitle, onOpenRow, onDuplicate, onRemove, autoFocus, onFocused, dim = false }) {
  const titleRef = useRef(null);

  useEffect(() => {
    if (!autoFocus || !titleRef.current) return;
    titleRef.current.focus();
    onFocused?.();
  }, [autoFocus, onFocused]);

  return (
    <tr className={`ws-tr group ${row._new ? 'ws-row-in' : ''} ${dim ? 'ws-tr-done' : ''}`} onDoubleClick={() => onOpenRow(row.id)}>
      <td className="ws-td pl-1 pr-1">
        <div className="flex items-start">
          <button onClick={() => onOpenRow(row.id)} title="Abrir tarefa" className="mt-[3px] opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-300 hover:text-blue-500 hover:bg-slate-100 transition-all shrink-0">
            <FileText size={12} />
          </button>
          <div className="flex-1 min-w-0">
            <input
              ref={titleRef}
              defaultValue={row.title} key={row.title}
              onBlur={(e) => e.target.value !== row.title && onTitle(row.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              placeholder="Nome da tarefa"
              className="ws-cell w-full bg-transparent text-[12.5px] font-medium text-slate-800 dark:text-slate-100 outline-none px-1.5 py-1 rounded-md placeholder:text-slate-300 dark:placeholder:text-slate-600"
            />
            {excerpt && (
              <div onClick={() => onOpenRow(row.id)} title={excerpt} className="ws-excerpt">{excerpt}</div>
            )}
          </div>
          <RowMenu row={row} onDuplicate={onDuplicate} onOpenRow={onOpenRow} onRemove={onRemove} />
        </div>
      </td>
      {props.map((p) => (
        <td key={p.id} className="ws-td align-top" onDoubleClick={(e) => e.stopPropagation()}>
          <PropertyCell
            prop={p} value={row.values[p.id]} users={users}
            due={isPrazoProp(p)}
            onCommit={(v) => onCell(row.id, p.id, v)}
          />
        </td>
      ))}
      <td className="ws-td" />
    </tr>
  );
}

function HeaderCell({ prop, onSaved, onDeleted, onQuickSort, dragging, hint, onDragStart, onDragOver, onDrop, onDragEnd, podeEditarEstrutura = true }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <th
      draggable={podeEditarEstrutura}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      className={`ws-th relative ${podeEditarEstrutura ? 'cursor-grab' : ''} ${dragging ? 'opacity-40' : ''}`}
    >
      {hint === true && <span className="ws-col-mark left-0" />}
      {hint === false && <span className="ws-col-mark right-0" />}
      <button ref={ref} onClick={() => podeEditarEstrutura && setOpen((v) => !v)} title={prop.name} className="ws-th-btn group">
        <span className="ws-th-label">{prop.name}</span>
        {podeEditarEstrutura && <ChevronDown size={10} className="opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />}
      </button>
      {open && (
        <PropertyMenu prop={prop} anchorRef={ref} onClose={() => setOpen(false)} onSaved={onSaved} onDeleted={onDeleted} onSort={onQuickSort} />
      )}
    </th>
  );
}

// Menu de contexto de uma linha (abrir / duplicar / excluir).
function RowMenu({ row, onDuplicate, onOpenRow, onRemove }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} onClick={() => setOpen((v) => !v)} title="Ações" className="opacity-0 group-hover:opacity-100 p-1 mt-[3px] rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"><MoreHorizontal size={13} /></button>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} align="right" width={180}>
          <div className="p-1.5 flex flex-col gap-0.5">
            <MenuBtn icon={FileText} label="Abrir como página" onClick={() => { onOpenRow(row.id); setOpen(false); }} />
            <MenuBtn icon={Copy} label="Duplicar" onClick={() => { onDuplicate(row); setOpen(false); }} />
            <MenuBtn icon={Trash2} label="Excluir" danger onClick={() => { onRemove(row.id); setOpen(false); }} />
          </div>
        </Popover>
      )}
    </>
  );
}

function MenuBtn({ icon, label, onClick, danger }) {
  const Icon = icon;
  return (
    <button onClick={onClick} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${danger ? 'text-rose-500 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon size={14} /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// QUADRO (KANBAN) — agrupa por status/seleção; reordena e move entre colunas
// ---------------------------------------------------------------------------
function BoardView({ rows, props, users, excerpts, groupById, onCell, onAddRow, onReorder, onPropSaved, onOpenRow, podeEditarEstrutura = true }) {
  const groupProp = useMemo(
    () => props.find((p) => p.id === groupById) || props.find((p) => p.type === 'status' || p.type === 'select'),
    [props, groupById]
  );
  const [drag, setDrag] = useState(null);      // rowId sendo arrastado
  const [hint, setHint] = useState(null);      // { colId, index }

  if (!groupProp) return <Empty msg="Defina uma propriedade do tipo seleção/status para usar o quadro (barra acima → Agrupar)." />;

  const columns = [
    ...(groupProp.options || []).map((o) => ({ id: o.id, name: o.name, color: o.color })),
    { id: null, name: 'Sem ' + groupProp.name.toLowerCase(), color: 'gray' },
  ];
  const otherProps = props.filter((p) => p.id !== groupProp.id).slice(0, 3);
  const itemsOf = (colId) => rows.filter((r) => (r.values[groupProp.id] || null) === colId);

  // Solta o card arrastado na coluna colId, antes do item de índice `index`.
  const drop = (colId, index) => {
    if (!drag) return;
    const source = rows.find((r) => r.id === drag);
    if (!source) return;
    if ((source.values[groupProp.id] || null) !== colId) onCell(drag, groupProp.id, colId);

    // Nova ordem global: remove o arrastado e reinsere na posição-alvo dentro da coluna.
    const colItems = itemsOf(colId).filter((r) => r.id !== drag).map((r) => r.id);
    const at = index == null ? colItems.length : Math.min(index, colItems.length);
    colItems.splice(at, 0, drag);
    const otherIds = rows.filter((r) => (r.values[groupProp.id] || null) !== colId && r.id !== drag).map((r) => r.id);
    onReorder([...colItems, ...otherIds]);
    setDrag(null); setHint(null);
  };

  const addBoardColumn = async () => {
    const name = window.prompt('Nome da nova coluna (opção):');
    if (!name || !name.trim()) return;
    const next = [...(groupProp.options || []), { id: optionId(), name: name.trim(), color: COLOR_KEYS[(groupProp.options?.length || 0) % COLOR_KEYS.length] }];
    try { onPropSaved(await ws.updateProperty(groupProp.id, { options: next })); }
    catch (e) { console.error(e); toast.error('Erro ao criar coluna.'); }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const items = itemsOf(col.id);
        const over = hint && hint.colId === col.id;
        return (
          <div
            key={col.id || 'none'}
            className={`w-[252px] shrink-0 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-2 ${over ? 'ws-col-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (drag && !over) setHint({ colId: col.id, index: items.length }); }}
            onDrop={() => drop(col.id, hint?.colId === col.id ? hint.index : items.length)}
          >
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass(col.color)}`} />
                {col.name} <span className="text-slate-400 font-medium tabular-nums">{items.length}</span>
              </span>
            </div>
            <div className="flex flex-col">
              {items.map((row, i) => (
                <div key={row.id}>
                  {over && hint.index === i && <div className="ws-drop-ph" />}
                  <div
                    draggable
                    onDragStart={() => setDrag(row.id)}
                    onDragEnd={() => { setDrag(null); setHint(null); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); const idx = (e.clientY - rect.top) < rect.height / 2 ? i : i + 1; setHint({ colId: col.id, index: idx }); }}
                    onDoubleClick={() => onOpenRow?.(row.id)}
                    className={`ws-card group bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-2.5 py-2 cursor-grab mb-1.5 ${drag === row.id ? 'ws-card-dragging' : ''}`}
                  >
                    <div className="flex items-start gap-1">
                      <GripVertical size={12} className="text-slate-300 mt-[2px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-100 flex-1 leading-snug">{row.title || 'Sem título'}</span>
                    </div>
                    {excerpts?.[row.id] && <div className="ws-excerpt pl-4">{excerpts[row.id]}</div>}
                    {otherProps.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-4">
                        {otherProps.map((p) => (<PropertyValue key={p.id} prop={p} value={row.values[p.id]} users={users} />))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {over && hint.index >= items.length && <div className="ws-drop-ph" />}
            </div>
            <button onClick={async () => { const r = await onAddRow(col.id ? { [groupProp.id]: col.id } : {}); if (r) onOpenRow?.(r.id); }} className="flex items-center gap-1 w-full px-1 py-1.5 mt-0.5 text-[11.5px] font-semibold text-slate-400 hover:text-slate-900 transition-colors">
              <Plus size={13} /> Nova tarefa
            </button>
          </div>
        );
      })}
      {OPTION_TYPES.has(groupProp.type) && podeEditarEstrutura && (
        <button onClick={addBoardColumn} className="w-[180px] shrink-0 h-10 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-[12px] font-bold text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-colors">
          <Plus size={14} /> Nova coluna
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LISTA
// ---------------------------------------------------------------------------
function ListBoard({ rows, props, users, excerpts, onAddRow, onRemoveRow, onDuplicate, onOpenRow }) {
  const statusProp = props.find((p) => p.type === 'status' || p.type === 'select');
  // Na lista o que interessa é o prazo, não a data de cadastro.
  const dateProp = props.find(isPrazoProp) || props.find((p) => p.type === 'date' && !isCriacaoProp(p)) || props.find((p) => p.type === 'date');
  const personProp = props.find((p) => p.type === 'person');

  // Criar pela lista já abre a tarefa: aqui não dá para digitar o nome na linha.
  const criar = async () => { const r = await onAddRow(); if (r) onOpenRow(r.id); };

  return (
    <div className="ws-table-wrap">
      {rows.length === 0 && <div className="px-4 py-10 text-center text-slate-400 text-[12px] font-medium">Nenhuma tarefa por aqui.</div>}
      {rows.map((row) => (
        <div key={row.id} onDoubleClick={() => onOpenRow(row.id)} className={`ws-tr group flex items-center gap-3 px-3 py-2 ${row._new ? 'ws-row-in' : ''}`}>
          <button onClick={() => onOpenRow(row.id)} className="flex-1 min-w-0 text-left">
            <span className="block text-[12.5px] font-medium text-slate-800 dark:text-slate-100 truncate">{row.title || 'Sem título'}</span>
            {excerpts?.[row.id] && <span className="ws-excerpt block">{excerpts[row.id]}</span>}
          </button>
          {personProp && row.values[personProp.id] && <PropertyValue prop={personProp} value={row.values[personProp.id]} users={users} />}
          {dateProp && row.values[dateProp.id] && <span className="text-[12px] text-slate-500 tabular-nums shrink-0">{formatDateBR(row.values[dateProp.id])}</span>}
          {statusProp && <span className="shrink-0"><PropertyValue prop={statusProp} value={row.values[statusProp.id]} users={users} /></span>}
          <RowMenu row={row} onDuplicate={onDuplicate} onOpenRow={onOpenRow} onRemove={onRemoveRow} />
        </div>
      ))}
      <button onClick={criar} className="ws-add-row">
        <Plus size={14} /> Nova tarefa
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PEEK — abre uma linha como página (propriedades + editor de blocos)
// ---------------------------------------------------------------------------
function RowPeek({ rowId, props, users, createdBy, onClose, onCell, onTitle, onDelete, onContentSaved }) {
  const { currentUser } = useAuth();
  const [page, setPage] = useState(null);
  const [values, setValues] = useState({});
  // Pergunta antes de concluir: fechar um lembrete some com ele das pendências
  // de quem depende dele, e o registro fica gravado no histórico da tarefa.
  const [confirmarConclusao, setConfirmarConclusao] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  // Ações do editor (anexar linha ao histórico), entregues quando ele sobe.
  const editorApi = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [full, rowList] = await Promise.all([ws.getPage(rowId), ws.listRows(await parentOf(rowId))]);
      if (!alive) return;
      setPage(full);
      const me = rowList.find((r) => r.id === rowId);
      setValues(me?.values || {});
    })().catch((e) => console.error(e));
    return () => { alive = false; };
  }, [rowId]);

  // Esc fecha — é o que a mão espera de um painel lateral.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setVal = (pid, v) => { setValues((s) => ({ ...s, [pid]: v })); onCell(rowId, pid, v); };

  const statusProp = findStatusProp(props);
  const opcaoConcluida = findDoneOption(statusProp);
  const jaConcluida = isRowDone({ values }, props, statusProp);

  // Concluir = trocar o status E deixar o registro escrito. As duas coisas
  // juntas: um status que muda sozinho não conta a história para quem chegar
  // depois, e um texto sem status deixa a pendência acesa na tela inicial.
  const concluir = async () => {
    if (!statusProp || !opcaoConcluida) {
      toast.error('A coluna de status não tem uma opção de conclusão (ex.: "Concluído").');
      setConfirmarConclusao(false);
      return;
    }
    setConcluindo(true);
    try {
      setVal(statusProp.id, opcaoConcluida.id);
      const blocos = editorApi.current?.registrar(carimboDeRegistro(currentUser, 'concluiu o lembrete.'));
      if (blocos) {
        onContentSaved?.(rowId, blocos);
        await ws.saveContent(page.id, blocos);
      }
      toast.success('Lembrete concluído.');
      setConfirmarConclusao(false);
    } catch (e) {
      console.error(e);
      toast.error('Não deu para registrar a conclusão.');
    } finally {
      setConcluindo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end bg-slate-900/25 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto ws-cmd-in" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-7 py-2.5 flex items-center justify-between z-10">
          <span className="text-[12px] font-semibold text-slate-400 tracking-[0.12em]">Tarefa</span>
          <div className="flex items-center gap-0.5">
            {page && (jaConcluida ? (
              <span className="flex items-center gap-1 mr-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[11px] font-bold">
                <CheckCircle2 size={13} /> Concluída
              </span>
            ) : (
              <button
                onClick={() => setConfirmarConclusao(true)}
                title="Marcar o lembrete como concluído"
                className="flex items-center gap-1 mr-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 text-[11px] font-bold hover:bg-emerald-100 transition-colors"
              >
                <CheckCircle2 size={13} /> Concluir
              </button>
            ))}
            <button onClick={() => onDelete(rowId)} title="Excluir tarefa" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"><Trash2 size={15} /></button>
            <button onClick={onClose} title="Fechar (Esc)" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X size={17} /></button>
          </div>
        </div>
        {!page ? (
          <div className="p-7 space-y-3"><div className="ws-skel h-8 w-2/3" /><div className="ws-skel h-4 w-full" /><div className="ws-skel h-4 w-5/6" /></div>
        ) : (
          <div className="px-7 py-5">
            <input
              defaultValue={page.title} key={page.title}
              onBlur={(e) => e.target.value !== page.title && onTitle(rowId, e.target.value)}
              placeholder="Nome da tarefa"
              className="w-full bg-transparent text-[26px] leading-tight font-bold tracking-tight text-slate-900 dark:text-slate-50 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none mb-4"
            />
            <div className="grid grid-cols-[132px_1fr] gap-x-3 gap-y-0.5 mb-5">
              {props.map((p) => (
                <div key={p.id} className="contents">
                  <span className="flex items-center text-[11.5px] font-medium text-slate-400 dark:text-slate-500 py-1">{p.name}</span>
                  <div className="min-w-0 -ml-2">
                    <PropertyCell prop={p} value={values[p.id]} users={users} due={isPrazoProp(p)} onCommit={(v) => setVal(p.id, v)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="text-[12px] font-semibold text-slate-400 tracking-[0.12em] mb-1.5">Observações e andamento</div>
              <Suspense fallback={<div className="space-y-2"><div className="ws-skel h-4 w-full" /><div className="ws-skel h-4 w-5/6" /></div>}>
                <BlockEditor
                  key={page.id} initialContent={page.content}
                  aoPreparar={(api) => { editorApi.current = api; }}
                  carimbarAutoria
                  onSave={(blocks) => {
                    onContentSaved?.(rowId, blocks);
                    return ws.saveContent(page.id, blocks).catch((e) => console.error(e));
                  }}
                  onMention={(u) => ws.registrarMencao({ pageId: page.id, userId: u.id, autorId: createdBy })}
                />
              </Suspense>
            </div>
          </div>
        )}

        {confirmarConclusao && (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4" onClick={() => !concluindo && setConfirmarConclusao(false)}>
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
              <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100">Você já resolveu essa pendência?</p>
              <p className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
                O lembrete sai das pendências e fica registrado aqui embaixo, com a data e o seu nome.
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setConfirmarConclusao(false)} disabled={concluindo}
                  className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
                  Ainda não
                </button>
                <button onClick={concluir} disabled={concluindo}
                  className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-60">
                  {concluindo ? 'Registrando…' : 'Sim, concluir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function parentOf(rowId) {
  const p = await ws.getPage(rowId);
  return p?.parent_id;
}

// ---------------------------------------------------------------------------
// Skeleton + vazio
// ---------------------------------------------------------------------------
function DatabaseSkeleton() {
  return (
    <div>
      <div className="flex gap-2 border-b border-slate-200 mb-4 pb-2">
        {[64, 72, 88, 56].map((w, i) => <div key={i} className="ws-skel h-6" style={{ width: w }} />)}
      </div>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="ws-skel h-9 w-full opacity-70" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3 border-t border-slate-100">
            <div className="ws-skel h-4 flex-1" /><div className="ws-skel h-4 w-24" /><div className="ws-skel h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ msg }) {
  return <div className="py-12 text-center text-slate-400 text-[13px] font-semibold max-w-sm mx-auto">{msg}</div>;
}
