-- Financeiro: serviços ativos/inativos + ordenação manual das categorias do DRE
-- Idempotente: seguro para reexecução pelo workflow db-migrate.

-- 1. Serviços podem ser marcados como ativos/inativos (sem perder histórico de vendas).
alter table public.finance_services
  add column if not exists is_active boolean not null default true;

create index if not exists idx_finance_services_active on public.finance_services(is_active);

-- 2. Ordenação manual das categorias do DRE (arrastar/reordenar). Menor = aparece primeiro.
alter table public.finance_categories
  add column if not exists position integer not null default 0;

-- Inicializa a posição das categorias existentes seguindo a ordem alfabética atual,
-- reiniciando a numeração dentro de cada grupo (mesma categoria pai / mesmo tipo).
with ranked as (
  select id,
         row_number() over (
           partition by coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), type
           order by name
         ) as rn
  from public.finance_categories
)
update public.finance_categories c
set position = ranked.rn
from ranked
where ranked.id = c.id
  and c.position = 0;
