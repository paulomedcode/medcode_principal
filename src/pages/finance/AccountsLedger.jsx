import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { financeService } from '../../services/financeService';
import { aoClicarNoArquivo } from '../../services/arquivos';
import TransactionModal from '../../components/finance/TransactionModal';
import RecurrenceScopeDialog from '../../components/finance/RecurrenceScopeDialog';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import BaixaModal from '../../components/finance/BaixaModal';
import BulkSettleModal from '../../components/finance/BulkSettleModal';
import SearchableSelect from '../../components/finance/SearchableSelect';
import DuePeriodPicker from '../../components/finance/DuePeriodPicker';
import { todayISO, prevMonthISO } from '../../utils/date';
import {
  Search, Plus, Loader2,
  Edit2, Trash2, CheckCircle2, ArrowUpCircle, ArrowDownCircle, Link2, Unlink, Upload, Download, Printer, Paperclip, Send, Banknote
} from 'lucide-react';
import { FilterPopover, FilterChips, MoreMenu, filtroRotulo } from '../../components/finance/FilterPopover';
import toast from 'react-hot-toast';
import { printReport } from '../../utils/printReport';
import { cup, Dot } from '../../components/finance/cupertino';
import { counterpartyName } from '../../utils/financeCounterparty';
import { paymentMethodLabel } from '../../components/finance/paymentMethods';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../contexts/PermissionContext';
import { useFinanceRealtime } from '../../hooks/useFinanceRealtime';

const fmt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Componente reutilizável de Contas a Pagar / a Receber.
// type: 'SAIDA' (pagar) | 'ENTRADA' (receber)
export default function AccountsLedger({ type }) {
  const [searchParams] = useSearchParams();
  const { theme } = useWhiteLabel();
  const { currentUser } = useAuth();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('Editar Financeiro'); // sem ela: modo somente-leitura
  const isPay = type === 'SAIDA';
  const L = isPay
    ? { title: 'Contas a Pagar', paidLabel: 'Pagos', paidStatus: 'Pago', payCol: 'Pagamento', remCol: 'A pagar', accent: 'rose', newLabel: 'Nova conta a pagar' }
    : { title: 'Contas a Receber', paidLabel: 'Recebidos', paidStatus: 'Recebido', payCol: 'Recebimento', remCol: 'A receber', accent: 'emerald', newLabel: 'Nova conta a receber' };

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  // Filtros
  const [fStatus, setFStatus] = useState('all');       // all | PENDENTE | LANCADO | PAGO | overdue | today | upcoming
  const [fCostCenter, setFCostCenter] = useState('all');
  const [fCategory, setFCategory] = useState('all');
  const [fParty, setFParty] = useState('all');
  const [fConcil, setFConcil] = useState('all');        // all | yes | no
  const [fMethod, setFMethod] = useState('all');
  const [fMin, setFMin] = useState('');
  const [fMax, setFMax] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // seleção múltipla (só p/ somar os marcados)
  const [optCostCenters, setOptCostCenters] = useState([]);
  const [optCategories, setOptCategories] = useState([]);
  const [optParties, setOptParties] = useState([]);
  const [optAccounts, setOptAccounts] = useState([]);
  const [importing, setImporting] = useState(false);
  const [baixaRow, setBaixaRow] = useState(null);
  const [bulkSettleRows, setBulkSettleRows] = useState(null); // baixa em lote das selecionadas
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [delRow, setDelRow] = useState(null); // linha recorrente aguardando escolha de escopo
  const [delGroup, setDelGroup] = useState(null); // { row, kind: 'installment' | 'split' } aguardando escopo
  const [delBusy, setDelBusy] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const closeConfirm = (ok) => { if (confirmState) confirmState.resolve(ok); setConfirmState(null); };

  // Período de vencimento — vem do DuePeriodPicker (mês, dia, atalhos, intervalo).
  // { start, end, label, text }. Começa nulo e é preenchido na montagem do seletor.
  const [period, setPeriod] = useState(null);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setFStatus(statusParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (period) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.start, period?.end, type]);

  // Carrega opções dos filtros (uma vez).
  useEffect(() => {
    (async () => {
      try {
        const [ccs, cats, pts, accs] = await Promise.all([
          financeService.getCostCenters(),
          financeService.getCategories(),
          financeService.getParties(),
          financeService.getAccounts(),
        ]);
        setOptCostCenters(ccs || []);
        setOptCategories((cats || []).filter(c => c.type === type));
        setOptParties(pts || []);
        setOptAccounts(accs || []);
      } catch (e) { console.error(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const loadData = async (silent = false) => {
    if (!period) return;
    if (!silent) setLoading(true);
    try {
      const data = await financeService.getTransactions({ type, dueOrTxStart: period.start, dueOrTxEnd: period.end });
      // Coluna "Pagamento/Recebimento" mostra a data REAL da baixa (payment_date), não a
      // Data do Lançamento — busca a baixa mais recente de cada conta já paga/parcial.
      const settledIds = (data || []).filter(r => r.status === 'PAGO' || r.status === 'PARCIAL').map(r => r.id);
      const lastPaid = settledIds.length ? await financeService.getLastPaymentDates(settledIds) : {};
      setRows((data || []).map(r => ({ ...r, last_payment_date: lastPaid[r.id] || null })));
    } catch (e) {
      console.error(e);
      if (!silent) toast.error('Erro ao carregar os lançamentos.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Tempo real: recarrega sozinha (silencioso) ao mudar qualquer lançamento/saldo/baixa.
  useFinanceRealtime(() => loadData(true));

  const handleSetStatus = async (id, newStatus) => {
    try {
      await financeService.updateTransactionsStatus([id], newStatus);
      const label = newStatus === 'LANCADO' ? 'Lançada para pagamento' : 'Pendente';
      toast.success(`Conta alterada para ${label}!`);
      loadData(true);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (selectedIds.size === 0) return;
    const label = newStatus === 'LANCADO' ? 'Lançadas para pagamento' : 'Pendentes';
    const ok = await askConfirm({
      title: `Alterar status de ${selectedIds.size} conta(s)`,
      message: `Deseja alterar o status das ${selectedIds.size} conta(s) selecionada(s) para ${label}?`,
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;
    try {
      await financeService.updateTransactionsStatus([...selectedIds], newStatus);
      toast.success(`${selectedIds.size} conta(s) alterada(s) para ${label}!`);
      setSelectedIds(new Set());
      loadData(true);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await askConfirm({
      title: `Excluir ${selectedIds.size} lançamento(s)`,
      message: `Tem certeza de que deseja excluir permanentemente os ${selectedIds.size} lançamentos selecionados?`,
      confirmLabel: 'Excluir Lançamentos',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      let count = 0;
      for (const id of selectedIds) {
        await financeService.deleteTransaction(id);
        count++;
      }
      toast.success(`${count} lançamento(s) excluído(s) com sucesso.`);
      setSelectedIds(new Set());
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir alguns lançamentos.');
      loadData();
    }
  };

  // Métodos presentes nos lançamentos do período (para o filtro).
  const optMethods = useMemo(() => {
    const s = new Set();
    rows.forEach(r => { if (!r.transfer_group_id && r.payment_method) s.add(r.payment_method); });
    return [...s];
  }, [rows]);

  // Ordem da lista: por VENCIMENTO crescente (01, 02, 03…). Sem vencimento cai
  // para a data do lançamento e, se nem isso, vai para o fim. Empate desempata
  // pelo nome da contraparte para a lista não dançar a cada recarga.
  const byDueDate = (a, b) => {
    const ka = a.due_date || a.transaction_date || '9999-12-31';
    const kb = b.due_date || b.transaction_date || '9999-12-31';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return (counterpartyName(a) || a.description || '').localeCompare(counterpartyName(b) || b.description || '', 'pt-BR');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayISO();
    const min = parseFloat(String(fMin).replace(',', '.'));
    const max = parseFloat(String(fMax).replace(',', '.'));
    return rows.filter(r => {
      if (r.transfer_group_id) return false; // transferências aparecem em Movimentações, não aqui
      if (q && !(
        (r.description || '').toLowerCase().includes(q) ||
        (r.finance_parties?.name || '').toLowerCase().includes(q) ||
        (r.finance_categories?.name || '').toLowerCase().includes(q) ||
        (r.doc_number || '').toLowerCase().includes(q) ||
        // valores: líquido, BRUTO (nota c/ retenção) e pendente — cru e formatado pt-BR
        (() => {
          const liq = Math.abs(parseFloat(r.amount) || 0);
          const gross = r.gross_amount != null ? Math.abs(parseFloat(r.gross_amount) || 0) : null;
          const pend = r.status === 'PAGO' ? 0 : liq - Math.abs(parseFloat(r.paid_amount) || 0);
          return [liq, gross, pend > 0.004 ? pend : null]
            .filter(v => v != null)
            .some(v => String(v).includes(q) || v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).includes(q));
        })()
      )) return false;
      const overdue = r.status !== 'PAGO' && r.due_date && r.due_date < today;
      const isToday = r.status !== 'PAGO' && r.due_date === today;
      const upcoming = r.status !== 'PAGO' && (!r.due_date || r.due_date > today);
      if (fStatus === 'PAGO' && r.status !== 'PAGO') return false;
      if (fStatus === 'PENDENTE' && r.status === 'PAGO') return false;
      if (fStatus === 'LANCADO' && r.status !== 'LANCADO') return false;
      if (fStatus === 'overdue' && !overdue) return false;
      if (fStatus === 'today' && !isToday) return false;
      if (fStatus === 'upcoming' && !upcoming) return false;
      if (fCostCenter !== 'all' && r.cost_center_id !== fCostCenter) return false;
      if (fCategory !== 'all' && r.category_id !== fCategory) return false;
      if (fParty !== 'all' && r.party_id !== fParty) return false;
      if (fConcil === 'yes' && !r.imported_transaction_id) return false;
      if (fConcil === 'no' && r.imported_transaction_id) return false;
      if (fMethod !== 'all' && r.payment_method !== fMethod) return false;
      const amt = Math.abs(parseFloat(r.amount) || 0);
      if (!Number.isNaN(min) && amt < min) return false;
      if (!Number.isNaN(max) && amt > max) return false;
      return true;
    }).sort(byDueDate);
  }, [rows, search, fStatus, fCostCenter, fCategory, fParty, fConcil, fMethod, fMin, fMax]);

  // Totais do que está filtrado (rodapé da tabela).
  const filteredTotals = useMemo(() => {
    let total = 0, remaining = 0;
    filtered.forEach(r => {
      const amt = parseFloat(r.amount) || 0;
      total += amt;
      remaining += r.status === 'PAGO' ? 0 : (amt - parseFloat(r.paid_amount || 0));
    });
    return { total, remaining };
  }, [filtered]);

  // Total só dos itens marcados (bruto / líquido / pendente). Ignora ids que saíram do filtro.
  const selectedTotals = useMemo(() => {
    let bruto = 0, liquido = 0, pendente = 0, count = 0;
    filtered.forEach(r => {
      if (!selectedIds.has(r.id)) return;
      count++;
      bruto += Number(r.gross_amount != null ? r.gross_amount : r.amount) || 0;
      liquido += Number(r.amount) || 0;
      pendente += r.status === 'PAGO' ? 0 : ((Number(r.amount) || 0) - (Number(r.paid_amount) || 0));
    });
    return { bruto, liquido, pendente, count };
  }, [filtered, selectedIds]);
  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someVisibleSelected = filtered.some(r => selectedIds.has(r.id));
  const toggleOne = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVisible = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (filtered.every(r => prev.has(r.id))) filtered.forEach(r => n.delete(r.id));
    else filtered.forEach(r => n.add(r.id));
    return n;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const hasActiveFilters = fStatus !== 'all' || fCostCenter !== 'all' || fCategory !== 'all' || fParty !== 'all' || fConcil !== 'all' || fMethod !== 'all' || fMin || fMax || search.trim();
  const clearFilters = () => { setSearch(''); setFStatus('all'); setFCostCenter('all'); setFCategory('all'); setFParty('all'); setFConcil('all'); setFMethod('all'); setFMin(''); setFMax(''); };

  // Filtros que moram no popover: quantos estão ativos (vai no botão) e um chip
  // removível para cada um — recolher filtro só é seguro se ele continuar visível.
  const nomeDe = (lista, id) => lista.find(x => x.id === id)?.name || '—';
  const chipsAtivos = useMemo(() => {
    const cs = [];
    if (fCostCenter !== 'all') cs.push({ key: 'cc', label: nomeDe(optCostCenters, fCostCenter), clear: () => setFCostCenter('all') });
    if (fCategory !== 'all') cs.push({ key: 'cat', label: nomeDe(optCategories, fCategory), clear: () => setFCategory('all') });
    if (fParty !== 'all') cs.push({ key: 'party', label: nomeDe(optParties, fParty), clear: () => setFParty('all') });
    if (fMethod !== 'all') cs.push({ key: 'met', label: paymentMethodLabel(fMethod), clear: () => setFMethod('all') });
    if (fConcil !== 'all') cs.push({ key: 'con', label: fConcil === 'yes' ? 'Conciliados' : 'Não conciliados', clear: () => setFConcil('all') });
    if (fMin || fMax) cs.push({ key: 'val', label: `R$ ${fMin || '0'} – ${fMax || '∞'}`, clear: () => { setFMin(''); setFMax(''); } });
    return cs;
  }, [fCostCenter, fCategory, fParty, fMethod, fConcil, fMin, fMax, optCostCenters, optCategories, optParties]);
  const advancedCount = chipsAtivos.length;

  // onlySelected: imprime só as linhas marcadas (útil para levar um lote específico ao banco).
  const handlePrint = (onlySelected = false) => {
    const list = onlySelected ? filtered.filter(r => selectedIds.has(r.id)) : filtered;
    if (!list.length) return toast.error(onlySelected ? 'Nenhuma conta selecionada.' : 'Nada para imprimir com os filtros atuais.');
    const totals = list.reduce((a, r) => {
      const amt = parseFloat(r.amount) || 0;
      a.gross += parseFloat(r.gross_amount != null ? r.gross_amount : r.amount) || 0;
      a.total += amt;
      a.remaining += r.status === 'PAGO' ? 0 : (amt - parseFloat(r.paid_amount || 0));
      return a;
    }, { gross: 0, total: 0, remaining: 0 });
    printReport({
      theme,
      title: onlySelected ? `${L.title} — selecionadas` : L.title,
      periodText: (period?.text || '') + (onlySelected ? ` · ${list.length} conta(s) selecionada(s)` : ''),
      userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema',
      orientation: 'landscape',
      columns: [
        { header: 'Vencimento' }, { header: L.payCol }, { header: 'Origem/Destino' },
        { header: 'Categoria' }, { header: 'Centro de custo' }, { header: 'Método' },
        { header: 'Situação' }, { header: 'Bruto (R$)', align: 'right' }, { header: 'Líquido (R$)', align: 'right' }, { header: 'Pendente (R$)', align: 'right' },
      ],
      rows: list.map(r => [
        fmtDate(r.due_date),
        r.last_payment_date ? fmtDate(r.last_payment_date) : '—',
        counterpartyName(r) || r.description || '—',
        r.finance_categories?.name || '—',
        r.finance_cost_centers?.name || '—',
        paymentMethodLabel(r.payment_method),
        r.status === 'PAGO' ? L.paidStatus : (r.due_date && r.due_date < todayISO() ? 'Vencido' : 'Em aberto'),
        fmt(r.gross_amount != null ? r.gross_amount : r.amount),
        fmt(r.amount),
        fmt(r.status === 'PAGO' ? 0 : (parseFloat(r.amount) - parseFloat(r.paid_amount || 0))),
      ]),
      summary: [
        { label: onlySelected ? 'Bruto selecionado' : 'Bruto do período', value: `R$ ${fmt(totals.gross)}` },
        { label: onlySelected ? 'Líquido selecionado' : 'Líquido do período', value: `R$ ${fmt(totals.total)}` },
        { label: 'Pendente (saldo)', value: `R$ ${fmt(totals.remaining)}` },
      ],
      totalLabel: 'Total de Registros Encontrados',
    });
  };

  // ---- Importar / Exportar (planilha) ----
  const DEFAULT_CC_ID = '30000000-0000-0000-0000-000000000001';
  const partyLabel = isPay ? 'Fornecedor' : 'Pagador';
  const _norm = (s) => String(s ?? '').trim().toLowerCase();
  const _byName = (list, val) => { const n = _norm(val); return n ? list.find(x => _norm(x.name) === n) : null; };
  const _parseBRL = (v) => {
    if (typeof v === 'number') return v; // célula numérica do XLSX (raw) já vem certa
    const s = String(v ?? '0').trim();
    // Ponto decimal puro (1234.56, sem vírgula) → NÃO tratar ponto como milhar
    // (senão reimportar o próprio export multiplica por 100). Vírgula presente = pt-BR.
    if (/^-?\d+\.\d{1,2}$/.test(s.replace(/[^0-9.-]/g, ''))) {
      return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
    }
    return parseFloat(s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  };
  const _parseDate = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    return null;
  };
  // Competência (mês de referência): aceita "MM/AAAA" ou "AAAA-MM". Sem coluna preenchida
  // na planilha, cai no padrão do sistema (mês anterior ao atual).
  const _parseMonth = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
    return null;
  };

  const handleExport = () => {
    const cols = (r) => ({
      'Descrição': r.description || '',
      'Valor': Number(r.amount) || 0,
      'Vencimento': r.due_date ? fmtDate(r.due_date) : '',
      'Data': r.transaction_date ? fmtDate(r.transaction_date) : '',
      'Competência': r.reference_month ? r.reference_month.split('-').reverse().join('/') : '',
      'Conta': r.finance_accounts?.name || '',
      'Categoria': r.finance_categories?.name || '',
      'Centro de Custo': r.finance_cost_centers?.name || '',
      [partyLabel]: r.finance_parties?.name || '',
      'Método': r.payment_method || '',
      'Nº Doc': r.doc_number || '',
      'Status': r.status === 'PAGO' ? (isPay ? 'Pago' : 'Recebido') : 'Pendente',
    });
    let rows = filtered.map(cols);
    if (rows.length === 0) {
      // Planilha-modelo com 1 linha de exemplo (vazia de dados, só pra mostrar o formato).
      rows = [{
        'Descrição': 'Ex: Aluguel maio', 'Valor': '1.500,00', 'Vencimento': '10/05/2026', 'Data': '', 'Competência': '04/2026',
        'Conta': optAccounts[0]?.name || '', 'Categoria': '', 'Centro de Custo': 'Geral',
        [partyLabel]: '', 'Método': 'BOLETO', 'Nº Doc': '', 'Status': 'Pendente',
      }];
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, L.title);
    XLSX.writeFile(wb, `${isPay ? 'contas_a_pagar' : 'contas_a_receber'}_${todayISO()}.xlsx`);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (optAccounts.length === 0) return toast.error('Cadastre ao menos uma conta bancária antes de importar.');
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: false });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      const toInsert = raw.map(r => {
        const description = String(r['Descrição'] ?? r.descricao ?? r.description ?? '').trim();
        const amount = _parseBRL(r['Valor'] ?? r.valor ?? r.amount);
        if (!description || amount <= 0) return null;
        const statusStr = _norm(r['Status'] ?? r.status);
        const status = (statusStr.startsWith('pag') || statusStr.startsWith('realiz') || statusStr.startsWith('receb') || statusStr.startsWith('efetiv')) ? 'PAGO' : 'PENDENTE';
        return {
          account_id: (_byName(optAccounts, r['Conta'] ?? r.conta)?.id) || optAccounts[0].id,
          type,
          amount,
          transaction_date: _parseDate(r['Data'] ?? r.data) || todayISO(),
          due_date: _parseDate(r['Vencimento'] ?? r.vencimento),
          description,
          status,
          payment_method: String(r['Método'] ?? r.metodo ?? '').trim().toUpperCase() || 'OUTRO',
          category_id: _byName(optCategories, r['Categoria'] ?? r.categoria)?.id || null,
          cost_center_id: _byName(optCostCenters, r['Centro de Custo'] ?? r['centro de custo'])?.id || DEFAULT_CC_ID,
          party_id: _byName(optParties, r[partyLabel] ?? r['Fornecedor'] ?? r['Pagador'])?.id || null,
          doc_number: String(r['Nº Doc'] ?? r['N Doc'] ?? r.doc ?? '').trim() || null,
          // Competência é obrigatória; planilha sem a coluna preenchida cai no mês anterior (padrão do sistema).
          reference_month: _parseMonth(r['Competência'] ?? r.competencia) || prevMonthISO(),
        };
      }).filter(Boolean);
      if (toInsert.length === 0) { toast.error('Planilha sem linhas válidas (precisa de "Descrição" e "Valor").'); setImporting(false); return; }
      await Promise.all(toInsert.map(t => financeService.createTransaction(t)));
      toast.success(`${toInsert.length} lançamento(s) importado(s).`);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao importar a planilha. Verifique o formato (use o Exportar como modelo).');
    } finally { setImporting(false); }
  };

  // Faixa de totais (Vencidos / Vencem hoje / A vencer / Pagos / Total).
  const totals = useMemo(() => {
    const today = todayISO();
    let vencidos = 0, hoje = 0, aVencer = 0, pagos = 0, total = 0;
    rows.forEach(r => {
      if (r.transfer_group_id) return; // transferências não entram nas somas de contas a pagar/receber
      const amt = parseFloat(r.amount) || 0;
      total += amt;
      if (r.status === 'PAGO') { pagos += amt; return; }
      const due = r.due_date;
      if (!due) { aVencer += amt; return; }
      if (due < today) vencidos += amt;
      else if (due === today) hoje += amt;
      else aVencer += amt;
    });
    return { vencidos, hoje, aVencer, pagos, total };
  }, [rows]);

  const openNew = () => { setEditId(null); setModalOpen(true); };
  const openEdit = (id) => { setEditId(id); setModalOpen(true); };

  // Conciliado é protegido: precisa desconciliar antes de editar/excluir/estornar.
  const doUnreconcile = async (r) => {
    if (!(await askConfirm({
      title: 'Remover conciliação',
      message: 'Isto desfaz a conciliação com o extrato: a linha do banco volta para "pendente" e o lançamento fica liberado para editar/excluir/estornar. Baixas feitas pela conciliação são estornadas. O lançamento não é apagado.',
      confirmLabel: 'Remover conciliação', tone: 'primary'
    }))) return;
    try {
      await financeService.unreconcileTransaction(r.id);
      toast.success('Conciliação removida.');
      loadData();
    } catch (e) { console.error(e); toast.error(e.message || 'Erro ao desconciliar.'); }
  };

  // Abre o modal de baixa (pagamento/recebimento com parcial + estorno) — não é mais 1 clique.
  const openBaixa = (r) => setBaixaRow(r);

  const remove = async (r) => {
    // Recorrente → pergunta o escopo num diálogo dedicado.
    if (r.recurrence_id) { setDelRow(r); return; }
    // Parcela ou linha de rateio → pergunta se apaga só ela ou o grupo.
    if (r.installment_group_id) { setDelGroup({ row: r, kind: 'installment' }); return; }
    if (r.split_group_id) { setDelGroup({ row: r, kind: 'split' }); return; }
    if (!(await askConfirm({ title: 'Excluir lançamento', message: 'Deseja excluir este lançamento?', confirmLabel: 'Excluir' }))) return;
    try {
      await financeService.deleteTransaction(r.id);
      toast.success('Lançamento excluído.');
      loadData();
    } catch (e) { console.error(e); toast.error('Erro ao excluir.'); }
  };

  const removeScoped = async (scope) => {
    if (!delRow) return;
    setDelBusy(true);
    try {
      await financeService.deleteRecurrenceScope(delRow, scope);
      toast.success('Lançamento(s) excluído(s).');
      setDelRow(null);
      loadData();
    } catch (e) { console.error(e); toast.error('Erro ao excluir.'); }
    finally { setDelBusy(false); }
  };

  const removeGroupScoped = async (scope) => {
    if (!delGroup) return;
    setDelBusy(true);
    try {
      if (delGroup.kind === 'installment') {
        await financeService.deleteInstallmentScope(delGroup.row, scope);
      } else {
        // Rateio: 'this' = só a linha clicada; 'all' = o grupo inteiro.
        if (scope === 'all') await financeService.deleteSplitGroup(delGroup.row.split_group_id);
        else await financeService.deleteTransaction(delGroup.row.id);
      }
      toast.success('Lançamento(s) excluído(s).');
      setDelGroup(null);
      loadData();
    } catch (e) { console.error(e); toast.error(e.code === 'HAS_PAYMENTS' ? e.message : 'Erro ao excluir.'); }
    finally { setDelBusy(false); }
  };

  const statusBadge = (r) => {
    if (r.status === 'PAGO') return <Dot tone="ok">{L.paidStatus}</Dot>;
    if (r.status === 'PARCIAL') return <Dot tone="warn">Parcial</Dot>;
    if (r.status === 'LANCADO') return <Dot tone="info">Lançada</Dot>;
    const today = todayISO();
    const overdue = r.due_date && r.due_date < today;
    return <Dot tone={overdue ? 'bad' : 'neutral'}>{overdue ? 'Vencido' : 'Em aberto'}</Dot>;
  };

  // isTotal: o "Total do período" é agregador, não um recorte — ganha um filete
  // de separação em vez do fundo cinza, que lia como campo desabilitado.
  const Kpi = ({ label, value, color, statusKey, isTotal }) => {
    // O Total nunca acende: 'all' é o estado padrão, então destacá-lo deixaria
    // esse bloco permanentemente marcado — que era justamente o que fazia ele
    // parecer desabilitado. Ele só reage ao hover e serve para limpar o recorte.
    const active = statusKey && fStatus === statusKey && !isTotal;
    return (
      <button
        type="button"
        onClick={() => statusKey && setFStatus(active ? 'all' : statusKey)}
        title={statusKey ? 'Clique para filtrar por esta situação' : undefined}
        className={`flex-1 px-4 py-3 text-left transition-colors ${statusKey ? 'cursor-pointer hover:bg-black/[.02]' : 'cursor-default'} ${active ? 'bg-[#0071e3]/[.06]' : 'bg-white'} ${isTotal ? 'col-span-2 md:border-l-2 border-black/[.12]' : ''}`}
      >
        <div className={`${cup.label} ${active ? 'text-[#0071e3]' : ''}`}>{label} (R$)</div>
        <div className={`text-[16px] font-semibold tabular-nums tracking-[-.01em] mt-1 ${color}`}>{value}</div>
      </button>
    );
  };

  return (
    <div className={`px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] ${cup.page} font-sans ${cup.text}`}>

      {/* Cabeçalho: período + busca + novo */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div>
          <h1 className={`${cup.title} flex items-center gap-2`}>
            {isPay ? <ArrowUpCircle size={17} className="text-[#d70015]" /> : <ArrowDownCircle size={17} className="text-[#248a3d]" />}
            {L.title}
          </h1>
        </div>

        {/* Período de vencimento: mês, dia, atalhos (hoje, próxima semana…) ou intervalo */}
        <DuePeriodPicker onChange={setPeriod} />

        {/* Busca */}
        <div className="flex items-center gap-2 px-3 bg-white border border-black/[.085] rounded-lg h-9 flex-1 min-w-[180px] max-w-sm focus-within:border-[#0071e3] transition-colors">
          <Search size={14} className="text-[#86868b]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar no período"
            className="bg-transparent text-[11.5px] font-medium text-[#1d1d1f] placeholder:text-[#86868b] outline-none w-full" />
        </div>

        {/* Uma única ação primária no topo. Imprimir/Exportar/Importar são
            ações ocasionais — saem do caminho, sem sair do alcance. */}
        <div className="flex items-center gap-1.5 ml-auto">
          {selectedIds.size > 0 && (
            <button onClick={() => handlePrint(true)} title="Imprimir somente as contas marcadas" className={cup.btn}>
              <Printer size={14} /> Imprimir selecionados ({selectedIds.size})
            </button>
          )}
          <MoreMenu items={[
            { icon: Printer, label: 'Imprimir lista', onClick: () => handlePrint(false), title: 'Imprimir a lista atual (respeita os filtros)' },
            { icon: Download, label: 'Exportar planilha', onClick: handleExport, title: 'Exportar (também serve de modelo p/ importar)' },
            canEdit && { icon: Upload, label: 'Importar planilha', file: true, accept: '.xlsx,.xls', onChange: handleImport, busy: importing, title: 'Importar lançamentos de uma planilha (use o modelo do Exportar)' },
          ]} />
          {canEdit && (
            <button onClick={openNew} className={cup.btnPrimary}>
              <Plus size={14} /> {L.newLabel}
            </button>
          )}
        </div>
      </div>

      {/* Filtros: Situação e busca (uso diário) ficam à vista; os demais moram
          no popover. Nada fica escondido sem aviso — cada filtro ativo vira um
          chip removível aqui do lado. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={cup.select}>
          <option value="all">Situação: todas</option>
          <option value="PENDENTE">Em aberto</option>
          {isPay && <option value="LANCADO">Lançadas p/ Pagamento</option>}
          <option value="overdue">Vencidos</option>
          <option value="PAGO">{L.paidLabel}</option>
        </select>

        <FilterPopover count={advancedCount} onClear={clearFilters} hasAny={hasActiveFilters}>
          <div>
            <label className={filtroRotulo}>Centro de custo</label>
            <SearchableSelect size="sm" allowEmpty emptyLabel="Todos"
              options={optCostCenters.map(c => ({ value: c.id, label: c.name }))}
              value={fCostCenter === 'all' ? '' : fCostCenter}
              onChange={(v) => setFCostCenter(v || 'all')} searchPlaceholder="Buscar centro de custo…" />
          </div>
          <div>
            <label className={filtroRotulo}>Categoria</label>
            <SearchableSelect size="sm" allowEmpty emptyLabel="Todas"
              options={optCategories.map(c => ({ value: c.id, label: c.name }))}
              value={fCategory === 'all' ? '' : fCategory}
              onChange={(v) => setFCategory(v || 'all')} searchPlaceholder="Buscar categoria…" />
          </div>
          <div>
            <label className={filtroRotulo}>Origem / Destino</label>
            <SearchableSelect size="sm" allowEmpty emptyLabel="Todos"
              options={optParties.map(p => ({ value: p.id, label: p.name }))}
              value={fParty === 'all' ? '' : fParty}
              onChange={(v) => setFParty(v || 'all')} searchPlaceholder="Buscar origem/destino…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={filtroRotulo}>Método</label>
              <select value={fMethod} onChange={e => setFMethod(e.target.value)} className={`${cup.select} w-full`}>
                <option value="all">Todos</option>
                {optMethods.map(m => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
              </select>
            </div>
            <div>
              <label className={filtroRotulo}>Conciliação</label>
              <select value={fConcil} onChange={e => setFConcil(e.target.value)} className={`${cup.select} w-full`}>
                <option value="all">Todas</option>
                <option value="yes">Conciliados</option>
                <option value="no">Não conciliados</option>
              </select>
            </div>
          </div>
          <div>
            <label className={filtroRotulo}>Faixa de valor (R$)</label>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="decimal" placeholder="mín" value={fMin} onChange={e => setFMin(e.target.value)}
                className="h-9 flex-1 min-w-0 px-2 bg-white border border-black/[.085] rounded-lg text-[11.5px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3]" />
              <span className="text-[#86868b] text-xs shrink-0">–</span>
              <input type="number" inputMode="decimal" placeholder="máx" value={fMax} onChange={e => setFMax(e.target.value)}
                className="h-9 flex-1 min-w-0 px-2 bg-white border border-black/[.085] rounded-lg text-[11.5px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3]" />
            </div>
          </div>
        </FilterPopover>

        <FilterChips chips={chipsAtivos} />

        <span className={`ml-auto ${cup.label} normal-case tracking-normal text-[10.5px] tabular-nums`}>{filtered.length} de {rows.length}</span>
      </div>

      {/* Faixa de totais */}
      <div className="bg-black/[.085] border border-black/[.085] rounded-xl grid grid-cols-2 md:flex items-stretch gap-px mb-3 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04)]">
        {/* Um único vermelho — o que exige ação hoje. "Vencem hoje" é atenção
            (âmbar), não alarme: dois vermelhos lado a lado anulavam um ao outro. */}
        <Kpi label="Vencidos" value={fmt(totals.vencidos)} color="text-[#d70015]" statusKey="overdue" />
        <Kpi label="Vencem hoje" value={fmt(totals.hoje)} color="text-[#bf7a00]" statusKey="today" />
        <Kpi label="A vencer" value={fmt(totals.aVencer)} color="text-[#0071e3]" statusKey="upcoming" />
        <Kpi label={L.paidLabel} value={fmt(totals.pagos)} color="text-[#248a3d]" statusKey="PAGO" />
        <Kpi label="Total do período" value={fmt(totals.total)} color="text-[#1d1d1f]" statusKey="all" isTotal />
      </div>

      {/* Barra de Ações em Lote ao Selecionar Checkboxes */}
      {selectedIds.size > 0 && canEdit && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 bg-[#7c3aed]/[.08] border border-[#7c3aed]/25 p-3 rounded-xl shadow-sm transition-all animate-in fade-in duration-200">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-bold text-[#7c3aed]">
              {selectedTotals.count} selecionado{selectedTotals.count === 1 ? '' : 's'}
            </span>
            <span className="text-[11.5px] text-slate-600">
              Bruto: <strong className="text-slate-900">R$ {fmt(selectedTotals.bruto)}</strong>
            </span>
            <span className="text-[11.5px] text-slate-600">
              Líquido: <strong className="text-slate-900">R$ {fmt(selectedTotals.liquido)}</strong>
            </span>
            <span className="text-[11.5px] text-slate-600">
              Pendente: <strong className="text-amber-700">R$ {fmt(selectedTotals.pendente)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isPay && (
              <button
                type="button"
                onClick={() => handleBulkStatusChange('LANCADO')}
                className="h-8 px-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={13} /> Lançar p/ Pagamento
              </button>
            )}
            {isPay && (
              <button
                type="button"
                onClick={() => handleBulkStatusChange('PENDENTE')}
                className="h-8 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Voltar p/ Pendente
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkSettleRows(filtered.filter(r => selectedIds.has(r.id)))}
              title={`Informar data, conta e forma — cada conta é baixada pelo saldo em aberto dela`}
              className="h-8 px-3 bg-[#248a3d] hover:bg-[#1e7233] text-white rounded-lg text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Banknote size={13} /> {isPay ? 'Dar Baixa (Pagamento)' : 'Registrar Recebimento'}
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="h-8 px-3 bg-[#d70015] hover:bg-[#b50012] text-white rounded-lg text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 size={13} /> Excluir Selecionados
            </button>
            <button
              type="button"
              onClick={() => handlePrint(true)}
              className="h-8 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={13} /> Imprimir Selecionados
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 ml-2 cursor-pointer"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className={`${cup.card} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={30} className="text-[#0071e3] animate-spin" /></div>
        ) : (<>
          {/* Celular: cartões com o que decide o dia — quem, quanto, quando e a
              situação — e o botão de baixa à mão. Tocar abre para editar. */}
          <div className="md:hidden divide-y divide-black/[.055] px-4">
            {filtered.length === 0 ? (
              <p className={`py-10 text-center text-[11.5px] font-medium ${cup.muted}`}>Nenhum lançamento neste período</p>
            ) : filtered.map(r => {
              const cp = counterpartyName(r);
              const pend = r.status === 'PAGO' ? 0 : (parseFloat(r.amount) - parseFloat(r.paid_amount || 0));
              const travado = !!r.imported_transaction_id;
              return (
                <div key={r.id} className="py-3 flex items-start gap-3">
                  <button type="button" disabled={!canEdit || travado} onClick={() => openEdit(r.id)} className="flex-1 min-w-0 text-left">
                    <span className="block truncate text-[13.5px] font-semibold text-[#1d1d1f]">
                      {cp || r.description || '—'}
                      {r.installment_total > 1 && <span className={`ml-1.5 text-[10px] font-medium ${cup.muted}`}>{r.installment_number}/{r.installment_total}</span>}
                    </span>
                    {cp && r.description && r.description !== cp && <span className={`block text-[11.5px] ${cup.muted} truncate`}>{r.description}</span>}
                    <span className={`mt-1 flex items-center gap-2 text-[11px] ${cup.muted} tabular-nums`}>
                      vence {fmtDate(r.due_date)}
                      {statusBadge(r)}
                      {travado && <Link2 size={11} className="text-[#248a3d]" />}
                      {Array.isArray(r.attachments) && r.attachments.length > 0 && <Paperclip size={11} className="text-[#0071e3]" />}
                    </span>
                  </button>
                  <div className="text-right shrink-0">
                    <div className={`text-[14px] font-bold ${cup.text} tabular-nums`}>R$ {fmt(r.amount)}</div>
                    {pend > 0.004 && r.status === 'PARCIAL' && <div className={`text-[10.5px] font-semibold tabular-nums ${cup.warn}`}>falta {fmt(pend)}</div>}
                    {canEdit && !travado && r.status !== 'PAGO' && (
                      <button type="button" onClick={() => openBaixa(r)}
                        className="mt-1.5 h-8 px-3 rounded-lg bg-[#248a3d]/10 text-[#248a3d] text-[11px] font-bold inline-flex items-center gap-1 active:bg-[#248a3d]/20">
                        <CheckCircle2 size={12} /> {isPay ? 'Pagar' : 'Receber'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length > 0 && (
              <div className={`py-3 text-[12px] ${cup.muted} tabular-nums`}>
                <div>{filtered.length} lançamento(s){hasActiveFilters ? ' (filtrado)' : ''}</div>
                <div className="mt-0.5">Total <b className={cup.text}>R$ {fmt(filteredTotals.total)}</b> · falta <b className={cup.warn}>R$ {fmt(filteredTotals.remaining)}</b></div>
              </div>
            )}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${cup.hairline}`}>
                  <th className={`${cup.th} w-8 text-center`}>
                    <input type="checkbox" aria-label="Selecionar todos os visíveis"
                      checked={allVisibleSelected}
                      ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                      onChange={toggleAllVisible}
                      className="w-3.5 h-3.5 accent-[#0071e3] cursor-pointer align-middle" />
                  </th>
                  {/* Uma coluna de data (a de pagamento aparece embaixo, quando existe)
                      e uma de valor (o bruto só aparece quando difere, por retenção). */}
                  <th className={cup.th}>Vencimento</th>
                  <th className={cup.th}>Resumo do lançamento</th>
                  <th className={`${cup.th} text-right`}>Valor (R$)</th>
                  <th className={`${cup.th} text-right`}>{L.remCol} (R$)</th>
                  <th className={cup.th}>Situação</th>
                  {/* Anexo e conciliação são a mesma pergunta feita de dois jeitos —
                      "esse lançamento tem papel?" — então ficam lado a lado, em
                      coluna fixa. Fora daqui, o indicador competia por espaço com
                      centro de custo, categoria e descrição, e sumia. */}
                  <th className={`${cup.th} text-center`}>Anexo</th>
                  <th className={`${cup.th} text-center`}>Concil.</th>
                  <th className={`${cup.th} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.055]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className={`py-10 text-center text-[11.5px] font-medium ${cup.muted}`}>Nenhum lançamento neste período</td></tr>
                ) : filtered.map(r => {
                  return (
                    <tr key={r.id} className={`group ${cup.hover} transition-colors text-[12px] ${selectedIds.has(r.id) ? 'bg-[#0071e3]/[.04]' : ''}`}>
                      <td className="py-2 px-3 text-center align-top">
                        <input type="checkbox" aria-label="Selecionar lançamento"
                          checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)}
                          className="w-3.5 h-3.5 accent-[#0071e3] cursor-pointer align-middle mt-0.5" />
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <div className={`font-medium ${cup.text} tabular-nums text-[11.5px] leading-tight`}>{fmtDate(r.due_date)}</div>
                        <div className={`text-[10px] ${cup.muted} tabular-nums leading-tight mt-0.5 ${r.last_payment_date ? '' : 'invisible'}`}>
                          pago {r.last_payment_date ? fmtDate(r.last_payment_date).slice(0, 5) : '—'}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        {(() => {
                          const cp = counterpartyName(r);
                          // Linha 2 tem ordem fixa: centro de custo · categoria · competência.
                          // Os avulsos (parcela, rateio, NF, retenção, descrição) vão
                          // depois, todos com o mesmo peso — antes cada um tinha cor própria
                          // e ordem variável, o que fazia a coluna parecer um enxame.
                          const extras = [];
                          if (r.installment_total > 1) extras.push({ k: 'parc', t: `${r.installment_number}/${r.installment_total}` });
                          if (r.split_group_id) extras.push({ k: 'rat', t: 'rateio' });
                          if (r.doc_number) extras.push({ k: 'nf', t: `NF ${r.doc_number}` });
                          if (r.gross_amount != null) extras.push({
                            k: 'ret',
                            t: `ret. ${r.withheld_pct != null ? `${parseFloat(r.withheld_pct).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%` : `R$ ${fmt(r.withheld_amount)}`}`,
                            title: `Nota bruta de R$ ${fmt(r.gross_amount)} − R$ ${fmt(r.withheld_amount)} de impostos retidos na fonte = líquido R$ ${fmt(r.amount)}`,
                          });
                          if (cp && r.description && r.description !== cp) extras.push({ k: 'desc', t: r.description });
                          return (
                            <>
                              <div className="font-medium text-[#1d1d1f] leading-tight truncate">{cp || r.description || '—'}</div>
                              <div className="flex items-center gap-x-2 mt-0.5 text-[10px] whitespace-nowrap overflow-hidden">
                                {r.finance_cost_centers?.name && (
                                  <span className={`inline-flex items-center gap-1.5 ${cup.muted} shrink-0`}>
                                    <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ backgroundColor: r.finance_cost_centers.color || '#86868b' }} />
                                    {r.finance_cost_centers.name}
                                  </span>
                                )}
                                {r.finance_categories?.name && (
                                  <span className={`inline-flex items-center gap-1.5 ${cup.muted} shrink-0`}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.finance_categories.color || '#86868b' }} />
                                    {r.finance_categories.name}
                                  </span>
                                )}
                                {r.reference_month && (
                                  <span title="Competência (mês de referência)" className={`${cup.muted} shrink-0`}>comp. {r.reference_month.split('-').reverse().join('/')}</span>
                                )}
                                {extras.map(e => (
                                  <span key={e.k} title={e.title} className={`${cup.muted} shrink-0 truncate max-w-[160px]`}>{e.t}</span>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      {/* Valor = o líquido (o que se paga). O bruto só entra quando
                          difere dele, ou seja, quando há retenção — que é quando importa. */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className={`font-semibold ${cup.text} tabular-nums leading-tight`}>{fmt(r.amount)}</div>
                        {r.gross_amount != null && (
                          <div className={`text-[10px] ${cup.muted} tabular-nums leading-tight mt-0.5`}
                            title={`Nota bruta de R$ ${fmt(r.gross_amount)} − impostos retidos = líquido R$ ${fmt(r.amount)}`}>
                            bruto {fmt(r.gross_amount)}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-[11.5px]">
                        {(() => {
                          const pend = r.status === 'PAGO' ? 0 : (parseFloat(r.amount) - parseFloat(r.paid_amount || 0));
                          return pend > 0.004
                            ? <span className={`font-semibold ${cup.warn}`}>{fmt(pend)}</span>
                            : <span className="text-black/20">0,00</span>;
                        })()}
                      </td>
                      <td className="py-2 px-3">{statusBadge(r)}</td>
                      <td className="py-2 px-3 text-center">
                        {Array.isArray(r.attachments) && r.attachments.length > 0 ? (
                          <a
                            href={r.attachments[0].url}
                            onClick={aoClicarNoArquivo(r.attachments[0].path || r.attachments[0].url, 'documentos')}
                            title={r.attachments.length === 1
                              ? `Abrir anexo: ${r.attachments[0].name}`
                              : `${r.attachments.length} anexos: ${r.attachments.map(a => a.name).join(', ')} — abre o primeiro`}
                            className="inline-flex items-center gap-0.5 text-[#0071e3] hover:opacity-70 transition-opacity"
                          >
                            <Paperclip size={14} />
                            {r.attachments.length > 1 && <span className="text-[9.5px] font-semibold">{r.attachments.length}</span>}
                          </a>
                        ) : (
                          <span title="Sem anexo"><Paperclip size={14} className="text-black/15 inline" /></span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {r.imported_transaction_id
                          ? <span title="Conciliado com o extrato bancário"><Link2 size={14} className="text-[#248a3d] inline" /></span>
                          : <span title="Não conciliado"><Link2 size={14} className="text-black/15 inline" /></span>}
                      </td>
                      <td className="py-2 px-3">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                            {r.imported_transaction_id ? (
                              <button onClick={() => doUnreconcile(r)}
                                title="Conciliado com o extrato — remova a conciliação para editar/excluir/estornar"
                                className="flex items-center gap-1 h-7 px-2 text-[#0071e3] hover:bg-black/[.04] rounded-lg transition-colors text-[10.5px] font-medium whitespace-nowrap">
                                <Unlink size={13} /> Desconciliar
                              </button>
                            ) : (
                              <>
                                <button onClick={() => openBaixa(r)}
                                  title={r.status === 'PAGO' ? 'Ver / estornar baixa' : (isPay ? 'Dar baixa (pagar)' : 'Registrar recebimento')}
                                  className={`p-1.5 rounded-lg transition-colors hover:bg-black/[.04] ${r.status === 'PAGO' ? 'text-[#248a3d]' : r.status === 'PARCIAL' ? 'text-[#bf7a00]' : 'text-[#86868b] hover:text-[#248a3d]'}`}>
                                  <CheckCircle2 size={15} />
                                </button>
                                {isPay && r.status !== 'PAGO' && r.status !== 'LANCADO' && (
                                  <button onClick={() => handleSetStatus(r.id, 'LANCADO')}
                                    title="Marcar como Lançada p/ Pagamento (Aguardando Liberação)"
                                    className="p-1.5 text-[#86868b] hover:text-[#7c3aed] hover:bg-black/[.04] rounded-lg transition-colors">
                                    <Send size={14} />
                                  </button>
                                )}
                                {isPay && r.status === 'LANCADO' && (
                                  <button onClick={() => handleSetStatus(r.id, 'PENDENTE')}
                                    title="Voltar para Pendente"
                                    className="p-1.5 text-[#7c3aed] hover:text-[#86868b] hover:bg-black/[.04] rounded-lg transition-colors">
                                    <Send size={14} className="rotate-180" />
                                  </button>
                                )}
                                <button onClick={() => openEdit(r.id)} title="Editar"
                                  className="p-1.5 text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] rounded-lg transition-colors"><Edit2 size={14} /></button>
                                {/* Respiro antes da lixeira: excluir não pode ficar
                                    colada nas ações do dia a dia. */}
                                <span className="w-2" />
                                <button onClick={() => remove(r)} title="Excluir"
                                  className="p-1.5 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-lg transition-colors"><Trash2 size={14} /></button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className={`border-t ${cup.hairline} text-[12px]`}>
                    {/* 3 + 1 + 1 + 4 = as 9 colunas do cabeçalho. Estava 5 + 1 + 1 + 3
                        (dez células para oito colunas), e por isso os dois totais
                        apareciam deslocados para a direita, sob Situação e Concil.,
                        em vez de embaixo de Valor e A pagar. */}
                    <td colSpan={3} className={`py-2.5 px-4 ${cup.label} normal-case tracking-normal text-[10.5px]`}>
                      {filtered.length} lançamento(s){hasActiveFilters ? ' (filtrado)' : ''}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-semibold ${cup.text} tabular-nums whitespace-nowrap`}>R$ {fmt(filteredTotals.total)}</td>
                    <td className={`py-2.5 px-3 text-right font-semibold ${cup.warn} tabular-nums whitespace-nowrap`}>R$ {fmt(filteredTotals.remaining)}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>)}
        {selectedTotals.count > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 mt-2 tabular-nums bg-[#7c3aed]/[.07] border border-[#7c3aed]/25 rounded-xl shadow-sm">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[11.5px] font-bold text-[#7c3aed]">{selectedTotals.count} selecionado{selectedTotals.count === 1 ? '' : 's'}</span>
              <span className={`text-[11.5px] ${cup.muted}`}>Bruto <span className="font-semibold text-[#1d1d1f]">R$ {fmt(selectedTotals.bruto)}</span></span>
              <span className={`text-[11.5px] ${cup.muted}`}>Líquido <span className="font-semibold text-[#1d1d1f]">R$ {fmt(selectedTotals.liquido)}</span></span>
              <span className={`text-[11.5px] ${cup.muted}`}>Pendente <span className={`font-semibold ${cup.warn}`}>R$ {fmt(selectedTotals.pendente)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && isPay && (
                <>
                  <button
                    onClick={() => handleBulkStatusChange('LANCADO')}
                    className="px-3 py-1.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Send size={13} /> Marcar Lançada(s) p/ Pagamento
                  </button>
                  <button
                    onClick={() => handleBulkStatusChange('PENDENTE')}
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-[11px] font-semibold transition-colors"
                  >
                    Voltar p/ Pendente
                  </button>
                </>
              )}
              <button onClick={clearSelection} className="text-[10.5px] font-medium text-[#86868b] hover:text-[#d70015] ml-2">Limpar seleção</button>
            </div>
          </div>
        )}
      </div>

      {baixaRow && (
        <BaixaModal
          row={baixaRow}
          accounts={optAccounts}
          onClose={() => setBaixaRow(null)}
          onDone={loadData}
        />
      )}

      {bulkSettleRows && (
        <BulkSettleModal
          rows={bulkSettleRows}
          accounts={optAccounts}
          onClose={() => setBulkSettleRows(null)}
          onDone={() => { setSelectedIds(new Set()); loadData(true); }}
        />
      )}

      <TransactionModal
        isOpen={modalOpen}
        transactionId={editId}
        presetType={type}
        onClose={() => setModalOpen(false)}
        onSave={loadData}
      />

      <RecurrenceScopeDialog
        open={!!delRow}
        busy={delBusy}
        title="Excluir conta fixa"
        description="Esta conta se repete. O que você quer excluir? (Parcelas já realizadas são preservadas.)"
        onPick={removeScoped}
        onClose={() => setDelRow(null)}
      />

      {/* Escopo de exclusão: parcelamento ou rateio */}
      <RecurrenceScopeDialog
        open={!!delGroup}
        busy={delBusy}
        title={delGroup?.kind === 'installment' ? 'Excluir parcelas' : 'Excluir rateio'}
        description={delGroup?.kind === 'installment'
          ? `Este lançamento é a parcela ${delGroup?.row?.installment_number}/${delGroup?.row?.installment_total} de um parcelamento. O que você quer excluir? (Parcelas já pagas são preservadas.)`
          : 'Este lançamento é uma linha de um rateio (dividido em categorias). O que você quer excluir?'}
        labels={delGroup?.kind === 'installment'
          ? { this: delGroup?.row?.split_group_id ? 'Só esta parcela (com o rateio do mês)' : 'Só esta parcela', future: 'Esta e as próximas', all: 'Todas as parcelas pendentes' }
          : { this: 'Só esta linha', all: 'O rateio inteiro' }}
        hideFuture={delGroup?.kind === 'split'}
        onPick={removeGroupScoped}
        onClose={() => setDelGroup(null)}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
    </div>
  );
}
