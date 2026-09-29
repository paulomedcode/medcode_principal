import React, { useState, useEffect, useMemo, useRef } from 'react';
import { financeService } from '../../services/financeService';
import { parseOFX } from '../../utils/ofxParser';
import {
  Upload, FileText, ArrowRightLeft, Check, Loader2, Link2, X, Zap, HelpCircle, EyeOff, Search, RotateCcw, Trash2, Sliders, Split, Plus
} from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchableSelect from '../../components/finance/SearchableSelect';
import CurrencyInput from '../../components/finance/CurrencyInput';
import PartyModal from '../../components/finance/PartyModal';
import { PAYMENT_METHODS } from '../../components/finance/paymentMethods';
import { nameScore } from '../../utils/similaridade';
import { prevMonthISO } from '../../utils/date';
import { printReport } from '../../utils/printReport';
import { counterpartyName } from '../../utils/financeCounterparty';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../contexts/PermissionContext';
import { Printer } from 'lucide-react';

const fmtMoney = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
// Data mostrada de um LANÇAMENTO = vencimento (due_date), com fallback p/ a data do lançamento.
// (A linha do EXTRATO importado continua com a data real do banco — transaction_date.)
const sysDate = (t) => t.due_date || t.transaction_date;
const daysBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
// Chave de agrupamento de lançamentos repetidos: 3 primeiras palavras da descrição
// (ignora números de contrato/IOF que vêm depois). Ex.: "TARIFA BANCARIA TRANSF".
const groupKeyOf = (desc) => (desc || '').toUpperCase().replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
// Chave de recorrência: descrição base + valor absoluto. Junta contas que se repetem
// todo mês com o MESMO valor (ex.: "ALUGUEL · R$ 5.000,00"), p/ lançar o ano de uma vez.
const recurKeyOf = (t) => `${groupKeyOf(t.description)}|${Math.abs(parseFloat(t.amount) || 0).toFixed(2)}`;
const groupKeyFor = (t, mode) => mode === 'descval' ? recurKeyOf(t) : groupKeyOf(t.description);

// Pontua a chance de uma transação do sistema (sys) ser o par de uma linha do banco (imp). 0 = incompatível.
function matchScore(imp, sys) {
  const impAmt = parseFloat(imp.amount);
  // Direção precisa bater: crédito no banco = ENTRADA; débito = SAIDA.
  if (sys.type !== (impAmt >= 0 ? 'ENTRADA' : 'SAIDA')) return 0;

  let score = 0;
  // Valor (até 55 pts)
  const a = Math.abs(impAmt), b = Math.abs(parseFloat(sys.amount));
  const diff = Math.abs(a - b);
  if (diff < 0.005) score += 55;
  else {
    const rel = diff / Math.max(a, 1);
    if (rel <= 0.01) score += 44;
    else if (rel <= 0.05) score += 28;
    else if (rel <= 0.10) score += 14;
    else return 0; // valor muito diferente → não é par
  }
  // Data — usa a melhor entre data do lançamento e vencimento (até 30 pts)
  const dLanc = daysBetween(imp.transaction_date, sys.transaction_date);
  const dVenc = sys.due_date ? daysBetween(imp.transaction_date, sys.due_date) : Infinity;
  const d = Math.min(dLanc, dVenc);
  if (d < 1) score += 30;
  else if (d <= 2) score += 22;
  else if (d <= 5) score += 13;
  else if (d <= 10) score += 6;
  // Fornecedor / descrição (até 15 pts)
  const party = (sys.finance_parties?.name || '').toLowerCase().trim();
  const desc = `${imp.description || ''} ${imp.memo || ''}`.toLowerCase();
  if (party.length >= 3) {
    const first = party.split(' ')[0];
    if (desc.includes(party) || (first.length >= 3 && desc.includes(first))) score += 15;
  }
  return Math.min(100, Math.round(score));
}

const scoreToBars = (s) => (s >= 85 ? 4 : s >= 65 ? 3 : s >= 45 ? 2 : s > 0 ? 1 : 0);
const scoreLabel = (s) => (s >= 85 ? 'Alta' : s >= 65 ? 'Média' : s >= 45 ? 'Baixa' : 'Fraca');

export default function FinanceConciliation() {
  const { theme } = useWhiteLabel();
  const { currentUser } = useAuth();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('Editar Financeiro'); // sem ela: modo somente-leitura
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ batchTotal: 0, batchReconciled: 0, batchPending: 0, batchIgnored: 0, pending: 0, reconciled: 0, lastImportAt: null });
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [importedTxs, setImportedTxs] = useState([]);
  const [systemTxs, setSystemTxs] = useState([]);

  const [selectedIds, setSelectedIds] = useState(new Set()); // checkboxes para lote
  const [batchSkip, setBatchSkip] = useState(new Set());     // linhas do lote a NÃO conciliar
  const [viewOrphans, setViewOrphans] = useState(false);     // painel: lista de lançamentos sem conciliação
  const [matchTx, setMatchTx] = useState(null);              // linha do banco buscando par
  const matchPanelRef = useRef(null);                        // card "Conciliar com Lançamento"
  const candListRef = useRef(null);                          // lista de candidatos do painel

  const [candSearch, setCandSearch] = useState('');          // busca manual na lista de candidatos
  const [candFilters, setCandFilters] = useState({ status: '', cc: '', cat: '', mes: '', comp: '', from: '', to: '' });
  const [applyIds, setApplyIds] = useState(new Set());       // lançamentos marcados p/ baixa em lote

  // Ao clicar no 🔗 de uma linha, traz o painel de comparação à vista, volta a lista
  // de candidatos ao topo (os melhores pares vêm primeiro) e zera busca/filtros/seleção.
  useEffect(() => {
    if (!matchTx) return;
    setCandSearch('');
    setCandFilters({ status: '', cc: '', cat: '', mes: '', comp: '', from: '', to: '' });
    setApplyIds(new Set());
    if (candListRef.current) candListRef.current.scrollTop = 0;
    matchPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchTx?.id]);

  // Opções dos filtros do painel, derivadas dos lançamentos sem conciliação da conta.
  const candOpts = useMemo(() => {
    const u = (fn) => [...new Set(systemTxs.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { ccs: u(s => s.finance_cost_centers?.name), cats: u(s => s.finance_categories?.name) };
  }, [systemTxs]);
  const [selectedSystemTx, setSelectedSystemTx] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);  // array de imports para o popup de confirmação
  // Busca / filtros / ignorados
  const [impSearch, setImpSearch] = useState('');
  const [impType, setImpType] = useState('all');            // all | in | out
  const [groupKey, setGroupKey] = useState(null);           // chip de agrupamento ativo
  const [groupBy, setGroupBy] = useState('desc');           // desc | descval (descrição + valor)
  const [showIgnored, setShowIgnored] = useState(false);
  const [ignoredTxs, setIgnoredTxs] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const closeConfirm = (ok) => { if (confirmState) confirmState.resolve(ok); setConfirmState(null); };

  useEffect(() => { loadAccounts(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedAccountId) loadTransactions(); }, [selectedAccountId]);

  const loadAccounts = async () => {
    try {
      const [accs, cats, ccs, pts] = await Promise.all([financeService.getAccounts(), financeService.getCategories(), financeService.getCostCenters(), financeService.getParties().catch(() => [])]);
      setAccounts(accs || []);
      setCategories(cats || []);
      setCostCenters(ccs || []);
      setParties(pts || []);
      if (accs?.length) setSelectedAccountId(accs[0].id);
    } catch (e) { console.error(e); toast.error('Erro ao carregar contas.'); }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const [imported, system, st] = await Promise.all([
        financeService.getImportedTransactions(selectedAccountId, false),
        financeService.getTransactions({ accountId: selectedAccountId, unreconciledOnly: true }),
        financeService.getReconciliationStats(selectedAccountId).catch(() => null)
      ]);
      setImportedTxs(imported || []);
      setSystemTxs(system || []);
      if (st) setStats(st);
      setSelectedIds(new Set());
      setMatchTx(null);
      setSelectedSystemTx(null);
      setGroupKey(null);
      setViewOrphans(false);
    } catch (e) { console.error(e); toast.error('Erro ao carregar conciliação.'); }
    finally { setLoading(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!selectedAccountId) return toast.error('Selecione uma conta antes de importar.');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        setLoading(true);
        const parsed = parseOFX(ev.target.result);
        if (!parsed.length) { toast.error('Nenhuma transação no arquivo OFX.'); return; }
        const { inserted, skipped } = await financeService.importImportedTransactions(parsed.map(tx => ({ ...tx, account_id: selectedAccountId })));
        if (!inserted.length) toast(`Nenhuma transação nova: as ${skipped} do arquivo já estavam importadas.`, { icon: 'ℹ️' });
        else toast.success(`Importadas ${inserted.length} transações novas${skipped ? ` (${skipped} já existiam e foram ignoradas)` : ''}.`);
        loadTransactions();
      } catch (err) { console.error(err); toast.error(err.message || 'Erro ao processar OFX.'); }
      finally { setLoading(false); }
    };
    reader.readAsText(file, 'latin1');
    e.target.value = '';
  };

  // Melhor par possível (e seu score) para cada linha do banco — hint do indicador de sinal.
  const bankMatches = useMemo(() => {
    const map = {};
    importedTxs.forEach(imp => {
      let best = 0;
      systemTxs.forEach(sys => { const s = matchScore(imp, sys); if (s > best) best = s; });
      map[imp.id] = best;
    });
    return map;
  }, [importedTxs, systemTxs]);

  // Lançamento PARCIAL entra no score pelo SALDO RESTANTE (não pelo total): assim a
  // próxima parcela paga no banco casa com o que falta quitar.
  const effTx = (sys) => ((parseFloat(sys.paid_amount) || 0) > 0
    ? { ...sys, amount: (parseFloat(sys.amount) || 0) - (parseFloat(sys.paid_amount) || 0) }
    : sys);

  // Lista de candidatos ordenada por score, para a linha do banco em conciliação.
  const candidates = useMemo(() => {
    if (!matchTx) return [];
    return systemTxs
      .map(sys => ({ sys, score: matchScore(matchTx, effTx(sys)) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchTx, systemTxs]);

  // Lista do painel: SEMPRE respeita o sentido da linha do banco (entrada só casa com
  // entrada, saída com saída), aplica filtros e busca, e ordena por score → data.
  const candList = useMemo(() => {
    if (!matchTx) return [];
    const inflow = (parseFloat(matchTx.amount) || 0) >= 0;
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm(candSearch.trim());
    return systemTxs
      .filter(sys => (sys.type === 'ENTRADA') === inflow)
      .filter(sys => !candFilters.status || sys.status === candFilters.status)
      .filter(sys => !candFilters.cc || (sys.finance_cost_centers?.name || '') === candFilters.cc)
      .filter(sys => !candFilters.cat || (sys.finance_categories?.name || '') === candFilters.cat)
      .filter(sys => !candFilters.mes || String(sysDate(sys) || '').slice(0, 7) === candFilters.mes)
      .filter(sys => !candFilters.comp || (sys.reference_month || String(sysDate(sys) || '').slice(0, 7)) === candFilters.comp)
      .filter(sys => !candFilters.from || (sysDate(sys) || '') >= candFilters.from)
      .filter(sys => !candFilters.to || (sysDate(sys) || '') <= candFilters.to)
      .filter(sys => !q || norm([counterpartyName(sys), sys.description, sys.finance_categories?.name,
        sys.finance_cost_centers?.name, String(sys.amount),
        (Number(sys.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), fmtDate(sysDate(sys))].join(' | ')).includes(q))
      .map(sys => ({ sys, score: matchScore(matchTx, effTx(sys)) }))
      .sort((a, b) => (b.score - a.score) || String(b.sys.transaction_date || '').localeCompare(String(a.sys.transaction_date || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemTxs, candSearch, candFilters, matchTx]);

  // Saldo ainda não aplicado da LINHA do banco (uma linha pode pagar vários lançamentos).
  const bankRemaining = useMemo(() => {
    if (!matchTx) return 0;
    return Math.abs(parseFloat(matchTx.amount) || 0) - (parseFloat(matchTx.applied_amount) || 0);
  }, [matchTx]);

  // Como a linha do banco se aplica ao lançamento selecionado: apply = min(saldo da linha,
  // saldo a quitar do lançamento). Três cenários:
  //  - exact: valores batem → conciliação integral
  //  - bank_less: banco menor → lançamento fica PARCIAL, linha do banco consumida
  //  - bank_more: banco maior → quita o lançamento e a linha continua com saldo p/ outros
  const applyInfo = useMemo(() => {
    if (!matchTx || !selectedSystemTx) return null;
    const sameDir = (selectedSystemTx.type === 'ENTRADA') === ((parseFloat(matchTx.amount) || 0) >= 0);
    if (!sameDir) return null;
    const txRem = (parseFloat(selectedSystemTx.amount) || 0) - (parseFloat(selectedSystemTx.paid_amount) || 0);
    const bankRem = bankRemaining;
    const apply = Math.min(bankRem, txRem);
    if (apply <= 0.0049) return null;
    const scenario = Math.abs(bankRem - txRem) <= 0.01 ? 'exact' : (bankRem < txRem ? 'bank_less' : 'bank_more');
    return { bankRem, txRem, apply, scenario, bankAfter: bankRem - apply, txAfter: txRem - apply };
  }, [matchTx, selectedSystemTx, bankRemaining]);

  // Ao abrir o 🔗, pré-seleciona o melhor candidato.
  useEffect(() => {
    if (matchTx) setSelectedSystemTx(candidates[0]?.sys || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchTx]);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const selectedRows = useMemo(() => importedTxs.filter(t => selectedIds.has(t.id)), [importedTxs, selectedIds]);

  // Pares sugeridos para as linhas selecionadas (modo lote): cada lançamento do
  // sistema é usado no máximo uma vez (alocação gulosa por maior score).
  const batchMatches = useMemo(() => {
    if (matchTx || !selectedRows.length) return [];
    const pairs = [];
    selectedRows.forEach(imp => {
      systemTxs.forEach(sys => {
        const s = matchScore(imp, sys);
        if (s > 0) pairs.push({ impId: imp.id, sys, score: s });
      });
    });
    pairs.sort((a, b) => b.score - a.score);
    const usedSys = new Set();
    const assigned = {};
    pairs.forEach(p => {
      if (assigned[p.impId] || usedSys.has(p.sys.id)) return;
      assigned[p.impId] = { sys: p.sys, score: p.score };
      usedSys.add(p.sys.id);
    });
    return selectedRows.map(imp => ({ imp, match: assigned[imp.id] || null }));
  }, [selectedRows, systemTxs, matchTx]);

  // Regra de ouro da conciliação: o valor do banco tem de bater com o SALDO A QUITAR do
  // lançamento (±0,01). Pares divergentes ficam FORA do lote (a RPC também barra no banco;
  // aqui é para o usuário enxergar antes de confirmar).
  const pairValueOk = (imp, sys) =>
    Math.abs(Math.abs(parseFloat(imp.amount) || 0) - ((parseFloat(sys.amount) || 0) - (parseFloat(sys.paid_amount) || 0))) <= 0.01;
  const batchToReconcile = useMemo(
    () => batchMatches.filter(b => b.match && !batchSkip.has(b.imp.id) && pairValueOk(b.imp, b.match.sys)),
    [batchMatches, batchSkip]
  );

  const doReconcileBatch = async () => {
    if (!batchToReconcile.length) return toast.error('Nenhum par sugerido para conciliar.');
    try {
      setLoading(true);
      for (const b of batchToReconcile) {
        await financeService.reconcileMatch(b.imp.id, b.match.sys.id);
      }
      toast.success(`${batchToReconcile.length} conciliado(s) com sucesso!`);
      setSelectedIds(new Set());
      setBatchSkip(new Set());
      loadTransactions();
    } catch (e) { console.error(e); toast.error('Erro ao conciliar em lote.'); setLoading(false); }
  };

  // Quantas linhas do banco têm um par sugerido forte (>= 65) — atalho de produtividade.
  const strongMatches = useMemo(() => importedTxs.filter(t => (bankMatches[t.id] || 0) >= 65).length, [importedTxs, bankMatches]);

  const handlePrint = () => {
    const list = viewList;
    if (!list.length) return toast.error('Nada para imprimir na lista atual.');
    const acc = accounts.find(a => a.id === selectedAccountId);
    printReport({
      theme,
      title: `Conciliação Bancária — ${showIgnored ? 'Itens Ignorados' : 'Extrato Pendente'}${acc ? ` (${acc.name})` : ''}`,
      periodText: stats.pending > stats.batchPending
        ? `Fila da conta: ${stats.reconciled} conciliados · ${stats.pending} pendentes`
        : `Último extrato: ${stats.batchReconciled} de ${stats.batchTotal} conciliados · ${stats.pending} pendentes no total`,
      userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema',
      orientation: 'portrait',
      columns: [
        { header: 'Data' }, { header: 'Descrição' }, { header: 'Favorecido' },
        { header: 'Par sugerido' }, { header: 'Valor (R$)', align: 'right' },
      ],
      rows: list.map(t => [
        fmtDate(t.transaction_date),
        t.description || '—',
        t.memo || '—',
        showIgnored ? '—' : (bankMatches[t.id] ? `${scoreLabel(bankMatches[t.id])} (${bankMatches[t.id]}%)` : 'Sem par'),
        `${parseFloat(t.amount) < 0 ? '-' : ''}${fmtMoney(Math.abs(parseFloat(t.amount) || 0))}`,
      ]),
      totalLabel: 'Total de Itens',
    });
  };

  const doLaunch = async (payload) => {
    setConfirmTarget(null);
    try {
      setLoading(true);
      const n = await financeService.launchImportedTransactionsDetailed(payload);
      toast.success(`${n} lançamento(s) realizado(s)!`);
      loadTransactions();
    } catch (e) { console.error(e); toast.error('Erro ao lançar.'); setLoading(false); }
  };

  const doIgnore = async (tx) => {
    try {
      await financeService.ignoreImportedTransaction(tx.id);
      setImportedTxs(list => list.filter(t => t.id !== tx.id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(tx.id); return n; });
      toast.success('Item ignorado.');
    } catch (e) { console.error(e); toast.error('Erro ao ignorar.'); }
  };

  const doIgnoreSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!(await askConfirm({ title: 'Ignorar selecionados', message: `Ignorar ${ids.length} item(ns) do extrato? Eles somem da fila (podem ser restaurados em "Ver ignorados").`, tone: 'primary', confirmLabel: 'Ignorar' }))) return;
    try {
      await financeService.ignoreImportedTransactions(ids);
      setImportedTxs(list => list.filter(t => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      toast.success(`${ids.length} item(ns) ignorado(s).`);
    } catch (e) { console.error(e); toast.error('Erro ao ignorar.'); }
  };

  const doClearStatement = async () => {
    if (!(await askConfirm({ title: 'Limpar extrato importado', message: 'Isto APAGA todos os itens do extrato ainda não conciliados desta conta (pendentes e ignorados). Os já conciliados são preservados. Não dá pra desfazer.', confirmLabel: 'Limpar extrato' }))) return;
    try {
      setLoading(true);
      await financeService.clearImportedStatement(selectedAccountId);
      toast.success('Extrato limpo.');
      loadTransactions();
    } catch (e) { console.error(e); toast.error('Erro ao limpar.'); setLoading(false); }
  };

  const doUnignore = async (tx) => {
    try {
      await financeService.unignoreImportedTransaction(tx.id);
      setIgnoredTxs(list => list.filter(t => t.id !== tx.id));
      setImportedTxs(list => [...list, tx].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)));
      toast.success('Item restaurado.');
    } catch (e) { console.error(e); toast.error('Erro ao restaurar.'); }
  };

  // Carrega os ignorados ao abrir "Ver ignorados" (ou trocar de conta com ele aberto).
  useEffect(() => {
    if (showIgnored && selectedAccountId) {
      financeService.getIgnoredImportedTransactions(selectedAccountId).then(d => setIgnoredTxs(d || [])).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIgnored, selectedAccountId, importedTxs]);

  // Lista exibida no painel esquerdo (pendentes ou ignorados) com busca + filtro de tipo.
  const viewList = useMemo(() => {
    const base = showIgnored ? ignoredTxs : importedTxs;
    const q = impSearch.trim().toLowerCase();
    return base.filter(t => {
      if (impType === 'in' && parseFloat(t.amount) < 0) return false;
      if (impType === 'out' && parseFloat(t.amount) >= 0) return false;
      if (!showIgnored && groupKey && groupKeyFor(t, groupBy) !== groupKey) return false;
      if (q && !((t.description || '').toLowerCase().includes(q) || (t.memo || '').toLowerCase().includes(q) || String(t.amount).includes(q))) return false;
      return true;
    });
  }, [showIgnored, ignoredTxs, importedTxs, impSearch, impType, groupKey, groupBy]);

  const counts = useMemo(() => {
    const rec = importedTxs.filter(t => parseFloat(t.amount) >= 0).length;
    return { all: importedTxs.length, rec, pag: importedTxs.length - rec };
  }, [importedTxs]);

  // Grupos de lançamentos repetidos, p/ filtrar e lançar em lote. No modo 'descval'
  // a chave inclui o valor, juntando contas recorrentes idênticas (mesmo valor todo mês).
  const descGroups = useMemo(() => {
    const map = {};
    importedTxs.forEach(t => {
      const dk = groupKeyOf(t.description);
      if (!dk) return;
      const k = groupKeyFor(t, groupBy);
      const amt = parseFloat(t.amount) || 0;
      if (!map[k]) map[k] = { key: k, descKey: dk, value: Math.abs(amt), count: 0, sum: 0 };
      map[k].count++;
      map[k].sum += amt;
    });
    return Object.values(map).filter(g => g.count >= 2).sort((a, b) => b.count - a.count).slice(0, 14);
  }, [importedTxs, groupBy]);

  // "Selecionar todos" opera sobre a lista visível (filtrada).
  const allSelected = viewList.length > 0 && viewList.every(t => selectedIds.has(t.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(viewList.map(t => t.id)));

  // Cadastra um fornecedor/cliente na hora: abre o pop-up de cadastro breve e só
  // resolve quando o usuário salva (ou cancela). Retorna o id criado (ou null).
  const [partyModal, setPartyModal] = useState(null); // { name, resolve }
  const handleCreateParty = (name) => new Promise((resolve) => setPartyModal({ name, resolve }));
  const savePartyModal = async (data) => {
    try {
      const p = await financeService.createParty(data);
      setParties(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`"${p.name}" cadastrado.`);
      partyModal?.resolve(p.id);
    } catch (e) { console.error(e); toast.error('Erro ao cadastrar fornecedor/cliente.'); partyModal?.resolve(null); }
    setPartyModal(null);
  };
  const cancelPartyModal = () => { partyModal?.resolve(null); setPartyModal(null); };

  // Conciliação INTEGRAL. Só usa reconcile_match na linha PRISTINA (nada aplicado ainda);
  // se a linha já foi parcialmente aplicada, o "valor cheio" da linha ≠ saldo restante, então
  // vai pela rota de aplicação (que conhece o applied_amount) mesmo com os saldos batendo.
  const doReconcile = async () => {
    if (!matchTx || !selectedSystemTx || !applyInfo) return;
    const applied = parseFloat(matchTx.applied_amount) || 0;
    if (applyInfo.scenario !== 'exact' || applied > 0.0049) return doApply();
    try {
      setLoading(true);
      await financeService.reconcileMatch(matchTx.id, selectedSystemTx.id);
      toast.success('Conciliado com sucesso!');
      loadTransactions();
    } catch (e) { console.error(e); toast.error(e.message || 'Erro ao conciliar.'); setLoading(false); }
  };

  // Aplica a linha do banco ao lançamento (baixa = mínimo entre os dois saldos).
  //  - exact: quita o lançamento e conclui a linha do banco (saldos iguais).
  //  - banco menor: lançamento fica PARCIAL, linha do banco consumida.
  //  - banco maior: quita o lançamento e a linha continua com saldo p/ conciliar outros.
  const doApply = async (skipConfirm = false) => {
    if (!matchTx || !selectedSystemTx || !applyInfo) return;
    const { apply, scenario, bankAfter, txAfter } = applyInfo;
    const msg = scenario === 'bank_more'
      ? `Baixar R$ ${fmtMoney(apply)} do lançamento com esta linha do banco. O lançamento fica QUITADO e a linha do banco continua com R$ ${fmtMoney(bankAfter)} para conciliar com outros lançamentos.`
      : scenario === 'bank_less'
      ? `Registrar baixa de R$ ${fmtMoney(apply)} no lançamento. Ele fica PARCIAL (restam R$ ${fmtMoney(txAfter)}) e a linha do banco é consumida.`
      : `Baixar R$ ${fmtMoney(apply)} — quita o lançamento e conclui esta linha do banco.`;
    if (!skipConfirm && !(await askConfirm({ title: 'Aplicar valor', message: msg, confirmLabel: 'Aplicar', tone: 'primary' }))) return;
    try {
      setLoading(true);
      await financeService.reconcileApply(matchTx.id, selectedSystemTx.id);
      toast.success(scenario === 'bank_less'
        ? `Baixa de R$ ${fmtMoney(apply)} registrada — o lançamento ficou parcial.`
        : scenario === 'bank_more'
        ? `Lançamento quitado. Sobram R$ ${fmtMoney(bankAfter)} na linha do banco.`
        : 'Conciliado com sucesso!');
      loadTransactions();
    } catch (e) { console.error(e); toast.error(e.message || 'Erro ao aplicar.'); setLoading(false); }
  };

  // Prévia da baixa em lote: quanto a linha do banco cobre dos marcados (ordem da lista) e
  // até onde vai (pode não cobrir todos). Aplica na ordem exibida em candList.
  const applyManyPreview = useMemo(() => {
    if (!matchTx || applyIds.size === 0) return null;
    let rem = bankRemaining, total = 0, covered = 0;
    for (const { sys } of candList) {
      if (!applyIds.has(sys.id) || rem <= 0.0049) continue;
      const txRem = (parseFloat(sys.amount) || 0) - (parseFloat(sys.paid_amount) || 0);
      const apply = Math.min(rem, txRem);
      if (apply <= 0.0049) continue;
      total += apply; rem -= apply; covered += 1;
    }
    return { total, covered, selected: applyIds.size, bankAfter: rem };
  }, [matchTx, applyIds, candList, bankRemaining]);

  const doApplyMany = async () => {
    if (!matchTx || !applyManyPreview) return;
    // Ordem = a exibida na lista (melhores/cronológica), só os marcados.
    const ids = candList.filter(({ sys }) => applyIds.has(sys.id)).map(({ sys }) => sys.id);
    const p = applyManyPreview;
    if (!(await askConfirm({
      title: 'Baixar selecionados em lote',
      message: `Aplicar R$ ${fmtMoney(p.total)} da linha do banco em ${p.covered} lançamento(s)${p.covered < p.selected ? ` (dos ${p.selected} marcados — o saldo da linha não cobre todos)` : ''}. ${p.bankAfter > 0.0049 ? `Sobram R$ ${fmtMoney(p.bankAfter)} na linha.` : 'A linha do banco é totalmente consumida.'}`,
      confirmLabel: 'Baixar em lote', tone: 'primary'
    }))) return;
    try {
      setLoading(true);
      const n = await financeService.reconcileApplyMany(matchTx.id, ids);
      toast.success(`${n} lançamento(s) baixado(s) com a linha do banco.`);
      loadTransactions();
    } catch (e) { console.error(e); toast.error(e.message || 'Erro na baixa em lote.'); setLoading(false); }
  };

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] flex flex-col bg-[#f5f5f7] font-sans text-[#1d1d1f]">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-[#1d1d1f] tracking-[-.01em] flex items-center gap-2">
            <ArrowRightLeft className="text-[#86868b]" size={17} /> Conciliação Bancária
          </h1>
          <p className="text-[11px] text-[#86868b] mt-0.5">Concilie o extrato do banco com os lançamentos internos</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
            className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#0071e3] shadow-sm cursor-pointer">
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={handlePrint} title="Imprimir a lista atual do extrato"
            className="h-9 px-3 bg-white hover:bg-slate-50 border border-black/[.085] text-slate-600 rounded-lg font-semibold text-[10px] uppercase tracking-wide shadow-sm flex items-center gap-1.5 transition-all">
            <Printer size={14} /> Imprimir
          </button>
          {canEdit && (
            <label className="h-9 px-4 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg font-bold text-[11px] uppercase shadow-sm flex items-center gap-1.5 cursor-pointer select-none transition-all">
              <Upload size={14} /> Importar OFX
              <input type="file" accept=".ofx" onChange={handleFileUpload} className="hidden" />
            </label>
          )}
        </div>
      </div>

      {/* Barra adaptativa: com backlog além do último extrato, mostra a FILA COMPLETA da conta
          (evita dois recortes competindo, ex.: "0 de 84" vs 1.236 pendentes). Sem backlog,
          volta ao modo "último extrato importado" — o fluxo incremental normal. */}
      {(stats.batchTotal > 0 || stats.pending > 0) && (() => {
        const backlog = stats.pending > stats.batchPending;
        const done = backlog ? stats.reconciled : stats.batchReconciled;
        const totalBar = backlog ? stats.reconciled + stats.pending : stats.batchTotal;
        const pct = totalBar ? Math.round((done / totalBar) * 100) : 0;
        const title = backlog
          ? 'Conciliação da conta — fila completa'
          : `Último extrato importado${stats.lastImportAt ? ` · ${new Date(stats.lastImportAt).toLocaleDateString('pt-BR')}` : ''}`;
        return (
          <div className="bg-white border border-black/[.085] rounded-2xl shadow-sm px-4 py-2.5 mb-3 shrink-0 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</span>
                <span className="text-[11px] font-semibold tabular-nums text-slate-700">{done} de {totalBar} · {pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-[10px] font-bold uppercase tracking-wide">
              <span className="text-emerald-600">{done} conciliados</span>
              <span className="text-amber-600">{backlog ? stats.pending : stats.batchPending} pendentes</span>
              {!backlog && stats.batchIgnored > 0 && <span className="text-slate-400">{stats.batchIgnored} ignorados</span>}
              <span className="text-[#0071e3]">{systemTxs.length} lançamentos sem conciliação</span>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">

        {/* EXTRATO DO BANCO */}
        <div className="lg:col-span-7 bg-white border border-black/[.085] rounded-2xl shadow-sm flex flex-col min-h-[300px] overflow-hidden">
          <div className="border-b border-black/[.06] shrink-0">
            <div className="flex items-center justify-between gap-2 px-3 h-10">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {showIgnored ? 'Itens Ignorados' : 'Extrato Importado (Banco)'}
              </span>
              <div className="flex items-center gap-1.5">
                {canEdit && !showIgnored && selectedIds.size > 0 && (
                  <>
                    <button onClick={() => setConfirmTarget(selectedRows)}
                      className="h-7 px-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 shadow-sm"><Zap size={12} /> Lançar {selectedIds.size}</button>
                    <button onClick={doIgnoreSelected}
                      className="h-7 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1"><EyeOff size={12} /> Ignorar {selectedIds.size}</button>
                  </>
                )}
                {!showIgnored && selectedIds.size === 0 && (
                  <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-semibold">{importedTxs.length} pendentes</span>
                )}
                <button onClick={() => { setShowIgnored(s => !s); setSelectedIds(new Set()); setGroupKey(null); }}
                  className={`h-7 px-2.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${showIgnored ? 'bg-[#0071e3] text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                  {showIgnored ? 'Voltar' : 'Ignorados'}
                </button>
                {canEdit && !showIgnored && importedTxs.length > 0 && (
                  <button onClick={doClearStatement} title="Apagar todo o extrato não conciliado desta conta"
                    className="h-7 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1"><Trash2 size={12} /> Limpar</button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-50">
              <div className="flex items-center gap-1.5 px-2 bg-slate-50 border border-black/[.085] rounded-lg h-8 flex-1 min-w-0">
                <Search size={13} className="text-slate-400 shrink-0" />
                <input value={impSearch} onChange={e => setImpSearch(e.target.value)} placeholder="Buscar por descrição ou valor..."
                  className="bg-transparent text-xs font-semibold text-slate-700 outline-none w-full" />
              </div>
              {!showIgnored && (
                <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
                  {[['all', `Todos ${counts.all}`], ['in', `Receb. ${counts.rec}`], ['out', `Pag. ${counts.pag}`]].map(([k, lbl]) => (
                    <button key={k} onClick={() => setImpType(k)}
                      className={`px-2 h-6 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all ${impType === k ? 'bg-white shadow-sm text-[#0071e3]' : 'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Chips de agrupamento: clica → filtra os repetidos daquele tipo p/ lançar em lote.
                Modo "Desc + valor" junta contas recorrentes idênticas (mesmo valor todo mês). */}
            {!showIgnored && (importedTxs.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 -mt-0.5">
                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">Grupos:</span>
                <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
                  {[['desc', 'Descrição'], ['descval', 'Desc + valor']].map(([k, lbl]) => (
                    <button key={k} onClick={() => { setGroupBy(k); setGroupKey(null); setSelectedIds(new Set()); }}
                      className={`px-2 h-5 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all ${groupBy === k ? 'bg-white shadow-sm text-[#0071e3]' : 'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
                  ))}
                </div>
                {descGroups.length === 0 ? (
                  <span className="text-[10px] font-semibold text-slate-400 italic">Nenhum grupo repetido.</span>
                ) : descGroups.map(g => {
                  const active = groupKey === g.key;
                  const title = g.descKey.charAt(0) + g.descKey.slice(1).toLowerCase();
                  const label = groupBy === 'descval' ? `${title} · R$ ${fmtMoney(g.value)}` : title;
                  return (
                    <button key={g.key} title={`${label} · ${g.count} lançamento(s) · total ${fmtMoney(g.sum)}`}
                      onClick={() => { setGroupKey(active ? null : g.key); setSelectedIds(new Set()); }}
                      className={`shrink-0 h-6 pl-2 pr-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 border transition-colors ${active ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-black/[.085] text-slate-600 hover:border-[#0071e3]/40'}`}>
                      <span className="max-w-[220px] truncate normal-case">{label}</span>
                      <span className={`px-1 rounded-full text-[9px] font-semibold ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{g.count}</span>
                      {active && <X size={11} className="shrink-0" />}
                    </button>
                  );
                })}
                {groupKey && (
                  <button onClick={() => { setGroupKey(null); setSelectedIds(new Set()); }}
                    className="shrink-0 h-6 px-2 rounded-full text-[10px] font-semibold uppercase text-slate-400 hover:text-rose-500">Limpar</button>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 size={26} className="text-[#0071e3] animate-spin" /></div>
          ) : viewList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-[11px] font-bold uppercase gap-2 px-6 text-center">
              <FileText size={28} className="text-slate-300" />
              {showIgnored ? 'Nenhum item ignorado.' : importedTxs.length === 0 ? 'Nenhum extrato pendente. Importe um arquivo OFX.' : 'Nada encontrado com esses filtros.'}
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest border-b border-black/[.06]">
                    <th className="py-2 px-3 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-indigo-600 cursor-pointer" /></th>
                    <th className="py-2 px-1">Data</th>
                    <th className="py-2 px-2">Descrição</th>
                    <th className="py-2 px-2 text-right">Valor</th>
                    <th className="py-2 px-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.055]">
                  {viewList.map(tx => {
                    const checked = selectedIds.has(tx.id);
                    const isMatch = matchTx?.id === tx.id;
                    const best = bankMatches[tx.id] || 0;
                    return (
                      <tr key={tx.id} className={`text-xs transition-colors ${isMatch ? 'bg-indigo-50/60' : checked ? 'bg-indigo-50/30' : 'hover:bg-[#f5f5f7]'}`}>
                        <td className="py-2 px-3">{!showIgnored && <input type="checkbox" checked={checked} onChange={() => toggleSelect(tx.id)} className="accent-indigo-600 cursor-pointer" />}</td>
                        <td className="py-2 px-1 font-bold text-slate-400 tabular-nums whitespace-nowrap">{fmtDate(tx.transaction_date)}</td>
                        <td className="py-2 px-2">
                          <div className="font-bold text-slate-700 truncate max-w-[220px]" title={tx.description}>{tx.description}</div>
                          {tx.memo && <div className="text-[10px] text-slate-400 italic truncate max-w-[220px]">{tx.memo}</div>}
                        </td>
                        <td className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          <span className="font-semibold block">R$ {fmtMoney(tx.amount)}</span>
                          {(parseFloat(tx.applied_amount) || 0) > 0.004 && (
                            <span className="text-[9px] font-semibold text-sky-600 block">resta R$ {fmtMoney(Math.abs(parseFloat(tx.amount)) - (parseFloat(tx.applied_amount) || 0))}</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-end gap-1.5">
                            {showIgnored ? (
                              canEdit && <button onClick={() => doUnignore(tx)} title="Restaurar para a fila de conciliação"
                                className="h-6 px-2 bg-slate-100 hover:bg-[#0071e3] hover:text-white text-slate-600 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors flex items-center gap-1"><RotateCcw size={11} /> Restaurar</button>
                            ) : (
                              <>
                                {best >= 45 && <SignalBars score={best} />}
                                {canEdit && (
                                  <>
                                    <button onClick={() => setConfirmTarget([tx])} title="Lançar no sistema (cria novo)"
                                      className="h-6 px-2 bg-indigo-50 hover:bg-[#0071e3] hover:text-white text-[#0071e3] rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors">Lançar</button>
                                    <button onClick={() => setMatchTx(tx)} title={best > 0 ? `Conciliar — possível par (${scoreLabel(best)})` : 'Buscar par no sistema'}
                                      className={`p-1 rounded-md transition-colors relative ${isMatch ? 'bg-[#0071e3] text-white' : best >= 65 ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50'}`}><Link2 size={13} /></button>
                                    <button onClick={() => doIgnore(tx)} title="Ignorar este item do extrato (não vira lançamento)"
                                      className="p-1 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"><EyeOff size={13} /></button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PARES NO SISTEMA (conciliar) — sticky: acompanha a rolagem da lista do banco
            p/ comparar lado a lado; altura limitada à viewport com scroll interno. */}
        <div ref={matchPanelRef}
          className="lg:col-span-5 bg-white border border-black/[.085] rounded-2xl shadow-sm flex flex-col min-h-[300px] overflow-hidden lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100dvh-88px)]">
          <div className="flex items-center justify-between px-3 h-10 border-b border-black/[.06] shrink-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {!matchTx && selectedRows.length > 0 ? `Conciliar em lote · ${selectedRows.length} selecionada(s)` : 'Conciliar com Lançamento'}
            </span>
            {/* Com vários marcados → baixa em lote; senão a ação do único selecionado. */}
            {canEdit && matchTx && applyManyPreview ? (
              <button onClick={doApplyMany}
                title={`Aplica R$ ${fmtMoney(applyManyPreview.total)} da linha em ${applyManyPreview.covered} lançamento(s)`}
                className="h-7 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Split size={12} /> Baixar {applyManyPreview.covered} · R$ {fmtMoney(applyManyPreview.total)}
              </button>
            ) : canEdit && matchTx && selectedSystemTx && applyInfo && (
              <div className="flex items-center gap-1.5">
                {applyInfo.scenario === 'exact' ? (
                  <button onClick={doReconcile}
                    title="Valores batem — concilia integral e trava o lançamento"
                    className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                    <Check size={12} strokeWidth={3} /> Reconciliar
                  </button>
                ) : (
                  <button onClick={() => doApply()}
                    title={applyInfo.scenario === 'bank_more'
                      ? `Quita o lançamento (R$ ${fmtMoney(applyInfo.apply)}); a linha do banco continua com R$ ${fmtMoney(applyInfo.bankAfter)}`
                      : `Baixa parcial de R$ ${fmtMoney(applyInfo.apply)} — o lançamento fica parcial`}
                    className="h-7 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                    <Split size={12} /> {applyInfo.scenario === 'bank_more' ? `Baixar R$ ${fmtMoney(applyInfo.apply)}` : 'Baixa parcial'}
                  </button>
                )}
              </div>
            )}
            {canEdit && !matchTx && selectedRows.length > 0 && (
              <button onClick={doReconcileBatch} disabled={!batchToReconcile.length}
                className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-colors">
                <Check size={12} strokeWidth={3} /> Reconciliar {batchToReconcile.length || ''}
              </button>
            )}
          </div>

          {!matchTx && selectedRows.length > 0 ? (
            /* MODO LOTE: cada linha selecionada com seu par sugerido */
            <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="px-3 py-2 bg-slate-50 border-b border-black/[.06] text-[10px] font-semibold text-slate-500 shrink-0">
                Confira os pares sugeridos e clique em <span className="font-semibold text-emerald-600">Reconciliar</span>. Desmarque os que não quiser conciliar agora.
              </div>
              <div className="p-2 space-y-1.5">
                {batchMatches.map(({ imp, match }) => {
                  const skipped = batchSkip.has(imp.id);
                  const cp = match ? (counterpartyName(match.sys) || match.sys.description) : null;
                  const valueOk = match ? pairValueOk(imp, match.sys) : false;
                  return (
                    <div key={imp.id} className={`rounded-lg border p-2 transition-all ${!match ? 'border-amber-200 bg-amber-50/30' : !valueOk ? 'border-amber-200 bg-amber-50/40' : skipped ? 'border-black/[.06] bg-slate-50/40 opacity-60' : 'border-emerald-200 bg-emerald-50/30'}`}>
                      {/* linha do banco */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[9px] font-bold text-slate-400">{fmtDate(imp.transaction_date)}</span>
                          <div className="text-[11px] font-bold text-slate-700 truncate">{imp.description}{imp.memo ? <span className="font-semibold text-slate-400"> · {imp.memo}</span> : ''}</div>
                        </div>
                        <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${imp.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>R$ {fmtMoney(imp.amount)}</span>
                      </div>
                      {/* par sugerido */}
                      {match ? (
                        <div className={`mt-1.5 flex items-center gap-2 pl-2 border-l-2 ${valueOk ? 'border-emerald-300' : 'border-amber-300'}`}>
                          <SignalBars score={match.score} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-slate-700 truncate">{cp}</div>
                            <div className="text-[9px] font-semibold text-slate-400">{scoreLabel(match.score)} · {match.score}% · {fmtDate(sysDate(match.sys))}</div>
                            {!valueOk && (
                              <div className="text-[9px] font-bold text-amber-600">Valor difere do saldo a quitar — fora do lote. Abra pelo 🔗 p/ baixa parcial ou ajuste.</div>
                            )}
                          </div>
                          <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${match.sys.type === 'ENTRADA' ? 'text-emerald-600' : 'text-rose-600'}`}>R$ {fmtMoney(match.sys.amount)}</span>
                          {valueOk && (
                            <label className="flex items-center shrink-0 cursor-pointer" title={skipped ? 'Incluir na conciliação' : 'Não conciliar esta agora'}>
                              <input type="checkbox" checked={!skipped} onChange={() => setBatchSkip(prev => { const n = new Set(prev); n.has(imp.id) ? n.delete(imp.id) : n.add(imp.id); return n; })}
                                className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                            </label>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1.5 pl-2 text-[10px] font-bold text-amber-600 uppercase tracking-wide">Sem par sugerido — use “Lançar”.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !matchTx && viewOrphans ? (
            /* LISTA de lançamentos internos sem conciliação (não há linha do banco pra puxá-los) */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-black/[.06] shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#0071e3]">Lançamentos sem conciliação · {systemTxs.length}</span>
                <button onClick={() => setViewOrphans(false)} className="h-6 px-2 rounded-md text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 flex items-center gap-1 transition-colors">
                  <X size={12} /> Voltar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                {systemTxs.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-[11px] font-bold uppercase">Tudo conciliado nesta conta.</div>
                ) : systemTxs.map(sys => {
                  const cp = counterpartyName(sys) || sys.description;
                  return (
                    <div key={sys.id} className="rounded-lg border border-black/[.06] bg-slate-50/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[9px] font-bold text-slate-400">{fmtDate(sysDate(sys))}{sys.status === 'PAGO' ? ' · pago' : ''}</span>
                          <div className="text-[11px] font-bold text-slate-700 truncate">{cp}</div>
                          {cp !== sys.description && sys.description && <div className="text-[9px] font-semibold text-slate-400 truncate">{sys.description}</div>}
                          {sys.finance_categories?.name && <div className="text-[9px] font-semibold text-slate-400 truncate">{sys.finance_categories.name}</div>}
                        </div>
                        <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${sys.type === 'ENTRADA' ? 'text-emerald-600' : 'text-rose-600'}`}>{sys.type === 'ENTRADA' ? '+' : '−'} R$ {fmtMoney(Math.abs(sys.amount))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 px-3 py-2 border-t border-black/[.06] text-[10px] font-medium text-slate-400 leading-snug">
                Para conciliar, importe o extrato (OFX) que contém o movimento correspondente — a linha do banco aparecerá aqui como pendente.
              </div>
            </div>
          ) : !matchTx ? (
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto custom-scrollbar">
              {/* Resumo útil no lugar do espaço vazio */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative overflow-hidden rounded-2xl border border-black/[.085] bg-white p-3 shadow-sm">
                  <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-slate-100/80" />
                  <FileText size={14} className="text-slate-300 absolute right-2.5 top-2.5" />
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 relative">Extrato pendente</div>
                  <div className="text-2xl font-semibold tabular-nums text-slate-800 mt-1 leading-none relative">{importedTxs.length}</div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-3 shadow-sm">
                  <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-emerald-100/50" />
                  <Zap size={14} className="text-emerald-300 absolute right-2.5 top-2.5" />
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-emerald-500 relative">Com par sugerido</div>
                  <div className="text-2xl font-semibold tabular-nums text-emerald-600 mt-1 leading-none relative">{strongMatches}</div>
                </div>
                <button type="button" onClick={() => { if (systemTxs.length) { setSelectedIds(new Set()); setMatchTx(null); setViewOrphans(true); } }}
                  disabled={!systemTxs.length}
                  className="relative overflow-hidden text-left rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-3 shadow-sm hover:border-[#0071e3]/40 hover:shadow-md disabled:hover:border-indigo-100 disabled:hover:shadow-sm disabled:cursor-default transition-all">
                  <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-indigo-100/50" />
                  <Link2 size={14} className="text-indigo-300 absolute right-2.5 top-2.5" />
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-[#0071e3] relative flex items-center gap-1">Sem conciliação {systemTxs.length > 0 && <span className="text-[#0071e3] normal-case font-bold">(ver)</span>}</div>
                  <div className="text-2xl font-semibold tabular-nums text-[#0071e3] mt-1 leading-none relative">{systemTxs.length}</div>
                </button>
                <div className="relative overflow-hidden rounded-2xl border border-black/[.085] bg-white p-3 shadow-sm">
                  <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-slate-100/80" />
                  <Check size={14} className="text-slate-300 absolute right-2.5 top-2.5" />
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 relative">Conciliados (últ. extrato)</div>
                  <div className="text-2xl font-semibold tabular-nums text-slate-700 mt-1 leading-none relative">{stats.batchReconciled}</div>
                </div>
              </div>
              <div className="rounded-xl border border-black/[.085] bg-white p-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  <HelpCircle size={13} className="text-[#0071e3]" /> Como conciliar
                </div>
                <ol className="text-[11px] font-medium text-slate-500 space-y-1.5 leading-snug list-decimal ml-4">
                  <li>Clique no <Link2 size={11} className="inline text-slate-400" /> de uma linha do banco para buscar um par já lançado.</li>
                  <li>Linhas com <span className="text-emerald-600 font-bold">par sugerido</span> (barras verdes) são as mais rápidas.</li>
                  <li>Sem par? Use <span className="font-bold text-[#0071e3]">Lançar</span> para criar o lançamento a partir do extrato.</li>
                  <li>Selecione várias e use <span className="font-bold">Lançar N</span> para processar em lote.</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Linha do banco em conciliação */}
              <div className="px-3 py-2 bg-slate-50/80 border-b border-black/[.085] shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[9px] font-semibold uppercase text-slate-400 tracking-widest">Linha do banco · {fmtDate(matchTx.transaction_date)}</span>
                    <div className="text-[12px] font-semibold text-slate-800 truncate leading-tight">{matchTx.description}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[13px] font-semibold tabular-nums block ${matchTx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {matchTx.amount >= 0 ? '+' : '−'} R$ {fmtMoney(Math.abs(matchTx.amount))}
                    </span>
                    {(parseFloat(matchTx.applied_amount) || 0) > 0.004 && (
                      <span className="text-[10px] font-semibold text-sky-600 tabular-nums block">
                        aplicado R$ {fmtMoney(parseFloat(matchTx.applied_amount))} · resta R$ {fmtMoney(bankRemaining)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Filtros — mesmo padrão do Contas a Pagar/Receber, versão compacta.
                  O sentido é automático: entrada só vê entradas; saída só vê saídas. */}
              <div className="px-2.5 py-2 border-b border-black/[.06] shrink-0 space-y-1.5">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input value={candSearch} onChange={e => setCandSearch(e.target.value)}
                    placeholder="Buscar por nome, valor, categoria…"
                    className="w-full h-7 pl-7 pr-2 bg-white border border-black/[.085] rounded-md text-[11px] text-slate-600 outline-none focus:border-indigo-400" />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <select value={candFilters.status} onChange={e => setCandFilters(f => ({ ...f, status: e.target.value }))}
                    className="h-7 px-1.5 w-full bg-white border border-black/[.085] rounded-md text-[10.5px] text-slate-600 outline-none focus:border-indigo-400 cursor-pointer">
                    <option value="">Situação: todas</option>
                    <option value="PENDENTE">Pendentes</option>
                    <option value="PARCIAL">Parciais</option>
                    <option value="PAGO">Pagos</option>
                  </select>
                  <select value={candFilters.cc} onChange={e => setCandFilters(f => ({ ...f, cc: e.target.value }))}
                    className="h-7 px-1.5 w-full bg-white border border-black/[.085] rounded-md text-[10.5px] text-slate-600 outline-none focus:border-indigo-400 cursor-pointer">
                    <option value="">C. custo: todos</option>
                    {candOpts.ccs.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                  </select>
                  <select value={candFilters.cat} onChange={e => setCandFilters(f => ({ ...f, cat: e.target.value }))}
                    className="h-7 px-1.5 w-full bg-white border border-black/[.085] rounded-md text-[10.5px] text-slate-600 outline-none focus:border-indigo-400 cursor-pointer">
                    <option value="">Categoria: todas</option>
                    {candOpts.cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] font-semibold uppercase text-slate-400 shrink-0">Mês</span>
                    <input type="month" title="Mês do vencimento" value={candFilters.mes}
                      onChange={e => setCandFilters(f => ({ ...f, mes: e.target.value }))}
                      className="h-7 px-1.5 w-full min-w-0 bg-white border border-black/[.085] rounded-md text-[10.5px] text-slate-600 outline-none focus:border-indigo-400" />
                  </label>
                  <label className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] font-semibold uppercase text-sky-500 shrink-0">Comp.</span>
                    <input type="month" title="Competência (mês de referência; sem competência, vale o mês da data)" value={candFilters.comp}
                      onChange={e => setCandFilters(f => ({ ...f, comp: e.target.value }))}
                      className="h-7 px-1.5 w-full min-w-0 bg-white border border-black/[.085] rounded-md text-[10.5px] text-slate-600 outline-none focus:border-indigo-400" />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] font-semibold uppercase text-slate-400 shrink-0">De</span>
                    <input type="date" title="Lançamentos a partir de" value={candFilters.from}
                      onChange={e => setCandFilters(f => ({ ...f, from: e.target.value }))}
                      className="h-7 px-1.5 w-full min-w-0 bg-white border border-black/[.085] rounded-md text-[10.5px] text-slate-600 outline-none focus:border-indigo-400" />
                  </label>
                  <label className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] font-semibold uppercase text-slate-400 shrink-0">Até</span>
                    <input type="date" title="Lançamentos até" value={candFilters.to}
                      onChange={e => setCandFilters(f => ({ ...f, to: e.target.value }))}
                      className="h-7 px-1.5 w-full min-w-0 bg-white border border-black/[.085] rounded-md text-[10.5px] text-slate-600 outline-none focus:border-indigo-400" />
                  </label>
                </div>
              </div>
              {/* Lista densa de candidatos */}
              <div ref={candListRef} className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                {systemTxs.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-[11px] font-semibold">Nenhum lançamento sem conciliação nesta conta.<br />Use "Lançar" para criar um novo.</div>
                ) : candList.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-[11px] font-semibold">Nenhum lançamento de {matchTx.amount >= 0 ? 'entrada' : 'saída'} bate com os filtros.</div>
                ) : (
                  <div className="divide-y divide-black/[.055]">
                    {candList.map(({ sys, score }) => {
                      const sel = selectedSystemTx?.id === sys.id;
                      const cp = counterpartyName(sys);
                      const meta = [sys.finance_categories?.name, sys.finance_cost_centers?.name,
                        (cp && sys.description && sys.description !== cp) ? sys.description : null].filter(Boolean).join(' · ');
                      const checked = applyIds.has(sys.id);
                      return (
                        <div key={sys.id}
                          className={`w-full flex items-stretch border-l-2 transition-colors ${checked ? 'border-l-sky-500 bg-sky-50/40' : sel ? 'border-l-indigo-500 bg-indigo-50/50' : 'border-l-transparent hover:bg-slate-50'}`}>
                          <label className="flex items-center pl-2.5 pr-1 cursor-pointer shrink-0" title="Marcar para baixar em lote">
                            <input type="checkbox" checked={checked}
                              onChange={() => setApplyIds(prev => { const n = new Set(prev); n.has(sys.id) ? n.delete(sys.id) : n.add(sys.id); return n; })}
                              className="w-4 h-4 accent-sky-600 cursor-pointer" />
                          </label>
                          <button onClick={() => setSelectedSystemTx(sys)} className="flex-1 min-w-0 text-left pr-3 py-1.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-[10px] text-slate-400 tabular-nums shrink-0 w-[52px]">{fmtDate(sysDate(sys))}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11.5px] font-semibold text-slate-800 truncate leading-tight">{cp || sys.description || '—'}</div>
                              <div className="text-[10px] text-slate-400 truncate leading-tight">{meta || '—'}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`text-[11.5px] font-semibold tabular-nums block leading-tight ${sys.type === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'}`}>R$ {fmtMoney(sys.amount)}</span>
                              <span className="text-[9px] text-slate-400 tabular-nums block leading-tight">
                                {sys.status === 'PARCIAL'
                                  ? `resta R$ ${fmtMoney((parseFloat(sys.amount) || 0) - (parseFloat(sys.paid_amount) || 0))}`
                                  : score > 0 ? `${scoreLabel(score)} · ${score}%` : (sys.status === 'PAGO' ? 'pago' : 'em aberto')}
                              </span>
                            </div>
                            {score > 0 ? <SignalBars score={score} /> : <span className="w-[18px] shrink-0" />}
                          </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="shrink-0 px-3 py-1.5 border-t border-black/[.06] text-[10px] text-slate-400 tabular-nums flex items-center justify-between">
                <span>{candList.length} candidato{candList.length === 1 ? '' : 's'} · só {matchTx.amount >= 0 ? 'entradas' : 'saídas'} da conta</span>
                {applyIds.size > 0 && (
                  <button onClick={() => setApplyIds(new Set())} className="text-sky-600 font-semibold hover:underline">{applyIds.size} marcado{applyIds.size === 1 ? '' : 's'} · limpar</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Popup de confirmação de lançamento */}
      {confirmTarget && (
        <ConfirmLaunch rows={confirmTarget} categories={categories} costCenters={costCenters} accounts={accounts} parties={parties} onCreateParty={handleCreateParty} currentAccountId={selectedAccountId} onClose={() => setConfirmTarget(null)} onConfirm={doLaunch} />
      )}

      {partyModal && (
        <PartyModal initialName={partyModal.name} onSave={savePartyModal} onCancel={cancelPartyModal} />
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

// Barras de sinal (estilo wifi) indicando a confiança do par sugerido.
function SignalBars({ score }) {
  const bars = scoreToBars(score);
  const color = bars >= 4 ? 'bg-emerald-500' : bars === 3 ? 'bg-emerald-400' : bars === 2 ? 'bg-amber-400' : 'bg-slate-400';
  return (
    <span title={`${score}% de chance de ser o par`} className="inline-flex items-end gap-[2px] h-3.5 shrink-0">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className={`w-[3px] rounded-sm ${i < bars ? color : 'bg-slate-200'}`} style={{ height: `${(i + 1) * 25}%` }} />
      ))}
    </span>
  );
}

// Achata uma árvore (centro de custo / categoria) na ordem cadastrada:
// pai primeiro, depois filhos indentados (1, 1.1, 1.1.1, 1.2…).
const flattenTree = (list) => {
  const childrenOf = (pid) => (list || []).filter(c => (c.parent_id || null) === (pid || null))
    .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
  const out = [];
  const walk = (pid, depth) => childrenOf(pid).forEach(c => { out.push({ value: c.id, label: c.name, depth }); walk(c.id, depth + 1); });
  walk(null, 0);
  return out;
};

// Modal de lançamento da conciliação: editor por linha (descrição, valor, categoria,
// método e transferência individuais) + padrões "aplicar a todas".
function ConfirmLaunch({ rows, categories, costCenters, accounts, parties, onCreateParty, currentAccountId, onClose, onConfirm }) {
  const ccOptions = useMemo(() => flattenTree(costCenters), [costCenters]);
  const catOptionsByType = useMemo(() => ({
    ENTRADA: flattenTree((categories || []).filter(c => c.type === 'ENTRADA')),
    SAIDA: flattenTree((categories || []).filter(c => c.type === 'SAIDA')),
  }), [categories]);
  const accountOptions = (accounts || []).filter(a => a.id !== currentAccountId).map(a => ({ value: a.id, label: a.name }));
  const partyOptions = (parties || []).map(p => ({ value: p.id, label: p.name }));

  const [defCostCenter, setDefCostCenter] = useState('');
  const [defCategory, setDefCategory] = useState('');
  const [defMethod, setDefMethod] = useState('PIX');
  const [defRefMonth, setDefRefMonth] = useState(prevMonthISO());
  const [defParty, setDefParty] = useState('');
  // Tenta casar a contraparte do extrato (memo/complemento) com um cadastro existente.
  // Ex.: "FULANO DE TAL" → fornecedor "Fulano de Tal". Retorna '' se nada bater bem.
  const suggestPartyId = (text) => {
    const t = (text || '').trim();
    if (t.length < 3) return '';
    let bestId = '', best = 0;
    for (const p of (parties || [])) {
      const s = nameScore(t, p.name);
      if (s > best) { best = s; bestId = p.id; }
    }
    return best >= 0.82 ? bestId : '';
  };
  const [items, setItems] = useState(() => rows.map(r => {
    const amt = parseFloat(r.amount) || 0;
    const payee = r.memo || '';            // contraparte ("quem recebeu/enviou")
    const guessedParty = suggestPartyId(payee);
    return {
      id: r.id, date: r.transaction_date, type: amt >= 0 ? 'ENTRADA' : 'SAIDA',
      description: r.description || '', payee, amount: Math.abs(amt).toFixed(2),
      categoryId: '', method: 'PIX', asTransfer: false, counterAccountId: '', splits: null,
      costCenterId: '', referenceMonth: prevMonthISO(),
      partyId: guessedParty || '', partySuggested: !!guessedParty,
    };
  }));

  const upd = (id, patch) => setItems(list => list.map(it => it.id === id ? { ...it, ...patch } : it));

  // --- Rateio (split) por linha: divide o valor em 2+ categorias (ex.: principal + juros) ---
  const splitSum = (it) => (it.splits || []).reduce((a, s) => a + (parseFloat(s.amount) || 0), 0);
  const startSplit = (it) => upd(it.id, {
    asTransfer: false,
    splits: [{ categoryId: it.categoryId || '', amount: it.amount }, { categoryId: '', amount: '0.00' }],
  });
  const stopSplit = (id) => upd(id, { splits: null });
  const updSplit = (id, idx, patch) => setItems(list => list.map(it =>
    it.id === id ? { ...it, splits: it.splits.map((s, i) => i === idx ? { ...s, ...patch } : s) } : it));
  const addSplitRow = (id) => setItems(list => list.map(it =>
    it.id === id ? { ...it, splits: [...it.splits, { categoryId: '', amount: '0.00' }] } : it));
  const removeSplitRow = (id, idx) => setItems(list => list.map(it =>
    it.id === id ? { ...it, splits: it.splits.length <= 2 ? it.splits : it.splits.filter((_, i) => i !== idx) } : it));
  const total = items.reduce((a, it) => a + (it.type === 'ENTRADA' ? 1 : -1) * (parseFloat(it.amount) || 0), 0);
  const singleType = items.every(it => it.type === 'ENTRADA') ? 'ENTRADA' : items.every(it => it.type === 'SAIDA') ? 'SAIDA' : null;

  const applyDefaults = () => setItems(list => list.map(it => ({
    ...it,
    method: defMethod,
    costCenterId: defCostCenter,
    referenceMonth: defRefMonth,
    categoryId: (!it.asTransfer && singleType) ? defCategory : it.categoryId,
    // Fornecedor só sobrescreve quando um padrão foi escolhido (não limpam o que já está na linha).
    partyId: defParty || it.partyId,
    partySuggested: defParty ? false : it.partySuggested,
  })));

  const confirm = () => {
    for (const it of items) {
      const ref = it.description ? `"${it.description.slice(0, 30)}"` : 'sem descrição';
      if (!(parseFloat(it.amount) > 0)) return toast.error('Há lançamento com valor inválido (deve ser maior que zero).');
      if (it.asTransfer && !it.counterAccountId) return toast.error('Selecione a conta contrária das transferências marcadas.');
      if (!it.asTransfer) {
        if (!it.costCenterId) return toast.error(`Linha ${ref}: selecione o Contrato / Centro de custo.`);
        if (!it.partyId) return toast.error(`Linha ${ref}: selecione o Fornecedor/Pagador.`);
        if (!it.splits && !it.categoryId) return toast.error(`Linha ${ref}: selecione a Categoria.`);
        if (!it.referenceMonth) return toast.error(`Linha ${ref}: informe a Competência (mês de referência).`);
      }
      if (it.splits) {
        if (it.splits.some(s => !(parseFloat(s.amount) > 0))) return toast.error('No rateio, cada categoria deve ter valor maior que zero.');
        if (it.splits.some(s => !s.categoryId)) return toast.error('No rateio, selecione a categoria de cada parte.');
        if (Math.abs(splitSum(it) - parseFloat(it.amount)) > 0.01) return toast.error(`A soma do rateio não bate com o valor da linha (${fmtMoney(parseFloat(it.amount))}).`);
      }
    }
    onConfirm(items.map(it => ({
      id: it.id,
      cost_center_id: it.costCenterId || null,
      category_id: (it.asTransfer || it.splits) ? null : (it.categoryId || null),
      payment_method: it.method,
      description: it.description,
      amount: it.amount,
      as_transfer: it.asTransfer,
      counter_account_id: it.asTransfer ? (it.counterAccountId || null) : null,
      splits: it.splits ? it.splits.map(s => ({ category_id: s.categoryId || null, amount: s.amount })) : null,
      reference_month: it.referenceMonth || null,
      party_id: it.asTransfer ? null : (it.partyId || null),
    })));
  };

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl relative z-10 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] overflow-hidden ring-1 ring-slate-900/5">
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/[.06] flex items-center justify-between shrink-0 bg-[#f5f5f7]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-[#0071e3] grid place-items-center  shrink-0">
              <Zap size={17} className="text-white" fill="currentColor" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight leading-none">Confirmar Lançamento</h3>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{items.length} {items.length === 1 ? 'transação' : 'transações'}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">→ Pago</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${total >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                  líquido R$ {fmtMoney(total)}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 bg-white border border-black/[.085] rounded-xl shrink-0 transition-colors shadow-sm"><X size={16} /></button>
        </div>

        {/* Padrões (aplicam a todas) */}
        <div className="px-5 py-3.5 border-b border-black/[.06] bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="h-5 w-5 rounded-md bg-indigo-100 grid place-items-center"><Sliders size={11} className="text-[#0071e3]" /></span>
            <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Padrões</span>
            <span className="text-[9px] font-bold text-slate-400 normal-case tracking-normal">— preenchem todas as linhas de uma vez</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <div className="sm:col-span-4">
              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Contrato / Centro de Custo</label>
              <SearchableSelect options={ccOptions} value={defCostCenter} onChange={setDefCostCenter}
                placeholder="Contrato / centro" searchPlaceholder="Buscar contrato…" size="sm" />
            </div>
            <div className="sm:col-span-4">
              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Categoria padrão</label>
              <SearchableSelect options={singleType ? catOptionsByType[singleType] : []} value={defCategory} onChange={setDefCategory}
                allowEmpty emptyLabel={singleType ? 'Sem categoria' : 'Tipos mistos — por linha'} searchPlaceholder="Buscar categoria…" size="sm" />
            </div>
            <div className="sm:col-span-4">
              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Fornecedor / Pagador</label>
              <SearchableSelect options={partyOptions} value={defParty} onChange={setDefParty}
                allowEmpty emptyLabel="— por linha" placeholder="Fornecedor / pagador" searchPlaceholder="Buscar fornecedor/pagador…"
                onCreate={onCreateParty} createLabel="Cadastrar" size="sm" />
            </div>
            <div className="sm:col-span-3">
              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Competência</label>
              <input type="month" value={defRefMonth} onChange={e => setDefRefMonth(e.target.value)}
                className="w-full h-8 px-2 bg-white border border-black/[.085] rounded-lg text-[11px] font-bold text-slate-600 outline-none focus:border-[#0071e3]" />
            </div>
            <div className="sm:col-span-3">
              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-1 block">Método</label>
              <select value={defMethod} onChange={e => setDefMethod(e.target.value)}
                className="w-full h-8 px-2 bg-white border border-black/[.085] rounded-lg text-[11px] font-bold text-slate-700 outline-none focus:border-[#0071e3] cursor-pointer">
                {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="sm:col-span-6">
              <button type="button" onClick={applyDefaults}
                className="w-full h-8 px-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[10px] font-semibold uppercase tracking-wide shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center justify-center gap-1.5 transition-all">
                <Check size={12} strokeWidth={3} /> Aplicar a todas</button>
            </div>
          </div>
        </div>

        {/* Lista editável */}
        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar bg-slate-50/40">
          {items.map(it => {
            const counterLabel = it.type === 'SAIDA' ? 'Conta de destino' : 'Conta de origem';
            const inflow = it.type === 'ENTRADA';
            const [dd, mm] = fmtDate(it.date).split('/');
            return (
              <div key={it.id} className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 border-l-4 ${inflow ? 'border-l-emerald-400' : 'border-l-rose-400'} p-4 transition-shadow hover:shadow-md`}>
                {/* Cabeçalho: data, descrição, valor + toggles */}
                <div className="flex items-center gap-3">
                  <div className={`shrink-0 w-11 rounded-xl border py-1 text-center leading-none ${inflow ? 'bg-emerald-50/60 border-emerald-100' : 'bg-rose-50/60 border-rose-100'}`}>
                    <span className="block text-[15px] font-semibold text-slate-800 tabular-nums">{dd}</span>
                    <span className={`block text-[8px] font-semibold uppercase tracking-widest mt-0.5 ${inflow ? 'text-emerald-500' : 'text-rose-400'}`}>{mm}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <input value={it.description} onChange={e => upd(it.id, { description: e.target.value })}
                      placeholder="Descrição" className="w-full h-9 px-3 bg-slate-50/80 border border-transparent hover:border-black/[.085] rounded-lg text-[13px] font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-colors" />
                    {it.payee && (
                      <div className="mt-1 px-1 text-[10px] text-slate-400 truncate" title={it.payee}>
                        Favorecido no extrato: <span className="font-semibold text-slate-500">{it.payee}</span>
                      </div>
                    )}
                  </div>
                  {/* Valor do banco é FATO: não editável ao lançar (o valor lançado tem de bater
                      com a linha do extrato; a RPC também recusa divergência). */}
                  <div className={`flex items-center gap-1 h-10 pl-3 pr-3 rounded-xl border shrink-0 self-start ${inflow ? 'bg-emerald-50/70 border-emerald-100' : 'bg-rose-50/70 border-rose-100'}`}
                    title="O valor é o da linha do banco e não pode ser alterado ao lançar.">
                    <span className={`text-sm font-semibold ${inflow ? 'text-emerald-500' : 'text-rose-500'}`}>{inflow ? '+' : '−'}</span>
                    <span className={`w-24 text-[13.5px] font-semibold text-right tabular-nums ${inflow ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(it.amount)}</span>
                  </div>
                  <label className={`flex items-center gap-1 h-10 px-2.5 rounded-xl border cursor-pointer select-none text-[10px] font-semibold uppercase tracking-wide shrink-0 self-start transition-colors ${it.asTransfer ? 'bg-[#0071e3] border-[#0071e3] text-white shadow-[0_1px_2px_rgba(0,113,227,.35)]' : 'bg-white border-black/[.085] text-slate-500 hover:border-[#0071e3]/40'}`}>
                    <input type="checkbox" checked={it.asTransfer} onChange={e => upd(it.id, { asTransfer: e.target.checked, splits: e.target.checked ? null : it.splits })} className="hidden" />
                    <ArrowRightLeft size={12} /> Transf.
                  </label>
                  {!it.asTransfer && (
                    <button type="button" onClick={() => (it.splits ? stopSplit(it.id) : startSplit(it))}
                      className={`flex items-center gap-1 h-10 px-2.5 rounded-xl border text-[10px] font-semibold uppercase tracking-wide shrink-0 self-start transition-colors ${it.splits ? 'bg-[#0071e3] border-[#0071e3] text-white shadow-[0_1px_2px_rgba(0,113,227,.35)]' : 'bg-white border-black/[.085] text-slate-500 hover:border-[#0071e3]/40'}`}>
                      <Split size={12} /> Dividir
                    </button>
                  )}
                </div>

                {it.asTransfer ? (
                  <div className="mt-3">
                    <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">{counterLabel}</label>
                    <div className="max-w-sm">
                      <SearchableSelect options={accountOptions} value={it.counterAccountId} onChange={v => upd(it.id, { counterAccountId: v })}
                        placeholder={counterLabel} searchPlaceholder="Buscar conta…" />
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-[#0071e3]/90 leading-snug flex items-start gap-1.5">
                      <ArrowRightLeft size={13} className="shrink-0 mt-0.5" />
                      <span>Transferência <b>não usa categoria</b> e fica <b>fora do DRE</b> (só move saldo entre contas). Lança só esta perna — a outra você concilia no extrato da {counterLabel.toLowerCase()}.</span>
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Grid de campos com rótulos */}
                    <div className="mt-3.5 pt-3 border-t border-dashed border-black/[.085] grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5">
                      <div>
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">Categoria <span className="text-rose-400">*</span></label>
                        {it.splits ? (
                          <div className="h-9 px-3 rounded-lg border border-indigo-100 bg-indigo-50/40 flex items-center text-[11px] font-bold text-[#0071e3]">Rateio em {it.splits.length} categorias ↓</div>
                        ) : (
                          <SearchableSelect options={catOptionsByType[it.type]} value={it.categoryId} onChange={v => upd(it.id, { categoryId: v })}
                            placeholder="Selecione a categoria" searchPlaceholder="Buscar categoria…" />
                        )}
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">Método</label>
                        <select value={it.method} onChange={e => upd(it.id, { method: e.target.value })}
                          className="w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-bold text-slate-600 outline-none focus:border-[#0071e3] cursor-pointer">
                          {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">Contrato / Centro de custo <span className="text-rose-400">*</span></label>
                        <SearchableSelect options={ccOptions} value={it.costCenterId} onChange={v => upd(it.id, { costCenterId: v })}
                          placeholder="Contrato / centro" searchPlaceholder="Buscar contrato…" />
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">Competência (mês ref.)</label>
                        <input type="month" value={it.referenceMonth} onChange={e => upd(it.id, { referenceMonth: e.target.value })}
                          className="w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-bold text-slate-600 outline-none focus:border-[#0071e3]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 ml-0.5 mb-1">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide block">Fornecedor / Pagador <span className="text-rose-400">*</span></label>
                          {it.partySuggested && it.partyId && (
                            <span title={it.payee ? `Sugerido pelo extrato: ${it.payee}` : 'Sugerido pelo extrato'}
                              className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 text-[#0071e3] border border-indigo-100 leading-none">sugerido</span>
                          )}
                        </div>
                        <SearchableSelect options={partyOptions} value={it.partyId} onChange={v => upd(it.id, { partyId: v, partySuggested: false })}
                          placeholder="Selecione…" searchPlaceholder="Buscar fornecedor/pagador…"
                          onCreate={onCreateParty} createLabel="Cadastrar" />
                      </div>
                    </div>

                    {/* Editor de rateio: divide a linha em 2+ categorias (ex.: principal + juros). */}
                    {it.splits && (() => {
                      const sum = splitSum(it);
                      const tot = parseFloat(it.amount) || 0;
                      const diff = +(tot - sum).toFixed(2);
                      const ok = Math.abs(diff) < 0.01;
                      return (
                        <div className="mt-3 rounded-xl border border-indigo-100 bg-black/[.02] p-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="h-4 w-4 rounded bg-indigo-100 grid place-items-center"><Split size={10} className="text-[#0071e3]" /></span>
                            <span className="text-[9px] font-semibold text-[#0071e3] uppercase tracking-widest">Rateio em categorias</span>
                          </div>
                          {it.splits.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <div className="flex-1 min-w-[160px]">
                                <SearchableSelect options={catOptionsByType[it.type]} value={s.categoryId} onChange={v => updSplit(it.id, idx, { categoryId: v })}
                                  placeholder="Categoria desta parte" searchPlaceholder="Buscar categoria…" size="sm" />
                              </div>
                              <CurrencyInput value={s.amount} onChange={v => updSplit(it.id, idx, { amount: v.toFixed(2) })}
                                className="w-24 h-8 px-2 bg-white border border-black/[.085] rounded-lg text-[12px] font-semibold text-slate-800 text-right tabular-nums outline-none focus:border-[#0071e3]" />
                              {it.splits.length > 2
                                ? <button type="button" onClick={() => removeSplitRow(it.id, idx)} className="p-1 text-slate-300 hover:text-rose-500 shrink-0"><X size={13} /></button>
                                : <span className="w-[21px] shrink-0" />}
                            </div>
                          ))}
                          <div className="flex items-center justify-between pt-0.5">
                            <button type="button" onClick={() => addSplitRow(it.id)} className="text-[10px] font-semibold uppercase tracking-wide text-[#0071e3] hover:text-indigo-700 flex items-center gap-1"><Plus size={12} /> Categoria</button>
                            <span className={`text-[10px] font-bold tabular-nums ${ok ? 'text-emerald-600' : 'text-rose-500'}`}>
                              Soma {fmtMoney(sum)} / {fmtMoney(tot)}{ok ? ' ✓' : ` · falta ${fmtMoney(diff)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-black/[.06] flex items-center justify-between gap-3 shrink-0 bg-white">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 min-w-0">
            <span className="hidden sm:inline">Líquido do lote</span>
            <span className={`text-sm font-semibold tabular-nums ${total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>R$ {fmtMoney(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="h-10 px-4 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl uppercase tracking-wide transition-colors">Cancelar</button>
            <button onClick={confirm}
              className="h-10 px-6 bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold rounded-xl text-xs uppercase tracking-wide shadow-lg shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center gap-2 transition-all active:scale-[0.98]">
              <Check size={15} strokeWidth={3} /> Confirmar {items.length}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
