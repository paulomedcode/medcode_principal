import React, { useState } from 'react';
import { X, Save, Loader2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Cadastro breve de fornecedor/cliente. onSave(data) deve criar e resolver;
// onCancel fecha sem criar. Renderizado por cima de outros modais (z alto).
export default function PartyModal({ initialName = '', onSave, onCancel }) {
  const [name, setName] = useState(initialName);
  const [document, setDocument] = useState('');
  const [kind, setKind] = useState('AMBOS');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome.');
    setSaving(true);
    try {
      await onSave({ name: name.trim(), document: document.trim() || null, kind, notes: notes.trim() || null });
    } finally { setSaving(false); }
  };

  const KINDS = [['FORNECEDOR', 'Fornecedor'], ['CLIENTE', 'Cliente'], ['AMBOS', 'Ambos']];

  return (
    <div className="fixed inset-0 z-[14000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onCancel}></div>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 animate-in zoom-in-95 duration-200 border border-black/[.06] overflow-hidden">
        <div className="p-4 border-b border-black/[.06] flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Building2 size={15} className="text-[#0071e3]" /> Novo fornecedor / cliente</h3>
          <button type="button" onClick={onCancel} className="p-1.5 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={15} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Rodrigues Materiais"
              className="w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-[#0071e3]" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">CNPJ / CPF (opcional)</label>
            <input value={document} onChange={e => setDocument(e.target.value)} placeholder="00.000.000/0000-00"
              className="w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-[#0071e3]" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Tipo</label>
            <div className="flex gap-1.5">
              {KINDS.map(([v, l]) => (
                <button key={v} type="button" onClick={() => setKind(v)}
                  className={`flex-1 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wide border transition-colors ${kind === v ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-black/[.085] text-slate-500 hover:border-[#0071e3]/40'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Observação (opcional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotação rápida"
              className="w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-sm font-medium text-slate-700 outline-none focus:border-[#0071e3]" />
          </div>
        </div>
        <div className="p-4 border-t border-black/[.06] flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 px-4 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg uppercase">Cancelar</button>
          <button type="submit" disabled={saving} className="h-9 px-5 bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold rounded-lg text-xs uppercase shadow-sm flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Cadastrar
          </button>
        </div>
      </form>
    </div>
  );
}
