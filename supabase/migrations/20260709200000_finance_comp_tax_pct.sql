-- Imposto complementar sobre o faturamento, escolhido no PRÓPRIO lançamento de receita.
-- Percentual sobre o BRUTO da nota, pago depois via DARF (não é retido na fonte):
--   2,08 → padrão (par da retenção de 6,15%)
--   2,38 → AME (par da retenção de 5,85%)
--   8,23 → sem retenção na fonte (paga tudo depois)  [6,15+2,08 = 5,85+2,38 = 8,23]
--   0    → explicitamente sem imposto complementar
--   NULL → lançamento antigo, sem escolha: o DRE aplica a regra padrão (2,08 / AME 2,38)
alter table finance_transactions
  add column if not exists comp_tax_pct numeric(6, 2);

comment on column finance_transactions.comp_tax_pct is
  'Imposto complementar (% sobre gross_amount) pago depois via DARF; provisionado no DRE. NULL = regra padrão.';
