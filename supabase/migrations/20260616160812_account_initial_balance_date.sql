-- Data de referência do saldo inicial da conta. Idempotente.
alter table public.finance_accounts
  add column if not exists initial_balance_date date;
