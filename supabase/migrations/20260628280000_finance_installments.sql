-- Parcelamento: contas a pagar/receber divididas em N parcelas com numeração X/Y.
-- Cada parcela é uma finance_transaction própria (vencimento mensal escalonado),
-- ligadas por installment_group_id. Diferente de "conta fixa" (recorrência perpétua)
-- e de "rateio" (split de categorias do mesmo lançamento).
alter table public.finance_transactions
  add column if not exists installment_number integer,       -- 3 (a 3ª parcela)
  add column if not exists installment_total integer,        -- 10 (de 10)
  add column if not exists installment_group_id uuid;        -- agrupa as parcelas

create index if not exists idx_transactions_installment_group on public.finance_transactions(installment_group_id);
