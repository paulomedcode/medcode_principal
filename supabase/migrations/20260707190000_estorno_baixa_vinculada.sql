-- ESTORNO CONSISTENTE DA BAIXA PARCIAL VIA CONCILIAÇÃO.
-- A baixa passa a guardar DE QUAL LINHA DO EXTRATO ela veio
-- (finance_transaction_payments.imported_transaction_id). Com isso, estornar a baixa
-- devolve a linha do banco para a fila de conciliação e destrava o lançamento —
-- sem estados órfãos. Idempotente.

alter table public.finance_transaction_payments
  add column if not exists imported_transaction_id uuid
    references public.finance_imported_transactions(id) on delete set null;

-- settle_transaction ganha o vínculo opcional. A assinatura antiga (6 args) é removida
-- para não haver ambiguidade; chamadas antigas seguem válidas via default null.
drop function if exists public.settle_transaction(uuid, numeric, date, text, uuid, text);
create or replace function public.settle_transaction(
  p_transaction_id uuid, p_amount numeric, p_date date, p_method text, p_account_id uuid, p_doc text,
  p_imported_id uuid default null)
returns public.finance_transactions
language plpgsql security definer set search_path = public as $$
declare v_tx public.finance_transactions; v_acc uuid; v_sum numeric; v_remaining numeric;
begin
  select * into v_tx from finance_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'O valor da baixa deve ser maior que zero.'; end if;
  v_remaining := v_tx.amount - v_tx.paid_amount;
  if p_amount > v_remaining + 0.0049 then raise exception 'Valor da baixa (%) maior que o saldo a quitar (%).', p_amount, v_remaining; end if;

  v_acc := coalesce(p_account_id, v_tx.account_id);
  insert into finance_transaction_payments (transaction_id, account_id, amount, payment_date, payment_method, doc_number, cost_center_id, auto, tx_type, imported_transaction_id)
  values (p_transaction_id, v_acc, p_amount, coalesce(p_date, current_date), p_method, p_doc, v_tx.cost_center_id, false, v_tx.type, p_imported_id);

  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = p_transaction_id;
  update finance_transactions
    set status = case when v_sum >= v_tx.amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = p_transaction_id
  returning * into v_tx;
  return v_tx;
end $$;

-- reconcile_partial e reconcile_match (caminho da última parcela) passam o vínculo.
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

create or replace function public.reconcile_match(p_imported_id uuid, p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_imp public.finance_imported_transactions;
  v_tx public.finance_transactions;
  v_remaining numeric;
begin
  select * into v_imp from finance_imported_transactions where id = p_imported_id for update;
  if not found then raise exception 'Transação importada não encontrada.'; end if;
  if v_imp.reconciled then raise exception 'Esta transação importada já foi conciliada.'; end if;

  select * into v_tx from finance_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_tx.imported_transaction_id is not null then raise exception 'Este lançamento já está conciliado com outra linha do extrato.'; end if;
  if (v_tx.type = 'ENTRADA') <> (v_imp.amount >= 0) then
    raise exception 'Sentidos incompatíveis: a linha do banco e o lançamento não são ambos entrada (ou ambos saída).';
  end if;

  v_remaining := v_tx.amount - coalesce(v_tx.paid_amount, 0);
  if abs(abs(v_imp.amount) - v_remaining) > 0.01 then
    raise exception 'Valores diferentes: banco R$ % × saldo a quitar do lançamento R$ %. Use a Baixa parcial (quando o banco pagou menos) ou ajuste o lançamento antes de conciliar.',
      trim(to_char(abs(v_imp.amount), 'FM999G999G990D00')), trim(to_char(v_remaining, 'FM999G999G990D00'));
  end if;

  if coalesce(v_tx.paid_amount, 0) > 0 then
    perform public.settle_transaction(p_transaction_id, v_remaining, v_imp.transaction_date, null, v_imp.account_id, null, p_imported_id);
    update finance_transactions set imported_transaction_id = p_imported_id where id = p_transaction_id;
  else
    update finance_transactions
       set status = 'PAGO', imported_transaction_id = p_imported_id
     where id = p_transaction_id;
  end if;

  update finance_imported_transactions
     set reconciled = true, reconciled_transaction_id = p_transaction_id
   where id = p_imported_id;
end; $$;

-- delete_payment: estornar baixa vinculada devolve a linha do extrato para a fila
-- e destrava o lançamento (se estava travado por essa linha).
create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_imp uuid; v_amount numeric; v_sum numeric;
begin
  select transaction_id, imported_transaction_id into v_tx, v_imp from finance_transaction_payments where id = p_payment_id;
  if v_tx is null then raise exception 'Baixa não encontrada.'; end if;
  delete from finance_transaction_payments where id = p_payment_id;

  if v_imp is not null then
    update finance_imported_transactions
       set reconciled = false, reconciled_transaction_id = null
     where id = v_imp;
    update finance_transactions
       set imported_transaction_id = null
     where id = v_tx and imported_transaction_id = v_imp;
  end if;

  select amount into v_amount from finance_transactions where id = v_tx;
  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = v_tx;
  update finance_transactions
    set status = case when v_sum >= v_amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = v_tx;
end $$;

grant execute on function public.settle_transaction(uuid, numeric, date, text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.reconcile_partial(uuid, uuid) to anon, authenticated;
grant execute on function public.reconcile_match(uuid, uuid) to anon, authenticated;
grant execute on function public.delete_payment(uuid) to anon, authenticated;
