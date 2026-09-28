-- ============================================================================
-- RLS — Fase 2b: fechar a porta lateral das funções do financeiro.
--
-- A Fase 2 pôs política em todas as tabelas do financeiro. Só que 20 funções
-- (`settle_transaction`, `create_transfer`, `reconcile_*`, `pay_repasse`…) são
-- SECURITY DEFINER — elas rodam como o DONO das tabelas, e RLS não se aplica ao
-- dono. Elas existem por um bom motivo: baixa, transferência e conciliação
-- precisam mexer em três tabelas de uma vez, de forma atômica. Mas o efeito
-- colateral é que a política que acabamos de escrever não as alcança.
--
-- E `EXECUTE` está concedido a `authenticated`, quer dizer: a todo mundo que
-- tem login. Um médico não conseguiria mais LER o caixa depois da Fase 2, mas
-- poderia continuar chamando `settle_transaction` pela API e dar baixa num
-- lançamento — sem nunca abrir a tela do financeiro.
--
-- COMO SE FECHA: cada função vira duas. A original é renomeada com o sufixo
-- `__interno` e perde o EXECUTE de quem não é dono; no lugar dela nasce uma
-- função de mesmo nome e mesma assinatura que primeiro confere a permissão e só
-- então delega. Nenhum corpo de função é reescrito — o que muda é quem pode
-- bater na porta. Reverter é renomear de volta.
--
-- A EXCEÇÃO DA ESCALA, de novo: `settle_transaction`, `settle_group` e
-- `delete_payment` são chamadas pelo BaixaModal, que a tela de Repasses
-- reaproveita. Quem opera a escala precisa delas — mas só sobre lançamento de
-- repasse. Então a conferência dessas três é: tem 'Editar Financeiro', OU opera
-- a escala E o lançamento em questão tem `shift_id`. É a mesma fronteira das
-- políticas de tabela da Fase 2.
--
-- `settle_transaction` também é chamada por dentro das quatro funções de
-- conciliação. Isso continua funcionando: elas passam a chamar a versão com
-- porteiro, e quem concilia tem 'Editar Financeiro' — a conferência apenas se
-- repete, com o mesmo resultado.
-- ============================================================================

do $mig$
declare
    f record;
    v_corpo text;
    v_alvo  text;
begin
    for f in
        select p.oid,
               p.proname,
               pg_get_function_arguments(p.oid)          as assinatura,
               pg_get_function_result(p.oid)             as retorno,
               array_to_string(p.proargnames, ', ')      as nomes,
               -- Só os TIPOS: é o que to_regprocedure e ALTER FUNCTION aceitam
               -- (pg_get_function_identity_arguments traz os nomes junto e não serve aqui).
               oidvectortypes(p.proargtypes)             as identidade
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prosecdef
           and p.proname in (
             'adjust_account_balance', 'approve_quote', 'create_quote', 'create_repasse',
             'create_split_transactions', 'create_transfer', 'delete_split_group',
             'delete_transfer', 'launch_imported_transactions',
             'launch_imported_transactions_detailed', 'pay_repasse', 'reconcile_apply',
             'reconcile_apply_many', 'reconcile_match', 'reconcile_partial',
             'unreconcile_transaction', 'update_quote'
           )
    loop
        v_alvo := f.proname || '__interno';

        -- Já aplicado (migration rodando de novo): não faz nada.
        if to_regprocedure(format('public.%I(%s)', v_alvo, f.identidade)) is not null then
            continue;
        end if;

        execute format('alter function public.%I(%s) rename to %I',
                       f.proname, f.identidade, v_alvo);

        if f.retorno = 'void' then
            v_corpo := format('perform public.%I(%s);', v_alvo, f.nomes);
        else
            v_corpo := format('return public.%I(%s);', v_alvo, f.nomes);
        end if;

        execute format(
            'create function public.%I(%s) returns %s '
            'language plpgsql security definer set search_path = public as $corpo$ '
            'begin '
            '  if not public.tem_permissao(''Editar Financeiro'') then '
            '    raise exception ''Sem permissão para alterar o financeiro.'' using errcode = ''42501''; '
            '  end if; '
            '  %s '
            'end; $corpo$',
            f.proname, f.assinatura, f.retorno, v_corpo);

        -- A original só é alcançável por quem é dono (isto é, pelas próprias
        -- funções SECURITY DEFINER) e pelo backend.
        execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                       v_alvo, f.identidade);
        execute format('revoke all on function public.%I(%s) from public, anon',
                       f.proname, f.identidade);
        execute format('grant execute on function public.%I(%s) to authenticated, service_role',
                       f.proname, f.identidade);
    end loop;
end $mig$;

-- ----------------------------------------------------------------------------
-- As três que a tela de Repasses usa. Escritas à mão porque a conferência
-- depende do argumento: precisa olhar SE o lançamento é de repasse.
-- ----------------------------------------------------------------------------

-- Vale mexer neste lançamento? (a mesma fronteira das políticas de tabela)
create or replace function public.pode_mexer_no_lancamento(p_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.tem_permissao('Editar Financeiro')
        or (
            public.opera_escala()
            and exists (
                select 1 from public.finance_transactions t
                 where t.id = p_transaction_id and t.shift_id is not null
            )
        );
$$;

revoke all on function public.pode_mexer_no_lancamento(uuid) from public, anon;
grant execute on function public.pode_mexer_no_lancamento(uuid) to authenticated, service_role;

do $mig$
begin
    if to_regprocedure('public.settle_transaction__interno(uuid, numeric, date, text, uuid, text, uuid)') is null then
        alter function public.settle_transaction(uuid, numeric, date, text, uuid, text, uuid)
            rename to settle_transaction__interno;

        create function public.settle_transaction(
            p_transaction_id uuid, p_amount numeric, p_date date, p_method text,
            p_account_id uuid, p_doc text, p_imported_id uuid default null::uuid
        ) returns public.finance_transactions
        language plpgsql security definer set search_path = public as $corpo$
        begin
            if not public.pode_mexer_no_lancamento(p_transaction_id) then
                raise exception 'Sem permissão para dar baixa neste lançamento.' using errcode = '42501';
            end if;
            return public.settle_transaction__interno(
                p_transaction_id, p_amount, p_date, p_method, p_account_id, p_doc, p_imported_id);
        end; $corpo$;

        revoke all on function public.settle_transaction__interno(uuid, numeric, date, text, uuid, text, uuid)
            from public, anon, authenticated;
        revoke all on function public.settle_transaction(uuid, numeric, date, text, uuid, text, uuid)
            from public, anon;
        grant execute on function public.settle_transaction(uuid, numeric, date, text, uuid, text, uuid)
            to authenticated, service_role;
    end if;

    if to_regprocedure('public.settle_group__interno(uuid, date, text, uuid, text)') is null then
        alter function public.settle_group(uuid, date, text, uuid, text)
            rename to settle_group__interno;

        create function public.settle_group(
            p_group_id uuid, p_date date, p_method text, p_account_id uuid, p_doc text
        ) returns integer
        language plpgsql security definer set search_path = public as $corpo$
        begin
            -- Um grupo de rateio/parcelas: basta que as linhas dele sejam
            -- alcançáveis por quem chamou.
            if not (
                public.tem_permissao('Editar Financeiro')
                or (
                    public.opera_escala()
                    and exists (
                        select 1 from public.finance_transactions t
                         where t.split_group_id = p_group_id and t.shift_id is not null
                    )
                )
            ) then
                raise exception 'Sem permissão para dar baixa neste grupo.' using errcode = '42501';
            end if;
            return public.settle_group__interno(p_group_id, p_date, p_method, p_account_id, p_doc);
        end; $corpo$;

        revoke all on function public.settle_group__interno(uuid, date, text, uuid, text)
            from public, anon, authenticated;
        revoke all on function public.settle_group(uuid, date, text, uuid, text) from public, anon;
        grant execute on function public.settle_group(uuid, date, text, uuid, text)
            to authenticated, service_role;
    end if;

    if to_regprocedure('public.delete_payment__interno(uuid)') is null then
        alter function public.delete_payment(uuid) rename to delete_payment__interno;

        create function public.delete_payment(p_payment_id uuid)
        returns void
        language plpgsql security definer set search_path = public as $corpo$
        declare v_tx uuid;
        begin
            select p.transaction_id into v_tx
              from public.finance_transaction_payments p
             where p.id = p_payment_id;
            if v_tx is null or not public.pode_mexer_no_lancamento(v_tx) then
                raise exception 'Sem permissão para apagar esta baixa.' using errcode = '42501';
            end if;
            perform public.delete_payment__interno(p_payment_id);
        end; $corpo$;

        revoke all on function public.delete_payment__interno(uuid) from public, anon, authenticated;
        revoke all on function public.delete_payment(uuid) from public, anon;
        grant execute on function public.delete_payment(uuid) to authenticated, service_role;
    end if;
end $mig$;

-- ============================================================================
-- REVERSÃO: apagar cada função de mesmo nome e renomear a `__interno` de volta,
-- devolvendo o EXECUTE a `authenticated`. Exemplo para uma delas:
--
--   drop function public.settle_transaction(uuid, numeric, date, text, uuid, text, uuid);
--   alter function public.settle_transaction__interno(uuid, numeric, date, text, uuid, text, uuid)
--       rename to settle_transaction;
--   grant execute on function public.settle_transaction(uuid, numeric, date, text, uuid, text, uuid)
--       to authenticated;
-- ============================================================================
