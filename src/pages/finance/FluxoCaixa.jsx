import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { financeService } from '../../services/financeService';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { TrendingUp, Loader2, Printer, Download, ChevronRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import FinancePeriodBar from '../../components/finance/FinancePeriodBar';
import SearchableSelect from '../../components/finance/SearchableSelect';
import { printReport } from '../../utils/printReport';
import { counterpartyName } from '../../utils/financeCounterparty';
import { paymentMethodLabel } from '../../components/finance/paymentMethods';
import { formatDateBR } from '../../utils/date';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { useAuth } from '../../contexts/AuthContext';

const MONTHS_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const pad = (n) => String(n).padStart(2, '0');
const toISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtShort = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
// Caixa real: cada linha aqui já é uma BAIXA (payment_date = quando o dinheiro
// de fato mexeu), então o valor da própria linha já é a parte efetivamente movimentada
// — sem precisar de tratamento especial para PARCIAL.
const signed = (t) => (t.type === 'ENTRADA' ? 1 : -1) * (parseFloat(t.amount) || 0);

export default function FluxoCaixa() {
  const { theme } = useWhiteLabel();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null); // dia/mês expandido (drill-down)
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');           // '' = todas
  const [range, setRange] = useState(() => {
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}`, label: '' };
  });
  const [rangeTxs, setRangeTxs] = useState([]);
  const [priorTxs, setPriorTxs] = useState([]);
  const [categories, setCategories] = useState([]);

  // Categorias de COMPETÊNCIA PURA (in_cash_flow=false): entram no DRE mas NÃO movem caixa.
  const noCashCatIds = useMemo(
    () => new Set(categories.filter(c => c.in_cash_flow === false).map(c => c.id)),
    [categories]
  );
  const movesCash = (t) => !(t.category_id && noCashCatIds.has(t.category_id));

  useEffect(() => {
    financeService.getAccounts().then(a => setAccounts(a || [])).catch(() => {});
    financeService.getCategories().then(c => setCategories(c || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range.start, range.end, accountId]);

  const load = async () => {
    setLoading(true);
    try {
      const filterAcc = accountId ? { accountId } : {};
      // Dia anterior ao início do período (para o saldo de abertura).
      const [sy, sm, sd] = range.start.split('-').map(Number);
      const prevStr = toISO(new Date(sy, sm - 1, sd - 1));
      // Fluxo de Caixa é dirigido pela data REAL da baixa (payment_date), não pela Data do
      // Lançamento — senão uma baixa retroativa (ex.: baixada hoje, "paga em" 31/08) não
      // aparece no dia em que o dinheiro realmente mexeu.
      const [prior, inRange] = await Promise.all([
        financeService.getPaymentsInRange({ ...filterAcc, endDate: prevStr }),
        financeService.getPaymentsInRange({ ...filterAcc, startDate: range.start, endDate: range.end }),
      ]);
      setPriorTxs(prior || []);
      setRangeTxs(inRange || []);
    } catch (e) { console.error(e); toast.error('Erro ao carregar o fluxo de caixa.'); }
    finally { setLoading(false); }
  };

  // Saldo inicial das contas (reativo a accounts/accountId — antes ficava 0 na 1ª carga,
  // porque load() lia `accounts` do closure antes de elas chegarem).
  const baseInitial = useMemo(() => {
    const accs = accountId ? accounts.filter(a => a.id === accountId) : accounts;
    return accs.reduce((acc, a) => acc + parseFloat(a.initial_balance || 0), 0);
  }, [accounts, accountId]);

  // Saldo de abertura = saldo inicial das contas + tudo pago antes do período (exceto competência pura).
  const opening = useMemo(
    () => baseInitial + priorTxs.filter(movesCash).reduce((acc, t) => acc + signed(t), 0),
    [baseInitial, priorTxs, noCashCatIds]   // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Série do período: balde por DIA (período curto) ou por MÊS (período longo, ex.: semestre).
  const series = useMemo(() => {
    if (!range.start || !range.end) return { rows: [], granularity: 'day' };
    const [sy, sm, sd] = range.start.split('-').map(Number);
    const [ey, em, ed] = range.end.split('-').map(Number);
    const startDt = new Date(sy, sm - 1, sd);
    const endDt = new Date(ey, em - 1, ed);
    const dayCount = Math.round((endDt - startDt) / 86400000) + 1;
    const granularity = dayCount <= 62 ? 'day' : 'month';

    const buckets = new Map();
    const keys = [];
    if (granularity === 'day') {
      for (let dt = new Date(startDt); dt <= endDt; dt.setDate(dt.getDate() + 1)) {
        const key = toISO(dt);
        keys.push(key);
        buckets.set(key, { rec: 0, pag: 0, tin: 0, tout: 0, label: `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}` });
      }
    } else {
      const cur = new Date(sy, sm - 1, 1);
      const endMonth = new Date(ey, em - 1, 1);
      while (cur <= endMonth) {
        const key = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`;
        keys.push(key);
        buckets.set(key, { rec: 0, pag: 0, tin: 0, tout: 0, label: `${MONTHS_ABBR[cur.getMonth()]}/${String(cur.getFullYear()).slice(2)}` });
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    rangeTxs.forEach(t => {
      if (!movesCash(t)) return;
      const dstr = t.payment_date || '';
      const key = granularity === 'day' ? dstr.slice(0, 10) : dstr.slice(0, 7);
      const b = buckets.get(key);
      if (!b) return;
      const amt = parseFloat(t.amount || 0);
      const isT = !!t.transfer_group_id;
      if (t.type === 'ENTRADA') { if (isT) b.tin += amt; else b.rec += amt; }
      else { if (isT) b.tout += amt; else b.pag += amt; }
    });

    let acc = opening;
    const rows = keys.map(key => {
      const b = buckets.get(key);
      acc += b.rec - b.pag + b.tin - b.tout;
      return {
        label: b.label, recebimentos: b.rec, pagamentos: b.pag, transfIn: b.tin, transfOut: b.tout,
        pagBar: -b.pag, transfOutBar: -b.tout, saldo: acc,
      };
    });
    return { rows, granularity };
  }, [rangeTxs, opening, range.start, range.end, noCashCatIds]);   // eslint-disable-line react-hooks/exhaustive-deps

  const rows = series.rows;
  const totals = useMemo(() => ({
    rec: rows.reduce((a, d) => a + d.recebimentos, 0),
    pag: rows.reduce((a, d) => a + d.pagamentos, 0),
    saldoFinal: rows.length ? rows[rows.length - 1].saldo : opening,
  }), [rows, opening]);

  // Lançamentos por dia/mês (para o drill-down), já ordenados por valor.
  const detailByLabel = useMemo(() => {
    const map = new Map();
    rangeTxs.forEach(t => {
      if (!movesCash(t)) return;
      const dstr = (t.payment_date || '').slice(0, 10);
      if (!dstr) return;
      const [y, m, d] = dstr.split('-');
      const label = series.granularity === 'day' ? `${d}/${m}` : `${MONTHS_ABBR[Number(m) - 1]}/${String(y).slice(2)}`;
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    });
    for (const arr of map.values()) arr.sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0));
    return map;
  }, [rangeTxs, series.granularity, noCashCatIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Maiores contrapartes do período (agrega por Origem/Destino), separadas por tipo.
  const topLists = useMemo(() => {
    const pays = new Map(), recs = new Map();
    rangeTxs.forEach(t => {
      if (!movesCash(t) || t.transfer_group_id) return;
      const name = counterpartyName(t) || t.description || '—';
      const amt = parseFloat(t.amount) || 0;
      const target = t.type === 'ENTRADA' ? recs : pays;
      target.set(name, (target.get(name) || 0) + amt);
    });
    const top = (m) => [...m.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 6);
    return { pays: top(pays), recs: top(recs) };
  }, [rangeTxs, noCashCatIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodLabel = (range.start || range.end)
    ? `${range.start ? formatDateBR(range.start) : '...'} a ${range.end ? formatDateBR(range.end) : '...'}`
    : 'Todos os Períodos';

  const handlePrint = () => {
    if (!rows.length) return toast.error('Nada para imprimir neste período.');
    printReport({
      theme,
      title: 'Fluxo de Caixa',
      periodText: periodLabel,
      userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema',
      orientation: 'portrait',
      columns: [
        { header: series.granularity === 'month' ? 'Mês' : 'Data' },
        { header: 'Recebimentos', align: 'right' }, { header: 'Pagamentos', align: 'right' },
        { header: 'Transf. entrada', align: 'right' }, { header: 'Transf. saída', align: 'right' },
        { header: 'Saldo Final', align: 'right' },
      ],
      rows: rows.map(d => [
        d.label, fmtShort(d.recebimentos), fmtShort(d.pagamentos),
        fmtShort(d.transfIn), fmtShort(d.transfOut), fmtShort(d.saldo),
      ]),
      summary: [
        { label: 'Saldo de abertura', value: fmt(opening) },
        { label: 'Recebimentos no período', value: fmt(totals.rec) },
        { label: 'Pagamentos no período', value: fmt(totals.pag) },
        { label: 'Saldo final', value: fmt(totals.saldoFinal) },
      ],
      totalLabel: series.granularity === 'month' ? 'Total de Meses' : 'Total de Dias',
    });
  };

  const handleExport = () => {
    if (!rangeTxs.length && !rows.length) return toast.error('Nada para exportar neste período.');
    const wb = XLSX.utils.book_new();
    const agg = rows.map(d => ({
      [series.granularity === 'month' ? 'Mês' : 'Data']: d.label,
      'Recebimentos': d.recebimentos, 'Pagamentos': d.pagamentos,
      'Transf. Entrada': d.transfIn, 'Transf. Saída': d.transfOut, 'Saldo Final': d.saldo,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agg), 'Fluxo');
    const detail = rangeTxs
      .filter(movesCash)
      .sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''))
      .map(t => ({
        'Data': formatDateBR(t.payment_date),
        'Origem/Destino': counterpartyName(t) || '',
        'Descrição': t.description || '',
        'Categoria': t.finance_categories?.name || '',
        'Método': paymentMethodLabel(t.payment_method),
        'Tipo': t.type === 'ENTRADA' ? 'Recebimento' : 'Pagamento',
        'Valor': Number(t.amount) || 0,
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Detalhe');
    XLSX.writeFile(wb, `fluxo_caixa_${(range.start || '').replace(/-/g, '')}.xlsx`);
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    return (
      <div className="bg-slate-800 text-white rounded-xl px-3 py-2 shadow-xl text-[11px] font-semibold">
        <div className="font-semibold mb-1">{label}</div>
        <div className="text-emerald-300">Recebimentos: {fmtShort(row.recebimentos)}</div>
        <div className="text-rose-300">Pagamentos: -{fmtShort(row.pagamentos)}</div>
        {(row.transfIn > 0 || row.transfOut > 0) && (
          <>
            <div className="text-green-200">Transf. entrada: {fmtShort(row.transfIn)}</div>
            <div className="text-rose-200">Transf. saída: -{fmtShort(row.transfOut)}</div>
          </>
        )}
        {(() => {
          const net = row.recebimentos - row.pagamentos + row.transfIn - row.transfOut;
          return (
            <div className="mt-1 pt-1 border-t border-white/15">
              <div className={net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>Variação do dia: {net >= 0 ? '+ ' : '− '}{fmtShort(Math.abs(net))}</div>
              <div className="text-slate-200">Saldo final: {fmtShort(row.saldo)}</div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] bg-[#f5f5f7] font-sans text-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight flex items-center gap-2">
          <TrendingUp size={17} className="text-slate-400" /> Fluxo de Caixa
          {series.granularity === 'month' && <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">· agrupado por mês</span>}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <FinancePeriodBar onChange={setRange} />
          <div className="w-44">
            <SearchableSelect
              options={[{ value: '', label: 'Todas as contas' }, ...accounts.map(a => ({ value: a.id, label: a.name }))]}
              value={accountId} onChange={setAccountId}
              placeholder="Todas as contas" searchPlaceholder="Buscar conta…" />
          </div>
          <button onClick={handlePrint} title="Imprimir o fluxo do período"
            className="h-9 px-3 bg-white hover:bg-slate-50 border border-black/[.085] text-slate-600 rounded-lg font-semibold text-[10px] uppercase tracking-wide shadow-sm flex items-center gap-1.5 transition-all">
            <Printer size={14} /> Imprimir
          </button>
          <button onClick={handleExport} title="Exportar o fluxo e o detalhe para Excel"
            className="h-9 px-3 bg-white hover:bg-slate-50 border border-black/[.085] text-slate-600 rounded-lg font-semibold text-[10px] uppercase tracking-wide shadow-sm flex items-center gap-1.5 transition-all">
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi label="Saldo de abertura" value={fmt(opening)} color={opening < 0 ? 'text-rose-600' : 'text-slate-700'} />
        <Kpi label="Recebimentos no período" value={fmt(totals.rec)} color="text-emerald-600" />
        <Kpi label="Pagamentos no período" value={fmt(totals.pag)} color="text-rose-600" />
        <Kpi label="Saldo final" value={fmt(totals.saldoFinal)} color={totals.saldoFinal < 0 ? 'text-rose-600' : 'text-indigo-700'} highlight />
      </div>

      {/* Gráfico */}
      <div className="bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm h-[480px] mb-3">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 size={28} className="text-[#0071e3] animate-spin" /></div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} interval={rows.length <= 31 ? 0 : 'preserveStartEnd'} />
              <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={46} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 800 }} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
              <Bar dataKey="recebimentos" name="Recebimentos" stackId="in" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="transfIn" name="Transferências de entrada" stackId="in" fill="#15803d" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="pagBar" name="Pagamentos" stackId="out" fill="#f43f5e" radius={[0, 0, 3, 3]} maxBarSize={22} />
              <Bar dataKey="transfOutBar" name="Transferências de saída" stackId="out" fill="#9f1239" radius={[0, 0, 3, 3]} maxBarSize={22} />
              <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#1e293b" strokeWidth={2.5} dot={{ r: 2, fill: '#1e293b' }} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Maiores contrapartes do período (aproveita o espaço abaixo do gráfico) */}
      {!loading && (topLists.pays.length || topLists.recs.length) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <TopCard title="Maiores pagamentos do período" icon={<ArrowUpRight size={14} className="text-rose-600" />}
            items={topLists.pays} tone="rose" empty="Sem pagamentos no período." />
          <TopCard title="Maiores recebimentos do período" icon={<ArrowDownLeft size={14} className="text-emerald-600" />}
            items={topLists.recs} tone="emerald" empty="Sem recebimentos no período." />
        </div>
      ) : null}

      {/* Tabela diária com drill-down (clique no dia para ver quem foi pago/recebeu) */}
      <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 text-[11px] font-medium text-slate-400 border-b border-black/[.06]">
                <th className="py-2.5 px-4">{series.granularity === 'month' ? 'Mês' : 'Data'}</th>
                <th className="py-2.5 px-3 text-right">Recebimentos</th>
                <th className="py-2.5 px-3 text-right">Pagamentos</th>
                <th className="py-2.5 px-3 text-right">Transf. (entrada)</th>
                <th className="py-2.5 px-3 text-right">Transf. (saída)</th>
                <th className="py-2.5 px-3 text-right">Variação</th>
                <th className="py-2.5 px-3 text-right">Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.055]">
              {rows.map(d => {
                const hasMov = d.recebimentos !== 0 || d.pagamentos !== 0 || d.transfIn !== 0 || d.transfOut !== 0;
                const variacao = (d.recebimentos || 0) - (d.pagamentos || 0) + (d.transfIn || 0) - (d.transfOut || 0);
                const dayTxs = detailByLabel.get(d.label) || [];
                const isOpen = expandedKey === d.label;
                return (
                  <React.Fragment key={d.label}>
                    <tr
                      className={`text-xs ${hasMov ? 'cursor-pointer' : 'text-slate-400'} ${isOpen ? 'bg-indigo-50/50' : 'hover:bg-[#f5f5f7]'} transition-colors`}
                      onClick={() => hasMov && setExpandedKey(isOpen ? null : d.label)}
                    >
                      <td className="py-2 px-4 font-bold text-slate-600 tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {hasMov && <ChevronRight size={13} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
                          {d.label}
                          {hasMov && <span className="text-[9px] font-bold text-slate-300 normal-case">({dayTxs.length})</span>}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-600">{d.recebimentos ? fmtShort(d.recebimentos) : '0,00'}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-600">{d.pagamentos ? fmtShort(d.pagamentos) : '0,00'}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-green-700">{d.transfIn ? fmtShort(d.transfIn) : '0,00'}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-800">{d.transfOut ? fmtShort(d.transfOut) : '0,00'}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-bold ${variacao > 0 ? 'text-emerald-600' : variacao < 0 ? 'text-rose-600' : 'text-slate-300'}`}>{variacao ? `${variacao > 0 ? '+' : '−'} ${fmtShort(Math.abs(variacao))}` : '0,00'}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-semibold ${d.saldo < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmtShort(d.saldo)}</td>
                    </tr>
                    {isOpen && dayTxs.length > 0 && (
                      <tr>
                        <td colSpan={7} className="p-0 bg-slate-50/40">
                          <div className="px-4 py-2 divide-y divide-black/[.055]">
                            {dayTxs.map(t => (
                              <div key={t.id} className="flex items-center gap-3 py-1.5 text-[11px]">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.type === 'ENTRADA' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className="font-bold text-slate-700 truncate min-w-0 flex-1" title={counterpartyName(t) || t.description}>
                                  {counterpartyName(t) || t.description || '—'}
                                </span>
                                {t.finance_categories?.name && (
                                  <span className="hidden sm:inline text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{t.finance_categories.name}</span>
                                )}
                                <span className="text-slate-400 shrink-0 hidden md:inline">{paymentMethodLabel(t.payment_method)}</span>
                                <span className={`font-semibold tabular-nums shrink-0 w-28 text-right ${t.type === 'ENTRADA' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {t.type === 'ENTRADA' ? '+' : '−'} {fmtShort(t.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TopCard({ title, icon, items, tone, empty }) {
  const max = items.reduce((m, i) => Math.max(m, i.total), 0) || 1;
  const bar = tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500';
  const txt = tone === 'emerald' ? 'text-emerald-600' : 'text-rose-600';
  return (
    <div className="bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-3">
        {icon}
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] font-bold text-slate-400 py-6 text-center uppercase">{empty}</div>
      ) : (
        <div className="space-y-2">
          {items.map((i, idx) => (
            <div key={i.name + idx}>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px] font-bold text-slate-700 truncate min-w-0" title={i.name}>{i.name}</span>
                <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${txt}`}>R$ {fmtShort(i.total)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(4, (i.total / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color, highlight }) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${highlight ? 'bg-slate-900 border-slate-900' : 'bg-white border-black/[.085]'}`}>
      <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${highlight ? 'text-white' : color}`}>{value}</div>
    </div>
  );
}
