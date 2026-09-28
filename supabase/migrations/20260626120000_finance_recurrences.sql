-- Conta fixa / lançamento recorrente.
-- Modelo: uma "regra" de recorrência (finance_recurrences) separada das instâncias.
-- Cada ocorrência gerada continua sendo uma linha normal em finance_transactions,
-- apenas vinculada à regra via recurrence_id. Assim ledger, conciliação, saldo
-- (trigger) e os cards seguem funcionando sem alteração.

create table if not exists public.finance_recurrences (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ENTRADA', 'SAIDA')),
  account_id uuid not null references public.finance_accounts(id) on delete cascade,
  category_id uuid references public.finance_categories(id) on delete set null,
  party_id uuid references public.finance_parties(id) on delete set null,
  doctor_id uuid references public.users(id) on delete set null,
  amount numeric(15, 2) not null check (amount > 0),
  description text not null,
  payment_method text,
  frequency text not null check (frequency in ('SEMANAL', 'MENSAL', 'ANUAL')),
  start_date date not null,
  end_date date,                 -- null = sem fim (recorrência perpétua)
  materialized_until date,       -- até onde já geramos ocorrências (controla o top-up)
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now())
);

-- Vínculo da ocorrência gerada com a regra que a originou.
alter table public.finance_transactions
  add column if not exists recurrence_id uuid references public.finance_recurrences(id) on delete set null;

create index if not exists idx_transactions_recurrence on public.finance_transactions(recurrence_id);
create index if not exists idx_recurrences_active on public.finance_recurrences(is_active);
