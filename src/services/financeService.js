import { supabase } from './supabase';
import { logAction } from '../utils/logger';
import { excluirArquivosDoOrcamento } from './propostas';

// ===== Helpers de recorrência (datas 'YYYY-MM-DD', sem fuso) =====
const RECURRENCE_HORIZON_MONTHS = 12;
const _pad2 = (n) => String(n).padStart(2, '0');
const _iso = (y, m, d) => `${y}-${_pad2(m)}-${_pad2(d)}`;
const _minDate = (a, b) => (a < b ? a : b);
// UUID v4 p/ colunas de grupo (split/installment). Fallback manual p/ ambientes
// sem crypto.randomUUID (precisa ser uuid válido — as colunas são do tipo uuid).
const _uuid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

// Próxima ocorrência conforme a frequência, preservando o "dia âncora"
// (dia do mês original) com clamp para meses curtos (ex.: 31 -> 30/28).
function _nextOccurrence(dateStr, frequency, anchorDay) {
  const [y, m] = dateStr.split('-').map(Number);
  const d = Number(dateStr.split('-')[2]);
  if (frequency === 'SEMANAL') {
    const dt = new Date(y, m - 1, d + 7);
    return _iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  if (frequency === 'ANUAL') {
    const ny = y + 1;
    const last = new Date(ny, m, 0).getDate();
    return _iso(ny, m, Math.min(anchorDay, last));
  }
  // MENSAL
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const last = new Date(ny, nm, 0).getDate();
  return _iso(ny, nm, Math.min(anchorDay, last));
}

// Datas de ocorrência da regra no intervalo [fromInclusive, untilInclusive].
function _occurrences(rule, fromInclusive, untilInclusive) {
  const anchorDay = Number(rule.start_date.split('-')[2]);
  const out = [];
  let cur = rule.start_date;
  let guard = 0;
  while (cur <= untilInclusive && guard < 6000) {
    if (cur >= fromInclusive) out.push(cur);
    cur = _nextOccurrence(cur, rule.frequency, anchorDay);
    guard++;
  }
  return out;
}

// Soma (ou subtrai) dias a uma data 'YYYY-MM-DD'.
function _addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return _iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

// Hoje em horário LOCAL como 'YYYY-MM-DD' (evita o salto de dia do toISOString/UTC).
function _todayISO() {
  const d = new Date();
  return _iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Hoje + N meses, em 'YYYY-MM-DD'.
function _horizon(months) {
  const t = new Date();
  const dt = new Date(t.getFullYear(), t.getMonth() + months, t.getDate());
  return _iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

// Monta a linha de transação (ocorrência) a partir da regra, numa data.
function _occurrenceRow(rule, dateStr) {
  return {
    account_id: rule.account_id,
    category_id: rule.category_id,
    party_id: rule.party_id,
    projeto_id: rule.projeto_id || null,
    type: rule.type,
    amount: rule.amount,
    description: rule.description,
    payment_method: rule.payment_method,
    cost_center_id: rule.cost_center_id || '30000000-0000-0000-0000-000000000001',
    transaction_date: dateStr,
    due_date: dateStr,
    status: 'PENDENTE',
    // Competência de cada ocorrência = o próprio mês da data (conta fixa se refere ao mês corrente).
    reference_month: dateStr.slice(0, 7),
    recurrence_id: rule.id
  };
}

// PostgREST/Supabase limita cada resposta a 1.000 linhas — sem paginar, listas maiores
// são cortadas EM SILÊNCIO (ex.: conciliação com 1.236 pendentes só mostrava 1.000).
// Pagina em blocos até vir página incompleta. buildQuery deve criar uma query NOVA a
// cada chamada e ter ORDER BY estável (desempate por id) p/ as páginas não se sobreporem.
async function _fetchAll(buildQuery, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) return all;
  }
}

// ===== Helpers de log legível =====
// O log deve permitir identificar O QUE foi feito sem decifrar UUID: data, valor,
// descrição e contraparte. Falha de log nunca derruba a operação (try/catch).
const _logBRL = (v) => `R$ ${Math.abs(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const _logDate = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
// "25/06/2026 · R$ 3.445,49 · MORA CONTA GARANTIDA" a partir de uma linha (extrato ou lançamento).
const _logTxLabel = (t) => [
  _logDate(t?.transaction_date || t?.due_date),
  t?.amount != null ? _logBRL(t.amount) : '',
  String(t?.description || t?.memo || '').slice(0, 70)
].filter(Boolean).join(' · ');
// Nome do pagador/fornecedor (para "pra quem foi" no log). Vazio se não houver.
async function _logPartyName(partyId) {
  if (!partyId) return '';
  try {
    const { data } = await supabase.from('finance_parties').select('name').eq('id', partyId).maybeSingle();
    return data?.name || '';
  } catch { return ''; }
}
// Resumo legível de itens do extrato importado, por id: ": item1 | item2 … e mais N".
async function _logImportedSummary(ids, max = 8) {
  try {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return '';
    const { data } = await supabase
      .from('finance_imported_transactions')
      .select('transaction_date, amount, description, memo')
      .in('id', list.slice(0, 50));
    if (!data?.length) return '';
    const parts = data.slice(0, max).map(_logTxLabel);
    const extra = data.length > max ? ` … e mais ${data.length - max}` : '';
    return `: ${parts.join(' | ')}${extra}`;
  } catch { return ''; }
}
// Rótulo legível de um lançamento do sistema, por id (com contraparte quando houver).
async function _logTransactionLabel(transactionId) {
  try {
    const { data } = await supabase
      .from('finance_transactions')
      .select('transaction_date, due_date, amount, description, finance_parties(name)')
      .eq('id', transactionId)
      .maybeSingle();
    if (!data) return '';
    const party = data.finance_parties?.name;
    return `${_logTxLabel(data)}${party ? ` (${party})` : ''}`;
  } catch { return ''; }
}

export const financeService = {
  // ==========================================
  // 1. GESTÃO DE CONTAS (ACCOUNTS)
  // ==========================================
  async getAccounts() {
    const { data, error } = await supabase
      .from('finance_accounts')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },

  async createAccount(account) {
    const { data, error } = await supabase
      .from('finance_accounts')
      .insert([account])
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - CONTA', `Criou conta: ${account.name}`);
    return data[0];
  },

  async updateAccount(id, account) {
    // NUNCA sobrescrever current_balance com snapshot do cliente (ele é dirigido por baixas).
    // A tela de contas ajusta o saldo pela DIFERENÇA do saldo inicial — repassada aqui como
    // _balanceDelta e aplicada de forma relativa no banco (evita corrida que "apaga" baixas).
    const { current_balance, _balanceDelta, ...safe } = account;
    const { data, error } = await supabase
      .from('finance_accounts')
      .update(safe)
      .eq('id', id)
      .select();
    if (error) throw error;
    if (_balanceDelta && Math.abs(_balanceDelta) > 0.0049) {
      const { error: dErr } = await supabase.rpc('adjust_account_balance', { p_account_id: id, p_delta: _balanceDelta });
      if (dErr) throw dErr;
    }
    await logAction('FINANCEIRO - CONTA', `Atualizou conta: ${account.name || data[0]?.name || id}`);
    return data[0];
  },

  async deleteAccount(id) {
    const { data: old } = await supabase.from('finance_accounts').select('name').eq('id', id).maybeSingle();
    // Não permite excluir conta com movimento (lançamentos ou extrato importado) — só inativar.
    const [{ count: txCount }, { count: impCount }] = await Promise.all([
      supabase.from('finance_transactions').select('*', { count: 'exact', head: true }).eq('account_id', id),
      supabase.from('finance_imported_transactions').select('*', { count: 'exact', head: true }).eq('account_id', id),
    ]);
    if ((txCount || 0) + (impCount || 0) > 0) {
      const err = new Error(`A conta "${old?.name || id}" tem ${txCount || 0} lançamento(s) e ${impCount || 0} linha(s) de extrato. Exclua/mova os lançamentos primeiro — contas com histórico não podem ser excluídas.`);
      err.code = 'HAS_TRANSACTIONS';
      throw err;
    }
    const { error } = await supabase
      .from('finance_accounts')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - CONTA', `Excluiu conta: ${old?.name || id}`);
    return true;
  },

  // ==========================================
  // 2. CATEGORIAS FINANCEIRAS (CATEGORIES)
  // ==========================================
  async getCategories() {
    const { data, error } = await supabase
      .from('finance_categories')
      .select('*')
      .order('position')
      .order('name');
    if (error) throw error;
    return data;
  },

  async createCategory(category) {
    const { data, error } = await supabase
      .from('finance_categories')
      .insert([category])
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - CATEGORIA', `Criou categoria: ${category.name}`);
    return data[0];
  },

  async updateCategory(id, category) {
    const { data, error } = await supabase
      .from('finance_categories')
      .update(category)
      .eq('id', id)
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - CATEGORIA', `Atualizou categoria: ${category.name || data[0]?.name || id}`);
    return data[0];
  },

  // Persiste a nova ordem de um conjunto de categorias (reordenação por arrastar/setas).
  async updateCategoriesOrder(orderedIds) {
    const updates = orderedIds.map((id, index) =>
      supabase.from('finance_categories').update({ position: index + 1 }).eq('id', id)
    );
    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    return true;
  },

  async deleteCategory(id) {
    const { data: old } = await supabase.from('finance_categories').select('name').eq('id', id).maybeSingle();
    // Bloqueia se houver subcategorias ou lançamentos usando a categoria (senão sumiriam
    // do DRE, descategorizados em silêncio). Padrão do deleteCostCenter.
    const [{ count: childCount }, { count: txCount }] = await Promise.all([
      supabase.from('finance_categories').select('*', { count: 'exact', head: true }).eq('parent_id', id),
      supabase.from('finance_transactions').select('*', { count: 'exact', head: true }).eq('category_id', id),
    ]);
    if ((childCount || 0) > 0) { const e = new Error(`A categoria "${old?.name || id}" tem subcategorias. Exclua/mova as subcategorias primeiro.`); e.code = 'HAS_CHILDREN'; throw e; }
    if ((txCount || 0) > 0) { const e = new Error(`A categoria "${old?.name || id}" tem ${txCount} lançamento(s). Recategorize-os antes de excluir.`); e.code = 'HAS_TRANSACTIONS'; throw e; }
    const { error } = await supabase
      .from('finance_categories')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - CATEGORIA', `Excluiu categoria: ${old?.name || id}`);
    return true;
  },

  // ==========================================
  // 2c. CENTROS DE CUSTO (COST CENTERS)
  // ==========================================
  async getCostCenters() {
    const { data, error } = await supabase
      .from('finance_cost_centers')
      .select('*')
      .order('position', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return data;
  },

  async createCostCenter(cc) {
    const { data, error } = await supabase.from('finance_cost_centers').insert([cc]).select();
    if (error) throw error;
    await logAction('FINANCEIRO - CENTRO DE CUSTO', `Criou centro de custo: ${cc.name}`);
    return data[0];
  },

  async updateCostCenter(id, cc) {
    const { data, error } = await supabase
      .from('finance_cost_centers')
      .update({ ...cc, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - CENTRO DE CUSTO', `Atualizou centro de custo: ${cc.name || data[0]?.name || id}`);
    return data[0];
  },

  async updateCostCentersOrder(orderedIds) {
    const updates = orderedIds.map((id, index) =>
      supabase.from('finance_cost_centers').update({ position: index + 1 }).eq('id', id)
    );
    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    return true;
  },

  // Bloqueia exclusão se houver subcentros ou lançamentos vinculados (integridade).
  // Lança Error com code 'HAS_CHILDREN' | 'HAS_TRANSACTIONS' para a UI avisar.
  async deleteCostCenter(id) {
    if (id === '30000000-0000-0000-0000-000000000001') {
      const e = new Error('IS_DEFAULT'); e.code = 'IS_DEFAULT'; throw e;
    }
    const [{ count: kids }, { count: txs }] = await Promise.all([
      supabase.from('finance_cost_centers').select('id', { count: 'exact', head: true }).eq('parent_id', id),
      supabase.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('cost_center_id', id),
    ]);
    if (kids > 0) { const e = new Error('HAS_CHILDREN'); e.code = 'HAS_CHILDREN'; throw e; }
    if (txs > 0) { const e = new Error('HAS_TRANSACTIONS'); e.code = 'HAS_TRANSACTIONS'; throw e; }
    const { error } = await supabase.from('finance_cost_centers').delete().eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - CENTRO DE CUSTO', `Excluiu centro de custo ID: ${id}`);
    return true;
  },

  // ==========================================
  // 2b. PAGADORES / FORNECEDORES (PARTIES)
  // ==========================================
  async getParties(kind = null) {
    let query = supabase
      .from('finance_parties')
      .select('*')
      .order('name');
    // kind: 'CLIENTE' (recebe), 'FORNECEDOR' (paga). Inclui sempre 'AMBOS'.
    if (kind) query = query.in('kind', [kind, 'AMBOS']);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async createParty(party) {
    const { data, error } = await supabase
      .from('finance_parties')
      .insert([party])
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - PAGADOR', `Criou pagador/fornecedor: ${party.name}`);
    return data[0];
  },

  async updateParty(id, party) {
    const { data, error } = await supabase
      .from('finance_parties')
      .update({ ...party, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - PAGADOR', `Atualizou pagador/fornecedor: ${party.name || data[0]?.name || id}`);
    return data[0];
  },

  async deleteParty(id) {
    const { data: old } = await supabase.from('finance_parties').select('name').eq('id', id).maybeSingle();
    const { error } = await supabase
      .from('finance_parties')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - PAGADOR', `Excluiu pagador/fornecedor: ${old?.name || id}`);
    return true;
  },

  // ==========================================
  // 3. MOVIMENTAÇÕES (TRANSACTIONS)
  // ==========================================
  async getTransactions(filters = {}) {
    const build = () => {
    let query = supabase
      .from('finance_transactions')
      .select(`
        *,
        finance_accounts (name, bank_name),
        finance_categories (name, color, icon),
        finance_parties (name, kind),
        finance_cost_centers (name, color),
        projetos (nome)
      `)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: true });

    if (filters.accountId) query = query.eq('account_id', filters.accountId);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.partyId) query = query.eq('party_id', filters.partyId);
    if (filters.type) query = query.eq('type', filters.type);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.statusIn) query = query.in('status', filters.statusIn); // ex.: ['PENDENTE','PARCIAL']
    // Base do período: 'reference' filtra por COMPETÊNCIA (reference_month), com fallback
    // pela data do lançamento para quem não tem competência preenchida — mesmo critério
    // da Análise de Contratos. Default ('date') mantém o filtro por data do lançamento.
    if (filters.basis === 'reference' && (filters.startDate || filters.endDate)) {
      const s = filters.startDate || '1900-01-01';
      const e = filters.endDate || '2999-12-31';
      // ESTRITO: só lançamentos cuja COMPETÊNCIA (reference_month) cai no período.
      // Quem está sem competência preenchida NÃO entra no modo Competência (aparece no
      // modo Data). Evita inflar DRE/Gerencial com itens ainda não classificados.
      query = query.gte('reference_month', s.slice(0, 7)).lte('reference_month', e.slice(0, 7));
    } else {
      if (filters.startDate) query = query.gte('transaction_date', filters.startDate);
      if (filters.endDate) query = query.lte('transaction_date', filters.endDate);
    }
    // Filtro por vencimento (contas a pagar/receber) — independente da data do lançamento.
    if (filters.dueStart) query = query.gte('due_date', filters.dueStart);
    if (filters.dueEnd) query = query.lte('due_date', filters.dueEnd);
    // Vencimento NO período OU (sem vencimento E lançado no período) — não esconde
    // contas sem due_date, ancorando-as na data do lançamento.
    if (filters.dueOrTxStart && filters.dueOrTxEnd) {
      const s = filters.dueOrTxStart, e = filters.dueOrTxEnd;
      query = query.or(`and(due_date.gte.${s},due_date.lte.${e}),and(due_date.is.null,transaction_date.gte.${s},transaction_date.lte.${e})`);
    }
    if (filters.costCenterId) query = query.eq('cost_center_id', filters.costCenterId);
    // Apenas lançamentos ainda SEM conciliação (para a tela de conciliação oferecer
    // como candidatos — inclui pagos e pendentes, não só "em aberto").
    if (filters.unreconciledOnly) query = query.is('imported_transaction_id', null);
    return query;
    };
    return _fetchAll(build);
  },

  async createTransaction(transaction) {
    const { data, error } = await supabase
      .from('finance_transactions')
      .insert([transaction])
      .select();
    if (error) throw error;
    const partyName = await _logPartyName(transaction.party_id);
    await logAction('FINANCEIRO - TRANSAÇÃO', `Criou lançamento de ${transaction.type}: ${_logTxLabel(transaction)}${partyName ? ` (${partyName})` : ''}`);
    return data[0];
  },

  // Parcelamento: cria N parcelas (vencimento mensal escalonado a partir de anchorDate),
  // numeradas 1/N..N/N, ligadas por installment_group_id. base.amount = valor TOTAL,
  // dividido igualmente entre as parcelas (a última absorve os centavos do arredondamento).
  async createInstallments(base, count, anchorDate) {
    const n = Math.max(1, parseInt(count, 10) || 1);
    const totalCents = Math.round(parseFloat(base.amount) * 100);
    const perCents = Math.floor(totalCents / n);
    // Retenção na fonte: o bruto também é dividido por parcela; o retido de cada
    // parcela sai da diferença (bruto − líquido), garantindo consistência linha a linha.
    const grossCents = base.gross_amount != null ? Math.round(parseFloat(base.gross_amount) * 100) : null;
    const perGrossCents = grossCents != null ? Math.floor(grossCents / n) : null;
    const groupId = _uuid();
    const [y, m, d] = String(anchorDate).split('-').map(Number);
    const rows = [];
    for (let i = 0; i < n; i++) {
      // Clampa o dia ao último dia do mês alvo p/ não "virar" o mês (ex.: 31/jan + 1 mês = 28/fev, não 03/mar).
      const targetMonth = (m - 1) + i;
      const lastDay = new Date(y, targetMonth + 1, 0).getDate();
      const dt = new Date(y, targetMonth, Math.min(d, lastDay));
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const amountCents = i === n - 1 ? totalCents - perCents * (n - 1) : perCents;
      const rowGrossCents = grossCents != null ? (i === n - 1 ? grossCents - perGrossCents * (n - 1) : perGrossCents) : null;
      rows.push({
        ...base, amount: amountCents / 100,
        gross_amount: rowGrossCents != null ? rowGrossCents / 100 : null,
        withheld_amount: rowGrossCents != null ? (rowGrossCents - amountCents) / 100 : null,
        transaction_date: iso, due_date: iso, status: 'PENDENTE',
        installment_number: i + 1, installment_total: n, installment_group_id: groupId
      });
    }
    const { data, error } = await supabase.from('finance_transactions').insert(rows).select();
    if (error) throw error;
    await logAction('FINANCEIRO - PARCELAMENTO', `Criou ${n} parcela(s): ${base.description || ''}`);
    return data;
  },

  async updateTransaction(id, transaction) {
    const { data, error } = await supabase
      .from('finance_transactions')
      .update(transaction)
      .eq('id', id)
      .select();
    if (error) throw error;
    const partyName = await _logPartyName(data[0]?.party_id);
    await logAction('FINANCEIRO - TRANSAÇÃO', `Atualizou lançamento: ${_logTxLabel(data[0]) || id}${partyName ? ` (${partyName})` : ''}`);
    return data[0];
  },

  async deleteTransaction(id) {
    const label = await _logTransactionLabel(id);
    const { error } = await supabase
      .from('finance_transactions')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - TRANSAÇÃO', `Excluiu lançamento: ${label || id}`);
    return true;
  },

  async updateTransactionsStatus(ids, newStatus) {
    const idArray = Array.isArray(ids) ? ids : [ids];
    if (idArray.length === 0) return true;
    const { error } = await supabase
      .from('finance_transactions')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .in('id', idArray);
    if (error) throw error;
    await logAction('FINANCEIRO - STATUS', `Alterou status de ${idArray.length} lançamento(s) para ${newStatus}`);
    return true;
  },


  // ----- Baixas (pagamentos/recebimentos efetivados) -----
  // Lista as baixas de um lançamento.
  async getTransactionPayments(transactionId) {
    const { data, error } = await supabase
      .from('finance_transaction_payments')
      .select('*, finance_accounts (name)')
      .eq('transaction_id', transactionId)
      .order('payment_date', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Data da baixa mais recente por lançamento (para telas que precisam mostrar
  // "pago em" de verdade, e não a Data do Lançamento). Retorna { [transactionId]: 'YYYY-MM-DD' }.
  async getLastPaymentDates(transactionIds) {
    const ids = [...new Set(transactionIds || [])].filter(Boolean);
    if (ids.length === 0) return {};
    const { data, error } = await supabase
      .from('finance_transaction_payments')
      .select('transaction_id, payment_date')
      .in('transaction_id', ids)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    const map = {};
    for (const p of data || []) {
      if (!(p.transaction_id in map)) map[p.transaction_id] = p.payment_date; // 1ª ocorrência = mais recente (ordenado desc)
    }
    return map;
  },

  // Baixas (pagamentos/recebimentos já efetivados) no período, pela DATA REAL da baixa
  // (payment_date) — não pela Data do Lançamento. Base do Fluxo de Caixa "de verdade":
  // cada linha aqui é um movimento de caixa que de fato aconteceu, na data em que aconteceu.
  async getPaymentsInRange({ accountId, startDate, endDate } = {}) {
    let query = supabase
      .from('finance_transaction_payments')
      .select(`
        id, transaction_id, account_id, amount, payment_date, payment_method, doc_number,
        finance_transactions (
          id, type, description, category_id, transfer_group_id,
          finance_categories (name, color, in_cash_flow),
          finance_parties (name, kind)
        )
      `)
      .order('payment_date', { ascending: true });
    if (accountId) query = query.eq('account_id', accountId);
    if (startDate) query = query.gte('payment_date', startDate);
    if (endDate) query = query.lte('payment_date', endDate);
    const { data, error } = await query;
    if (error) throw error;
    // Achata pro formato "lançamento" já usado nas telas (1 baixa = 1 linha de caixa).
    return (data || [])
      .filter(p => p.finance_transactions) // órfã de lançamento apagado (não deveria ocorrer, FK cascade)
      .map(p => ({
        id: p.id,
        transaction_id: p.transaction_id,
        account_id: p.account_id,
        amount: p.amount,
        payment_date: p.payment_date,
        payment_method: p.payment_method,
        doc_number: p.doc_number,
        type: p.finance_transactions.type,
        description: p.finance_transactions.description,
        category_id: p.finance_transactions.category_id,
        transfer_group_id: p.finance_transactions.transfer_group_id,
        finance_categories: p.finance_transactions.finance_categories,
        finance_parties: p.finance_transactions.finance_parties,
      }));
  },

  // Registra uma baixa (parcial ou total) — atualiza status PENDENTE/PARCIAL/PAGO e o saldo via trigger.
  async settleTransaction(transactionId, { amount, date, method, accountId, doc } = {}) {
    const { data, error } = await supabase.rpc('settle_transaction', {
      p_transaction_id: transactionId,
      p_amount: amount,
      p_date: date || null,
      p_method: method || null,
      p_account_id: accountId || null,
      p_doc: doc || null,
    });
    if (error) throw error;
    const label = await _logTransactionLabel(transactionId);
    await logAction('FINANCEIRO - BAIXA', `Baixa de ${_logBRL(amount)}${date ? ` em ${_logDate(date)}` : ''} no lançamento${label ? `: ${label}` : ` ${transactionId}`}`);
    return data;
  },

  // Estorna uma baixa (apaga o pagamento; o saldo volta via trigger).
  async deletePayment(paymentId) {
    const { error } = await supabase.rpc('delete_payment', { p_payment_id: paymentId });
    if (error) throw error;
    await logAction('FINANCEIRO - BAIXA', `Estornou baixa ${paymentId}`);
    return true;
  },

  // ----- Transferência entre contas (não entra no DRE; move saldo entre contas) -----
  async createTransfer({ fromAccount, toAccount, amount, date, description, costCenterId } = {}) {
    const { data, error } = await supabase.rpc('create_transfer', {
      p_from_account: fromAccount,
      p_to_account: toAccount,
      p_amount: amount,
      p_date: date || null,
      p_description: description || null,
      p_cost_center_id: costCenterId || null,
    });
    if (error) throw error;
    let accNames = '';
    try {
      const { data: accs } = await supabase.from('finance_accounts').select('id, name').in('id', [fromAccount, toAccount]);
      const nameOf = (accId) => accs?.find(a => a.id === accId)?.name;
      if (nameOf(fromAccount) && nameOf(toAccount)) accNames = ` de ${nameOf(fromAccount)} para ${nameOf(toAccount)}`;
    } catch { /* log segue sem os nomes */ }
    await logAction('FINANCEIRO - TRANSFERÊNCIA', `Transferência de ${_logBRL(amount)}${accNames}${date ? ` em ${_logDate(date)}` : ''}${description ? ` — ${description}` : ''}`);
    return data; // transfer_group_id
  },

  async deleteTransfer(groupId) {
    const { error } = await supabase.rpc('delete_transfer', { p_group_id: groupId });
    if (error) throw error;
    await logAction('FINANCEIRO - TRANSFERÊNCIA', `Excluiu transferência ${groupId}`);
    return true;
  },

  // ----- Rateio (split): 1 lançamento dividido em N categorias (linhas-irmãs por split_group_id) -----
  // Cria as N linhas atomicamente; cada `row` traz as colunas do lançamento (já com category_id/amount).
  // Rateio: gera as linhas-irmãs num ÚNICO insert (uma statement = atômico).
  // Substitui a RPC create_split_transactions, que não gravava reference_month/attachments.
  async createSplitTransactions(rows) {
    const groupId = _uuid();
    const { error } = await supabase
      .from('finance_transactions')
      .insert(rows.map(r => ({ ...r, split_group_id: groupId })));
    if (error) throw error;
    await logAction('FINANCEIRO - RATEIO', `Criou rateio com ${rows.length} categoria(s)`);
    return groupId;
  },

  // Rateio + Parcelamento: divide em categorias E em N parcelas mensais.
  // lines = payloads (1 por categoria, amount = TOTAL da categoria). Gera N×M linhas
  // num único insert: cada mês é um grupo de rateio; parcelas numeradas 1/N..N/N e a
  // última parcela de cada categoria absorve os centavos do arredondamento.
  async createSplitInstallments(lines, count, anchorDate) {
    const n = Math.max(1, parseInt(count, 10) || 1);
    const instGroupId = _uuid();
    const [y, m, d] = String(anchorDate).split('-').map(Number);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const targetMonth = (m - 1) + i;
      const lastDay = new Date(y, targetMonth + 1, 0).getDate();
      const dt = new Date(y, targetMonth, Math.min(d, lastDay));
      const iso = _iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      const splitGroupId = _uuid();
      for (const line of lines) {
        const totalCents = Math.round(parseFloat(line.amount) * 100);
        const perCents = Math.floor(totalCents / n);
        const amount = (i === n - 1 ? totalCents - perCents * (n - 1) : perCents) / 100;
        rows.push({
          ...line, amount, transaction_date: iso, due_date: iso, status: 'PENDENTE',
          split_group_id: splitGroupId,
          installment_number: i + 1, installment_total: n, installment_group_id: instGroupId
        });
      }
    }
    const { error } = await supabase.from('finance_transactions').insert(rows);
    if (error) throw error;
    await logAction('FINANCEIRO - RATEIO', `Criou rateio parcelado: ${lines.length} categoria(s) × ${n} parcela(s)`);
    return rows.length;
  },

  // Rateio + Conta fixa: cria UMA regra de recorrência por categoria do rateio
  // (cada linha vira sua própria conta fixa, com o valor cheio da categoria).
  async createSplitRecurrences(lines, ruleBase) {
    let total = 0;
    for (const line of lines) {
      const { count } = await this.createRecurrence({ ...line, ...ruleBase });
      total += count;
    }
    return { rules: lines.length, count: total };
  },

  // Linhas-irmãs de um rateio (para mostrar/quitar o grupo na baixa).
  async getSplitGroup(groupId) {
    const { data, error } = await supabase
      .from('finance_transactions')
      .select('*, finance_categories (name, color)')
      .eq('split_group_id', groupId)
      .order('amount', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Quita o grupo inteiro: baixa o saldo restante de cada linha pendente do rateio.
  async settleGroup(groupId, { date, method, accountId, doc } = {}) {
    const { data, error } = await supabase.rpc('settle_group', {
      p_group_id: groupId,
      p_date: date || null,
      p_method: method || null,
      p_account_id: accountId || null,
      p_doc: doc || null,
    });
    if (error) throw error;
    await logAction('FINANCEIRO - BAIXA', `Quitou rateio em grupo ${groupId}`);
    return data; // nº de linhas baixadas
  },

  // Exclui parcelas de um parcelamento. scope: 'this' | 'future' | 'all'.
  // Parcelas PAGAS são histórico e não são tocadas por future/all. Se a parcela
  // clicada for perna de rateio parcelado, 'this' exclui o grupo do mês inteiro
  // (as linhas-irmãs daquele mês), não uma perna solta.
  async deleteInstallmentScope(transaction, scope) {
    if (scope === 'this' || !transaction.installment_group_id) {
      if (transaction.split_group_id) return this.deleteSplitGroup(transaction.split_group_id);
      return this.deleteTransaction(transaction.id);
    }
    let q = supabase.from('finance_transactions').delete()
      .eq('installment_group_id', transaction.installment_group_id)
      .eq('status', 'PENDENTE');
    if (scope === 'future') q = q.gte('transaction_date', transaction.transaction_date);
    const { error } = await q;
    if (error) throw error;
    await logAction('FINANCEIRO - PARCELAMENTO', `Excluiu parcelas (${scope}) do grupo ${transaction.installment_group_id}`);
    return true;
  },

  async deleteSplitGroup(groupId) {
    // Não apagar rateio com perna já baixada ou conciliada (estornaria baixa / desfaria
    // conciliação em silêncio). Bloqueia e orienta desconciliar/estornar antes.
    const { data: legs, error: lErr } = await supabase
      .from('finance_transactions')
      .select('status, paid_amount, imported_transaction_id')
      .eq('split_group_id', groupId);
    if (lErr) throw lErr;
    const locked = (legs || []).some(l => (parseFloat(l.paid_amount) || 0) > 0.0049 || l.imported_transaction_id);
    if (locked) {
      const err = new Error('Este rateio tem parte já baixada ou conciliada. Desconcilie/estorne antes de excluir.');
      err.code = 'HAS_PAYMENTS';
      throw err;
    }
    const { error } = await supabase.rpc('delete_split_group', { p_group_id: groupId });
    if (error) throw error;
    await logAction('FINANCEIRO - RATEIO', `Excluiu rateio ${groupId}`);
    return true;
  },

  // ==========================================
  // 3b. RECORRÊNCIAS (CONTAS FIXAS)
  // ==========================================
  // Cria a regra e materializa as ocorrências até o horizonte (ou end_date, se antes).
  // Data da N-ésima ocorrência a partir do início (n=1 = o próprio início).
  // Usa a MESMA regra de datas da materialização (clamp de fim de mês etc.),
  // p/ o modo "repetir N vezes" gerar exatamente N ocorrências.
  nthOccurrenceDate(startDate, frequency, n) {
    const anchorDay = Number(String(startDate).split('-')[2]);
    let cur = startDate;
    for (let i = 1; i < n; i++) cur = _nextOccurrence(cur, frequency, anchorDay);
    return cur;
  },

  async createRecurrence(rule) {
    const targetUntil = rule.end_date
      ? _minDate(rule.end_date, _horizon(RECURRENCE_HORIZON_MONTHS))
      : _horizon(RECURRENCE_HORIZON_MONTHS);

    const { data: recData, error: recErr } = await supabase
      .from('finance_recurrences')
      .insert([{
        type: rule.type,
        account_id: rule.account_id,
        category_id: rule.category_id || null,
        party_id: rule.party_id || null,
        projeto_id: rule.projeto_id || null,
        amount: rule.amount,
        description: rule.description,
        payment_method: rule.payment_method || null,
        cost_center_id: rule.cost_center_id || '30000000-0000-0000-0000-000000000001',
        frequency: rule.frequency,
        start_date: rule.start_date,
        end_date: rule.end_date || null,
        // materialized_until só avança DEPOIS que as ocorrências entram (senão, se o upsert
        // falhar, a regra ficaria "materializada" sem lançamentos — buraco permanente).
        materialized_until: rule.start_date,
        is_active: true
      }])
      .select();
    if (recErr) throw recErr;
    const recurrence = recData[0];

    const dates = _occurrences(recurrence, recurrence.start_date, targetUntil);
    const rows = dates.map(dt => _occurrenceRow(recurrence, dt));
    if (rows.length) {
      // upsert idempotente: a unique (recurrence_id, transaction_date) impede duplicar
      // ocorrências em caso de corrida/reexecução.
      const { error: txErr } = await supabase
        .from('finance_transactions')
        .upsert(rows, { onConflict: 'recurrence_id,transaction_date', ignoreDuplicates: true });
      if (txErr) throw txErr;
    }
    // Agora sim marca até onde materializou.
    await supabase.from('finance_recurrences').update({ materialized_until: targetUntil }).eq('id', recurrence.id);
    await logAction('FINANCEIRO - RECORRÊNCIA', `Criou conta fixa (${recurrence.frequency}) de ${recurrence.type}: R$${recurrence.amount} — ${rows.length} ocorrências`);
    return { recurrence, count: rows.length };
  },

  // Top-up: completa ocorrências faltantes das regras ativas até o horizonte.
  // Chamado ao abrir o financeiro; idempotente (só age quando há atraso).
  async materializeRecurrences() {
    const horizon = _horizon(RECURRENCE_HORIZON_MONTHS);
    const { data: recs, error } = await supabase
      .from('finance_recurrences')
      .select('*')
      .eq('is_active', true);
    if (error) throw error;

    let created = 0;
    for (const rule of (recs || [])) {
      const targetUntil = rule.end_date ? _minDate(rule.end_date, horizon) : horizon;
      const matUntil = rule.materialized_until || rule.start_date;
      if (matUntil >= targetUntil) continue;
      // A partir do DIA SEGUINTE ao já materializado — não do "próximo período".
      // _occurrences anda a grade desde start_date e filtra >= from; o upsert idempotente
      // (recurrence_id, transaction_date) cobre matUntil coincidir com uma data da grade.
      // BUG ANTERIOR: _nextOccurrence(matUntil,...) pulava a próxima ocorrência para sempre,
      // fazendo TODAS as contas fixas pararem de gerar lançamentos após o lote inicial.
      const from = _addDays(matUntil, 1);
      const dates = _occurrences(rule, from, targetUntil);
      if (dates.length) {
        const rows = dates.map(dt => _occurrenceRow(rule, dt));
        // upsert idempotente: a unique (recurrence_id, transaction_date) impede que
        // dois loads/abas concorrentes (que leem o mesmo materialized_until) dupliquem parcelas.
        const { error: insErr } = await supabase
          .from('finance_transactions')
          .upsert(rows, { onConflict: 'recurrence_id,transaction_date', ignoreDuplicates: true });
        if (insErr) throw insErr;
        created += rows.length;
      }
      await supabase.from('finance_recurrences')
        .update({ materialized_until: targetUntil })
        .eq('id', rule.id);
    }
    return created;
  },

  // Edita uma ocorrência. scope: 'this' | 'future' | 'all'.
  // A ocorrência clicada recebe o payload completo; as demais recebem APENAS os campos
  // efetivamente alterados (seriesFields), e só se PENDENTES (as PAGAS são histórico).
  // O corte de 'future' usa transaction.transaction_date = a data ORIGINAL da ocorrência
  // (não a nova digitada no form), passada pelo chamador.
  async updateRecurrenceScope(transaction, scope, payload, seriesFields = null) {
    if (scope === 'this' || !transaction.recurrence_id) {
      return this.updateTransaction(transaction.id, payload);
    }
    // Fallback: se o chamador não computou o diff, propaga todos os campos propagáveis.
    const fields = seriesFields || {
      account_id: payload.account_id,
      category_id: payload.category_id,
      party_id: payload.party_id,
      type: payload.type,
      amount: payload.amount,
      description: payload.description,
      payment_method: payload.payment_method,
      projeto_id: payload.projeto_id
    };
    await this.updateTransaction(transaction.id, payload);

    if (Object.keys(fields).length > 0) {
      let q = supabase.from('finance_transactions').update(fields)
        .eq('recurrence_id', transaction.recurrence_id)
        .eq('status', 'PENDENTE')
        .neq('id', transaction.id);
      if (scope === 'future') q = q.gte('transaction_date', transaction.transaction_date);
      const { error } = await q;
      if (error) throw error;

      const { error: recErr } = await supabase.from('finance_recurrences')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', transaction.recurrence_id);
      if (recErr) throw recErr; // sem isto, a regra podia "voltar" a gerar valores antigos em silêncio
    }
    await logAction('FINANCEIRO - RECORRÊNCIA', `Editou série (${scope}) recorrência ${transaction.recurrence_id}`);
    return true;
  },

  // Exclui ocorrência(s). scope: 'this' | 'future' | 'all'. PAGAS são preservadas.
  // 'future': remove as pendentes desta data em diante e ENCERRA a regra nessa data
  //           (end_date = dia anterior), mantendo-a ativa/consistente (não a mata).
  // 'all':    remove todas as pendentes e desativa a regra.
  async deleteRecurrenceScope(transaction, scope) {
    if (scope === 'this' || !transaction.recurrence_id) {
      return this.deleteTransaction(transaction.id);
    }
    let q = supabase.from('finance_transactions').delete()
      .eq('recurrence_id', transaction.recurrence_id)
      .eq('status', 'PENDENTE');
    if (scope === 'future') q = q.gte('transaction_date', transaction.transaction_date);
    const { error } = await q;
    if (error) throw error;

    if (scope === 'all') {
      await supabase.from('finance_recurrences')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', transaction.recurrence_id);
    } else {
      // 'future': encerra a regra no dia anterior à ocorrência clicada (não regenera daqui pra frente).
      await supabase.from('finance_recurrences')
        .update({ end_date: _addDays(transaction.transaction_date, -1), updated_at: new Date().toISOString() })
        .eq('id', transaction.recurrence_id);
    }
    await logAction('FINANCEIRO - RECORRÊNCIA', `Excluiu série (${scope}) recorrência ${transaction.recurrence_id}`);
    return true;
  },

  // ==========================================
  // 4. CONCILIAÇÃO BANCÁRIA (RECONCILIATION)
  // ==========================================
  async getImportedTransactions(accountId, reconciled = false) {
    return _fetchAll(() => supabase
      .from('finance_imported_transactions')
      .select('*')
      .eq('account_id', accountId)
      .eq('reconciled', reconciled)
      .eq('ignored', false)            // itens ignorados não aparecem na conciliação
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true }));
  },

  // Contagens para a barra de progresso da conciliação. O progresso é do ÚLTIMO extrato
  // importado (as linhas de um mesmo import compartilham o created_at) — não acumula o
  // histórico da conta, que só cresceria com o tempo. `pending` é a fila total a resolver.
  async getReconciliationStats(accountId) {
    const countFor = async (build) => {
      let q = supabase.from('finance_imported_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId);
      q = build(q);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };
    const { data: last, error: lastErr } = await supabase
      .from('finance_imported_transactions')
      .select('created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (lastErr) throw lastErr;
    const lastImportAt = last?.[0]?.created_at || null;
    if (!lastImportAt) return { batchTotal: 0, batchReconciled: 0, batchPending: 0, batchIgnored: 0, pending: 0, lastImportAt: null };
    const [batchTotal, batchReconciled, batchIgnored, pending, reconciled] = await Promise.all([
      countFor(q => q.eq('created_at', lastImportAt)),
      countFor(q => q.eq('created_at', lastImportAt).eq('reconciled', true)),
      countFor(q => q.eq('created_at', lastImportAt).eq('ignored', true).eq('reconciled', false)),
      countFor(q => q.eq('reconciled', false).eq('ignored', false)),
      countFor(q => q.eq('reconciled', true)),
    ]);
    return {
      batchTotal,
      batchReconciled,
      batchPending: batchTotal - batchReconciled - batchIgnored,
      batchIgnored,
      pending,
      reconciled, // total conciliado da conta — usado quando há backlog além do último extrato
      lastImportAt
    };
  },

  // Itens do extrato IGNORADOS (não conciliados) — para a aba "ver ignorados".
  async getIgnoredImportedTransactions(accountId) {
    return _fetchAll(() => supabase
      .from('finance_imported_transactions')
      .select('*')
      .eq('account_id', accountId)
      .eq('ignored', true)
      .eq('reconciled', false)
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true }));
  },

  // Marca um item do extrato como ignorado (some da fila sem virar lançamento).
  async ignoreImportedTransaction(id) {
    const { error } = await supabase
      .from('finance_imported_transactions')
      .update({ ignored: true })
      .eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Ignorou item do extrato${await _logImportedSummary([id])}`);
    return true;
  },

  // Ignora vários itens do extrato de uma vez.
  async ignoreImportedTransactions(ids) {
    if (!ids?.length) return true;
    const { error } = await supabase
      .from('finance_imported_transactions')
      .update({ ignored: true })
      .in('id', ids);
    if (error) throw error;
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Ignorou ${ids.length} itens do extrato${await _logImportedSummary(ids)}`);
    return true;
  },

  // Restaura um item ignorado de volta à fila.
  async unignoreImportedTransaction(id) {
    const { error } = await supabase
      .from('finance_imported_transactions')
      .update({ ignored: false })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Reseta o extrato importado da conta: apaga TODOS os itens ainda NÃO conciliados
  // (pendentes + ignorados). Os já conciliados (viraram lançamento) são preservados.
  async clearImportedStatement(accountId) {
    const { error } = await supabase
      .from('finance_imported_transactions')
      .delete()
      .eq('account_id', accountId)
      .eq('reconciled', false);
    if (error) throw error;
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Limpou o extrato importado (não conciliado) da conta ${accountId}`);
    return true;
  },

  // Contagem de transações importadas ainda não conciliadas, agrupada por conta.
  // Retorna { [accountId]: total }. Ignorados ficam de fora: não são pendência.
  async getPendingReconciliationCounts() {
    const data = await _fetchAll(() => supabase
      .from('finance_imported_transactions')
      .select('id, account_id')
      .eq('reconciled', false)
      .eq('ignored', false)
      .order('id', { ascending: true }));
    const counts = {};
    data.forEach(row => {
      counts[row.account_id] = (counts[row.account_id] || 0) + 1;
    });
    return counts;
  },

  async importImportedTransactions(transactions) {
    // Mantém só as colunas existentes na tabela (o parser traz campos extras como `type`).
    const mapped = transactions.map(t => ({
      account_id: t.account_id,
      fitid: t.fitid,
      transaction_date: t.transaction_date,
      amount: t.amount,
      description: t.description,
      memo: t.memo
    }));
    // Alguns bancos (ex.: Bradesco) repetem o mesmo FITID no arquivo. Sem tratar, o upsert
    // estoura "ON CONFLICT DO UPDATE command cannot affect row a second time".
    // 1) Remove linhas idênticas (duplicação do próprio arquivo) — mantém uma.
    const seen = new Set();
    const uniq = mapped.filter(r => {
      const ck = `${r.account_id}|${r.fitid}|${r.transaction_date}|${r.amount}|${r.description}|${r.memo}`;
      if (seen.has(ck)) return false;
      seen.add(ck); return true;
    });
    // 2) Mesmo FITID em transações DIFERENTES (ex.: 2 tarifas iguais no dia): sufixa o fitid
    //    (-2, -3…) p/ não colidir no índice único e preservar as duas. Determinístico pela
    //    ordem do arquivo → reimportar o mesmo extrato continua idempotente.
    const fitCount = new Map();
    const rows = uniq.map(r => {
      const n = (fitCount.get(r.fitid) || 0) + 1;
      fitCount.set(r.fitid, n);
      return n === 1 ? r : { ...r, fitid: `${r.fitid}-${n}` };
    });
    // 3) Reimportar um período já importado NÃO pode duplicar. O FITID do Bradesco muda a
    //    cada export (sequencial por arquivo) e a descrição também varia, então a defesa é
    //    por (conta, data, valor): uma linha do arquivo só entra se houver mais ocorrências
    //    dessa chave no arquivo do que já existem no banco (conciliadas, pendentes ou
    //    ignoradas) — assim 2 tarifas iguais no mesmo dia continuam entrando as duas.
    const accountIds = [...new Set(rows.map(r => r.account_id))];
    const dates = rows.map(r => r.transaction_date).sort();
    // Paginado: sem isso o cap de 1.000 do PostgREST enxergaria só parte do que já existe
    // e reimportar período grande (>1.000 linhas) duplicaria o extrato.
    const existing = await _fetchAll(() => supabase
      .from('finance_imported_transactions')
      .select('id, account_id, fitid, transaction_date, amount')
      .in('account_id', accountIds)
      .gte('transaction_date', dates[0])
      .lte('transaction_date', dates[dates.length - 1])
      .order('id', { ascending: true }));
    const dupKey = r => `${r.account_id}|${r.transaction_date}|${Number(r.amount).toFixed(2)}`;
    const slots = new Map();
    existing.forEach(r => { const k = dupKey(r); slots.set(k, (slots.get(k) || 0) + 1); });
    let skipped = 0;
    const fresh = rows.filter(r => {
      const k = dupKey(r);
      const n = slots.get(k) || 0;
      if (n > 0) { slots.set(k, n - 1); skipped++; return false; }
      return true;
    });
    if (!fresh.length) {
      await logAction('FINANCEIRO - CONCILIAÇÃO', `Importou OFX: ${skipped} transações já existiam, nenhuma nova.`);
      return { inserted: [], skipped };
    }
    // 4) FITID reciclado: o mesmo fitid pode reaparecer em outro arquivo apontando para
    //    OUTRA transação — o upsert sobrescreveria a linha antiga (possivelmente já
    //    conciliada). Se o fitid já pertence a outra (data, valor), sufixa com a data.
    // fitids em chunks (o .in também sofre o cap; e a lista pode ser grande).
    const freshFitids = [...new Set(fresh.map(r => r.fitid))];
    const clashes = [];
    for (let i = 0; i < freshFitids.length; i += 300) {
      const chunk = freshFitids.slice(i, i + 300);
      const part = await _fetchAll(() => supabase
        .from('finance_imported_transactions')
        .select('id, account_id, fitid, transaction_date, amount')
        .in('account_id', accountIds)
        .in('fitid', chunk)
        .order('id', { ascending: true }));
      clashes.push(...part);
    }
    const takenBy = new Map(clashes.map(r => [`${r.account_id}|${r.fitid}`, r]));
    const toInsert = fresh.map(r => {
      const owner = takenBy.get(`${r.account_id}|${r.fitid}`);
      if (owner && dupKey(owner) !== dupKey(r)) return { ...r, fitid: `${r.fitid}-${r.transaction_date}` };
      return r;
    });
    const { data, error } = await supabase
      .from('finance_imported_transactions')
      .upsert(toInsert, { onConflict: 'fitid,account_id' })
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Importou OFX: ${data?.length ?? toInsert.length} transações novas, ${skipped} já existiam.`);
    return { inserted: data || [], skipped };
  },

  // Lança 1+ transações importadas como lançamentos realizados no sistema e marca como conciliadas.
  // Lança em lote as importadas do extrato — atômico via RPC (cada item: cria tx PAGO +
  // marca conciliada na mesma transação; pula as já conciliadas).
  async launchImportedTransactions(importedList, { categoryId = null, costCenterId = null, asTransfer = false, counterAccountId = null } = {}) {
    const ids = (importedList || []).map(i => i.id);
    const { data, error } = await supabase.rpc('launch_imported_transactions', {
      p_ids: ids,
      p_category_id: asTransfer ? null : categoryId,
      p_cost_center_id: costCenterId,
      p_as_transfer: asTransfer,
      p_counter_account_id: asTransfer ? counterAccountId : null
    });
    if (error) throw error;
    const summary = await _logImportedSummary(ids);
    await logAction('FINANCEIRO - CONCILIAÇÃO', asTransfer
      ? `Lançou ${data} transferência(s) entre contas a partir do extrato${summary}`
      : `Lançou ${data} transação(ões) do extrato${summary}`);
    return data;
  },

  // Lança em lote com dados POR LINHA (categoria, método, descrição, valor, transferência).
  // items: [{ id, cost_center_id, category_id, payment_method, description, amount, as_transfer, counter_account_id }]
  async launchImportedTransactionsDetailed(items) {
    const { data, error } = await supabase.rpc('launch_imported_transactions_detailed', { p_items: items || [] });
    if (error) throw error;
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Lançou ${data} transação(ões) do extrato${await _logImportedSummary((items || []).map(i => i.id))}`);
    return data;
  },

  // Concilia importada × transação do sistema — atômico via RPC (lock + recheck).
  async reconcileMatch(importedId, transactionId) {
    const { error } = await supabase.rpc('reconcile_match', {
      p_imported_id: importedId,
      p_transaction_id: transactionId
    });
    if (error) throw error;
    const impSummary = await _logImportedSummary([importedId]);
    const txLabel = await _logTransactionLabel(transactionId);
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Conciliou item do extrato${impSummary} com o lançamento${txLabel ? `: ${txLabel}` : ` ${transactionId}`}`);
    return true;
  },

  // Baixa PARCIAL via conciliação: a linha do banco quita parte de um lançamento maior.
  // Registra a baixa (valor/data/conta do extrato) e concilia a linha; o lançamento fica
  // PARCIAL e segue disponível para conciliar as próximas parcelas.
  async reconcilePartial(importedId, transactionId) {
    const { data, error } = await supabase.rpc('reconcile_partial', {
      p_imported_id: importedId,
      p_transaction_id: transactionId
    });
    if (error) throw error;
    const impSummary = await _logImportedSummary([importedId]);
    const txLabel = await _logTransactionLabel(transactionId);
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Baixa parcial via extrato${impSummary} no lançamento${txLabel ? `: ${txLabel}` : ` ${transactionId}`}`);
    return data;
  },

  // Aplica a linha do extrato a UM lançamento (baixa = min(saldo da linha, saldo do lançamento)).
  // Cobre os dois lados: banco menor (lançamento fica parcial) e banco MAIOR (quita o lançamento
  // e a linha do banco continua com saldo p/ conciliar outros). Retorna o lançamento atualizado.
  async reconcileApply(importedId, transactionId) {
    const { data, error } = await supabase.rpc('reconcile_apply', {
      p_imported_id: importedId,
      p_transaction_id: transactionId
    });
    if (error) throw error;
    const impSummary = await _logImportedSummary([importedId]);
    const txLabel = await _logTransactionLabel(transactionId);
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Aplicou parte do extrato${impSummary} no lançamento${txLabel ? `: ${txLabel}` : ` ${transactionId}`}`);
    return data;
  },

  // Baixa VÁRIOS lançamentos com a mesma linha do extrato, na ordem dada, até esgotar o saldo.
  // Retorna quantos foram efetivamente baixados.
  async reconcileApplyMany(importedId, transactionIds) {
    const { data, error } = await supabase.rpc('reconcile_apply_many', {
      p_imported_id: importedId,
      p_transaction_ids: transactionIds
    });
    if (error) throw error;
    const impSummary = await _logImportedSummary([importedId]);
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Aplicou o extrato${impSummary} em ${data} lançamento(s) (baixa em lote).`);
    return data;
  },

  // Desconcilia um lançamento: devolve a linha do extrato para "pendente" e libera o
  // lançamento p/ edição/exclusão (não apaga o lançamento).
  async unreconcileTransaction(transactionId) {
    const { error } = await supabase.rpc('unreconcile_transaction', { p_transaction_id: transactionId });
    if (error) throw error;
    const label = await _logTransactionLabel(transactionId);
    await logAction('FINANCEIRO - CONCILIAÇÃO', `Removeu a conciliação do lançamento${label ? `: ${label}` : ` ${transactionId}`}`);
    return true;
  },

  // ==========================================
  // 5. SERVIÇOS E VENDAS (SERVICES & SALES)
  // ==========================================
  async getServices() {
    const { data, error } = await supabase
      .from('finance_services')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },

  async createService(service) {
    const { data, error } = await supabase
      .from('finance_services')
      .insert([service])
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - SERVIÇO', `Criou serviço: ${service.name}`);
    return data[0];
  },

  async updateService(id, service) {
    const { data, error } = await supabase
      .from('finance_services')
      .update(service)
      .eq('id', id)
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - SERVIÇO', `Atualizou serviço ID: ${id}`);
    return data[0];
  },

  async deleteService(id) {
    const { error } = await supabase
      .from('finance_services')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - SERVIÇO', `Excluiu serviço ID: ${id}`);
    return true;
  },

  async getServiceSales() {
    const { data, error } = await supabase
      .from('finance_service_sales')
      .select('*, finance_services(name)')
      .order('sale_date', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createServiceSale(sale) {
    const { data, error } = await supabase
      .from('finance_service_sales')
      .insert([sale])
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - VENDA', `Criou venda de serviço no valor de R$${sale.amount}`);
    return data[0];
  },

  async updateServiceSale(id, sale) {
    const { data, error } = await supabase
      .from('finance_service_sales')
      .update(sale)
      .eq('id', id)
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - VENDA', `Atualizou venda ID: ${id}`);
    return data[0];
  },

  // ==========================================
  // 5b. ORÇAMENTOS (QUOTES / VENDAS)
  // ==========================================
  async getQuotes(filters = {}) {
    let query = supabase
      .from('finance_quotes')
      .select('*, finance_parties(name, nome_fantasia, document)')
      .order('created_at', { ascending: false });
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.oportunidadeId) query = query.eq('oportunidade_id', filters.oportunidadeId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getQuoteDetails(id) {
    const { data: quote, error } = await supabase
      .from('finance_quotes')
      .select('*, finance_parties(name, nome_fantasia, document)')
      .eq('id', id)
      .single();
    if (error) throw error;
    const { data: items, error: e2 } = await supabase
      .from('finance_quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('created_at');
    if (e2) throw e2;
    return { ...quote, items: items || [] };
  },

  // Cria orçamento + itens — atômico via RPC (cabeçalho e itens na mesma transação).
  async createQuote(quote, items = []) {
    const { data, error } = await supabase.rpc('create_quote', { p_quote: quote, p_items: items });
    if (error) throw error;
    await logAction('FINANCEIRO - ORÇAMENTO', `Criou orçamento ID: ${data?.id}`);
    return data;
  },

  // Atualiza orçamento + substitui itens — atômico via RPC (delete+insert sem perder itens se falhar).
  async updateQuote(id, quote, items = []) {
    const { error } = await supabase.rpc('update_quote', { p_id: id, p_quote: quote, p_items: items });
    if (error) throw error;
    await logAction('FINANCEIRO - ORÇAMENTO', `Atualizou orçamento ID: ${id}`);
    return true;
  },

  async deleteQuote(id) {
    await excluirArquivosDoOrcamento(id).catch(() => {}); // PDFs da proposta (as linhas saem em cascata)
    const { error } = await supabase.from('finance_quotes').delete().eq('id', id);
    if (error) throw error;
    await logAction('FINANCEIRO - ORÇAMENTO', `Excluiu orçamento ID: ${id}`);
    return true;
  },

  async setQuoteStatus(id, status) {
    const { data, error } = await supabase
      .from('finance_quotes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) throw error;
    await logAction('FINANCEIRO - ORÇAMENTO', `Orçamento ID ${id} → ${status}`);
    return data[0];
  },

  // Aprova o orçamento: gera UMA conta a receber (ENTRADA pendente) e marca como APROVADO.
  // Atômico via RPC (lock + recheck de status evita aprovar/duplicar em corrida/duplo clique).
  async approveQuote(quoteId, { accountId, dueDate, categoryId = null, referenceMonth = null }) {
    const { data, error } = await supabase.rpc('approve_quote', {
      p_quote_id: quoteId,
      p_account_id: accountId,
      p_due_date: dueDate,
      p_category_id: categoryId,
      p_today: _todayISO(),
      p_reference_month: referenceMonth
    });
    if (error) throw error;
    await logAction('FINANCEIRO - ORÇAMENTO', `Aprovou orçamento ${quoteId} → conta a receber gerada`);
    return data;
  }
};
