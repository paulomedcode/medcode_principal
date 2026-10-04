-- ============================================================================
-- Prospecção: a lista crua de possíveis clientes (Google Maps, sites, listas
-- compradas…), antes de virarem empresa no CRM.
--
-- Fica FORA de finance_parties de propósito: são centenas de linhas sem
-- filtro, a maioria vai ser descartada, e o cadastro de empresas é o mesmo do
-- financeiro. Quando um lead esquenta, "Converter em cliente" cria a empresa
-- (kind LEAD) e grava o vínculo em party_id.
--
--   prospeccao_leads     um possível cliente e o status da abordagem
--   prospeccao_eventos   histórico: troca de status, tentativa de contato, nota
-- ============================================================================

create table if not exists public.prospeccao_leads (
    id                  uuid primary key default gen_random_uuid(),
    nome                text not null,
    categoria           text,
    telefone            text,
    email               text,
    site                text,
    instagram           text,
    endereco            text,
    cidade              text,
    uf                  text,
    maps_url            text,
    nota_google         numeric(2,1),
    avaliacoes          integer,
    origem              text,
    -- Rótulos e cores em src/config/prospeccao.js.
    status              text not null default 'NOVO'
                        check (status in ('NOVO', 'CONTATADO', 'SEM_RESPOSTA', 'RESPONDEU', 'INTERESSADO',
                                          'PROPOSTA', 'FECHADO', 'PRODUCAO', 'DESCARTADO')),
    prioridade          smallint not null default 0 check (prioridade between 0 and 3),
    tentativas          integer not null default 0,
    ultimo_contato_em   timestamptz,
    proximo_contato_em  date,
    notas               text,
    -- Colunas da planilha importada que não têm campo próprio.
    extras              jsonb not null default '{}'::jsonb,
    party_id            uuid references public.finance_parties(id) on delete set null,
    responsavel_id      uuid references public.users(id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists prospeccao_leads_status_idx on public.prospeccao_leads(status);
create index if not exists prospeccao_leads_proximo_idx on public.prospeccao_leads(proximo_contato_em);

create table if not exists public.prospeccao_eventos (
    id          uuid primary key default gen_random_uuid(),
    lead_id     uuid not null references public.prospeccao_leads(id) on delete cascade,
    tipo        text not null check (tipo in ('STATUS', 'CONTATO', 'NOTA')),
    de          text,
    para        text,
    texto       text,
    autor_id    uuid references public.users(id) on delete set null,
    created_at  timestamptz not null default now()
);
create index if not exists prospeccao_eventos_lead_idx on public.prospeccao_eventos(lead_id, created_at desc);

drop trigger if exists prospeccao_leads_touch on public.prospeccao_leads;
create trigger prospeccao_leads_touch before update on public.prospeccao_leads
    for each row execute function public.crm_touch_updated_at();

-- Troca de status vira linha no histórico sozinha: a tela não precisa lembrar.
create or replace function public.prospeccao_registrar_status()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
    if new.status is distinct from old.status then
        insert into prospeccao_eventos (lead_id, tipo, de, para, autor_id)
        values (new.id, 'STATUS', old.status, new.status, (select id from public.meu_cadastro()));
    end if;
    return new;
end $$;
drop trigger if exists prospeccao_leads_status on public.prospeccao_leads;
create trigger prospeccao_leads_status after update of status on public.prospeccao_leads
    for each row execute function public.prospeccao_registrar_status();

-- ----------------------------------------------------------------------------
-- Segurança — mesmas chaves de src/config/permissions.js.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array['prospeccao_leads', 'prospeccao_eventos'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from anon', t);
        execute format('revoke all on public.%I from public', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
        execute format('grant all on public.%I to service_role', t);
    end loop;
end $$;

drop policy if exists prospeccao_leads_ver on public.prospeccao_leads;
create policy prospeccao_leads_ver on public.prospeccao_leads for select to authenticated
    using ((select public.tem_permissao('Acessar Prospecção')));
drop policy if exists prospeccao_leads_criar on public.prospeccao_leads;
create policy prospeccao_leads_criar on public.prospeccao_leads for insert to authenticated
    with check ((select public.tem_permissao('Editar Prospecção')));
drop policy if exists prospeccao_leads_editar on public.prospeccao_leads;
create policy prospeccao_leads_editar on public.prospeccao_leads for update to authenticated
    using ((select public.tem_permissao('Editar Prospecção')))
    with check ((select public.tem_permissao('Editar Prospecção')));
drop policy if exists prospeccao_leads_excluir on public.prospeccao_leads;
create policy prospeccao_leads_excluir on public.prospeccao_leads for delete to authenticated
    using ((select public.tem_permissao('Excluir Prospecção')));

drop policy if exists prospeccao_eventos_ver on public.prospeccao_eventos;
create policy prospeccao_eventos_ver on public.prospeccao_eventos for select to authenticated
    using ((select public.tem_permissao('Acessar Prospecção')));
drop policy if exists prospeccao_eventos_criar on public.prospeccao_eventos;
create policy prospeccao_eventos_criar on public.prospeccao_eventos for insert to authenticated
    with check ((select public.tem_permissao('Editar Prospecção')));
drop policy if exists prospeccao_eventos_excluir on public.prospeccao_eventos;
create policy prospeccao_eventos_excluir on public.prospeccao_eventos for delete to authenticated
    using (autor_id = (select id from public.meu_cadastro()) or (select public.tem_permissao('Excluir Prospecção')));
