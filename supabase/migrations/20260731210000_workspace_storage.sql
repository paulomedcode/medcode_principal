-- ============================================================================
-- Compromisso — anexos do editor (bucket "workspace").
--
-- Até aqui, pôr uma imagem numa tarefa só funcionava por URL: quem tinha o
-- arquivo no computador não tinha por onde subir. Este bucket é o destino do
-- upload do editor (imagem, PDF, Word, planilha, áudio, vídeo) — ver
-- services/workspaceUploads.js.
--
-- Público na leitura porque o link do arquivo fica gravado dentro do conteúdo
-- da página (é um <img src> / link comum); as políticas de escrita seguem o
-- padrão dos outros buckets deste banco (anexos, logos). Limite de 25 MB por
-- arquivo: o suficiente para documento e foto, e pouco para alguém subir vídeo
-- de reunião sem querer.
-- ============================================================================

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit")
VALUES ('workspace', 'workspace', true, 26214400)
ON CONFLICT ("id") DO UPDATE
  SET "public" = true,
      "file_size_limit" = EXCLUDED."file_size_limit";

DO $$ BEGIN
    CREATE POLICY "workspace_anexos_select" ON "storage"."objects"
        FOR SELECT USING ("bucket_id" = 'workspace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "workspace_anexos_insert" ON "storage"."objects"
        FOR INSERT WITH CHECK ("bucket_id" = 'workspace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "workspace_anexos_update" ON "storage"."objects"
        FOR UPDATE USING ("bucket_id" = 'workspace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "workspace_anexos_delete" ON "storage"."objects"
        FOR DELETE USING ("bucket_id" = 'workspace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
