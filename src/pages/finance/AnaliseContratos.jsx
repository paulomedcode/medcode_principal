import React, { useState, useEffect, useMemo } from 'react';
import { financeService } from '../../services/financeService';
import { FileSignature, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtC = (v) => { const n = Math.round(Number(v) || 0); return n === 0 ? '—' : n.toLocaleString('pt-BR'); };  // compacto p/ matriz
const emptyCell = () => ({ receita: 0, despesa: 0, repasse: 0, count: 0 });
const competenciaOf = (t) => (t.reference_month && /^\d{4}-\d{2}$/.test(t.reference_month)) ? t.reference_month : (t.transaction_date || '').slice(0, 7);

// Métricas disponíveis na matriz.
const METRICS = [
  ['resultado', 'Resultado', (c) => c.receita - c.despesa],
  ['receita', 'Receita', (c) => c.receita],
  ['despesa', 'Despesa', (c) => c.despesa],
  ['repasse', 'Repasse médico', (c) => c.repasse],
  ['margem', 'Margem %', (c) => c.receita > 0 ? ((c.receita - c.despesa) / c.receita) * 100 : null],
];

export default function AnaliseContratos() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [metric, setMetric] = useState('resultado');
  const [selected, setSelected] = useState(null); // chave do contrato selecionado p/ detalhe

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const [data, ccs] = await Promise.all([financeService.getContractAnalysis(year), financeService.getCostCenters()]);
      setTxs(data || []);
      setCostCenters(ccs || []);
    } catch (e) { console.error(e); toast.error('Erro ao carregar a análise de contratos.'); }
    finally { setLoading(false); }
  };

  // "5. Contratos" e seus filhos (cada filho é um contrato).
  const contractsParent = useMemo(
    () => costCenters.find(c => !c.parent_id && /contratos?$/i.test((c.name || '').trim())),
    [costCenters]
  );
  const contracts = useMemo(() => {
    if (!contractsParent) return [];
    return costCenters.filter(c => c.parent_id === contractsParent.id)
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
  }, [costCenters, contractsParent]);

  // Agrega por contrato × mês. Cada linha vira array[12] de células. 'OUTROS' = sem contrato.
  const agg = useMemo(() => {
    const ids = new Set(contracts.map(c => c.id));
    const map = {};
    const ensure = (k) => map[k] || (map[k] = Array.from({ length: 12 }, emptyCell));
    const doctorsBy = {}; // key -> { docName -> array[12] repasse }
    txs.forEach(t => {
      if (t.transfer_group_id) return;
      const comp = competenciaOf(t);
      const [cy, cm] = comp.split('-').map(Number);
      if (cy !== year || !cm || cm < 1 || cm > 12) return;
      const key = ids.has(t.cost_center_id) ? t.cost_center_id : 'OUTROS';
      const cell = ensure(key)[cm - 1];
      // Realizado: PAGO conta cheio, PARCIAL só a parte baixada, PENDENTE não entra
      // (senão receita/margem por contrato ficam infladas com o que ainda não aconteceu).
      const amt = t.status === 'PAGO' ? (parseFloat(t.amount) || 0)
        : t.status === 'PARCIAL' ? (parseFloat(t.paid_amount) || 0) : 0;
      if (amt <= 0) return;
      if (t.type === 'ENTRADA') cell.receita += amt;
      else {
        cell.despesa += amt;
        if (t.doctor_id) {
          cell.repasse += amt;
          const dn = t.users?.name || 'Sem nome';
          (doctorsBy[key] || (doctorsBy[key] = {}));
          (doctorsBy[key][dn] || (doctorsBy[key][dn] = Array.from({ length: 12 }, () => 0)));
          doctorsBy[key][dn][cm - 1] += amt;
        }
      }
      cell.count++;
    });
    return { map, doctorsBy };
  }, [txs, contracts, year]);

  // Linhas da matriz: contratos com dados + OUTROS (se houver).
  const rows = useMemo(() => {
    const out = contracts
      .filter(c => agg.map[c.id])
      .map(c => ({ key: c.id, name: c.name, cells: agg.map[c.id] }));
    if (agg.map['OUTROS']) out.push({ key: 'OUTROS', name: 'Sem contrato / Outros', cells: agg.map['OUTROS'] });
    return out;
  }, [contracts, agg]);

  const metricFn = METRICS.find(m => m[0] === metric)[2];
  const isMargem = metric === 'margem';

  // Total por mês (todas as linhas) e total geral.
  const monthTotals = useMemo(() => {
    const tot = Array.from({ length: 12 }, emptyCell);
    rows.forEach(r => r.cells.forEach((c, i) => {
      tot[i].receita += c.receita; tot[i].despesa += c.despesa; tot[i].repasse += c.repasse; tot[i].count += c.count;
    }));
    return tot;
  }, [rows]);
  const sumCells = (cells) => cells.reduce((a, c) => ({
    receita: a.receita + c.receita, despesa: a.despesa + c.despesa, repasse: a.repasse + c.repasse, count: a.count + c.count,
  }), emptyCell());

  const yearTotal = useMemo(() => sumCells(monthTotals), [monthTotals]);
  const cellVal = (cell) => metricFn(cell);
  const cellTxt = (cell) => isMargem
    ? (cellVal(cell) == null ? '—' : `${cellVal(cell).toFixed(0)}%`)
    : fmtC(cellVal(cell));
  const cellColor = (cell) => {
    const v = cellVal(cell);
    if (v == null || Math.abs(v) < (isMargem ? 0.5 : 0.5)) return 'text-slate-300';
    if (metric === 'despesa' || metric === 'repasse') return 'text-rose-600';
    return v >= 0 ? 'text-emerald-600' : 'text-rose-600';
  };

  const sel = selected ? rows.find(r => r.key === selected) : null;
  const selDoctors = selected ? (agg.doctorsBy[selected] || {}) : {};

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] bg-[#f5f5f7] font-sans text-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-base font-bold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
            <FileSignature size={18} className="text-[#0071e3]" /> Análise de Contratos
          </h1>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-0.5">Por contrato e competência (mês de referência)</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Ano */}
          <div className="flex items-center h-9 bg-white border border-black/[.085] rounded-lg shadow-sm overflow-hidden">
            <button onClick={() => setYear(y => y - 1)} className="px-2 h-full text-slate-400 hover:text-[#0071e3] hover:bg-slate-50"><ChevronLeft size={16} /></button>
            <div className="px-3 text-xs font-bold text-slate-700 tabular-nums">{year}</div>
            <button onClick={() => setYear(y => y + 1)} className="px-2 h-full text-slate-400 hover:text-[#0071e3] hover:bg-slate-50"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={28} className="text-[#0071e3] animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm py-20 px-6 text-center">
          <p className="text-sm font-bold text-slate-500">Sem lançamentos com contrato em {year}.</p>
          <p className="text-xs font-medium text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            Os contratos são os centros de custo do grupo “5. Contratos”. Na conciliação/lançamento, amarre cada movimento a um contrato e à competência (mês de referência) para aparecerem aqui.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs do ano */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <Kpi label={`Receita ${year}`} value={fmt(yearTotal.receita)} color="text-emerald-600" />
            <Kpi label="Despesa" value={fmt(yearTotal.despesa)} color="text-rose-600" />
            <Kpi label="Repasse médico" value={fmt(yearTotal.repasse)} color="text-rose-500" />
            <Kpi label="Resultado" value={fmt(yearTotal.receita - yearTotal.despesa)} color={yearTotal.receita - yearTotal.despesa >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
            <Kpi label="Margem" value={yearTotal.receita > 0 ? `${(((yearTotal.receita - yearTotal.despesa) / yearTotal.receita) * 100).toFixed(1)}%` : '—'} color="text-[#0071e3]" highlight />
          </div>

          {/* Seletor de métrica da matriz */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mr-1">Métrica:</span>
            {METRICS.map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)}
                className={`h-7 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${metric === k ? 'bg-[#0071e3] text-white shadow-sm' : 'bg-white border border-black/[.085] text-slate-500 hover:text-slate-800'}`}>{l}</button>
            ))}
          </div>

          {/* Matriz Contrato × Mês */}
          <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm overflow-hidden mb-3">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-right border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#f5f5f7] text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-b border-black/[.06]">
                    <th className="py-2.5 px-3 text-left sticky left-0 bg-[#f5f5f7] z-10 min-w-[180px]">Contrato</th>
                    {MONTHS.map(m => <th key={m} className="py-2.5 px-2 tabular-nums">{m}</th>)}
                    <th className="py-2.5 px-3 tabular-nums bg-slate-100/60">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.055]">
                  {rows.map(r => {
                    const rowTot = sumCells(r.cells);
                    const active = selected === r.key;
                    return (
                      <tr key={r.key} onClick={() => setSelected(active ? null : r.key)}
                        className={`cursor-pointer transition-colors ${active ? 'bg-indigo-50/50' : 'hover:bg-[#f5f5f7]'}`}>
                        <td className={`py-2 px-3 text-left font-semibold truncate max-w-[200px] sticky left-0 z-10 ${active ? 'bg-indigo-50/50' : 'bg-white'}`} title={r.name}>{r.name}</td>
                        {r.cells.map((c, i) => (
                          <td key={i} className={`py-2 px-2 tabular-nums font-medium ${cellColor(c)}`}>{cellTxt(c)}</td>
                        ))}
                        <td className={`py-2 px-3 tabular-nums font-bold bg-[#f5f5f7] ${cellColor(rowTot)}`}>{cellTxt(rowTot)}</td>
                      </tr>
                    );
                  })}
                  {/* Total geral por mês */}
                  <tr className="bg-slate-900 text-white font-bold border-t border-black/[.085]">
                    <td className="py-2.5 px-3 text-left uppercase text-[10px] tracking-wide sticky left-0 bg-slate-900 z-10">Total geral</td>
                    {monthTotals.map((c, i) => (
                      <td key={i} className="py-2.5 px-2 tabular-nums text-slate-100">{cellTxt(c)}</td>
                    ))}
                    <td className="py-2.5 px-3 tabular-nums text-white bg-slate-800">{cellTxt(yearTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-3 py-2 text-[10px] font-medium text-slate-400 border-t border-black/[.06]">
              Valores em R$ (sem centavos), por <b>competência</b> (mês de referência; cai na data do lançamento quando não preenchida). Clique num contrato para ver o detalhe. Transferências entre contas não entram.
            </p>
          </div>

          {/* Detalhe do contrato selecionado */}
          {sel && (
            <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/[.06] bg-slate-50/40">
                <h3 className="text-sm font-bold text-slate-800">{sel.name} <span className="text-slate-400 font-medium">· {year}</span></h3>
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:text-rose-500 bg-white rounded-lg shadow-sm"><X size={15} /></button>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-right border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#f5f5f7] text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-b border-black/[.06]">
                      <th className="py-2.5 px-3 text-left sticky left-0 bg-[#f5f5f7] min-w-[150px]">Indicador</th>
                      {MONTHS.map(m => <th key={m} className="py-2.5 px-2 tabular-nums">{m}</th>)}
                      <th className="py-2.5 px-3 tabular-nums bg-slate-100/60">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[.055]">
                    {[
                      ['Receita', (c) => c.receita, 'text-emerald-600'],
                      ['Despesa', (c) => c.despesa, 'text-rose-600'],
                      ['Repasse médico', (c) => c.repasse, 'text-rose-500'],
                      ['Resultado', (c) => c.receita - c.despesa, null],
                      ['Margem %', (c) => c.receita > 0 ? ((c.receita - c.despesa) / c.receita) * 100 : null, 'text-[#0071e3]', true],
                    ].map(([label, fn, color, pct]) => {
                      const tot = sumCells(sel.cells);
                      const totV = fn(tot);
                      return (
                        <tr key={label} className="hover:bg-[#f5f5f7]">
                          <td className="py-2 px-3 text-left font-semibold text-slate-600 sticky left-0 bg-white">{label}</td>
                          {sel.cells.map((c, i) => {
                            const v = fn(c);
                            const txt = pct ? (v == null ? '—' : `${v.toFixed(0)}%`) : fmtC(v);
                            const cl = color || (Number(v) >= 0 ? 'text-emerald-600' : 'text-rose-600');
                            return <td key={i} className={`py-2 px-2 tabular-nums font-medium ${v ? cl : 'text-slate-300'}`}>{txt}</td>;
                          })}
                          <td className={`py-2 px-3 tabular-nums font-bold bg-[#f5f5f7] ${color || (Number(totV) >= 0 ? 'text-emerald-600' : 'text-rose-600')}`}>
                            {pct ? (totV == null ? '—' : `${totV.toFixed(0)}%`) : fmtC(totV)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Repasses por médico no contrato */}
              {Object.keys(selDoctors).length > 0 && (
                <div className="border-t border-black/[.06]">
                  <div className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Repasses por médico</div>
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-right border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-slate-50/40 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-b border-black/[.06]">
                          <th className="py-2 px-3 text-left sticky left-0 bg-slate-50/40 min-w-[150px]">Médico</th>
                          {MONTHS.map(m => <th key={m} className="py-2 px-2 tabular-nums">{m}</th>)}
                          <th className="py-2 px-3 tabular-nums bg-slate-100/60">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[.055]">
                        {Object.entries(selDoctors).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0)).map(([name, arr]) => {
                          const tot = arr.reduce((a, b) => a + b, 0);
                          return (
                            <tr key={name} className="hover:bg-[#f5f5f7]">
                              <td className="py-1.5 px-3 text-left font-medium text-slate-600 truncate max-w-[180px] sticky left-0 bg-white" title={name}>{name}</td>
                              {arr.map((v, i) => <td key={i} className={`py-1.5 px-2 tabular-nums ${v ? 'text-rose-500' : 'text-slate-300'}`}>{fmtC(v)}</td>)}
                              <td className="py-1.5 px-3 tabular-nums font-bold text-rose-600 bg-[#f5f5f7]">{fmtC(tot)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, color, highlight }) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${highlight ? 'bg-slate-900 border-slate-900' : 'bg-white border-black/[.085]'}`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`text-base font-bold tabular-nums mt-1 ${highlight ? 'text-white' : color}`}>{value}</div>
    </div>
  );
}
