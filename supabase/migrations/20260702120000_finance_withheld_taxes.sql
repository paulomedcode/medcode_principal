-- Impostos retidos na fonte (lucro presumido, ex.: 6,15% = IRRF 1,5 + PIS 0,65 + COFINS 3 + CSLL 1).
-- O lançamento é gravado pelo LÍQUIDO (amount = o que cai na conta → conciliação bate
-- com o extrato); o bruto da nota e a retenção ficam guardados para exibição/relatórios.
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS withheld_pct NUMERIC(7, 4),
  ADD COLUMN IF NOT EXISTS withheld_amount NUMERIC(15, 2);
