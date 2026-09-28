-- Categorias "fora do resultado" do DRE: itens não-operacionais / de balanço.
-- Ex.: Amortização de Empréstimo = quitação de passivo (principal), NÃO é despesa de
-- resultado. Com in_result=false a categoria fica fora do cálculo do Resultado Líquido,
-- mas continua no fluxo de caixa e aparece numa seção informativa do DRE.
-- Default true → comportamento atual de todas as categorias existentes não muda.
alter table public.finance_categories
  add column if not exists in_result boolean not null default true;
