-- ============================================================================
-- Compromisso — tempo real de verdade.
--
-- O app já assinava `workspace_pages` (árvore lateral), mas a publicação
-- `supabase_realtime` não continha NENHUMA tabela do workspace: a assinatura
-- existia e nunca recebia evento. Resultado: criar uma tarefa num lugar não
-- aparecia em lugar nenhum sem F5.
--
-- REPLICA IDENTITY FULL nas três tabelas de database: sem isso o evento de
-- DELETE só traz a chave primária, e o cliente não teria como saber a QUAL
-- database a linha apagada pertencia. São tabelas curtas (valores, colunas e
-- visões), então o custo no WAL é irrelevante.
--
-- `workspace_pages` fica com a REPLICA IDENTITY padrão de propósito: a coluna
-- `content` guarda os blocos da página inteira e o FULL faria cada UPDATE
-- carregar também a versão ANTIGA dela no WAL. Lá a exclusão é lógica
-- (`deleted_at`), que chega como UPDATE — com o registro novo completo.
--
-- Sobre o tamanho do evento de `workspace_pages`: o payload sai com a linha
-- inteira, `content` inclusive (publicar só algumas colunas não adianta — o
-- Realtime do Supabase ignora a lista de colunas da publicação e manda o
-- registro completo). Por isso o cliente assina as linhas de um database com
-- `filter: parent_id=eq.<id>`: quem está vendo uma tabela não recebe o texto
-- das páginas que os outros estão escrevendo.
--
-- Idempotente: só adiciona o que ainda não está publicado.
-- ============================================================================

ALTER TABLE "public"."workspace_db_values"     REPLICA IDENTITY FULL;
ALTER TABLE "public"."workspace_db_properties" REPLICA IDENTITY FULL;
ALTER TABLE "public"."workspace_db_views"      REPLICA IDENTITY FULL;

DO $$
DECLARE
    t "text";
BEGIN
    FOREACH t IN ARRAY ARRAY['workspace_pages', 'workspace_db_values',
                             'workspace_db_properties', 'workspace_db_views']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM "pg_publication_tables"
             WHERE "pubname" = 'supabase_realtime'
               AND "schemaname" = 'public' AND "tablename" = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION %I ADD TABLE public.%I', 'supabase_realtime', t);
        END IF;
    END LOOP;
END
$$;
