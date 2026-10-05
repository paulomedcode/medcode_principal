// ============================================================================
// PrintDialog — relatório impresso (PDF/papel) de uma visão do Compromisso.
//
// A visão já chega filtrada e ordenada; aqui o usuário escolhe O QUE vai para
// o papel: quais tarefas (marcando uma a uma ou de uma vez), quais colunas, se
// as anotações de cada tarefa entram e a orientação da folha (A4 paisagem por
// padrão — é o que cabe uma tabela de trabalho).
//
// A impressão em si é o printReport de sempre, o mesmo dos relatórios do
// financeiro: cabeçalho com a logo da instituição, quem gerou e quando.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, X, Search, CheckSquare, Square, StickyNote } from 'lucide-react';
import * as ws from '../../services/workspace';
import { useAuth } from '../../contexts/AuthContext';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { printReport } from '../../utils/printReport';
import { cellText, findStatusProp, isRowDone, plainTextFromBlocks } from './databaseUtils';

// Anotação inteira, um parágrafo por bloco. O teto é alto de propósito: no
// papel a anotação é o conteúdo, não uma prévia.
const NOTA_MAX = 4000;

export default function PrintDialog({ databaseId, viewName = '', rows, props, users, onClose }) {
  const { currentUser } = useAuth();
  const { theme } = useWhiteLabel();

  const [notas, setNotas] = useState({});
  const [carregandoNotas, setCarregandoNotas] = useState(true);
  const [tituloDb, setTituloDb] = useState('');
  // Enquanto ninguém escreve um título, ele é DERIVADO do banco + visão
  // ("Espaço Administrativo — Tabela"); ao digitar, o texto do usuário manda.
  const [tituloManual, setTituloManual] = useState(null);

  const [orientacao, setOrientacao] = useState('landscape');
  const [incluirNotas, setIncluirNotas] = useState(true);
  const [ocultarConcluidas, setOcultarConcluidas] = useState(false);
  const [busca, setBusca] = useState('');

  const [colunas, setColunas] = useState(() => new Set(props.map((p) => p.id)));
  const [marcadas, setMarcadas] = useState(() => new Set(rows.map((r) => r.id)));

  // Nome do banco (vira o título sugerido) e as anotações de todas as linhas.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [pagina, conteudos] = await Promise.all([
        ws.getPage(databaseId).catch(() => null),
        ws.listRowExcerpts(databaseId).catch(() => ({})),
      ]);
      if (!vivo) return;
      setTituloDb(pagina?.title || '');
      const mapa = {};
      Object.entries(conteudos || {}).forEach(([id, content]) => {
        const t = plainTextFromBlocks(content, NOTA_MAX, '\n');
        if (t) mapa[id] = t;
      });
      setNotas(mapa);
      setCarregandoNotas(false);
    })();
    return () => { vivo = false; };
  }, [databaseId]);

  const titulo = tituloManual ?? ([tituloDb, viewName].filter(Boolean).join(' — ') || 'Relatório de tarefas');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const statusProp = useMemo(() => findStatusProp(props), [props]);
  const concluida = useCallback((r) => isRowDone(r, props, statusProp), [props, statusProp]);

  // A BUSCA é só um recorte visual para achar a tarefa — a marcação sobrevive a
  // ela. Já "ocultar concluídas" é uma decisão sobre o RELATÓRIO: o que está
  // oculto não vai para o papel, esteja marcado ou não.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (ocultarConcluidas && concluida(r)) return false;
      if (!q) return true;
      return (r.title || '').toLowerCase().includes(q) || (notas[r.id] || '').toLowerCase().includes(q);
    });
  }, [rows, busca, ocultarConcluidas, concluida, notas]);

  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((r) => marcadas.has(r.id));

  const alternarLinha = (id) => setMarcadas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const alternarTodasVisiveis = () => setMarcadas((s) => {
    const n = new Set(s);
    if (todasVisiveisMarcadas) visiveis.forEach((r) => n.delete(r.id));
    else visiveis.forEach((r) => n.add(r.id));
    return n;
  });

  const alternarColuna = (id) => setColunas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Ordem do papel = ordem da visão. Colunas idem.
  const selecionadas = useMemo(
    () => rows.filter((r) => marcadas.has(r.id) && !(ocultarConcluidas && concluida(r))),
    [rows, marcadas, ocultarConcluidas, concluida]
  );
  const colsProps = useMemo(() => props.filter((p) => colunas.has(p.id)), [props, colunas]);

  // Contagem por status no rodapé: um relatório de pendências vale pelo
  // apanhado ("Pendente: 9 · Concluído: 5"), não só pela lista.
  const contagem = useMemo(() => {
    if (!statusProp) return [];
    const porOpcao = new Map();
    selecionadas.forEach((r) => {
      const nome = cellText(statusProp, r.values?.[statusProp.id], users) || 'Sem status';
      porOpcao.set(nome, (porOpcao.get(nome) || 0) + 1);
    });
    // Na ordem das opções da coluna (Pendente → Em andamento → Concluído), que
    // é a ordem que o usuário montou.
    const ordem = [...(statusProp.options || []).map((o) => o.name), 'Sem status'];
    return [...porOpcao.entries()]
      .sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]))
      .map(([label, value]) => ({ label, value: String(value) }));
  }, [selecionadas, statusProp, users]);

  const imprimir = () => {
    if (selecionadas.length === 0) return;
    const ok = printReport({
      theme,
      title: titulo.trim() || 'Relatório de tarefas',
      periodLabel: 'Seleção',
      periodText: `${selecionadas.length} de ${rows.length} tarefa(s)${viewName ? ` · visão "${viewName}"` : ''}`,
      userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema',
      orientation: orientacao,
      variant: 'notes',
      columns: [
        // O nome da tarefa é o que se lê primeiro: reserva de largura para ele
        // e o resto se divide entre as propriedades.
        { header: 'Tarefa', align: 'left', width: colsProps.length >= 2 ? '34%' : undefined },
        ...colsProps.map((p) => ({ header: p.name, align: 'left' })),
      ],
      rows: selecionadas.map((r) => ({
        cells: [r.title || '(sem nome)', ...colsProps.map((p) => cellText(p, r.values?.[p.id], users) || '—')],
        note: incluirNotas ? (notas[r.id] || '') : '',
        done: concluida(r),
      })),
      summary: contagem,
      totalLabel: 'Total de tarefas impressas',
    });
    if (!ok) { toast.error('O navegador bloqueou a janela de impressão. Libere os pop-ups deste site.'); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-[13px] font-black text-slate-700 dark:text-slate-200">
            <Printer size={15} className="text-slate-400" /> Imprimir relatório
          </div>
          <button onClick={onClose} title="Fechar (Esc)" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X size={16} /></button>
        </div>

        {/* Opções */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <label className="flex-1 min-w-[240px]">
              <span className="block text-[12px] font-semibold text-slate-400 tracking-[0.12em] mb-1">Título do relatório</span>
              <input
                value={titulo}
                onChange={(e) => setTituloManual(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-400"
              />
            </label>
            <div>
              <span className="block text-[12px] font-semibold text-slate-400 tracking-[0.12em] mb-1">Folha A4</span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                {[['landscape', 'Paisagem'], ['portrait', 'Retrato']].map(([v, label]) => (
                  <button
                    key={v} onClick={() => setOrientacao(v)}
                    className={`h-7 px-3 rounded-md text-[12px] font-bold transition-colors ${orientacao === v ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >{label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Colunas */}
          <div>
            <span className="block text-[12px] font-semibold text-slate-400 tracking-[0.12em] mb-1.5">Colunas</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="h-7 px-2.5 flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 text-[12px] font-bold text-slate-400" title="A tarefa é sempre impressa">Tarefa</span>
              {props.map((p) => (
                <button
                  key={p.id} onClick={() => alternarColuna(p.id)}
                  className={`h-7 px-2.5 rounded-lg text-[12px] font-bold border transition-colors ${colunas.has(p.id)
                    ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through'}`}
                >{p.name}</button>
              ))}
              <button
                onClick={() => setIncluirNotas((v) => !v)}
                title="Imprime, abaixo de cada tarefa, o texto escrito dentro dela"
                className={`h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[12px] font-bold border transition-colors ${incluirNotas
                  ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through'}`}
              ><StickyNote size={12} /> Anotações</button>
            </div>
          </div>
        </div>

        {/* Seleção de tarefas */}
        <div className="px-5 py-2.5 flex items-center gap-2 flex-wrap border-b border-slate-100 dark:border-slate-800">
          <button onClick={alternarTodasVisiveis} className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {todasVisiveisMarcadas ? <CheckSquare size={13} /> : <Square size={13} />}
            {todasVisiveisMarcadas ? 'Desmarcar' : 'Marcar'} {busca.trim() || ocultarConcluidas ? 'os visíveis' : 'todos'}
          </button>
          <label className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-bold text-slate-500 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <input type="checkbox" checked={ocultarConcluidas} onChange={(e) => setOcultarConcluidas(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
            Não imprimir concluídas
          </label>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tarefa ou anotação…"
              className="w-full h-7 pl-8 pr-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-transparent text-[12px] font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-2 py-1.5">
          {visiveis.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] font-semibold text-slate-400">Nenhuma tarefa encontrada.</p>
          ) : visiveis.map((r) => {
            const marcada = marcadas.has(r.id);
            const nota = notas[r.id];
            return (
              <label
                key={r.id}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${marcada ? 'bg-blue-50/60 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
              >
                <input type="checkbox" checked={marcada} onChange={() => alternarLinha(r.id)} className="mt-[3px] rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[12.5px] font-bold truncate ${concluida(r) ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                      {r.title || '(sem nome)'}
                    </span>
                    {statusProp && (
                      <span className="text-[11px] font-semibold text-slate-400 shrink-0">{cellText(statusProp, r.values?.[statusProp.id], users)}</span>
                    )}
                  </div>
                  {incluirNotas && nota && (
                    <div className="text-[11px] text-slate-400 line-clamp-2 whitespace-pre-line">{nota}</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-slate-400">
            {selecionadas.length} de {rows.length} tarefa(s)
            {carregandoNotas && incluirNotas ? ' · carregando anotações…' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded-lg text-[12.5px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button
              onClick={imprimir}
              disabled={selecionadas.length === 0 || (incluirNotas && carregandoNotas)}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-slate-900 text-white text-[12.5px] font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer size={14} /> Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
