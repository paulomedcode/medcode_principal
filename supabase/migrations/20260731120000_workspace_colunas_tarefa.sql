-- ============================================================================
-- Compromisso — colunas de tarefa (tipo 'time', Data Criação e Expectativa).
--
-- O que muda, e por quê:
--   1) Novo tipo de propriedade 'time'. "Hora" nasceu como texto livre, então
--      cada um digitava de um jeito ("8h", "08:00", "8:00") e nada ordenava
--      direito. Com 'time' o campo vira seletor de hora de verdade.
--   2) "Data" passa a se chamar "Data Criação" — é a data em que a tarefa
--      entrou, não o prazo dela.
--   3) Nasce "Expectativa de conclusão" (data), que é o prazo de fato. Fica
--      logo antes da Hora, para as duas serem lidas juntas.
--   4) Calendários que apontavam para a data de criação passam a apontar para a
--      expectativa: um calendário de tarefas é sobre prazo, não sobre cadastro.
--
-- Idempotente: só mexe no que ainda está no formato antigo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Libera 'time' (e 'formula', reservado) no CHECK de tipos.
-- ----------------------------------------------------------------------------
ALTER TABLE "public"."workspace_db_properties"
    DROP CONSTRAINT IF EXISTS "workspace_db_properties_type_check";

ALTER TABLE "public"."workspace_db_properties"
    ADD CONSTRAINT "workspace_db_properties_type_check" CHECK ("type" = ANY (ARRAY[
        'text'::"text", 'number'::"text", 'select'::"text", 'multi_select'::"text",
        'status'::"text", 'date'::"text", 'time'::"text", 'person'::"text",
        'checkbox'::"text", 'file'::"text", 'url'::"text"
    ]));

-- ----------------------------------------------------------------------------
-- 2) "Data" -> "Data Criação" (só nos databases que têm a cara de agenda:
--    uma coluna Data e uma coluna Hora).
-- ----------------------------------------------------------------------------
UPDATE "public"."workspace_db_properties" p
   SET "name" = 'Data Criação'
 WHERE p."name" = 'Data'
   AND p."type" = 'date'
   AND EXISTS (
        SELECT 1 FROM "public"."workspace_db_properties" h
         WHERE h."database_id" = p."database_id" AND lower(h."name") = 'hora'
   );

-- ----------------------------------------------------------------------------
-- 3) "Hora" de texto vira 'time'. Os valores já gravados são strings JSON
--    ("08:00") — o formato bate com o input de hora, então nada a converter.
--    Só zera o que não é HH:MM (ex.: "manhã"), que o campo novo não aceitaria.
-- ----------------------------------------------------------------------------
UPDATE "public"."workspace_db_values" v
   SET "value" = NULL
  FROM "public"."workspace_db_properties" p
 WHERE v."property_id" = p."id"
   AND p."type" = 'text'
   AND lower(p."name") = 'hora'
   AND v."value" IS NOT NULL
   AND jsonb_typeof(v."value") = 'string'
   AND (v."value" #>> '{}') !~ '^[0-2][0-9]:[0-5][0-9]';

UPDATE "public"."workspace_db_values" v
   SET "value" = to_jsonb(substring(v."value" #>> '{}' from 1 for 5))
  FROM "public"."workspace_db_properties" p
 WHERE v."property_id" = p."id"
   AND p."type" = 'text'
   AND lower(p."name") = 'hora'
   AND v."value" IS NOT NULL
   AND jsonb_typeof(v."value") = 'string'
   AND length(v."value" #>> '{}') > 5;

UPDATE "public"."workspace_db_properties"
   SET "type" = 'time'
 WHERE "type" = 'text' AND lower("name") = 'hora';

-- ----------------------------------------------------------------------------
-- 4) Cria "Expectativa de conclusão" onde ainda não existe, posicionada logo
--    antes da Hora (position da Hora - 0.5; a coluna é double precision, então
--    não precisa renumerar nada).
-- ----------------------------------------------------------------------------
INSERT INTO "public"."workspace_db_properties" ("database_id", "name", "type", "options", "position")
SELECT h."database_id", 'Expectativa de conclusão', 'date', '[]'::jsonb, h."position" - 0.5
  FROM "public"."workspace_db_properties" h
 WHERE h."type" = 'time'
   AND lower(h."name") = 'hora'
   AND NOT EXISTS (
        SELECT 1 FROM "public"."workspace_db_properties" e
         WHERE e."database_id" = h."database_id"
           AND lower(e."name") = 'expectativa de conclusão'
   );

-- Tarefas que já existiam guardavam em "Data" a data em que a coisa aconteceria
-- — ou seja, o prazo. Copia esses valores para a coluna nova para ninguém abrir
-- o sistema e achar que perdeu as datas.
INSERT INTO "public"."workspace_db_values" ("row_id", "property_id", "value")
SELECT v."row_id", exp."id", v."value"
  FROM "public"."workspace_db_values" v
  JOIN "public"."workspace_db_properties" cri ON cri."id" = v."property_id"
  JOIN "public"."workspace_db_properties" exp
    ON exp."database_id" = cri."database_id"
   AND exp."name" = 'Expectativa de conclusão'
 WHERE cri."name" = 'Data Criação'
   AND v."value" IS NOT NULL
ON CONFLICT ("row_id", "property_id") DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5) Calendário: quem apontava para a data de criação passa a apontar para a
--    expectativa de conclusão. Quem já estava em outra coluna fica como está.
-- ----------------------------------------------------------------------------
UPDATE "public"."workspace_db_views" v
   SET "config" = jsonb_set(v."config", '{dateProp}', to_jsonb(exp."id"::text))
  FROM "public"."workspace_db_properties" cri,
       "public"."workspace_db_properties" exp
 WHERE v."type" = 'calendar'
   AND cri."database_id" = v."database_id"
   AND cri."name" = 'Data Criação'
   AND exp."database_id" = v."database_id"
   AND exp."name" = 'Expectativa de conclusão'
   AND v."config" ->> 'dateProp' = cri."id"::text;
