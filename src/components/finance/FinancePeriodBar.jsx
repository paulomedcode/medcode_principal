import React, { useState, useEffect, useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Avança (dir=1) ou volta (dir=-1) o período conforme o modo atual.
function shiftPeriod(p, dir) {
  if (p.mode === 'day') {
    const [y, m, d] = p.day.split('-').map(Number);
    const dt = new Date(y, m - 1, d + dir);
    const day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return { ...p, day };
  }
  if (p.mode === 'month') {
    const [y, m] = p.month.split('-').map(Number);
    const dt = new Date(y, m - 1 + dir, 1);
    const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    return { ...p, month };
  }
  if (p.mode === 'year') return { ...p, year: p.year + dir };
  const [sy, sm, sd] = p.start.split('-').map(Number);
  const [ey, em, ed] = p.end.split('-').map(Number);
  const startDt = new Date(sy, sm - 1, sd);
  const endDt = new Date(ey, em - 1, ed);
  const days = Math.round((endDt - startDt) / 86400000) + 1;
  const ns = new Date(sy, sm - 1, sd + dir * days);
  const ne = new Date(ey, em - 1, ed + dir * days);
  const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return { ...p, start: fmt(ns), end: fmt(ne) };
}

function rangeFromPeriod(p) {
  if (p.mode === 'day') return { start: p.day, end: p.day };
  if (p.mode === 'month') {
    const [y, m] = p.month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { start: `${p.month}-01`, end: `${p.month}-${String(last).padStart(2, '0')}` };
  }
  if (p.mode === 'year') return { start: `${p.year}-01-01`, end: `${p.year}-12-31` };
  return { start: p.start, end: p.end };
}

function periodLabel(p) {
  if (p.mode === 'day') { const [y, m, d] = p.day.split('-'); return `${d}/${m}/${y.slice(2)}`; }
  if (p.mode === 'month') { const [y, m] = p.month.split('-').map(Number); return `${MONTHS_ABBR[m - 1]} ${String(y).slice(2)}`; }
  if (p.mode === 'year') return String(p.year);
  const f = (s) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
  return `${f(p.start)} a ${f(p.end)}`;
}

// Seletor Dia / Mês / Período. Chama onChange({start,end,label,basis}) sempre que muda (e na montagem).
// showBasis: exibe o toggle Data × Competência — basis 'date' filtra pela data do lançamento,
// 'reference' pelo mês de referência (lançamentos sem competência entram pela data).
export default function FinancePeriodBar({ onChange, showBasis = false }) {
  // Onde há o toggle, COMPETÊNCIA é o padrão — é assim que o usuário analisa.
  const [basis, setBasis] = useState(showBasis ? 'reference' : 'date');
  const [period, setPeriod] = useState(() => {
    const t = new Date();
    const ym = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const today = `${ym}-${String(t.getDate()).padStart(2, '0')}`; // horário local (evita salto de dia do toISOString/UTC)
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return { mode: 'month', day: today, month: ym, year: t.getFullYear(), start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, '0')}` };
  });

  const range = useMemo(() => rangeFromPeriod(period), [period]);

  useEffect(() => {
    onChange({ ...range, basis, label: periodLabel(period) + (basis === 'reference' ? ' · competência' : '') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, basis]);

  // Controle segmentado estilo macOS: aba ativa = "pílula" branca com sombra sutil.
  const segBtn = (active, onClick, label, title) => (
    <button onClick={onClick} title={title}
      className={`px-2.5 py-1 rounded-[6px] text-[10.5px] transition-all ${active ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,.12)] font-semibold' : 'text-[#86868b] hover:text-[#1d1d1f] font-medium'}`}>
      {label}
    </button>
  );
  const modeBtn = (mode, label) => segBtn(period.mode === mode, () => setPeriod({ ...period, mode }), label);

  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 px-2 py-1.5 md:py-0 bg-white border border-black/[.085] rounded-lg md:h-9 shadow-[0_1px_2px_rgba(0,0,0,.04)] w-full md:w-fit">
      <CalendarDays size={14} className="text-[#86868b] hidden md:block" />
      <div className="flex items-center gap-0.5 bg-black/[.045] rounded-[8px] p-0.5">
        {modeBtn('day', 'Dia')}{modeBtn('month', 'Mês')}{modeBtn('year', 'Ano')}{modeBtn('range', 'Período')}
      </div>
      <div className="h-5 w-px bg-black/[.085] hidden md:block" />
      <button onClick={() => setPeriod(shiftPeriod(period, -1))} title="Anterior"
        className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors">
        <ChevronLeft size={15} />
      </button>
      {period.mode === 'day' && (
        <input type="date" value={period.day} onChange={e => setPeriod({ ...period, day: e.target.value })}
          className="bg-transparent text-[11.5px] font-medium text-[#1d1d1f] outline-none cursor-pointer tabular-nums" />
      )}
      {period.mode === 'month' && (
        <input type="month" value={period.month} onChange={e => setPeriod({ ...period, month: e.target.value })}
          className="bg-transparent text-[11.5px] font-medium text-[#1d1d1f] outline-none cursor-pointer" />
      )}
      {period.mode === 'year' && (
        <input type="number" min="2000" max="2100" value={period.year}
          onChange={e => setPeriod({ ...period, year: parseInt(e.target.value) || period.year })}
          className="bg-transparent text-[11.5px] font-medium text-[#1d1d1f] outline-none cursor-pointer w-[52px] text-center tabular-nums" />
      )}
      {period.mode === 'range' && (
        <div className="flex items-center gap-1">
          <input type="date" value={period.start} onChange={e => setPeriod({ ...period, start: e.target.value })}
            className="bg-transparent text-[10.5px] font-medium text-[#1d1d1f] outline-none w-[88px] cursor-pointer tabular-nums" />
          <span className="text-[9.5px] text-[#86868b]">até</span>
          <input type="date" value={period.end} onChange={e => setPeriod({ ...period, end: e.target.value })}
            className="bg-transparent text-[10.5px] font-medium text-[#1d1d1f] outline-none w-[88px] cursor-pointer tabular-nums" />
        </div>
      )}
      <button onClick={() => setPeriod(shiftPeriod(period, 1))} title="Próximo"
        className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors">
        <ChevronRight size={15} />
      </button>
      {showBasis && (
        <>
          <div className="h-5 w-px bg-black/[.085] hidden md:block" />
          <div className="flex items-center gap-0.5 bg-black/[.045] rounded-[8px] p-0.5">
            {segBtn(basis === 'date', () => setBasis('date'), 'Data', 'Filtra pela data do lançamento (regime de caixa)')}
            {segBtn(basis === 'reference', () => setBasis('reference'), 'Competência', 'Filtra pelo mês de referência (competência); lançamentos sem competência entram pela data')}
          </div>
        </>
      )}
    </div>
  );
}
