-- FASE 1 — Amarração regra financeira ↔ plantão.
--
-- Hoje o vínculo entre o plantão e a regra de valor é feito por casamento de
-- TEXTO do nome do período (find(regra.name === 'Noturno')) no modal Editar
-- Plantão. Por isso regras como "Noturno Sobreaviso" nunca
-- são oferecidas: o código só procura algo chamado literalmente "Noturno".
--
-- Passamos a gravar QUAL regra foi escolhida em cada plantão:
--   rule_id     = id da regra financeira (settings.escala -> financialRules[].id)
--                 selecionada no dropdown do plantão. NULL = plantão antigo /
--                 valor digitado à mão (o front mantém o fallback por nome).
--   base_locked = true quando o Valor Base veio travado de uma regra (não pode
--                 ser editado à mão; ajustes vão para financial_extra).
--
-- Colunas nulas/aditivas: linhas antigas ficam rule_id NULL e base_locked false,
-- sem regressão. O backfill retroativo (>= 2026-06) é feito em migration própria
-- depois de validar o dry-run.

ALTER TABLE public.escala_plantoes
    ADD COLUMN IF NOT EXISTS "rule_id"     text,
    ADD COLUMN IF NOT EXISTS "base_locked" boolean NOT NULL DEFAULT false;
