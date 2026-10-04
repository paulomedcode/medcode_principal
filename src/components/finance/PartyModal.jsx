import React, { useState } from 'react';
import { X, Save, Loader2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { maskTelefone, maskDocumento } from '../../utils/masks';

// Cadastro rápido de empresa/pessoa — abre por cima de outra janela quando o
// nome digitado num campo de cliente/fornecedor não existe. Só o básico
// (nome, telefone, e-mail); o resto se completa depois em Clientes.
// onSave(data) cria e resolve; onCancel fecha sem criar.
const TIPOS = [['LEAD', 'Em negociação'], ['CLIENTE', 'Cliente'], ['FORNECEDOR', 'Fornecedor'], ['AMBOS', 'Ambos']];

const inputCls = 'w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-sm font-semibold text-slate-700 outline-none focus:border-[#0071e3]';

export default function PartyModal({ initialName = '', defaultKind = 'CLIENTE', onSave, onCancel }) {
  const [name, setName] = useState(initialName);
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [document, setDocument] = useState('');
  const [kind, setKind] = useState(defaultKind);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    e?.stopPropagation(); // não deixa o submit vazar para o formulário da janela de baixo
    if (!name.trim()) return toast.error('Informe o nome.');
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), kind,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        document: document.trim() || null,
        tipo_pessoa: document.replace(/\D/g, '').length === 11 ? 'PF' : 'PJ',
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[14000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onCancel}></div>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 animate-in zoom-in-95 duration-200 border border-black/[.06] overflow-hidden">
        <div className="p-4 border-b border-black/[.06] flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Building2 size={15} className="text-[#0071e3]" /> Cadastro rápido</h3>
          <button type="button" onClick={onCancel} className="p-1.5 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={15} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome / Empresa *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Clínica Sorriso" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Telefone / WhatsApp</label>
              <input value={telefone} onChange={e => setTelefone(maskTelefone(e.target.value))} placeholder="(11) 99999-9999" maxLength={15} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">CNPJ / CPF</label>
              <input value={document} onChange={e => setDocument(maskDocumento(e.target.value))} placeholder="opcional" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@empresa.com.br" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Tipo</label>
            <div className="grid grid-cols-4 gap-1">
              {TIPOS.map(([v, l]) => (
                <button key={v} type="button" onClick={() => setKind(v)}
                  className={`h-8 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors ${kind === v ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-black/[.085] text-slate-500 hover:border-[#0071e3]/40'}`}>{l}</button>
              ))}
            </div>
          </div>
          <p className="text-[10.5px] font-semibold text-slate-400">Os demais dados (endereço, segmento, contatos) você completa depois em Clientes.</p>
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
