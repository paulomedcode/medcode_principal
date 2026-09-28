-- BLINDAGEM DA CONCILIAÇÃO — regras garantidas no banco (valem p/ qualquer tela):
-- 1) reconcile_match NÃO aceita mais valores divergentes: o valor do banco tem de ser
--    igual (±R$ 0,01) ao SALDO A QUITAR do lançamento (amount - paid_amount). Divergiu →
--    erro claro orientando a Baixa parcial (banco menor) ou o ajuste do lançamento.
--    Também valida sentido (entrada×entrada) e lançamento já conciliado.
--    Se o lançamento tem baixas parciais e o banco paga exatamente o restante, a última
--    parcela entra pela via oficial (settle) com a data/conta do extrato e o lançamento
--    é travado (imported_transaction_id).
-- 2) reconcile_partial passa a TRAVAR o lançamento quando a parcial completa a quitação.
-- 3) Excluir um lançamento conciliado devolve a(s) linha(s) do extrato para a fila
--    (antes ficavam órfãs marcadas como conciliadas — origem de linhas-fantasma).
-- Idempotente (create or replace / drop if exists).

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
    -- lançamento PARCIAL sendo quitado pela última parcela: baixa oficial com data/conta do extrato
    perform public.settle_transaction(p_transaction_id, v_remaining, v_imp.transaction_date, null, v_imp.account_id, null);
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

-- reconcile_partial: além de registrar a parcial, trava o lançamento se ela quitar tudo.
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

  v_tx := public.settle_transaction(p_transaction_id, abs(v_imp.amount), v_imp.transaction_date, null, v_imp.account_id, null);

  -- quitou tudo? trava o lançamento nesta última linha do extrato
  if v_tx.status = 'PAGO' and v_tx.imported_transaction_id is null then
    update finance_transactions set imported_transaction_id = p_imported_id where id = p_transaction_id
    returning * into v_tx;
  end if;

  update finance_imported_transactions
     set reconciled = true, reconciled_transaction_id = p_transaction_id
   where id = p_imported_id;

  return v_tx;
end $$;

-- Integridade: excluir um lançamento devolve as linhas do extrato vinculadas para a fila.
-- BEFORE DELETE: roda antes do ON DELETE SET NULL das FKs (que deixaria a linha órfã
-- ainda marcada como conciliada).
create or replace function public.release_statement_on_tx_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update finance_imported_transactions
     set reconciled = false, reconciled_transaction_id = null
   where reconciled_transaction_id = old.id
      or (old.imported_transaction_id is not null and id = old.imported_transaction_id);
  return old;
end $$;

drop trigger if exists trg_release_statement_on_tx_delete on public.finance_transactions;
create trigger trg_release_statement_on_tx_delete
  before delete on public.finance_transactions
  for each row execute function public.release_statement_on_tx_delete();

grant execute on function public.reconcile_match(uuid, uuid) to anon, authenticated;
grant execute on function public.reconcile_partial(uuid, uuid) to anon, authenticated;
