// ============================================================================
// Bloco "Exibição vinculada": embute um database existente dentro de qualquer
// página, opcionalmente fixado numa ÚNICA visão (ex.: só o Calendário do
// Financeiro). Assim dá para montar uma página por setor, todas lendo o mesmo
// banco de dados.
//
// ATENÇÃO: `createReactBlockSpec` devolve uma FÁBRICA — quem monta o schema
// precisa CHAMAR (ver BlockEditor.jsx). Passá-la direto derruba a tela toda.
// ============================================================================
import React, { Suspense, useState, useEffect } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { Database, Table2, KanbanSquare, CalendarDays, List, Layers, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import * as ws from '../../services/workspace';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../contexts/PermissionContext';
import { removerQuadro } from './blockGuard';

// Quebra da dependência circular (DatabaseView <-> BlockEditor)
const DatabaseView = React.lazy(() => import('./DatabaseView'));

const VIEW_ICON = { table: Table2, board: KanbanSquare, calendar: CalendarDays, list: List };

// Props de bloco só guardam primitivos, então o filtro do bloco vai como JSON.
// Vazio/inválido = sem filtro próprio (cai no filtro da visão).
function parseFiltro(filtro) {
  if (!filtro) return null;
  try {
    const arr = JSON.parse(filtro);
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch { return null; }
}

function LinkedDatabaseComponent({ block, editor }) {
  const { databaseId, viewId, filtro, origem } = block.props;
  // origem='pagina': é a tabela DA PRÓPRIA página do database, só que como
  // bloco (para poder mover e escrever em volta). Nesse caso ela não é um
  // "embed" — não ganha moldura nem o botão de trocar a fonte, que só serviria
  // para o usuário perder a própria tabela de vista.
  const daPropriaPagina = origem === 'pagina';
  const { currentUser } = useAuth();
  const { hasPermission, permissionsMatrix } = usePermission();
  // Inserir um quadro ou trocar a fonte dele é reversível: vale o bypass normal
  // de "Acesso Total (Admin)".
  const podeAlterar = hasPermission('Alterar Quadros Compromisso');
  // Excluir NÃO: aqui a permissão é ESTRITA, no mesmo espírito do plantão
  // verificado da Escala. Tirar um quadro muda a página de todo mundo, então
  // nem quem tem "Acesso Total (Admin)" destrava sem a caixinha "Excluir
  // Quadros da Página" explicitamente ligada (no cargo ou individualmente).
  // Só o Desenvolvedor mantém o passe livre — alguém precisa configurar isso.
  const podeExcluir = (() => {
    if (!currentUser) return false;
    const role = String(currentUser.role || '').toLowerCase();
    if (role === 'desenvolvedor' || role === 'developer') return true;
    if (currentUser.permissoes_extras?.['Excluir Quadros Compromisso']) return true;
    return !!(permissionsMatrix?.[currentUser.role || 'Visualizador'] || {})['Excluir Quadros Compromisso'];
  })();
  const [databases, setDatabases] = useState([]);
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);

  const configured = !!databaseId && viewId !== '';

  // Passo 1: lista os databases disponíveis (só enquanto nenhum foi escolhido).
  // A lista já vem filtrada pela visibilidade: banco "somente eu" é individual e
  // não aparece para os outros, senão vinculá-lo aqui vazaria o conteúdo dele.
  useEffect(() => {
    if (databaseId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    ws.listDatabases(currentUser)
      .then((data) => { if (alive) setDatabases(data); })
      .catch((error) => { if (alive) { console.error('Erro ao carregar bancos:', error); setDatabases([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [databaseId, currentUser]);

  // Passo 2: escolhido o database, lista as visões dele para fixar uma.
  useEffect(() => {
    if (!databaseId || configured) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    supabase
      .from('workspace_db_views')
      .select('id, name, type, position')
      .eq('database_id', databaseId)
      .order('position')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error('Erro ao carregar visões:', error); setViews([]); }
        else setViews(data || []);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [databaseId, configured]);

  const setProps = (props) => editor.updateBlock(block, { type: 'linked_database', props: { origem, ...props } });
  // Trocar de banco/visão zera o filtro: ele aponta para colunas do banco antigo.
  const reset = () => setProps({ databaseId: '', viewId: '', filtro: '' });

  // Tirar o quadro da página é a ÚNICA saída dele (o teclado não apaga — ver
  // blockGuard.js), e mesmo assim com pergunta antes. O aviso conta o que a
  // exclusão realmente faz: nenhuma tarefa é apagada, só esta exibição.
  const excluirBloco = () => {
    const ok = window.confirm(
      'Tirar este quadro da página?\n\n' +
      '• As tarefas e o banco de dados NÃO são apagados — eles continuam onde estão.\n' +
      '• Some apenas esta exibição, aqui nesta página.'
    );
    if (ok) removerQuadro(editor, block);
  };

  // Bloco recém-inserido, ainda sem banco escolhido: sai sem cerimônia (não há
  // o que perder). Mas continua fora do alcance de quem não mexe em quadro —
  // senão a trava do teclado teria uma porta lateral.
  const removerVazio = (podeAlterar || podeExcluir) ? () => removerQuadro(editor, block) : null;

  // --- Configurado: renderiza o database embutido -------------------------
  if (configured) {
    return (
      <div
        contentEditable={false}
        className={`group/linked w-full relative ${daPropriaPagina
          ? 'my-2'
          : 'my-4 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl bg-white/60 dark:bg-slate-800/40 shadow-sm'}`}
      >
        {/* Ficam FORA do canto superior esquerdo para não cobrir a barra de
            ferramentas da visão (filtros/ordenar/colunas). A tabela da própria
            página não tem nem um nem outro: trocar a fonte dela seria perder a
            própria tabela de vista, e ela volta sozinha ao reabrir a página. */}
        {!daPropriaPagina && (podeAlterar || podeExcluir) && (
          <div className="absolute -top-2.5 left-3 z-10 opacity-0 group-hover/linked:opacity-100 flex items-center gap-1 transition-all">
            {podeAlterar && (
              <button
                onClick={reset}
                title="Trocar banco/visão deste bloco"
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-sm text-[10px] font-bold text-slate-500 dark:text-slate-300 hover:text-slate-900 transition-colors"
              >
                <RefreshCw size={11} /> Trocar fonte
              </button>
            )}
            {podeExcluir && (
              <button
                onClick={excluirBloco}
                title="Tirar este quadro da página"
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-sm text-[10px] font-bold text-slate-500 dark:text-slate-300 hover:text-rose-600 hover:border-rose-200 transition-colors"
              >
                <Trash2 size={11} /> Excluir quadro
              </button>
            )}
          </div>
        )}
        <div className={`pointer-events-auto ${daPropriaPagina ? '' : 'p-1'}`}>
          <Suspense fallback={<div className="p-4 text-center text-[13px] font-semibold text-slate-400">Carregando exibição vinculada...</div>}>
            <DatabaseView
              databaseId={databaseId}
              createdBy={currentUser?.id}
              pinnedViewId={viewId === '*' ? null : viewId}
              filterOverride={parseFiltro(filtro)}
              onFilterOverrideChange={(f) => setProps({ databaseId, viewId, filtro: JSON.stringify(f || []) })}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // --- Passo 2: escolher a visão ------------------------------------------
  if (databaseId) {
    return (
      <Picker
        title="Qual visão mostrar aqui?"
        subtitle="Cada bloco pode fixar uma visão diferente do mesmo banco — ex.: Calendário para um setor, Quadro para outro."
        loading={loading}
        emptyMsg="Este banco não tem visões."
        onBack={reset}
        onRemove={removerVazio}
      >
        <Option
          icon={Layers}
          label="Todas as visões (com abas)"
          hint="igual à página do banco"
          onClick={() => setProps({ databaseId, viewId: '*', filtro: '' })}
        />
        {views.map((v) => (
          <Option
            key={v.id}
            icon={VIEW_ICON[v.type] || Table2}
            label={v.name}
            onClick={() => setProps({ databaseId, viewId: v.id, filtro: '' })}
          />
        ))}
      </Picker>
    );
  }

  // --- Passo 1: escolher o banco ------------------------------------------
  return (
    <Picker
      title="Selecionar fonte de dados"
      subtitle="Escolha um banco existente para exibir nesta página."
      loading={loading}
      emptyMsg="Nenhum banco de dados encontrado. Crie um pela barra lateral do Compromisso."
      onRemove={removerVazio}
    >
      {databases.map((db) => (
        <Option
          key={db.id}
          emoji={db.icon}
          icon={Database}
          label={db.title || 'Sem título'}
          onClick={() => setProps({ databaseId: db.id, viewId: '', filtro: '' })}
        />
      ))}
    </Picker>
  );
}

// ---------------------------------------------------------------------------
// UI de seleção
// ---------------------------------------------------------------------------
function Picker({ title, subtitle, loading, emptyMsg, onBack, onRemove, children }) {
  const hasItems = React.Children.toArray(children).some(Boolean);
  return (
    <div contentEditable={false} className="my-4 p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 w-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        {/* Tudo aqui é <div> de propósito: o BlockNote reseta o tamanho de
            <p>/<h1..h6>/<li> dentro do editor, e isso atropelaria as classes
            de tamanho deste bloco. */}
        <div>
          <div className="text-[13px] font-medium text-slate-700 flex items-center gap-2">
            <Database size={16} className="text-blue-500" /> {title}
          </div>
          {subtitle && <div className="text-[11px] font-medium text-slate-400 mt-1 max-w-md">{subtitle}</div>}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="text-[12.5px] font-medium text-slate-400 hover:text-slate-700 pointer-events-auto">
              Voltar
            </button>
          )}
          {/* Bloco ainda sem fonte não tem nada a perder — e sem esta saída ele
              ficaria preso na página, já que o teclado não apaga quadro. */}
          {onRemove && (
            <button onClick={onRemove} title="Remover este bloco da página" className="text-[12.5px] font-medium text-slate-400 hover:text-rose-600 pointer-events-auto">
              Remover
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="text-[13px] text-slate-400 font-medium">Carregando...</div>
      ) : !hasItems ? (
        <div className="text-[13px] text-slate-400 font-medium">{emptyMsg}</div>
      ) : (
        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1 pointer-events-auto">{children}</div>
      )}
    </div>
  );
}

function Option({ icon, emoji, label, hint, onClick }) {
  const Icon = icon;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-white hover:shadow-sm hover:text-slate-900 border border-transparent hover:border-slate-200 rounded-lg text-left transition-all"
    >
      {emoji ? <span className="text-[15px] w-4 text-center shrink-0">{emoji}</span> : <Icon size={15} className="text-slate-400 shrink-0" />}
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[11px] font-semibold text-slate-400 shrink-0">{hint}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Spec do bloco (lembre: isto é uma FÁBRICA — chame antes de pôr no schema)
// ---------------------------------------------------------------------------
export const LinkedDatabaseBlock = createReactBlockSpec(
  {
    type: 'linked_database',
    propSchema: {
      databaseId: { default: '' },
      // '' = ainda não escolhida; '*' = todas as visões (abas); senão o id da visão fixada.
      viewId: { default: '' },
      // Filtro DESTE bloco (JSON). Permite dois blocos da mesma visão
      // mostrarem recortes diferentes — ex.: um por setor.
      filtro: { default: '' },
      // 'pagina' = é a tabela da própria página do database (ver componente).
      origem: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => <LinkedDatabaseComponent block={props.block} editor={props.editor} />,
  }
);
