-- Assinatura desenhada na tela, além do clique+hash+IP já registrado.
--
-- O médico desenha a assinatura (mouse/dedo) num canvas na hora de confirmar;
-- o traço vira PNG (data URL) e aparece no PDF da folha, acima do carimbo
-- "Assinado eletronicamente". Não substitui a prova de autoria (que continua
-- sendo hash+IP+timestamp) — é só o traço visual sobre ela.

ALTER TABLE "public"."folha_assinaturas"
    ADD COLUMN IF NOT EXISTS "signature_image" text;

COMMENT ON COLUMN "public"."folha_assinaturas"."signature_image" IS 'PNG (data URL) do traço desenhado pelo médico no canvas ao confirmar a assinatura.';
