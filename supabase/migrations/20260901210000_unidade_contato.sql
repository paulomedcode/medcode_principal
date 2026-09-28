-- Linha de contato no timbre da unidade.
--
-- O formulário oficial de requisição de transfusão traz, abaixo do endereço,
-- uma linha com telefone/CNPJ/inscrição e outra com o e-mail. O cadastro da
-- unidade guardava razão social, endereço e CNPJ, mas não tinha onde pôr
-- telefone e e-mail — e a folha saía sem eles.

ALTER TABLE "public"."unidades"
    ADD COLUMN IF NOT EXISTS "contato" text;

COMMENT ON COLUMN "public"."unidades"."contato" IS 'Telefone/e-mail impressos no timbre, abaixo do CNPJ';
