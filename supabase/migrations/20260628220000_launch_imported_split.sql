-- Conciliação com RATEIO por linha: uma linha do extrato pode ser dividida em 2+
-- categorias (ex.: parcela de empréstimo = principal 6.1.1 + juros 4.1.1), lançada
-- como linhas-irmãs (split_group_id) já conciliadas. A soma do rateio deve bater
-- com o valor da linha. Mantém compatível: itens sem "splits" seguem como antes.
--
-- Cada item de p_items pode ter:
--   splits: [{ category_id, amount }, ...]   -- opcional; 2+ => rateio

create or replace function public.launch_imported_transactions_detailed(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_imp public.finance_imported_transactions;
  v_tx_id uuid;
  v_first uuid;
  v_count int := 0;
  v_amount numeric;
  v_type text;
  v_desc text;
  v_cc uuid;
  v_method text;
  v_as_transfer boolean;
  v_counter uuid;
  v_counter_name text;
  v_group uuid;
  v_splits jsonb;
  v_split_sum numeric;
  r jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    select * into v_imp from finance_imported_transactions
      where id = (v_item->>'id')::uuid for update;
    if not found then continue; end if;
    if v_imp.reconciled or v_imp.ignored then continue; end if;

    v_amount := abs(coalesce(nullif(v_item->>'amount', '')::numeric, v_imp.amount));
    if v_amount <= 0 then continue; end if;
    v_type := case when coalesce(v_imp.amount, 0) >= 0 then 'ENTRADA' else 'SAIDA' end;
    v_desc := coalesce(nullif(trim(v_item->>'description'), ''), v_imp.description, 'Lançamento conciliado (OFX)');
    v_cc := coalesce(nullif(v_item->>'cost_center_id', '')::uuid, '30000000-0000-0000-0000-000000000001');
    v_method := coalesce(nullif(v_item->>'payment_method', ''), 'OUTRO');
    v_as_transfer := coalesce((v_item->>'as_transfer')::boolean, false);
    v_splits := v_item->'splits';

    if v_as_transfer then
      -- Transferência: perna única, fora do DRE.
      v_counter := nullif(v_item->>'counter_account_id', '')::uuid;
      v_counter_name := null;
      if v_counter is not null then select name into v_counter_name from finance_accounts where id = v_counter; end if;
      if v_counter_name is not null then
        v_desc := v_desc || case when v_imp.amount >= 0 then ' ← ' else ' → ' end || v_counter_name;
      end if;
      v_group := gen_random_uuid();
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, transfer_group_id)
      values
        (v_imp.account_id, null, v_cc, v_type, v_amount, v_imp.transaction_date, v_desc, 'PAGO', 'TRANSFERENCIA', v_imp.id, v_group)
      returning id into v_tx_id;

    elsif v_splits is not null and jsonb_array_length(v_splits) >= 2 then
      -- Rateio: a soma das categorias precisa bater com o valor da linha.
      v_split_sum := 0;
      for r in select * from jsonb_array_elements(v_splits) loop
        v_split_sum := v_split_sum + abs(coalesce((r->>'amount')::numeric, 0));
      end loop;
      if abs(v_split_sum - v_amount) > 0.01 then
        raise exception 'A soma do rateio (%) difere do valor da linha (%).', v_split_sum, v_amount;
      end if;

      v_group := gen_random_uuid();
      v_first := null;
      for r in select * from jsonb_array_elements(v_splits) loop
        if abs(coalesce((r->>'amount')::numeric, 0)) <= 0 then continue; end if;
        insert into finance_transactions
          (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, split_group_id)
        values
          (v_imp.account_id, nullif(r->>'category_id', '')::uuid, v_cc, v_type, abs((r->>'amount')::numeric),
           v_imp.transaction_date, v_desc, 'PAGO', v_method, v_imp.id, v_group)
        returning id into v_tx_id;
        if v_first is null then v_first := v_tx_id; end if;
      end loop;
      v_tx_id := v_first;

    else
      -- Receita/Despesa normal (1 categoria).
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id)
      values
        (v_imp.account_id, nullif(v_item->>'category_id', '')::uuid, v_cc, v_type, v_amount, v_imp.transaction_date, v_desc,
         'PAGO', v_method, v_imp.id)
      returning id into v_tx_id;
    end if;

    update finance_imported_transactions
       set reconciled = true, reconciled_transaction_id = v_tx_id
     where id = v_imp.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

grant execute on function public.launch_imported_transactions_detailed(jsonb) to anon, authenticated;

-- Desconciliar passa a soltar TODAS as pernas de um rateio (split_group), não só a clicada.
create or replace function public.unreconcile_transaction(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_imp_id uuid;
  v_group uuid;
begin
  select imported_transaction_id, split_group_id into v_imp_id, v_group
    from finance_transactions where id = p_transaction_id;

  update finance_imported_transactions
     set reconciled = false, reconciled_transaction_id = null
   where id = v_imp_id or reconciled_transaction_id = p_transaction_id;

  update finance_transactions
     set imported_transaction_id = null
   where id = p_transaction_id
      or (v_group is not null and split_group_id = v_group);
end; $$;

grant execute on function public.unreconcile_transaction(uuid) to anon, authenticated;
