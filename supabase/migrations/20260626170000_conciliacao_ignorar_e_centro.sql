-- Conciliação: ignorar item do extrato (OFX) + lançar escolhendo centro de custo.

-- 1. Permite "ignorar" um item importado (some da fila de conciliação sem virar lançamento).
alter table public.finance_imported_transactions
  add column if not exists ignored boolean not null default false;

-- 2. launch_imported_transactions passa a aceitar o centro de custo escolhido na hora de lançar.
--    (substitui a versão de 2 args para evitar ambiguidade de overload).
drop function if exists public.launch_imported_transactions(uuid[], uuid);

create or replace function public.launch_imported_transactions(p_ids uuid[], p_category_id uuid, p_cost_center_id uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_imp public.finance_imported_transactions;
  v_tx_id uuid;
  v_count int := 0;
begin
  for v_imp in
    select * from finance_imported_transactions where id = any(p_ids) for update
  loop
    if v_imp.reconciled or v_imp.ignored then continue; end if;     -- já conciliada/ignorada → pula
    if abs(coalesce(v_imp.amount, 0)) <= 0 then continue; end if;

    insert into finance_transactions
      (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id)
    values
      (v_imp.account_id, p_category_id, coalesce(p_cost_center_id, '30000000-0000-0000-0000-000000000001'),
       case when v_imp.amount >= 0 then 'ENTRADA' else 'SAIDA' end,
       abs(v_imp.amount), v_imp.transaction_date,
       coalesce(v_imp.description, 'Lançamento conciliado (OFX)'), 'PAGO', 'OUTRO', v_imp.id)
    returning id into v_tx_id;

    update finance_imported_transactions
       set reconciled = true, reconciled_transaction_id = v_tx_id
     where id = v_imp.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

grant execute on function public.launch_imported_transactions(uuid[], uuid, uuid) to anon, authenticated;
