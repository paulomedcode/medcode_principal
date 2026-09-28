-- Checkbox "Outros" nos Detalhes do Plantão: quando marcado, a folha de ponto
-- do plantão sai no formato simplificado (Data | Descrição | Valor) em vez da
-- tabela tradicional de ponto (Entrada/Saída/Horas).
alter table public.escala_plantoes
  add column if not exists folha_outros boolean not null default false;
