-- #5 — Baixa com pagamento PARCIAL e saldo dirigido pelas baixas.
-- Antes: status PAGO movia o valor cheio no saldo (trigger trg_update_account_balance).
-- Agora: o saldo é a SOMA das baixas (finance_transaction_payments). Suporta parcial.
-- Compatibilidade: marcar PAGO direto (modal/conciliação/repasse) cria uma baixa AUTOMÁTICA
-- (full), via trigger — então as RPCs existentes seguem funcionando sem reescrever.

-- 1. Tabela de baixas (pagamentos/recebimentos efetivados).
create table if not exists public.finance_transaction_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id) on delete cascade,
  account_id uuid not null references public.finance_accounts(id),
  amount numeric(15, 2) not null check (amount > 0),
  payment_date date not null,
  payment_method text,
  doc_number text,
  cost_center_id uuid references public.finance_cost_centers(id),
  auto boolean not null default false,   -- true = baixa automática (status PAGO setado direto)
  tx_type text,                          -- tipo do lançamento (ENTRADA/SAIDA) guardado p/ reverter saldo no delete em cascata
  created_at timestamp with time zone not null default timezone('utc', now())
);
create index if not exists idx_payments_transaction on public.finance_transaction_payments(transaction_id);
create index if not exists idx_payments_account on public.finance_transaction_payments(account_id);

-- 2. Status passa a aceitar PARCIAL + cache paid_amount.
alter table public.finance_transactions drop constraint if exists finance_transactions_status_check;
alter table public.finance_transactions add constraint finance_transactions_status_check
  check (status in ('PENDENTE', 'PARCIAL', 'PAGO'));
alter table public.finance_transactions add column if not exists paid_amount numeric(15, 2) not null default 0;

-- 3. Backfill: 1 baixa automática por lançamento PAGO (antes de qualquer trigger de saldo).
insert into public.finance_transaction_payments (transaction_id, account_id, amount, payment_date, payment_method, cost_center_id, auto, tx_type)
select t.id, t.account_id, t.amount, coalesce(t.transaction_date, current_date), t.payment_method, t.cost_center_id, true, t.type
from public.finance_transactions t
where t.status = 'PAGO';

update public.finance_transactions t
  set paid_amount = coalesce((select sum(p.amount) from finance_transaction_payments p where p.transaction_id = t.id), 0);

-- 4. GATE: aborta tudo se o saldo recalculado (inicial + soma das baixas por sinal) divergir do atual.
do $$
declare r record;
begin
  for r in
    select a.id, a.name, a.current_balance,
      a.initial_balance + coalesce((
        select sum(case when t.type = 'ENTRADA' then p.amount else -p.amount end)
        from finance_transaction_payments p
        join finance_transactions t on t.id = p.transaction_id
        where t.account_id = a.id
      ), 0) as recalc
    from finance_accounts a
  loop
    if round(r.current_balance - r.recalc, 2) <> 0 then
      raise exception 'GATE FALHOU: conta % saldo atual % difere do recalculado %', r.name, r.current_balance, r.recalc;
    end if;
  end loop;
end $$;

-- 5. Trigger de SALDO dirigido pelas baixas.
create or replace function public.payment_update_balance() returns trigger
language plpgsql as $$
declare v_type text;
begin
  -- usa o tipo guardado na própria baixa (tx_type); no delete em cascata o lançamento-pai já não existe.
  if TG_OP = 'INSERT' then
    v_type := coalesce(NEW.tx_type, (select type from finance_transactions where id = NEW.transaction_id));
    update finance_accounts set current_balance = current_balance + (case when v_type = 'ENTRADA' then NEW.amount else -NEW.amount end),
      updated_at = timezone('utc', now()) where id = NEW.account_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update finance_accounts set current_balance = current_balance - (case when OLD.tx_type = 'ENTRADA' then OLD.amount else -OLD.amount end),
      updated_at = timezone('utc', now()) where id = OLD.account_id;
    return OLD;
  else
    update finance_accounts set current_balance = current_balance - (case when OLD.tx_type = 'ENTRADA' then OLD.amount else -OLD.amount end) where id = OLD.account_id;
    v_type := coalesce(NEW.tx_type, (select type from finance_transactions where id = NEW.transaction_id));
    update finance_accounts set current_balance = current_balance + (case when v_type = 'ENTRADA' then NEW.amount else -NEW.amount end),
      updated_at = timezone('utc', now()) where id = NEW.account_id;
    return NEW;
  end if;
end $$;

drop trigger if exists trg_payment_update_balance on public.finance_transaction_payments;
create trigger trg_payment_update_balance
  after insert or update or delete on public.finance_transaction_payments
  for each row execute function public.payment_update_balance();

-- 6. Compatibilidade: status PAGO direto cria/ajusta a baixa AUTOMÁTICA (cobre o que falta);
--    status != PAGO remove a baixa automática. Não mexe nas baixas MANUAIS. Sincroniza paid_amount.
create or replace function public.sync_auto_payment() returns trigger
language plpgsql as $$
declare v_manual numeric; v_gap numeric;
begin
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

  update finance_transactions set paid_amount = coalesce((select sum(amount) from finance_transaction_payments where transaction_id = NEW.id), 0)
    where id = NEW.id;
  return NEW;
end $$;

drop trigger if exists trg_sync_auto_payment on public.finance_transactions;
create trigger trg_sync_auto_payment
  after insert or update of status, amount, account_id on public.finance_transactions
  for each row execute function public.sync_auto_payment();

-- 7. Desliga o trigger antigo (status -> saldo). Quem manda no saldo agora é a tabela de baixas.
drop trigger if exists trg_update_account_balance on public.finance_transactions;

-- 8. RPC de BAIXA (registra um pagamento/recebimento; atualiza status PENDENTE/PARCIAL/PAGO).
create or replace function public.settle_transaction(
  p_transaction_id uuid, p_amount numeric, p_date date, p_method text, p_account_id uuid, p_doc text)
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
  insert into finance_transaction_payments (transaction_id, account_id, amount, payment_date, payment_method, doc_number, cost_center_id, auto, tx_type)
  values (p_transaction_id, v_acc, p_amount, coalesce(p_date, current_date), p_method, p_doc, v_tx.cost_center_id, false, v_tx.type);

  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = p_transaction_id;
  update finance_transactions
    set status = case when v_sum >= v_tx.amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = p_transaction_id
  returning * into v_tx;
  return v_tx;
end $$;

-- 9. RPC de ESTORNO (apaga uma baixa; recalcula status). O saldo volta via trigger.
create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_amount numeric; v_sum numeric;
begin
  select transaction_id into v_tx from finance_transaction_payments where id = p_payment_id;
  if v_tx is null then raise exception 'Baixa não encontrada.'; end if;
  delete from finance_transaction_payments where id = p_payment_id;
  select amount into v_amount from finance_transactions where id = v_tx;
  select coalesce(sum(amount), 0) into v_sum from finance_transaction_payments where transaction_id = v_tx;
  update finance_transactions
    set status = case when v_sum >= v_amount - 0.0049 then 'PAGO' when v_sum > 0 then 'PARCIAL' else 'PENDENTE' end
    where id = v_tx;
end $$;

grant execute on function public.settle_transaction(uuid, numeric, date, text, uuid, text) to anon, authenticated;
grant execute on function public.delete_payment(uuid) to anon, authenticated;
