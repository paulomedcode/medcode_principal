-- Competência (mês de referência) no lançamento: a QUE mês ele se refere, independente
-- da data em que foi pago/recebido. Ex.: repasse pago em 15/04 referente a MARÇO;
-- recebimento em 10/06 referente a ABRIL. Formato 'YYYY-MM' (igual finance_repasses).
-- O "contrato" já é o centro de custo (grupo "5. Contratos"); o médico já é doctor_id.
-- Assim a Análise de Contratos pode cruzar: centro de custo (contrato) × reference_month.

alter table public.finance_transactions
  add column if not exists reference_month text;

comment on column public.finance_transactions.reference_month is
  'Competência (YYYY-MM) — mês a que o lançamento se refere, distinto de transaction_date.';
