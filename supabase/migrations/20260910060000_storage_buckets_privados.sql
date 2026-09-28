-- ============================================================================
-- Storage — fechar os buckets que guardam documento de gente.
--
-- Os cinco buckets nasceram públicos porque o app só sabia usar `getPublicUrl`.
-- Bucket público quer dizer: qualquer pessoa com o link abre o arquivo, sem
-- login e sem pertencer à empresa — e link de bucket público não expira. Hoje
-- isso vale para a nota fiscal, o boleto e o contrato do financeiro
-- (`documentos`), o PDF de exame do paciente (`exames`) e o anexo da agenda
-- (`anexos`, `anexos_agenda`).
--
-- Pior: as políticas de INSERT/UPDATE/DELETE de `logos`, `anexos`,
-- `anexos_agenda` e `workspace` estavam para o papel `public`, isto é, para o
-- ANÔNIMO. Qualquer pessoa com a chave pública do site podia subir e apagar
-- arquivo nesses buckets.
--
-- O QUE ESTA MIGRATION FAZ
--   1. `documentos`, `exames`, `anexos` e `anexos_agenda` viram privados. O app
--      passa a pedir URL assinada no clique (src/services/arquivos.js), válida
--      por 5 minutos. A URL pública que já está gravada no banco continua
--      servindo de referência: ela contém o caminho do arquivo, e é dele que a
--      assinatura é feita — ninguém precisa reescrever registro nenhum.
--   2. Toda escrita em qualquer bucket passa a exigir sessão. Leitura anônima
--      só continua em `logos` e `workspace`.
--   3. Cada bucket ganha teto de tamanho, que é a trava de verdade (a do
--      navegador é a que consegue explicar o problema para quem está na tela).
--
-- POR QUE `logos` E `workspace` CONTINUAM PÚBLICOS PARA LEITURA
--   `logos` é identidade visual — logo do hospital, favicon, foto do
--   anestesista — e entra em PDF gerado e impresso. Não é dado de ninguém.
--   `workspace` guarda os anexos do Compromisso, e quem grava a URL é o editor
--   (BlockNote), DENTRO do conteúdo da página. URL assinada expira; o documento
--   ficaria com imagem quebrada dias depois. Fechar esse bucket exige guardar o
--   caminho no bloco e resolvê-lo na hora de desenhar — mudança no editor, que
--   fica anotada como pendência.
--
-- REVERSÃO: `update storage.buckets set public = true where id in (...)`. As
-- políticas antigas estão reproduzidas no bloco comentado do fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Privacidade e teto de tamanho
-- ----------------------------------------------------------------------------
update storage.buckets set public = false
 where id in ('documentos', 'exames', 'anexos', 'anexos_agenda');

update storage.buckets set file_size_limit = 15 * 1024 * 1024 where id = 'documentos';
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'exames';
update storage.buckets set file_size_limit = 10 * 1024 * 1024 where id in ('anexos', 'anexos_agenda');
update storage.buckets set file_size_limit =  5 * 1024 * 1024 where id = 'logos';

-- ----------------------------------------------------------------------------
-- 2. Políticas
--
-- As antigas foram criadas pelo painel, com nomes que não dizem nada
-- ("LiberarTudo 1peuqw_0", "anexosagenda 1bnpqx0_2" — este último, apesar do
-- nome, é do bucket `anexos`). Vão embora e dão lugar a um par por bucket, com
-- nome que se lê.
-- ----------------------------------------------------------------------------
do $$
declare p record;
begin
    for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
    loop
        execute format('drop policy if exists %I on storage.objects', p.policyname);
    end loop;
end $$;

-- Privados: só quem tem sessão, e para tudo.
do $$
declare b text;
begin
    foreach b in array array['documentos', 'exames', 'anexos', 'anexos_agenda'] loop
        execute format(
            'create policy %I on storage.objects for select to authenticated using (bucket_id = %L)',
            b || '_ver', b);
        execute format(
            'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L)',
            b || '_enviar', b);
        execute format(
            'create policy %I on storage.objects for update to authenticated using (bucket_id = %L) with check (bucket_id = %L)',
            b || '_substituir', b, b);
        execute format(
            'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L)',
            b || '_apagar', b);
    end loop;
end $$;

-- Públicos na leitura, fechados na escrita.
do $$
declare b text;
begin
    foreach b in array array['logos', 'workspace'] loop
        execute format(
            'create policy %I on storage.objects for select to public using (bucket_id = %L)',
            b || '_ver', b);
        execute format(
            'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L)',
            b || '_enviar', b);
        execute format(
            'create policy %I on storage.objects for update to authenticated using (bucket_id = %L) with check (bucket_id = %L)',
            b || '_substituir', b, b);
        execute format(
            'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L)',
            b || '_apagar', b);
    end loop;
end $$;

-- ============================================================================
-- REVERSÃO
--
-- update storage.buckets set public = true
--  where id in ('documentos', 'exames', 'anexos', 'anexos_agenda');
--
-- E, se for preciso reabrir a escrita anônima (não deveria):
-- create policy "anon_tudo" on storage.objects for all to public using (true) with check (true);
-- ============================================================================
