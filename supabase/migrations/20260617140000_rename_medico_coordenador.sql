-- Renomeia o perfil "Médico Autorizador" -> "Médico Coordenador".
-- Idempotente: pode ser executada novamente sem efeito colateral.

-- 1) Perfil dos usuários
UPDATE public.users
SET role = 'Médico Coordenador'
WHERE role = 'Médico Autorizador';

-- 2) Matriz de permissões (settings.id = 'permissions'):
--    renomeia a chave do perfil preservando todas as permissões já marcadas.
UPDATE public.settings
SET data = (data - 'Médico Autorizador')
           || jsonb_build_object('Médico Coordenador', data -> 'Médico Autorizador')
WHERE id = 'permissions'
  AND data ? 'Médico Autorizador';

-- 3) Layouts da tela inicial por perfil (settings.id = 'home_layouts'), se a chave existir.
--    Guardado por "data ? ..." — não faz nada caso o layout não seja chaveado por este perfil.
UPDATE public.settings
SET data = (data - 'Médico Autorizador')
           || jsonb_build_object('Médico Coordenador', data -> 'Médico Autorizador')
WHERE id = 'home_layouts'
  AND data ? 'Médico Autorizador';
