import React, { useState, useEffect } from 'react';
import { financeService } from '../../services/financeService';
import { X, Loader2, ArrowRight, Repeat2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { todayISO } from '../../utils/date';
import CurrencyInput from './CurrencyInput';
import useTravaRolagem from '../../hooks/useTravaRolagem';

/**
 * Modal de transferência entre contas (ex.: pagar fatura do cartão = banco → cartão).
 * Não entra no DRE; só move saldo. Props: open, accounts, onClose, onDone.
 */
export default function TransferModal({ open, accounts = [], onClose, onDone }) {
  const [costCenters, setCostCenters] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fromAccount: '', toAccount: '', amount: '', date: todayISO(), description: '', costCenterId: '30000000-0000-0000-0000-000000000001',
  });

  useEffect(() => {
    if (!open) return;
    financeService.getCostCenters().then(c => setCostCenters(c || [])).catch(() => {});
    setForm(f => ({
      ...f,
      fromAccount: accounts[0]?.id || '',
      toAccount: accounts[1]?.id || accounts[0]?.id || '',
      amount: '', description: '', date: todayISO(),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useTravaRolagem(open);
  if (!open) return null;

  const ccOptions = (() => {
    const childrenOf = (pid) => costCenters.filter(c => (c.parent_id || null) === (pid || null)).sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
    const out = []; const walk = (pid, depth) => childrenOf(pid).forEach(c => { out.push({ c, depth }); walk(c.id, depth + 1); }); walk(null, 0);
    return out;
  })();

  const submit = async () => {
    const amt = parseFloat(String(form.amount).replace(',', '.'));
    if (!form.fromAccount || !form.toAccount) return toast.error('Selecione as contas de origem e destino.');
    if (form.fromAccount === form.toAccount) return toast.error('Origem e destino devem ser contas diferentes.');
    if (!amt || amt <= 0) return toast.error('Informe um valor maior que zero.');
    setSaving(true);
    try {
      await financeService.createTransfer({
        fromAccount: form.fromAccount, toAccount: form.toAccount, amount: amt,
        date: form.date, description: form.description || null, costCenterId: form.costCenterId || null,
      });
      toast.success('Transferência registrada!');
      onDone?.();
      onClose();
    } catch (e) { console.error(e); toast.error(e?.message || 'Erro ao transferir.'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full h-10 px-3 bg-white border border-black/[.085] rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-indigo-500/10 transition-all';
  const labelCls = 'text-[11.5px] font-medium text-slate-500 ml-1 mb-1 block';

  return (
    <div className="fixed inset-0 z-[11000] flex items-stretch md:items-center justify-center md:p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200 h-dvh md:h-auto max-h-dvh md:max-h-[90vh] flex flex-col overflow-hidden md:border border-black/[.06]">
        <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Repeat2 size={16} className="text-[#0071e3]" /> Nova transferência</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 rounded-xl transition-colors"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>De (origem)</label>
              <select value={form.fromAccount} onChange={e => setForm({ ...form, fromAccount: e.target.value })} className={`${inputCls} cursor-pointer`}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="pb-2.5 text-slate-300"><ArrowRight size={18} /></div>
            <div className="flex-1">
              <label className={labelCls}>Para (destino)</label>
              <select value={form.toAccount} onChange={e => setForm({ ...form, toAccount: e.target.value })} className={`${inputCls} cursor-pointer`}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Valor (R$)</label>
              <CurrencyInput value={form.amount} onChange={v => setForm({ ...form, amount: v.toFixed(2) })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Data</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Descrição (opcional)</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="Ex: Pagamento fatura cartão" />
          </div>

          <div>
            <label className={labelCls}>Centro de Custo</label>
            <select value={form.costCenterId} onChange={e => setForm({ ...form, costCenterId: e.target.value })} className={`${inputCls} cursor-pointer`}>
              {ccOptions.map(({ c, depth }) => <option key={c.id} value={c.id}>{`${'   '.repeat(depth)}${depth > 0 ? '└ ' : ''}${c.name}`}</option>)}
            </select>
          </div>

          <p className="text-[10px] font-medium text-slate-400 leading-snug bg-slate-50 border border-black/[.06] rounded-lg p-2">
            A transferência <b>não entra no DRE/resultado</b> — é só um acerto entre contas (sai de uma, entra na outra). Ideal para pagar fatura de cartão, aportes, etc.
          </p>
        </div>

        <div className="p-4 border-t border-black/[.06] flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="h-10 px-5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="h-10 px-6 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs shadow-md flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Repeat2 size={14} />} Transferir
          </button>
        </div>
      </div>
    </div>
  );
}
