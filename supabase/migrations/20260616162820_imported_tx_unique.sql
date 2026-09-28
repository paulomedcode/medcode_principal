-- Conciliação: índice único exigido pelo upsert ON CONFLICT (fitid, account_id). Idempotente.
create unique index if not exists finance_imported_transactions_fitid_account_key
  on public.finance_imported_transactions (fitid, account_id);
