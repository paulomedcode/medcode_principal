-- Limite de cheque especial por conta: o saldo real continua em current_balance;
-- a UI exibe também o disponível (saldo + limite). Idempotente.
alter table public.finance_accounts
  add column if not exists overdraft_limit numeric not null default 0;
