-- Amplia os métodos de pagamento aceitos em finance_transactions.
-- Novos: DEBITO_AUTOMATICO (consórcios/recorrências debitadas em conta),
--        CARTAO_DEBITO (cartão de débito) e CHEQUE.
-- Mantém os existentes; NULL continua permitido (CHECK passa em NULL).

alter table public.finance_transactions
  drop constraint if exists finance_transactions_payment_method_check;

alter table public.finance_transactions
  add constraint finance_transactions_payment_method_check
  check (payment_method in (
    'PIX', 'BOLETO', 'TRANSFERENCIA', 'DEBITO_AUTOMATICO',
    'CARTAO', 'CARTAO_DEBITO', 'DINHEIRO', 'CHEQUE', 'OUTRO'
  ));
