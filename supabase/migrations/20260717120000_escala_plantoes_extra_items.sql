-- "Mais Opções" no lançamento do plantão: linhas extras de valores no mesmo dia.
-- Cada item do array: { descricao, receber, repMode: 'pct'|'manual', repPct, repValor }
-- (repasse calculado = receber * repPct/100 quando repMode='pct', senão repValor).
-- Guardado como JSONB no próprio plantão, mesmo padrão da coluna appearance.
alter table public.escala_plantoes
  add column if not exists extra_items jsonb not null default '[]'::jsonb;
