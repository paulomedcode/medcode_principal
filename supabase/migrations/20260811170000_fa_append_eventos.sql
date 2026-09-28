-- =============================================================================
-- Ficha Anestésica — gravação de eventos sem corrida e sem duplicata
--
-- Ler o array, acrescentar no cliente e regravar perderia registros quando dois
-- aparelhos lançam ao mesmo tempo (tablet da sala + desktop da secretária) —
-- o último a gravar apagaria o do outro.
--
-- Aqui o acréscimo acontece dentro de um único UPDATE, e eventos cujo id já
-- está na ficha são ignorados. Isso torna o reenvio da fila offline seguro:
-- mandar o mesmo evento duas vezes não o duplica.
-- =============================================================================

create or replace function public.fa_append_eventos(p_ficha uuid, p_eventos jsonb)
returns table (total_eventos integer, status text)
language plpgsql
security invoker
as $$
begin
    if jsonb_typeof(p_eventos) <> 'array' then
        raise exception 'p_eventos deve ser um array JSON.';
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

comment on function public.fa_append_eventos is 'Acrescenta eventos à ficha em um único UPDATE, ignorando ids já gravados. Idempotente, seguro para reenvio da fila offline.';

revoke all on function public.fa_append_eventos(uuid, jsonb) from public, anon;
grant execute on function public.fa_append_eventos(uuid, jsonb) to authenticated;

-- =============================================================================
-- Substituição de um evento (correção) — também em um único UPDATE.
-- O original permanece no array; apenas ganha o sucessor que o substitui.
-- =============================================================================
create or replace function public.fa_marcar_removido(p_ficha uuid, p_evento text, p_autor uuid)
returns integer
language plpgsql
security invoker
as $$
declare
    afetados integer;
begin
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

comment on function public.fa_marcar_removido is 'Marca um evento como removido sem apagá-lo do histórico. Recusa ficha finalizada.';

revoke all on function public.fa_marcar_removido(uuid, text, uuid) from public, anon;
grant execute on function public.fa_marcar_removido(uuid, text, uuid) to authenticated;
