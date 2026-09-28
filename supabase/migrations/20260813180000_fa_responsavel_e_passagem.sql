-- =============================================================================
-- Ficha Anestésica — responsável pelo caso e passagem de plantão
--
-- Até aqui, qualquer usuário com "Criar/Editar FA" registrava em qualquer ficha
-- em andamento: a única trava era a da ficha finalizada. Em sala isso é grave —
-- dois anestesistas escrevendo na mesma ficha viram uma ficha de ninguém, e o
-- documento é médico-legal.
--
-- A regra passa a ser: a ficha em andamento tem um responsável, e só ele
-- registra nela. Quem entra depois vê tudo e não altera nada.
--
-- Troca de plantão é caso legítimo e previsto: o responsável indica quem assume
-- (`passagem_para_id`) e a outra pessoa assume, ficando registrado quem passou,
-- quem assumiu e quando. A partir daí ela é a responsável.
--
-- A trava mora aqui, e não só na tela, porque é regra do documento: nenhum
-- caminho (outra aba, script, bug) deve escrever numa ficha que está na mão de
-- outra pessoa sem deixar rastro.
-- =============================================================================

alter table public.fichas_anestesicas add column if not exists responsavel_id       uuid references public.users(id) on delete set null;
alter table public.fichas_anestesicas add column if not exists responsavel_nome     text;
alter table public.fichas_anestesicas add column if not exists passagem_para_id     uuid references public.users(id) on delete set null;
alter table public.fichas_anestesicas add column if not exists passagem_para_nome   text;
alter table public.fichas_anestesicas add column if not exists passagens            jsonb not null default '[]'::jsonb;

comment on column public.fichas_anestesicas.responsavel_id   is 'Quem está com o caso agora. Só ele registra na ficha em andamento.';
comment on column public.fichas_anestesicas.passagem_para_id is 'Anestesista indicado para assumir. Enquanto não assume, a ficha continua com o responsável.';
comment on column public.fichas_anestesicas.passagens        is 'Trilha da troca de plantão: [{de_id, de_nome, para_id, para_nome, assumida_em, motivo}].';

-- Fichas que já existem passam a ser de quem as abriu ------------------------
update public.fichas_anestesicas
   set responsavel_id = anestesista_id,
       responsavel_nome = anestesista_nome
 where responsavel_id is null
   and anestesista_id is not null;

create index if not exists idx_fa_responsavel on public.fichas_anestesicas (responsavel_id) where deleted_at is null;

-- Trava do responsável --------------------------------------------------------
create or replace function public.fa_exige_responsavel()
returns trigger language plpgsql as $$
declare
    v_uid    uuid := auth.uid();
    v_ultima jsonb;
begin
    -- Ficha finalizada já tem a trava da assinatura, que é mais estrita.
    if old.status <> 'em_andamento' then
        return new;
    end if;

    -- Ficha sem responsável (aberta antes desta regra, ou sem anestesista
    -- identificado) segue como era: não há de quem proteger.
    if old.responsavel_id is null then
        return new;
    end if;

    -- Sem sessão só chega quem usa a chave de serviço — manutenção nossa. O
    -- anônimo não passa da RLS, que exige `authenticated` para atualizar.
    if v_uid is null then
        return new;
    end if;

    if v_uid = old.responsavel_id then
        return new;
    end if;

    -- Terceiro: o único movimento permitido é assumir o caso, e ele nunca é
    -- silencioso — entra na trilha de passagens, com quem passou e quem assumiu.
    if new.responsavel_id is distinct from old.responsavel_id
       and new.responsavel_id = v_uid
       and new.eventos is not distinct from old.eventos
       and new.dados   is not distinct from old.dados
       and jsonb_array_length(new.passagens) = jsonb_array_length(old.passagens) + 1
    then
        v_ultima := new.passagens -> -1;

        if (v_ultima ->> 'para_id') = v_uid::text
           and (v_ultima ->> 'de_id') is not distinct from old.responsavel_id::text
           and (
                -- indicado pelo próprio responsável (troca de plantão combinada)
                old.passagem_para_id = v_uid
                -- ou assumido por conta própria, e aí o motivo é obrigatório
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

comment on function public.fa_exige_responsavel is 'Ficha em andamento só aceita alteração de quem está com o caso. Terceiro só entra assumindo, e a passagem fica registrada.';

drop trigger if exists trg_fa_responsavel on public.fichas_anestesicas;
create trigger trg_fa_responsavel
    before update on public.fichas_anestesicas
    for each row execute function public.fa_exige_responsavel();
