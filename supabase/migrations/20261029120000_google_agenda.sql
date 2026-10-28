-- Integração com o Google Agenda (api/google.js).
--
-- google_contas: a ligação de cada pessoa com a conta Google dela. O
--   refresh_token é a chave que deixa o servidor falar com o Google em nome da
--   pessoa: o navegador NUNCA lê essa coluna (só o servidor, com a chave de
--   serviço). A pessoa enxerga só se está conectada e com qual e-mail.
-- google_eventos: qual evento do Google corresponde a cada item do sistema
--   (compromisso do Planejamento Geral ou reunião marcada pelo histórico),
--   para atualizar em vez de duplicar.

create table if not exists public.google_contas (
    user_id        uuid primary key references public.users(id) on delete cascade,
    email          text,
    refresh_token  text not null,
    calendario_id  text not null default 'primary',
    conectado_em   timestamptz not null default now()
);
alter table public.google_contas enable row level security;

drop policy if exists google_contas_ver_a_minha on public.google_contas;
create policy google_contas_ver_a_minha on public.google_contas
    for select to authenticated
    using (user_id = (select id from public.meu_cadastro()));

revoke all on public.google_contas from anon, authenticated;
grant select (user_id, email, calendario_id, conectado_em) on public.google_contas to authenticated;

create table if not exists public.google_eventos (
    origem      text not null check (origem in ('linha', 'atividade')),
    origem_id   uuid not null,
    user_id     uuid not null references public.users(id) on delete cascade,
    event_id    text not null,
    assinatura  text,
    atualizado_em timestamptz not null default now(),
    primary key (origem, origem_id)
);
alter table public.google_eventos enable row level security;

drop policy if exists google_eventos_ver_os_meus on public.google_eventos;
create policy google_eventos_ver_os_meus on public.google_eventos
    for select to authenticated
    using (user_id = (select id from public.meu_cadastro()));

revoke all on public.google_eventos from anon, authenticated;
grant select on public.google_eventos to authenticated;

-- Reunião marcada pelo sistema: link do Meet e evento do Google.
alter table public.crm_atividades
    add column if not exists meet_link text,
    add column if not exists google_event_id text;
