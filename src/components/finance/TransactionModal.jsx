import React, { useState, useEffect } from 'react';
import { financeService } from '../../services/financeService';
import { supabase } from '../../services/supabase';
import { aoClicarNoArquivo } from '../../services/arquivos';
import { prepararArquivo, nomeSeguro } from '../../utils/arquivoUpload';
import { X, Save, Loader2, ArrowUpRight, ArrowDownLeft, Repeat, Split, Plus, Trash2, Percent, CreditCard, Paperclip, Upload, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { todayISO, prevMonthISO, formatDateBR } from '../../utils/date';
import { PAYMENT_METHODS, paymentMethodLabel } from './paymentMethods';
import CurrencyInput from './CurrencyInput';
import SearchableSelect from './SearchableSelect';
import PartyModal from './PartyModal';
import { counterpartyLabel } from '../../utils/financeCounterparty';
import { WITHHOLD_DEFAULT_PCT, WITHHOLD_AME_PCT, isAmeParty } from '../../utils/financeTaxes';

export default function TransactionModal({ isOpen, onClose, onSave, transactionId = null, presetType = null }) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [parties, setParties] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [saving, setSaving] = useState(false);
  const DEFAULT_CC_ID = '30000000-0000-0000-0000-000000000001';

  // Recorrência (conta fixa) — só no modo criação.
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState('MENSAL');
  const [endMode, setEndMode] = useState('forever'); // 'forever' | 'date' | 'count'
  const [recEndDate, setRecEndDate] = useState('');
  const [recCount, setRecCount] = useState(12); // nº de ocorrências no modo 'count'
  // No modo edição: id da série a que esta ocorrência pertence (se houver).
  const [txRecurrenceId, setTxRecurrenceId] = useState(null);
  // Data ORIGINAL da ocorrência (âncora do corte de escopo 'future') e valores originais
  // (para propagar só o que mudou na série).
  const [origTxDate, setOrigTxDate] = useState(null);
  const [origValues, setOrigValues] = useState(null);
  // Diálogo de escopo (esta / futuras / todas) ao editar uma ocorrência de série.
  const [scopeDialog, setScopeDialog] = useState(false);

  // Impostos retidos na fonte (lucro presumido) — só em RECEITA. Com o toggle ligado,
  // o campo Valor passa a ser o BRUTO da nota; o lançamento é gravado pelo LÍQUIDO
  // (o que cai na conta → conciliação bate com o extrato) e bruto/retenção ficam
  // guardados em gross_amount/withheld_pct/withheld_amount.
  const [withholdOn, setWithholdOn] = useState(false);
  const [withholdBy, setWithholdBy] = useState('percent'); // 'percent' | 'value'
  const [withholdVal, setWithholdVal] = useState(WITHHOLD_DEFAULT_PCT);  // alíquota padrão do presumido
  // Imposto complementar (pago depois via DARF) — % sobre o BRUTO, escolhido no lançamento
  // e provisionado no DRE. '' = sem imposto (grava 0). Pares da regra: 6,15→2,08 · 5,85→2,38 · sem retenção→8,23.
  const [compTaxPct, setCompTaxPct] = useState('2.08');

  // Cadastro rápido de fornecedor/cliente a partir do combobox de Origem/Destino
  // (mesmo padrão da conciliação): o SearchableSelect chama onCreate, abrimos o
  // PartyModal e resolvemos a Promise com o id criado (ou null se cancelar).
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

  // Anexos (boleto, NF, comprovante) — sobem na hora para o Storage; a referência
  // só é gravada no lançamento ao salvar. Remover só desvincula (não apaga o arquivo,
  // pois rateios/parcelas podem compartilhar o mesmo anexo).
  const [attachments, setAttachments] = useState([]);
  const [paidAmount, setPaidAmount] = useState(0);   // total já baixado do lançamento em edição
  const [isReconciled, setIsReconciled] = useState(false);
  const [payments, setPayments] = useState([]);      // baixas já registradas (histórico, read-only)
  const lockType = paidAmount > 0.0049 || isReconciled; // não pode trocar entrada↔saída
  const [uploadingAtt, setUploadingAtt] = useState(false);

  // Parcelamento — cria N parcelas (vencimento mensal) numeradas X/Y.
  const [installmentOn, setInstallmentOn] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  // Rateio (split) — só no modo criação. Divide 1 lançamento em N categorias (linhas-irmãs).
  const [splitOn, setSplitOn] = useState(false);
  const [splitBy, setSplitBy] = useState('value'); // 'value' (R$) | 'percent' (%)
  const [splitLines, setSplitLines] = useState([{ category_id: '', val: '' }, { category_id: '', val: '' }]);

  const [formData, setFormData] = useState({
    account_id: '',
    category_id: '',
    party_id: '',
    type: 'SAIDA',
    amount: '',
    transaction_date: todayISO(),
    due_date: '',
    description: '',
    status: 'PENDENTE',
    payment_method: 'PIX',
    cost_center_id: '',
    projeto_id: '',
    doc_number: '',
    reference_month: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadDependencies();
    }
  }, [isOpen]);

  const loadDependencies = async () => {
    try {
      setLoading(true);
      const [accs, cats, pts, ccs, { data: projs }] = await Promise.all([
        financeService.getAccounts(),
        financeService.getCategories(),
        financeService.getParties(),
        financeService.getCostCenters(),
        supabase.from('projetos').select('id, nome, party_id, status').order('nome')
      ]);

      setAccounts(accs || []);
      setCategories(cats || []);
      setParties(pts || []);
      setCostCenters(ccs || []);
      setProjetos(projs || []);

      if (transactionId) {
        // Modo Edição: carrega a transação existente
        const { data: tx, error } = await supabase
          .from('finance_transactions')
          .select('*')
          .eq('id', transactionId)
          .single();
        
        if (error) throw error;
        if (tx) {
          setAttachments(Array.isArray(tx.attachments) ? tx.attachments : []);
          setPaidAmount(parseFloat(tx.paid_amount) || 0);
          setIsReconciled(!!tx.imported_transaction_id);
          // Histórico de baixas (read-only) — o usuário gerencia pelo modal de Baixas.
          financeService.getTransactionPayments(transactionId)
            .then(ps => setPayments(ps || [])).catch(() => setPayments([]));
          // Retenção: se o lançamento tem bruto guardado, reabre com o toggle ligado e
          // o campo Valor mostrando o BRUTO (o líquido é recalculado ao salvar).
          const hasWithhold = tx.gross_amount != null && parseFloat(tx.gross_amount) > 0;
          setWithholdOn(hasWithhold);
          if (hasWithhold) {
            if (tx.withheld_pct != null) { setWithholdBy('percent'); setWithholdVal(String(parseFloat(tx.withheld_pct))); }
            else { setWithholdBy('value'); setWithholdVal(String(parseFloat(tx.withheld_amount || 0))); }
          } else { setWithholdBy('percent'); setWithholdVal(WITHHOLD_DEFAULT_PCT); }
          // Imposto complementar: usa o gravado; lançamento antigo (NULL) pré-seleciona a
          // regra padrão que o DRE aplicaria (2,08 / AME 2,38) — salvar torna a escolha explícita.
          setCompTaxPct(tx.comp_tax_pct != null
            ? String(parseFloat(tx.comp_tax_pct) || '')
            : (isAmeParty(pts?.find(p => p.id === tx.party_id)?.name) ? '2.38' : '2.08'));
          setTxRecurrenceId(tx.recurrence_id || null);
          setOrigTxDate(tx.transaction_date);
          // Valores normalizados como o buildPayload produz, para diff de série.
          setOrigValues({
            account_id: tx.account_id,
            category_id: tx.category_id || null,
            party_id: tx.party_id || null,
            type: tx.type,
            amount: parseFloat(tx.amount),
            description: tx.description,
            payment_method: tx.payment_method || 'PIX',
            cost_center_id: tx.cost_center_id || DEFAULT_CC_ID,
            projeto_id: tx.projeto_id || null
          });
          setFormData({
            account_id: tx.account_id,
            category_id: tx.category_id || '',
            party_id: tx.party_id || '',
            type: tx.type,
            amount: (hasWithhold ? parseFloat(tx.gross_amount) : tx.amount).toString(),
            transaction_date: tx.transaction_date,
            due_date: tx.due_date || tx.transaction_date || '',
            description: tx.description,
            status: tx.status,
            payment_method: tx.payment_method || 'PIX',
            cost_center_id: tx.cost_center_id || DEFAULT_CC_ID,
            projeto_id: tx.projeto_id || '',
            doc_number: tx.doc_number || '',
            reference_month: tx.reference_month || ''
          });
        }
      } else {
        // Modo Criação: preenche defaults
        setTxRecurrenceId(null);
        setOrigTxDate(null);
        setOrigValues(null);
        setPaidAmount(0);
        setIsReconciled(false);
        setPayments([]);
        setRecurring(false);
        setFrequency('MENSAL');
        setEndMode('forever');
        setRecEndDate('');
        setRecCount(12);
        setSplitOn(false);
        setSplitBy('value');
        setSplitLines([{ category_id: '', val: '' }, { category_id: '', val: '' }]);
        setInstallmentOn(false);
        setInstallmentCount(2);
        setAttachments([]);
        // Retenção nasce LIGADA (padrão do presumido) — desmarca quem não retém.
        // Padrão da receita: 6,15% retido na fonte + 2,08% complementar depois.
        setWithholdOn(true);
        setWithholdBy('percent');
        setWithholdVal(WITHHOLD_DEFAULT_PCT);
        setCompTaxPct('2.08');
        setFormData({
          account_id: accs?.[0]?.id || '',
          category_id: '',
          party_id: '',
          type: presetType || 'SAIDA',
          amount: '',
          transaction_date: todayISO(),
          due_date: '', // obrigatório, mas nasce em branco — o usuário escolhe

          description: '',
          status: 'PENDENTE',
          payment_method: 'PIX',
          cost_center_id: '', // obrigatório, mas nasce em branco — o usuário escolhe
          projeto_id: '',
          doc_number: '',
          reference_month: prevMonthISO() // padrão: competência do mês que fechou
        });
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar dependências do modal.');
    } finally {
      setLoading(false);
    }
  };


  // Opções de categoria em árvore ordenada (pai → filhos, indentado), como no
  // seletor de Centro de Custo. Órfãos (pai de outro tipo/inexistente) vão ao final.
  const categoryOptions = (type) => {
    const cats = categories.filter(c => c.type === type);
    const ids = new Set(cats.map(c => c.id));
    const childrenOf = (pid) => cats
      .filter(c => (c.parent_id || null) === (pid || null))
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    const out = [];
    const walk = (pid, depth) => childrenOf(pid).forEach(c => { out.push({ c, depth }); walk(c.id, depth + 1); });
    walk(null, 0);
    cats.filter(c => c.parent_id && !ids.has(c.parent_id)).forEach(c => { out.push({ c, depth: 0 }); walk(c.id, 1); });
    return out;
  };
  const categorySelectOptions = (type) => categoryOptions(type).map(({ c, depth }) => ({ value: c.id, label: c.name, depth }));

  // Centros de custo em árvore ordenada, no mesmo formato do SearchableSelect.
  const costCenterSelectOptions = () => {
    const childrenOf = (pid) => costCenters
      .filter(c => (c.parent_id || null) === (pid || null))
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
    const out = [];
    const walk = (pid, depth) => childrenOf(pid).forEach(c => { out.push({ value: c.id, label: c.name, depth }); walk(c.id, depth + 1); });
    walk(null, 0);
    return out;
  };

  // Retenção ativa só em receita e sem rateio (no rateio as linhas somam o bruto,
  // misturar os dois deixaria a validação ambígua).
  const withholdActive = withholdOn && formData.type === 'ENTRADA' && !splitOn;
  // Bruto/retido/líquido em centavos (evita erro de ponto flutuante).
  const computeWithheld = () => {
    const brutoCents = Math.round((parseFloat(formData.amount) || 0) * 100);
    const v = parseFloat(String(withholdVal).replace(',', '.')) || 0;
    const retCents = withholdBy === 'percent'
      ? Math.round(brutoCents * v / 100)
      : Math.round(v * 100);
    return {
      bruto: brutoCents / 100,
      retido: retCents / 100,
      liquido: (brutoCents - retCents) / 100,
      pct: withholdBy === 'percent' ? v : (brutoCents > 0 ? Math.round(retCents / brutoCents * 1000000) / 10000 : 0)
    };
  };
  const wh = withholdActive ? computeWithheld() : null;

  const buildPayload = () => ({
    account_id: formData.account_id,
    category_id: formData.category_id || null,
    // Grava só a contraparte que se aplica à categoria; zera a outra p/ evitar dado órfão.
    party_id: formData.party_id || null,
    type: formData.type,
    // Com retenção: amount = LÍQUIDO (o que cai na conta); bruto/retenção nas colunas próprias.
    amount: wh ? wh.liquido : parseFloat(formData.amount),
    gross_amount: wh ? wh.bruto : null,
    withheld_pct: wh ? wh.pct : null,
    withheld_amount: wh ? wh.retido : null,
    // Imposto complementar: só em receita sem rateio; '' (sem) grava 0 — NULL fica só p/ legado.
    comp_tax_pct: formData.type === 'ENTRADA' && !splitOn ? (compTaxPct === '' ? 0 : parseFloat(compTaxPct)) : null,
    transaction_date: formData.transaction_date,
    due_date: formData.due_date || null,
    description: formData.description,
    status: formData.status,
    payment_method: formData.payment_method,
    cost_center_id: formData.cost_center_id || DEFAULT_CC_ID,
    projeto_id: formData.projeto_id || null,
    doc_number: formData.doc_number || null,
    reference_month: formData.reference_month || null,
    attachments
  });

  // ---- Anexos: upload imediato ao bucket PRIVADO "documentos" (mesmo da fila cirúrgica) ----
  // Só o caminho é guardado no lançamento. A URL de abrir é assinada na hora do
  // clique e expira em minutos — nota fiscal e boleto não ficam com link eterno.
  const handleAttachFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingAtt(true);
    try {
      const uploaded = [];
      for (const file of files) {
        let pronto;
        try {
          pronto = await prepararArquivo(file, { maxMB: 15 });
        } catch (erro) {
          toast.error(erro.message);
          continue;
        }
        const clean = nomeSeguro(file.name);
        const uid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const path = `financeiro/${uid}_${clean}`;
        const { error } = await supabase.storage.from('documentos').upload(path, pronto);
        if (error) throw error;
        uploaded.push({ name: file.name, path, size: pronto.size, type: pronto.type || file.type || '', uploaded_at: new Date().toISOString() });
      }
      if (uploaded.length) {
        setAttachments(prev => [...prev, ...uploaded]);
        toast.success(`${uploaded.length} anexo(s) enviado(s). Salve o lançamento para confirmar.`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar anexo. Tente novamente.');
    } finally {
      setUploadingAtt(false);
      e.target.value = '';
    }
  };

  // Anda a competência de mês em mês (a partir do mês corrente se estiver vazia).
  const stepReferenceMonth = (delta) => {
    const base = formData.reference_month || todayISO().slice(0, 7);
    const [y, m] = base.split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1);
    setFormData({ ...formData, reference_month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));
  const fmtSize = (b) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

  // ---- Rateio: helpers de cálculo ----
  const _num = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
  const splitTotal = parseFloat(formData.amount) || 0;
  // Valores em R$ de cada linha (no modo % converte; a última linha absorve o arredondamento).
  const splitAmounts = () => {
    if (splitBy === 'percent') {
      let acc = 0;
      return splitLines.map((ln, i) => {
        if (i === splitLines.length - 1) return Math.round((splitTotal - acc) * 100) / 100;
        const v = Math.round(splitTotal * _num(ln.val)) / 100; // total * pct/100
        acc += v;
        return v;
      });
    }
    return splitLines.map(ln => Math.round(_num(ln.val) * 100) / 100);
  };
  const splitValSum = splitLines.reduce((a, l) => a + _num(l.val), 0);   // soma das linhas (R$ no modo valor)
  const splitPctSum = splitValSum;                                       // mesma soma, lida como % no modo percent
  const splitAllocated = splitBy === 'percent' ? splitTotal : splitValSum;
  const splitRemaining = splitTotal - splitAllocated;

  const updateSplitLine = (i, patch) => setSplitLines(lines => lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addSplitLine = () => setSplitLines(lines => [...lines, { category_id: '', val: '' }]);
  const removeSplitLine = (i) => setSplitLines(lines => lines.length > 2 ? lines.filter((_, idx) => idx !== i) : lines);
  // Rateio combina com Parcelar OU Repetir. Parcelar × Repetir são exclusivos entre si
  // (ambos geram série no tempo — "Repetir N vezes" já é o parcelamento sem dividir o valor).
  const toggleSplit = (on) => { setSplitOn(on); if (on) setWithholdOn(false); };
  const toggleRecurring = (on) => { setRecurring(on); if (on) setInstallmentOn(false); };
  const toggleInstallment = (on) => { setInstallmentOn(on); if (on) setRecurring(false); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.account_id) return toast.error('Selecione uma conta bancária');
    if (!formData.amount || parseFloat(formData.amount) <= 0) return toast.error('Insira um valor maior que zero');
    if (!formData.description.trim()) return toast.error('A descrição é obrigatória');
    if (!formData.due_date) return toast.error('Informe o vencimento');
    if (!splitOn && !formData.category_id) return toast.error('Selecione a categoria');
    if (!formData.cost_center_id) return toast.error('Selecione o centro de custo');
    if (!formData.reference_month) return toast.error('Informe a competência (mês de referência)');
    // Não reduzir o valor abaixo do que já foi baixado (o líquido, quando há retenção).
    if (paidAmount > 0.0049) {
      const netForCompare = withholdActive ? computeWithheld().liquido : parseFloat(formData.amount);
      if (netForCompare < paidAmount - 0.0049) return toast.error(`Valor (R$ ${netForCompare.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) menor que o já baixado (R$ ${paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Estorne baixas antes de reduzir.`);
    }

    // Validação da retenção de impostos
    if (withholdActive) {
      const w = computeWithheld();
      if (w.retido <= 0) return toast.error('Informe a retenção (% ou valor em R$) maior que zero.');
      if (w.liquido <= 0) return toast.error('A retenção não pode ser maior ou igual ao valor bruto.');
    }

    // Validação do rateio (split)
    if (!transactionId && splitOn) {
      if (splitLines.length < 2) return toast.error('O rateio precisa de pelo menos 2 categorias.');
      if (splitLines.some(l => !l.category_id)) return toast.error('Selecione a categoria de cada linha do rateio.');
      if (splitBy === 'percent') {
        if (Math.abs(splitPctSum - 100) > 0.01) return toast.error(`A soma das porcentagens deve ser 100% (está em ${splitPctSum.toFixed(2)}%).`);
      } else {
        if (Math.abs(splitValSum - splitTotal) > 0.01) return toast.error(`A soma das categorias (R$ ${splitValSum.toFixed(2)}) deve ser igual ao total (R$ ${splitTotal.toFixed(2)}).`);
      }
      if (splitAmounts().some(v => v <= 0)) return toast.error('Cada linha do rateio deve ter valor maior que zero.');
    }

    // Validação do parcelamento
    if (!transactionId && installmentOn) {
      const n = parseInt(installmentCount, 10);
      if (!n || n < 2) return toast.error('Informe o número de parcelas (mínimo 2).');
    }

    // Validação da recorrência
    if (!transactionId && recurring && endMode === 'date') {
      const anchor = formData.due_date || formData.transaction_date;
      if (!recEndDate) return toast.error('Defina a data final da repetição');
      if (recEndDate < anchor) return toast.error('A data final deve ser posterior ao início da repetição');
    }
    if (!transactionId && recurring && endMode === 'count') {
      const n = parseInt(recCount, 10);
      if (!n || n < 2) return toast.error('Informe quantas vezes repetir (mínimo 2).');
    }

    // Editando uma ocorrência de série → pergunta o escopo antes de salvar.
    if (transactionId && txRecurrenceId) {
      setScopeDialog(true);
      return;
    }
    persist('this');
  };

  const persist = async (scope) => {
    setSaving(true);
    try {
      const payload = buildPayload();

      if (transactionId) {
        if (txRecurrenceId) {
          // Propaga para a série SÓ os campos que realmente mudaram (não sobrescreve
          // categoria/valor das demais com algo que o usuário não tocou).
          const propagable = ['account_id', 'category_id', 'party_id', 'type', 'amount', 'description', 'payment_method', 'cost_center_id', 'projeto_id'];
          const changed = {};
          for (const k of propagable) {
            if (!origValues || payload[k] !== origValues[k]) changed[k] = payload[k];
          }
          await financeService.updateRecurrenceScope(
            // âncora do corte 'future' = data ORIGINAL da ocorrência, não a nova digitada.
            { id: transactionId, recurrence_id: txRecurrenceId, transaction_date: origTxDate || formData.transaction_date },
            scope, payload, changed
          );
        } else {
          await financeService.updateTransaction(transactionId, payload);
        }
        toast.success('Transação atualizada com sucesso!');
      } else if (splitOn || installmentOn || recurring) {
        const anchor = formData.due_date || formData.transaction_date;
        // Modo "N vezes": vira uma end_date na N-ésima ocorrência (mesma regra de datas do motor).
        const recEnd = endMode === 'date' ? recEndDate
          : endMode === 'count' ? financeService.nthOccurrenceDate(anchor, frequency, parseInt(recCount, 10))
          : null;
        // Linhas do rateio (1 por categoria, amount = total da categoria).
        const amounts = splitAmounts();
        const lines = splitLines.map((ln, i) => ({
          ...payload,
          category_id: ln.category_id || null,
          amount: amounts[i],
          description: `${payload.description} · ${categories.find(c => c.id === ln.category_id)?.name || 'Rateio'}`,
        }));

        if (splitOn && installmentOn) {
          await financeService.createSplitInstallments(lines, parseInt(installmentCount, 10), anchor);
          toast.success(`Rateio parcelado — ${lines.length} categorias × ${parseInt(installmentCount, 10)} parcelas.`);
        } else if (splitOn && recurring) {
          const { rules, count } = await financeService.createSplitRecurrences(lines, { start_date: anchor, frequency, end_date: recEnd });
          toast.success(`${rules} contas fixas criadas (uma por categoria) — ${count} ocorrência(s).`);
        } else if (splitOn) {
          await financeService.createSplitTransactions(lines);
          toast.success(`Rateio criado — ${lines.length} categorias.`);
        } else if (installmentOn) {
          const data = await financeService.createInstallments(payload, parseInt(installmentCount, 10), anchor);
          toast.success(`${data.length} parcelas criadas.`);
        } else {
          const { count } = await financeService.createRecurrence({
            ...payload,
            start_date: anchor,
            frequency,
            end_date: recEnd
          });
          toast.success(`Conta fixa criada — ${count} ocorrência(s) geradas.`);
        }
      } else {
        await financeService.createTransaction(payload);
        toast.success('Transação cadastrada com sucesso!');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar transação.');
    } finally {
      setSaving(false);
      setScopeDialog(false);
    }
  };

  if (!isOpen) return null;

  const baseInputStyle = "w-full h-10 px-3 bg-white border border-black/[.085] rounded-lg text-[13px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] transition-colors";

  return (
    <div className="fixed inset-0 z-[11000] flex items-start justify-center p-4 pt-[76px]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity animate-in fade-in" onClick={onClose}></div>

      {/* Container do Modal — abre abaixo da topbar (pt no wrapper) e cabe na viewport */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden ring-1 ring-black/5 max-h-[calc(100dvh-92px)]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-black/[.085] flex items-center justify-between bg-white shrink-0">
          <h3 className="text-[15px] font-semibold text-[#1d1d1f] tracking-[-.01em]">
            {transactionId ? 'Editar lançamento' : 'Novo lançamento'}
          </h3>
          <button type="button" onClick={onClose} className="p-2 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#f5f5f7]">

          {/* Tipo de Transação (Botoes de Inflow/Outflow) — travado quando há baixas/conciliação */}
          <div>
            <div className={`flex bg-black/[.045] p-1 rounded-xl ${lockType ? 'opacity-60' : ''}`}>
              <button
                type="button" disabled={lockType}
                onClick={() => setFormData({ ...formData, type: 'SAIDA' })}
                className={`flex-1 py-2.5 text-[12px] font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${lockType ? 'cursor-not-allowed' : ''} ${formData.type === 'SAIDA' ? 'bg-[#d70015] text-white shadow-[0_1px_2px_rgba(0,0,0,.15)]' : 'text-[#86868b] hover:text-[#1d1d1f]'}`}
              >
                <ArrowDownLeft size={15} /> Despesa
              </button>
              <button
                type="button" disabled={lockType}
                onClick={() => setFormData({ ...formData, type: 'ENTRADA' })}
                className={`flex-1 py-2.5 text-[12px] font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${lockType ? 'cursor-not-allowed' : ''} ${formData.type === 'ENTRADA' ? 'bg-[#248a3d] text-white shadow-[0_1px_2px_rgba(0,0,0,.15)]' : 'text-[#86868b] hover:text-[#1d1d1f]'}`}
              >
                <ArrowUpRight size={15} /> Receita
              </button>
            </div>
            {lockType && (
              <p className="text-[10px] font-medium text-amber-600 mt-1 ml-1">
                {isReconciled ? 'Lançamento conciliado — desconcilie para mudar entrada/saída.' : `Já baixado R$ ${paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — estorne as baixas para trocar entrada/saída.`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Valor */}
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">
                {withholdActive ? 'Valor bruto da nota (R$)' : installmentOn ? 'Valor total — será dividido nas parcelas (R$)' : 'Valor (R$)'}
              </label>
              <CurrencyInput
                value={formData.amount}
                onChange={v => setFormData({ ...formData, amount: v.toFixed(2) })}
                className={`${baseInputStyle} text-lg text-slate-900`}
              />
            </div>

            {/* Baixas já registradas (histórico read-only) — data, valor, método, conta.
                Gerenciar (nova baixa / estorno) é pelo botão de Baixas na lista. */}
            {payments.length > 0 && (
              <div className="md:col-span-2">
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wide">
                      {payments.length === 1 ? 'Baixa registrada' : `${payments.length} baixas registradas`}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                      Baixado R$ {paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {(parseFloat(formData.amount) || 0) - paidAmount > 0.004 && (
                        <span className="text-amber-600"> · resta R$ {((withholdActive ? computeWithheld().liquido : parseFloat(formData.amount) || 0) - paidAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      )}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500 tabular-nums w-[74px] shrink-0">{formatDateBR(p.payment_date)}</span>
                        <span className="text-slate-500 flex-1 min-w-0 truncate">
                          {paymentMethodLabel(p.payment_method)}{p.finance_accounts?.name ? ` · ${p.finance_accounts.name}` : ''}{p.auto ? ' · auto' : ''}
                        </span>
                        <span className="font-bold text-emerald-700 tabular-nums shrink-0">R$ {(parseFloat(p.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9.5px] text-slate-400 mt-2">Para registrar outra baixa ou estornar, use o botão de Baixas (✓) na lista de lançamentos.</p>
                </div>
              </div>
            )}

            {/* Impostos retidos na fonte — só em receita, sem rateio. Grava pelo líquido. */}
            {formData.type === 'ENTRADA' && !splitOn && (
              <div className="md:col-span-2">
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <span className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase tracking-wide">
                      <Percent size={14} className="text-amber-500" /> Deduzir impostos retidos na fonte
                      <span className="text-slate-300 font-medium normal-case tracking-normal">(IRRF, PIS, COFINS, CSLL…)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={withholdOn}
                      onChange={e => {
                        // Sem retenção na fonte → o contratante não reteve nada: sugere pagar os 8,23% depois.
                        setWithholdOn(e.target.checked);
                        if (e.target.checked) { setWithholdBy('percent'); setWithholdVal(WITHHOLD_DEFAULT_PCT); setCompTaxPct('2.08'); }
                        else setCompTaxPct('8.23');
                      }}
                      className="h-4 w-4 accent-amber-500 cursor-pointer"
                    />
                  </label>

                  {withholdOn && (
                    <div className="mt-3 space-y-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl h-9 border border-slate-200 shrink-0">
                          <button type="button" onClick={() => { setWithholdBy('percent'); setWithholdVal(WITHHOLD_DEFAULT_PCT); setCompTaxPct('2.08'); }}
                            className={`px-3 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${withholdBy === 'percent' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                            Por %
                          </button>
                          <button type="button" onClick={() => { setWithholdBy('value'); setWithholdVal(''); }}
                            className={`px-3 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${withholdBy === 'value' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                            Em R$
                          </button>
                        </div>
                        {withholdBy === 'percent' && (
                          <div className="flex gap-1 shrink-0">
                            {/* Presets pareados com o complementar: 6,15→2,08 · 5,85→2,38 (total sempre 8,23%) */}
                            <button type="button" onClick={() => { setWithholdVal(WITHHOLD_DEFAULT_PCT); setCompTaxPct('2.08'); }}
                              className={`h-9 px-2.5 rounded-lg text-[10px] font-black tabular-nums border transition-all ${withholdVal === WITHHOLD_DEFAULT_PCT ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'}`}>
                              6,15%
                            </button>
                            <button type="button" onClick={() => { setWithholdVal(WITHHOLD_AME_PCT); setCompTaxPct('2.38'); }}
                              className={`h-9 px-2.5 rounded-lg text-[10px] font-black tabular-nums border transition-all ${withholdVal === WITHHOLD_AME_PCT ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'}`}>
                              5,85% <span className="font-bold text-slate-400">AME</span>
                            </button>
                          </div>
                        )}
                        <div className="relative w-32 shrink-0">
                          {withholdBy === 'percent' ? (
                            <input
                              type="number" step="0.01" min="0"
                              value={withholdVal}
                              onChange={e => setWithholdVal(e.target.value)}
                              className={`${baseInputStyle} h-9 pr-7 text-right tabular-nums`}
                              placeholder="6,15"
                            />
                          ) : (
                            <CurrencyInput
                              value={withholdVal}
                              onChange={v => setWithholdVal(v)}
                              className={`${baseInputStyle} h-9 pr-3 text-right tabular-nums`}
                            />
                          )}
                          {withholdBy === 'percent' && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>}
                        </div>
                      </div>

                      {wh && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold tabular-nums bg-amber-50/60 border border-amber-100 rounded-lg px-2.5 py-2">
                          <span className="text-slate-500">Bruto R$ {wh.bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <span className="text-amber-600">− R$ {wh.retido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({wh.pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)</span>
                          <span className="text-slate-400">=</span>
                          <span className={`font-black ${wh.liquido > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>Líquido R$ {wh.liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <p className="text-[10px] font-medium text-slate-400 leading-snug">
                        O lançamento é gravado pelo <b>líquido</b> (o que de fato cai na conta — é ele que a conciliação compara com o extrato). O bruto da nota e a retenção ficam guardados no lançamento. Padrão do lucro presumido: <b>6,15%</b> (IRRF 1,5 + PIS 0,65 + COFINS 3 + CSLL 1); AME retém <b>5,85%</b>.
                      </p>
                    </div>
                  )}
                </div>

                {/* Imposto complementar (pago depois via DARF) — % sobre o bruto, provisionado no DRE */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm mt-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase tracking-wide">
                      <Percent size={14} className="text-indigo-500" /> Imposto complementar
                      <span className="text-slate-300 font-medium normal-case tracking-normal">(pago depois via DARF)</span>
                    </span>
                    <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl h-9 border border-slate-200 shrink-0">
                      {[['2.08', '2,08%'], ['2.38', '2,38% AME'], ['8.23', '8,23%'], ['', 'Sem']].map(([v, l]) => (
                        <button type="button" key={l} onClick={() => setCompTaxPct(v)}
                          className={`px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wide tabular-nums transition-all ${compTaxPct === v ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {compTaxPct !== '' && (parseFloat(formData.amount) || 0) > 0 && (
                    <div className="mt-2 text-[11px] font-bold tabular-nums bg-indigo-50/60 border border-indigo-100 rounded-lg px-2.5 py-2 text-slate-500">
                      ≈ <span className="text-indigo-600">R$ {((parseFloat(formData.amount) || 0) * parseFloat(compTaxPct) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> a pagar depois ({compTaxPct.replace('.', ',')}% sobre o bruto)
                    </div>
                  )}
                  <p className="mt-2 text-[10px] font-medium text-slate-400 leading-snug">
                    Não altera o valor do lançamento — vira <b>provisão no DRE</b> (deduzida da Receita Bruta). Retenção + complementar fecham sempre <b>8,23%</b>: 6,15 + 2,08 (padrão) · 5,85 + 2,38 (AME) · sem retenção paga 8,23 depois.
                  </p>
                </div>
              </div>
            )}

            {/* Conta Bancária */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Conta Bancária</label>
              <select
                value={formData.account_id}
                onChange={e => setFormData({ ...formData, account_id: e.target.value })}
                className={`${baseInputStyle} cursor-pointer`}
                required
              >
                <option value="" disabled>Selecione a conta...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} (R$ {acc.current_balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</option>
                ))}
              </select>
            </div>

            {/* Categoria — quando há rateio, a categoria é definida por linha (abaixo). */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Categoria</label>
              {splitOn ? (
                <div className={`${baseInputStyle} flex items-center gap-1.5 text-violet-600 font-bold cursor-not-allowed bg-violet-50/60 border-violet-100`}>
                  <Split size={13} /> Dividida por rateio (abaixo)
                </div>
              ) : (
                <SearchableSelect
                  options={categorySelectOptions(formData.type)}
                  value={formData.category_id}
                  onChange={v => setFormData({ ...formData, category_id: v })}
                  placeholder="Selecione a categoria…"
                  searchPlaceholder="Digite para buscar…"
                />
              )}
            </div>

            {/* Origem / Destino: cliente (entrada) ou fornecedor (saída). */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block flex items-center gap-1.5">
                {counterpartyLabel(formData.type)} <span className="text-slate-300 font-medium normal-case">(Origem/Destino)</span>
              </label>
              <SearchableSelect
                options={parties
                  .filter(p => p.id === formData.party_id || (formData.type === 'ENTRADA'
                    ? ['CLIENTE', 'LEAD', 'AMBOS'].includes(p.kind)
                    : ['FORNECEDOR', 'AMBOS'].includes(p.kind)))
                  .map(p => ({ value: p.id, label: p.name }))}
                value={formData.party_id}
                onChange={v => setFormData({ ...formData, party_id: v })}
                allowEmpty emptyLabel="Não vinculado"
                searchPlaceholder="Digite para buscar…"
                onCreate={handleCreateParty} createLabel="Cadastrar"
              />
            </div>

            {/* Data do Lançamento */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Data do Lançamento</label>
              <input
                type="date"
                required
                value={formData.transaction_date}
                onChange={e => setFormData({ ...formData, transaction_date: e.target.value })}
                className={baseInputStyle}
              />
            </div>

            {/* Vencimento (contas a pagar/receber) — obrigatório */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Vencimento</label>
              <input
                type="date"
                required
                value={formData.due_date}
                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                className={baseInputStyle}
              />
            </div>

            {/* Competência (mês de referência) — a que mês o lançamento se refere.
                Nasce no mês corrente; setas ‹ › andam de mês em mês. */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Competência (mês ref.)</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepReferenceMonth(-1)}
                  title="Mês anterior"
                  className="h-10 w-9 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors shadow-sm"
                >
                  <ChevronLeft size={15} strokeWidth={2.5} />
                </button>
                <input
                  type="month"
                  value={formData.reference_month}
                  onChange={e => setFormData({ ...formData, reference_month: e.target.value })}
                  className={`${baseInputStyle} flex-1 min-w-0`}
                />
                <button
                  type="button"
                  onClick={() => stepReferenceMonth(1)}
                  title="Próximo mês"
                  className="h-10 w-9 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors shadow-sm"
                >
                  <ChevronRight size={15} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Método de Pagamento */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Método</label>
              <select
                value={formData.payment_method}
                onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                className={`${baseInputStyle} cursor-pointer`}
              >
                {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* Status (Pago ou Pendente) — oculto ao criar conta fixa (todas nascem pendentes).
                PARCIAL é dirigido pelas baixas: aqui fica travado (mude via modal de Baixas). */}
            {paidAmount > 0.0049 ? (
              <div>
                <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Status</label>
                <div className={`${baseInputStyle} flex items-center font-black ${formData.status === 'PAGO' ? 'text-emerald-600' : 'text-sky-600'}`}>
                  {formData.status === 'PAGO' ? 'Realizado' : 'Parcial'}
                </div>
                <p className="text-[10px] font-medium text-slate-400 mt-1 ml-1">Definido pelas baixas — use o botão de Baixas para alterar.</p>
              </div>
            ) : !(!transactionId && recurring) ? (
              <div>
                <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className={`${baseInputStyle} cursor-pointer font-black ${formData.status === 'PAGO' ? 'text-emerald-600' : 'text-amber-500'}`}
                >
                  <option value="PENDENTE">A Realizar (Pendente)</option>
                  <option value="PAGO">Realizado</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Status</label>
                <div className={`${baseInputStyle} flex items-center text-amber-500 font-black cursor-not-allowed bg-slate-50`}>
                  A Realizar (Pendente)
                </div>
              </div>
            )}

            {/* Centro de Custo (obrigatório) */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Centro de Custo</label>
              <SearchableSelect
                options={costCenterSelectOptions()}
                value={formData.cost_center_id}
                onChange={v => setFormData({ ...formData, cost_center_id: v })}
                placeholder="Selecione o centro de custo…"
                searchPlaceholder="Digite para buscar…"
              />
            </div>

            {/* Projeto (opcional): receita ou custo do projeto — alimenta a margem dele. */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Projeto (Opcional)</label>
              <SearchableSelect
                options={projetos
                  .filter(p => !['CONCLUIDO', 'CANCELADO'].includes(p.status) || p.id === formData.projeto_id)
                  .map(p => ({ value: p.id, label: p.nome }))}
                value={formData.projeto_id}
                onChange={v => setFormData({ ...formData, projeto_id: v })}
                allowEmpty emptyLabel="Sem projeto"
                searchPlaceholder="Digite para buscar…"
              />
            </div>

            {/* Nº Documento / Nota Fiscal */}
            <div>
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Nº Doc / NF (Opcional)</label>
              <input
                type="text"
                value={formData.doc_number}
                onChange={e => setFormData({ ...formData, doc_number: e.target.value })}
                className={baseInputStyle}
                placeholder="Ex: NF 1234 / Boleto 567"
              />
            </div>

            {/* Descrição */}
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Descrição do Lançamento</label>
              <input
                type="text"
                required
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className={baseInputStyle}
                placeholder="Ex: Landing page Cliente X — parcela 1/3"
              />
            </div>

            {/* Anexos — boleto, nota fiscal, comprovante (bucket público "documentos") */}
            <div className="md:col-span-2">
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase tracking-wide">
                    <Paperclip size={14} className="text-sky-500" /> Anexos
                    <span className="text-slate-300 font-medium normal-case tracking-normal">(boleto, NF, comprovante…)</span>
                  </span>
                  <label className={`h-8 px-3 flex items-center gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all cursor-pointer ${uploadingAtt ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-sky-50 text-sky-600 border border-sky-100 hover:bg-sky-100'}`}>
                    {uploadingAtt ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploadingAtt ? 'Enviando…' : 'Anexar arquivo'}
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.xml"
                      className="hidden"
                      disabled={uploadingAtt}
                      onChange={handleAttachFiles}
                    />
                  </label>
                </div>

                {attachments.length > 0 && (
                  <div className="mt-2.5 space-y-1.5">
                    {attachments.map((att, i) => (
                      <div key={att.path || i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                        <FileText size={14} className="text-sky-500 shrink-0" />
                        <a
                          href={att.url}
                          onClick={aoClicarNoArquivo(att.path || att.url, 'documentos')}
                          className="flex-1 min-w-0 truncate text-xs font-bold text-slate-700 hover:text-sky-600 hover:underline cursor-pointer"
                          title={`Abrir ${att.name}`}
                        >
                          {att.name}
                        </a>
                        {att.size > 0 && <span className="shrink-0 text-[10px] font-bold text-slate-400 tabular-nums">{fmtSize(att.size)}</span>}
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          title="Remover anexo deste lançamento"
                          className="shrink-0 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[10px] font-medium text-slate-400 leading-snug">
                  PDF, imagem ou XML — até 15 MB por arquivo. Os anexos são gravados junto com o lançamento ao salvar.
                </p>
              </div>
            </div>

            {/* Rateio (split) — divide o lançamento em várias categorias. Só na criação.
                Os 3 blocos (rateio/parcelas/repetir) ficam sempre visíveis; marcar um desmarca os outros. */}
            {!transactionId && (
              <div className="md:col-span-2">
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <span className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase tracking-wide">
                      <Split size={14} className="text-violet-500" /> Dividir em categorias (rateio)
                    </span>
                    <input
                      type="checkbox"
                      checked={splitOn}
                      onChange={e => toggleSplit(e.target.checked)}
                      className="h-4 w-4 accent-violet-600 cursor-pointer"
                    />
                  </label>

                  {splitOn && (
                    <div className="mt-3 space-y-2.5">
                      {/* Modo: por valor (R$) ou por porcentagem (%) */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl h-8 border border-slate-200">
                          <button type="button" onClick={() => setSplitBy('value')}
                            className={`px-3 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${splitBy === 'value' ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                            Por valor
                          </button>
                          <button type="button" onClick={() => setSplitBy('percent')}
                            className={`px-3 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all flex items-center gap-1 ${splitBy === 'percent' ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Percent size={11} /> Por %
                          </button>
                        </div>
                        <span className={`text-[10px] font-black tabular-nums ${splitBy === 'percent'
                          ? (Math.abs(splitPctSum - 100) < 0.01 ? 'text-emerald-600' : 'text-rose-500')
                          : (Math.abs(splitRemaining) < 0.01 ? 'text-emerald-600' : 'text-rose-500')}`}>
                          {splitBy === 'percent'
                            ? `Soma: ${splitPctSum.toFixed(2)}% / 100%`
                            : `Restante: R$ ${splitRemaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>

                      {/* Linhas do rateio */}
                      {splitLines.map((ln, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <SearchableSelect
                              options={categorySelectOptions(formData.type)}
                              value={ln.category_id}
                              onChange={v => updateSplitLine(i, { category_id: v })}
                              allowEmpty emptyLabel="Categoria..."
                              searchPlaceholder="Digite para buscar…"
                            />
                          </div>
                          <div className="relative w-32 shrink-0">
                            {splitBy === 'percent' ? (
                              <input
                                type="number" step="0.01" min="0"
                                value={ln.val}
                                onChange={e => updateSplitLine(i, { val: e.target.value })}
                                className={`${baseInputStyle} h-9 pr-7 text-right tabular-nums`}
                                placeholder="0"
                              />
                            ) : (
                              <CurrencyInput
                                value={ln.val}
                                onChange={v => updateSplitLine(i, { val: v })}
                                className={`${baseInputStyle} h-9 pr-3 text-right tabular-nums`}
                              />
                            )}
                            {splitBy === 'percent' && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>}
                          </div>
                          {splitBy === 'percent' && (
                            <span className="w-24 shrink-0 text-right text-[10px] font-bold text-slate-400 tabular-nums">
                              R$ {(splitAmounts()[i] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          <button type="button" onClick={() => removeSplitLine(i)} disabled={splitLines.length <= 2}
                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      <button type="button" onClick={addSplitLine}
                        className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-violet-600 hover:text-violet-700">
                        <Plus size={13} /> Adicionar categoria
                      </button>
                      <p className="text-[10px] font-medium text-slate-400 leading-snug">
                        Gera <b>uma linha por categoria</b> (mesmo vencimento e centro de custo), ligadas como um rateio. No empréstimo: <b>Amortização</b> (principal) + <b>Juros</b> — assim o principal não infla seu DRE. A baixa pode ser feita por linha ou no grupo inteiro.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Parcelamento — só na criação */}
            {!transactionId && (
              <div className="md:col-span-2">
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <CreditCard size={14} className="text-emerald-500" /> Parcelar em várias vezes
                    </span>
                    <input type="checkbox" checked={installmentOn} onChange={e => toggleInstallment(e.target.checked)} className="h-4 w-4 accent-emerald-600 cursor-pointer" />
                  </label>
                  {installmentOn && (
                    <div className="mt-3 grid grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Nº de parcelas</label>
                        <input type="number" min="2" max="360" value={installmentCount}
                          onChange={e => setInstallmentCount(e.target.value)}
                          className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-emerald-500" />
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500 leading-snug pb-1">
                        {(() => {
                          const n = Math.max(0, parseInt(installmentCount, 10) || 0);
                          const totalCents = Math.round((parseFloat(formData.amount) || 0) * 100);
                          const perCents = n > 0 ? Math.floor(totalCents / n) : 0;
                          const uneven = n > 0 && totalCents % n !== 0;
                          const fmtR = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                          return (
                            <>
                              Vence mensalmente a partir do {(formData.due_date || formData.transaction_date) ? 'vencimento/data informada' : 'da data'}.<br />
                              R$ {fmtR(totalCents)} em <b className="text-slate-700">{n} × R$ {fmtR(perCents)}</b>
                              {uneven && <> (última de R$ {fmtR(totalCents - perCents * (n - 1))})</>}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recorrência (conta fixa) — só na criação */}
            {!transactionId && (
              <div className="md:col-span-2">
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <span className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase tracking-wide">
                      <Repeat size={14} className="text-indigo-500" /> Repetir (conta fixa)
                    </span>
                    <input
                      type="checkbox"
                      checked={recurring}
                      onChange={e => toggleRecurring(e.target.checked)}
                      className="h-4 w-4 accent-indigo-600 cursor-pointer"
                    />
                  </label>

                  {recurring && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Frequência</label>
                        <select
                          value={frequency}
                          onChange={e => setFrequency(e.target.value)}
                          className={`${baseInputStyle} cursor-pointer`}
                        >
                          <option value="SEMANAL">Semanal</option>
                          <option value="MENSAL">Mensal</option>
                          <option value="ANUAL">Anual</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Repetir até</label>
                        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl h-10 border border-slate-200">
                          <button type="button" onClick={() => setEndMode('forever')}
                            className={`flex-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${endMode === 'forever' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                            Sempre
                          </button>
                          <button type="button" onClick={() => setEndMode('date')}
                            className={`flex-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${endMode === 'date' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                            Até data
                          </button>
                          <button type="button" onClick={() => setEndMode('count')}
                            className={`flex-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${endMode === 'count' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                            Nº de vezes
                          </button>
                        </div>
                      </div>
                      {endMode === 'date' && (
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Data final da repetição</label>
                          <input type="date" value={recEndDate} onChange={e => setRecEndDate(e.target.value)} className={baseInputStyle} />
                        </div>
                      )}
                      {endMode === 'count' && (
                        <div className="sm:col-span-2 grid grid-cols-2 gap-3 items-end">
                          <div>
                            <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-[.04em] ml-1 mb-1 block">Repetir quantas vezes?</label>
                            <input type="number" min="2" max="360" value={recCount}
                              onChange={e => setRecCount(e.target.value)}
                              className={baseInputStyle} placeholder="Ex: 6, 10, 12" />
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500 leading-snug pb-1">
                            <b className="text-slate-700">{Math.max(0, parseInt(recCount, 10) || 0)}×</b> de R$ {(parseFloat(formData.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({frequency.toLowerCase()}) = R$ {((Math.max(0, parseInt(recCount, 10) || 0)) * (parseFloat(formData.amount) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no total
                          </div>
                        </div>
                      )}
                      <p className="sm:col-span-2 text-[10px] font-medium text-slate-400 leading-snug">
                        A 1ª parcela usa o <b>vencimento</b> (ou a data do lançamento). Geramos 12 meses à frente e completamos automaticamente. Todas nascem como <b>pendentes</b>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Aviso: ocorrência pertence a uma série */}
            {transactionId && txRecurrenceId && (
              <div className="md:col-span-2 flex items-center gap-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                <Repeat size={13} className="shrink-0" /> Esta conta faz parte de uma série fixa — ao salvar, você escolhe o alcance da alteração.
              </div>
            )}

          </div>

          {/* Footer Ações */}
          <div className="pt-4 border-t border-black/[.085] flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 font-medium text-[#86868b] hover:bg-black/[.04] rounded-xl transition-colors text-[11.5px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || saving}
              className="h-10 px-6 bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold rounded-xl text-[11.5px] transition-colors shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {(() => {
                if (transactionId) return 'Confirmar Lançamento';
                const nInst = Math.max(0, parseInt(installmentCount, 10) || 0);
                if (splitOn && installmentOn) return `Criar Rateio em ${nInst} Parcelas`;
                if (splitOn && recurring) return `Criar ${splitLines.length} Contas Fixas`;
                if (splitOn) return `Criar Rateio (${splitLines.length})`;
                if (installmentOn) return `Criar ${nInst} Parcelas`;
                if (recurring) return 'Criar Conta Fixa';
                return 'Confirmar Lançamento';
              })()}
            </button>
          </div>

        </form>
      </div>

      {/* Diálogo de escopo (editar ocorrência de série) */}
      {scopeDialog && (
        <div className="fixed inset-0 z-[11050] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !saving && setScopeDialog(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 p-5 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 mb-1">
              <Repeat size={16} className="text-indigo-500" />
              <h4 className="text-base font-black text-slate-800 tracking-tight">Aplicar alteração</h4>
            </div>
            <p className="text-xs font-medium text-slate-500 mb-4">Esta conta se repete. Onde você quer aplicar as mudanças? (Parcelas já realizadas não são alteradas.)</p>
            <div className="flex flex-col gap-2">
              <button type="button" disabled={saving} onClick={() => persist('this')}
                className="w-full h-11 px-4 text-left text-xs font-black uppercase tracking-wide text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors disabled:opacity-60">
                Só esta ocorrência
              </button>
              <button type="button" disabled={saving} onClick={() => persist('future')}
                className="w-full h-11 px-4 text-left text-xs font-black uppercase tracking-wide text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors disabled:opacity-60">
                Esta e as próximas
              </button>
              <button type="button" disabled={saving} onClick={() => persist('all')}
                className="w-full h-11 px-4 text-left text-xs font-black uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60">
                Toda a série
              </button>
            </div>
            <button type="button" disabled={saving} onClick={() => setScopeDialog(false)}
              className="mt-3 w-full text-[11px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wide">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Cadastro rápido de fornecedor/cliente a partir do combobox de Origem/Destino */}
      {partyModal && (
        <PartyModal initialName={partyModal.name} defaultKind={formData.type === 'ENTRADA' ? 'CLIENTE' : 'FORNECEDOR'} onSave={savePartyModal} onCancel={cancelPartyModal} />
      )}
    </div>
  );
}
