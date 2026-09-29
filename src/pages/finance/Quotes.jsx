import React, { useState, useEffect, useMemo } from 'react';
import { financeService } from '../../services/financeService';
import { prevMonthISO } from '../../utils/date';
import {
  Plus, Loader2, Edit2, Trash2, CheckCircle2, XCircle, FileText, X, Save, Trash, ShoppingCart
} from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { usePermission } from '../../contexts/PermissionContext';
import CurrencyInput from '../../components/finance/CurrencyInput';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
// Hoje + n dias em horário LOCAL (evita o salto de dia do toISOString/UTC).
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const STATUS = {
  PENDENTE: { label: 'Pendente', cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  APROVADO: { label: 'Aprovado', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  RECUSADO: { label: 'Recusado', cls: 'bg-rose-50 text-rose-600 border-rose-100' }
};

const inputCls = "w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#0071e3] transition-all shadow-sm";

export default function Quotes() {
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('Editar Financeiro') || hasPermission('Editar Vendas'); // sem ela: modo somente-leitura
  const canApprove = hasPermission('Editar Financeiro'); // aprovar gera conta a receber
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [services, setServices] = useState([]);
  const [parties, setParties] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const closeConfirm = (ok) => { if (confirmState) confirmState.resolve(ok); setConfirmState(null); };

  const [modalQuote, setModalQuote] = useState(undefined); // undefined=fechado, null=novo, obj=edição
  const [approveTarget, setApproveTarget] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [qs, svc, pts, accs, cats] = await Promise.all([
        financeService.getQuotes(),
        financeService.getServices(),
        financeService.getParties(),
        financeService.getAccounts(),
        financeService.getCategories()
      ]);
      setQuotes(qs || []);
      setServices(svc || []);
      setParties((pts || []).filter(p => p.kind !== 'FORNECEDOR'));
      setAccounts(accs || []);
      setCategories(cats || []);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar orçamentos.');
    } finally {
      setLoading(false);
    }
  };

  const reloadQuotes = async () => {
    try { setQuotes(await financeService.getQuotes() || []); } catch (e) { console.error(e); }
  };

  const filtered = useMemo(
    () => statusFilter ? quotes.filter(q => q.status === statusFilter) : quotes,
    [quotes, statusFilter]
  );

  const openNew = () => setModalQuote(null);
  const openEdit = async (q) => {
    try { setModalQuote(await financeService.getQuoteDetails(q.id)); }
    catch (e) { console.error(e); toast.error('Erro ao abrir orçamento.'); }
  };

  const remove = async (q) => {
    if (!(await askConfirm({ title: 'Excluir orçamento', message: 'Deseja excluir este orçamento?', confirmLabel: 'Excluir' }))) return;
    try { await financeService.deleteQuote(q.id); toast.success('Orçamento excluído.'); reloadQuotes(); }
    catch (e) { console.error(e); toast.error('Erro ao excluir.'); }
  };

  const recusar = async (q) => {
    if (!(await askConfirm({ title: 'Recusar orçamento', message: 'Marcar este orçamento como recusado?', tone: 'primary', confirmLabel: 'Recusar' }))) return;
    try { await financeService.setQuoteStatus(q.id, 'RECUSADO'); toast.success('Orçamento recusado.'); reloadQuotes(); }
    catch (e) { console.error(e); toast.error('Erro ao atualizar.'); }
  };

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] bg-[#f5f5f7] font-sans text-slate-900">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
          <ShoppingCart size={18} className="text-[#0071e3]" /> Orçamentos
        </h1>
        <div className="flex items-center gap-1 bg-slate-100/70 rounded-lg p-0.5">
          {['', 'PENDENTE', 'APROVADO', 'RECUSADO'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 h-7 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${statusFilter === s ? 'bg-[#0071e3] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {s ? STATUS[s].label : 'Todos'}
            </button>
          ))}
        </div>
        {canEdit && (
          <button onClick={openNew}
            className="h-9 px-4 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg font-bold text-[11px] uppercase shadow-sm flex items-center gap-1.5 transition-all ml-auto">
            <Plus size={15} /> Novo Orçamento
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={28} className="text-[#0071e3] animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 text-[9px] font-semibold text-slate-400 uppercase tracking-widest border-b border-black/[.06]">
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-3">Descrição</th>
                  <th className="py-2.5 px-3">Validade</th>
                  <th className="py-2.5 px-3 text-right">Total (R$)</th>
                  <th className="py-2.5 px-3">Situação</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.055]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[11px] font-bold text-slate-400 uppercase">Nenhum orçamento</td></tr>
                ) : filtered.map(q => {
                  const st = STATUS[q.status] || STATUS.PENDENTE;
                  const pend = q.status === 'PENDENTE';
                  return (
                    <tr key={q.id} className="group hover:bg-[#f5f5f7] transition-colors text-xs">
                      <td className="py-2.5 px-4 font-bold text-slate-700">{q.finance_parties?.name || '—'}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-600">{q.title || '—'}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(q.valid_until)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">{fmt(q.total_amount)}</td>
                      <td className="py-2.5 px-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border ${st.cls}`}>{st.label}</span></td>
                      <td className="py-2.5 px-3">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {pend && (
                              <>
                                {canApprove && <button onClick={() => setApproveTarget(q)} title="Aprovar (gera conta a receber)"
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><CheckCircle2 size={15} /></button>}
                                <button onClick={() => recusar(q)} title="Recusar"
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><XCircle size={15} /></button>
                              </>
                            )}
                            <button onClick={() => openEdit(q)} title="Editar"
                              className="p-1.5 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={14} /></button>
                            <button onClick={() => remove(q)} title="Excluir"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalQuote !== undefined && (
        <QuoteModal quote={modalQuote} services={services} parties={parties}
          onClose={() => setModalQuote(undefined)} onSaved={() => { setModalQuote(undefined); reloadQuotes(); }} />
      )}

      {approveTarget && (
        <ApproveModal quote={approveTarget} accounts={accounts} categories={categories}
          onClose={() => setApproveTarget(null)} onApproved={() => { setApproveTarget(null); reloadQuotes(); }} />
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone || 'danger'}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
    </div>
  );
}

// ---- Modal de criação/edição de orçamento (com itens) ----
export function QuoteModal({ quote, services, parties, onClose, onSaved, oportunidade = null }) {
  const isEdit = !!quote;
  const [saving, setSaving] = useState(false);
  const [partyId, setPartyId] = useState(quote?.party_id || oportunidade?.party_id || '');
  const [title, setTitle] = useState(quote?.title || oportunidade?.titulo || '');
  const [validUntil, setValidUntil] = useState(quote?.valid_until || addDays(15));
  const [notes, setNotes] = useState(quote?.notes || '');
  const [items, setItems] = useState(
    quote?.items?.length
      ? quote.items.map(it => ({ service_id: it.service_id || '', description: it.description, quantity: it.quantity, unit_price: it.unit_price }))
      : [{ service_id: '', description: '', quantity: 1, unit_price: 0 }]
  );

  const total = useMemo(() => items.reduce((a, it) => a + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0), [items]);

  const setItem = (i, patch) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const pickService = (i, serviceId) => {
    const svc = services.find(s => s.id === serviceId);
    setItem(i, svc
      ? { service_id: serviceId, description: svc.name, unit_price: svc.base_price }
      : { service_id: '' });
  };
  const addItem = () => setItems([...items, { service_id: '', description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i) => setItems(items.length > 1 ? items.filter((_, idx) => idx !== i) : items);

  const submit = async (e) => {
    e.preventDefault();
    if (!partyId) return toast.error('Selecione o cliente.');
    const valid = items.filter(it => it.description.trim() && parseFloat(it.unit_price) >= 0);
    if (!valid.length) return toast.error('Adicione ao menos um item.');
    setSaving(true);
    try {
      const payloadItems = valid.map(it => ({
        service_id: it.service_id || null,
        description: it.description.trim(),
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        amount: (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0)
      }));
      const header = { party_id: partyId, title: title.trim() || null, valid_until: validUntil || null, total_amount: total, notes: notes.trim() || null,
        ...(oportunidade ? { oportunidade_id: oportunidade.id } : {}) };
      if (isEdit) await financeService.updateQuote(quote.id, header, payloadItems);
      else await financeService.createQuote({ ...header, status: 'PENDENTE' }, payloadItems);
      toast.success(isEdit ? 'Orçamento atualizado!' : 'Orçamento criado!');
      onSaved();
    } catch (err) { console.error(err); toast.error('Erro ao salvar orçamento.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-black/[.06] max-h-[90vh]">
        <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={16} className="text-[#0071e3]" /> {isEdit ? 'Editar Orçamento' : 'Novo Orçamento'}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Cliente</label>
              <select value={partyId} onChange={e => setPartyId(e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="">Selecione...</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Validade</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Descrição / Título</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Ex: Landing page de captação" />
            </div>
          </div>

          {/* Itens */}
          <div className="bg-white border border-black/[.085] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Itens</span>
              <button type="button" onClick={addItem} className="text-[10px] font-semibold text-[#0071e3] hover:text-indigo-700 uppercase flex items-center gap-1"><Plus size={12} /> Adicionar item</button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-3">
                    {i === 0 && <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-0.5 block">Serviço</label>}
                    <select value={it.service_id} onChange={e => pickService(i, e.target.value)} className={`${inputCls} cursor-pointer`}>
                      <option value="">Livre</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    {i === 0 && <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-0.5 block">Descrição</label>}
                    <input type="text" value={it.description} onChange={e => setItem(i, { description: e.target.value })} className={inputCls} placeholder="Descrição do item" />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    {i === 0 && <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-0.5 block">Qtd</label>}
                    <input type="number" step="0.01" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} className={`${inputCls} text-right`} />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    {i === 0 && <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-0.5 block">Valor un.</label>}
                    <CurrencyInput value={it.unit_price} onChange={v => setItem(i, { unit_price: v })} className={`${inputCls} text-right`} />
                  </div>
                  <div className="col-span-3 md:col-span-1 text-right text-xs font-semibold text-slate-700 tabular-nums pb-2">
                    {((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-1 pb-1">
                    <button type="button" onClick={() => removeItem(i)} className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} h-16 resize-none py-1.5`} />
          </div>
        </form>

        <div className="p-4 border-t border-black/[.06] flex items-center justify-between shrink-0 bg-white">
          <div className="text-sm font-semibold text-slate-800">Total: <span className="text-indigo-700">{fmt(total)}</span></div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg uppercase">Cancelar</button>
            <button onClick={submit} disabled={saving} className="h-9 px-5 bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold rounded-lg text-xs uppercase shadow-sm flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Modal de aprovação (gera conta a receber) ----
function ApproveModal({ quote, accounts, categories, onClose, onApproved }) {
  const [saving, setSaving] = useState(false);
  const [dueDate, setDueDate] = useState(addDays(30));
  const [accountId, setAccountId] = useState(accounts?.[0]?.id || '');
  const [categoryId, setCategoryId] = useState('');
  const [referenceMonth, setReferenceMonth] = useState(prevMonthISO());

  const confirm = async () => {
    if (!accountId) return toast.error('Selecione a conta.');
    if (!dueDate) return toast.error('Informe o vencimento.');
    if (!referenceMonth) return toast.error('Informe a competência (mês de referência).');
    setSaving(true);
    try {
      await financeService.approveQuote(quote.id, { accountId, dueDate, categoryId: categoryId || null, referenceMonth });
      toast.success('Orçamento aprovado! Conta a receber gerada.');
      onApproved();
    } catch (e) { console.error(e); toast.error(e.message || 'Erro ao aprovar.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-black/[.06]">
        <div className="p-4 border-b border-black/[.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> Aprovar Orçamento</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] font-semibold text-slate-500">Gera uma <b className="text-emerald-600">conta a receber</b> de <b>{fmt(quote.total_amount)}</b> para <b>{quote.finance_parties?.name || 'cliente'}</b>.</p>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Vencimento</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Conta de destino</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">Selecione...</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Categoria (opcional)</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">Sem categoria</option>
              {categories.filter(c => c.type === 'ENTRADA').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Competência (mês ref.)</label>
            <input type="month" value={referenceMonth} onChange={e => setReferenceMonth(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="p-4 border-t border-black/[.06] flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg uppercase">Cancelar</button>
          <button onClick={confirm} disabled={saving} className="h-9 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs uppercase shadow-sm flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Aprovar
          </button>
        </div>
      </div>
    </div>
  );
}
