-- Dois novos eixos do plano de contas, ortogonais ao in_result, para precisão contábil do DRE:
--
-- 1) in_cash_flow (default true) — "competência pura". Desligue para itens que entram no
--    Resultado Líquido por COMPETÊNCIA mas NÃO geram saída/entrada física de caixa.
--    Ex.: 3.7 Depreciação e Amortização (desgaste mensal dos bens do grupo 5 — equipamentos
--    médicos, móveis, informática). No DRE conta como despesa; no Fluxo de Caixa vale R$ 0,00.
--    É o oposto de in_result=false (amortização de empréstimo: sai no caixa, fora do DRE).
--
-- 2) is_profit_tax (default false) — "imposto sobre o lucro" (IRPJ/CSLL). Diferencia imposto
--    sobre o LUCRO de imposto sobre o FATURAMENTO (este fica nas deduções 2.1). No DRE a
--    categoria sai da cascata operacional e é subtraída no FINAL, logo após o Resultado/LAIR
--    (Lucro Antes dos Impostos) e imediatamente antes do Lucro Líquido. Continua no caixa.
--
-- Defaults preservam o comportamento atual de todas as categorias já cadastradas.

alter table public.finance_categories
  add column if not exists in_cash_flow boolean not null default true,
  add column if not exists is_profit_tax boolean not null default false;
