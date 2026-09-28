-- =============================================================================
-- Ficha Anestésica — tabela principal
--
-- Estrutura deliberadamente diferente de `apas` (126 colunas planas): aqui o
-- que varia em quantidade — registros no tempo, medicações, adendos — mora em
-- JSONB, e só o que serve para filtrar, vincular ou listar vira coluna.
--
-- Regras médico-legais embutidas no banco, não só na tela:
--   * ficha finalizada não tem eventos nem dados alterados;
--   * para corrigir, é preciso reabrir explicitamente, e a reabertura fica
--     registrada com autor e motivo;
--   * exclusão é sempre lógica (deleted_at) — não há DELETE liberado.
-- =============================================================================

create table if not exists public.fichas_anestesicas (
    id                  uuid primary key default gen_random_uuid(),

    -- Vínculos. A ficha pode nascer avulsa (todos nulos) ou a partir da fila.
    paciente_id         uuid references public.pacientes(id) on delete set null,
    apa_id              uuid references public.apas(id) on delete set null,
    surgery_id          uuid references public.surgeries(id) on delete set null,
    unidade             text,

    -- Carimbo para listagem e histórico, no mesmo espírito da APA: o que foi
    -- impresso não muda se o cadastro de origem mudar depois.
    paciente_nome       text,
    procedimento        text,

    anestesista_id      uuid references public.users(id) on delete set null,
    anestesista_nome    text,
    anestesista_crm     text,
    anestesista_rqe     text,

    status              text not null default 'em_andamento'
                        check (status in ('em_andamento', 'finalizada')),

    inicio_anestesia    timestamptz,
    fim_anestesia       timestamptz,

    dados               jsonb not null default '{}'::jsonb,
    eventos             jsonb not null default '[]'::jsonb,
    adendos             jsonb not null default '[]'::jsonb,
    reaberturas         jsonb not null default '[]'::jsonb,

    assinada_em         timestamptz,
    assinada_por        uuid references public.users(id) on delete set null,
    assinada_por_nome   text,

    criado_por          uuid references public.users(id) on delete set null,
    deleted_at          timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table  public.fichas_anestesicas is 'Ficha anestésica transoperatória. Documento médico-legal: finalizada só muda por reabertura registrada.';
comment on column public.fichas_anestesicas.eventos     is 'Registros no tempo: [{id, tipo, alvo, valor, unidade, t, autorId, substitui, removido}]. A grade é projeção destes eventos.';
comment on column public.fichas_anestesicas.dados       is 'Cabeçalho, técnicas, ventilador, procedimentos e destino.';
comment on column public.fichas_anestesicas.adendos     is 'Complementos após a finalização: [{texto, autor_id, autor_nome, criado_em}].';
comment on column public.fichas_anestesicas.reaberturas is 'Trilha de reaberturas: [{motivo, autor_id, autor_nome, reaberta_em}].';

create index if not exists idx_fa_paciente     on public.fichas_anestesicas (paciente_id);
create index if not exists idx_fa_surgery      on public.fichas_anestesicas (surgery_id);
create index if not exists idx_fa_apa          on public.fichas_anestesicas (apa_id);
create index if not exists idx_fa_status       on public.fichas_anestesicas (status) where deleted_at is null;
create index if not exists idx_fa_inicio       on public.fichas_anestesicas (inicio_anestesia desc);
create index if not exists idx_fa_unidade      on public.fichas_anestesicas (unidade);

-- updated_at ------------------------------------------------------------------
create or replace function public.fa_touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_fa_updated_at on public.fichas_anestesicas;
create trigger trg_fa_updated_at
    before update on public.fichas_anestesicas
    for each row execute function public.fa_touch_updated_at();

-- Trava da ficha finalizada ---------------------------------------------------
-- A tela também controla isso, mas a trava fica aqui porque é regra do
-- documento, não da interface: nenhum caminho (script, correção manual, bug)
-- deve conseguir reescrever uma ficha assinada sem deixar rastro.
create or replace function public.fa_bloqueia_edicao_finalizada()
returns trigger language plpgsql as $$
begin
    if old.status <> 'finalizada' then
        return new;
    end if;

    -- Reabertura: exige um novo registro em `reaberturas` explicando quem e por quê.
    if new.status = 'em_andamento' then
        if jsonb_array_length(new.reaberturas) <= jsonb_array_length(old.reaberturas) then
            raise exception 'Reabrir uma ficha finalizada exige registrar o motivo e o responsável.';
        end if;
        return new;
    end if;

    -- Segue finalizada: só adendos e exclusão lógica são aceitos.
    if new.eventos is distinct from old.eventos then
        raise exception 'Ficha finalizada não pode ter os registros alterados. Reabra a ficha para corrigir.';
    end if;
    if new.dados is distinct from old.dados then
        raise exception 'Ficha finalizada não pode ter os dados alterados. Reabra a ficha para corrigir.';
    end if;
    if new.inicio_anestesia is distinct from old.inicio_anestesia
       or new.fim_anestesia is distinct from old.fim_anestesia then
        raise exception 'Ficha finalizada não pode ter os horários alterados. Reabra a ficha para corrigir.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_fa_bloqueia_finalizada on public.fichas_anestesicas;
create trigger trg_fa_bloqueia_finalizada
    before update on public.fichas_anestesicas
    for each row execute function public.fa_bloqueia_edicao_finalizada();

-- RLS -------------------------------------------------------------------------
-- A FA é o documento mais sensível do sistema e nasce fechada para anônimos,
-- ao contrário das tabelas antigas. O login do sistema usa Supabase Auth, então
-- auth.uid() é confiável aqui.
alter table public.fichas_anestesicas enable row level security;

drop policy if exists fa_select on public.fichas_anestesicas;
create policy fa_select on public.fichas_anestesicas
    for select to authenticated using (true);

drop policy if exists fa_insert on public.fichas_anestesicas;
create policy fa_insert on public.fichas_anestesicas
    for insert to authenticated with check (auth.uid() is not null);

drop policy if exists fa_update on public.fichas_anestesicas;
create policy fa_update on public.fichas_anestesicas
    for update to authenticated using (auth.uid() is not null);

-- Sem policy de DELETE: exclusão é sempre lógica, via deleted_at.
revoke all on public.fichas_anestesicas from anon;
