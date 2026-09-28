-- Centro de custo: dimensão transversal HIERÁRQUICA, OBRIGATÓRIA em todo lançamento
-- (entradas e saídas). Coordenado com o Nº Doc/NF (#3) na mesma leva.
--
-- Estratégia p/ "obrigatório já" sem quebrar dados existentes:
--   - Centro "Geral" com UUID FIXO.
--   - finance_transactions.cost_center_id NOT NULL DEFAULT <Geral> → todos os
--     lançamentos atuais e qualquer caminho que esqueça de setar caem em "Geral".

create table if not exists public.finance_cost_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,                 -- sigla curta opcional (ex.: CC-ADM)
  color text default '#64748b',
  parent_id uuid references public.finance_cost_centers(id) on delete restrict, -- não exclui pai com filhos
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now())
);

-- Centro "Geral" (UUID fixo) — default e rede de segurança.
insert into public.finance_cost_centers (id, name, code)
values ('30000000-0000-0000-0000-000000000001', 'Geral', 'GERAL')
on conflict (id) do nothing;

-- Dimensão obrigatória nas transações + Nº Doc/NF.
-- A DEFAULT constante faz o backfill dos registros existentes (fast default, sem rewrite).
alter table public.finance_transactions
  add column if not exists cost_center_id uuid not null default '30000000-0000-0000-0000-000000000001'
    references public.finance_cost_centers(id),
  add column if not exists doc_number text;

-- Origem herda o centro de custo (nullable): instâncias geradas usam o da origem.
alter table public.finance_recurrences add column if not exists cost_center_id uuid references public.finance_cost_centers(id);
alter table public.finance_quotes      add column if not exists cost_center_id uuid references public.finance_cost_centers(id);
alter table public.finance_repasses    add column if not exists cost_center_id uuid references public.finance_cost_centers(id);

create index if not exists idx_transactions_cost_center on public.finance_transactions(cost_center_id);
create index if not exists idx_cost_centers_active on public.finance_cost_centers(is_active);
create index if not exists idx_cost_centers_parent on public.finance_cost_centers(parent_id);
