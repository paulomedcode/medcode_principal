// ============================================================================
// Workspace (módulo Compromisso estilo Notion) — Fase 0/1.
//
// Duas colunas: árvore de páginas (criar / renomear / aninhar / lixeira) e o
// editor de blocos com autosave. Databases/visões (kanban, calendário, tabela)
// e a migração da agenda atual vêm no próximo incremento (a base já suporta).
// ============================================================================
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, FileText, ChevronRight, ChevronDown, Trash2,
  Loader2, Search, RotateCcw, X, Cloud, CloudOff, ArrowLeft, Database,
  Globe, Users2, CornerDownLeft, Command, Lock, Check,
  PanelLeftOpen, PanelLeftClose,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../contexts/PermissionContext';
import { supabase } from '../services/supabase';
import * as ws from '../services/workspace';
import { pedirAberturaDeTarefa } from '../components/workspace/abrirTarefa';
// BlockNote é o maior peso do módulo: carrega sob demanda para o Compromisso abrir rápido.
const BlockEditor = lazy(() => import('../components/workspace/BlockEditor'));
import Popover from '../components/workspace/Popover';
import '../styles/workspace.css';

const EMOJIS = ['📄', '📝', '✅', '📌', '📅', '🩺', '💊', '🏥', '📋', '🔔', '⭐', '💡', '🗂️', '📊', '🎯', '🧪'];

// A normalização da visibilidade e a regra de "quem vê o quê" moram no serviço
// (ws.pageVisScope / ws.podeVerPagina): a mesma regra vale para a árvore aqui e
// para o seletor de fonte do bloco vinculado.

// Qual página abrir ao entrar no Compromisso.
// Ordem: a última que o usuário abriu (se ainda existe) → o primeiro database
// (é o conteúdo principal; abrir numa página em branco não ajuda ninguém) →
// a primeira página qualquer.
const LAST_PAGE_KEY = 'ws-ultima-pagina';

function pickInitialPage(pages) {
  if (!pages.length) return null;
  let last = null;
  try { last = localStorage.getItem(LAST_PAGE_KEY); } catch { /* ignore */ }
  if (last && pages.some((p) => p.id === last)) return last;
  const firstDb = pages.find((p) => p.type === 'database');
  return (firstDb || pages[0]).id;
}

// Linha do seletor de visibilidade (módulo: não recriar por render).
function VisRow({ icon, iconClass, text, active, onClick }) {
  const Icon = icon;
  return (
    <button onClick={onClick} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-50 text-left">
      <Icon size={14} className={iconClass} /> <span className="flex-1 truncate">{text}</span>
      {active && <Check size={13} className="text-blue-500 shrink-0" />}
    </button>
  );
}

export default function Workspace() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();

  // Página e banco de dados são o mesmo registro com `type` diferente, mas o
  // estrago de mexer em cada um é diferente: apagar um banco leva junto todas
  // as linhas de todo mundo. Por isso a permissão é escolhida pelo tipo.
  const podeCriarPagina = hasPermission('Criar Páginas Compromisso');
  const podeCriarBanco = hasPermission('Criar Bancos Compromisso');
  const podeEditarPaginas = hasPermission('Editar Páginas Compromisso');
  const podeEditarBancos = hasPermission('Editar Bancos Compromisso');
  const podeExcluirPaginas = hasPermission('Excluir Páginas Compromisso');
  const podeExcluirBancos = hasPermission('Excluir Bancos Compromisso');
  const podeEditarEste = useCallback(
    (pagina) => (pagina?.type === 'database' ? podeEditarBancos : podeEditarPaginas),
    [podeEditarBancos, podeEditarPaginas]
  );
  const avisarSemPermissao = () => toast.error('Você não tem permissão para esta ação em Compromissos.', { id: 'ws-sem-permissao' });

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | dirty | saving | saved
  const [expanded, setExpanded] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [emojiFor, setEmojiFor] = useState(false);
  const [focusTitleId, setFocusTitleId] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dropHint, setDropHint] = useState(null); // { id, mode: 'before'|'after'|'inside' }
  const [categorias, setCategorias] = useState([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Barra lateral recolhível — a preferência fica no aparelho. No celular ela
  // abre por cima da página (não cabe ao lado) e fecha ao escolher uma página.
  const ehCelular = () => window.matchMedia('(max-width: 767px)').matches;
  const [sidebarAberta, setSidebarAberta] = useState(() => {
    if (ehCelular()) return false;
    try { return localStorage.getItem('ws-sidebar') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    if (ehCelular()) return;
    try { localStorage.setItem('ws-sidebar', sidebarAberta ? '1' : '0'); } catch { /* ignore */ }
  }, [sidebarAberta]);
  useEffect(() => { if (ehCelular()) setSidebarAberta(false); }, [selectedId]);

  const databaseIds = useMemo(() => new Set(pages.filter((p) => p.type === 'database').map((p) => p.id)), [pages]);
  const tree = useMemo(() => ws.buildTree(pages, { databaseIds }), [pages, databaseIds]);

  /**
   * Conteúdo que vai para o editor.
   *
   * Numa página de database, as visões (tabela/quadro/calendário) eram
   * renderizadas DEPOIS do editor, presas no rodapé: não dava para escrever
   * nada abaixo delas nem movê-las. Agora elas entram como um BLOCO do próprio
   * editor — o mesmo bloco de "exibição vinculada" —, então arrastam para onde
   * o usuário quiser e aceitam texto acima e abaixo.
   *
   * A injeção é idempotente: se a página já tem o bloco apontando para ela
   * mesma, nada é acrescentado.
   */
  const conteudoDaPagina = useMemo(() => {
    if (!currentPage) return undefined;
    const blocos = Array.isArray(currentPage.content) ? currentPage.content : [];
    if (currentPage.type !== 'database') return blocos.length ? blocos : undefined;

    const jaTem = blocos.some((b) => b.type === 'linked_database' && b.props?.databaseId === currentPage.id);
    if (jaTem) return blocos;
    return [
      ...blocos,
      { type: 'linked_database', props: { databaseId: currentPage.id, viewId: '*', filtro: '', origem: 'pagina' } },
      // Parágrafo de sobra: garante um ponto de digitação abaixo da tabela.
      { type: 'paragraph' },
    ];
  }, [currentPage]);

  // Regras de visibilidade (nível de app; enforcement real só com RLS) — ver
  // ws.podeVerPagina.
  const visibleToMe = useCallback((p) => ws.podeVerPagina(p, currentUser), [currentUser]);

  const titleTimer = useRef(null);
  const titleRef = useRef(null);
  const emojiRef = useRef(null);

  // Fecha o seletor de emoji ao clicar fora.
  useEffect(() => {
    if (!emojiFor) return;
    const onDown = (e) => { if (emojiRef.current && !emojiRef.current.contains(e.target)) setEmojiFor(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [emojiFor]);

  // Foca o título quando uma página recém-criada é aberta.
  useEffect(() => {
    if (focusTitleId && currentPage?.id === focusTitleId && titleRef.current) {
      titleRef.current.focus();
      setFocusTitleId(null);
    }
  }, [focusTitleId, currentPage]);

  const refresh = useCallback(async () => {
    const all = await ws.listPages();
    const data = all.filter(visibleToMe);
    setPages(data);
    return data;
  }, [visibleToMe]);

  // Categorias (para o seletor de visibilidade das páginas).
  useEffect(() => {
    supabase.from('agenda_categorias').select('id, nome, cor').order('nome')
      .then(({ data }) => setCategorias(data || []))
      .catch((e) => console.error(e));
  }, []);

  // Tempo real na árvore (multi-aba / multi-usuário).
  //
  // Cuidado: LINHAS de database também são workspace_pages. Sem os filtros
  // abaixo, digitar o título de uma linha disparava um refresh completo da
  // árvore a cada gravação. Então: ignora eventos de linha (o DatabaseView
  // cuida dos próprios dados) e agrupa o resto num debounce. Assina uma vez só
  // — `refresh` e os ids de database entram por ref para não recriar o canal.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const databaseIdsRef = useRef(databaseIds);
  useEffect(() => { databaseIdsRef.current = databaseIds; }, [databaseIds]);
  const pagesRef = useRef(pages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  useEffect(() => {
    let timer = null;
    const isRowEvent = (payload) => {
      const parentId = payload?.new?.parent_id ?? payload?.old?.parent_id ?? null;
      return !!parentId && databaseIdsRef.current.has(parentId);
    };
    // O evento traz a página INTEIRA, `content` incluso — ou seja, cada
    // autosave do editor (a cada 800ms de digitação, de qualquer um) bate aqui.
    // A árvore só mostra nome, ícone, lugar e visibilidade: se nada disso mudou,
    // não há o que recarregar.
    const soMudouOTexto = (payload) => {
      if (payload.eventType !== 'UPDATE') return false;
      const n = payload.new;
      const atual = n?.id ? pagesRef.current.find((p) => p.id === n.id) : null;
      if (!atual) return false;
      return atual.title === n.title
        && atual.icon === n.icon
        && atual.parent_id === n.parent_id
        && atual.position === n.position
        && atual.categoria_id === n.categoria_id
        && !n.deleted_at
        && JSON.stringify(atual.visibility ?? null) === JSON.stringify(n.visibility ?? null);
    };
    const ch = supabase
      .channel('workspace_pages_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_pages' }, (payload) => {
        if (isRowEvent(payload) || soMudouOTexto(payload)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { refreshRef.current().catch((e) => console.error(e)); }, 400);
      })
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, []);

  // Se a identidade do usuário resolver após o mount, re-filtra a árvore
  // (o efeito de montagem cuida da carga e da seleção iniciais).
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current) { didInit.current = true; return; }
    refresh().catch((e) => console.error(e));
  }, [refresh]);

  // Cmd/Ctrl+K abre a barra de comando (quick switcher).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await refresh();
        if (data.length && !selectedId) selectPage(pickInitialPage(data));
      } catch (e) {
        console.error(e);
        const msg = `${e?.message || ''} ${e?.code || ''}`;
        if (/does not exist|42P01|schema cache/i.test(msg)) setSetupNeeded(true);
        else toast.error('Erro ao carregar o workspace.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectPage = useCallback(async (id) => {
    if (!id) { setSelectedId(null); setCurrentPage(null); return; }
    setSelectedId(id);
    try { localStorage.setItem(LAST_PAGE_KEY, id); } catch { /* ignore */ }
    setLoadingPage(true);
    setSaveState('idle');
    try {
      const page = await ws.getPage(id);
      setCurrentPage(page);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao abrir a página.');
    } finally {
      setLoadingPage(false);
    }
  }, []);

  // Chegou pelo sino (?abrir=<id>): abre exatamente aquilo.
  //
  // O id pode ser uma página comum (menção escrita dentro de uma página) ou uma
  // LINHA de database (a tarefa). No segundo caso quem sabe abrir é o
  // DatabaseView — aqui a gente abre a página do database e deixa o pedido
  // registrado para ele (ver abrirTarefa.js).
  const [searchParams, setSearchParams] = useSearchParams();
  const abrirParam = searchParams.get('abrir');
  const abriuRef = useRef(null);
  useEffect(() => {
    if (!abrirParam || abriuRef.current === abrirParam) return;
    abriuRef.current = abrirParam;
    let alive = true;
    (async () => {
      try {
        const alvo = await ws.getPage(abrirParam);
        if (!alive || !alvo) return;
        const pai = alvo.parent_id ? await ws.getPage(alvo.parent_id) : null;
        if (!alive) return;
        if (pai?.type === 'database') {
          pedirAberturaDeTarefa(alvo.id);
          await selectPage(pai.id);
        } else {
          await selectPage(alvo.id);
        }
      } catch (e) {
        console.error(e);
        toast.error('Não foi possível abrir essa tarefa.');
      } finally {
        // Some da barra de endereço: um F5 não deve reabrir o painel de novo.
        if (alive) setSearchParams({}, { replace: true });
      }
    })();
    return () => { alive = false; };
  }, [abrirParam, selectPage, setSearchParams]);

  const handleCreate = useCallback(async (parentId = null) => {
    if (!podeCriarPagina) return avisarSemPermissao();
    try {
      const page = await ws.createPage({ parentId, createdBy: currentUser?.id });
      await refresh();
      if (parentId) setExpanded((s) => new Set(s).add(parentId));
      setFocusTitleId(page.id);
      selectPage(page.id);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar página.');
    }
  }, [currentUser, refresh, selectPage, podeCriarPagina]);

  const handleCreateDatabase = useCallback(async (parentId = null) => {
    if (!podeCriarBanco) return avisarSemPermissao();
    try {
      const page = await ws.createDatabase({ parentId, title: 'Compromissos', icon: '📅', createdBy: currentUser?.id, seedCompromissos: true });
      await refresh();
      if (parentId) setExpanded((s) => new Set(s).add(parentId));
      selectPage(page.id);
      toast.success('Database criado com as colunas da agenda.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar database.');
    }
  }, [currentUser, refresh, selectPage, podeCriarBanco]);

  const handleSaveContent = useCallback(async (id, blocks) => {
    // O editor já vai montado em somente-leitura sem permissão; esta guarda é a
    // rede de baixo, para nenhum caminho (autosave pendente, atalho) gravar.
    if (!podeEditarEste(pages.find((p) => p.id === id))) return;
    try {
      setSaveState('saving');
      await ws.saveContent(id, blocks);
      setSaveState('saved');
    } catch (e) {
      console.error(e);
      setSaveState('dirty');
      toast.error('Falha ao salvar.');
    }
  }, [pages, podeEditarEste]);

  const handleTitleChange = useCallback((value) => {
    if (!podeEditarEste(currentPage)) return;
    setCurrentPage((p) => (p ? { ...p, title: value } : p));
    setPages((list) => list.map((p) => (p.id === selectedId ? { ...p, title: value } : p)));
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      try { await ws.updatePage(selectedId, { title: value }); }
      catch (e) { console.error(e); }
    }, 500);
  }, [selectedId, currentPage, podeEditarEste]);

  const handleSetIcon = useCallback(async (icon) => {
    setEmojiFor(false);
    if (!podeEditarEste(currentPage)) return avisarSemPermissao();
    setCurrentPage((p) => (p ? { ...p, icon } : p));
    setPages((list) => list.map((p) => (p.id === selectedId ? { ...p, icon } : p)));
    try { await ws.updatePage(selectedId, { icon }); } catch (e) { console.error(e); }
  }, [selectedId, currentPage, podeEditarEste]);

  // Visibilidade da página (objeto { scope, ids? }).
  const handleSetVisibility = useCallback(async (visibility) => {
    if (!podeEditarEste(currentPage)) return avisarSemPermissao();
    setCurrentPage((p) => (p ? { ...p, visibility } : p));
    setPages((list) => list.map((p) => (p.id === selectedId ? { ...p, visibility } : p)));
    try { await ws.updatePage(selectedId, { visibility }); }
    catch (e) { console.error(e); toast.error('Erro ao mudar a visibilidade.'); }
  }, [selectedId, currentPage, podeEditarEste]);

  const handleDelete = useCallback(async (id) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;

    const podeExcluirEste = page.type === 'database' ? podeExcluirBancos : podeExcluirPaginas;
    if (!podeExcluirEste) return avisarSemPermissao();

    if (page.type === 'database') {
      const confirm = window.prompt(`CUIDADO: Você está tentando excluir o banco de dados "${page.title}". Isso apagará TODAS as linhas e informações contidas nele.\n\nPara prosseguir, digite a palavra "excluir" abaixo:`);
      if (confirm !== 'excluir') {
        toast.error('Exclusão cancelada (palavra incorreta).');
        return;
      }
    } else {
      if (!window.confirm('Mover esta página (e subpáginas) para a lixeira?')) return;
    }

    try {
      // Busca no banco: as linhas de database não vêm mais em listPages().
      const descendants = await ws.fetchDescendantIds(id);
      await ws.softDeletePage(id, descendants);
      const data = await refresh();
      if (id === selectedId || descendants.includes(selectedId)) {
        selectPage(data.length ? pickInitialPage(data) : null);
      }
      toast.success('Movido para a lixeira.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir.');
    }
  }, [pages, selectedId, refresh, selectPage, podeExcluirPaginas, podeExcluirBancos]);

  const toggleExpand = useCallback((id) => {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Move (arrastar e soltar): 'inside' aninha como filho; 'before'/'after'
  // reordena entre irmãos. Bloqueia ciclos (mover para dentro de si mesma).
  const handleMove = useCallback(async (sourceId, target, mode) => {
    if (!sourceId || !target || sourceId === target.id) return;
    if (!podeEditarPaginas) return avisarSemPermissao();
    if (mode === 'inside' && target.type === 'database') {
      toast.error('Para adicionar itens a um database, use a tabela ou "Importar agenda".');
      return;
    }
    const desc = ws.descendantIdsFlat(pages, sourceId);
    const newParentId = mode === 'inside' ? target.id : (target.parent_id ?? null);
    if (newParentId === sourceId || desc.includes(newParentId)) {
      toast.error('Não dá para mover uma página para dentro dela mesma.');
      return;
    }
    try {
      if (mode === 'inside') {
        await ws.movePage(sourceId, newParentId);
        setExpanded((s) => new Set(s).add(newParentId));
      } else {
        const siblings = pages
          .filter((p) => (p.parent_id ?? null) === (newParentId ?? null) && p.id !== sourceId && !databaseIds.has(p.parent_id))
          .sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title, 'pt-BR'))
          .map((p) => p.id);
        const ti = siblings.indexOf(target.id);
        const insertAt = ti < 0 ? siblings.length : (mode === 'after' ? ti + 1 : ti);
        siblings.splice(insertAt, 0, sourceId);
        await ws.movePage(sourceId, newParentId);
        await ws.reorderSiblings(siblings);
      }
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao mover a página.');
    }
  }, [pages, databaseIds, refresh, podeEditarPaginas]);

  const dnd = useMemo(() => ({
    dragId,
    dropHint,
    onDragStart: (id) => setDragId(id),
    onDragOver: (e, node) => {
      if (!dragId || dragId === node.id) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const mode = y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside';
      setDropHint((h) => (h && h.id === node.id && h.mode === mode ? h : { id: node.id, mode }));
    },
    onDrop: (node) => {
      if (dragId && dropHint) handleMove(dragId, node, dropHint.mode);
      setDragId(null);
      setDropHint(null);
    },
    onDragEnd: () => { setDragId(null); setDropHint(null); },
  }), [dragId, dropHint, handleMove]);

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  if (setupNeeded) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-6">
        <div className="p-5 bg-amber-50 text-amber-500 rounded-2xl mb-5"><Database size={42} /></div>
        <h2 className="text-xl font-black text-slate-700">Falta preparar o banco</h2>
        <p className="text-slate-500 font-medium mt-2 max-w-md">
          As tabelas do Compromisso ainda não existem neste banco. Aplique a migration
          <span className="font-mono text-[13px] bg-slate-100 px-1.5 py-0.5 rounded mx-1">20260621120000_workspace_notion.sql</span>
          (entra automaticamente ao mergear na <span className="font-mono">main</span>).
        </p>
        <button onClick={() => navigate('/home')} className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all">
          <ArrowLeft size={16} /> Voltar ao início
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] md:h-[calc(100vh-64px)] flex relative">
      {/* Barra recolhida: só um trilho fino com os atalhos essenciais.
          A árvore ocupava 270px permanentes para mostrar 2 nomes — agora o
          espaço vai para o conteúdo, que é o que importa. */}
      {!sidebarAberta && (
        <div className="w-12 shrink-0 border-r border-slate-200/70 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl flex flex-col items-center py-3 gap-1">
          <button onClick={() => setSidebarAberta(true)} title="Mostrar páginas" className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 transition-colors">
            <PanelLeftOpen size={17} />
          </button>
          <button onClick={() => setPaletteOpen(true)} title="Buscar / ir para… (⌘K)" className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 transition-colors">
            <Command size={16} />
          </button>
          {podeCriarPagina && (
            <button onClick={() => handleCreate(null)} title="Nova página" className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 transition-colors">
              <Plus size={17} />
            </button>
          )}
          <button onClick={() => navigate('/home')} title="Início" className="mt-auto p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-700 transition-colors">
            <ArrowLeft size={16} />
          </button>
        </div>
      )}

      {/* Celular: véu por trás da barra aberta — tocar fora fecha */}
      {sidebarAberta && <div className="md:hidden absolute inset-0 z-20 bg-black/20" onClick={() => setSidebarAberta(false)} />}

      {/* SIDEBAR / ÁRVORE */}
      <aside className={`${sidebarAberta ? 'w-[85%] max-w-[300px] md:max-w-none md:w-[248px] absolute md:static inset-y-0 left-0 z-30 shadow-2xl md:shadow-none bg-white md:bg-white/70' : 'w-0 overflow-hidden border-r-0 bg-white/70'} shrink-0 dark:bg-slate-900/50 backdrop-blur-xl border-r border-slate-200/70 dark:border-slate-700/60 flex flex-col transition-[width] duration-200`}>
        <div className="px-2.5 py-2.5 flex items-center gap-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
          <button onClick={() => navigate('/home')} title="Início" className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-800 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <span className="text-[13px] font-black text-slate-800 dark:text-slate-100 tracking-tight flex-1 px-1">Compromissos</span>
          <button onClick={() => setPaletteOpen(true)} title="Buscar / ir para… (⌘K)" className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 transition-colors">
            <Command size={15} />
          </button>
          {podeCriarBanco && (
            <button onClick={() => handleCreateDatabase(null)} title="Novo database (tabela/kanban/calendário)" className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 transition-colors">
              <Database size={15} />
            </button>
          )}
          {podeCriarPagina && (
            <button onClick={() => handleCreate(null)} title="Nova página" className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 transition-colors">
              <Plus size={17} />
            </button>
          )}
          <button onClick={() => setSidebarAberta(false)} title="Recolher barra" className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-700 transition-colors">
            <PanelLeftClose size={16} />
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar páginas..."
              className="w-full h-8 pl-8 pr-2 rounded-lg bg-slate-100/80 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-800 text-[13px] font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {tree.length === 0 ? (
            <div className="mt-2 flex flex-col gap-1">
              {podeCriarBanco && (
                <button onClick={() => handleCreateDatabase(null)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/70 transition-colors">
                  <Database size={15} /> Criar agenda (database)
                </button>
              )}
              {podeCriarPagina && (
                <button onClick={() => handleCreate(null)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <Plus size={15} /> Página em branco
                </button>
              )}
              {!podeCriarPagina && !podeCriarBanco && (
                <p className="px-3 py-2 text-[12px] font-semibold text-slate-400">Nenhuma página por aqui — e seu perfil não pode criar.</p>
              )}
            </div>
          ) : (
            <TreeList
              nodes={tree}
              depth={0}
              filter={filter.trim().toLowerCase()}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={selectPage}
              onToggle={toggleExpand}
              onCreateChild={handleCreate}
              onDelete={handleDelete}
              dnd={dnd}
              perms={{ podeCriarPagina, podeEditarPaginas, podeExcluirPaginas, podeExcluirBancos }}
            />
          )}
        </nav>

        {(podeExcluirPaginas || podeExcluirBancos) && (
          <button onClick={() => setShowTrash(true)} className="m-2 flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-bold text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-colors">
            <Trash2 size={15} /> Lixeira
          </button>
        )}
      </aside>

      {/* CONTEÚDO / EDITOR */}
      <section className="flex-1 min-w-0 overflow-y-auto bg-white dark:bg-slate-900">
        {!currentPage ? (
          <EmptyState
            onCreate={() => handleCreate(null)}
            onCreateDatabase={() => handleCreateDatabase(null)}
            hasPages={pages.length > 0}
            podeCriarPagina={podeCriarPagina}
            podeCriarBanco={podeCriarBanco}
          />
        ) : (
          // Página de database usa a largura da tela: as tarefas precisam do
          // espaço que sobrava nas laterais. Texto continua em coluna estreita,
          // que é o que se lê bem.
          //
          // A folga à esquerda não é estética: é onde o BlockNote desenha a alça
          // de arrastar dos blocos. Sem ela a alça fica fora da área visível e
          // não dá para remanejar a tabela na página.
          <div className={`mx-auto py-8 ${currentPage.type === 'database' ? 'w-full pl-12 pr-6 md:pl-14 md:pr-8' : 'max-w-3xl px-8 md:px-12'}`}>
            <div className="flex items-center justify-between mb-2 h-6">
              <VisibilityPicker value={currentPage.visibility} legacyCategoriaId={currentPage.categoria_id} categorias={categorias} onChange={handleSetVisibility} />
              <SaveBadge state={saveState} />
            </div>

            <div className="relative inline-block mb-1" ref={emojiRef}>
              <button
                onClick={() => podeEditarEste(currentPage) && setEmojiFor((v) => !v)}
                className={`${currentPage.type === 'database' ? 'text-2xl' : 'text-4xl'} leading-none hover:bg-slate-100 rounded-lg p-1 -ml-1 transition-colors`}
                title={podeEditarEste(currentPage) ? 'Mudar ícone' : 'Sem permissão para editar'}
              >
                {currentPage.icon || <FileText size={currentPage.type === 'database' ? 24 : 36} className="text-slate-300" />}
              </button>
              {emojiFor && (
                <div className="absolute z-20 top-full left-0 mt-1 p-2 bg-white rounded-xl border border-slate-200 shadow-xl grid grid-cols-8 gap-1 w-[280px]">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => handleSetIcon(e)} className="text-xl hover:bg-slate-100 rounded-md p-1 transition-colors">{e}</button>
                  ))}
                  {currentPage.icon && (
                    <button onClick={() => handleSetIcon(null)} className="col-span-8 mt-1 text-[12.5px] font-medium text-slate-400 hover:text-rose-500">Remover ícone</button>
                  )}
                </div>
              )}
            </div>

            <input
              ref={titleRef}
              value={currentPage.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              readOnly={!podeEditarEste(currentPage)}
              placeholder={podeEditarEste(currentPage) ? 'Sem título' : ''}
              className={`w-full bg-transparent font-bold tracking-tight text-slate-900 dark:text-slate-50 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none ${currentPage.type === 'database' ? 'text-[26px] leading-tight mb-2' : 'text-4xl font-black mb-4'}`}
            />

            {loadingPage ? (
              <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={24} /></div>
            ) : (
              <Suspense fallback={<div className="space-y-2"><div className="ws-skel h-4 w-full" /><div className="ws-skel h-4 w-5/6" /></div>}>
                <BlockEditor
                  key={currentPage.id}
                  editavel={podeEditarEste(currentPage)}
                  initialContent={conteudoDaPagina}
                  onSave={(blocks) => handleSaveContent(currentPage.id, blocks)}
                  onDirtyChange={(dirty) => setSaveState((s) => (dirty ? 'dirty' : s === 'dirty' ? 'saving' : s))}
                  onMention={(u) => ws.registrarMencao({ pageId: currentPage.id, userId: u.id, autorId: currentUser?.id })}
                />
              </Suspense>
            )}
          </div>
        )}
      </section>

      {showTrash && (
        <TrashModal
          onClose={() => setShowTrash(false)}
          onChanged={refresh}
          podeExcluirPaginas={podeExcluirPaginas}
          podeExcluirBancos={podeExcluirBancos}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          pages={pages}
          onClose={() => setPaletteOpen(false)}
          onSelect={(id) => { selectPage(id); setPaletteOpen(false); }}
          onNewPage={podeCriarPagina ? () => { handleCreate(null); setPaletteOpen(false); } : null}
          onNewDatabase={podeCriarBanco ? () => { handleCreateDatabase(null); setPaletteOpen(false); } : null}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Árvore (recursiva)
// ----------------------------------------------------------------------------
function TreeList({ nodes, depth, filter, expanded, selectedId, onSelect, onToggle, onCreateChild, onDelete, dnd, perms }) {
  // Com filtro, achata e mostra só o que casa pelo título.
  const visible = filter
    ? flatten(nodes).filter((n) => n.title.toLowerCase().includes(filter))
    : nodes;

  return (
    <div className="flex flex-col gap-0.5">
      {visible.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={filter ? 0 : depth}
          flat={!!filter}
          expanded={expanded}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggle={onToggle}
          onCreateChild={onCreateChild}
          onDelete={onDelete}
          dnd={dnd}
          perms={perms}
        />
      ))}
    </div>
  );
}

function flatten(nodes, out = []) {
  nodes.forEach((n) => { out.push(n); flatten(n.children, out); });
  return out;
}

function TreeNode({ node, depth, flat, expanded, selectedId, onSelect, onToggle, onCreateChild, onDelete, dnd, perms }) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedId;
  // Excluir um database é permissão à parte de excluir uma página: some junto
  // com todas as linhas dele.
  const podeExcluirEste = node.type === 'database' ? perms?.podeExcluirBancos : perms?.podeExcluirPaginas;

  const hint = dnd?.dropHint && dnd.dropHint.id === node.id ? dnd.dropHint.mode : null;
  const isDragging = dnd?.dragId === node.id;
  const draggable = !flat && !!perms?.podeEditarPaginas; // não arrasta na busca nem sem permissão de editar

  return (
    <div>
      <div
        draggable={draggable}
        onDragStart={(e) => { if (!draggable) return; e.stopPropagation(); dnd.onDragStart(node.id); }}
        onDragOver={(e) => draggable && dnd.onDragOver(e, node)}
        onDrop={(e) => { if (!draggable) return; e.preventDefault(); e.stopPropagation(); dnd.onDrop(node); }}
        onDragEnd={() => draggable && dnd.onDragEnd()}
        className={`group relative flex items-center gap-1 pr-1 rounded-lg cursor-pointer transition-colors
          ${isSelected ? 'bg-slate-200/60 dark:bg-blue-500/15 text-slate-900 dark:text-blue-300 font-semibold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800'}
          ${isDragging ? 'opacity-40' : ''}
          ${hint === 'inside' ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onSelect(node.id)}
      >
        {hint === 'before' && <span className="absolute left-2 right-2 top-0 h-0.5 bg-blue-500 rounded-full" />}
        {hint === 'after' && <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-blue-500 rounded-full" />}
        <button
          onClick={(e) => { e.stopPropagation(); if (hasChildren && !flat) onToggle(node.id); }}
          className={`p-0.5 rounded ${hasChildren && !flat ? 'text-slate-400 hover:bg-slate-200/60' : 'opacity-0 pointer-events-none'}`}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className="text-[15px] leading-none w-[18px] text-center shrink-0">
          {node.icon || (node.type === 'database'
            ? <Database size={14} className="inline text-slate-400" />
            : <FileText size={14} className="inline text-slate-400" />)}
        </span>

        <span className="flex-1 py-1.5 text-[13px] font-semibold truncate">{node.title || 'Sem título'}</span>

        {perms?.podeCriarPagina && (
          <button
            onClick={(e) => { e.stopPropagation(); onCreateChild(node.id); }}
            title="Adicionar subpágina"
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
          >
            <Plus size={13} />
          </button>
        )}
        {podeExcluirEste && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            title={node.type === 'database' ? 'Excluir database' : 'Excluir'}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-200/60 transition-all"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {hasChildren && isOpen && !flat && (
        <TreeList
          nodes={node.children}
          depth={depth + 1}
          filter=""
          expanded={expanded}
          selectedId={selectedId}
          perms={perms}
          onSelect={onSelect}
          onToggle={onToggle}
          onCreateChild={onCreateChild}
          onDelete={onDelete}
          dnd={dnd}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Auxiliares
// ----------------------------------------------------------------------------
function SaveBadge({ state }) {
  if (state === 'saving') return <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400"><Loader2 size={12} className="animate-spin" /> Salvando</span>;
  if (state === 'saved') return <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-500"><Cloud size={12} /> Salvo</span>;
  if (state === 'dirty') return <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-500"><CloudOff size={12} /> Editando</span>;
  return <span className="h-4" />;
}

function EmptyState({ onCreate, onCreateDatabase, hasPages, podeCriarPagina, podeCriarBanco }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="p-5 bg-blue-50 text-blue-500 rounded-2xl mb-5"><FileText size={42} /></div>
      <h2 className="text-xl font-black text-slate-700">{hasPages ? 'Selecione uma página' : 'Seu workspace está vazio'}</h2>
      <p className="text-slate-400 font-medium mt-1 max-w-sm">
        {!podeCriarPagina && !podeCriarBanco
          ? 'Escolha uma página na barra lateral. Seu perfil não pode criar páginas nem bancos de dados.'
          : hasPages
            ? 'Escolha uma página na barra lateral ou crie uma nova.'
            : 'Comece por uma agenda (tabela, kanban e calendário prontos) ou por uma página em branco para anotar.'}
      </p>
      <div className="mt-5 flex items-center gap-2">
        {podeCriarBanco && (
          <button onClick={onCreateDatabase} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-all">
            <Database size={16} /> Criar agenda
          </button>
        )}
        {podeCriarPagina && (
          <button onClick={onCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all">
            <Plus size={16} /> Página em branco
          </button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Seletor de visibilidade: Toda a equipe · Somente eu · Categorias (várias).
// ----------------------------------------------------------------------------
function VisibilityPicker({ value, legacyCategoriaId, categorias, onChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const scope = ws.pageVisScope({ visibility: value, categoria_id: legacyCategoriaId });
  const ids = scope.scope === 'categories' ? (scope.ids || []) : [];
  const selectedCats = categorias.filter((c) => ids.includes(c.id));

  let Icon = Globe, label = 'Toda a equipe', tone = 'text-slate-400 hover:bg-slate-100';
  if (scope.scope === 'private') { Icon = Lock; label = 'Somente eu'; tone = 'text-amber-600 bg-amber-50 hover:bg-amber-100'; }
  else if (scope.scope === 'categories' && ids.length) {
    Icon = Users2;
    label = selectedCats.length <= 2 ? selectedCats.map((c) => c.nome).join(', ') : `${selectedCats.length} categorias`;
    tone = 'text-violet-600 bg-violet-50 hover:bg-violet-100';
  }

  const toggleCat = (id) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onChange(next.length ? { scope: 'categories', ids: next } : { scope: 'all' });
  };

  return (
    <div className="relative">
      <button ref={ref} onClick={() => setOpen((v) => !v)} title="Quem vê esta página"
        className={`flex items-center gap-1.5 h-6 px-2 rounded-lg text-[12.5px] font-medium transition-colors max-w-[220px] ${tone}`}>
        <Icon size={12} className="shrink-0" /> <span className="truncate">{label}</span>
      </button>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} width={244}>
          <div className="p-1.5">
            <p className="px-2 py-1 text-[12px] font-medium text-slate-400">Quem pode ver</p>
            <VisRow icon={Globe} iconClass="text-slate-400" text="Toda a equipe" active={scope.scope === 'all'} onClick={() => { onChange({ scope: 'all' }); setOpen(false); }} />
            <VisRow icon={Lock} iconClass="text-amber-500" text="Somente eu" active={scope.scope === 'private'} onClick={() => { onChange({ scope: 'private' }); setOpen(false); }} />
            {categorias.length > 0 && (
              <>
                <p className="px-2 pt-2 pb-1 text-[12px] font-medium text-slate-400">Por equipe (marque várias)</p>
                <div className="max-h-48 overflow-y-auto">
                  {categorias.map((c) => (
                    <VisRow key={c.id} icon={Users2} iconClass="text-violet-400" text={c.nome} active={ids.includes(c.id)} onClick={() => toggleCat(c.id)} />
                  ))}
                </div>
              </>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Barra de comando (⌘K): busca por título e navega; cria página/database.
// ----------------------------------------------------------------------------
function CommandPalette({ pages, onClose, onSelect, onNewPage, onNewDatabase }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const query = q.trim().toLowerCase();

  const results = useMemo(() => {
    const list = pages.filter((p) => (p.title || '').toLowerCase().includes(query));
    return list.slice(0, 40);
  }, [pages, query]);

  const actions = [
    ...(onNewPage ? [{ key: 'new-page', label: 'Nova página em branco', icon: Plus, run: onNewPage }] : []),
    ...(onNewDatabase ? [{ key: 'new-db', label: 'Criar agenda (database)', icon: Database, run: onNewDatabase }] : []),
  ];
  const items = [...results.map((p) => ({ kind: 'page', page: p })), ...actions.map((a) => ({ kind: 'action', action: a }))];
  const clampedIdx = Math.min(idx, Math.max(0, items.length - 1));

  const run = (i) => {
    const it = items[i];
    if (!it) return;
    if (it.kind === 'page') onSelect(it.page.id);
    else it.action.run();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((v) => Math.min(v + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((v) => Math.max(v - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(clampedIdx); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-slate-900/30 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden ws-cmd-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-slate-100">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            autoFocus value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={onKey}
            placeholder="Buscar página ou executar ação…"
            className="flex-1 h-12 bg-transparent text-[15px] font-semibold text-slate-800 placeholder:text-slate-400 outline-none"
          />
          <kbd className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length > 0 && <p className="px-2 pt-1.5 pb-1 text-[12px] font-medium text-slate-400">Páginas</p>}
          {items.map((it, i) => {
            const active = i === clampedIdx;
            if (it.kind === 'page') {
              const p = it.page;
              return (
                <button key={p.id} onMouseEnter={() => setIdx(i)} onClick={() => run(i)}
                  className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="w-5 text-center text-[15px] shrink-0">{p.icon || (p.type === 'database' ? <Database size={15} className="inline text-slate-400" /> : <FileText size={15} className="inline text-slate-400" />)}</span>
                  <span className="flex-1 text-[13px] font-semibold text-slate-700 truncate">{p.title || 'Sem título'}</span>
                  {p.type === 'database' && <span className="text-[12px] font-medium text-slate-400">Database</span>}
                  {active && <CornerDownLeft size={13} className="text-blue-400" />}
                </button>
              );
            }
            const a = it.action;
            const isFirstAction = i === results.length;
            return (
              <div key={a.key}>
                {isFirstAction && <p className="px-2 pt-2 pb-1 text-[12px] font-medium text-slate-400">Ações</p>}
                <button onMouseEnter={() => setIdx(i)} onClick={() => run(i)}
                  className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <a.icon size={15} className="text-blue-500 shrink-0" />
                  <span className="flex-1 text-[13px] font-bold text-slate-700">{a.label}</span>
                  {active && <CornerDownLeft size={13} className="text-blue-400" />}
                </button>
              </div>
            );
          })}
          {query && results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] font-semibold text-slate-400">Nenhuma página encontrada.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TrashModal({ onClose, onChanged, podeExcluirPaginas, podeExcluirBancos }) {
  const [items, setItems] = useState(null);
  // Restaurar e apagar de vez são a mesma permissão de excluir: quem mandou
  // para a lixeira é quem desfaz e quem esvazia.
  const podeMexer = (it) => (it.type === 'database' ? podeExcluirBancos : podeExcluirPaginas);

  const load = useCallback(async () => {
    try { setItems(await ws.listTrash()); }
    catch (e) { console.error(e); toast.error('Erro ao carregar lixeira.'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const restore = async (id) => {
    try { await ws.restorePage(id); await load(); await onChanged(); toast.success('Página restaurada.'); }
    catch (e) { console.error(e); toast.error('Erro ao restaurar.'); }
  };

  const purge = async (id) => {
    if (!window.confirm('Excluir permanentemente? Esta ação não pode ser desfeita.')) return;
    try { await ws.hardDeletePage(id); await load(); toast.success('Excluído definitivamente.'); }
    catch (e) { console.error(e); toast.error('Erro ao excluir.'); }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2"><Trash2 size={18} className="text-slate-400" /> Lixeira</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {items === null ? (
            <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={22} /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-slate-400 text-sm font-medium">Lixeira vazia</p>
          ) : (
            items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50">
                <span className="text-base w-5 text-center">{it.icon || '📄'}</span>
                <span className="flex-1 text-[13px] font-semibold text-slate-700 truncate">{it.title || 'Sem título'}</span>
                {podeMexer(it) && <button onClick={() => restore(it.id)} title="Restaurar" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><RotateCcw size={15} /></button>}
                {podeMexer(it) && <button onClick={() => purge(it.id)} title="Excluir definitivamente" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
