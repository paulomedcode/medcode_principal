import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

// ============================================================================
// Seletor de PERÍODO DE VENCIMENTO das contas a pagar / a receber.
// Substitui o navegador que só andava de mês em mês: além do mês, dá para pedir
// "hoje", "amanhã", "próxima semana", "próximos 30 dias", uma data específica
// ou um intervalo livre — e o que estiver escolhido é o que vai para a impressão.
// ============================================================================

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const pad = (n) => String(n).padStart(2, '0');
// Sempre no fuso local — toISOString() jogaria o dia para trás à noite.
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayShort = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const dayLong = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
// Semana começa na segunda (padrão brasileiro).
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const monthRange = (y, m) => ({ start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` });

// Atalhos prontos. `openStart` marca o período que não tem início real
// (vencidos) — nele o texto vira "até <data>" em vez de um intervalo.
function buildPresets(base = new Date()) {
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const t = iso(today);
  const mon = mondayOf(today);
  const nextMon = addDays(mon, 7);
  const P = (key, label, start, end, extra) => ({ key, label, start, end, ...extra });
  const mThis = monthRange(today.getFullYear(), today.getMonth());
  const mNext = monthRange(today.getFullYear(), today.getMonth() + 1);
  const mPrev = monthRange(today.getFullYear(), today.getMonth() - 1);
  return [
    P('today', 'Hoje', t, t),
    P('tomorrow', 'Amanhã', iso(addDays(today, 1)), iso(addDays(today, 1))),
    P('next7', 'Próximos 7 dias', t, iso(addDays(today, 6))),
    P('next15', 'Próximos 15 dias', t, iso(addDays(today, 14))),
    P('next30', 'Próximos 30 dias', t, iso(addDays(today, 29))),
    P('thisWeek', 'Esta semana', iso(mon), iso(addDays(mon, 6))),
    P('nextWeek', 'Próxima semana', iso(nextMon), iso(addDays(nextMon, 6))),
    P('thisMonth', 'Este mês', mThis.start, mThis.end, { asMonth: true }),
    P('nextMonth', 'Próximo mês', mNext.start, mNext.end, { asMonth: true }),
    P('lastMonth', 'Mês passado', mPrev.start, mPrev.end, { asMonth: true }),
    P('overdue', 'Vencidos (até ontem)', '2000-01-01', iso(addDays(today, -1)), { openStart: true }),
    P('thisYear', 'Este ano', `${today.getFullYear()}-01-01`, `${today.getFullYear()}-12-31`),
  ];
}

const shortRange = (p) => p.openStart ? `até ${dayShort(p.end)}`
  : p.start === p.end ? dayShort(p.start) : `${dayShort(p.start)} – ${dayShort(p.end)}`;
const longRange = (p) => p.openStart ? `até ${dayLong(p.end)}`
  : p.start === p.end ? dayLong(p.start) : `${dayLong(p.start)} a ${dayLong(p.end)}`;

// Rótulo do período quando ele não veio de um atalho nomeado.
function labelOf(p) {
  if (p.key === 'month') { const [y, m] = p.start.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; }
  if (p.start === p.end) return dayLong(p.start);
  return `${dayShort(p.start)} a ${dayShort(p.end)}`;
}

export default function DuePeriodPicker({ onChange, initialKey = 'thisMonth' }) {
  const presets = useMemo(() => buildPresets(), []);
  const [period, setPeriod] = useState(() => {
    const p = presets.find(x => x.key === initialKey) || presets.find(x => x.key === 'thisMonth');
    // Mês entra no modo 'month' para as setas continuarem andando de mês em mês.
    return p.asMonth
      ? { key: 'month', start: p.start, end: p.end, name: null }
      : { key: p.key, start: p.start, end: p.end, name: p.label, openStart: p.openStart };
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ start: period.start, end: period.end });
  const boxRef = useRef(null);

  const title = period.name || labelOf(period);
  const sub = period.name ? shortRange(period) : null;

  useEffect(() => {
    const text = period.name ? `${period.name} · ${longRange(period)}`
      : period.key === 'month' ? labelOf(period) : longRange(period);
    onChange({ start: period.start, end: period.end, label: title, text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start, period.end, period.key]);

  // Fecha ao clicar fora / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => { setDraft({ start: period.start, end: period.end }); }, [period.start, period.end]);

  // Setas: no modo mês anda mês a mês; nos demais desloca o intervalo pelo próprio tamanho.
  const shift = (dir) => setPeriod(p => {
    if (p.key === 'month') {
      const [y, m] = p.start.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      return { key: 'month', ...monthRange(d.getFullYear(), d.getMonth()), name: null };
    }
    // "Vencidos" não desliza (não tem início): vira o dia anterior/seguinte ao fim.
    const from = p.openStart ? p.end : p.start;
    const days = Math.round((parseISO(p.end) - parseISO(from)) / 86400000) + 1;
    const start = iso(addDays(parseISO(from), dir * days));
    const end = iso(addDays(parseISO(p.end), dir * days));
    return { key: start === end ? 'day' : 'range', start, end, name: null };
  });

  const pick = (p) => {
    setPeriod(p.asMonth
      ? { key: 'month', start: p.start, end: p.end, name: null }
      : { key: p.key, start: p.start, end: p.end, name: p.label, openStart: p.openStart });
    setOpen(false);
  };

  const setMonth = (ym) => {
    if (!/^\d{4}-\d{2}$/.test(ym || '')) return;
    const [y, m] = ym.split('-').map(Number);
    setPeriod({ key: 'month', ...monthRange(y, m - 1), name: null });
  };
  const setDay = (d) => { if (d) { setPeriod({ key: 'day', start: d, end: d, name: null }); setOpen(false); } };
  const applyRange = () => {
    if (!draft.start || !draft.end) return;
    const [start, end] = draft.start <= draft.end ? [draft.start, draft.end] : [draft.end, draft.start];
    setPeriod({ key: start === end ? 'day' : 'range', start, end, name: null });
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center bg-white border border-black/[.085] rounded-lg h-9 shadow-[0_1px_2px_rgba(0,0,0,.04)] overflow-hidden">
        <button onClick={() => shift(-1)} title="Período anterior"
          className="px-2 h-full text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors"><ChevronLeft size={16} /></button>
        <button onClick={() => setOpen(o => !o)} title="Escolher o período de vencimento"
          className={`h-full px-2.5 flex items-center gap-1.5 hover:bg-black/[.04] transition-colors ${open ? 'bg-black/[.04]' : ''}`}>
          <CalendarDays size={14} className="text-[#86868b]" />
          <span className="flex flex-col items-start leading-none">
            <span className="text-[11.5px] font-medium text-[#1d1d1f] tabular-nums">{title}</span>
            {sub && <span className="text-[9px] text-[#86868b] tabular-nums mt-0.5">{sub}</span>}
          </span>
          <ChevronDown size={13} className={`text-[#86868b] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={() => shift(1)} title="Próximo período"
          className="px-2 h-full text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors"><ChevronRight size={16} /></button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1.5 left-0 w-[430px] max-w-[92vw] bg-white border border-black/[.085] rounded-xl shadow-[0_8px_28px_rgba(0,0,0,.14)] p-3 flex gap-3">
          <div className="w-[196px] shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#86868b] px-1 mb-1.5">Atalhos</div>
            <div className="flex flex-col gap-px max-h-[340px] overflow-y-auto">
              {presets.map(p => {
                const active = period.start === p.start && period.end === p.end;
                return (
                  <button key={p.key} onClick={() => pick(p)}
                    className={`text-left px-2 py-1.5 rounded-md transition-colors ${active ? 'bg-[#0071e3]/[.08]' : 'hover:bg-black/[.04]'}`}>
                    <div className={`text-[11.5px] font-medium ${active ? 'text-[#0071e3]' : 'text-[#1d1d1f]'}`}>{p.label}</div>
                    <div className="text-[9.5px] text-[#86868b] tabular-nums">{shortRange(p)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-px bg-black/[.085]" />

          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#86868b] px-1 mb-1.5">Escolher</div>

            <label className="block text-[10.5px] font-medium text-[#86868b] px-1">Mês</label>
            <input type="month" value={period.start.slice(0, 7)} onChange={e => setMonth(e.target.value)}
              className="mt-1 w-full h-9 px-2 bg-white border border-black/[.085] rounded-lg text-[11.5px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] cursor-pointer" />

            <label className="block text-[10.5px] font-medium text-[#86868b] px-1 mt-2.5">Data específica</label>
            <input type="date" value={period.start === period.end ? period.start : ''} onChange={e => setDay(e.target.value)}
              className="mt-1 w-full h-9 px-2 bg-white border border-black/[.085] rounded-lg text-[11.5px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] cursor-pointer tabular-nums" />

            <label className="block text-[10.5px] font-medium text-[#86868b] px-1 mt-2.5">Intervalo</label>
            <div className="mt-1 flex items-center gap-1">
              <input type="date" value={draft.start} onChange={e => setDraft(d => ({ ...d, start: e.target.value }))}
                className="h-9 flex-1 min-w-0 px-2 bg-white border border-black/[.085] rounded-lg text-[11px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] cursor-pointer tabular-nums" />
              <span className="text-[9.5px] text-[#86868b]">até</span>
              <input type="date" value={draft.end} onChange={e => setDraft(d => ({ ...d, end: e.target.value }))}
                className="h-9 flex-1 min-w-0 px-2 bg-white border border-black/[.085] rounded-lg text-[11px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] cursor-pointer tabular-nums" />
            </div>
            <button onClick={applyRange}
              className="mt-2 w-full h-9 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] text-white text-[11.5px] font-semibold transition-colors">
              Aplicar intervalo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
