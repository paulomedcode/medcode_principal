-- ============================================================================
-- O documento que o médico assinou, congelado.
--
-- Até aqui a assinatura guardava o HASH do conteúdo e a lista de plantões. Isso
-- prova que algo mudou depois — e é ótimo para bloquear o envio ao financeiro —
-- mas não permite mostrar de novo o que ele viu na hora de assinar. Quando um
-- plantão da folha era alterado ou excluído, o documento simplesmente deixava de
-- existir: a folha era remontada a partir da escala de HOJE. Aconteceu de
-- verdade (folha assinada de agosto apontando para um plantão excluído depois:
-- o PDF saía com o carimbo de assinatura e nenhuma linha).
--
-- Agora a assinatura guarda o CONTEÚDO. `signed_snapshot` é o conjunto exato de
-- plantões que foi exibido e que gerou o hash: mesmos dias, mesmos horários,
-- mesmos valores, mesmos pagamentos à vista. A folha assinada passa a ser
-- reimpressa a partir dele, nunca da escala corrente. O médico vê para sempre o
-- que assinou, mesmo que a escala mude depois.
--
-- O hash continua existindo e continua sendo o guarda do dinheiro: é ele que
-- impede enviar ao financeiro uma folha cuja escala mudou. Os dois se completam
-- — o hash detecta divergência, o snapshot preserva o original.
--
-- Folhas assinadas antes desta migration ficam com snapshot nulo; para elas o
-- sistema segue remontando pela escala, como antes. Não há como inventar
-- retroativamente o que já não foi guardado.
-- ============================================================================

ALTER TABLE "public"."folha_assinaturas"
    ADD COLUMN IF NOT EXISTS "signed_snapshot" "jsonb";

COMMENT ON COLUMN "public"."folha_assinaturas"."signed_snapshot" IS 'Conteúdo exato da folha no momento da assinatura (plantões com data, horário, valor e pagamento à vista). É a fonte da folha assinada em qualquer reimpressão — nunca a escala atual.';

-- A função do médico passa a devolver o snapshot: é dele que a tela e o PDF
-- montam a folha assinada.
DROP FUNCTION IF EXISTS "public"."meus_repasses"();

CREATE FUNCTION "public"."meus_repasses"()
RETURNS TABLE (
    "folha_id"          "uuid",
    "hospital_name"     text,
    "month_val"         text,
    "assignment_ids"    text[],
    "content_hash"      text,
    "signature_image"   text,
    "signed_at"         timestamp with time zone,
    "ip_address"        text,
    "doctor_name"       text,
    "signed_snapshot"   "jsonb",
    "valor"             numeric,
    "pagamento"         text,
    "due_date"          "date",
    "paid_amount"       numeric,
    "pago_em"           "date"
)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    WITH eu AS (
        SELECT "id", "name"
        FROM "public"."users"
        WHERE lower("email") = lower("auth"."jwt"() ->> 'email')
        LIMIT 1
    )
    SELECT
        f."id",
        f."hospital_name",
        f."month_val",
        f."assignment_ids",
        f."content_hash",
        f."signature_image",
        f."signed_at",
        f."ip_address",
        f."doctor_name",
        f."signed_snapshot",
        t."amount",
        CASE WHEN t."id" IS NULL THEN 'EM_PROCESSAMENTO' ELSE t."status" END,
        t."due_date",
        t."paid_amount",
        (SELECT max(p."payment_date")
           FROM "public"."finance_transaction_payments" p
          WHERE p."transaction_id" = t."id")
    FROM "public"."folha_assinaturas" f
    CROSS JOIN eu
    LEFT JOIN "public"."finance_transactions" t ON t."id" = f."transaction_id"
    WHERE f."status" = 'assinado'
      AND (f."doctor_id" = eu."id" OR lower(f."doctor_name") = lower(eu."name"))
    ORDER BY f."month_val" DESC, f."hospital_name";
$$;

REVOKE ALL ON FUNCTION "public"."meus_repasses"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."meus_repasses"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."meus_repasses"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."meus_repasses"() TO "service_role";

COMMENT ON FUNCTION "public"."meus_repasses"() IS 'Folhas de ponto assinadas do médico logado (resolvido pelo e-mail do JWT), com o conteúdo assinado (signed_snapshot) e o status de pagamento do lançamento vinculado. SECURITY DEFINER de propósito: é o que garante que a tela do médico enxergue só as linhas dele, sem abrir finance_transactions.';
