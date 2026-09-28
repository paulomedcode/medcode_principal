-- =============================================================================
-- Ficha Anestésica — cada anestesista responde pelo seu próprio trecho
--
-- A trava de responsável (20260813180000) já impedia um médico de escrever na
-- ficha de outro. Faltava o outro lado do mesmo problema: quem **assume** o caso
-- passava a poder alterar também o que já estava registrado — inclusive uma
-- infusão que o colega lançou às 21:00, duas horas antes de ele entrar na sala.
--
-- Isso não é corrigir ficha: é reescrever o registro de outra pessoa. Quem
-- assinar no fim responde por tudo o que está no documento, e a assinatura só
-- vale se cada trecho for de quem estava lá.
--
-- Regra: a partir da primeira passagem de caso, a ficha guarda desde quando o
-- responsável atual responde por ela (`responsavel_desde`), e nenhum registro
-- pode ser acrescentado, corrigido ou removido antes desse instante.
--
-- O que ficou para trás não fica sem conserto: para corrigir o trecho anterior,
-- o caso volta para quem o registrou (passagem de volta), ou a informação entra
-- como adendo depois de encerrada — sempre com autor e hora.
--
-- Ficha sem passagem nenhuma tem `responsavel_desde` nulo e segue sem restrição
-- de horário: é o caso normal, e é o que permite preencher a ficha depois do
-- procedimento, com os horários reais.
-- =============================================================================

alter table public.fichas_anestesicas
    add column if not exists responsavel_desde timestamptz;

comment on column public.fichas_anestesicas.responsavel_desde is
    'Instante em que o responsável atual assumiu o caso. Nulo enquanto não houve passagem. Antes dele, nenhum registro pode ser criado, corrigido ou removido.';

-- Acréscimo de eventos ---------------------------------------------------------
create or replace function public.fa_append_eventos(p_ficha uuid, p_eventos jsonb)
returns table (total_eventos integer, status text)
language plpgsql
security invoker
as $$
declare
    v_desde timestamptz;
begin
    if jsonb_typeof(p_eventos) <> 'array' then
        raise exception 'p_eventos deve ser um array JSON.';
    end if;

    select f.responsavel_desde into v_desde
      from public.fichas_anestesicas f
     where f.id = p_ficha and f.deleted_at is null;

    if v_desde is not null and exists (
        select 1
          from jsonb_array_elements(p_eventos) evento
         where (evento->>'t')::timestamptz < v_desde
    ) then
        raise exception 'Esta parte da ficha é do anestesista anterior (antes de %). Você registra a partir de quando assumiu o caso.',
            to_char(v_desde at time zone 'America/Sao_Paulo', 'HH24:MI');
    end if;

    return query
    update public.fichas_anestesicas f
       set eventos = f.eventos || (
               select coalesce(jsonb_agg(novo), '[]'::jsonb)
                 from jsonb_array_elements(p_eventos) novo
                where novo->>'id' is not null
                  and not exists (
                      select 1
                        from jsonb_array_elements(f.eventos) existente
                       where existente->>'id' = novo->>'id'
                  )
           )
     where f.id = p_ficha
       and f.deleted_at is null
    returning jsonb_array_length(f.eventos), f.status;

    if not found then
        raise exception 'Ficha anestésica não encontrada ou excluída: %', p_ficha;
    end if;
end;
$$;

revoke all on function public.fa_append_eventos(uuid, jsonb) from public, anon;
grant execute on function public.fa_append_eventos(uuid, jsonb) to authenticated;

-- Remoção de um evento ---------------------------------------------------------
create or replace function public.fa_marcar_removido(p_ficha uuid, p_evento text, p_autor uuid)
returns integer
language plpgsql
security invoker
as $$
declare
    afetados integer;
    v_desde  timestamptz;
    v_quando timestamptz;
begin
    select f.responsavel_desde,
           (select (e->>'t')::timestamptz
              from jsonb_array_elements(f.eventos) e
             where e->>'id' = p_evento
             limit 1)
      into v_desde, v_quando
      from public.fichas_anestesicas f
     where f.id = p_ficha and f.deleted_at is null;

    if v_desde is not null and v_quando is not null and v_quando < v_desde then
        raise exception 'Este registro é do anestesista anterior (antes de %) e não pode ser removido por quem assumiu depois.',
            to_char(v_desde at time zone 'America/Sao_Paulo', 'HH24:MI');
    end if;

    update public.fichas_anestesicas f
       set eventos = (
               select jsonb_agg(
                   case when e->>'id' = p_evento
                        then e || jsonb_build_object(
                                 'removido', true,
                                 'removidoPor', p_autor,
                                 'removidoEm', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                        else e
                   end)
                 from jsonb_array_elements(f.eventos) e
           )
     where f.id = p_ficha
       and f.deleted_at is null
       and f.status = 'em_andamento';

    get diagnostics afetados = row_count;
    if afetados = 0 then
        raise exception 'Ficha não encontrada, excluída ou já finalizada: %', p_ficha;
    end if;
    return afetados;
end;
$$;

revoke all on function public.fa_marcar_removido(uuid, text, uuid) from public, anon;
grant execute on function public.fa_marcar_removido(uuid, text, uuid) to authenticated;
