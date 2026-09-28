-- =============================================================================
-- Ficha Anestésica — excluir e restaurar exigem permissão, no banco
--
-- Não havia permissão de exclusão para a FA: quem podia criar podia apagar, e
-- foi o que aconteceu — um anestesista abriu uma ficha e a excluiu minutos
-- depois, sem que nada barrasse.
--
-- A permissão passa a ser a mesma dos outros documentos do PEP ("Excluir
-- AIH/APA", agora também da FA). A checagem mora aqui, e não só na tela, porque
-- a tela é uma sugestão: qualquer chamada direta à API burlaria.
--
-- A regra é a mesma do `utils/permissoes.js`: Acesso Total resolve; senão, a
-- permissão fina só vale com a porta do módulo aberta, e cargo e extras somam.
-- =============================================================================

create or replace function public.fa_pode_excluir()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    v_cargo   text;
    v_extras  jsonb;
    v_matriz  jsonb;
    v_doCargo jsonb;
    v_somado  jsonb;
begin
    -- Sem sessão só chega a chave de serviço (manutenção nossa); o anônimo não
    -- passa da RLS.
    if auth.uid() is null then
        return true;
    end if;

    select u.role, coalesce(u.permissoes_extras, '{}'::jsonb)
      into v_cargo, v_extras
      from public.users u
     where u.id = any(public.fa_ids_do_usuario())
     limit 1;

    if v_cargo is null then
        return false;
    end if;

    if lower(v_cargo) in ('desenvolvedor', 'developer') then
        return true;
    end if;

    select coalesce(s.data, '{}'::jsonb) into v_matriz
      from public.settings s where s.id = 'permissions';

    v_doCargo := coalesce(v_matriz -> v_cargo, '{}'::jsonb);

    if coalesce((v_doCargo ->> 'Acesso Total (Admin)')::boolean, false) then
        return true;
    end if;

    -- Cargo e extras somam; a porta do módulo pode vir de qualquer um dos dois.
    v_somado := v_doCargo || v_extras;

    return coalesce((v_somado ->> 'Visualizar Atendimentos')::boolean, false)
       and coalesce((v_somado ->> 'Excluir AIH/APA')::boolean, false);
end;
$$;

comment on function public.fa_pode_excluir is 'Espelha utils/permissoes.js para a exclusão da Ficha Anestésica: Acesso Total, ou "Excluir AIH/APA" com a porta do PEP aberta (cargo + extras).';

revoke all on function public.fa_pode_excluir() from public, anon;
grant execute on function public.fa_pode_excluir() to authenticated;

-- Trava na ida e na volta da lixeira ------------------------------------------
create or replace function public.fa_exige_permissao_de_exclusao()
returns trigger language plpgsql as $$
begin
    if new.deleted_at is not distinct from old.deleted_at then
        return new;
    end if;

    if public.fa_pode_excluir() then
        return new;
    end if;

    if new.deleted_at is not null then
        raise exception 'Excluir ficha anestésica exige a permissão "AIH, APA e Ficha Anestésica: excluir".';
    end if;

    raise exception 'Restaurar ficha anestésica da lixeira exige a permissão "AIH, APA e Ficha Anestésica: excluir".';
end;
$$;

drop trigger if exists trg_fa_exclusao_permitida on public.fichas_anestesicas;
create trigger trg_fa_exclusao_permitida
    before update on public.fichas_anestesicas
    for each row execute function public.fa_exige_permissao_de_exclusao();
