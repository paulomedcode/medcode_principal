-- ============================================================================
-- Workspace estilo Notion para o módulo "Compromisso".
--
-- Transforma o Compromisso (hoje só uma agenda em `agenda_pessoal`) num
-- workspace de páginas: conteúdo livre em blocos, hierarquia infinita e
-- databases com múltiplas visões (tabela, kanban, calendário, lista).
--
-- Princípio de "sem retrabalho": o esquema já cobre as Fases 0 a 2.
--   - Fase 0/1: páginas em árvore + editor de blocos (workspace_pages.content).
--   - Fase 2: databases (type='database') + propriedades + valores + visões.
-- Como uma LINHA de database também é uma página (parent_id = id do database),
-- toda linha pode abrir como página completa com blocos — igual ao Notion.
-- Nenhuma alteração futura de schema deve ser necessária para essas fases.
--
-- RLS: NÃO é habilitado aqui de propósito. O app acessa o banco com a anon key
-- e o RLS está desligado em todo o projeto (risco LGPD já mapeado). Habilitar
-- RLS sem políticas bloquearia o app inteiro. Quando o projeto blindar o RLS,
-- criar políticas para estas tabelas junto com as demais (ver bloco no fim).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Páginas (árvore). type='page' para documentos; type='database' para coleções.
--    Uma linha de database é uma página com parent_id apontando para o database.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."workspace_pages" (
    "id"           "uuid"  DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id"    "uuid",
    "type"         "text"  DEFAULT 'page'::"text" NOT NULL,
    "title"        "text"  DEFAULT ''::"text" NOT NULL,
    "icon"         "text",
    "cover"        "text",
    "content"      "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "categoria_id" "uuid",
    "position"     double precision DEFAULT 0 NOT NULL,
    "created_by"   "uuid",
    "created_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at"   timestamp with time zone,
    CONSTRAINT "workspace_pages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_pages_type_check" CHECK ("type" = ANY (ARRAY['page'::"text", 'database'::"text"]))
);

DO $$ BEGIN
    ALTER TABLE "public"."workspace_pages"
        ADD CONSTRAINT "workspace_pages_parent_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "public"."workspace_pages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."workspace_pages"
        ADD CONSTRAINT "workspace_pages_categoria_fkey"
        FOREIGN KEY ("categoria_id") REFERENCES "public"."agenda_categorias"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."workspace_pages"
        ADD CONSTRAINT "workspace_pages_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workspace_pages_parent_idx"  ON "public"."workspace_pages" ("parent_id");
CREATE INDEX IF NOT EXISTS "workspace_pages_type_idx"    ON "public"."workspace_pages" ("type");
CREATE INDEX IF NOT EXISTS "workspace_pages_deleted_idx" ON "public"."workspace_pages" ("deleted_at");
CREATE INDEX IF NOT EXISTS "workspace_pages_content_gin" ON "public"."workspace_pages" USING gin ("content");

-- ----------------------------------------------------------------------------
-- 2) Propriedades (colunas) de um database
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."workspace_db_properties" (
    "id"          "uuid"  DEFAULT "gen_random_uuid"() NOT NULL,
    "database_id" "uuid"  NOT NULL,
    "name"        "text"  NOT NULL,
    "type"        "text"  NOT NULL,
    "options"     "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "position"    double precision DEFAULT 0 NOT NULL,
    "created_at"  timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_db_properties_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_db_properties_type_check" CHECK ("type" = ANY (ARRAY[
        'text'::"text", 'number'::"text", 'select'::"text", 'multi_select'::"text",
        'status'::"text", 'date'::"text", 'person'::"text", 'checkbox'::"text",
        'file'::"text", 'url'::"text"
    ]))
);

DO $$ BEGIN
    ALTER TABLE "public"."workspace_db_properties"
        ADD CONSTRAINT "workspace_db_properties_database_fkey"
        FOREIGN KEY ("database_id") REFERENCES "public"."workspace_pages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workspace_db_properties_db_idx" ON "public"."workspace_db_properties" ("database_id");

-- ----------------------------------------------------------------------------
-- 3) Valores das propriedades por linha (linha = workspace_pages)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."workspace_db_values" (
    "row_id"      "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "value"       "jsonb",
    CONSTRAINT "workspace_db_values_pkey" PRIMARY KEY ("row_id", "property_id")
);

DO $$ BEGIN
    ALTER TABLE "public"."workspace_db_values"
        ADD CONSTRAINT "workspace_db_values_row_fkey"
        FOREIGN KEY ("row_id") REFERENCES "public"."workspace_pages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."workspace_db_values"
        ADD CONSTRAINT "workspace_db_values_property_fkey"
        FOREIGN KEY ("property_id") REFERENCES "public"."workspace_db_properties"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workspace_db_values_prop_idx" ON "public"."workspace_db_values" ("property_id");

-- ----------------------------------------------------------------------------
-- 4) Visões salvas de um database (tabela, board/kanban, calendário, lista)
--    config (JSONB): { visibleProps:[], sort:[], filter:[], groupBy, dateProp }
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."workspace_db_views" (
    "id"          "uuid"  DEFAULT "gen_random_uuid"() NOT NULL,
    "database_id" "uuid"  NOT NULL,
    "name"        "text"  DEFAULT 'Tabela'::"text" NOT NULL,
    "type"        "text"  NOT NULL,
    "config"      "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "position"    double precision DEFAULT 0 NOT NULL,
    "created_at"  timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_db_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_db_views_type_check" CHECK ("type" = ANY (ARRAY[
        'table'::"text", 'board'::"text", 'calendar'::"text", 'list'::"text"
    ]))
);

DO $$ BEGIN
    ALTER TABLE "public"."workspace_db_views"
        ADD CONSTRAINT "workspace_db_views_database_fkey"
        FOREIGN KEY ("database_id") REFERENCES "public"."workspace_pages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "workspace_db_views_db_idx" ON "public"."workspace_db_views" ("database_id");

-- ----------------------------------------------------------------------------
-- 5) updated_at automático ao editar uma página (autosave do editor)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."tg_workspace_pages_touch"()
RETURNS "trigger" LANGUAGE "plpgsql" AS $$
BEGIN
    NEW."updated_at" = "now"();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "workspace_pages_touch" ON "public"."workspace_pages";
CREATE TRIGGER "workspace_pages_touch"
    BEFORE UPDATE ON "public"."workspace_pages"
    FOR EACH ROW EXECUTE FUNCTION "public"."tg_workspace_pages_touch"();

-- ============================================================================
-- QUANDO BLINDAR O RLS (LGPD): habilitar e criar políticas para estas 4 tabelas.
-- Esboço (NÃO aplicar enquanto o app usar a anon key sem sessão):
--
--   ALTER TABLE "public"."workspace_pages"         ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE "public"."workspace_db_properties" ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE "public"."workspace_db_values"     ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE "public"."workspace_db_views"      ENABLE ROW LEVEL SECURITY;
--   -- + policies por categoria_id / created_by, espelhando a regra de
--   --   visibilidade já usada em agenda_pessoal (categoria/autor/usuário).
-- ============================================================================
