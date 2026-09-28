import React, { useState, useEffect, useCallback } from 'react';
import { financeService } from '../../services/financeService';
import { X, Loader2, Check, Trash2, Banknote, Split } from 'lucide-react';
import toast from 'react-hot-toast';
import { todayISO } from '../../utils/date';
import { PAYMENT_METHODS } from './paymentMethods';
import CurrencyInput from './CurrencyInput';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };

/**
 * Modal de baixa (pagamento/recebimento) com suporte a parcial + estorno.
 * Props: row (lançamento), accounts, onClose, onDone (recarrega a lista).
 */
export default function BaixaModal({ row, accounts = [], onClose, onDone }) {
  const isPay = row?.type === 'SAIDA';
  const L = isPay
    ? { title: 'Dar baixa (pagamento)', verb: 'Pagar', actor: 'Pago em' }
    : { title: 'Registrar recebimento', verb: 'Receber', actor: 'Recebido em' };

  const [payments, setPayments] = useState([]);
  const [siblings, setSiblings] = useState([]); // linhas-irmãs do rateio (se houver)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const groupRemaining = siblings.reduce((a, s) => a + Math.max(0, parseFloat(s.amount || 0) - parseFloat(s.paid_amount || 0)), 0);
  const total = parseFloat(row?.amount || 0);
  const paid = payments.reduce((a, p) => a + parseFloat(p.amount || 0), 0);
  const remaining = Math.max(0, total - paid);

  const [form, setForm] = useState({
    amount: '', date: todayISO(), method: row?.payment_method || 'PIX',
    accountId: row?.account_id || (accounts[0]?.id || ''), doc: row?.doc_number || '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await financeService.getTransactionPayments(row.id);
      setPayments(ps || []);
      const rem = Math.max(0, total - (ps || []).reduce((a, p) => a + parseFloat(p.amount || 0), 0));
      setForm(f => ({ ...f, amount: rem ? rem.toFixed(2) : '' }));
      if (row.split_group_id) {
        const sib = await financeService.getSplitGroup(row.split_group_id);
        setSiblings(sib || []);
      } else {
        setSiblings([]);
      }
    } catch (e) { console.error(e); toast.error('Erro ao carregar baixas.'); }
    finally { setLoading(false); }
  }, [row, total]);

  useEffect(() => { if (row) load(); }, [row, load]);

  if (!row) return null;

  const submit = async () => {
    const amt = parseFloat(String(form.amount).replace(',', '.'));
    if (!amt || amt <= 0) return toast.error('Informe um valor maior que zero.');
    if (amt > remaining + 0.0049) return toast.error(`Valor maior que o saldo a ${L.verb.toLowerCase()} (${fmt(remaining)}).`);
    if (!form.accountId) return toast.error('Selecione a conta.');
    setSaving(true);
    try {
      await financeService.settleTransaction(row.id, { amount: amt, date: form.date, method: form.method, accountId: form.accountId, doc: form.doc || null });
      toast.success('Baixa registrada!');
      await load();
      onDone?.();
    } catch (e) { console.error(e); toast.error(e?.message || 'Erro ao dar baixa.'); }
    finally { setSaving(false); }
  };

  // Quita todas as linhas do rateio de uma vez (mesma data/conta/forma).
  const quitarGrupo = async () => {
    if (!form.accountId) return toast.error('Selecione a conta.');
    setSaving(true);
    try {
      const n = await financeService.settleGroup(row.split_group_id, { date: form.date, method: form.method, accountId: form.accountId, doc: form.doc || null });
      toast.success(`Rateio quitado — ${n} lançamento(s).`);
      onDone?.();
      onClose?.();
    } catch (e) { console.error(e); toast.error(e?.message || 'Erro ao quitar o grupo.'); }
    finally { setSaving(false); }
  };

  const estornar = async (p) => {
    try {
      await financeService.deletePayment(p.id);
      toast.success('Baixa estornada.');
      await load();
      onDone?.();
    } catch (e) { console.error(e); toast.error('Erro ao estornar.'); }
  };

  const inputCls = 'w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-[13px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] transition-colors';

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">
        <div className="px-5 py-4 border-b border-black/[.085] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1d1d1f] tracking-[-.01em] flex items-center gap-2"><Banknote size={16} className="text-[#248a3d]" /> {L.title}</h3>
            <p className="text-[11.5px] text-[#86868b] truncate mt-0.5">{row.finance_parties?.name || row.description}</p>
          </div>
          <button onClick={onClose} className="p-2 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-xl transition-colors"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-px bg-black/[.085] border border-black/[.085] rounded-xl overflow-hidden">
            <Box label="Total" value={fmt(total)} />
            <Box label={isPay ? 'Pago' : 'Recebido'} value={fmt(paid)} color="text-[#248a3d]" />
            <Box label="Em aberto" value={fmt(remaining)} color={remaining > 0 ? 'text-[#bf7a00]' : 'text-[#86868b]'} />
          </div>

          {/* Rateio: linhas-irmãs + quitar grupo inteiro */}
          {siblings.length > 1 && (
            <div className="rounded-xl border border-black/[.085] bg-black/[.02] p-3">
              <div className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.08em] mb-1.5 flex items-center gap-1">
                <Split size={12} /> Rateio · {siblings.length} categorias
              </div>
              <div className="space-y-1 mb-2.5">
                {siblings.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-[11px]">
                    <span className={`truncate ${s.id === row.id ? 'font-semibold text-[#1d1d1f]' : 'text-[#86868b]'}`}>
                      {s.finance_categories?.name || 'Sem categoria'}{s.id === row.id ? ' (atual)' : ''}
                    </span>
                    <span className="font-medium tabular-nums text-[#1d1d1f] ml-2 shrink-0">
                      {fmt(s.amount)} {s.status === 'PAGO' ? <Check size={11} className="inline text-[#248a3d]" /> : <span className="text-[9.5px] text-[#bf7a00] font-medium">aberto</span>}
                    </span>
                  </div>
                ))}
              </div>
              {groupRemaining > 0.0049 && (
                <button onClick={quitarGrupo} disabled={saving}
                  className="w-full h-9 bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold rounded-lg text-[11px] flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />} Quitar grupo inteiro ({fmt(groupRemaining)})
                </button>
              )}
              <p className="text-[10px] text-[#86868b] mt-1.5 leading-snug">
                Quita todas as categorias do rateio de uma vez na conta/forma escolhidas abaixo — ou baixe só esta linha no formulário.
              </p>
            </div>
          )}

          {/* Baixas já registradas */}
          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 size={22} className="text-[#0071e3] animate-spin" /></div>
          ) : payments.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.08em] mb-1.5">Baixas registradas</div>
              <div className="divide-y divide-black/[.055] border border-black/[.085] rounded-xl overflow-hidden">
                {payments.map(p => (
                  <div key={p.id} className="group flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-black/[.02]">
                    <div className="min-w-0">
                      <span className="text-[12px] font-semibold text-[#248a3d] tabular-nums">{fmt(p.amount)}</span>
                      <span className="text-[10.5px] text-[#86868b] ml-2">{fmtDate(p.payment_date)} · {p.payment_method || '—'} · {p.finance_accounts?.name || ''}{p.auto ? ' · auto' : ''}{p.doc_number ? ` · ${p.doc_number}` : ''}</span>
                    </div>
                    <button onClick={() => estornar(p)} title="Estornar esta baixa"
                      className="p-1 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-md transition-colors shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form de nova baixa */}
          {remaining > 0.0049 && (
            <div className="border-t border-black/[.085] pt-3 space-y-3">
              <div className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.08em]">Nova baixa</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Valor (R$)</label>
                  <CurrencyInput value={form.amount} onChange={v => setForm({ ...form, amount: v.toFixed(2) })} className={inputCls} />
                  <button type="button" onClick={() => setForm({ ...form, amount: remaining.toFixed(2) })} className="text-[10px] font-medium text-[#0071e3] hover:opacity-70 mt-1 ml-1">Quitar total ({fmt(remaining)})</button>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">{L.actor}</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Conta</label>
                  <select value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })} className={`${inputCls} cursor-pointer`}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Forma</label>
                  <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className={`${inputCls} cursor-pointer`}>
                    {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Nº Doc / NF (opcional)</label>
                  <input type="text" value={form.doc} onChange={e => setForm({ ...form, doc: e.target.value })} className={inputCls} placeholder="Ex: comprovante 123" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-black/[.085] flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="h-10 px-5 text-[11.5px] font-medium text-[#86868b] hover:bg-black/[.04] rounded-xl transition-colors">Fechar</button>
          {remaining > 0.0049 && (
            <button onClick={submit} disabled={saving}
              className="h-10 px-6 bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold rounded-xl text-[11.5px] shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center gap-2 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />} Registrar baixa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Box({ label, value, color }) {
  return (
    <div className="bg-white px-2 py-2 text-center">
      <div className="text-[9px] font-semibold text-[#86868b] uppercase tracking-[.06em]">{label}</div>
      <div className={`text-[12px] font-semibold tabular-nums mt-0.5 ${color || 'text-[#1d1d1f]'}`}>{value}</div>
    </div>
  );
}
