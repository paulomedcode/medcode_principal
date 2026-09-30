-- Oportunidade e projeto podem ter mais de um serviço (ex.: Site + Agente de IA).
--
-- `servicos` guarda a lista; `servico` continua existindo como o serviço
-- principal (o primeiro da lista), para filtros, relatórios e código antigo.
-- O gatilho mantém os dois em sincronia: quem grava só `servico` ganha
-- `servicos = {servico}`; quem grava `servicos` ganha `servico = servicos[1]`.

create or replace function public.sincronizar_servicos()
returns trigger language plpgsql set search_path to 'public' as $$
begin
    if new.servicos is null or cardinality(new.servicos) = 0
       or (tg_op = 'UPDATE' and new.servicos is not distinct from old.servicos
           and new.servico is distinct from old.servico) then
        new.servicos := array[coalesce(new.servico, 'SITE')];
    end if;
    -- sem repetidos, mantendo a ordem em que foram escolhidos
    select array_agg(s order by min_ord) into new.servicos
      from (select s, min(ord) as min_ord from unnest(new.servicos) with ordinality as t(s, ord) group by s) x;
    new.servico := new.servicos[1];
    return new;
end; $$;
revoke all on function public.sincronizar_servicos() from public, anon;

do $$
declare t text;
begin
    foreach t in array array['crm_oportunidades', 'projetos'] loop
        execute format('alter table public.%I add column if not exists servicos text[]', t);
        execute format('update public.%I set servicos = array[servico] where servicos is null', t);
        execute format('alter table public.%I alter column servicos set not null', t);
        execute format('alter table public.%I drop constraint if exists %I', t, t || '_servicos_check');
        execute format($c$alter table public.%I add constraint %I check (
            cardinality(servicos) >= 1
            and servicos <@ array['SITE', 'LANDING_PAGE', 'SISTEMA', 'AGENTE_IA', 'CONSULTORIA', 'OUTRO'])$c$,
            t, t || '_servicos_check');
        execute format('drop trigger if exists sincronizar_servicos on public.%I', t);
        execute format('create trigger sincronizar_servicos before insert or update on public.%I
                        for each row execute function public.sincronizar_servicos()', t);
    end loop;
end $$;

-- Ganhar oportunidade: o projeto herda a lista de serviços (p_dados.servicos,
-- ou os da oportunidade). Resto igual a 20260929160000.
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
    v_servicos  text[];
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

    if jsonb_typeof(p_dados->'servicos') = 'array' and jsonb_array_length(p_dados->'servicos') > 0 then
        select array_agg(x) into v_servicos from jsonb_array_elements_text(p_dados->'servicos') x;
    elsif nullif(p_dados->>'servico', '') is not null then
        v_servicos := array[p_dados->>'servico'];
    else
        v_servicos := v_op.servicos;
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

    insert into projetos (nome, party_id, oportunidade_id, servicos, status, responsavel_id,
                          data_inicio, prazo, valor_contratado, valor_recorrente, descricao)
    values (coalesce(nullif(trim(p_dados->>'nome'), ''), v_op.titulo), v_op.party_id, v_op.id,
            v_servicos, 'PLANEJAMENTO',
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
            case when v_valor > 0 then ' · ' || v_n || ' parcela(s) somando ' || public.fmt_brl(v_valor) else '' end ||
            case when v_rec > 0 then ' · mensalidade de ' || public.fmt_brl(v_rec) else '' end,
            (select id from public.meu_cadastro()));

    return v_proj;
end; $function$;
