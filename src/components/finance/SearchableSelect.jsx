import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';

// Normaliza p/ busca: minúsculas + remove acentos (ex.: "convenio" acha "Convênio").
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Combobox com busca digitável e lista hierárquica rolável.
// O dropdown é renderizado em portal (position: fixed) p/ não ser cortado por
// containers com overflow (ex.: a lista rolável de transações da conciliação).
// options: [{ value, label, depth }] — depth indenta subcategorias.
export default function SearchableSelect({
  options, value, onChange,
  placeholder = 'Selecione…', searchPlaceholder = 'Buscar…',
  allowEmpty = false, emptyLabel = 'Nenhum', size = 'md',
  onCreate = null, createLabel = 'Cadastrar',  // se passado, mostra "+ Cadastrar «texto»" qdo não acha
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => o.value === value);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const openUp = below < 300 && r.top > below;
    setPos({
      // Menu cresce p/ caber o texto (não fica preso à largura do campo), até o limite da tela.
      left: r.left, minW: r.width,
      maxW: Math.max(r.width, Math.min(520, window.innerWidth - r.left - 8)),
      top: openUp ? null : r.bottom + 4,
      bottom: openUp ? (window.innerHeight - r.top + 4) : null,
      maxH: Math.max(160, Math.min(340, (openUp ? r.top : below) - 12)),
    });
  };

  const toggle = () => setOpen(o => { const n = !o; if (n) { setQuery(''); place(); } return n; });
  const pick = (v) => { onChange(v); setQuery(''); setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onMove = () => place();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return q ? options.filter(o => norm(o.label).includes(q)) : options;
  }, [options, query]);

  const h = size === 'sm' ? 'h-8 text-[11px]' : 'h-9 text-xs';

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={toggle}
        className={`w-full ${h} px-3 bg-white border border-black/[.085] rounded-lg font-bold text-slate-700 outline-none focus:border-[#0071e3] cursor-pointer flex items-center justify-between gap-2`}>
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label.trim() : (allowEmpty ? emptyLabel : placeholder)}</span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div ref={menuRef}
          style={{ position: 'fixed', left: pos.left, minWidth: pos.minW, width: 'max-content', maxWidth: pos.maxW, top: pos.top ?? undefined, bottom: pos.bottom ?? undefined }}
          className="z-[13000] bg-white border border-black/[.085] rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-black/[.06]">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder}
                className="w-full h-8 pl-8 pr-2 bg-slate-50 border border-black/[.085] rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-[#0071e3]" />
            </div>
          </div>
          <div className="overflow-y-auto py-1 custom-scrollbar" style={{ maxHeight: pos.maxH }}>
            {allowEmpty && (
              <button type="button" onClick={() => pick('')}
                className="w-full text-left px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-indigo-50 flex items-center justify-between">
                {emptyLabel} {!value && <Check size={13} className="text-[#0071e3]" />}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[11px] font-semibold text-slate-400 text-center">Nada encontrado</div>
            ) : filtered.map(o => (
              <button key={o.value} type="button" onClick={() => pick(o.value)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 flex items-start justify-between gap-2 ${o.value === value ? 'bg-indigo-50/60' : ''}`}>
                <span className="whitespace-normal break-words" style={{ paddingLeft: `${(o.depth || 0) * 12}px` }}>
                  <span className={o.depth ? 'font-semibold text-slate-600' : 'font-semibold text-slate-800'}>{o.label.trim()}</span>
                </span>
                {o.value === value && <Check size={13} className="text-[#0071e3] shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
          {onCreate && query.trim() && !options.some(o => norm(o.label) === norm(query)) && (
            <button type="button" disabled={creating}
              onClick={async () => {
                const term = query.trim();
                setCreating(true);
                // Fecha o dropdown (portal no body) antes de abrir o modal de cadastro,
                // senão ele fica sobreposto por cima do modal (stacking context da página
                // impede o z-index do modal de vencer o portal).
                setOpen(false);
                try { const v = await onCreate(term); if (v) pick(v); } finally { setCreating(false); }
              }}
              className="w-full text-left px-3 py-2 text-xs font-bold text-[#0071e3] hover:bg-indigo-50 border-t border-black/[.06] flex items-center gap-1.5 disabled:opacity-60">
              {creating ? 'Cadastrando…' : `+ ${createLabel} “${query.trim()}”`}
            </button>
          )}
        </div>, document.body)}
    </div>
  );
}
