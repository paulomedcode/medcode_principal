-- Migration: Add 'LANCADO' (Lançada para Pagamento) to finance_transactions.status
alter table public.finance_transactions drop constraint if exists finance_transactions_status_check;
alter table public.finance_transactions add constraint finance_transactions_status_check
  check (status in ('PENDENTE', 'PARCIAL', 'PAGO', 'LANCADO'));
