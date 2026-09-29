-- Painel, próximo passo concluível e matriz inicial dos cargos da agência.

-- 1. Próximo passo combinado numa atividade agora pode ser marcado como feito
--    (sem isso ele ficava "atrasado" para sempre no painel e nas pendências).
alter table public.crm_atividades
    add column if not exists proximo_passo_concluido_em timestamptz;

-- 2. Matriz inicial por cargo. O que já estiver configurado na tela vence:
--    `padrao || atual` mantém as chaves do cargo que já existe.
do $$
declare
    compromissos_uso jsonb := '{"Acessar Compromissos": true, "Criar Páginas Compromisso": true, "Editar Páginas Compromisso": true}';
    compromissos_gestao jsonb := compromissos_uso || '{"Excluir Páginas Compromisso": true, "Criar Bancos Compromisso": true, "Editar Bancos Compromisso": true, "Alterar Quadros Compromisso": true}';
    padrao jsonb;
begin
    padrao := jsonb_build_object(
        'Administrador', '{"Acesso Total (Admin)": true}'::jsonb,
        'Sócio', '{"Acesso Total (Admin)": true}'::jsonb,
        'Comercial', '{"Acessar Painel": true, "Acessar Clientes": true, "Editar Clientes": true,
                       "Acessar Vendas": true, "Editar Vendas": true, "Acessar Projetos": true}'::jsonb || compromissos_uso,
        'Gestor de Projetos', '{"Acessar Painel": true, "Acessar Clientes": true, "Acessar Vendas": true,
                                "Acessar Projetos": true, "Editar Projetos": true}'::jsonb || compromissos_gestao,
        'Produção', '{"Acessar Projetos": true}'::jsonb || compromissos_uso,
        'Financeiro', '{"Acessar Painel": true, "Acessar Financeiro": true, "Editar Financeiro": true,
                        "Acessar Clientes": true, "Editar Clientes": true, "Acessar Projetos": true,
                        "Acessar Vendas": true}'::jsonb || compromissos_uso,
        'Visualizador', '{}'::jsonb
    );

    insert into public.settings (id, data) values ('permissions', padrao)
    on conflict (id) do update set data = padrao || coalesce(public.settings.data, '{}'::jsonb);
end $$;

-- 3. Catálogo de permissões = src/config/permissions.js
--    (gerado por: node scripts/gerar-catalogo-permissoes.mjs)
delete from public.permissoes_catalogo;
insert into public.permissoes_catalogo (permissao, chave_acesso, pessoal) values
  ('Acessar Clientes', 'Acessar Clientes', false),
  ('Acessar Compromissos', 'Acessar Compromissos', false),
  ('Acessar Configurações', 'Acessar Configurações', false),
  ('Acessar Financeiro', 'Acessar Financeiro', false),
  ('Acessar Painel', 'Acessar Painel', false),
  ('Acessar Projetos', 'Acessar Projetos', false),
  ('Acessar Usuarios', 'Acessar Usuarios', false),
  ('Acessar Vendas', 'Acessar Vendas', false),
  ('Acesso Total (Admin)', 'Acesso Total (Admin)', false),
  ('Alterar Quadros Compromisso', 'Acessar Compromissos', false),
  ('Configurar Funil', 'Acessar Vendas', false),
  ('Criar Bancos Compromisso', 'Acessar Compromissos', false),
  ('Criar Páginas Compromisso', 'Acessar Compromissos', false),
  ('Editar Bancos Compromisso', 'Acessar Compromissos', false),
  ('Editar Clientes', 'Acessar Clientes', false),
  ('Editar Financeiro', 'Acessar Financeiro', false),
  ('Editar Páginas Compromisso', 'Acessar Compromissos', false),
  ('Editar Projetos', 'Acessar Projetos', false),
  ('Editar Vendas', 'Acessar Vendas', false),
  ('Excluir Bancos Compromisso', 'Acessar Compromissos', false),
  ('Excluir Clientes', 'Acessar Clientes', false),
  ('Excluir Páginas Compromisso', 'Acessar Compromissos', false),
  ('Excluir Projetos', 'Acessar Projetos', false),
  ('Excluir Quadros Compromisso', 'Acessar Compromissos', false),
  ('Gerenciar Permissões', 'Acessar Usuarios', false);
