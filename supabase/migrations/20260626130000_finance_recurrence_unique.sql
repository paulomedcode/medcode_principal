-- Idempotência do top-up de contas fixas: impede ocorrências duplicadas da MESMA série
-- na MESMA data (recurrence_id, transaction_date). Permite o upsert(onConflict) do
-- financeService.materializeRecurrences/createRecurrence ser realmente idempotente,
-- mesmo com loads/abas concorrentes.
--
-- Índice NÃO-parcial de propósito: no Postgres NULLs são distintos num unique index,
-- então transações comuns (recurrence_id IS NULL) NÃO são restringidas — várias podem
-- existir na mesma transaction_date.
create unique index if not exists finance_transactions_recurrence_date_key
  on public.finance_transactions (recurrence_id, transaction_date);
