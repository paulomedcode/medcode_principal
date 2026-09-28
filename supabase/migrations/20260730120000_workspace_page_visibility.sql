-- ============================================================================
-- Visibilidade por página do Compromisso (workspace).
--
-- Substitui o modelo antigo de "uma categoria por página" (workspace_pages.
-- categoria_id) por um conjunto flexível em JSONB, permitindo:
--   • {"scope":"all"}                          → toda a equipe (padrão)
--   • {"scope":"private"}                       → somente o criador (privado)
--   • {"scope":"categories","ids":[uuid,...]}   → uma ou MAIS categorias
--
-- Aditiva e idempotente: coluna nullable, nenhum dado existente é tocado.
-- null é lido como "toda a equipe" (com fallback para categoria_id, se houver),
-- então páginas antigas continuam visíveis para todos sem qualquer migração de
-- dados. Enforcement real depende de RLS (hoje desligado no projeto).
--
-- Rollback: ALTER TABLE public.workspace_pages DROP COLUMN IF EXISTS visibility;
-- ============================================================================

ALTER TABLE "public"."workspace_pages"
    ADD COLUMN IF NOT EXISTS "visibility" "jsonb";

COMMENT ON COLUMN "public"."workspace_pages"."visibility" IS
    'Visibilidade no Compromisso: null/{scope:all}=equipe; {scope:private}=só o criador; {scope:categories,ids:[uuid...]}=categorias da agenda.';
