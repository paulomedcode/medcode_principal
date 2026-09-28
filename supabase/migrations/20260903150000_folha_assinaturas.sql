-- ============================================================================
-- Assinatura eletrônica simples da Folha de Ponto.
--
-- Até aqui a folha era só HTML impresso (window.print()) com uma linha em
-- branco pra assinar a caneta. Esta tabela guarda o "documento assinado":
-- o admin manda uma folha (médico + hospital + mês) pra assinatura, o
-- médico confirma dentro da plataforma e isso fica registrado com o hash do
-- conteúdo exibido, quem pediu, quem assinou, quando e de que IP.
--
-- Não é certificado digital (ICP-Brasil) — é assinatura eletrônica simples
-- (Lei 14.063/2020), suficiente pra controle interno de ponto. `content_hash`
-- é o que garante que a folha assinada é a mesma que foi exibida: se algum
-- plantão do conjunto mudar depois do envio, o hash recalculado não bate mais
-- e a assinatura precisa ser reenviada (sem job de verificação periódica).
--
-- Uma linha por (médico, hospital, mês) — reenviar (upsert) atualiza o hash e
-- volta pro status 'pendente'. Sem RLS, seguindo o resto do schema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."folha_assinaturas" (
    "id"              "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id"       "uuid",
    "doctor_name"     text NOT NULL,
    "hospital_name"   text NOT NULL,
    "month_val"       text NOT NULL,
    "assignment_ids"  text[] NOT NULL DEFAULT '{}',
    "content_hash"    text NOT NULL,
    "status"          text NOT NULL DEFAULT 'pendente',
    "requested_by"    "uuid",
    "requested_at"    timestamp with time zone DEFAULT "now"() NOT NULL,
    "signed_by"       "uuid",
    "signed_at"       timestamp with time zone,
    "ip_address"      text,
    "user_agent"      text,
    "updated_at"      timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "folha_assinaturas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "folha_assinaturas_status_check" CHECK ("status" IN ('pendente', 'assinado', 'invalidado')),
    CONSTRAINT "folha_assinaturas_unica" UNIQUE ("doctor_name", "hospital_name", "month_val")
);

DO $$ BEGIN
    ALTER TABLE "public"."folha_assinaturas"
        ADD CONSTRAINT "folha_assinaturas_doctor_fkey"
        FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."folha_assinaturas"
        ADD CONSTRAINT "folha_assinaturas_requested_by_fkey"
        FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."folha_assinaturas"
        ADD CONSTRAINT "folha_assinaturas_signed_by_fkey"
        FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O widget de pendências pergunta sempre a mesma coisa: "o que este médico
-- ainda não assinou?".
CREATE INDEX IF NOT EXISTS "folha_assinaturas_pendentes_idx"
    ON "public"."folha_assinaturas" ("doctor_name", "status");

COMMENT ON COLUMN "public"."folha_assinaturas"."content_hash" IS 'SHA-256 (hex) do conteúdo exibido no momento do envio: assignment_ids + data/horário/valor de cada plantão + mês + hospital + médico.';
COMMENT ON COLUMN "public"."folha_assinaturas"."status" IS 'pendente = aguardando o médico; assinado = confirmado; invalidado = reservado para uso futuro (não usado no fluxo atual).';
