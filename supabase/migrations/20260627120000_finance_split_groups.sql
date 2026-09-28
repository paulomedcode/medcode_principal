-- Rateio (split): um lançamento dividido em N linhas-irmãs (categorias diferentes),
-- ligadas por split_group_id. Opção A — cada linha é uma finance_transaction normal,
-- entra no DRE pela SUA própria categoria e tem baixa própria. Caso clássico: parcela de
-- empréstimo = Amortização (principal) + Juros (despesa financeira), mesmo centro de custo.

alter table public.finance_transactions add column if not exists split_group_id uuid;
create index if not exists idx_transactions_split_group on public.finance_transactions(split_group_id);

-- Cria N linhas de rateio compartilhando um split_group_id gerado no servidor. Atômico.
-- p_rows = array jsonb de objetos com as colunas do lançamento (account_id, type, amount,
-- category_id, etc.). O status PAGO em qualquer linha gera a baixa automática via trigger.
create or replace function public.create_split_transactions(p_rows jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_group uuid := gen_random_uuid(); r jsonb; v_sum numeric := 0;
begin
  if p_rows is null or jsonb_array_length(p_rows) < 2 then
    raise exception 'O rateio precisa de pelo menos 2 categorias.';
  end if;
  for r in select * from jsonb_array_elements(p_rows)
  loop
    if coalesce((r->>'amount')::numeric, 0) <= 0 then
      raise exception 'Cada linha do rateio deve ter valor maior que zero.';
    end if;
    insert into finance_transactions (
      account_id, category_id, party_id, doctor_id, type, amount,
      transaction_date, due_date, description, status, payment_method,
      cost_center_id, doc_number, split_group_id
    ) values (
      (r->>'account_id')::uuid,
      nullif(r->>'category_id', '')::uuid,
      nullif(r->>'party_id', '')::uuid,
      nullif(r->>'doctor_id', '')::uuid,
      r->>'type',
      (r->>'amount')::numeric,
      (r->>'transaction_date')::date,
      nullif(r->>'due_date', '')::date,
      r->>'description',
      coalesce(nullif(r->>'status', ''), 'PENDENTE'),
      nullif(r->>'payment_method', ''),
      coalesce(nullif(r->>'cost_center_id', '')::uuid, '30000000-0000-0000-0000-000000000001'),
      nullif(r->>'doc_number', ''),
      v_group
    );
    v_sum := v_sum + (r->>'amount')::numeric;
  end loop;
  return v_group;
end $$;

-- Quita o grupo inteiro de uma vez: para cada linha do rateio com saldo em aberto, registra
-- uma baixa do valor restante e marca como PAGO. Mesma data/conta/método para todas. Atômico.
create or replace function public.settle_group(
  p_group_id uuid, p_date date, p_method text, p_account_id uuid, p_doc text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_tx public.finance_transactions; v_acc uuid; v_remaining numeric; v_count int := 0;
begin
  for v_tx in select * from finance_transactions where split_group_id = p_group_id for update
  loop
    v_remaining := v_tx.amount - v_tx.paid_amount;
    if v_remaining > 0.0049 then
      v_acc := coalesce(p_account_id, v_tx.account_id);
      insert into finance_transaction_payments (transaction_id, account_id, amount, payment_date, payment_method, doc_number, cost_center_id, auto, tx_type)
      values (v_tx.id, v_acc, v_remaining, coalesce(p_date, current_date), p_method, p_doc, v_tx.cost_center_id, false, v_tx.type);
      update finance_transactions set status = 'PAGO' where id = v_tx.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- Exclui o rateio inteiro (todas as linhas do grupo; baixas somem por cascade e o saldo volta).
create or replace function public.delete_split_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from finance_transactions where split_group_id = p_group_id;
end $$;

grant execute on function public.create_split_transactions(jsonb) to anon, authenticated;
grant execute on function public.settle_group(uuid, date, text, uuid, text) to anon, authenticated;
grant execute on function public.delete_split_group(uuid) to anon, authenticated;
