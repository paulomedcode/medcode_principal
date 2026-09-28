-- Vendas: Orçamentos (quotes) com itens. Aprovar gera uma conta a receber (finance_transactions).
-- Idempotente.

create table if not exists public.finance_quotes (
  id            uuid primary key default gen_random_uuid(),
  party_id      uuid references public.finance_parties(id) on delete set null,
  title         text,
  issue_date    date default current_date,
  valid_until   date,
  total_amount  numeric(15,2) not null default 0,
  status        text not null default 'PENDENTE' check (status in ('PENDENTE', 'APROVADO', 'RECUSADO')),
  notes         text,
  transaction_id uuid references public.finance_transactions(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_finance_quotes_status on public.finance_quotes(status);
create index if not exists idx_finance_quotes_party on public.finance_quotes(party_id);

create table if not exists public.finance_quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.finance_quotes(id) on delete cascade,
  service_id  uuid references public.finance_services(id) on delete set null,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(15,2) not null default 0,
  amount      numeric(15,2) not null default 0,
  created_at  timestamptz default now()
);

create index if not exists idx_finance_quote_items_quote on public.finance_quote_items(quote_id);
