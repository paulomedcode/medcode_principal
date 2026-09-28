-- =============================================================================
-- Ficha Anestésica — quem é o usuário, do ponto de vista do banco
--
-- A trava do responsável comparava `auth.uid()` direto com `responsavel_id` e
-- barrou o próprio dono da ficha. O motivo: nem todo login tem o mesmo id do
-- cadastro. O sistema busca o perfil em `public.users` **pelo e-mail**, então um
-- usuário cujo login foi recriado (e-mail novo, id novo em `auth.users`) segue
-- usando a linha antiga de `public.users` — e é o id dessa linha que a
-- aplicação grava em toda parte, inclusive em `responsavel_id`.
--
-- Resultado prático: a ficha era gravada com um id e defendida contra outro.
-- Quem abriu a ficha não conseguia registrar, iniciar tempo nem excluir.
--
-- A correção é reconhecer a mesma pessoa nas duas pontas: o id do login e o id
-- do cadastro que tem o mesmo e-mail. É `security definer` porque só assim se
-- lê `auth.users` a partir da sessão do usuário.
-- =============================================================================

create or replace function public.fa_ids_do_usuario()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
    select coalesce(array_agg(distinct t.id), '{}')::uuid[]
      from (
          -- o id do login
          select auth.uid() as id
          union
          -- o cadastro com esse mesmo id
          select u.id from public.users u where u.id = auth.uid()
          union
          -- e o cadastro que responde pelo mesmo e-mail do login
          select u.id
            from public.users u
            join auth.users a on lower(a.email) = lower(u.email)
           where a.id = auth.uid()
      ) t
     where t.id is not null;
$$;

comment on function public.fa_ids_do_usuario is 'Ids que representam o usuário logado: o do login e o do cadastro de mesmo e-mail. Existe porque o perfil é resolvido por e-mail, e login recriado muda o id.';

revoke all on function public.fa_ids_do_usuario() from public, anon;
grant execute on function public.fa_ids_do_usuario() to authenticated;

-- Trava do responsável, agora reconhecendo a pessoa e não só o id do login ----
create or replace function public.fa_exige_responsavel()
returns trigger language plpgsql as $$
declare
    v_ids    uuid[] := public.fa_ids_do_usuario();
    v_ultima jsonb;
begin
    -- Ficha finalizada já tem a trava da assinatura, que é mais estrita.
    if old.status <> 'em_andamento' then
        return new;
    end if;

    -- Ficha sem responsável (aberta antes desta regra): não há de quem proteger.
    if old.responsavel_id is null then
        return new;
    end if;

    -- Sem sessão só chega quem usa a chave de serviço — manutenção nossa. O
    -- anônimo não passa da RLS, que exige `authenticated` para atualizar.
    if auth.uid() is null then
        return new;
    end if;

    if old.responsavel_id = any(v_ids) then
        return new;
    end if;

    -- Terceiro: o único movimento permitido é assumir o caso, e ele nunca é
    -- silencioso — entra na trilha de passagens, com quem passou e quem assumiu.
    if new.responsavel_id is distinct from old.responsavel_id
       and new.responsavel_id = any(v_ids)
       and new.eventos is not distinct from old.eventos
       and new.dados   is not distinct from old.dados
       and jsonb_array_length(new.passagens) = jsonb_array_length(old.passagens) + 1
    then
        v_ultima := new.passagens -> -1;

        if (v_ultima ->> 'para_id') = any(v_ids::text[])
           and (v_ultima ->> 'de_id') is not distinct from old.responsavel_id::text
           and (
                old.passagem_para_id = any(v_ids)
                or coalesce(btrim(v_ultima ->> 'motivo'), '') <> ''
           )
        then
            return new;
        end if;
    end if;

    raise exception 'A ficha está em andamento com %. Só quem está com o caso registra nela; para outra pessoa continuar, é preciso passar o caso.',
        coalesce(old.responsavel_nome, 'outro anestesista');
end;
$$;
