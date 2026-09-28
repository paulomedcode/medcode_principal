-- Baixar VÁRIOS lançamentos com a MESMA linha do extrato de uma vez (N:1 em lote).
-- Aplica a linha do banco a cada lançamento da lista, na ordem dada, consumindo o saldo
-- (min entre o que resta da linha e o que falta quitar do lançamento) até esgotar a linha.
-- Lançamentos incompatíveis (outra conta, outro sentido, já conciliados, sem saldo) são
-- pulados. Retorna quantos foram efetivamente baixados. Idempotente.

create or replace function public.reconcile_apply_many(p_imported_id uuid, p_transaction_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_imp public.finance_imported_transactions;
  v_tx public.finance_transactions;
  v_bank_rem numeric;
  v_tx_rem numeric;
  v_apply numeric;
  v_id uuid;
  v_count int := 0;
begin
  select * into v_imp from finance_imported_transactions where id = p_imported_id for update;
  if not found then raise exception 'Transação importada não encontrada.'; end if;
  if v_imp.reconciled then raise exception 'Esta linha do extrato já foi totalmente conciliada.'; end if;

  foreach v_id in array coalesce(p_transaction_ids, array[]::uuid[])
  loop
    v_bank_rem := abs(v_imp.amount) - coalesce(v_imp.applied_amount, 0);
    exit when v_bank_rem <= 0.0049; -- linha do banco esgotada

    select * into v_tx from finance_transactions where id = v_id for update;
    if not found then continue; end if;
    -- pula incompatíveis (não aborta o lote)
    if v_tx.account_id is distinct from v_imp.account_id then continue; end if;
    if (v_tx.type = 'ENTRADA') <> (v_imp.amount >= 0) then continue; end if;
    if v_tx.imported_transaction_id is not null then continue; end if;

    v_tx_rem := v_tx.amount - coalesce(v_tx.paid_amount, 0);
    v_apply := least(v_bank_rem, v_tx_rem);
    if v_apply <= 0.0049 then continue; end if;

    v_tx := public.settle_transaction(v_id, v_apply, v_imp.transaction_date, null, v_imp.account_id, null, p_imported_id);
    if v_tx.status = 'PAGO' then
      update finance_transactions set imported_transaction_id = p_imported_id where id = v_id;
    end if;

    -- atualiza a linha em memória e no banco
    v_imp.applied_amount := coalesce(v_imp.applied_amount, 0) + v_apply;
    v_imp.reconciled := v_imp.applied_amount >= abs(v_imp.amount) - 0.0049;
    update finance_imported_transactions
       set applied_amount = v_imp.applied_amount,
           reconciled = v_imp.reconciled,
           reconciled_transaction_id = case when v_imp.reconciled then v_id else reconciled_transaction_id end
     where id = p_imported_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

grant execute on function public.reconcile_apply_many(uuid, uuid[]) to authenticated, service_role;
