import React, { useMemo, useState } from 'react';
import { financeService } from '../../services/financeService';
import { X, Loader2, Check, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import { todayISO } from '../../utils/date';
import { PAYMENT_METHODS } from './paymentMethods';
import { counterpartyName } from '../../utils/financeCounterparty';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };

/**
 * Baixa em LOTE: quita várias contas de uma vez pelo saldo em aberto de cada uma,
 * com a mesma data, conta e forma de pagamento. Cada linha vira uma baixa de verdade
 * (RPC settle_transaction), então o saldo da conta se mexe como numa baixa avulsa.
 * Props: rows (lançamentos selecionados), accounts, onClose, onDone.
 */
export default function BulkSettleModal({ rows = [], accounts = [], onClose, onDone }) {
  const isPay = rows[0]?.type === 'SAIDA';
  const L = isPay
    ? { title: 'Dar baixa em lote (pagamento)', verb: 'Pagar', done: 'paga(s)' }
    : { title: 'Registrar recebimentos em lote', verb: 'Receber', done: 'recebida(s)' };

  // Só entram as que ainda têm saldo — quitada não é baixada de novo.
  const items = useMemo(() => rows
    .map(r => ({ row: r, remaining: Math.max(0, (Number(r.amount) || 0) - (Number(r.paid_amount) || 0)) }))
    .filter(i => i.remaining > 0.0049), [rows]);
  const total = useMemo(() => items.reduce((a, i) => a + i.remaining, 0), [items]);

  const [form, setForm] = useState({
    date: todayISO(),
    method: rows[0]?.payment_method || 'PIX',
    accountId: rows[0]?.account_id || accounts[0]?.id || '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.accountId) return toast.error('Selecione a conta.');
    if (items.length === 0) return toast.error('Nenhuma conta com saldo em aberto.');
    setSaving(true);
    let ok = 0;
    const failed = [];
    for (const { row, remaining } of items) {
      try {
        await financeService.settleTransaction(row.id, {
          amount: remaining, date: form.date, method: form.method,
          accountId: form.accountId, doc: row.doc_number || null,
        });
        ok++;
      } catch (e) {
        console.error(e);
        failed.push(counterpartyName(row) || row.description || row.id);
      }
    }
    setSaving(false);
    if (ok) toast.success(`${ok} conta(s) ${L.done}.`);
    if (failed.length) toast.error(`Falhou em ${failed.length}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`);
    onDone?.();
    if (!failed.length) onClose?.();
  };

  const field = 'w-full h-9 px-2.5 rounded-lg border border-black/[.085] bg-white text-[12px] text-[#1d1d1f] outline-none focus:border-[#0071e3] transition-colors';

  return (
    <div className="fixed inset-0 z-[11000] flex items-stretch md:items-center justify-center md:p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200 h-dvh md:h-auto max-h-dvh md:max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">
        <div className="px-5 py-4 border-b border-black/[.085] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1d1d1f] tracking-[-.01em] flex items-center gap-2">
              <Banknote size={16} className="text-[#248a3d]" /> {L.title}
            </h3>
            <p className="text-[11.5px] text-[#86868b] mt-0.5">{items.length} conta(s) · {fmt(total)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-xl transition-colors"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
          <div className="rounded-xl border border-black/[.085] divide-y divide-black/[.055]">
            {items.map(({ row, remaining }) => (
              <div key={row.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="text-[11.5px] text-[#1d1d1f] truncate">{counterpartyName(row) || row.description || 'Lançamento'}</span>
                <span className="text-[11px] text-[#86868b] tabular-nums shrink-0">venc {fmtDate(row.due_date)}</span>
                <span className="text-[11.5px] font-semibold text-[#1d1d1f] tabular-nums shrink-0">{fmt(remaining)}</span>
              </div>
            ))}
            {items.length === 0 && (
              <div className="px-3 py-3 text-[11.5px] text-[#86868b]">Nada em aberto nas contas selecionadas.</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[.08em] text-[#86868b] mb-1">Data</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={`${field} tabular-nums`} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[.08em] text-[#86868b] mb-1">Forma</label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} className={field}>
                {PAYMENT_METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[.08em] text-[#86868b] mb-1">Conta</label>
            <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className={field}>
              <option value="">Selecione…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <p className="text-[10.5px] text-[#86868b] leading-snug">
            Cada conta é baixada pelo saldo em aberto dela, na mesma data e conta bancária.
            Para pagar valor parcial, use a baixa individual em {isPay ? 'Contas a Pagar' : 'Contas a Receber'}.
          </p>
        </div>

        <div className="px-4 py-3 border-t border-black/[.085] flex items-center justify-end gap-2 shrink-0">
          <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-black/[.085] bg-white text-[11.5px] font-medium text-[#1d1d1f] hover:bg-black/[.03] transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving || items.length === 0}
            className="h-9 px-4 rounded-lg bg-[#248a3d] hover:bg-[#1e7233] text-white text-[11.5px] font-semibold transition-colors inline-flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />} {L.verb} {fmt(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
