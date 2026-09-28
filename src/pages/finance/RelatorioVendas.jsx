import React, { useState, useMemo } from 'react';
import { financeService } from '../../services/financeService';
import FinancePeriodBar from '../../components/finance/FinancePeriodBar';
import { ShoppingCart, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const STATUS = {
  PENDENTE: { label: 'Pendente', cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  APROVADO: { label: 'Aprovado', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  RECUSADO: { label: 'Recusado', cls: 'bg-rose-50 text-rose-600 border-rose-100' }
};

export default function RelatorioVendas() {
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [range, setRange] = useState(null);
  const [label, setLabel] = useState('');

  const load = async (r) => {
    setRange(r); setLabel(r.label);
    setLoading(true);
    try { setQuotes(await financeService.getQuotes() || []); }
    catch (e) { console.error(e); toast.error('Erro ao carregar vendas.'); }
    finally { setLoading(false); }
  };

  // Filtra orçamentos cuja data de emissão cai no período.
  const rows = useMemo(() => {
    if (!range) return [];
    return quotes.filter(q => {
      const d = q.issue_date || (q.created_at || '').split('T')[0];
      return d && d >= range.start && d <= range.end;
    });
  }, [quotes, range]);

  const kpis = useMemo(() => {
    let orcado = 0, aprovado = 0, pendente = 0, recusado = 0, aprovCount = 0;
    rows.forEach(q => {
      const v = parseFloat(q.total_amount) || 0;
      orcado += v;
      if (q.status === 'APROVADO') { aprovado += v; aprovCount++; }
      else if (q.status === 'RECUSADO') recusado += v;
      else pendente += v;
    });
    const conv = rows.length ? (aprovCount / rows.length) * 100 : 0;
    return { orcado, aprovado, pendente, recusado, conv, count: rows.length };
  }, [rows]);

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] bg-[#f5f5f7] font-sans text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
          <ShoppingCart size={18} className="text-[#0071e3]" /> Relatório de Vendas <span className="text-slate-400">· {label}</span>
        </h1>
        <FinancePeriodBar onChange={load} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="text-[#0071e3] animate-spin" /></div>
      ) : (
        <>
          <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm flex items-stretch divide-x divide-black/[.055] mb-3 overflow-hidden">
            {[
              { l: 'Orçado', v: fmt(kpis.orcado), c: 'text-slate-700' },
              { l: 'Aprovado', v: fmt(kpis.aprovado), c: 'text-emerald-600' },
              { l: 'Pendente', v: fmt(kpis.pendente), c: 'text-amber-600' },
              { l: 'Recusado', v: fmt(kpis.recusado), c: 'text-rose-600' },
              { l: 'Conversão', v: `${kpis.conv.toFixed(0)}%`, c: 'text-[#0071e3]' }
            ].map(k => (
              <div key={k.l} className="flex-1 px-4 py-2.5 text-center border-r border-black/[.06] last:border-0">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k.l}</div>
                <div className={`text-base font-semibold tabular-nums mt-0.5 ${k.c}`}>{k.v}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 text-[9px] font-semibold text-slate-400 uppercase tracking-widest border-b border-black/[.06]">
                    <th className="py-2.5 px-4">Emissão</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Descrição</th>
                    <th className="py-2.5 px-3 text-right">Total (R$)</th>
                    <th className="py-2.5 px-3">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.055]">
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-[11px] font-bold text-slate-400 uppercase">Nenhuma venda no período</td></tr>
                  ) : rows.map(q => {
                    const st = STATUS[q.status] || STATUS.PENDENTE;
                    return (
                      <tr key={q.id} className="hover:bg-[#f5f5f7] transition-colors text-xs">
                        <td className="py-2.5 px-4 font-bold text-slate-700 tabular-nums whitespace-nowrap">{fmtDate(q.issue_date || (q.created_at || '').split('T')[0])}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-700">{q.finance_parties?.name || '—'}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-500">{q.title || '—'}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">{fmt(q.total_amount)}</td>
                        <td className="py-2.5 px-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border ${st.cls}`}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
