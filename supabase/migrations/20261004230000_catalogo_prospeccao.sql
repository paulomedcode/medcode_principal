-- Catálogo de permissões do banco (permissoes_catalogo) com as chaves da
-- Prospecção. Gerado por: node scripts/gerar-catalogo-permissoes.mjs

delete from public.permissoes_catalogo;
insert into public.permissoes_catalogo (permissao, chave_acesso, pessoal) values
  ('Acessar Clientes', 'Acessar Clientes', false),
  ('Acessar Compromissos', 'Acessar Compromissos', false),
  ('Acessar Configurações', 'Acessar Configurações', false),
  ('Acessar Financeiro', 'Acessar Financeiro', false),
  ('Acessar Painel', 'Acessar Painel', false),
  ('Acessar Projetos', 'Acessar Projetos', false),
  ('Acessar Prospecção', 'Acessar Prospecção', false),
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
  ('Editar Prospecção', 'Acessar Prospecção', false),
  ('Editar Vendas', 'Acessar Vendas', false),
  ('Excluir Bancos Compromisso', 'Acessar Compromissos', false),
  ('Excluir Clientes', 'Acessar Clientes', false),
  ('Excluir Páginas Compromisso', 'Acessar Compromissos', false),
  ('Excluir Projetos', 'Acessar Projetos', false),
  ('Excluir Prospecção', 'Acessar Prospecção', false),
  ('Excluir Quadros Compromisso', 'Acessar Compromissos', false),
  ('Gerenciar Permissões', 'Acessar Usuarios', false);
