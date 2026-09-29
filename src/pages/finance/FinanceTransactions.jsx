import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { financeService } from '../../services/financeService';
import { supabase } from '../../services/supabase';
import { aoClicarNoArquivo } from '../../services/arquivos';
import {
  Plus, Edit2, Trash2, ArrowUpRight, ArrowDownLeft, Calendar,
  Filter, Search, RefreshCw, Landmark, CreditCard, Loader2, DollarSign,
  TrendingUp, CheckCircle, Clock, Repeat2, Lock, Unlink, Printer, Download, Paperclip, Send
} from 'lucide-react';
import { FilterPopover, FilterChips, filtroRotulo } from '../../components/finance/FilterPopover';
import toast from 'react-hot-toast';
import TransactionModal from '../../components/finance/TransactionModal';
import BaixaModal from '../../components/finance/BaixaModal';
import SearchableSelect from '../../components/finance/SearchableSelect';
import RecurrenceScopeDialog from '../../components/finance/RecurrenceScopeDialog';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TransferModal from '../../components/finance/TransferModal';
import FinancePeriodBar from '../../components/finance/FinancePeriodBar';
import { todayISO, formatDateBR } from '../../utils/date';
import { paymentMethodLabel } from '../../components/finance/paymentMethods';
import { printReport } from '../../utils/printReport';
import { counterpartyName } from '../../utils/financeCounterparty';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../contexts/PermissionContext';
import { cup, Dot } from '../../components/finance/cupertino';
import CurrencyInput from '../../components/finance/CurrencyInput';
import { useFinanceRealtime } from '../../hooks/useFinanceRealtime';

export default function FinanceTransactions({ initialView = 'extract' }) {
  const [searchParams] = useSearchParams();
  const { theme } = useWhiteLabel();
  const { currentUser } = useAuth();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('Editar Financeiro'); // sem ela: modo somente-leitura
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState(initialView); // 'extract' ou 'flow'
  
  // Data States
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  
  // Modais
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState(null);
  const [delRow, setDelRow] = useState(null); // linha recorrente aguardando escolha de escopo
  const [delGroup, setDelGroup] = useState(null); // { row, kind: 'installment' | 'split' } aguardando escopo
  const [delBusy, setDelBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [baixaTx, setBaixaTx] = useState(null); // lançamento com o modal de baixas aberto (dar baixa / estornar)
  const [confirmState, setConfirmState] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // seleção múltipla (só p/ somar o total dos marcados)
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const closeConfirm = (ok) => { if (confirmState) confirmState.resolve(ok); setConfirmState(null); };
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  
  // Form de Nova Conta
  const [accountForm, setAccountForm] = useState({ name: '', bank_name: '', agency: '', account_number: '', initial_balance: 0, initial_balance_date: todayISO() });

  // Filtros de Lançamento
  const [filters, setFilters] = useState({
    accountId: '',
    categoryId: '',
    type: '',
    status: '',
    startDate: '',
    endDate: ''
  });
  const [search, setSearch] = useState('');  // busca livre (descrição, valor, data, categoria, conta, método, nº doc…)
  // Filtros adicionais aplicados em memória (não recarregam a query).
  const [xFilters, setXFilters] = useState({ categoryId: '', costCenterId: '', method: '', party: '', minVal: '', maxVal: '' });
  const xActive = xFilters.categoryId || xFilters.costCenterId || xFilters.method || xFilters.party || xFilters.minVal || xFilters.maxVal;

  const limparFiltros = () => {
    setSearch('');
    setFilters(f => ({ ...f, accountId: '', categoryId: '', type: '', status: '' }));
    setXFilters({ categoryId: '', costCenterId: '', method: '', party: '', minVal: '', maxVal: '' });
  };

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setFilters(f => ({ ...f, status: statusParam }));
    }
  }, [searchParams]);

  useEffect(() => {
    loadInitialData();
  }, [filters]);

  // Listas de opções derivadas dos lançamentos carregados (evita buscas extras).
  const optCategories = useMemo(() => {
    const m = new Map();
    transactions.forEach(t => { if (t.finance_categories?.name) m.set(t.finance_categories.name, true); });
    return [...m.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [transactions]);
  const optCostCenters = useMemo(() => {
    const m = new Map();
    transactions.forEach(t => { if (t.finance_cost_centers?.name) m.set(t.finance_cost_centers.name, true); });
    return [...m.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [transactions]);
  const optMethods = useMemo(() => {
    const m = new Map();
    transactions.forEach(t => { if (t.payment_method) m.set(t.payment_method, true); });
    return [...m.keys()];
  }, [transactions]);
  const optParties = useMemo(() => {
    const m = new Map();
    transactions.forEach(t => { const n = counterpartyName(t); if (n) m.set(n, true); });
    return [...m.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [transactions]);

  // Chips do que está filtrando dentro do popover — recolher filtro só é seguro
  // se ele continuar visível em algum lugar.
  const chipsAtivos = useMemo(() => {
    const cs = [];
    if (filters.accountId) cs.push({ key: 'acc', label: accounts.find(a => a.id === filters.accountId)?.name || 'Conta', clear: () => setFilters(f => ({ ...f, accountId: '' })) });
    if (xFilters.categoryId) cs.push({ key: 'cat', label: xFilters.categoryId, clear: () => setXFilters(f => ({ ...f, categoryId: '' })) });
    if (xFilters.costCenterId) cs.push({ key: 'cc', label: xFilters.costCenterId, clear: () => setXFilters(f => ({ ...f, costCenterId: '' })) });
    if (xFilters.party) cs.push({ key: 'party', label: xFilters.party, clear: () => setXFilters(f => ({ ...f, party: '' })) });
    if (xFilters.method) cs.push({ key: 'met', label: paymentMethodLabel(xFilters.method), clear: () => setXFilters(f => ({ ...f, method: '' })) });
    if (xFilters.minVal || xFilters.maxVal) cs.push({ key: 'val', label: `R$ ${xFilters.minVal || '0'} – ${xFilters.maxVal || '∞'}`, clear: () => setXFilters(f => ({ ...f, minVal: '', maxVal: '' })) });
    return cs;
  }, [filters.accountId, xFilters, accounts]);

  const loadInitialData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [accs, cats, txs] = await Promise.all([
        financeService.getAccounts(),
        financeService.getCategories(),
        financeService.getTransactions(filters)
      ]);
      setAccounts(accs || []);
      setCategories(cats || []);
      setTransactions(txs || []);
    } catch (error) {
      console.error(error);
      if (!silent) toast.error('Erro ao carregar dados financeiros.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Tempo real: recarrega sozinha (sem piscar spinner) quando qualquer lançamento/saldo muda.
  useFinanceRealtime(() => loadInitialData(true));

  const handleSetStatus = async (id, newStatus) => {
    try {
      await financeService.updateTransactionsStatus([id], newStatus);
      const label = newStatus === 'LANCADO' ? 'Lançada para pagamento' : 'Pendente';
      toast.success(`Conta alterada para ${label}!`);
      loadInitialData(true);
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
      message: `Deseja alterar o status de ${selectedIds.size} conta(s) selecionada(s) para ${label}?`,
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;
    try {
      await financeService.updateTransactionsStatus([...selectedIds], newStatus);
      toast.success(`${selectedIds.size} conta(s) alterada(s) para ${label}!`);
      setSelectedIds(new Set());
      loadInitialData(true);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status das contas.');
    }
  };

  // Busca livre nos lançamentos já carregados (dentro do período/filtros atuais).
  const normTxt = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const shownTx = useMemo(() => {
    const q = normTxt(search.trim());
    const min = parseFloat(String(xFilters.minVal).replace(',', '.'));
    const max = parseFloat(String(xFilters.maxVal).replace(',', '.'));
    return transactions.filter(t => {
      // Modo COMPETÊNCIA no Extrato: mostra só quem TEM competência (não puxa os sem
      // competência pela data — evita listar lançamentos que não são da competência filtrada).
      if (filters.basis === 'reference' && !t.reference_month) return false;
      // Filtros adicionais (em memória)
      if (xFilters.categoryId && (t.finance_categories?.name || '') !== xFilters.categoryId) return false;
      if (xFilters.costCenterId && (t.finance_cost_centers?.name || '') !== xFilters.costCenterId) return false;
      if (xFilters.method && (t.payment_method || '') !== xFilters.method) return false;
      if (xFilters.party && counterpartyName(t) !== xFilters.party) return false;
      const absVal = Math.abs(Number(t.amount) || 0);
      if (!Number.isNaN(min) && absVal < min) return false;
      if (!Number.isNaN(max) && absVal > max) return false;
      if (!q) return true;
      const dateBR = formatDateBR(t.due_date || t.transaction_date);
      const amountBR = absVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      // A busca por valor cobre as 3 colunas: líquido, BRUTO (nota c/ retenção) e pendente.
      const grossVal = t.gross_amount != null ? Math.abs(Number(t.gross_amount) || 0) : null;
      const pendVal = t.status === 'PAGO' ? 0 : absVal - Math.abs(Number(t.paid_amount) || 0);
      const hay = normTxt([
        t.description, t.finance_categories?.name, t.finance_accounts?.name,
        t.finance_parties?.name, t.finance_cost_centers?.name,
        paymentMethodLabel(t.payment_method), t.doc_number, t.reference_month, t.status,
        dateBR, t.transaction_date, amountBR, String(t.amount),
        grossVal != null ? grossVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
        grossVal != null ? String(grossVal) : '',
        pendVal > 0.004 ? pendVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
        pendVal > 0.004 ? pendVal.toFixed(2) : '',
      ].join(' | '));
      return hay.includes(q);
    })
    // Ordena pelo VENCIMENTO (data mostrada), mais recente primeiro — mantém a lista
    // coerente com a coluna exibida (a conta a pagar vai pela data de vencimento, não a de lançamento).
    .sort((a, b) => String(b.due_date || b.transaction_date || '').localeCompare(String(a.due_date || a.transaction_date || '')));
  }, [transactions, search, xFilters, filters.basis]);

  // Lançamento conciliado fica protegido: precisa remover a conciliação antes de editar/excluir.
  const isReconciled = (t) => !!t.imported_transaction_id;

  const handleEditTransaction = (t) => {
    if (isReconciled(t)) return toast.error('Lançamento conciliado. Remova a conciliação para poder editar.');
    // Perna de transferência não pode ser editada isolada (as duas pernas ficariam divergentes,
    // o dinheiro "nasceria/sumiria" entre contas). Exclua e recrie a transferência.
    if (t.transfer_group_id) return toast.error('Transferência entre contas: exclua e recrie para alterar. Editar uma perna sozinha descasaria as contas.');
    setSelectedTxId(t.id); setIsTxModalOpen(true);
  };

  const handleUnreconcile = async (t) => {
    if (!(await askConfirm({
      title: 'Remover conciliação',
      message: 'Isto desfaz a conciliação: a linha do extrato volta para "pendente" e o lançamento fica liberado para editar/excluir. O lançamento não é apagado.',
      confirmLabel: 'Remover conciliação', tone: 'primary'
    }))) return;
    try {
      await financeService.unreconcileTransaction(t.id);
      toast.success('Conciliação removida.');
      loadInitialData();
    } catch (error) { console.error(error); toast.error('Erro ao remover conciliação.'); }
  };

  const handleDeleteTransaction = async (t) => {
    if (isReconciled(t)) return toast.error('Lançamento conciliado. Remova a conciliação para poder excluir.');
    // Recorrente → pergunta o escopo num diálogo dedicado.
    if (t.recurrence_id) { setDelRow(t); return; }
    // Transferência → exclui as duas pernas de uma vez.
    if (t.transfer_group_id) {
      if (!(await askConfirm({ title: 'Excluir transferência', message: 'Excluir esta transferência? As duas pernas (saída e entrada) são removidas.', confirmLabel: 'Excluir' }))) return;
      try {
        await financeService.deleteTransfer(t.transfer_group_id);
        toast.success('Transferência excluída.');
        loadInitialData();
      } catch (error) { console.error(error); toast.error('Erro ao excluir transferência.'); }
      return;
    }
    // Parcela ou linha de rateio → pergunta se apaga só ela ou o grupo.
    if (t.installment_group_id) { setDelGroup({ row: t, kind: 'installment' }); return; }
    if (t.split_group_id) { setDelGroup({ row: t, kind: 'split' }); return; }
    if (!(await askConfirm({ title: 'Excluir transação', message: 'Deseja realmente excluir esta transação?', confirmLabel: 'Excluir' }))) return;
    try {
      await financeService.deleteTransaction(t.id);
      toast.success('Transação excluída com sucesso!');
      loadInitialData();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao excluir transação.');
    }
  };

  const handleDeleteGroupScoped = async (scope) => {
    if (!delGroup) return;
    setDelBusy(true);
    try {
      if (delGroup.kind === 'installment') {
        await financeService.deleteInstallmentScope(delGroup.row, scope);
      } else {
        if (scope === 'all') await financeService.deleteSplitGroup(delGroup.row.split_group_id);
        else await financeService.deleteTransaction(delGroup.row.id);
      }
      toast.success('Transação(ões) excluída(s).');
      setDelGroup(null);
      loadInitialData();
    } catch (error) { console.error(error); toast.error(error.code === 'HAS_PAYMENTS' ? error.message : 'Erro ao excluir.'); }
    finally { setDelBusy(false); }
  };

  const handleDeleteScoped = async (scope) => {
    if (!delRow) return;
    setDelBusy(true);
    try {
      await financeService.deleteRecurrenceScope(delRow, scope);
      toast.success('Transação(ões) excluída(s).');
      setDelRow(null);
      loadInitialData();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao excluir transação.');
    } finally { setDelBusy(false); }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!accountForm.name.trim()) return toast.error('Nome da conta é obrigatório');
    try {
      await financeService.createAccount({
        ...accountForm,
        current_balance: accountForm.initial_balance
      });
      toast.success('Conta bancária cadastrada com sucesso!');
      setAccountForm({ name: '', bank_name: '', agency: '', account_number: '', initial_balance: 0, initial_balance_date: todayISO() });
      setIsAccountModalOpen(false);
      loadInitialData();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar conta.');
    }
  };

  // --- CÁLCULO DE PROJEÇÕES DO FLUXO DE CAIXA ---
  const cashFlowProjection = useMemo(() => {
    // Agrupa transações por mês (YYYY-MM)
    const monthlyData = {};
    const todayStr = todayISO();

    // Consulta transações completas sem filtros para projeção fiel do fluxo
    // (Por simplicidade usamos as transações atuais carregadas na tela)
    transactions.forEach(t => {
      const monthKey = t.transaction_date.substring(0, 7); // "YYYY-MM"
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          realizedInflow: 0,
          projectedInflow: 0,
          realizedOutflow: 0,
          projectedOutflow: 0
        };
      }

      const amount = parseFloat(t.amount) || 0;
      const paid = parseFloat(t.paid_amount) || 0;
      // PARCIAL não pode contar em dobro: a parte baixada é REALIZADA, o restante é PROJETADO.
      const realized = t.status === 'PAGO' ? amount : t.status === 'PARCIAL' ? paid : 0;
      const projected = amount - realized;

      if (t.type === 'ENTRADA') {
        monthlyData[monthKey].realizedInflow += realized;
        monthlyData[monthKey].projectedInflow += projected;
      } else {
        monthlyData[monthKey].realizedOutflow += realized;
        monthlyData[monthKey].projectedOutflow += projected;
      }
    });

    // Converte para array ordenado por mês
    const sortedMonths = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

    // Calcula saldo acumulado projetado
    // Inicialmente assume o saldo total atual de todas as contas
    let cumulativeBalance = accounts.reduce((acc, curr) => acc + parseFloat(curr.current_balance), 0);
    
    // Filtramos apenas os meses futuros para acumular as projeções
    return sortedMonths.map(m => {
      const netMonth = (m.realizedInflow + m.projectedInflow) - (m.realizedOutflow + m.projectedOutflow);
      cumulativeBalance += m.projectedInflow - m.projectedOutflow; // Incrementa apenas o projetado (o realizado já altera o balance atual via trigger)
      
      // Formata a label do mês
      const [year, month] = m.month.split('-');
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const label = `${monthNames[parseInt(month) - 1]}/${year}`;

      return {
        ...m,
        label,
        net: netMonth,
        accumulated: cumulativeBalance
      };
    });
  }, [transactions, accounts]);

  const totalConsolidatedBalance = useMemo(() => {
    return accounts.reduce((acc, curr) => acc + parseFloat(curr.current_balance), 0);
  }, [accounts]);

  const totalOverdraftLimit = useMemo(() => {
    return accounts.reduce((acc, curr) => acc + (parseFloat(curr.overdraft_limit) || 0), 0);
  }, [accounts]);

  // Totais da lista filtrada (reagem a TODOS os filtros e à busca) — barra de resumo e impressão.
  const shownTotals = useMemo(() => {
    let inflow = 0, outflow = 0, bruto = 0, pendente = 0;
    shownTx.forEach(t => {
      const v = Number(t.amount) || 0;
      if (t.type === 'ENTRADA') inflow += v; else outflow += v;
      bruto += Number(t.gross_amount != null ? t.gross_amount : t.amount) || 0;
      pendente += t.status === 'PAGO' ? 0 : (v - (Number(t.paid_amount) || 0));
    });
    return { inflow, outflow, net: inflow - outflow, bruto, pendente, count: shownTx.length };
  }, [shownTx]);

  // Total só dos itens marcados (bruto / líquido / pendente). Ignora ids que saíram do filtro.
  const selectedTotals = useMemo(() => {
    let bruto = 0, liquido = 0, pendente = 0, count = 0;
    shownTx.forEach(t => {
      if (!selectedIds.has(t.id)) return;
      count++;
      bruto += Number(t.gross_amount != null ? t.gross_amount : t.amount) || 0;
      liquido += Number(t.amount) || 0;
      pendente += t.status === 'PAGO' ? 0 : ((Number(t.amount) || 0) - (Number(t.paid_amount) || 0));
    });
    return { bruto, liquido, pendente, count };
  }, [shownTx, selectedIds]);

  const toggleOne = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = shownTx.length > 0 && shownTx.every(t => selectedIds.has(t.id));
  const someVisibleSelected = shownTx.some(t => selectedIds.has(t.id));
  const toggleAllVisible = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (shownTx.every(t => prev.has(t.id))) shownTx.forEach(t => n.delete(t.id));
    else shownTx.forEach(t => n.add(t.id));
    return n;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const fmtBRL = (v) => `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const baseInputStyle = "h-9 px-2.5 bg-white border border-black/[.085] rounded-lg text-[11.5px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] transition-colors";

  // Texto do período para cabeçalho de impressão/exportação.
  const periodText = ((filters.startDate || filters.endDate)
    ? `${filters.startDate ? formatDateBR(filters.startDate) : '...'} a ${filters.endDate ? formatDateBR(filters.endDate) : '...'}`
    : 'Todos os Períodos') + (filters.basis === 'reference' ? ' · por competência' : '');
  const signedAmount = (t) => `${t.type === 'ENTRADA' ? '+' : '-'} R$ ${(Number(t.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const handlePrint = () => {
    if (!shownTx.length) return toast.error('Nada para imprimir com os filtros atuais.');
    printReport({
      theme,
      title: 'Movimentações — Extrato Geral',
      periodText,
      userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema',
      orientation: 'landscape',
      columns: [
        { header: 'Vencimento' }, { header: 'Origem/Destino' }, { header: 'Descrição' },
        { header: 'Conta' }, { header: 'Categoria' }, { header: 'Centro de Custo' },
        { header: 'Método' }, { header: 'Status' }, { header: 'Bruto (R$)', align: 'right' }, { header: 'Líquido (R$)', align: 'right' }, { header: 'Pendente (R$)', align: 'right' },
      ],
      rows: shownTx.map(t => [
        formatDateBR(t.due_date || t.transaction_date),
        counterpartyName(t) || '—',
        t.description || '—',
        t.finance_accounts?.name || '—',
        t.finance_categories?.name || 'Geral',
        t.finance_cost_centers?.name || '—',
        paymentMethodLabel(t.payment_method),
        t.status === 'PAGO' ? 'Efetivado' : t.status === 'PARCIAL' ? 'Parcial' : 'A realizar',
        fmtBRL(t.gross_amount != null ? t.gross_amount : t.amount),
        signedAmount(t),
        fmtBRL(t.status === 'PAGO' ? 0 : (parseFloat(t.amount) || 0) - (parseFloat(t.paid_amount) || 0)),
      ]),
      summary: [
        { label: 'Bruto no filtro', value: fmtBRL(shownTotals.bruto) },
        { label: 'Entradas no filtro', value: `+ ${fmtBRL(shownTotals.inflow)}` },
        { label: 'Saídas no filtro', value: `− ${fmtBRL(shownTotals.outflow)}` },
        { label: 'Líquido do período filtrado', value: `${shownTotals.net < 0 ? '−' : ''}${fmtBRL(shownTotals.net)}` },
        { label: 'Pendente no filtro', value: fmtBRL(shownTotals.pendente) },
      ],
      totalLabel: 'Total de Lançamentos',
    });
  };

  const handleExport = () => {
    if (!shownTx.length) return toast.error('Nada para exportar com os filtros atuais.');
    const rows = shownTx.map(t => ({
      'Vencimento': formatDateBR(t.due_date || t.transaction_date),
      'Origem/Destino': counterpartyName(t) || '',
      'Descrição': t.description || '',
      'Conta': t.finance_accounts?.name || '',
      'Categoria': t.finance_categories?.name || 'Geral',
      'Centro de Custo': t.finance_cost_centers?.name || '',
      'Método': paymentMethodLabel(t.payment_method),
      'Competência': t.reference_month || '',
      'Status': t.status === 'PAGO' ? 'Efetivado' : 'A realizar',
      'Tipo': t.type === 'ENTRADA' ? 'Receita' : 'Despesa',
      'Bruto': Number(t.gross_amount != null ? t.gross_amount : t.amount) || 0,
      'Valor': Number(t.amount) || 0,
      'Pendente': t.status === 'PAGO' ? 0 : (Number(t.amount) || 0) - (Number(t.paid_amount) || 0),
    }));
    rows.push(
      { 'Vencimento': '', 'Origem/Destino': 'TOTAL ENTRADAS', 'Valor': shownTotals.inflow },
      { 'Vencimento': '', 'Origem/Destino': 'TOTAL SAÍDAS', 'Valor': -shownTotals.outflow },
      { 'Vencimento': '', 'Origem/Destino': 'SALDO DO FILTRO', 'Valor': shownTotals.net },
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentações');
    XLSX.writeFile(wb, `movimentacoes_${todayISO()}.xlsx`);
  };

  return (
    <div className={`px-4 sm:px-6 pr-8 py-4 min-h-full ${cup.page} font-sans ${cup.text}`}>

      {/* Header */}
      <div className={`mb-4 border-b ${cup.hairline} pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div>
          <h1 className={`${cup.title} flex items-center gap-2`}>
            <Landmark className="text-[#86868b]" size={17} />
            Contas e Lançamentos
          </h1>
          <p className={`${cup.subtitle} mt-0.5`}>Gestão de caixa, conciliação e extrato geral</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* "Nova Conta" movido para Configurações › Contas Bancárias */}
          {viewMode === 'extract' && (
            <>
              <button onClick={handlePrint} title="Imprimir a lista atual (respeita os filtros)" className={cup.btn}>
                <Printer size={14} /> Imprimir
              </button>
              <button onClick={handleExport} title="Exportar a lista atual para Excel (.xlsx)" className={cup.btn}>
                <Download size={14} /> Exportar
              </button>
            </>
          )}
          {canEdit && (
            <>
              <button onClick={() => setTransferOpen(true)} className={cup.btn}>
                <Repeat2 size={14} /> Transferência
              </button>
              <button onClick={() => { setSelectedTxId(null); setIsTxModalOpen(true); }} className={cup.btnPrimary}>
                <Plus size={14} /> Lançar movimentação
              </button>
            </>
          )}
        </div>
      </div>

      {/* Saldos das contas — card único com células separadas por fio-de-cabelo */}
      <div className="mb-3 grid grid-cols-2 lg:grid-cols-5 gap-px bg-black/[.085] border border-black/[.085] rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04)]">
        <div className="bg-white px-4 py-3 min-w-0">
          <span className={cup.label}>Consolidado</span>
          <span className={`text-[16px] font-semibold tabular-nums tracking-[-.01em] leading-tight block mt-1 ${totalConsolidatedBalance < 0 ? cup.neg : cup.text}`}>
            R$ {totalConsolidatedBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          {totalOverdraftLimit > 0 && (
            <span className={`text-[10.5px] tabular-nums ${cup.muted} block mt-0.5`}>c/ limite R$ {(totalConsolidatedBalance + totalOverdraftLimit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          )}
        </div>
        {accounts.map(acc => (
          <div key={acc.id} className="bg-white px-4 py-3 min-w-0" title={`${acc.bank_name || 'Banco'} · Ag ${acc.agency || '-'} CC ${acc.account_number || '-'}`}>
            <span className={`${cup.label} block truncate`}>{acc.name || acc.bank_name}</span>
            <span className={`text-[16px] font-semibold tabular-nums tracking-[-.01em] leading-tight block mt-1 ${acc.current_balance < 0 ? cup.neg : cup.text}`}>
              R$ {acc.current_balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            {parseFloat(acc.overdraft_limit || 0) > 0 && (
              <span className={`text-[10.5px] tabular-nums ${cup.muted} block mt-0.5`}>c/ limite R$ {(parseFloat(acc.current_balance) + parseFloat(acc.overdraft_limit)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            )}
          </div>
        ))}
      </div>

      {/* Filtros e Layout de Conteúdo */}
      <div className={`${cup.card} p-4 flex flex-col min-h-[50vh]`}>

        {/* Toggle Modos + Filtros — fluem juntos e quebram em 2 linhas (sem scroll) */}
        <div className={`flex flex-wrap items-center gap-2 mb-4 border-b ${cup.rowline} pb-4`}>
          <div className="flex bg-black/[.045] p-0.5 rounded-[8px] w-fit shrink-0">
            <button
              onClick={() => setViewMode('extract')}
              className={`px-3.5 py-1.5 text-[10.5px] rounded-[6px] transition-all ${viewMode === 'extract' ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,.12)] font-semibold' : 'text-[#86868b] hover:text-[#1d1d1f] font-medium'}`}
            >
              Extrato Geral
            </button>
            <button
              onClick={() => setViewMode('flow')}
              className={`px-3.5 py-1.5 text-[10.5px] rounded-[6px] transition-all ${viewMode === 'flow' ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,.12)] font-semibold' : 'text-[#86868b] hover:text-[#1d1d1f] font-medium'}`}
            >
              Fluxo de Caixa Projetado
            </button>
          </div>

          {viewMode === 'extract' && (
            <>
              <span className="hidden lg:block w-px h-6 bg-black/[.085] mx-0.5" />

              <div className="flex items-center gap-1.5 px-2.5 bg-white border border-black/[.085] rounded-lg h-9 w-[200px] xl:w-[240px] focus-within:border-[#0071e3] transition-colors">
                <Search size={14} className="text-[#86868b] shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar descrição, valor…"
                  className="bg-transparent text-[11.5px] font-medium text-[#1d1d1f] placeholder:text-[#86868b] outline-none w-full" />
                {search && <button onClick={() => setSearch('')} className="text-[#86868b] hover:text-[#d70015] shrink-0 text-sm leading-none" title="Limpar busca">×</button>}
              </div>

              {/* Tipo e Status ficam à vista (uso diário); conta, categoria,
                  centro de custo, origem/destino, método e faixa de valor vão
                  para o popover, com chip visível para cada um que estiver ativo. */}
              <select
                value={filters.type}
                onChange={e => setFilters({ ...filters, type: e.target.value })}
                className={`${baseInputStyle} cursor-pointer`}
              >
                <option value="">Todos os Tipos</option>
                <option value="ENTRADA">Receitas</option>
                <option value="SAIDA">Despesas</option>
              </select>

              <select
                value={filters.status}
                onChange={e => setFilters({ ...filters, status: e.target.value })}
                className={`${baseInputStyle} cursor-pointer`}
              >
                <option value="">Todos os Status</option>
                <option value="PAGO">Pago / Efetivado</option>
                <option value="PARCIAL">Parcial</option>
                <option value="PENDENTE">A realizar</option>
                <option value="LANCADO">Lançada p/ Pagamento</option>
              </select>

              <FilterPopover count={chipsAtivos.length} hasAny={!!(search || filters.accountId || filters.type || filters.status || xActive)}
                onClear={limparFiltros}>
                <div>
                  <label className={filtroRotulo}>Conta</label>
                  <SearchableSelect size="sm" allowEmpty emptyLabel="Todas"
                    options={accounts.map(a => ({ value: a.id, label: a.name }))}
                    value={filters.accountId} onChange={v => setFilters({ ...filters, accountId: v || '' })}
                    searchPlaceholder="Buscar conta…" />
                </div>
                <div>
                  <label className={filtroRotulo}>Categoria</label>
                  <SearchableSelect size="sm" allowEmpty emptyLabel="Todas"
                    options={optCategories.map(c => ({ value: c, label: c }))}
                    value={xFilters.categoryId} onChange={v => setXFilters(f => ({ ...f, categoryId: v || '' }))}
                    searchPlaceholder="Buscar categoria…" />
                </div>
                <div>
                  <label className={filtroRotulo}>Centro de custo</label>
                  <SearchableSelect size="sm" allowEmpty emptyLabel="Todos"
                    options={optCostCenters.map(c => ({ value: c, label: c }))}
                    value={xFilters.costCenterId} onChange={v => setXFilters(f => ({ ...f, costCenterId: v || '' }))}
                    searchPlaceholder="Buscar centro de custo…" />
                </div>
                <div>
                  <label className={filtroRotulo}>Origem / Destino</label>
                  <SearchableSelect size="sm" allowEmpty emptyLabel="Todos"
                    options={optParties.map(c => ({ value: c, label: c }))}
                    value={xFilters.party} onChange={v => setXFilters(f => ({ ...f, party: v || '' }))}
                    searchPlaceholder="Buscar origem/destino…" />
                </div>
                <div>
                  <label className={filtroRotulo}>Método</label>
                  <select value={xFilters.method} onChange={e => setXFilters(f => ({ ...f, method: e.target.value }))}
                    className={`${cup.select} w-full`}>
                    <option value="">Todos</option>
                    {optMethods.map(m => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={filtroRotulo}>Faixa de valor (R$)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" inputMode="decimal" placeholder="mín" value={xFilters.minVal}
                      onChange={e => setXFilters(f => ({ ...f, minVal: e.target.value }))}
                      className={`${baseInputStyle} flex-1 min-w-0`} />
                    <span className="text-[#86868b] text-xs shrink-0">–</span>
                    <input type="number" inputMode="decimal" placeholder="máx" value={xFilters.maxVal}
                      onChange={e => setXFilters(f => ({ ...f, maxVal: e.target.value }))}
                      className={`${baseInputStyle} flex-1 min-w-0`} />
                  </div>
                </div>
              </FilterPopover>

              <FilterChips chips={chipsAtivos} />

              {/* Seletor Dia / Mês / Período com setas anterior/próximo */}
              <FinancePeriodBar onChange={r => setFilters(f => ({ ...f, startDate: r.start, endDate: r.end, basis: r.basis }))} showBasis />
            </>
          )}
        </div>

        {/* Listagem de Transações */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={32} className="text-[#0071e3] animate-spin" />
          </div>
        ) : viewMode === 'extract' ? (
          <div className="flex-1 flex flex-col">
            {selectedIds.size > 0 && canEdit && (
              <div className="mb-3 flex items-center justify-between gap-2 bg-[#7c3aed]/[.08] border border-[#7c3aed]/20 px-3.5 py-2 rounded-xl text-[11.5px] font-semibold text-[#7c3aed]">
                <span>{selectedIds.size} lançamento(s) selecionado(s)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBulkStatusChange('LANCADO')}
                    className="px-3 py-1 bg-[#7c3aed] text-white rounded-lg text-[11px] font-semibold hover:bg-[#7c3aed]/90 transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Send size={12} /> Marcar Lançada(s) p/ Pagamento
                  </button>
                  <button
                    onClick={() => handleBulkStatusChange('PENDENTE')}
                    className="px-3 py-1 bg-white border border-slate-300 text-slate-700 rounded-lg text-[11px] font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Voltar p/ Pendente
                  </button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
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
                    <th className={cup.th}>Vencimento</th>
                    <th className={cup.th}>Origem / Destino</th>
                    <th className={cup.th}>Conta</th>
                    <th className={cup.th}>Categoria</th>
                    <th className={cup.th}>Método</th>
                    <th className={`${cup.th} text-center`}>Status</th>
                    <th className={`${cup.th} text-right`}>Valor (R$)</th>
                    <th className={`${cup.th} text-right`}>Pendente (R$)</th>
                    {/* Mesma posição de Contas a Pagar/Receber: o anexo é coluna
                        fixa na faixa da direita, e não um ícone disputando espaço
                        com o nome do fornecedor. */}
                    <th className={`${cup.th} text-center`}>Anexo</th>
                    <th className={`${cup.th} text-center`}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.055]">
                  {shownTx.length === 0 ? (
                    <tr>
                      <td colSpan="11" className={`text-center py-12 ${cup.muted} text-[11.5px] font-medium`}>{(search || xActive) ? 'Nenhum lançamento bate com os filtros.' : 'Nenhum lançamento financeiro encontrado.'}</td>
                    </tr>
                  ) : (
                    shownTx.map(t => {
                      const amountFormatted = t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                      return (
                        <tr key={t.id} className={`${cup.hover} transition-colors text-[12px] ${cup.text} ${selectedIds.has(t.id) ? 'bg-[#0071e3]/[.04]' : ''}`}>
                          <td className="py-2 px-3 text-center align-top">
                            <input type="checkbox" aria-label="Selecionar lançamento"
                              checked={selectedIds.has(t.id)}
                              /* Era toggleSelect, que não existe em lugar nenhum: marcar
                                 uma linha aqui quebrava com ReferenceError. A função
                                 declarada (e até então sem uso) é toggleOne. */
                              onChange={() => toggleOne(t.id)}
                              className="w-3.5 h-3.5 accent-[#0071e3] cursor-pointer align-middle mt-0.5" />
                          </td>
                          <td className={`py-2 px-3 ${cup.muted} whitespace-nowrap tabular-nums align-top text-[11.5px]`}>
                            {formatDateBR(t.due_date || t.transaction_date)}
                            {t.reference_month && (
                              <span title="Competência (mês de referência)" className="block text-[9.5px] font-medium text-[#0071e3]">
                                comp. {t.reference_month.split('-').reverse().join('/')}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 max-w-[260px] align-top">
                            {(() => {
                              const cp = counterpartyName(t);
                              return (
                                <>
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    {t.transfer_group_id && <Repeat2 size={12} className="text-[#0071e3] shrink-0" title="Transferência entre contas" />}
                                    <span className="truncate font-medium text-[#1d1d1f] leading-tight" title={cp || t.description}>{cp || t.description || '—'}</span>
                                    {t.installment_total > 1 && <span title="Parcela" className={`shrink-0 text-[9.5px] font-medium ${cup.muted}`}>{t.installment_number}/{t.installment_total}</span>}
                                  </span>
                                  {t.description && (cp ? t.description !== cp : true) && (
                                    <span className={`block text-[10.5px] ${cup.muted} mt-0.5 truncate`} title={t.description}>{t.description}</span>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className={`py-2 px-3 ${cup.muted} whitespace-nowrap align-top text-[11.5px]`}>{t.finance_accounts?.name || '—'}</td>
                          <td className="py-2 px-3 align-top">
                            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#1d1d1f] max-w-[190px]">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.finance_categories?.color || '#86868b' }}></span>
                              <span className="truncate" title={t.finance_categories?.name || 'Geral'}>{t.finance_categories?.name || 'Geral'}</span>
                            </span>
                            {t.finance_cost_centers?.name && (
                              <span title={`Centro de custo: ${t.finance_cost_centers.name}`} className={`flex items-center gap-1.5 text-[10px] ${cup.muted} mt-0.5 max-w-[190px]`}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0 opacity-60" style={{ backgroundColor: t.finance_cost_centers.color || '#86868b' }} />
                                <span className="truncate">{t.finance_cost_centers.name}</span>
                              </span>
                            )}
                          </td>
                          <td className={`py-2 px-3 ${cup.muted} text-[11px] whitespace-nowrap align-top`}>{paymentMethodLabel(t.payment_method)}</td>
                          <td className="py-2 px-3 align-top">
                            <div className="flex flex-col items-center gap-0.5">
                              <Dot tone={t.status === 'PAGO' ? 'ok' : t.status === 'PARCIAL' ? 'warn' : t.status === 'LANCADO' ? 'info' : 'neutral'}>
                                {t.status === 'PAGO' ? 'Pago' : t.status === 'PARCIAL' ? 'Parcial' : t.status === 'LANCADO' ? 'Lançada' : 'Pendente'}
                              </Dot>
                              {isReconciled(t) && (
                                <span title="Lançamento conciliado com o extrato — protegido contra edição/exclusão" className="inline-flex items-center gap-1 text-[9.5px] font-medium whitespace-nowrap text-[#0071e3]">
                                  <Lock size={9} /> conciliado
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Valor = o líquido. O bruto só entra embaixo quando difere
                              dele (retenção na fonte) — antes eram duas colunas
                              imprimindo o mesmo número em quase toda linha. */}
                          <td className="py-2 px-3 text-right whitespace-nowrap align-top">
                            <div className={`text-[12px] font-semibold tabular-nums leading-tight ${t.type === 'ENTRADA' ? cup.pos : cup.neg}`}>
                              {t.type === 'ENTRADA' ? '+' : '−'} R$ {amountFormatted}
                            </div>
                            {t.gross_amount != null && (
                              <div className={`text-[10px] ${cup.muted} tabular-nums leading-tight mt-0.5`}
                                title={`Nota bruta de R$ ${fmtBRL(t.gross_amount)} − impostos retidos = líquido R$ ${fmtBRL(t.amount)}`}>
                                bruto {fmtBRL(t.gross_amount)}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-[11.5px] whitespace-nowrap tabular-nums align-top">
                            {(() => {
                              const pend = t.status === 'PAGO' ? 0 : (parseFloat(t.amount) || 0) - (parseFloat(t.paid_amount) || 0);
                              return pend > 0.004
                                ? <span className={`font-semibold ${cup.warn}`} title={t.status === 'PARCIAL' ? `Baixado R$ ${fmtBRL(t.paid_amount)} de R$ ${fmtBRL(t.amount)}` : 'Ainda não baixado'}>{fmtBRL(pend)}</span>
                                : <span className="text-black/20">0,00</span>;
                            })()}
                          </td>
                          <td className="py-2 px-3 text-center align-top">
                            {Array.isArray(t.attachments) && t.attachments.length > 0 ? (
                              <a
                                href={t.attachments[0].url}
                                onClick={aoClicarNoArquivo(t.attachments[0].path || t.attachments[0].url, 'documentos')}
                                title={t.attachments.length === 1
                                  ? `Abrir anexo: ${t.attachments[0].name}`
                                  : `${t.attachments.length} anexos: ${t.attachments.map(a => a.name).join(', ')} — abre o primeiro`}
                                className="inline-flex items-center gap-0.5 text-[#0071e3] hover:opacity-70 transition-opacity"
                              >
                                <Paperclip size={14} />
                                {t.attachments.length > 1 && <span className="text-[9.5px] font-semibold">{t.attachments.length}</span>}
                              </a>
                            ) : (
                              <span title="Sem anexo"><Paperclip size={14} className="text-black/15 inline" /></span>
                            )}
                          </td>
                          <td className="py-2 px-3 align-top">
                            <div className="flex items-center justify-center gap-0.5">
                              {!canEdit ? null : isReconciled(t) ? (
                                <button
                                  onClick={() => handleUnreconcile(t)}
                                  title="Remover conciliação (libera para editar/excluir)"
                                  className="flex items-center gap-1 h-7 px-2 text-[#0071e3] hover:bg-black/[.04] rounded-lg transition-colors text-[10.5px] font-medium whitespace-nowrap"
                                >
                                  <Unlink size={13} /> Desconciliar
                                </button>
                              ) : (
                                <>
                                  {!t.transfer_group_id && (
                                    <>
                                      <button
                                        onClick={() => setBaixaTx(t)}
                                        title={t.status === 'PARCIAL' ? 'Baixas — ver, completar ou estornar' : 'Baixas — dar baixa, ver ou estornar'}
                                        className={`p-1.5 rounded-lg transition-colors hover:bg-black/[.04] ${t.status === 'PARCIAL' ? 'text-[#bf7a00]' : 'text-[#86868b] hover:text-[#248a3d]'}`}
                                      >
                                        <CheckCircle size={13} />
                                      </button>
                                      {t.type === 'SAIDA' && t.status === 'PENDENTE' && (
                                        <button
                                          onClick={() => handleSetStatus(t.id, 'LANCADO')}
                                          title="Marcar como Lançada p/ Pagamento (Aguardando Liberação)"
                                          className="p-1.5 text-[#86868b] hover:text-[#7c3aed] hover:bg-black/[.04] rounded-lg transition-colors"
                                        >
                                          <Send size={13} />
                                        </button>
                                      )}
                                      {t.type === 'SAIDA' && t.status === 'LANCADO' && (
                                        <button
                                          onClick={() => handleSetStatus(t.id, 'PENDENTE')}
                                          title="Voltar para Pendente"
                                          className="p-1.5 text-[#7c3aed] hover:text-[#86868b] hover:bg-black/[.04] rounded-lg transition-colors"
                                        >
                                          <Send size={13} className="rotate-180" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleEditTransaction(t)}
                                    className="p-1.5 text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] rounded-lg transition-colors"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTransaction(t)}
                                    className="p-1.5 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-lg transition-colors"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {/* Barra de seleção — total só dos itens marcados */}
            {selectedTotals.count > 0 && (
              <div className={`shrink-0 mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2 tabular-nums bg-[#0071e3]/[.05] border border-[#0071e3]/20 rounded-xl`}>
                <span className="text-[11px] font-semibold text-[#0071e3] mr-auto">{selectedTotals.count} selecionado{selectedTotals.count === 1 ? '' : 's'}</span>
                <span className={`text-[11.5px] ${cup.muted}`}>Bruto <span className="font-semibold text-[#1d1d1f]">{fmtBRL(selectedTotals.bruto)}</span></span>
                <span className={`text-[11.5px] ${cup.muted}`}>Líquido <span className="font-semibold text-[#1d1d1f]">{fmtBRL(selectedTotals.liquido)}</span></span>
                <span className={`text-[11.5px] ${cup.muted}`}>Pendente <span className={`font-semibold ${cup.warn}`}>{fmtBRL(selectedTotals.pendente)}</span></span>
                <button onClick={clearSelection} className="text-[10.5px] font-medium text-[#86868b] hover:text-[#d70015]">Limpar seleção</button>
              </div>
            )}

            {/* Totais da lista filtrada — reagem a todos os filtros e à busca */}
            {shownTx.length > 0 && (
              <div className={`shrink-0 mt-2 pt-2.5 border-t ${cup.hairline} flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-3 pb-0.5 tabular-nums`}>
                <span className={`${cup.label} mr-auto normal-case tracking-normal text-[10.5px]`}>{shownTotals.count} lançamento{shownTotals.count === 1 ? '' : 's'} no filtro</span>
                <span className={`text-[11.5px] ${cup.muted}`}>Bruto <span className="font-semibold text-[#1d1d1f]">{fmtBRL(shownTotals.bruto)}</span></span>
                <span className={`text-[11.5px] ${cup.muted}`}>Entradas <span className={`font-semibold ${cup.pos}`}>+ {fmtBRL(shownTotals.inflow)}</span></span>
                <span className={`text-[11.5px] ${cup.muted}`}>Saídas <span className={`font-semibold ${cup.neg}`}>− {fmtBRL(shownTotals.outflow)}</span></span>
                <span className={`text-[11.5px] ${cup.muted}`}>Líquido <span className={`font-semibold ${shownTotals.net < 0 ? cup.neg : cup.pos}`}>{shownTotals.net < 0 ? '−' : '+'} {fmtBRL(shownTotals.net)}</span></span>
                <span className={`text-[12px] ${cup.muted}`}>Pendente <span className={`font-semibold ${cup.warn}`}>{fmtBRL(shownTotals.pendente)}</span></span>
              </div>
            )}
          </div>
        ) : (
          /* Visualização de Fluxo de Caixa */
          <div className="flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50/50">
                    <th className="py-3 px-4">Mês de Referência</th>
                    <th className="py-3 px-4 text-right text-emerald-600 bg-emerald-50/20">Receitas Realizadas</th>
                    <th className="py-3 px-4 text-right text-emerald-600/70 bg-emerald-50/10">Receitas Projetadas</th>
                    <th className="py-3 px-4 text-right text-rose-600 bg-rose-50/20">Despesas Realizadas</th>
                    <th className="py-3 px-4 text-right text-rose-600/70 bg-rose-50/10">Despesas Projetadas</th>
                    <th className="py-3 px-4 text-right bg-indigo-50/10">Saldo Líquido Mês</th>
                    <th className="py-3 px-4 text-right bg-indigo-50/20">Saldo Acumulado Projetado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cashFlowProjection.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-slate-400 text-xs font-bold uppercase">Nenhum dado projetado para os próximos meses.</td>
                    </tr>
                  ) : (
                    cashFlowProjection.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors text-xs font-bold text-slate-700">
                        <td className="py-2.5 px-3 text-slate-800 font-bold">{m.label}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">R$ {m.realizedInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500 font-medium">R$ {m.projectedInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right text-rose-600 font-medium">R$ {m.realizedOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500 font-medium">R$ {m.projectedOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${m.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          R$ {m.net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right text-indigo-700 font-bold text-sm bg-indigo-50/10">
                          R$ {m.accumulated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Modal de Transação */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => { setIsTxModalOpen(false); setSelectedTxId(null); }}
        onSave={loadInitialData}
        transactionId={selectedTxId}
      />

      <TransferModal
        open={transferOpen}
        accounts={accounts}
        onClose={() => setTransferOpen(false)}
        onDone={loadInitialData}
      />

      {baixaTx && (
        <BaixaModal
          row={baixaTx}
          accounts={accounts}
          onClose={() => setBaixaTx(null)}
          onDone={loadInitialData}
        />
      )}

      <RecurrenceScopeDialog
        open={!!delRow}
        busy={delBusy}
        title="Excluir conta fixa"
        description="Esta conta se repete. O que você quer excluir? (Parcelas já realizadas são preservadas.)"
        onPick={handleDeleteScoped}
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
        onPick={handleDeleteGroupScoped}
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

      {/* Modal de Nova Conta Bancária */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsAccountModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-800 tracking-tight uppercase">Cadastrar Nova Conta</h3>
              <button onClick={() => setIsAccountModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleCreateAccount} className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome Identificador</label>
                <input 
                  type="text" 
                  required
                  value={accountForm.name} 
                  onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} 
                  className={baseInputStyle}
                  placeholder="Ex: Conta Principal Itaú"
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome do Banco</label>
                <input 
                  type="text" 
                  value={accountForm.bank_name} 
                  onChange={e => setAccountForm({ ...accountForm, bank_name: e.target.value })} 
                  className={baseInputStyle}
                  placeholder="Ex: Itaú Unibanco"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Agência</label>
                  <input 
                    type="text" 
                    value={accountForm.agency} 
                    onChange={e => setAccountForm({ ...accountForm, agency: e.target.value })} 
                    className={baseInputStyle}
                    placeholder="0001"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Número da Conta</label>
                  <input 
                    type="text" 
                    value={accountForm.account_number} 
                    onChange={e => setAccountForm({ ...accountForm, account_number: e.target.value })} 
                    className={baseInputStyle}
                    placeholder="12345-6"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Saldo Inicial (R$)</label>
                  <CurrencyInput
                    value={accountForm.initial_balance}
                    onChange={v => setAccountForm({ ...accountForm, initial_balance: v })}
                    className={baseInputStyle}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Data do Saldo Inicial</label>
                  <input
                    type="date"
                    value={accountForm.initial_balance_date}
                    onChange={e => setAccountForm({ ...accountForm, initial_balance_date: e.target.value })}
                    className={baseInputStyle}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAccountModalOpen(false)}
                  className="h-10 px-4 font-bold text-slate-500 hover:bg-slate-100 rounded-xl text-xs uppercase"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase transition-all shadow-md"
                >
                  Salvar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
