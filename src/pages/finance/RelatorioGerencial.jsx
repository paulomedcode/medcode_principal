import React, { useState, useMemo } from 'react';
import { financeService } from '../../services/financeService';
import FinancePeriodBar from '../../components/finance/FinancePeriodBar';
import SearchableSelect from '../../components/finance/SearchableSelect';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { LayoutDashboard, Loader2, TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import toast from 'react-hot-toast';
import ReportBuilder from '../../components/finance/ReportBuilder';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { useAuth } from '../../contexts/AuthContext';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#ef4444'];

const KPI_STYLES = {
  emerald: { box: 'bg-emerald-50 border-emerald-100', label: 'text-emerald-600', value: 'text-emerald-950' },
  rose: { box: 'bg-rose-50 border-rose-100', label: 'text-rose-600', value: 'text-rose-950' },
  indigo: { box: 'bg-indigo-50 border-indigo-100', label: 'text-[#0071e3]', value: 'text-indigo-950' },
  amber: { box: 'bg-amber-50 border-amber-100', label: 'text-amber-600', value: 'text-amber-950' }
};
function Kpi({ label, value, color, icon }) {
  const s = KPI_STYLES[color];
  return (
    <div className={`${s.box} border px-3.5 py-2.5 rounded-xl shadow-sm flex items-center justify-between gap-2`}>
      <div className="min-w-0">
        <span className={`text-[9px] font-semibold uppercase tracking-wider ${s.label} block leading-none`}>{label}</span>
        <p className={`text-base font-semibold ${s.value} mt-1 tabular-nums leading-none`}>{value}</p>
      </div>
      <div className="shrink-0">{icon}</div>
    </div>
  );
}

export default function RelatorioGerencial() {
  const { theme } = useWhiteLabel();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [label, setLabel] = useState('');
  const [ccFilter, setCcFilter] = useState(''); // centro de custo aplicado à página toda (KPIs, gráficos e relatórios)

  const load = async (range) => {
    setLabel(range.label);
    setLoading(true);
    try {
      setTransactions(await financeService.getTransactions({ startDate: range.start, endDate: range.end, basis: range.basis }) || []);
    } catch (e) { console.error(e); toast.error('Erro ao carregar relatório.'); }
    finally { setLoading(false); }
  };

  // Centros de custo presentes no período (opções do filtro da página).
  const ccOptions = useMemo(
    () => [...new Set(transactions.map(t => t.finance_cost_centers?.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [transactions]
  );
  const txs = useMemo(
    () => ccFilter ? transactions.filter(t => (t.finance_cost_centers?.name || '') === ccFilter) : transactions,
    [transactions, ccFilter]
  );

  const data = useMemo(() => {
    let inflow = 0, outflow = 0, pending = 0;
    const compareMap = {}, catMap = {};
    txs.forEach(t => {
      if (t.transfer_group_id) return; // transferência entre contas não é receita/despesa (fora dos KPIs e do gráfico)
      const amt = parseFloat(t.amount);
      // Cards por COMPETÊNCIA: considera o valor cheio do lançamento (pago ou não), igual
      // ao DRE e ao rodapé do relatório abaixo. O que ainda não foi pago vira "pendente".
      const paid = parseFloat(t.paid_amount) || 0;
      if (t.type === 'ENTRADA') inflow += amt; else outflow += amt;
      if (t.status !== 'PAGO') pending += (amt - paid);

      const day = String(t.transaction_date).slice(0, 10); // chave completa p/ ordenar cronologicamente
      if (!compareMap[day]) compareMap[day] = { day, Receitas: 0, Despesas: 0 };
      if (t.type === 'ENTRADA') compareMap[day].Receitas += amt; else compareMap[day].Despesas += amt;

      // Despesas por categoria (transferências fora — não são despesa)
      if (t.type === 'SAIDA' && !t.transfer_group_id) {
        const k = t.finance_categories?.name || 'Sem categoria';
        if (!catMap[k]) catMap[k] = { name: k, value: 0, color: t.finance_categories?.color };
        catMap[k].value += amt;
      }
    });
    const net = inflow - outflow;
    const margin = inflow > 0 ? (net / inflow) * 100 : 0;
    // Dia 01 à esquerda, dia 30 à direita (ordem cronológica crescente).
    const compare = Object.values(compareMap)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(({ day, ...r }) => ({ date: `${day.slice(8, 10)}/${day.slice(5, 7)}`, ...r }));
    const cats = Object.values(catMap).sort((a, b) => b.value - a.value);
    const rest = cats.slice(6).reduce((a, c) => a + c.value, 0);
    const categorias = rest > 0 ? [...cats.slice(0, 6), { name: 'Outras', value: rest, color: '#94a3b8' }] : cats.slice(0, 6);
    return { inflow, outflow, net, pending, margin, compare, categorias };
  }, [txs]);

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] bg-[#f5f5f7] font-sans text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
          <LayoutDashboard size={18} className="text-[#0071e3]" /> Relatório Gerencial <span className="text-slate-400">· {label}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52 sm:w-60">
            <SearchableSelect
              options={[{ value: '', label: 'Centro de custo: todos' }, ...ccOptions.map(cc => ({ value: cc, label: cc }))]}
              value={ccFilter} onChange={setCcFilter}
              placeholder="Centro de custo: todos" searchPlaceholder="Buscar centro de custo…" />
          </div>
          <FinancePeriodBar onChange={load} showBasis />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="text-[#0071e3] animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Kpi label="Receitas" value={fmt(data.inflow)} color="emerald" icon={<TrendingUp size={18} className="text-emerald-500" />} />
            <Kpi label="Despesas" value={fmt(data.outflow)} color="rose" icon={<TrendingDown size={18} className="text-rose-500" />} />
            <Kpi label="Resultado" value={fmt(data.net)} color="indigo" icon={<DollarSign size={18} className="text-[#0071e3]" />} />
            <Kpi label="Margem Líquida" value={`${data.margin.toFixed(1)}%`} color="amber" icon={<Percent size={18} className="text-amber-500" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-8 bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm flex flex-col h-[280px]">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Evolução Receitas vs Despesas</h3>
              <div className="flex-1 min-h-0">
                {data.compare.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.compare} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 10, fontWeight: 700 }} width={48}
                        tickFormatter={v => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR')}k` : v)} />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: '11px' }} />
                      <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900 }} />
                      <Area type="monotone" dataKey="Receitas" stroke="#10b981" strokeWidth={2.5} fill="url(#gR)" />
                      <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2.5} fill="url(#gD)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm flex flex-col h-[280px]">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Despesas por Categoria</h3>
              <div className="flex-1 min-h-0">
                {data.categorias.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.categorias} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                        {data.categorias.map((e, i) => <Cell key={i} fill={e.color || COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: '11px' }} formatter={(v) => fmt(v)} />
                      <Legend verticalAlign="bottom" height={44} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Gerador de relatórios: agrupamento por qualquer dimensão + todos os filtros */}
          <ReportBuilder
            transactions={txs}
            periodLabel={`${label}${ccFilter ? ` · CC: ${ccFilter}` : ''}`}
            theme={theme}
            userName={currentUser?.name || currentUser?.email || 'Usuário do Sistema'}
          />
        </>
      )}
    </div>
  );
}

function Empty() {
  return <div className="h-full flex items-center justify-center text-[11px] font-bold text-slate-400 uppercase">Sem dados no período</div>;
}
