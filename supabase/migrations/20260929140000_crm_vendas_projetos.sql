-- ============================================================================
-- CRM, Funil de Vendas e Projetos da MedCode.
--
--   Empresa (finance_parties)  ← cadastro ÚNICO: lead, cliente e fornecedor.
--     ├── crm_contatos          pessoas da empresa
--     ├── crm_oportunidades     negociações no funil (crm_etapas)
--     │     └── finance_quotes  propostas (o orçamento que já existia)
--     ├── projetos              o que foi vendido e está sendo entregue
--     │     ├── finance_transactions.projeto_id   parcelas, custos
--     │     ├── finance_recurrences.projeto_id    mensalidade
--     │     └── workspace_pages (projetos.workspace_page_id)  entregas
--     └── crm_atividades        linha do tempo (empresa, oportunidade, projeto)
--
-- O cliente do CRM e o do financeiro são a mesma linha: `kind` ganha 'LEAD', e
-- ganhar uma oportunidade promove o lead a CLIENTE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Empresas: o cadastro que já existia, com os campos de CRM.
-- ----------------------------------------------------------------------------
alter table public.finance_parties drop constraint if exists finance_parties_kind_check;
alter table public.finance_parties
    add constraint finance_parties_kind_check check (kind in ('LEAD', 'CLIENTE', 'FORNECEDOR', 'AMBOS'));

alter table public.finance_parties
    add column if not exists tipo_pessoa    text not null default 'PJ' check (tipo_pessoa in ('PJ', 'PF')),
    add column if not exists nome_fantasia  text,
    add column if not exists email          text,
    add column if not exists telefone       text,
    add column if not exists site           text,
    add column if not exists instagram      text,
    add column if not exists segmento       text,
    add column if not exists origem         text,
    add column if not exists cidade         text,
    add column if not exists uf             text,
    add column if not exists responsavel_id uuid references public.users(id) on delete set null,
    add column if not exists ativo          boolean not null default true;

comment on column public.finance_parties.kind is 'LEAD (prospect), CLIENTE, FORNECEDOR ou AMBOS';
comment on column public.finance_parties.origem is 'De onde veio o lead (lista em settings.general.origens_lead)';

-- ----------------------------------------------------------------------------
-- 2. Tabelas novas.
-- ----------------------------------------------------------------------------
create table if not exists public.crm_contatos (
    id          uuid primary key default gen_random_uuid(),
    party_id    uuid not null references public.finance_parties(id) on delete cascade,
    nome        text not null,
    cargo       text,
    email       text,
    telefone    text,
    principal   boolean not null default false,
    notas       text,
    created_at  timestamptz not null default now()
);
create index if not exists crm_contatos_party_idx on public.crm_contatos(party_id);

create table if not exists public.crm_etapas (
    id            uuid primary key default gen_random_uuid(),
    nome          text not null,
    ordem         integer not null default 0,
    probabilidade integer not null default 0 check (probabilidade between 0 and 100),
    tipo          text not null default 'ABERTA' check (tipo in ('ABERTA', 'GANHO', 'PERDIDO')),
    cor           text not null default '#6366f1',
    created_at    timestamptz not null default now()
);

-- Tipos de serviço que a MedCode vende (rótulos em src/config/servicos.js).
create table if not exists public.crm_oportunidades (
    id                  uuid primary key default gen_random_uuid(),
    titulo              text not null,
    party_id            uuid not null references public.finance_parties(id) on delete cascade,
    contato_id          uuid references public.crm_contatos(id) on delete set null,
    servico             text not null default 'SITE'
                        check (servico in ('SITE', 'LANDING_PAGE', 'SISTEMA', 'AGENTE_IA', 'CONSULTORIA', 'OUTRO')),
    valor               numeric(14,2) not null default 0 check (valor >= 0),
    valor_recorrente    numeric(14,2) not null default 0 check (valor_recorrente >= 0),
    etapa_id            uuid not null references public.crm_etapas(id),
    responsavel_id      uuid references public.users(id) on delete set null,
    origem              text,
    previsao_fechamento date,
    motivo_perda        text,
    ganho_em            timestamptz,
    perdido_em          timestamptz,
    posicao             double precision not null default 0,
    notas               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists crm_oportunidades_party_idx on public.crm_oportunidades(party_id);
create index if not exists crm_oportunidades_etapa_idx on public.crm_oportunidades(etapa_id);

create table if not exists public.projetos (
    id                uuid primary key default gen_random_uuid(),
    nome              text not null,
    party_id          uuid not null references public.finance_parties(id) on delete restrict,
    oportunidade_id   uuid unique references public.crm_oportunidades(id) on delete set null,
    servico           text not null default 'SITE'
                      check (servico in ('SITE', 'LANDING_PAGE', 'SISTEMA', 'AGENTE_IA', 'CONSULTORIA', 'OUTRO')),
    status            text not null default 'PLANEJAMENTO'
                      check (status in ('PLANEJAMENTO', 'EM_ANDAMENTO', 'EM_REVISAO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO')),
    responsavel_id    uuid references public.users(id) on delete set null,
    data_inicio       date,
    prazo             date,
    concluido_em      date,
    valor_contratado  numeric(14,2) not null default 0,
    valor_recorrente  numeric(14,2) not null default 0,
    workspace_page_id uuid references public.workspace_pages(id) on delete set null,
    descricao         text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists projetos_party_idx on public.projetos(party_id);

create table if not exists public.crm_atividades (
    id              uuid primary key default gen_random_uuid(),
    party_id        uuid references public.finance_parties(id) on delete cascade,
    oportunidade_id uuid references public.crm_oportunidades(id) on delete cascade,
    projeto_id      uuid references public.projetos(id) on delete cascade,
    tipo            text not null default 'NOTA'
                    check (tipo in ('NOTA', 'LIGACAO', 'REUNIAO', 'EMAIL', 'WHATSAPP', 'SISTEMA')),
    titulo          text not null,
    descricao       text,
    data            timestamptz not null default now(),
    proximo_passo   text,
    proximo_passo_em date,
    autor_id        uuid references public.users(id) on delete set null,
    created_at      timestamptz not null default now(),
    check (party_id is not null or oportunidade_id is not null or projeto_id is not null)
);
create index if not exists crm_atividades_party_idx on public.crm_atividades(party_id);
create index if not exists crm_atividades_oport_idx on public.crm_atividades(oportunidade_id);
create index if not exists crm_atividades_projeto_idx on public.crm_atividades(projeto_id);

-- Vínculos no que já existia.
alter table public.finance_quotes
    add column if not exists oportunidade_id uuid references public.crm_oportunidades(id) on delete set null;
alter table public.finance_transactions
    add column if not exists projeto_id uuid references public.projetos(id) on delete set null;
alter table public.finance_recurrences
    add column if not exists projeto_id uuid references public.projetos(id) on delete set null;
create index if not exists finance_transactions_projeto_idx on public.finance_transactions(projeto_id);

-- updated_at automático.
create or replace function public.crm_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists crm_oportunidades_touch on public.crm_oportunidades;
create trigger crm_oportunidades_touch before update on public.crm_oportunidades
    for each row execute function public.crm_touch_updated_at();
drop trigger if exists projetos_touch on public.projetos;
create trigger projetos_touch before update on public.projetos
    for each row execute function public.crm_touch_updated_at();

-- Etapas iniciais do funil (editáveis na tela).
insert into public.crm_etapas (nome, ordem, probabilidade, tipo, cor)
select * from (values
    ('Novo lead',        1, 10,  'ABERTA',  '#94a3b8'),
    ('Qualificação',     2, 20,  'ABERTA',  '#60a5fa'),
    ('Reunião',          3, 40,  'ABERTA',  '#818cf8'),
    ('Proposta enviada', 4, 60,  'ABERTA',  '#a78bfa'),
    ('Negociação',       5, 80,  'ABERTA',  '#f59e0b'),
    ('Ganho',            6, 100, 'GANHO',   '#10b981'),
    ('Perdido',          7, 0,   'PERDIDO', '#f43f5e')
) v(nome, ordem, probabilidade, tipo, cor)
where not exists (select 1 from public.crm_etapas);

-- ----------------------------------------------------------------------------
-- 3. Segurança: tabelas novas fechadas ao anônimo e abertas por permissão.
--    A mesma regra de src/config/permissions.js, via tem_permissao().
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array['crm_contatos', 'crm_etapas', 'crm_oportunidades', 'crm_atividades', 'projetos'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from anon', t);
        execute format('revoke all on public.%I from public', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
        execute format('grant all on public.%I to service_role', t);
    end loop;
end $$;

-- Quem enxerga empresas: financeiro, CRM, vendas e projetos.
create or replace function public.ve_empresas()
returns boolean language sql stable security definer set search_path to 'public' as $$
    select public.tem_permissao('Acessar Financeiro') or public.tem_permissao('Acessar Clientes')
        or public.tem_permissao('Acessar Vendas') or public.tem_permissao('Acessar Projetos');
$$;
create or replace function public.edita_empresas()
returns boolean language sql stable security definer set search_path to 'public' as $$
    select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Clientes')
        or public.tem_permissao('Editar Vendas');
$$;
revoke all on function public.ve_empresas() from public, anon;
revoke all on function public.edita_empresas() from public, anon;
grant execute on function public.ve_empresas() to authenticated, service_role;
grant execute on function public.edita_empresas() to authenticated, service_role;

-- finance_parties
drop policy if exists finance_parties_ver on public.finance_parties;
create policy finance_parties_ver on public.finance_parties for select to authenticated
    using ((select public.ve_empresas()));
drop policy if exists finance_parties_criar on public.finance_parties;
create policy finance_parties_criar on public.finance_parties for insert to authenticated
    with check ((select public.edita_empresas()));
drop policy if exists finance_parties_editar on public.finance_parties;
create policy finance_parties_editar on public.finance_parties for update to authenticated
    using ((select public.edita_empresas())) with check ((select public.edita_empresas()));
drop policy if exists finance_parties_excluir on public.finance_parties;
create policy finance_parties_excluir on public.finance_parties for delete to authenticated
    using ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Excluir Clientes')));

-- crm_contatos: segue a empresa
create policy crm_contatos_ver on public.crm_contatos for select to authenticated
    using ((select public.ve_empresas()));
create policy crm_contatos_criar on public.crm_contatos for insert to authenticated
    with check ((select public.edita_empresas()));
create policy crm_contatos_editar on public.crm_contatos for update to authenticated
    using ((select public.edita_empresas())) with check ((select public.edita_empresas()));
create policy crm_contatos_excluir on public.crm_contatos for delete to authenticated
    using ((select public.edita_empresas()));

-- crm_etapas
create policy crm_etapas_ver on public.crm_etapas for select to authenticated
    using ((select public.ve_empresas()));
create policy crm_etapas_criar on public.crm_etapas for insert to authenticated
    with check ((select public.tem_permissao('Configurar Funil')));
create policy crm_etapas_editar on public.crm_etapas for update to authenticated
    using ((select public.tem_permissao('Configurar Funil'))) with check ((select public.tem_permissao('Configurar Funil')));
create policy crm_etapas_excluir on public.crm_etapas for delete to authenticated
    using ((select public.tem_permissao('Configurar Funil')));

-- crm_oportunidades
create policy crm_oportunidades_ver on public.crm_oportunidades for select to authenticated
    using ((select public.ve_empresas()));
create policy crm_oportunidades_criar on public.crm_oportunidades for insert to authenticated
    with check ((select public.tem_permissao('Editar Vendas')));
create policy crm_oportunidades_editar on public.crm_oportunidades for update to authenticated
    using ((select public.tem_permissao('Editar Vendas'))) with check ((select public.tem_permissao('Editar Vendas')));
create policy crm_oportunidades_excluir on public.crm_oportunidades for delete to authenticated
    using ((select public.tem_permissao('Editar Vendas')));

-- projetos
create policy projetos_ver on public.projetos for select to authenticated
    using ((select public.ve_empresas()));
create policy projetos_criar on public.projetos for insert to authenticated
    with check ((select public.tem_permissao('Editar Projetos')));
create policy projetos_editar on public.projetos for update to authenticated
    using ((select public.tem_permissao('Editar Projetos'))) with check ((select public.tem_permissao('Editar Projetos')));
create policy projetos_excluir on public.projetos for delete to authenticated
    using ((select public.tem_permissao('Excluir Projetos')));

-- crm_atividades: registrar contato é trabalho do dia a dia de quem enxerga a
-- empresa; editar/apagar é do autor ou de quem edita clientes.
create policy crm_atividades_ver on public.crm_atividades for select to authenticated
    using ((select public.ve_empresas()));
create policy crm_atividades_criar on public.crm_atividades for insert to authenticated
    with check ((select public.ve_empresas()));
create policy crm_atividades_editar on public.crm_atividades for update to authenticated
    using (autor_id = (select id from public.meu_cadastro()) or (select public.tem_permissao('Editar Clientes')))
    with check ((select public.ve_empresas()));
create policy crm_atividades_excluir on public.crm_atividades for delete to authenticated
    using (autor_id = (select id from public.meu_cadastro()) or (select public.tem_permissao('Editar Clientes')));

-- Propostas (orçamentos) também são do comercial.
drop policy if exists finance_quotes_ver on public.finance_quotes;
create policy finance_quotes_ver on public.finance_quotes for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro') or public.tem_permissao('Acessar Vendas')));
drop policy if exists finance_quotes_criar on public.finance_quotes;
create policy finance_quotes_criar on public.finance_quotes for insert to authenticated
    with check ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));
drop policy if exists finance_quotes_editar on public.finance_quotes;
create policy finance_quotes_editar on public.finance_quotes for update to authenticated
    using ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')))
    with check ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));
drop policy if exists finance_quotes_excluir on public.finance_quotes;
create policy finance_quotes_excluir on public.finance_quotes for delete to authenticated
    using ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));

drop policy if exists finance_quote_items_ver on public.finance_quote_items;
create policy finance_quote_items_ver on public.finance_quote_items for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro') or public.tem_permissao('Acessar Vendas')));
drop policy if exists finance_quote_items_criar on public.finance_quote_items;
create policy finance_quote_items_criar on public.finance_quote_items for insert to authenticated
    with check ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));
drop policy if exists finance_quote_items_editar on public.finance_quote_items;
create policy finance_quote_items_editar on public.finance_quote_items for update to authenticated
    using ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')))
    with check ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));
drop policy if exists finance_quote_items_excluir on public.finance_quote_items;
create policy finance_quote_items_excluir on public.finance_quote_items for delete to authenticated
    using ((select public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')));

drop policy if exists finance_services_ver on public.finance_services;
create policy finance_services_ver on public.finance_services for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro') or public.tem_permissao('Acessar Vendas')));

-- Criar/editar proposta pelo RPC: financeiro OU comercial. Grava a oportunidade.
create or replace function public.create_quote(p_quote jsonb, p_items jsonb)
 returns finance_quotes language plpgsql security definer set search_path to 'public'
as $function$
begin
    if not (public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')) then
        raise exception 'Sem permissão para criar proposta.' using errcode = '42501';
    end if;
    return public.create_quote__interno(p_quote, p_items);
end; $function$;

create or replace function public.update_quote(p_id uuid, p_quote jsonb, p_items jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
    if not (public.tem_permissao('Editar Financeiro') or public.tem_permissao('Editar Vendas')) then
        raise exception 'Sem permissão para alterar proposta.' using errcode = '42501';
    end if;
    perform public.update_quote__interno(p_id, p_quote, p_items);
end; $function$;

create or replace function public.create_quote__interno(p_quote jsonb, p_items jsonb)
 returns finance_quotes language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_q public.finance_quotes;
begin
  insert into finance_quotes (party_id, title, valid_until, total_amount, notes, status, oportunidade_id)
  values (nullif(p_quote->>'party_id', '')::uuid, p_quote->>'title', nullif(p_quote->>'valid_until', '')::date,
          coalesce((p_quote->>'total_amount')::numeric, 0), p_quote->>'notes', coalesce(p_quote->>'status', 'PENDENTE'),
          nullif(p_quote->>'oportunidade_id', '')::uuid)
  returning * into v_q;

  insert into finance_quote_items (quote_id, service_id, description, quantity, unit_price, amount)
  select v_q.id, nullif(it->>'service_id', '')::uuid, it->>'description',
         coalesce((it->>'quantity')::numeric, 1), coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'amount')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it;

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
         updated_at = timezone('utc', now())
   where id = p_id;
  if not found then raise exception 'Orçamento não encontrado.'; end if;

  delete from finance_quote_items where quote_id = p_id;

  insert into finance_quote_items (quote_id, service_id, description, quantity, unit_price, amount)
  select p_id, nullif(it->>'service_id', '')::uuid, it->>'description',
         coalesce((it->>'quantity')::numeric, 1), coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'amount')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it;
end; $function$;

-- ----------------------------------------------------------------------------
-- 4. Ganhar uma oportunidade — tudo ou nada:
--    • oportunidade vai para a etapa GANHO;
--    • o lead vira CLIENTE (fornecedor vira AMBOS);
--    • nasce o projeto;
--    • nascem as parcelas a receber (vencimento mensal a partir da 1ª data);
--    • se houver valor recorrente, nasce a mensalidade (finance_recurrences) —
--      as ocorrências são geradas pelo top-up do financeiro, como as demais.
--
-- p_dados: { nome, servico, responsavel_id, data_inicio, prazo, valor, parcelas,
--            primeiro_vencimento, account_id, category_id, valor_recorrente,
--            inicio_recorrencia }
-- ----------------------------------------------------------------------------
create or replace function public.ganhar_oportunidade(p_oportunidade_id uuid, p_dados jsonb)
 returns public.projetos language plpgsql security definer set search_path to 'public'
as $function$
declare
    v_op        public.crm_oportunidades;
    v_proj      public.projetos;
    v_etapa     uuid;
    v_valor     numeric := coalesce(nullif(p_dados->>'valor', '')::numeric, 0);
    v_rec       numeric := coalesce(nullif(p_dados->>'valor_recorrente', '')::numeric, 0);
    v_n         int := greatest(1, coalesce(nullif(p_dados->>'parcelas', '')::int, 1));
    v_primeiro  date := coalesce(nullif(p_dados->>'primeiro_vencimento', '')::date, current_date);
    v_conta     uuid := nullif(p_dados->>'account_id', '')::uuid;
    v_cat       uuid := nullif(p_dados->>'category_id', '')::uuid;
    v_grupo     uuid := gen_random_uuid();
    v_total_c   bigint; v_parc_c bigint; v_valor_c bigint;
    v_venc      date;
    v_inicio_rec date := coalesce(nullif(p_dados->>'inicio_recorrencia', '')::date, v_primeiro);
    i int;
begin
    if not public.tem_permissao('Editar Vendas') then
        raise exception 'Sem permissão para ganhar oportunidade.' using errcode = '42501';
    end if;

    select * into v_op from crm_oportunidades where id = p_oportunidade_id for update;
    if not found then raise exception 'Oportunidade não encontrada.'; end if;
    if v_op.ganho_em is not null then raise exception 'Esta oportunidade já foi ganha.'; end if;
    if (v_valor > 0 or v_rec > 0) and v_conta is null then
        raise exception 'Escolha a conta bancária que vai receber.';
    end if;

    select id into v_etapa from crm_etapas where tipo = 'GANHO' order by ordem limit 1;
    if v_etapa is null then raise exception 'O funil não tem etapa de GANHO.'; end if;

    update crm_oportunidades
       set etapa_id = v_etapa, ganho_em = now(), perdido_em = null, motivo_perda = null,
           valor = v_valor, valor_recorrente = v_rec
     where id = v_op.id;

    update finance_parties
       set kind = case when kind = 'FORNECEDOR' then 'AMBOS' when kind = 'LEAD' then 'CLIENTE' else kind end,
           updated_at = now()
     where id = v_op.party_id;

    insert into projetos (nome, party_id, oportunidade_id, servico, status, responsavel_id,
                          data_inicio, prazo, valor_contratado, valor_recorrente, descricao)
    values (coalesce(nullif(trim(p_dados->>'nome'), ''), v_op.titulo), v_op.party_id, v_op.id,
            coalesce(nullif(p_dados->>'servico', ''), v_op.servico), 'PLANEJAMENTO',
            coalesce(nullif(p_dados->>'responsavel_id', '')::uuid, v_op.responsavel_id),
            coalesce(nullif(p_dados->>'data_inicio', '')::date, current_date),
            nullif(p_dados->>'prazo', '')::date, v_valor, v_rec, v_op.notas)
    returning * into v_proj;

    -- Parcelas: divide em centavos; a última absorve o arredondamento. Dia do
    -- vencimento preso ao último dia do mês curto (31/jan → 28/fev).
    if v_valor > 0 then
        v_total_c := round(v_valor * 100);
        v_parc_c := floor(v_total_c / v_n);
        for i in 0 .. v_n - 1 loop
            v_venc := (date_trunc('month', v_primeiro) + make_interval(months => i))::date;
            v_venc := least(v_venc + (extract(day from v_primeiro)::int - 1),
                            (date_trunc('month', v_venc) + interval '1 month - 1 day')::date);
            v_valor_c := case when i = v_n - 1 then v_total_c - v_parc_c * (v_n - 1) else v_parc_c end;
            insert into finance_transactions
                (account_id, category_id, party_id, projeto_id, type, amount, transaction_date, due_date,
                 description, status, payment_method, reference_month,
                 installment_number, installment_total, installment_group_id)
            values
                (v_conta, v_cat, v_op.party_id, v_proj.id, 'ENTRADA', v_valor_c / 100.0, v_venc, v_venc,
                 v_proj.nome || case when v_n > 1 then ' (' || (i + 1) || '/' || v_n || ')' else '' end,
                 'PENDENTE', 'PIX', to_char(v_venc, 'YYYY-MM'),
                 i + 1, v_n, case when v_n > 1 then v_grupo else null end);
        end loop;
    end if;

    if v_rec > 0 then
        insert into finance_recurrences
            (type, account_id, category_id, party_id, projeto_id, amount, description, payment_method,
             cost_center_id, frequency, start_date, is_active, materialized_until)
        values
            ('ENTRADA', v_conta, coalesce(nullif(p_dados->>'category_recorrente_id', '')::uuid, v_cat),
             v_op.party_id, v_proj.id, v_rec, 'Mensalidade · ' || v_proj.nome, 'PIX',
             '30000000-0000-0000-0000-000000000001', 'MENSAL', v_inicio_rec, true, v_inicio_rec - 1);
    end if;

    insert into crm_atividades (party_id, oportunidade_id, projeto_id, tipo, titulo, descricao, autor_id)
    values (v_op.party_id, v_op.id, v_proj.id, 'SISTEMA', 'Oportunidade ganha',
            'Projeto criado' ||
            case when v_valor > 0 then ' · ' || v_n || ' parcela(s) somando R$ ' || to_char(v_valor, 'FM999G999G990D00') else '' end ||
            case when v_rec > 0 then ' · mensalidade de R$ ' || to_char(v_rec, 'FM999G999G990D00') else '' end,
            (select id from public.meu_cadastro()));

    return v_proj;
end; $function$;

revoke all on function public.ganhar_oportunidade(uuid, jsonb) from public, anon;
grant execute on function public.ganhar_oportunidade(uuid, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Plano de contas inicial de agência (só se o financeiro ainda não tem
--    nenhuma categoria — nunca sobrescreve o que foi cadastrado na tela).
-- ----------------------------------------------------------------------------
do $$
declare v_rec uuid; v_des uuid;
begin
    if exists (select 1 from public.finance_categories) then return; end if;

    insert into public.finance_categories (name, type, color, icon, position, in_result, in_cash_flow, is_profit_tax)
    values ('Receitas de Serviços', 'ENTRADA', '#10b981', 'Briefcase', 1, true, true, false)
    returning id into v_rec;
    insert into public.finance_categories (name, type, parent_id, color, icon, position, in_result, in_cash_flow, is_profit_tax) values
        ('Sites',                 'ENTRADA', v_rec, '#10b981', 'Briefcase', 1, true, true, false),
        ('Landing Pages',         'ENTRADA', v_rec, '#14b8a6', 'Briefcase', 2, true, true, false),
        ('Sistemas sob medida',   'ENTRADA', v_rec, '#0ea5e9', 'Briefcase', 3, true, true, false),
        ('Agentes de IA',         'ENTRADA', v_rec, '#6366f1', 'Briefcase', 4, true, true, false),
        ('Consultoria',           'ENTRADA', v_rec, '#8b5cf6', 'Briefcase', 5, true, true, false),
        ('Mensalidades e Manutenção', 'ENTRADA', v_rec, '#22c55e', 'Briefcase', 6, true, true, false);

    insert into public.finance_categories (name, type, color, icon, position, in_result, in_cash_flow, is_profit_tax)
    values ('Despesas Operacionais', 'SAIDA', '#f43f5e', 'Folder', 2, true, true, false)
    returning id into v_des;
    insert into public.finance_categories (name, type, parent_id, color, icon, position, in_result, in_cash_flow, is_profit_tax) values
        ('Ferramentas e Softwares', 'SAIDA', v_des, '#f43f5e', 'Folder', 1, true, true, false),
        ('APIs de IA',              'SAIDA', v_des, '#ec4899', 'Folder', 2, true, true, false),
        ('Hospedagem e Domínios',   'SAIDA', v_des, '#f97316', 'Folder', 3, true, true, false),
        ('Freelancers e Terceiros', 'SAIDA', v_des, '#eab308', 'Users',  4, true, true, false),
        ('Marketing e Anúncios',    'SAIDA', v_des, '#a855f7', 'Folder', 5, true, true, false),
        ('Pró-labore',              'SAIDA', v_des, '#64748b', 'Users',  6, true, true, false),
        ('Tarifas Bancárias',       'SAIDA', v_des, '#94a3b8', 'Folder', 7, true, true, false),
        ('Impostos sobre Serviços', 'SAIDA', v_des, '#ef4444', 'Percent', 8, true, true, false);
end $$;

-- ----------------------------------------------------------------------------
-- 6. Catálogo de permissões = src/config/permissions.js
--    (gerado por: node scripts/gerar-catalogo-permissoes.mjs)
-- ----------------------------------------------------------------------------
delete from public.permissoes_catalogo;
insert into public.permissoes_catalogo (permissao, chave_acesso, pessoal) values
  ('Acessar Clientes', 'Acessar Clientes', false),
  ('Acessar Compromissos', 'Acessar Compromissos', false),
  ('Acessar Configurações', 'Acessar Configurações', false),
  ('Acessar Financeiro', 'Acessar Financeiro', false),
  ('Acessar Projetos', 'Acessar Projetos', false),
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
  ('Editar Vendas', 'Acessar Vendas', false),
  ('Excluir Bancos Compromisso', 'Acessar Compromissos', false),
  ('Excluir Clientes', 'Acessar Clientes', false),
  ('Excluir Páginas Compromisso', 'Acessar Compromissos', false),
  ('Excluir Projetos', 'Acessar Projetos', false),
  ('Excluir Quadros Compromisso', 'Acessar Compromissos', false),
  ('Gerenciar Permissões', 'Acessar Usuarios', false);
