// Fonte única dos métodos de pagamento do financeiro.
// Os valores (1ª coluna) devem espelhar o CHECK de finance_transactions.payment_method
// (ver migration 20260628180000_finance_payment_methods_expand.sql).
export const PAYMENT_METHODS = [
  ['PIX', 'PIX'],
  ['BOLETO', 'Boleto'],
  ['TRANSFERENCIA', 'TED/DOC/Transf.'],
  ['DEBITO_AUTOMATICO', 'Débito Automático'],   // consórcios, recorrências debitadas em conta
  ['CARTAO', 'Cartão de Crédito'],
  ['CARTAO_DEBITO', 'Cartão de Débito'],
  ['DINHEIRO', 'Dinheiro'],
  ['CHEQUE', 'Cheque'],
  ['OUTRO', 'Outro'],
];

// Rótulo amigável de um valor de método (fallback para o próprio valor).
export const paymentMethodLabel = (v) => (PAYMENT_METHODS.find(([k]) => k === v) || [null, v || '—'])[1];
