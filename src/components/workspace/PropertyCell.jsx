// ============================================================================
// Células das propriedades de database.
// PropertyValue = leitura (kanban/lista/calendário); PropertyCell = edição inline (tabela).
// Select/status/multi-select usam um seletor de pílulas coloridas (StatusPicker),
// no lugar do <select> nativo — é o que dá a cara de Notion.
//
// Data e hora NÃO ficam como input nativo o tempo todo: parados eles mostram
// "dd/mm/aaaa" e o ícone de calendário em toda linha vazia, o que come largura
// e polui a leitura. Aqui eles são texto até receberem o clique.
// ============================================================================
import { useRef, useState, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import Popover from './Popover';
import { colorClass, dotClass, findOption, userName, formatDateBR, formatHora, dueTone } from './databaseUtils';

function Pill({ color, children, onRemove }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-[3px] rounded-md border leading-none ${colorClass(color)}`}>
      {children}
      {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-60"><X size={10} /></button>}
    </span>
  );
}

// Placeholder discreto: um traço que só aparece de leve, sem gritar "vazio".
const Empty = () => <span className="text-slate-300 dark:text-slate-600">—</span>;

// ---------------------------------------------------------------------------
// Leitura (kanban / lista / calendário)
// ---------------------------------------------------------------------------
export function PropertyValue({ prop, value, users }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return <Empty />;

  switch (prop.type) {
    case 'status':
    case 'select': {
      const opt = findOption(prop, value);
      return opt ? <Pill color={opt.color}>{opt.name}</Pill> : <Empty />;
    }
    case 'multi_select': {
      const ids = Array.isArray(value) ? value : [];
      return (
        <span className="flex flex-wrap gap-1">
          {ids.map((id) => { const o = findOption(prop, id); return o ? <Pill key={id} color={o.color}>{o.name}</Pill> : null; })}
        </span>
      );
    }
    case 'person':
      return <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{userName(users, value) || '—'}</span>;
    case 'date':
      return <span className="text-[12px] text-slate-600 dark:text-slate-400 tabular-nums">{formatDateBR(value)}</span>;
    case 'time':
      return <span className="text-[12px] text-slate-600 dark:text-slate-400 tabular-nums">{formatHora(value)}</span>;
    case 'checkbox':
      return value ? <Check size={14} className="text-emerald-600" /> : <Empty />;
    case 'url':
      return <a href={value} onClick={(e) => e.stopPropagation()} className="text-[12px] text-blue-600 underline truncate">{value}</a>;
    default:
      return <span className="text-[12px] text-slate-700 dark:text-slate-300">{String(value)}</span>;
  }
}

// ---------------------------------------------------------------------------
// Edição inline (tabela). onCommit(value) grava no banco.
// `due` liga o realce de prazo (só faz sentido na coluna de expectativa).
// ---------------------------------------------------------------------------
export function PropertyCell({ prop, value, users, onCommit, due = false }) {
  const baseInput = 'ws-cell w-full bg-transparent text-[12px] text-slate-700 dark:text-slate-300 outline-none px-2 py-1 rounded-md';

  switch (prop.type) {
    case 'status':
    case 'select':
      return <StatusPicker prop={prop} value={value} onCommit={onCommit} />;
    case 'multi_select':
      return <MultiPicker prop={prop} value={value} onCommit={onCommit} />;
    case 'person':
      return <PersonPicker users={users} value={value} onCommit={onCommit} />;
    case 'date':
      return <DateCell value={value} onCommit={onCommit} due={due} />;
    case 'time':
      return <TimeCell value={value} onCommit={onCommit} />;
    case 'number':
      return <input type="number" defaultValue={value ?? ''} onBlur={(e) => onCommit(e.target.value === '' ? null : Number(e.target.value))} className={`${baseInput} tabular-nums`} />;
    case 'checkbox':
      return (
        <div className="px-2 py-1">
          <input type="checkbox" checked={!!value} onChange={(e) => onCommit(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
        </div>
      );
    case 'url':
      return <input type="url" defaultValue={value || ''} placeholder="https://" onBlur={(e) => onCommit(e.target.value || null)} className={baseInput} />;
    default:
      return <input type="text" defaultValue={value || ''} onBlur={(e) => onCommit(e.target.value || null)} className={baseInput} />;
  }
}

// ---------------------------------------------------------------------------
// Data — texto formatado; vira campo (e abre o calendário) ao clicar.
// ---------------------------------------------------------------------------
const DUE_TONE = {
  late:  'text-rose-600 dark:text-rose-400 font-semibold',
  today: 'text-amber-600 dark:text-amber-400 font-semibold',
  soon:  'text-slate-700 dark:text-slate-300 font-medium',
};

function DateCell({ value, onCommit, due }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.focus();
    // showPicker() abre o calendário direto no clique — sem o segundo clique
    // no ícone. Nem todo navegador tem; quando não tem, o campo já está focado.
    try { ref.current.showPicker?.(); } catch { /* navegador sem suporte */ }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref} type="date" defaultValue={value || ''}
        onChange={(e) => onCommit(e.target.value || null)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false); }}
        className="ws-cell ws-date-input w-full bg-white dark:bg-slate-800 text-[12px] text-slate-700 dark:text-slate-200 outline-none px-1.5 py-1 rounded-md tabular-nums"
      />
    );
  }
  const tone = due ? dueTone(value) : null;
  return (
    <button
      onClick={() => setEditing(true)}
      className="ws-cell w-full text-left px-2 py-1 rounded-md text-[12px] tabular-nums transition-colors"
    >
      {value
        ? <span className={tone ? DUE_TONE[tone] : 'text-slate-600 dark:text-slate-400'}>{formatDateBR(value)}</span>
        : <span className="text-slate-300 dark:text-slate-600">—</span>}
    </button>
  );
}

function TimeCell({ value, onCommit }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.focus();
    try { ref.current.showPicker?.(); } catch { /* navegador sem suporte */ }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref} type="time" defaultValue={formatHora(value)}
        onChange={(e) => onCommit(e.target.value || null)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false); }}
        className="ws-cell ws-date-input w-full bg-white dark:bg-slate-800 text-[12px] text-slate-700 dark:text-slate-200 outline-none px-1.5 py-1 rounded-md tabular-nums"
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="ws-cell w-full text-left px-2 py-1 rounded-md text-[12px] tabular-nums transition-colors">
      {value
        ? <span className="text-slate-600 dark:text-slate-400">{formatHora(value)}</span>
        : <span className="text-slate-300 dark:text-slate-600">—</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Seletor de status/seleção única — pílula colorida + popover de opções
// ---------------------------------------------------------------------------
export function StatusPicker({ prop, value, onCommit }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const opt = findOption(prop, value);
  return (
    <>
      <button ref={ref} onClick={() => setOpen((v) => !v)} className="ws-cell group flex items-center gap-1 w-full px-2 py-1 rounded-md transition-colors text-left">
        {opt ? <Pill color={opt.color}>{opt.name}</Pill> : <span className="text-[12px] text-slate-300 dark:text-slate-600">—</span>}
        <ChevronDown size={11} className="ml-auto text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} width={196}>
          <div className="p-1.5 flex flex-col gap-0.5 max-h-64 overflow-y-auto">
            <button onClick={() => { onCommit(null); setOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-medium text-slate-400 hover:bg-slate-50">
              <span className={`w-2 h-2 rounded-full ${dotClass('gray')}`} /> Limpar
            </button>
            {(prop.options || []).map((o) => (
              <button key={o.id} onClick={() => { onCommit(o.id); setOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                <span className={`w-2 h-2 rounded-full ${dotClass(o.color)}`} />
                <span className="flex-1 text-[12px] font-medium text-slate-700">{o.name}</span>
                {value === o.id && <Check size={13} className="text-blue-500" />}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

// Multi-seleção — pílulas + popover com toggles.
function MultiPicker({ prop, value, onCommit }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const ids = Array.isArray(value) ? value : [];
  const toggle = (id) => onCommit(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <>
      <button ref={ref} onClick={() => setOpen((v) => !v)} className="ws-cell flex flex-wrap items-center gap-1 w-full px-2 py-1 rounded-md transition-colors text-left">
        {ids.length === 0 && <span className="text-[12px] text-slate-300 dark:text-slate-600">—</span>}
        {ids.map((id) => { const o = findOption(prop, id); return o ? <Pill key={id} color={o.color} onRemove={() => toggle(id)}>{o.name}</Pill> : null; })}
      </button>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} width={196}>
          <div className="p-1.5 flex flex-col gap-0.5 max-h-64 overflow-y-auto">
            {(prop.options || []).map((o) => (
              <button key={o.id} onClick={() => toggle(o.id)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                <span className={`w-2 h-2 rounded-full ${dotClass(o.color)}`} />
                <span className="flex-1 text-[12px] font-medium text-slate-700">{o.name}</span>
                {ids.includes(o.id) && <Check size={13} className="text-blue-500" />}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

// Pessoa — inicial em círculo + nome, com busca no popover.
function PersonPicker({ users, value, onCommit }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const name = userName(users, value);
  const list = (users || []).filter((u) => (u.name || u.email || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <button ref={ref} onClick={() => setOpen((v) => !v)} className="ws-cell flex items-center gap-1.5 w-full px-2 py-1 rounded-md transition-colors text-left">
        {name ? (
          <>
            <span className="w-[18px] h-[18px] rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
              {name.charAt(0).toUpperCase()}
            </span>
            <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300 truncate">{name}</span>
          </>
        ) : <span className="text-[12px] text-slate-300 dark:text-slate-600">—</span>}
      </button>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} width={220}>
          <div className="p-1.5">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa..." className="w-full h-7 px-2 mb-1 rounded-md bg-slate-50 border border-slate-200 text-[12px] font-medium outline-none focus:border-blue-400" />
            <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
              <button onClick={() => { onCommit(null); setOpen(false); }} className="px-2 py-1.5 rounded-lg text-[12px] font-medium text-slate-400 hover:bg-slate-50 text-left">Limpar</button>
              {list.map((u) => (
                <button key={u.id} onClick={() => { onCommit(u.id); setOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 flex items-center justify-center shrink-0">{(u.name || u.email || '?').charAt(0).toUpperCase()}</span>
                  <span className="flex-1 text-[12px] font-medium text-slate-700 truncate">{u.name || u.email}</span>
                  {value === u.id && <Check size={13} className="text-blue-500" />}
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
