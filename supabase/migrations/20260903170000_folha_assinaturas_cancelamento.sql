-- Cancelamento de uma assinatura já dada.
--
-- Às vezes a folha assinada precisa ser corrigida (plantão errado, valor
-- errado) depois que o médico já assinou. Cancelar não apaga a linha nem os
-- dados de quem assinou — só muda o status para 'invalidado' (valor que já
-- existia no CHECK da tabela, reservado desde a criação) e registra quem
-- cancelou e quando, preservando o histórico de que aquela folha FOI assinada
-- antes de ser cancelada. Depois de cancelada, o botão "Enviar p/ Assinatura"
-- volta a aparecer pro admin (o mesmo caminho de reenvio que já existia para
-- folhas pendentes) e gera uma pendência nova pro médico assinar de novo.

ALTER TABLE "public"."folha_assinaturas"
    ADD COLUMN IF NOT EXISTS "cancelled_by" "uuid",
    ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;

DO $$ BEGIN
    ALTER TABLE "public"."folha_assinaturas"
        ADD CONSTRAINT "folha_assinaturas_cancelled_by_fkey"
        FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
