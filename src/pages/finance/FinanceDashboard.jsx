import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeService } from '../../services/financeService';
import { todayISO } from '../../utils/date';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, Loader2, AlertCircle, Clock,
  ArrowDownCircle, ArrowUpCircle, Landmark, Send, Banknote,
  AreaChart as AreaChartIcon, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useFinanceRealtime } from '../../hooks/useFinanceRealtime';
import { usePermission } from '../../contexts/PermissionContext';
import BulkSettleModal from '../../components/finance/BulkSettleModal';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const MONTHS_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#ef4444'];

// Catálogo de gráficos do painel único. `types` = tipos de gráfico válidos para cada um.
const GRAPHS = {
  fluxo:   { label: 'Fluxo de Caixa', types: ['area', 'bar', 'line'] },
  saldos:  { label: 'Saldos por Conta', types: ['bar', 'pie'] },
  medicos: { label: 'Por Médico (Top 5)', types: ['bar', 'pie'] },
  origens: { label: 'Origens de Faturamento', types: ['pie', 'bar'] }
};
const TYPE_ICON = { area: AreaChartIcon, bar: BarChart3, line: LineChartIcon, pie: PieChartIcon };

// Janelas oferecidas nos cards de contas a pagar/receber (dias a partir de hoje).
const HORIZONS = [7, 15, 30, 60, 90];

function rangeFromPeriod(p) {
  if (p.mode === 'day') return { start: p.day, end: p.day };
  if (p.mode === 'month') {
    const [y, m] = p.month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { start: `${p.month}-01`, end: `${p.month}-${String(lastDay).padStart(2, '0')}` };
  }
  return { start: p.start, end: p.end };
}

// Período "atual" ancorado em hoje para o modo escolhido.
// Dia -> hoje; Mês -> mês corrente; Período -> mês corrente (default; navega-se pelas setas).
function periodForMode(mode) {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ym = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const day = `${ym}-${pad(today.getDate())}`;
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return { mode, day, month: ym, start: `${ym}-01`, end: `${ym}-${pad(lastDay)}` };
}

export default function FinanceDashboard() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('Editar Financeiro'); // sem ela os cards são só leitura
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);
  const [launchedPayables, setLaunchedPayables] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [reconCounts, setReconCounts] = useState({});

  // Dashboard fixo no mês atual (sem seletor de período nesta tela) — vale para os gráficos/KPIs.
  const [period] = useState(() => periodForMode('month'));
  const range = useMemo(() => rangeFromPeriod(period), [period]);

  // Cards de contas a pagar/receber: janela DESLIZANTE a partir de hoje, não o mês.
  // Preso ao mês, dia 28 mostrava quase nada mesmo com contas vencendo dia 01.
  const [horizon, setHorizon] = useState(() => {
    const v = parseInt(localStorage.getItem('finance.dash.horizon') || '', 10);
    return HORIZONS.includes(v) ? v : 30;
  });
  useEffect(() => { try { localStorage.setItem('finance.dash.horizon', String(horizon)); } catch { /* modo privado */ } }, [horizon]);
  const horizonRange = useMemo(() => {
    const t = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const f = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return { start: f(today), end: f(new Date(t.getFullYear(), t.getMonth(), t.getDate() + horizon - 1)) };
  }, [horizon]);

  // Seleção dentro dos cards: dá para lançar p/ pagamento e dar baixa sem sair do painel.
  const [selPagar, setSelPagar] = useState(() => new Set());
  const [selLancadas, setSelLancadas] = useState(() => new Set());
  const [settleRows, setSettleRows] = useState(null); // lançamentos no modal de baixa em lote
  const toggleIn = (setter) => (id) => setter(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const clearSelections = () => { setSelPagar(new Set()); setSelLancadas(new Set()); };

  const runStatus = async (ids, status, okMsg) => {
    try {
      await financeService.updateTransactionsStatus([...ids], status);
      toast.success(okMsg);
      clearSelections();
      loadDashboardData(true);
    } catch (e) { console.error(e); toast.error('Erro ao atualizar o status.'); }
  };

  // Painel único de gráfico: qual gráfico + tipo.
  const [graph, setGraph] = useState('fluxo');
  const [chartType, setChartType] = useState('area');
  const selectGraph = (g) => { setGraph(g); setChartType(GRAPHS[g].types[0]); };

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  const loadDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Top-up de contas fixas: completa ocorrências futuras antes de ler o período.
      // Não bloqueia o dashboard se falhar (ex.: ambiente sem a migration aplicada).
      try { await financeService.materializeRecurrences(); } catch (e) { console.warn('Top-up de recorrências falhou:', e); }

      const [txs, accs, recv, pay, launched, recon] = await Promise.all([
        financeService.getTransactions({ startDate: range.start, endDate: range.end }),
        financeService.getAccounts(),
        financeService.getTransactions({ type: 'ENTRADA', statusIn: ['PENDENTE', 'PARCIAL'] }),
        financeService.getTransactions({ type: 'SAIDA', statusIn: ['PENDENTE', 'PARCIAL'] }),
        financeService.getTransactions({ type: 'SAIDA', status: 'LANCADO' }),
        financeService.getPendingReconciliationCounts()
      ]);
      setTransactions(txs || []);
      setAccounts(accs || []);
      setReceivables(recv || []);
      setPayables(pay || []);
      setLaunchedPayables(launched || []);
      setReconCounts(recon || {});
    } catch (error) {
      console.error(error);
      if (!silent) toast.error('Erro ao carregar dados do dashboard.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Tempo real: KPIs, saldos e gráficos se atualizam sozinhos (silencioso) quando algo muda no financeiro.
  useFinanceRealtime(() => loadDashboardData(true));

  // --- CONTAS A RECEBER / A PAGAR (pendentes, agrupadas por pagador/fornecedor) ---
  // Separa em dois grupos: o que vence DE HOJE ATÉ o fim da janela (7/15/30/60/90 dias)
  // e o que já está VENCIDO (qualquer data anterior e ainda em aberto).
  // A janela desliza com o dia: no fim do mês já enxerga o começo do mês seguinte.
  const buildItems = (txs) => {
    let periodTotal = 0, overdue = 0, priorTotal = 0;
    const todayStr = todayISO();
    const rows = [];       // itens cujo vencimento/data cai dentro do período
    const priorRows = [];  // pendentes vencidos antes do início do período
    txs.forEach(t => {
      const ref = t.due_date || t.transaction_date;
      if (!ref) return;
      // PARCIAL: o que ainda falta receber/pagar é o restante (valor − já baixado).
      const amt = parseFloat(t.amount) - (parseFloat(t.paid_amount) || 0);
      const party = t.finance_parties?.name || null;
      const isOverdue = !!(t.due_date && t.due_date < todayStr);
      const row = {
        id: t.id,
        name: party || t.description || 'Lançamento',
        obs: party ? (t.description || null) : null, // descrição/observação do lançamento
        due: t.due_date || null,
        value: amt,
        overdue: isOverdue
      };
      if (isOverdue) {
        // Vencido: backlog que precisa continuar visível, venha de quando vier.
        priorRows.push(row);
        priorTotal += amt;
        overdue += amt;
      } else if (ref >= horizonRange.start && ref <= horizonRange.end) {
        rows.push(row);
        periodTotal += amt;
      }
      // Pendências além da janela (ref > horizonRange.end) seguem ocultas.
    });
    // Ordena por vencimento (mais próximo primeiro; sem vencimento por último).
    const byDue = (a, b) => (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99');
    rows.sort(byDue);
    priorRows.sort(byDue);
    // Total do card soma a janela + os vencidos (decisão de produto).
    return { rows, priorRows, periodTotal, priorTotal, overdue, total: periodTotal + priorTotal };
  };

  const receberData = useMemo(() => buildItems(receivables), [receivables, horizonRange]);
  const pagarData = useMemo(() => buildItems(payables), [payables, horizonRange]);
  const launchedPagarData = useMemo(() => buildItems(launchedPayables), [launchedPayables, horizonRange]);
  const accountsTotal = useMemo(() => accounts.reduce((acc, a) => acc + parseFloat(a.current_balance || 0), 0), [accounts]);
  const accountsLimitTotal = useMemo(() => accounts.reduce((acc, a) => acc + (parseFloat(a.overdraft_limit) || 0), 0), [accounts]);

  // --- DADOS DOS GRÁFICOS ---
  const graphData = useMemo(() => {
    const compareMap = {};
    transactions.forEach(t => {
      if (t.transfer_group_id) return; // transferência entre contas não é receita/despesa
      // transaction_date é coluna `date` (YYYY-MM-DD). Fatiar a string evita o deslocamento
      // de fuso do `new Date()` (que jogava o lançamento para o dia anterior).
      const [, mm, dd] = (t.transaction_date || '').slice(0, 10).split('-');
      if (!dd) return;
      const dateLabel = `${dd}/${mm}`;
      if (!compareMap[dateLabel]) compareMap[dateLabel] = { date: dateLabel, Receitas: 0, Despesas: 0 };
      if (t.type === 'ENTRADA') compareMap[dateLabel].Receitas += parseFloat(t.amount);
      else compareMap[dateLabel].Despesas += parseFloat(t.amount);
    });
    // Ordena cronologicamente (a chave é DD/MM) antes de cortar os últimos 20 pontos.
    const fluxo = Object.values(compareMap)
      .sort((a, b) => a.date.split('/').reverse().join('').localeCompare(b.date.split('/').reverse().join('')))
      .slice(-20);

    // Mostra qualquer conta com saldo diferente de zero (inclusive negativo).
    const saldos = accounts
      .map(a => ({ name: a.name, value: parseFloat(a.current_balance || 0) }))
      .filter(a => Math.abs(a.value) > 0.005);

    const doctorMap = {};
    transactions.forEach(t => { if (t.type === 'ENTRADA' && t.users?.name) doctorMap[t.users.name] = (doctorMap[t.users.name] || 0) + parseFloat(t.amount); });
    const medicos = Object.entries(doctorMap).map(([name, value]) => ({ name: name.split(' ').slice(0, 2).join(' '), value }))
      .sort((a, b) => b.value - a.value).slice(0, 5);

    const convenioMap = {};
    transactions.forEach(t => {
      if (t.type === 'ENTRADA') {
        const key = t.surgery_id ? 'Cirurgias' : 'Plantões / Outros';
        convenioMap[key] = (convenioMap[key] || 0) + parseFloat(t.amount);
      }
    });
    const origens = Object.entries(convenioMap).map(([name, value]) => ({ name, value }));

    return { fluxo, saldos, medicos, origens };
  }, [transactions, accounts]);

  const horizonLbl = `Próx. ${horizon} dias`;

  // Renderiza o gráfico ativo do painel único.
  const renderGraph = () => {
    const tooltipStyle = { borderRadius: '10px', border: 'none', boxShadow: '0 8px 12px -3px rgb(0 0 0 / 0.1)', fontSize: '11px' };

    if (graph === 'fluxo') {
      if (graphData.fluxo.length === 0) return <Empty text="Sem movimentação no período" />;
      // Com 1 ou 2 pontos (ex.: filtro de 1 dia), linha/área não desenham traço visível —
      // mostramos os marcadores para que o dado apareça.
      const showDots = graphData.fluxo.length <= 2;
      const common = (
        <>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 700 }} />
          <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 900 }} />
        </>
      );
      return (
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={graphData.fluxo} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
              {common}
              <Bar dataKey="Receitas" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Despesas" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={graphData.fluxo} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
              {common}
              <Line type="monotone" dataKey="Receitas" stroke="#10b981" strokeWidth={2.5} dot={showDots} />
              <Line type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2.5} dot={showDots} />
            </LineChart>
          ) : (
            <AreaChart data={graphData.fluxo} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="gDes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
              </defs>
              {common}
              <Area type="monotone" dataKey="Receitas" stroke="#10b981" strokeWidth={2.5} fill="url(#gRec)" dot={showDots} />
              <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2.5} fill="url(#gDes)" dot={showDots} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      );
    }

    // Gráficos categóricos: saldos / medicos / origens
    const data = graphData[graph];
    const emptyText = graph === 'saldos' ? 'Sem saldo nas contas' : graph === 'medicos' ? 'Sem faturamento por médico' : 'Sem dados de faturamento';
    if (!data || data.length === 0) return <Empty text={emptyText} />;

    if (chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value">
              {data.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
            <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
          <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={28}>
            {data.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] flex flex-col bg-[#f5f5f7] font-sans text-slate-900">

      {/* Header: gráficos seguem o mês atual; os cards de contas seguem a janela escolhida */}
      <div className="mb-4 flex flex-wrap items-center gap-3 shrink-0">
        <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
          <TrendingUp className="text-[#0071e3]" size={18} /> Financeiro MedCode
        </h1>
        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Contas a vencer em
          <select value={horizon} onChange={e => setHorizon(parseInt(e.target.value, 10))}
            title="Janela dos cards de contas a pagar/receber, contada a partir de hoje"
            className="h-8 px-2 rounded-lg border border-black/[.085] bg-white text-[11.5px] font-medium text-[#1d1d1f] normal-case tracking-normal outline-none focus:border-[#0071e3] cursor-pointer">
            {HORIZONS.map(h => <option key={h} value={h}>{h} dias</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 size={32} className="text-[#0071e3] animate-spin" /></div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* ===== CARDS: Receber | Pagar | (Saldo + card novo) ===== */}
          {/* Altura fixa e alta: cabe muita conta com scroll interno; o gráfico fica abaixo da dobra. */}
          <div className="flex flex-col lg:flex-row gap-3 mb-3 items-stretch lg:h-[80vh] shrink-0">
            <SummaryCard title="Contas a Receber" subtitle={horizonLbl} icon={<ArrowDownCircle size={15} className="text-emerald-600" />}
              accent="emerald" data={receberData} emptyText={`Nenhuma conta a receber nos próximos ${horizon} dias`}
              onClick={() => navigate('/finance/contas-receber')} className="lg:flex-1 lg:min-w-0" />
            <SummaryCard title="Contas a Pagar" subtitle={horizonLbl} icon={<ArrowUpCircle size={15} className="text-rose-600" />}
              accent="rose" data={pagarData} emptyText={`Nenhuma conta a pagar nos próximos ${horizon} dias`}
              onClick={() => navigate('/finance/contas-pagar')} className="lg:flex-1 lg:min-w-0"
              selection={canEdit ? {
                ids: selPagar,
                toggle: toggleIn(setSelPagar),
                clear: () => setSelPagar(new Set()),
                selectAll: (ids) => setSelPagar(new Set(ids)),
                actions: [{
                  key: 'lancar', label: 'Lançar p/ pagamento', icon: <Send size={12} />,
                  className: 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-sm',
                  run: (ids) => runStatus(ids, 'LANCADO', 'Conta(s) lançada(s) para pagamento.'),
                }],
              } : null} />

            {/* Coluna 3: Saldo das Contas + card novo (placeholder) empilhados */}
            <div className="lg:flex-1 lg:min-w-0 flex flex-col gap-3">
              <div className="bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm flex flex-col flex-[2] min-h-[200px]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Landmark size={15} className="text-[#0071e3]" />
                  <h3 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Saldo das Contas</h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0">
                  {accounts.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">Nenhuma conta cadastrada</div>
                  ) : accounts.map(a => {
                    const bal = parseFloat(a.current_balance || 0);
                    const limit = parseFloat(a.overdraft_limit || 0);
                    const pend = reconCounts[a.id] || 0;
                    return (
                      <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] font-bold text-slate-700 truncate block leading-tight">{a.name}</span>
                          {pend > 0 && <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wide">{pend} concil. pendente{pend === 1 ? '' : 's'}</span>}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`text-[10px] font-semibold tabular-nums block ${bal < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmt(bal)}</span>
                          {limit > 0 && <span className="text-[9px] font-bold tabular-nums text-slate-400 block">c/ limite {fmt(bal + limit)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 pt-2 border-t border-black/[.085] flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total</span>
                  <div className="text-right">
                    <span className={`text-sm font-semibold tabular-nums block ${accountsTotal < 0 ? 'text-rose-600' : 'text-indigo-700'}`}>{fmt(accountsTotal)}</span>
                    {accountsLimitTotal > 0 && <span className="text-[9px] font-bold tabular-nums text-slate-400 block">c/ limite {fmt(accountsTotal + accountsLimitTotal)}</span>}
                  </div>
                </div>
              </div>

              {/* CARD: Lançadas para Pagamento (Aguardando Liberação) */}
              <SummaryCard
                title="Lançadas p/ Pagamento"
                subtitle={horizonLbl}
                icon={<Clock size={15} className="text-purple-600" />}
                accent="purple"
                data={launchedPagarData}
                emptyText="Nenhuma conta lançada p/ pagamento"
                onClick={() => navigate('/finance/contas-pagar?status=LANCADO')}
                className="flex-[3] min-h-[160px]"
                selection={canEdit ? {
                  ids: selLancadas,
                  toggle: toggleIn(setSelLancadas),
                  clear: () => setSelLancadas(new Set()),
                  selectAll: (ids) => setSelLancadas(new Set(ids)),
                  actions: [
                    {
                      key: 'baixa', label: 'Dar baixa', icon: <Banknote size={12} />,
                      className: 'bg-[#248a3d] hover:bg-[#1e7233] text-white shadow-sm',
                      run: (ids) => setSettleRows(launchedPayables.filter(t => ids.has(t.id))),
                    },
                    {
                      key: 'pendente', label: 'Voltar p/ pendente',
                      className: 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50',
                      run: (ids) => runStatus(ids, 'PENDENTE', 'Conta(s) de volta para pendente.'),
                    },
                  ],
                } : null}
              />
            </div>
          </div>

        </div>
      )}

      {settleRows && (
        <BulkSettleModal
          rows={settleRows}
          accounts={accounts}
          onClose={() => setSettleRows(null)}
          onDone={() => { clearSelections(); loadDashboardData(true); }}
        />
      )}
    </div>
  );
}

function Empty({ text }) {
  return <div className="h-full flex items-center justify-center text-[11px] font-bold text-slate-400 uppercase">{text}</div>;
}

function SummaryRow({ r, selectable = false, checked = false, onToggle }) {
  // Com seleção ligada a linha inteira vira alvo do clique — e o clique não pode
  // subir para o card (que navega para a tela cheia).
  const hit = selectable ? (e) => { e.stopPropagation(); onToggle?.(r.id); } : undefined;
  return (
    <div onClick={hit}
      className={`py-1.5 border-b border-slate-50 last:border-0 ${selectable ? 'cursor-pointer -mx-1 px-1 rounded hover:bg-black/[.03]' : ''} ${checked ? 'bg-[#0071e3]/[.07]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {selectable && (
            <input type="checkbox" checked={checked} onChange={() => onToggle?.(r.id)} onClick={e => e.stopPropagation()}
              aria-label={`Selecionar ${r.name}`} className="w-3.5 h-3.5 accent-[#0071e3] cursor-pointer shrink-0" />
          )}
          <span className="text-[10px] font-bold text-slate-600 truncate pr-2">{r.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r.due && <span className={`text-[9px] font-bold whitespace-nowrap ${r.overdue ? 'text-rose-500' : 'text-slate-400'}`}>venc {fmtDate(r.due)}</span>}
          <span className="text-[10px] font-semibold text-slate-800 tabular-nums">{fmt(r.value)}</span>
        </div>
      </div>
      {r.obs && <div className={`text-[9px] font-medium text-slate-400 truncate mt-0.5 ${selectable ? 'pl-5' : ''}`}>{r.obs}</div>}
    </div>
  );
}

function SummaryCard({ title, subtitle, icon, accent, data, emptyText, onClick, className = '', selection = null }) {
  // selection = { ids:Set, toggle(id), clear(), selectAll(ids), actions:[{ key, label, icon, className, run(ids) }] }
  const sel = selection?.ids;
  const selectable = !!selection;
  // Marcar tudo/limpar mora no CABEÇALHO, e não na barra de ações: a barra só
  // existe depois que já há alguma marcada, e é justamente antes disso que a
  // pessoa quer pegar a lista inteira de uma vez. Inclui os vencidos, que são
  // linhas do mesmo card.
  const idsDoCard = selectable ? [...data.rows, ...data.priorRows].map(r => r.id) : [];
  const todasMarcadas = idsDoCard.length > 0 && idsDoCard.every(id => sel.has(id));
  const selectedTotal = selectable
    ? [...data.rows, ...data.priorRows].reduce((a, r) => a + (sel.has(r.id) ? r.value : 0), 0)
    : 0;
  const totalColor = accent === 'emerald' ? 'text-emerald-700' : accent === 'purple' ? 'text-purple-700' : 'text-rose-700';
  // Fundo levemente tingido por tipo (receber = verdinho / pagar = avermelhado / lançadas = roxinho) pra diferenciar os cards.
  const bgTint = accent === 'emerald' ? 'bg-emerald-50/50 border-emerald-100' : accent === 'purple' ? 'bg-purple-50/50 border-purple-100' : 'bg-rose-50/50 border-rose-100';
  const clickable = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`${bgTint} border rounded-2xl p-4 shadow-sm flex flex-col min-h-[200px] ${className} ${clickable ? 'cursor-pointer transition-all hover:shadow-md hover:border-[#0071e3]/40 hover:-translate-y-0.5' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {idsDoCard.length > 0 && (
            <button
              type="button"
              /* O card inteiro é um link para a listagem; o clique aqui não pode vazar. */
              onClick={(e) => {
                e.stopPropagation();
                if (todasMarcadas) selection.clear();
                else selection.selectAll(idsDoCard);
              }}
              className="text-[9px] font-semibold uppercase tracking-wider text-[#0071e3] hover:bg-[#0071e3]/[.08] px-1.5 py-0.5 rounded-md transition-colors whitespace-nowrap"
            >
              {todasMarcadas ? 'Limpar' : `Marcar ${idsDoCard.length}`}
            </button>
          )}
          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border border-black/[.06] px-1.5 py-0.5 rounded-md">{subtitle}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0">
        {data.rows.length === 0 && data.priorRows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-[10px] font-bold text-slate-400 uppercase px-2">{emptyText}</div>
        ) : (
          <>
            {data.rows.map(r => <SummaryRow key={r.id} r={r} selectable={selectable} checked={!!sel?.has(r.id)} onToggle={selection?.toggle} />)}
            {data.priorRows.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-2 px-1.5 py-1 mb-0.5 bg-rose-50/70 border border-rose-100 rounded-md">
                  <span className="text-[9px] font-semibold text-rose-600 uppercase tracking-wider flex items-center gap-1 min-w-0">
                    <AlertCircle size={10} className="shrink-0" />
                    <span className="truncate">Vencidos (em atraso)</span>
                  </span>
                  <span className="text-[10px] font-semibold text-rose-600 tabular-nums shrink-0">{fmt(data.priorTotal)}</span>
                </div>
                {data.priorRows.map(r => <SummaryRow key={r.id} r={r} selectable={selectable} checked={!!sel?.has(r.id)} onToggle={selection?.toggle} />)}
              </div>
            )}
          </>
        )}
      </div>
      {selectable && sel.size > 0 && (
        <div onClick={e => e.stopPropagation()}
          className="mt-2 rounded-xl border border-[#0071e3]/25 bg-[#0071e3]/[.06] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-[#0071e3] uppercase tracking-wide">
              {sel.size} selecionada{sel.size === 1 ? '' : 's'} · {fmt(selectedTotal)}
            </span>
            <button type="button" onClick={selection.clear} className="text-[10px] font-semibold text-slate-500 hover:text-slate-800">Limpar</button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {selection.actions.map(a => (
              <button key={a.key} type="button" onClick={() => a.run(sel)}
                className={`h-7 px-2.5 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 ${a.className}`}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {data.overdue > 0 && (
        <div className="mt-1.5 text-[9px] font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1">
          <AlertCircle size={10} /> {fmt(data.overdue)} vencido(s) em atraso
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-black/[.085] flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total</span>
        <span className={`text-sm font-semibold tabular-nums ${totalColor}`}>{fmt(data.total)}</span>
      </div>
    </div>
  );
}
