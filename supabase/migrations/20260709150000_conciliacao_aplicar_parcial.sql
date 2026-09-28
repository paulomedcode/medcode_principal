-- CONCILIAÇÃO N:1 — uma linha do extrato paga VÁRIOS lançamentos (ex.: 1 PIX de R$ 36.800
-- a um médico quita vários repasses de R$ 5.000/12.000/...). A linha do banco passa a ACUMULAR
-- quanto já foi aplicado (applied_amount); enquanto sobrar saldo, continua na fila pra
-- conciliar com o próximo lançamento. Generaliza a baixa parcial (banco menor) e cobre o
-- caso novo (banco maior). Idempotente.

alter table public.finance_imported_transactions
  add column if not exists applied_amount numeric not null default 0;

-- Aplica a linha do extrato a UM lançamento: baixa = min(saldo da linha, saldo a quitar do
-- lançamento). O lançamento é quitado/parcial conforme o valor; a linha acumula o aplicado e
-- só vira "conciliada" quando o total dela foi aplicado.
create or replace function public.reconcile_apply(p_imported_id uuid, p_transaction_id uuid)
returns public.finance_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_imp public.finance_imported_transactions;
  v_tx public.finance_transactions;
  v_bank_rem numeric;
  v_tx_rem numeric;
  v_apply numeric;
begin
  select * into v_imp from finance_imported_transactions where id = p_imported_id for update;
  if not found then raise exception 'Transação importada não encontrada.'; end if;
  if v_imp.reconciled then raise exception 'Esta linha do extrato já foi totalmente conciliada.'; end if;

  select * into v_tx from finance_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_tx.account_id is distinct from v_imp.account_id then
    raise exception 'A linha do extrato e o lançamento são de contas diferentes.';
  end if;
  if (v_tx.type = 'ENTRADA') <> (v_imp.amount >= 0) then
    raise exception 'Sentidos incompatíveis: a linha do banco e o lançamento não são ambos entrada (ou ambos saída).';
  end if;
  if v_tx.imported_transaction_id is not null then
    raise exception 'Este lançamento já está conciliado com uma linha do extrato.';
  end if;

  v_bank_rem := abs(v_imp.amount) - coalesce(v_imp.applied_amount, 0);
  v_tx_rem := v_tx.amount - coalesce(v_tx.paid_amount, 0);
  v_apply := least(v_bank_rem, v_tx_rem);
  if v_apply <= 0.0049 then raise exception 'Nada a aplicar (saldo zero na linha do banco ou no lançamento).'; end if;

  -- Baixa vinculada à linha do extrato (na data/conta do extrato).
  v_tx := public.settle_transaction(p_transaction_id, v_apply, v_imp.transaction_date, null, v_imp.account_id, null, p_imported_id);

  -- Lançamento quitado por completo → trava (conciliado com esta linha).
  if v_tx.status = 'PAGO' then
    update finance_transactions set imported_transaction_id = p_imported_id where id = p_transaction_id
    returning * into v_tx;
  end if;

  -- Linha do extrato acumula o aplicado; conciliada quando aplicou tudo.
  update finance_imported_transactions
     set applied_amount = coalesce(applied_amount, 0) + v_apply,
         reconciled = (coalesce(applied_amount, 0) + v_apply) >= abs(amount) - 0.0049,
         reconciled_transaction_id = case when (coalesce(applied_amount, 0) + v_apply) >= abs(amount) - 0.0049 then p_transaction_id else reconciled_transaction_id end
   where id = p_imported_id;

  return v_tx;
end $$;

-- delete_payment: estornar baixa devolve o valor à linha do extrato de origem (applied_amount)
-- e reabre a linha (reconciled=false), além de destravar o lançamento.
create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_imp uuid; v_conc uuid; v_pay numeric; v_amount numeric; v_sum numeric;
begin
  select transaction_id, imported_transaction_id, amount into v_tx, v_imp, v_pay from finance_transaction_payments where id = p_payment_id;
  if v_tx is null then raise exception 'Baixa não encontrada.'; end if;

  select imported_transaction_id into v_conc from finance_transactions where id = v_tx;
  if v_conc is not null and v_conc is distinct from v_imp then
    raise exception 'Lançamento conciliado com o extrato. Remova a conciliação antes de estornar esta baixa.';
  end if;

  delete from finance_transaction_payments where id = p_payment_id;

  if v_imp is not null then
    update finance_imported_transactions
       set applied_amount = greatest(0, coalesce(applied_amount, 0) - coalesce(v_pay, 0)),
           reconciled = false,
           reconciled_transaction_id = case when reconciled_transaction_id = v_tx then null else reconciled_transaction_id end
     where id = v_imp;
    update finance_transactions set imported_transaction_id = null where id = v_tx and imported_transaction_id = v_imp;
  end if;

  select amount into v_amount from finance_transactions where id = v_tx;
  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = v_tx;
  update finance_transactions
    set status = case when v_sum >= v_amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = v_tx;
end $$;

-- unreconcile: ao liberar um lançamento, devolve o valor das baixas vinculadas às linhas do
-- extrato de origem (applied_amount) e reabre essas linhas.
create or replace function public.unreconcile_transaction(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_imp_id uuid; v_amount numeric; v_sum numeric; r record;
begin
  select imported_transaction_id into v_imp_id from finance_transactions where id = p_transaction_id;

  -- Para cada linha do extrato que originou baixas deste lançamento, devolve o aplicado e reabre.
  for r in
    select imported_transaction_id as imp, coalesce(sum(amount), 0) as val
      from finance_transaction_payments
     where transaction_id = p_transaction_id and imported_transaction_id is not null
     group by imported_transaction_id
  loop
    update finance_imported_transactions
       set applied_amount = greatest(0, coalesce(applied_amount, 0) - r.val),
           reconciled = false,
           reconciled_transaction_id = case when reconciled_transaction_id = p_transaction_id then null else reconciled_transaction_id end
     where id = r.imp;
  end loop;

  -- Estorna as baixas que vieram da conciliação.
  delete from finance_transaction_payments
   where transaction_id = p_transaction_id and imported_transaction_id is not null;

  -- Linha vinculada pelo caminho antigo (sem baixa) também é liberada.
  update finance_imported_transactions
     set reconciled = false, reconciled_transaction_id = null
   where id = v_imp_id or reconciled_transaction_id = p_transaction_id;

  update finance_transactions set imported_transaction_id = null where id = p_transaction_id;

  select amount into v_amount from finance_transactions where id = p_transaction_id;
  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = p_transaction_id;
  update finance_transactions
    set status = case when v_sum >= v_amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = p_transaction_id;
end $$;

grant execute on function public.reconcile_apply(uuid, uuid) to authenticated, service_role;
grant execute on function public.delete_payment(uuid) to authenticated, service_role;
grant execute on function public.unreconcile_transaction(uuid) to authenticated, service_role;
