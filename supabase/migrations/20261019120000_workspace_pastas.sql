-- Pastas na barra lateral do Compromisso.
--
-- Uma pasta é só um agrupador: um registro de workspace_pages com
-- type='folder', sem conteúdo próprio. Clicar abre/fecha; páginas, databases e
-- outras pastas entram nela arrastando ou pelo menu "Mover para".
ALTER TABLE "public"."workspace_pages"
    DROP CONSTRAINT IF EXISTS "workspace_pages_type_check";

ALTER TABLE "public"."workspace_pages"
    ADD CONSTRAINT "workspace_pages_type_check"
    CHECK ("type" = ANY (ARRAY['page'::"text", 'database'::"text", 'folder'::"text"]));
