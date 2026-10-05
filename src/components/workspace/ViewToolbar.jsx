// ============================================================================
// Barra de controles de uma visão: Filtros e Ordenação.
// Lê/grava em view.config.filter / view.config.sort (persistido via onConfig).
// ============================================================================
import { useRef, useState } from 'react';
import { SlidersHorizontal, ArrowUpDown, Plus, X, ChevronDown } from 'lucide-react';
import Popover from './Popover';
import { opsForType, optionId, PROP_TYPE_LABELS } from './databaseUtils';

export default function ViewToolbar({ props, users, filters, sorts, onFilters, onSorts }) {
  const filterRef = useRef(null);
  const sortRef = useRef(null);
  const [openFilter, setOpenFilter] = useState(false);
  const [openSort, setOpenSort] = useState(false);
  const nF = (filters || []).filter((f) => f.propId).length;
  const nS = (sorts || []).filter((s) => s.propId).length;

  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={filterRef}
        onClick={() => setOpenFilter((v) => !v)}
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-bold transition-colors ${nF ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-100'}`}
      >
        <SlidersHorizontal size={13} /> Filtros{nF ? ` · ${nF}` : ''}
      </button>
      <button
        ref={sortRef}
        onClick={() => setOpenSort((v) => !v)}
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-bold transition-colors ${nS ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-100'}`}
      >
        <ArrowUpDown size={13} /> Ordenar{nS ? ` · ${nS}` : ''}
      </button>

      {openFilter && (
        <FilterPanel anchorRef={filterRef} props={props} users={users} filters={filters} onChange={onFilters} onClose={() => setOpenFilter(false)} />
      )}
      {openSort && (
        <SortPanel anchorRef={sortRef} props={props} sorts={sorts} onChange={onSorts} onClose={() => setOpenSort(false)} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Filtros
// ----------------------------------------------------------------------------
function FilterPanel({ anchorRef, props, users, filters, onChange, onClose }) {
  const list = filters || [];
  const propOf = (id) => (id === '__title' ? { id: '__title', name: 'Nome', type: 'text', options: [] } : props.find((p) => p.id === id));

  const add = () => onChange([...list, { id: optionId(), propId: '__title', op: 'contains', value: '' }]);
  const update = (id, patch) => onChange(list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id) => onChange(list.filter((f) => f.id !== id));

  const changeProp = (id, propId) => {
    const p = propOf(propId);
    const ops = opsForType(p?.type || 'text');
    update(id, { propId, op: ops[0].op, value: '' });
  };

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={360}>
      <div className="p-2">
        {list.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-slate-400 font-semibold text-center">Nenhum filtro. Adicione um para restringir as linhas.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {list.map((f) => {
              const p = propOf(f.propId) || { type: 'text', options: [] };
              const ops = opsForType(p.type);
              const spec = ops.find((o) => o.op === f.op) || ops[0];
              return (
                <div key={f.id} className="flex items-center gap-1">
                  <Select value={f.propId} onChange={(v) => changeProp(f.id, v)} className="w-[110px]">
                    <option value="__title">Nome</option>
                    {props.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                  </Select>
                  <Select value={f.op} onChange={(v) => update(f.id, { op: v, value: '' })} className="w-[92px]">
                    {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </Select>
                  {!spec.noValue && (
                    <FilterValue prop={p} users={users} value={f.value} onChange={(v) => update(f.id, { value: v })} />
                  )}
                  <button onClick={() => remove(f.id)} className="p-1 rounded text-slate-300 hover:text-rose-500 shrink-0"><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={add} className="mt-1.5 flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors">
          <Plus size={13} /> Adicionar filtro
        </button>
      </div>
    </Popover>
  );
}

function FilterValue({ prop, users, value, onChange }) {
  const base = 'flex-1 min-w-0 h-7 px-2 rounded-md bg-white border border-slate-200 text-[12px] font-semibold text-slate-700 outline-none focus:border-blue-400';
  switch (prop.type) {
    case 'select':
    case 'status':
    case 'multi_select':
      return (
        <Select value={value || ''} onChange={onChange} className="flex-1">
          <option value="">—</option>
          {(prop.options || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      );
    case 'person':
      return (
        <Select value={value || ''} onChange={onChange} className="flex-1">
          <option value="">—</option>
          {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </Select>
      );
    case 'date':
      return <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} className={base} />;
    case 'time':
      return <input type="time" value={value || ''} onChange={(e) => onChange(e.target.value)} className={base} />;
    case 'number':
      return <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={base} />;
    default:
      return <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="valor" className={base} />;
  }
}

// ----------------------------------------------------------------------------
// Ordenação
// ----------------------------------------------------------------------------
function SortPanel({ anchorRef, props, sorts, onChange, onClose }) {
  const list = sorts || [];
  const add = () => onChange([...list, { propId: '__title', dir: 'asc' }]);
  const update = (i, patch) => onChange(list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={320}>
      <div className="p-2">
        {list.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-slate-400 font-semibold text-center">Sem ordenação. As linhas seguem a ordem de criação.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {list.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <Select value={s.propId} onChange={(v) => update(i, { propId: v })} className="flex-1">
                  <option value="__title">Nome</option>
                  {props.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                </Select>
                <Select value={s.dir} onChange={(v) => update(i, { dir: v })} className="w-[128px]">
                  <option value="asc">Crescente</option>
                  <option value="desc">Decrescente</option>
                </Select>
                <button onClick={() => remove(i)} className="p-1 rounded text-slate-300 hover:text-rose-500 shrink-0"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <button onClick={add} className="mt-1.5 flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors">
          <Plus size={13} /> Adicionar ordenação
        </button>
      </div>
    </Popover>
  );
}

// Select nativo estilizado, compacto.
function Select({ value, onChange, className = '', children }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 pl-2 pr-6 rounded-md bg-white border border-slate-200 text-[12px] font-semibold text-slate-700 outline-none cursor-pointer appearance-none focus:border-blue-400 truncate"
      >
        {children}
      </select>
      <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}
