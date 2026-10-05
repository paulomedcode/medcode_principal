// ============================================================================
// Menu do cabeçalho de uma coluna (propriedade) do database.
// Renomear · trocar tipo · ordenar · gerenciar opções (cor) · excluir.
// Persiste direto via serviço; avisa o pai por onSaved()/onDeleted().
// ============================================================================
import { useRef, useState } from 'react';
import {
  ArrowUpAZ, ArrowDownAZ, Trash2, Plus, Check, X, GripVertical,
} from 'lucide-react';
import * as ws from '../../services/workspace';
import Popover from './Popover';
import {
  PROP_TYPE_LABELS, SELECTABLE_PROP_TYPES, OPTION_TYPES, COLOR_KEYS,
  swatchClass, colorLabel, optionId,
} from './databaseUtils';

export default function PropertyMenu({ prop, anchorRef, onClose, onSaved, onDeleted, onSort }) {
  const [name, setName] = useState(prop.name);
  const [type, setType] = useState(prop.type);
  const [options, setOptions] = useState(prop.options || []);
  const [busy, setBusy] = useState(false);
  const isOptionType = OPTION_TYPES.has(type);

  const persist = async (patch) => {
    setBusy(true);
    try {
      const updated = await ws.updateProperty(prop.id, patch);
      onSaved?.(updated);
    } finally { setBusy(false); }
  };

  const commitName = () => {
    const v = name.trim();
    if (v && v !== prop.name) persist({ name: v });
  };

  const changeType = async (t) => {
    setType(t);
    const patch = { type: t };
    if (OPTION_TYPES.has(t) && (!options || options.length === 0)) {
      const seeded = [{ id: optionId(), name: 'Opção 1', color: 'blue' }];
      setOptions(seeded);
      patch.options = seeded;
    }
    await persist(patch);
  };

  const saveOptions = (next) => { setOptions(next); persist({ options: next }); };
  const addOption = () => saveOptions([...options, { id: optionId(), name: `Opção ${options.length + 1}`, color: COLOR_KEYS[options.length % COLOR_KEYS.length] }]);
  const renameOption = (id, v) => setOptions((os) => os.map((o) => (o.id === id ? { ...o, name: v } : o)));
  const recolorOption = (id, color) => saveOptions(options.map((o) => (o.id === id ? { ...o, color } : o)));
  const removeOption = (id) => saveOptions(options.filter((o) => o.id !== id));

  const del = async () => {
    if (!window.confirm(`Excluir a coluna "${prop.name}"? Os valores dela nas linhas serão perdidos.`)) return;
    setBusy(true);
    try { await ws.deleteProperty(prop.id); onDeleted?.(prop.id); }
    finally { setBusy(false); }
  };

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={268}>
      <div className="p-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') { commitName(); e.currentTarget.blur(); } }}
          className="w-full h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-800 outline-none focus:border-blue-400"
        />

        <div className="mt-2">
          <label className="block px-1 text-[12px] font-medium text-slate-400 mb-1">Tipo</label>
          <select
            value={type}
            onChange={(e) => changeType(e.target.value)}
            disabled={busy}
            className="w-full h-8 px-2 rounded-lg bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 outline-none cursor-pointer focus:border-blue-400"
          >
            {SELECTABLE_PROP_TYPES.map((t) => <option key={t} value={t}>{PROP_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        {isOptionType && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <label className="block px-1 text-[12px] font-medium text-slate-400 mb-1">Opções</label>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              {options.map((o) => (
                <OptionRow key={o.id} option={o} onRename={renameOption} onCommit={() => saveOptions(options)} onRecolor={recolorOption} onRemove={removeOption} />
              ))}
            </div>
            <button onClick={addOption} className="mt-1 flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors">
              <Plus size={13} /> Nova opção
            </button>
          </div>
        )}

        <div className="mt-2 border-t border-slate-100 pt-1">
          <MenuItem icon={ArrowUpAZ} label="Ordenar crescente" onClick={() => { onSort?.(prop.id, 'asc'); onClose(); }} />
          <MenuItem icon={ArrowDownAZ} label="Ordenar decrescente" onClick={() => { onSort?.(prop.id, 'desc'); onClose(); }} />
          <MenuItem icon={Trash2} label="Excluir coluna" danger onClick={del} />
        </div>
      </div>
    </Popover>
  );
}

function OptionRow({ option, onRename, onCommit, onRecolor, onRemove }) {
  const dotRef = useRef(null);
  const [palette, setPalette] = useState(false);
  return (
    <div className="group flex items-center gap-1.5 px-1">
      <GripVertical size={12} className="text-slate-200 shrink-0" />
      <button ref={dotRef} onClick={() => setPalette((v) => !v)} title="Cor" className={`w-4 h-4 rounded-full shrink-0 ${swatchClass(option.color)} ring-2 ring-white shadow-sm`} />
      <input
        value={option.name}
        onChange={(e) => onRename(option.id, e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="flex-1 min-w-0 h-7 px-1.5 rounded-md bg-transparent text-[12px] font-semibold text-slate-700 outline-none focus:bg-slate-50"
      />
      <button onClick={() => onRemove(option.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-rose-500 transition-all"><X size={13} /></button>
      {palette && (
        <Popover anchorRef={dotRef} onClose={() => setPalette(false)} width={196}>
          <div className="p-2">
            <div className="px-0.5 pb-1.5 text-[12px] font-medium text-slate-400">Cor da opção</div>
            <div className="grid grid-cols-6 gap-1.5">
              {COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  title={colorLabel(c)}
                  onClick={() => { onRecolor(option.id, c); setPalette(false); }}
                  className={`w-6 h-6 rounded-full ${swatchClass(c)} flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${option.color === c ? 'ring-2 ring-slate-800 ring-offset-1' : 'ring-2 ring-white'}`}
                >
                  {option.color === c && <Check size={13} className="text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  const Icon = icon;
  return (
    <button onClick={onClick} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${danger ? 'text-rose-500 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon size={14} /> {label}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Criar nova coluna (nome + tipo) — substitui o window.prompt.
// ----------------------------------------------------------------------------
export function NewColumnMenu({ anchorRef, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const create = () => {
    const v = name.trim();
    if (!v) return;
    const options = OPTION_TYPES.has(type) ? [{ id: optionId(), name: 'Opção 1', color: 'blue' }] : [];
    onCreate({ name: v, type, options });
    onClose();
  };
  return (
    <Popover anchorRef={anchorRef} onClose={onClose} align="right" width={240}>
      <div className="p-2">
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          placeholder="Nome da coluna"
          className="w-full h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-400"
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-8 px-2 mt-1.5 rounded-lg bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 outline-none cursor-pointer focus:border-blue-400">
          {SELECTABLE_PROP_TYPES.map((t) => <option key={t} value={t}>{PROP_TYPE_LABELS[t]}</option>)}
        </select>
        <button onClick={create} className="w-full h-8 mt-1.5 rounded-lg bg-slate-900 text-white text-[12.5px] font-medium hover:bg-slate-800 transition-colors">Criar coluna</button>
      </div>
    </Popover>
  );
}
