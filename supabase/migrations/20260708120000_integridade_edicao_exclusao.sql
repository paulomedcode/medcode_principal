-- ============================================================================
-- LEVA 1 — INTEGRIDADE NA EDIÇÃO E EXCLUSÃO (achados críticos da revisão 07/jul).
-- O núcleo (saldo por baixas, conciliação blindada) é sólido; o risco morava em
-- ALTERAR/APAGAR depois do fato. Esta migration fecha isso na FONTE. Idempotente.
-- ============================================================================

-- --- C38: FK de conta deixa de ser CASCADE (não apaga mais lançamentos/extrato junto)
alter table public.finance_transactions
  drop constraint if exists finance_transactions_account_id_fkey,
  add constraint finance_transactions_account_id_fkey
    foreign key (account_id) references public.finance_accounts(id) on delete restrict;
alter table public.finance_imported_transactions
  drop constraint if exists finance_imported_transactions_account_id_fkey,
  add constraint finance_imported_transactions_account_id_fkey
    foreign key (account_id) references public.finance_accounts(id) on delete restrict;

-- --- C0, C1, C2: trava de edição perigosa de lançamento (BEFORE UPDATE)
-- Enquanto houver baixas ou conciliação, não deixa mudar type/amount/status/conta
-- de forma que descole o saldo do dinheiro real. Orienta o caminho correto.
create or replace function public.guard_transaction_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_paid numeric;
begin
  -- Conciliado: bloqueia qualquer mudança de valor/tipo/status/conta (desconcilie antes).
  if OLD.imported_transaction_id is not null then
    if NEW.amount is distinct from OLD.amount
       or NEW.type is distinct from OLD.type
       or NEW.status is distinct from OLD.status
       or NEW.account_id is distinct from OLD.account_id then
      raise exception 'Lançamento conciliado com o extrato. Remova a conciliação (Desconciliar) antes de alterar valor, tipo, status ou conta.';
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_paid from finance_transaction_payments where transaction_id = OLD.id;
  if v_paid > 0.0049 then
    -- C0: trocar entrada↔saída com baixas distorceria o caixa em 2×.
    if NEW.type is distinct from OLD.type then
      raise exception 'Este lançamento já tem baixas (R$ %). Estorne as baixas antes de trocar entre entrada e saída.', trim(to_char(v_paid, 'FM999G999G990D00'));
    end if;
    -- C1: reduzir o valor abaixo do já baixado deixaria "pago" maior que o valor.
    if NEW.amount < v_paid - 0.0049 then
      raise exception 'Valor (R$ %) menor que o total já baixado (R$ %). Estorne baixas antes de reduzir o valor.', trim(to_char(NEW.amount, 'FM999G999G990D00')), trim(to_char(v_paid, 'FM999G999G990D00'));
    end if;
    -- mudar a conta de um lançamento com baixas manuais deixaria o dinheiro na conta antiga.
    if NEW.account_id is distinct from OLD.account_id then
      raise exception 'Este lançamento já tem baixas. Estorne as baixas antes de trocar a conta.';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_guard_transaction_update on public.finance_transactions;
create trigger trg_guard_transaction_update
  before update on public.finance_transactions
  for each row execute function public.guard_transaction_update();

-- --- C2: estornar baixa de lançamento conciliado exige desconciliar antes
-- (a baixa AUTO nasce sem vínculo; sem esta guarda o estorno deixaria a conciliação órfã).
create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_imp uuid; v_conc uuid; v_amount numeric; v_sum numeric;
begin
  select transaction_id, imported_transaction_id into v_tx, v_imp from finance_transaction_payments where id = p_payment_id;
  if v_tx is null then raise exception 'Baixa não encontrada.'; end if;

  select imported_transaction_id into v_conc from finance_transactions where id = v_tx;
  -- Se o lançamento está conciliado por OUTRA linha (não a que originou esta baixa), barra.
  if v_conc is not null and v_conc is distinct from v_imp then
    raise exception 'Lançamento conciliado com o extrato. Remova a conciliação antes de estornar esta baixa.';
  end if;

  delete from finance_transaction_payments where id = p_payment_id;

  if v_imp is not null then
    update finance_imported_transactions set reconciled = false, reconciled_transaction_id = null where id = v_imp;
    update finance_transactions set imported_transaction_id = null where id = v_tx and imported_transaction_id = v_imp;
  end if;

  select amount into v_amount from finance_transactions where id = v_tx;
  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = v_tx;
  update finance_transactions
    set status = case when v_sum >= v_amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = v_tx;
end $$;

-- --- C8: desconciliar estorna as baixas vinculadas às linhas liberadas
-- (evita o beco sem saída: linha volta à fila mas a baixa fica, e o "Lançar" duplica).
create or replace function public.unreconcile_transaction(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_imp_id uuid; v_amount numeric; v_sum numeric;
begin
  select imported_transaction_id into v_imp_id from finance_transactions where id = p_transaction_id;

  -- Estorna baixas que vieram da conciliação (vínculo em imported_transaction_id da baixa).
  delete from finance_transaction_payments
   where transaction_id = p_transaction_id
     and imported_transaction_id is not null
     and (imported_transaction_id = v_imp_id or imported_transaction_id in (
       select id from finance_imported_transactions where reconciled_transaction_id = p_transaction_id));

  update finance_imported_transactions
     set reconciled = false, reconciled_transaction_id = null
   where id = v_imp_id or reconciled_transaction_id = p_transaction_id;

  update finance_transactions set imported_transaction_id = null where id = p_transaction_id;

  -- Recalcula status pelo que restou de baixas.
  select amount into v_amount from finance_transactions where id = p_transaction_id;
  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = p_transaction_id;
  update finance_transactions
    set status = case when v_sum >= v_amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = p_transaction_id;
end $$;

-- --- C23: conciliar lançamento JÁ PAGO (ex.: transferência lançada à mão) sem duplicar.
-- Se o lançamento já está quitado (paid_amount == amount) e o valor/sentido do banco
-- bate, apenas VINCULA (não cria baixa nova) — 'link-only'.
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
  if v_tx.account_id is distinct from v_imp.account_id then
    raise exception 'A linha do extrato e o lançamento são de contas diferentes.';
  end if;
  if (v_tx.type = 'ENTRADA') <> (v_imp.amount >= 0) then
    raise exception 'Sentidos incompatíveis: a linha do banco e o lançamento não são ambos entrada (ou ambos saída).';
  end if;

  v_remaining := v_tx.amount - coalesce(v_tx.paid_amount, 0);

  -- Já quitado: só vincula se o valor TOTAL bate (não há saldo a quitar).
  if coalesce(v_tx.paid_amount, 0) >= v_tx.amount - 0.0049 then
    if abs(abs(v_imp.amount) - v_tx.amount) > 0.01 then
      raise exception 'Valores diferentes: banco R$ % × lançamento R$ %.',
        trim(to_char(abs(v_imp.amount), 'FM999G999G990D00')), trim(to_char(v_tx.amount, 'FM999G999G990D00'));
    end if;
    update finance_transactions set imported_transaction_id = p_imported_id where id = p_transaction_id;
    update finance_imported_transactions set reconciled = true, reconciled_transaction_id = p_transaction_id where id = p_imported_id;
    return;
  end if;

  -- Não quitado: valor do banco tem de bater com o SALDO A QUITAR.
  if abs(abs(v_imp.amount) - v_remaining) > 0.01 then
    raise exception 'Valores diferentes: banco R$ % × saldo a quitar do lançamento R$ %. Use a Baixa parcial (quando o banco pagou menos) ou ajuste o lançamento antes de conciliar.',
      trim(to_char(abs(v_imp.amount), 'FM999G999G990D00')), trim(to_char(v_remaining, 'FM999G999G990D00'));
  end if;

  if coalesce(v_tx.paid_amount, 0) > 0 then
    perform public.settle_transaction(p_transaction_id, v_remaining, v_imp.transaction_date, null, v_imp.account_id, null, p_imported_id);
    update finance_transactions set imported_transaction_id = p_imported_id where id = p_transaction_id;
  else
    -- Sem baixas ainda: cria a baixa (AUTO) na DATA/CONTA do extrato (não do lançamento).
    perform public.settle_transaction(p_transaction_id, v_tx.amount, v_imp.transaction_date, null, v_imp.account_id, null, p_imported_id);
    update finance_transactions set imported_transaction_id = p_imported_id where id = p_transaction_id;
  end if;

  update finance_imported_transactions
     set reconciled = true, reconciled_transaction_id = p_transaction_id
   where id = p_imported_id;
end; $$;

-- --- C39: ajuste RELATIVO de saldo (a tela nunca sobrescreve current_balance).
-- Usado quando o usuário corrige o saldo inicial de uma conta já existente.
create or replace function public.adjust_account_balance(p_account_id uuid, p_delta numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update finance_accounts
     set current_balance = current_balance + coalesce(p_delta, 0),
         initial_balance = initial_balance + coalesce(p_delta, 0)
   where id = p_account_id;
end $$;

grant execute on function public.adjust_account_balance(uuid, numeric) to anon, authenticated;
grant execute on function public.delete_payment(uuid) to anon, authenticated;
grant execute on function public.unreconcile_transaction(uuid) to anon, authenticated;
grant execute on function public.reconcile_match(uuid, uuid) to anon, authenticated;
