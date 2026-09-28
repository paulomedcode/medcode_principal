-- LEVA 2 — integridade de dados.
-- A1 (relatórios): lançar do extrato NÃO pode gravar valor diferente da linha do banco.
--   O valor do banco é fato: valida v_amount == abs(v_imp.amount) (±0,01) e recusa divergência.
-- A2 (baixas): sync_auto_payment recalcula o status pelas baixas (não confia cegamente em
--   NEW.status), evitando PARCIAL com pendente zero ou PENDENTE gravado por cima de baixas.
-- Idempotente (create or replace).

-- Recria launch_imported_transactions_detailed com a validação de valor.
create or replace function public.launch_imported_transactions_detailed(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb; v_imp public.finance_imported_transactions; v_tx_id uuid; v_first uuid;
  v_count int := 0; v_amount numeric; v_type text; v_desc text; v_cc uuid; v_method text;
  v_ref text; v_doctor uuid; v_party uuid; v_as_transfer boolean; v_counter uuid;
  v_counter_name text; v_group uuid; v_splits jsonb; v_split_sum numeric; r jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    select * into v_imp from finance_imported_transactions where id = (v_item->>'id')::uuid for update;
    if not found then continue; end if;
    if v_imp.reconciled or v_imp.ignored then continue; end if;

    v_amount := abs(coalesce(nullif(v_item->>'amount', '')::numeric, v_imp.amount));
    if v_amount <= 0 then continue; end if;
    -- O valor do banco é fato: o lançamento criado tem de valer o mesmo que a linha do extrato.
    if abs(v_amount - abs(v_imp.amount)) > 0.01 then
      raise exception 'Valor do lançamento (R$ %) difere da linha do banco (R$ %). O valor do extrato não pode ser editado ao lançar.',
        trim(to_char(v_amount, 'FM999G999G990D00')), trim(to_char(abs(v_imp.amount), 'FM999G999G990D00'));
    end if;
    v_type := case when coalesce(v_imp.amount, 0) >= 0 then 'ENTRADA' else 'SAIDA' end;
    v_desc := coalesce(nullif(trim(v_item->>'description'), ''), v_imp.description, 'Lançamento conciliado (OFX)');
    v_cc := coalesce(nullif(v_item->>'cost_center_id', '')::uuid, '30000000-0000-0000-0000-000000000001');
    v_method := coalesce(nullif(v_item->>'payment_method', ''), 'OUTRO');
    v_ref := nullif(v_item->>'reference_month', '');
    v_doctor := nullif(v_item->>'doctor_id', '')::uuid;
    v_party := nullif(v_item->>'party_id', '')::uuid;
    v_as_transfer := coalesce((v_item->>'as_transfer')::boolean, false);
    v_splits := v_item->'splits';

    if v_as_transfer then
      v_counter := nullif(v_item->>'counter_account_id', '')::uuid;
      v_counter_name := null;
      if v_counter is not null then select name into v_counter_name from finance_accounts where id = v_counter; end if;
      if v_counter_name is not null then
        v_desc := v_desc || case when v_imp.amount >= 0 then ' ← ' else ' → ' end || v_counter_name;
      end if;
      v_group := gen_random_uuid();
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, transfer_group_id, reference_month, doctor_id, party_id)
      values
        (v_imp.account_id, null, v_cc, v_type, v_amount, v_imp.transaction_date, v_desc, 'PAGO', 'TRANSFERENCIA', v_imp.id, v_group, v_ref, v_doctor, v_party)
      returning id into v_tx_id;

    elsif jsonb_typeof(v_splits) = 'array' and jsonb_array_length(v_splits) >= 2 then
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
        insert into finance_transactions
          (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, split_group_id, reference_month, doctor_id, party_id)
        values
          (v_imp.account_id, nullif(r->>'category_id','')::uuid, v_cc, v_type, abs(coalesce((r->>'amount')::numeric,0)), v_imp.transaction_date, v_desc, 'PAGO', v_method, case when v_first is null then v_imp.id else null end, v_group, v_ref, v_doctor, v_party)
        returning id into v_tx_id;
        if v_first is null then v_first := v_tx_id; end if;
      end loop;
      v_tx_id := v_first;

    else
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, reference_month, doctor_id, party_id)
      values
        (v_imp.account_id, nullif(v_item->>'category_id','')::uuid, v_cc, v_type, v_amount, v_imp.transaction_date, v_desc, 'PAGO', v_method, v_imp.id, v_ref, v_doctor, v_party)
      returning id into v_tx_id;
    end if;

    update finance_imported_transactions set reconciled = true, reconciled_transaction_id = v_tx_id where id = v_imp.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

grant execute on function public.launch_imported_transactions_detailed(jsonb) to anon, authenticated;

-- A2: status sempre coerente com as baixas (não confia no NEW.status vindo do cliente).
create or replace function public.sync_auto_payment() returns trigger
language plpgsql as $$
declare v_manual numeric; v_gap numeric; v_sum numeric;
begin
  -- O corpo faz UPDATE em finance_transactions (status/paid_amount), o que re-dispararia
  -- este mesmo trigger (que ouve 'status'). Corta a recursão: só a 1ª passada executa.
  if pg_trigger_depth() > 1 then return NEW; end if;

  select coalesce(sum(amount), 0) into v_manual from finance_transaction_payments where transaction_id = NEW.id and not auto;

  if NEW.status = 'PAGO' then
    v_gap := NEW.amount - v_manual;
    delete from finance_transaction_payments where transaction_id = NEW.id and auto;
    if v_gap > 0.0049 then
      insert into finance_transaction_payments (transaction_id, account_id, amount, payment_date, payment_method, cost_center_id, auto, tx_type)
      values (NEW.id, NEW.account_id, v_gap, coalesce(NEW.transaction_date, current_date), NEW.payment_method, NEW.cost_center_id, true, NEW.type);
    end if;
  else
    delete from finance_transaction_payments where transaction_id = NEW.id and auto;
  end if;

  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = NEW.id;
  update finance_transactions
     set paid_amount = v_sum,
         -- status derivado das baixas: nunca PARCIAL com pendente zero, nunca PENDENTE sobre baixas.
         status = case when v_sum >= NEW.amount - 0.0049 then 'PAGO' when v_sum > 0.0049 then 'PARCIAL' else NEW.status end
   where id = NEW.id;
  return NEW;
end $$;
