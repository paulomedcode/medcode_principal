-- Identidade institucional por unidade + convênio na APA.
--
-- O cabeçalho da Requisição de Transfusão vinha de config/hospitalIdentity.js,
-- que resolve a identidade pelo ref do Supabase — ou seja, UMA identidade para o
-- deploy inteiro. Só que um deploy atende várias unidades, e cada uma precisa
-- sair com o próprio papel timbrado.
--
-- Agora cada unidade guarda a própria identidade e o documento lê a unidade
-- gravada na APA. Unidade sem esses dados sai só com o nome, sem inventar nada.
--
-- O convênio não existe no cadastro do paciente (só em surgeries/consultas), e
-- a requisição precisa dele — então virou campo da própria APA, com SUS como
-- padrão, alimentado pela lista de convênios de settings.general.

ALTER TABLE "public"."unidades"
    ADD COLUMN IF NOT EXISTS "razao_social" text,
    ADD COLUMN IF NOT EXISTS "endereco"     text,
    ADD COLUMN IF NOT EXISTS "cidade"       text,
    ADD COLUMN IF NOT EXISTS "cnpj"         text,
    ADD COLUMN IF NOT EXISTS "logo_url"     text;

COMMENT ON COLUMN "public"."unidades"."razao_social" IS 'Razão social impressa no cabeçalho dos documentos; vazio = usa o nome da unidade';
COMMENT ON COLUMN "public"."unidades"."cidade"       IS 'Cidade usada no fecho dos documentos ("São Paulo, 01 de setembro de 2026")';
COMMENT ON COLUMN "public"."unidades"."logo_url"     IS 'Logo do hospital no cabeçalho (bucket logos)';

-- nome_mae vem do cadastro do paciente (pacientes.nomeMae) e é carimbado na
-- APA no momento em que o paciente é selecionado, junto com nome/CPF/peso.
ALTER TABLE "public"."apas"
    ADD COLUMN IF NOT EXISTS "convenio" text,
    ADD COLUMN IF NOT EXISTS "nome_mae" text;
