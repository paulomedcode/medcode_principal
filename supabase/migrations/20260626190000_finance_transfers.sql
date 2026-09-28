-- Transferência entre contas: duas pernas (SAIDA na origem, ENTRADA no destino) ligadas
-- por transfer_group_id. NÃO entram no DRE/resultado (são acerto entre contas), só movem
-- saldo e aparecem no fluxo de caixa. Resolve o caso do cartão de crédito (fatura = transferência).

alter table public.finance_transactions add column if not exists transfer_group_id uuid;
create index if not exists idx_transactions_transfer_group on public.finance_transactions(transfer_group_id);

-- Cria a transferência (duas pernas PAGO; o saldo move via trigger de baixa automática).
create or replace function public.create_transfer(
  p_from_account uuid, p_to_account uuid, p_amount numeric, p_date date, p_description text, p_cost_center_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_group uuid := gen_random_uuid(); v_from text; v_to text; v_cc uuid; v_desc text;
begin
  if p_from_account is null or p_to_account is null then raise exception 'Selecione as contas de origem e destino.'; end if;
  if p_from_account = p_to_account then raise exception 'Origem e destino devem ser contas diferentes.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'O valor deve ser maior que zero.'; end if;

  select name into v_from from finance_accounts where id = p_from_account;
  select name into v_to from finance_accounts where id = p_to_account;
  v_cc := coalesce(p_cost_center_id, '30000000-0000-0000-0000-000000000001');
  v_desc := coalesce(nullif(trim(p_description), ''), 'Transferência');

  insert into finance_transactions (account_id, type, amount, transaction_date, description, status, payment_method, cost_center_id, transfer_group_id)
  values (p_from_account, 'SAIDA', p_amount, coalesce(p_date, current_date), v_desc || ' → ' || coalesce(v_to, ''), 'PAGO', 'TRANSFERENCIA', v_cc, v_group);

  insert into finance_transactions (account_id, type, amount, transaction_date, description, status, payment_method, cost_center_id, transfer_group_id)
  values (p_to_account, 'ENTRADA', p_amount, coalesce(p_date, current_date), v_desc || ' ← ' || coalesce(v_from, ''), 'PAGO', 'TRANSFERENCIA', v_cc, v_group);

  return v_group;
end $$;

-- Exclui a transferência inteira (as duas pernas; o saldo volta via cascade + trigger).
create or replace function public.delete_transfer(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from finance_transactions where transfer_group_id = p_group_id;
end $$;

grant execute on function public.create_transfer(uuid, uuid, numeric, date, text, uuid) to anon, authenticated;
grant execute on function public.delete_transfer(uuid) to anon, authenticated;
