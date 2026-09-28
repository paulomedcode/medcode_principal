-- Persiste o período e o horário escolhidos em cada plantão da escala.
--
-- Causa do bug: o modal "Editar Plantão" permite escolher Período
-- (Diurno/Noturno/Manhã/Tarde) e Horário, mas a tabela escala_plantoes NÃO tinha
-- colunas para isso. O salvamento (upsert) nunca enviava period/time e o
-- carregamento nunca os lia de volta. Ao recarregar a página, o período era
-- RE-DERIVADO do nome do setor via getNormalizedPeriod(), que cai no fallback
-- "Diurno" sempre que o setor não contém "manhã"/"tarde"/"noturno". Por isso
-- Manhã (07-13h) e Tarde (13-19h) voltavam para Diurno (07-19h).
--
-- Linhas antigas ficam com period/time NULL; o front-end mantém o fallback de
-- derivar do setor nesses casos, então não há regressão para escalas já gravadas.

ALTER TABLE public.escala_plantoes
    ADD COLUMN IF NOT EXISTS "period" text,
    ADD COLUMN IF NOT EXISTS "time"   text;
