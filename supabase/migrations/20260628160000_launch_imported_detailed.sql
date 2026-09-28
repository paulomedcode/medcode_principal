-- Conciliação: lançar em lote com controle POR LINHA (categoria, método, descrição,
-- valor e transferência individuais). A versão anterior aplicava uma única categoria
-- a todas as linhas; aqui cada item do extrato vira um lançamento com seus próprios dados.
--
-- p_items: jsonb array de objetos, um por importada selecionada:
--   {
--     id,                 -- uuid da finance_imported_transactions (obrigatório)
--     cost_center_id,     -- uuid (default centro "Geral")
--     category_id,        -- uuid | null
--     payment_method,     -- 'PIX'|'BOLETO'|'TRANSFERENCIA'|'CARTAO'|'DINHEIRO'|'OUTRO' (default 'OUTRO')
--     description,        -- texto editado (default = descrição do extrato)
--     amount,             -- valor editado, magnitude (default = valor do extrato)
--     as_transfer,        -- bool: lança como perna de transferência (fora do DRE)
--     counter_account_id  -- uuid da conta contrária (só p/ compor a descrição)
--   }
-- O TIPO (ENTRADA/SAIDA) segue sempre o sinal original da linha do extrato.
-- Pula importadas já conciliadas/ignoradas. Retorna a quantidade lançada.

create or replace function public.launch_imported_transactions_detailed(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_imp public.finance_imported_transactions;
  v_tx_id uuid;
  v_count int := 0;
  v_amount numeric;
  v_type text;
  v_desc text;
  v_cc uuid;
  v_as_transfer boolean;
  v_counter uuid;
  v_counter_name text;
  v_group uuid;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    select * into v_imp from finance_imported_transactions
      where id = (v_item->>'id')::uuid for update;
    if not found then continue; end if;
    if v_imp.reconciled or v_imp.ignored then continue; end if;

    -- Valor: usa o editado se vier; senão o do extrato. Magnitude positiva; sinal define o tipo.
    v_amount := abs(coalesce(nullif(v_item->>'amount', '')::numeric, v_imp.amount));
    if v_amount <= 0 then continue; end if;
    v_type := case when coalesce(v_imp.amount, 0) >= 0 then 'ENTRADA' else 'SAIDA' end;

    v_desc := coalesce(nullif(trim(v_item->>'description'), ''), v_imp.description, 'Lançamento conciliado (OFX)');
    v_cc := coalesce(nullif(v_item->>'cost_center_id', '')::uuid, '30000000-0000-0000-0000-000000000001');
    v_as_transfer := coalesce((v_item->>'as_transfer')::boolean, false);

    if v_as_transfer then
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
    else
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id)
      values
        (v_imp.account_id, nullif(v_item->>'category_id', '')::uuid, v_cc, v_type, v_amount, v_imp.transaction_date, v_desc,
         'PAGO', coalesce(nullif(v_item->>'payment_method', ''), 'OUTRO'), v_imp.id)
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
