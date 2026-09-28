-- Atomicidade dos fluxos de dinheiro multi-passo (antes feitos em chamadas sequenciais
-- do navegador, que deixavam estado inconsistente se falhassem no meio).
-- Cada função roda numa ÚNICA transação Postgres, com SELECT ... FOR UPDATE + recheck
-- de status (idempotência real contra duplo clique / corrida).
--
-- IMPORTANTE: o saldo da conta é mantido pelo trigger trg_update_account_balance em
-- toda linha PAGO de finance_transactions. As funções abaixo só inserem/atualizam
-- transações com o status correto — NUNCA mexem em current_balance (evita dupla contagem).

-- ========================================================================
-- pay_repasse: cria a SAIDA PAGA do repasse e marca o repasse como PAGO.
-- ========================================================================
create or replace function public.pay_repasse(p_repasse_id uuid, p_account_id uuid, p_payment_date date)
returns public.finance_repasses
language plpgsql security definer set search_path = public as $$
declare
  v_rep public.finance_repasses;
  v_doc_name text;
  v_cat uuid;
  v_tx_id uuid;
begin
  select * into v_rep from finance_repasses where id = p_repasse_id for update;
  if not found then raise exception 'Repasse não encontrado.'; end if;
  if v_rep.status = 'PAGO' then raise exception 'Repasse já foi pago.'; end if;
  if coalesce(v_rep.net_amount, 0) <= 0 then raise exception 'Valor líquido do repasse é zero — nada a pagar.'; end if;

  select name into v_doc_name from users where id = v_rep.doctor_id;
  -- categoria "Repasse a Médicos" (se existir; senão fica sem categoria, sem quebrar)
  select id into v_cat from finance_categories where id = '20000000-0000-0000-0000-000000000001';

  insert into finance_transactions
    (account_id, category_id, type, amount, transaction_date, description, status, payment_method, doctor_id)
  values
    (p_account_id, v_cat, 'SAIDA', v_rep.net_amount, p_payment_date,
     'Repasse ref. ' || v_rep.reference_month || ' - Dr(a). ' || coalesce(v_doc_name, ''),
     'PAGO', 'PIX', v_rep.doctor_id)
  returning id into v_tx_id;

  update finance_repasses
     set status = 'PAGO', payment_date = p_payment_date, transaction_id = v_tx_id,
         updated_at = timezone('utc', now())
   where id = p_repasse_id
  returning * into v_rep;

  return v_rep;
end; $$;

-- ========================================================================
-- approve_quote: cria a conta a receber (ENTRADA PENDENTE) e aprova o orçamento.
-- ========================================================================
create or replace function public.approve_quote(p_quote_id uuid, p_account_id uuid, p_due_date date, p_category_id uuid, p_today date)
returns public.finance_quotes
language plpgsql security definer set search_path = public as $$
declare
  v_q public.finance_quotes;
  v_tx_id uuid;
begin
  select * into v_q from finance_quotes where id = p_quote_id for update;
  if not found then raise exception 'Orçamento não encontrado.'; end if;
  if v_q.status = 'APROVADO' then raise exception 'Orçamento já aprovado.'; end if;
  if coalesce(v_q.total_amount, 0) <= 0 then raise exception 'Orçamento sem valor para aprovar.'; end if;

  insert into finance_transactions
    (account_id, party_id, category_id, type, amount, transaction_date, due_date, description, status, payment_method)
  values
    (p_account_id, v_q.party_id, p_category_id, 'ENTRADA', v_q.total_amount, p_today, p_due_date,
     coalesce(v_q.title, 'Orçamento ' || left(p_quote_id::text, 8)), 'PENDENTE', 'OUTRO')
  returning id into v_tx_id;

  update finance_quotes
     set status = 'APROVADO', transaction_id = v_tx_id, updated_at = timezone('utc', now())
   where id = p_quote_id
  returning * into v_q;

  return v_q;
end; $$;

-- ========================================================================
-- launch_imported_transactions: lança em lote as importadas do extrato (PAGO) e
-- marca cada uma como conciliada. Pula as já conciliadas (idempotente).
-- ========================================================================
create or replace function public.launch_imported_transactions(p_ids uuid[], p_category_id uuid)
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
    if v_imp.reconciled then continue; end if;          -- já conciliada → pula
    if abs(coalesce(v_imp.amount, 0)) <= 0 then continue; end if;  -- respeita CHECK amount > 0

    insert into finance_transactions
      (account_id, category_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id)
    values
      (v_imp.account_id, p_category_id,
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

-- ========================================================================
-- reconcile_match: concilia uma importada com uma transação do sistema (vira PAGO).
-- ========================================================================
create or replace function public.reconcile_match(p_imported_id uuid, p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_imp public.finance_imported_transactions;
begin
  select * into v_imp from finance_imported_transactions where id = p_imported_id for update;
  if not found then raise exception 'Transação importada não encontrada.'; end if;
  if v_imp.reconciled then raise exception 'Esta transação importada já foi conciliada.'; end if;

  update finance_imported_transactions
     set reconciled = true, reconciled_transaction_id = p_transaction_id
   where id = p_imported_id;

  update finance_transactions
     set status = 'PAGO', imported_transaction_id = p_imported_id
   where id = p_transaction_id;
end; $$;

-- ========================================================================
-- create_repasse: cabeçalho + itens + vínculo das glosas, tudo atômico.
-- ========================================================================
create or replace function public.create_repasse(p_repasse jsonb, p_items jsonb, p_glosa_ids uuid[])
returns public.finance_repasses
language plpgsql security definer set search_path = public as $$
declare
  v_rep public.finance_repasses;
begin
  insert into finance_repasses
    (doctor_id, reference_month, gross_amount, admin_fee_amount, glosa_deduction, net_amount, status)
  values
    ((p_repasse->>'doctor_id')::uuid, p_repasse->>'reference_month',
     coalesce((p_repasse->>'gross_amount')::numeric, 0), coalesce((p_repasse->>'admin_fee_amount')::numeric, 0),
     coalesce((p_repasse->>'glosa_deduction')::numeric, 0), coalesce((p_repasse->>'net_amount')::numeric, 0),
     coalesce(p_repasse->>'status', 'PENDENTE'))
  returning * into v_rep;

  insert into finance_repasse_items
    (repasse_id, item_type, surgery_id, shift_id, description, gross_amount, admin_fee_rate, admin_fee_amount, net_amount)
  select v_rep.id, it->>'item_type', nullif(it->>'surgery_id', '')::uuid, nullif(it->>'shift_id', ''),
         it->>'description', coalesce((it->>'gross_amount')::numeric, 0), coalesce((it->>'admin_fee_rate')::numeric, 0),
         coalesce((it->>'admin_fee_amount')::numeric, 0), coalesce((it->>'net_amount')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it;

  if array_length(p_glosa_ids, 1) is not null then
    update finance_glosas
       set deducted_from_repasse_id = v_rep.id, status = 'GLOSADO'
     where id = any(p_glosa_ids);
  end if;

  return v_rep;
end; $$;

-- ========================================================================
-- create_quote / update_quote: cabeçalho + itens atômicos (update = substitui itens).
-- ========================================================================
create or replace function public.create_quote(p_quote jsonb, p_items jsonb)
returns public.finance_quotes
language plpgsql security definer set search_path = public as $$
declare
  v_q public.finance_quotes;
begin
  insert into finance_quotes (party_id, title, valid_until, total_amount, notes, status)
  values (nullif(p_quote->>'party_id', '')::uuid, p_quote->>'title', nullif(p_quote->>'valid_until', '')::date,
          coalesce((p_quote->>'total_amount')::numeric, 0), p_quote->>'notes', coalesce(p_quote->>'status', 'PENDENTE'))
  returning * into v_q;

  insert into finance_quote_items (quote_id, service_id, description, quantity, unit_price, amount)
  select v_q.id, nullif(it->>'service_id', '')::uuid, it->>'description',
         coalesce((it->>'quantity')::numeric, 1), coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'amount')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it;

  return v_q;
end; $$;

create or replace function public.update_quote(p_id uuid, p_quote jsonb, p_items jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update finance_quotes
     set party_id = nullif(p_quote->>'party_id', '')::uuid, title = p_quote->>'title',
         valid_until = nullif(p_quote->>'valid_until', '')::date,
         total_amount = coalesce((p_quote->>'total_amount')::numeric, 0),
         notes = p_quote->>'notes', updated_at = timezone('utc', now())
   where id = p_id;
  if not found then raise exception 'Orçamento não encontrado.'; end if;

  delete from finance_quote_items where quote_id = p_id;

  insert into finance_quote_items (quote_id, service_id, description, quantity, unit_price, amount)
  select p_id, nullif(it->>'service_id', '')::uuid, it->>'description',
         coalesce((it->>'quantity')::numeric, 1), coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'amount')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it;
end; $$;

-- Permite chamar via PostgREST (cliente usa a anon key).
grant execute on function public.pay_repasse(uuid, uuid, date) to anon, authenticated;
grant execute on function public.approve_quote(uuid, uuid, date, uuid, date) to anon, authenticated;
grant execute on function public.launch_imported_transactions(uuid[], uuid) to anon, authenticated;
grant execute on function public.reconcile_match(uuid, uuid) to anon, authenticated;
grant execute on function public.create_repasse(jsonb, jsonb, uuid[]) to anon, authenticated;
grant execute on function public.create_quote(jsonb, jsonb) to anon, authenticated;
grant execute on function public.update_quote(uuid, jsonb, jsonb) to anon, authenticated;
