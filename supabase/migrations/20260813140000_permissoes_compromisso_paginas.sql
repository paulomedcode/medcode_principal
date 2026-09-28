-- ============================================================================
-- Compromisso: criar / editar / excluir páginas e bancos de dados.
--
-- Até aqui o módulo tinha permissão só para QUADRO (o database embutido numa
-- página). Criar página, renomear, mover, mandar para a lixeira, criar um
-- database e mexer nas colunas dele eram livres para quem entrasse no módulo.
--
-- Mesmo critério da migração anterior (20260813120000): preserva quem já
-- trabalha no sistema, fecha para o resto. Com uma diferença deliberada —
-- EXCLUIR banco de dados apaga todas as linhas dele para todo mundo, então
-- essa não entra no "preserva": fica só com quem tem Acesso Total (Admin), e
-- o administrador concede caso a caso na Matriz de Permissões.
-- ============================================================================

update settings
set data = (
    select jsonb_object_agg(
        perfil,
        case
            -- Só faz sentido para quem entra no módulo.
            when coalesce((permissoes -> 'Acessar Compromissos')::boolean, false)
                then permissoes || jsonb_build_object(
                    'Criar Páginas Compromisso',   'true'::jsonb,
                    'Editar Páginas Compromisso',  'true'::jsonb,
                    'Excluir Páginas Compromisso', 'true'::jsonb,
                    'Criar Bancos Compromisso',    'true'::jsonb,
                    'Editar Bancos Compromisso',   'true'::jsonb,
                    -- Destrutivo e irreversível: só quem já podia tudo.
                    'Excluir Bancos Compromisso',
                        coalesce(permissoes -> 'Acesso Total (Admin)', 'false'::jsonb)
                )
            else permissoes
        end
    )
    from jsonb_each(data) as t(perfil, permissoes)
)
where id = 'permissions';
