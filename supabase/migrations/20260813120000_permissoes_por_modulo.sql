-- ============================================================================
-- Permissões por módulo: chaves de acesso que faltavam + faxina das mortas.
--
-- Contexto: até aqui vários módulos não tinham porteiro nenhum. Compromissos,
-- PEP, Escala e Atendimento eram alcançáveis por qualquer usuário logado — a
-- rota só checava `modules_access`, que está vazio nos 59 cadastros, e o bloco
-- da tela inicial não checava nada. Agora cada módulo tem uma chave de acesso
-- (src/config/permissions.js) e ela é exigida na rota, no menu e no bloco.
--
-- Critério de migração (decidido com o COO): preserva o acesso de quem já
-- trabalha no sistema — Administrador, Médico, Médico Coordenador e Assistente
-- — e fecha para Visualizador, Operador, Enfermagem, Centro Cirúrgico e Teste,
-- que passam a receber acesso por decisão explícita na Matriz de Permissões.
--
-- Só mexe em chaves NOVAS. 'Acessar Escala', 'Acessar Financeiro' e as demais
-- que já existiam ficam exatamente como o administrador as deixou.
-- ============================================================================

-- 1) Chaves de acesso novas para os perfis que já usam esses módulos.
--    O `||` do jsonb sobrescreve, então cada chave é aplicada uma vez só, e
--    apenas se o perfil existir na matriz.
update settings
set data = (
    select jsonb_object_agg(
        perfil,
        case
            when perfil in ('Administrador', 'Médico', 'Médico Coordenador', 'Assistente')
                then permissoes || jsonb_build_object(
                    'Acessar Atendimento',    coalesce(permissoes -> 'Acessar Recepção',      'false'::jsonb),
                    'Acessar Mapa Cirúrgico', coalesce(permissoes -> 'Visualizar Mapa/Agenda','false'::jsonb),
                    'Acessar Compromissos',   'true'::jsonb
                )
            else permissoes
        end
    )
    from jsonb_each(data) as t(perfil, permissoes)
)
where id = 'permissions';

-- 2) Faxina: chaves que nenhuma linha de código lê.
--    - 'Modulo: *' eram um efeito colateral do botão "marcar módulo inteiro" da
--      matriz antiga, que gravava o id do grupo junto com as permissões.
--    - 'Extratos' e 'Repasses' são restos de uma versão anterior do financeiro.
update settings
set data = (
    select jsonb_object_agg(
        perfil,
        (
            select coalesce(jsonb_object_agg(chave, valor), '{}'::jsonb)
            from jsonb_each(permissoes) as p(chave, valor)
            where chave not like 'Modulo: %'
              and chave not in ('Extratos', 'Repasses')
        )
    )
    from jsonb_each(data) as t(perfil, permissoes)
)
where id = 'permissions';
