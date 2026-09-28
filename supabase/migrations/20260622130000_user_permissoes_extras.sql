-- Permissões extras por usuário: override individual concedido ALÉM do cargo/perfil.
-- Estrutura: { "<chave da permissão>": true }
-- Ex.: { "Visualizar Toda Escala": true } libera um médico específico para ver toda
-- a escala (todos os hospitais) sem que todos os médicos ganhem o mesmo acesso.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS permissoes_extras JSONB NOT NULL DEFAULT '{}'::jsonb;
