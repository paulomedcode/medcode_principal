-- Financeiro: cadastro de pagadores/fornecedores (contrapartes) + vencimento nos lançamentos
-- Idempotente: seguro para reexecução pelo workflow db-migrate.

-- 1. Contrapartes: quem nos paga (CLIENTE) e quem pagamos (FORNECEDOR).
create table if not exists public.finance_parties (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'AMBOS' check (kind in ('CLIENTE', 'FORNECEDOR', 'AMBOS')),
  document    text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_finance_parties_kind on public.finance_parties(kind);

-- 2. Vincular lançamentos a uma contraparte e dar vencimento às contas a pagar/receber.
alter table public.finance_transactions
  add column if not exists party_id uuid references public.finance_parties(id) on delete set null,
  add column if not exists due_date date;

create index if not exists idx_transactions_party on public.finance_transactions(party_id);
create index if not exists idx_transactions_due_date on public.finance_transactions(due_date);
