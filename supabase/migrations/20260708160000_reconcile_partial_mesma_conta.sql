-- LEVA 4 — médio: reconcile_partial deve exigir MESMA conta (como o reconcile_match já faz).
-- Conciliar uma linha do extrato de uma conta com lançamento de OUTRA conta descasaria o caixa.
-- Idempotente (create or replace).

create or replace function public.reconcile_partial(p_imported_id uuid, p_transaction_id uuid)
returns public.finance_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_imp public.finance_imported_transactions;
  v_tx public.finance_transactions;
begin
  select * into v_imp from finance_imported_transactions where id = p_imported_id for update;
  if not found then raise exception 'Transação importada não encontrada.'; end if;
  if v_imp.reconciled then raise exception 'Esta transação importada já foi conciliada.'; end if;

  select * into v_tx from finance_transactions where id = p_transaction_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_tx.account_id is distinct from v_imp.account_id then
    raise exception 'A linha do extrato e o lançamento são de contas diferentes.';
  end if;
  if (v_tx.type = 'ENTRADA') <> (v_imp.amount >= 0) then
    raise exception 'Sentidos incompatíveis: a linha do banco e o lançamento não são ambos entrada (ou ambos saída).';
  end if;

  v_tx := public.settle_transaction(p_transaction_id, abs(v_imp.amount), v_imp.transaction_date, null, v_imp.account_id, null, p_imported_id);

  if v_tx.status = 'PAGO' and v_tx.imported_transaction_id is null then
    update finance_transactions set imported_transaction_id = p_imported_id where id = p_transaction_id
    returning * into v_tx;
  end if;

  update finance_imported_transactions
     set reconciled = true, reconciled_transaction_id = p_transaction_id
   where id = p_imported_id;

  return v_tx;
end $$;

grant execute on function public.reconcile_partial(uuid, uuid) to anon, authenticated;
