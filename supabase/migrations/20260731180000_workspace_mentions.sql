-- ============================================================================
-- Compromisso — menções (@fulano) nas observações e nas páginas.
--
-- A menção em si mora dentro do `content` da página (é um nó do editor, com o
-- `userId` cravado). Esta tabela existe para a OUTRA metade: a pessoa marcada
-- precisa ficar sabendo. Varrer o `content` de todas as páginas atrás de um id
-- a cada varredura do sino seria caro e frágil; uma linha por menção é barata
-- de gravar e trivial de ler.
--
-- `lida_em` é por pessoa e por menção: abrir o sino marca as que estavam ali.
-- Sem RLS, seguindo o resto das tabelas do workspace neste banco.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."workspace_mentions" (
    "id"        "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id"   "uuid" NOT NULL,
    "user_id"   "uuid" NOT NULL,
    "autor_id"  "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lida_em"   timestamp with time zone,
    CONSTRAINT "workspace_mentions_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "public"."workspace_mentions"
        ADD CONSTRAINT "workspace_mentions_page_fkey"
        FOREIGN KEY ("page_id") REFERENCES "public"."workspace_pages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."workspace_mentions"
        ADD CONSTRAINT "workspace_mentions_user_fkey"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."workspace_mentions"
        ADD CONSTRAINT "workspace_mentions_autor_fkey"
        FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O sino pergunta sempre a mesma coisa: "o que ainda não li?".
CREATE INDEX IF NOT EXISTS "workspace_mentions_pendentes_idx"
    ON "public"."workspace_mentions" ("user_id", "lida_em");
