-- Conciliação: permitir lançar uma linha do extrato como TRANSFERÊNCIA entre contas
-- (uma única perna — a desta conta), em vez de receita/despesa.
--
-- O extrato de cada conta mostra só um lado da transferência; por isso aqui criamos
-- apenas a perna correspondente a esta linha (com transfer_group_id próprio), que:
--   - NÃO entra no DRE (transfer_group_id preenchido),
--   - aparece como Transf. entrada/saída no Fluxo de Caixa,
--   - não duplica: a outra perna é lançada ao conciliar o extrato da outra conta.
--
-- Estende launch_imported_transactions com 2 params opcionais (defaults preservam o
-- comportamento atual). Dropa a assinatura de 3 args p/ evitar ambiguidade de overload.

drop function if exists public.launch_imported_transactions(uuid[], uuid, uuid);

create or replace function public.launch_imported_transactions(
  p_ids uuid[],
  p_category_id uuid,
  p_cost_center_id uuid default null,
  p_as_transfer boolean default false,
  p_counter_account_id uuid default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_imp public.finance_imported_transactions;
  v_tx_id uuid;
  v_count int := 0;
  v_counter_name text;
  v_desc text;
  v_group uuid;
begin
  -- Nome da conta contrária (só p/ compor a descrição da transferência).
  if p_as_transfer and p_counter_account_id is not null then
    select name into v_counter_name from finance_accounts where id = p_counter_account_id;
  end if;

  for v_imp in
    select * from finance_imported_transactions where id = any(p_ids) for update
  loop
    if v_imp.reconciled or v_imp.ignored then continue; end if;     -- já conciliada/ignorada → pula
    if abs(coalesce(v_imp.amount, 0)) <= 0 then continue; end if;

    if p_as_transfer then
      -- Transferência: perna única desta conta, fora do DRE.
      v_group := gen_random_uuid();
      v_desc := coalesce(v_imp.description, 'Transferência');
      if v_counter_name is not null then
        -- ENTRADA = veio da contrária (←); SAIDA = foi p/ contrária (→).
        v_desc := v_desc || case when v_imp.amount >= 0 then ' ← ' else ' → ' end || v_counter_name;
      end if;

      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, transfer_group_id)
      values
        (v_imp.account_id, null, coalesce(p_cost_center_id, '30000000-0000-0000-0000-000000000001'),
         case when v_imp.amount >= 0 then 'ENTRADA' else 'SAIDA' end,
         abs(v_imp.amount), v_imp.transaction_date, v_desc, 'PAGO', 'TRANSFERENCIA', v_imp.id, v_group)
      returning id into v_tx_id;
    else
      -- Receita/Despesa normal (comportamento original).
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id)
      values
        (v_imp.account_id, p_category_id, coalesce(p_cost_center_id, '30000000-0000-0000-0000-000000000001'),
         case when v_imp.amount >= 0 then 'ENTRADA' else 'SAIDA' end,
         abs(v_imp.amount), v_imp.transaction_date,
         coalesce(v_imp.description, 'Lançamento conciliado (OFX)'), 'PAGO', 'OUTRO', v_imp.id)
      returning id into v_tx_id;
    end if;

    update finance_imported_transactions
       set reconciled = true, reconciled_transaction_id = v_tx_id
     where id = v_imp.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

grant execute on function public.launch_imported_transactions(uuid[], uuid, uuid, boolean, uuid) to anon, authenticated;
