-- ============================================================================
-- Chave de acesso do módulo Meus Repasses.
--
-- Permissão nova nasce ausente da matriz — e ausente vale false. Sem este
-- update o módulo entraria no ar invisível para exatamente quem ele foi feito:
-- o plantonista. Então a chave já vai ligada para Médico e Médico Coordenador,
-- os dois perfis que assinam folha de ponto.
--
-- Ninguém mais recebe nada aqui. Quem tem 'Acesso Total (Admin)' já enxerga o
-- módulo pelo coringa, e para o administrativo a tela só mostraria as folhas
-- da própria pessoa — que não existem. Liberar para outro perfil é decisão
-- explícita na Matriz de Permissões.
--
-- Importante: esta chave NÃO tem relação com 'Acessar Financeiro'. São dois
-- módulos separados no código, com rotas e telas diferentes; conceder um nunca
-- concede o outro.
-- ============================================================================

update settings
set data = (
    select jsonb_object_agg(
        perfil,
        case
            when perfil in ('Médico', 'Médico Coordenador')
                then permissoes || jsonb_build_object('Acessar Meus Repasses', 'true'::jsonb)
            else permissoes
        end
    )
    from jsonb_each(data) as t(perfil, permissoes)
)
where id = 'permissions';
