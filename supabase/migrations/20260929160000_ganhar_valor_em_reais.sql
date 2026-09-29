-- O histórico do "ganhar oportunidade" escrevia "R$ 3,000.01": to_char segue o
-- locale do servidor (inglês). fmt_brl() formata no padrão brasileiro sem
-- depender dele: R$ 3.000,01.

create or replace function public.fmt_brl(p_valor numeric)
returns text language sql immutable as $$
    select 'R$ ' || translate(to_char(coalesce(p_valor, 0), 'FM999G999G999G990D00'), ',.', '.,');
$$;

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
            case when v_valor > 0 then ' · ' || v_n || ' parcela(s) somando ' || public.fmt_brl(v_valor) else '' end ||
            case when v_rec > 0 then ' · mensalidade de ' || public.fmt_brl(v_rec) else '' end,
            (select id from public.meu_cadastro()));

    return v_proj;
end; $function$;
