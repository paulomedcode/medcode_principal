-- Competência (reference_month) obrigatória em todo lançamento — dois caminhos que criavam
-- finance_transactions via RPC ainda deixavam reference_month NULL (o formulário/telas que
-- passam pelo TransactionModal ou pelo lançamento de conciliação já exigem e preenchem, com
-- padrão "mês anterior"; faltavam pay_repasse e approve_quote).

-- pay_repasse: a SAIDA gerada herda a própria competência do fechamento de repasse
-- (já escolhida pelo usuário ao gerar o repasse — não precisa de novo input).
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
  select id into v_cat from finance_categories where id = '20000000-0000-0000-0000-000000000001';

  insert into finance_transactions
    (account_id, category_id, type, amount, transaction_date, description, status, payment_method, doctor_id, reference_month)
  values
    (p_account_id, v_cat, 'SAIDA', v_rep.net_amount, p_payment_date,
     'Repasse ref. ' || v_rep.reference_month || ' - Dr(a). ' || coalesce(v_doc_name, ''),
     'PAGO', 'PIX', v_rep.doctor_id, v_rep.reference_month)
  returning id into v_tx_id;

  update finance_repasses
     set status = 'PAGO', payment_date = p_payment_date, transaction_id = v_tx_id,
         updated_at = timezone('utc', now())
   where id = p_repasse_id
  returning * into v_rep;

  return v_rep;
end; $$;

-- approve_quote: ganha p_reference_month opcional (a tela de Orçamentos passa a exigir e
-- pré-selecionar o mês anterior, como o resto do sistema); sem valor, cai no mês anterior
-- ao dia da aprovação como rede de segurança.
-- Dropa a assinatura de 5 args p/ evitar ambiguidade de overload (mesmo padrão já usado em
-- launch_imported_transactions).
drop function if exists public.approve_quote(uuid, uuid, date, uuid, date);
create or replace function public.approve_quote(
  p_quote_id uuid, p_account_id uuid, p_due_date date, p_category_id uuid, p_today date,
  p_reference_month text default null
)
returns public.finance_quotes
language plpgsql security definer set search_path = public as $$
declare
  v_q public.finance_quotes;
  v_tx_id uuid;
  v_ref text;
begin
  select * into v_q from finance_quotes where id = p_quote_id for update;
  if not found then raise exception 'Orçamento não encontrado.'; end if;
  if v_q.status = 'APROVADO' then raise exception 'Orçamento já aprovado.'; end if;
  if coalesce(v_q.total_amount, 0) <= 0 then raise exception 'Orçamento sem valor para aprovar.'; end if;

  v_ref := coalesce(nullif(trim(p_reference_month), ''), to_char(p_today - interval '1 month', 'YYYY-MM'));

  insert into finance_transactions
    (account_id, party_id, category_id, type, amount, transaction_date, due_date, description, status, payment_method, reference_month)
  values
    (p_account_id, v_q.party_id, p_category_id, 'ENTRADA', v_q.total_amount, p_today, p_due_date,
     coalesce(v_q.title, 'Orçamento ' || left(p_quote_id::text, 8)), 'PENDENTE', 'OUTRO', v_ref)
  returning id into v_tx_id;

  update finance_quotes
     set status = 'APROVADO', transaction_id = v_tx_id, updated_at = timezone('utc', now())
   where id = p_quote_id
  returning * into v_q;

  return v_q;
end; $$;

grant execute on function public.pay_repasse(uuid, uuid, date) to anon, authenticated;
grant execute on function public.approve_quote(uuid, uuid, date, uuid, date, text) to anon, authenticated;
