-- ============================================================================
-- Proposta comercial em PDF (layout de medcode-proposta/) para os orçamentos.
--
--   finance_quotes.numero          MC-AAAA-### sequencial por ano, dado na criação
--   finance_quotes.proposta        textos da proposta, ajustados por cliente
--                                  (capa, carta, cenário, condições, cronograma…)
--   finance_quote_items.detalhes   o que o serviço entrega naquela proposta
--                                  (rótulo, descrição, entregáveis, prazo…)
--   finance_services.proposta_padrao  o mesmo, como ponto de partida do serviço
--   finance_quote_pdfs             cada PDF gerado (v1, v2…) — nada é sobrescrito
--   bucket `propostas` (privado)   os arquivos, em <quote_id>/<arquivo>.pdf
--
-- O PDF é gerado em /api/proposta-pdf; o navegador sobe o arquivo e chama
-- registrar_pdf_proposta(). Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas
-- ----------------------------------------------------------------------------
alter table public.finance_quotes
    add column if not exists numero   text,
    add column if not exists proposta jsonb not null default '{}'::jsonb;

alter table public.finance_quote_items
    add column if not exists detalhes jsonb not null default '{}'::jsonb;

alter table public.finance_services
    add column if not exists proposta_padrao jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- 2. Numeração MC-AAAA-###
-- ----------------------------------------------------------------------------
create or replace function public.proximo_numero_proposta(p_ano integer)
 returns text language plpgsql security definer set search_path to 'public'
as $function$
declare v_seq integer;
begin
    perform pg_advisory_xact_lock(hashtext('numero_proposta'), p_ano);
    select coalesce(max(split_part(numero, '-', 3)::integer), 0) + 1 into v_seq
      from finance_quotes
     where numero ~ ('^MC-' || p_ano || '-[0-9]+$');
    return 'MC-' || p_ano || '-' || lpad(v_seq::text, 3, '0');
end; $function$;
revoke all on function public.proximo_numero_proposta(integer) from public, anon, authenticated;

create or replace function public.finance_quotes_numerar()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
    if new.numero is null then
        new.numero := public.proximo_numero_proposta(
            extract(year from coalesce(new.issue_date, current_date))::integer);
    end if;
    return new;
end; $function$;
revoke all on function public.finance_quotes_numerar() from public, anon, authenticated;

drop trigger if exists finance_quotes_numerar on public.finance_quotes;
create trigger finance_quotes_numerar before insert on public.finance_quotes
    for each row execute function public.finance_quotes_numerar();

-- Orçamentos que já existiam: numerados na ordem em que foram criados.
do $$
declare q record;
begin
    for q in select id, coalesce(issue_date, created_at::date) as dia
               from public.finance_quotes where numero is null order by created_at, id
    loop
        update public.finance_quotes
           set numero = public.proximo_numero_proposta(extract(year from q.dia)::integer)
         where id = q.id;
    end loop;
end $$;

create unique index if not exists finance_quotes_numero_key on public.finance_quotes(numero);

-- ----------------------------------------------------------------------------
-- 3. Criar/editar orçamento grava também a proposta e os detalhes dos itens.
--    Quem não manda `proposta` (ex.: tela antiga em cache) não apaga o que há.
-- ----------------------------------------------------------------------------
create or replace function public.create_quote__interno(p_quote jsonb, p_items jsonb)
 returns finance_quotes language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_q public.finance_quotes;
begin
  insert into finance_quotes (party_id, title, valid_until, total_amount, notes, status, oportunidade_id, proposta)
  values (nullif(p_quote->>'party_id', '')::uuid, p_quote->>'title', nullif(p_quote->>'valid_until', '')::date,
          coalesce((p_quote->>'total_amount')::numeric, 0), p_quote->>'notes', coalesce(p_quote->>'status', 'PENDENTE'),
          nullif(p_quote->>'oportunidade_id', '')::uuid, coalesce(p_quote->'proposta', '{}'::jsonb))
  returning * into v_q;

  insert into finance_quote_items (quote_id, service_id, description, quantity, unit_price, amount, detalhes, created_at)
  select v_q.id, nullif(it->>'service_id', '')::uuid, it->>'description',
         coalesce((it->>'quantity')::numeric, 1), coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'amount')::numeric, 0),
         coalesce(it->'detalhes', '{}'::jsonb), now() + make_interval(secs => ord / 1000.0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(it, ord);

  return v_q;
end; $function$;

create or replace function public.update_quote__interno(p_id uuid, p_quote jsonb, p_items jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  update finance_quotes
     set party_id = nullif(p_quote->>'party_id', '')::uuid, title = p_quote->>'title',
         valid_until = nullif(p_quote->>'valid_until', '')::date,
         total_amount = coalesce((p_quote->>'total_amount')::numeric, 0),
         notes = p_quote->>'notes',
         oportunidade_id = case when p_quote ? 'oportunidade_id'
                                then nullif(p_quote->>'oportunidade_id', '')::uuid
                                else oportunidade_id end,
         proposta = case when p_quote ? 'proposta' then coalesce(p_quote->'proposta', '{}'::jsonb) else proposta end,
         updated_at = timezone('utc', now())
   where id = p_id;
  if not found then raise exception 'Orçamento não encontrado.'; end if;

  delete from finance_quote_items where quote_id = p_id;

  -- created_at escalonado: a ordem dos itens na tela é a ordem na proposta.
  insert into finance_quote_items (quote_id, service_id, description, quantity, unit_price, amount, detalhes, created_at)
  select p_id, nullif(it->>'service_id', '')::uuid, it->>'description',
         coalesce((it->>'quantity')::numeric, 1), coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'amount')::numeric, 0),
         coalesce(it->'detalhes', '{}'::jsonb), now() + make_interval(secs => ord / 1000.0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(it, ord);
end; $function$;

-- ----------------------------------------------------------------------------
-- 4. PDFs gerados
-- ----------------------------------------------------------------------------
create table if not exists public.finance_quote_pdfs (
    id          uuid primary key default gen_random_uuid(),
    quote_id    uuid not null references public.finance_quotes(id) on delete cascade,
    versao      integer not null,
    numero      text not null,
    arquivo     text not null,          -- caminho no bucket `propostas`
    total       numeric(15,2) not null default 0,
    gerado_por  uuid references public.users(id) on delete set null,
    created_at  timestamptz not null default now(),
    unique (quote_id, versao)
);
create index if not exists finance_quote_pdfs_quote_idx on public.finance_quote_pdfs(quote_id);

alter table public.finance_quote_pdfs enable row level security;
revoke all on public.finance_quote_pdfs from anon;
revoke all on public.finance_quote_pdfs from public;
grant select, insert, update, delete on public.finance_quote_pdfs to authenticated;
grant all on public.finance_quote_pdfs to service_role;

drop policy if exists finance_quote_pdfs_ver on public.finance_quote_pdfs;
create policy finance_quote_pdfs_ver on public.finance_quote_pdfs for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro') or public.tem_permissao('Acessar Vendas')));
drop policy if exists finance_quote_pdfs_excluir on public.finance_quote_pdfs;
create policy finance_quote_pdfs_excluir on public.finance_quote_pdfs for delete to authenticated
    using ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));
-- Inserir só pelo RPC abaixo (numera a versão); não há política de insert/update.

create or replace function public.registrar_pdf_proposta(p_quote_id uuid, p_arquivo text)
 returns public.finance_quote_pdfs language plpgsql security definer set search_path to 'public'
as $function$
declare
    v_q   public.finance_quotes;
    v_pdf public.finance_quote_pdfs;
begin
    if not (public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')) then
        raise exception 'Sem permissão para gerar proposta.' using errcode = '42501';
    end if;
    if p_arquivo is null or split_part(p_arquivo, '/', 1) <> p_quote_id::text then
        raise exception 'Arquivo fora da pasta do orçamento.';
    end if;

    select * into v_q from finance_quotes where id = p_quote_id for update;
    if not found then raise exception 'Orçamento não encontrado.'; end if;

    insert into finance_quote_pdfs (quote_id, versao, numero, arquivo, total, gerado_por)
    values (p_quote_id,
            coalesce((select max(versao) from finance_quote_pdfs where quote_id = p_quote_id), 0) + 1,
            v_q.numero, p_arquivo, v_q.total_amount, (select id from public.meu_cadastro()))
    returning * into v_pdf;
    return v_pdf;
end; $function$;
revoke all on function public.registrar_pdf_proposta(uuid, text) from public, anon;
grant execute on function public.registrar_pdf_proposta(uuid, text) to authenticated, service_role;

-- Guardar o texto de um item como padrão do serviço (só a coluna da proposta;
-- preço e nome do serviço continuam com o financeiro).
create or replace function public.salvar_padrao_proposta_servico(p_service_id uuid, p_padrao jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
    if not (public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')) then
        raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    update finance_services
       set proposta_padrao = coalesce(p_padrao, '{}'::jsonb), updated_at = timezone('utc', now())
     where id = p_service_id;
    if not found then raise exception 'Serviço não encontrado.'; end if;
end; $function$;
revoke all on function public.salvar_padrao_proposta_servico(uuid, jsonb) from public, anon;
grant execute on function public.salvar_padrao_proposta_servico(uuid, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Bucket privado `propostas` (só PDF, até 15 MB)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('propostas', 'propostas', false, 15 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
   set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists propostas_ver on storage.objects;
create policy propostas_ver on storage.objects for select to authenticated
    using (bucket_id = 'propostas'
           and (select public.tem_permissao('Acessar Financeiro') or public.tem_permissao('Acessar Vendas')));
drop policy if exists propostas_enviar on storage.objects;
create policy propostas_enviar on storage.objects for insert to authenticated
    with check (bucket_id = 'propostas'
                and (select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));
drop policy if exists propostas_apagar on storage.objects;
create policy propostas_apagar on storage.objects for delete to authenticated
    using (bucket_id = 'propostas'
           and (select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));
