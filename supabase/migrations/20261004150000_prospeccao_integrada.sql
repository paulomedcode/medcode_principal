-- ============================================================================
-- Prospecção ligada ao resto do sistema.
--
-- Depois de convertido (prospeccao_leads.party_id), o lead anda sozinho
-- conforme o que acontece no Vendas e nos Projetos — sem ninguém precisar
-- voltar na lista para atualizar o status:
--
--   oportunidade criada para a empresa   → Interessado
--   proposta (finance_quotes) criada     → Proposta enviada
--   oportunidade ganha                   → Fechado
--   projeto em andamento / em revisão    → Em produção
--
-- Só anda para frente: um lead em "Proposta enviada" não volta para
-- "Interessado" porque abriram outra oportunidade. Descartado conta como o
-- começo da fila (se voltou a negociar, voltou à vida).
-- ============================================================================

alter table public.prospeccao_eventos drop constraint if exists prospeccao_eventos_tipo_check;
alter table public.prospeccao_eventos
    add constraint prospeccao_eventos_tipo_check check (tipo in ('STATUS', 'CONTATO', 'NOTA', 'SISTEMA'));

create or replace function public.prospeccao_ordem(p_status text)
returns int language sql immutable as $$
    select case p_status
        when 'DESCARTADO' then -1 when 'NOVO' then 0 when 'CONTATADO' then 1 when 'SEM_RESPOSTA' then 1
        when 'RESPONDEU' then 2 when 'INTERESSADO' then 3 when 'PROPOSTA' then 4
        when 'FECHADO' then 5 when 'PRODUCAO' then 6 else 0 end;
$$;

-- security definer: quem mexe no Vendas pode não ter acesso à Prospecção, e o
-- lead tem de andar do mesmo jeito.
create or replace function public.prospeccao_avancar(p_party uuid, p_status text, p_texto text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
    if p_party is null then return; end if;
    for v_id in
        update prospeccao_leads set status = p_status
         where party_id = p_party and public.prospeccao_ordem(status) < public.prospeccao_ordem(p_status)
        returning id
    loop
        insert into prospeccao_eventos (lead_id, tipo, texto, autor_id)
        values (v_id, 'SISTEMA', p_texto, (select id from public.meu_cadastro()));
    end loop;
end $$;
revoke all on function public.prospeccao_avancar(uuid, text, text) from public, anon, authenticated;

create or replace function public.prospeccao_por_oportunidade()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
    if tg_op = 'INSERT' then
        perform public.prospeccao_avancar(new.party_id, 'INTERESSADO', 'Vendas: oportunidade “' || new.titulo || '” criada');
    elsif new.etapa_id is distinct from old.etapa_id
          and (select tipo from crm_etapas where id = new.etapa_id) = 'GANHO' then
        perform public.prospeccao_avancar(new.party_id, 'FECHADO', 'Vendas: oportunidade “' || new.titulo || '” ganha');
    end if;
    return new;
end $$;
drop trigger if exists prospeccao_por_oportunidade on public.crm_oportunidades;
create trigger prospeccao_por_oportunidade after insert or update of etapa_id on public.crm_oportunidades
    for each row execute function public.prospeccao_por_oportunidade();

create or replace function public.prospeccao_por_proposta()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
    perform public.prospeccao_avancar(new.party_id, 'PROPOSTA', 'Proposta “' || coalesce(new.title, 'sem título') || '” criada');
    return new;
end $$;
drop trigger if exists prospeccao_por_proposta on public.finance_quotes;
create trigger prospeccao_por_proposta after insert on public.finance_quotes
    for each row execute function public.prospeccao_por_proposta();

create or replace function public.prospeccao_por_projeto()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
    if new.status in ('EM_ANDAMENTO', 'EM_REVISAO')
       and (tg_op = 'INSERT' or new.status is distinct from old.status) then
        perform public.prospeccao_avancar(new.party_id, 'PRODUCAO', 'Projetos: “' || new.nome || '” em andamento');
    end if;
    return new;
end $$;
drop trigger if exists prospeccao_por_projeto on public.projetos;
create trigger prospeccao_por_projeto after insert or update of status on public.projetos
    for each row execute function public.prospeccao_por_projeto();
