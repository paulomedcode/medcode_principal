-- Requisição de Transfusão dentro da APA.
--
-- Até aqui, marcar "Reserva de Hemoderivados = Sim" no Plano Anestésico só
-- abria três quantidades (CH, PFC, Plaquetas) e um campo livre de "outros".
-- A requisição que o banco de sangue exige (RDC 57/2010 - ANVISA) pede muito
-- mais: indicação, histórico transfusional, reação prévia, gestações,
-- urgência, hemocomponentes discriminados e procedimentos especiais.
--
-- Estas colunas guardam essas respostas para que a folha anexa
-- "Requisição de Transfusão" (impressa junto com a APA e o termo) saia
-- preenchida e o que foi solicitado fique registrado no prontuário.
--
-- Reaproveitados do que já existia: plan_hemo_ch (CH), plan_hemo_plaq (CP),
-- plan_hemo_pfc (PFC) e plan_hemo_outros (descrição de "outros").
--
-- Campos da requisição oficial que o sistema ainda não coleta (RG, nome da
-- mãe, clínica/leito, convênio, diagnóstico clínico e fibrinogênio) saem como
-- linha em branco no papel, para preenchimento à mão.

ALTER TABLE "public"."apas"
    ADD COLUMN IF NOT EXISTS "plan_hemo_indicacao"      text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_transf_previa"  text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_reacao"         text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_reacao_qual"    text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_ultima_transf"  text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_gestacoes"      text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_gestacoes_qtd"  text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_tipo"           text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_prog_data"      text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_prog_hora"      text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_crio"           text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_outros_qtd"     text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_esp"            jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "plan_hemo_esp_just"       text,
    ADD COLUMN IF NOT EXISTS "plan_hemo_obs"            text;

COMMENT ON COLUMN "public"."apas"."plan_hemo_tipo" IS 'Programada | Não urgente (até 24h) | Urgente (até 3h) | Extrema urgência';
COMMENT ON COLUMN "public"."apas"."plan_hemo_esp"  IS 'Procedimentos especiais: array com Filtrado | Irradiado | Lavado | Fenotipado';
