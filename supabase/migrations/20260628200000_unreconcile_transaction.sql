-- Desconciliar um lançamento: desfaz o vínculo com a linha do extrato, devolvendo-a
-- para "pendente" na conciliação e liberando o lançamento para edição/exclusão.
-- O lançamento em si NÃO é apagado (continua no extrato/saldo); só deixa de ser
-- "conciliado". Serve tanto p/ lançamentos vindos do import quanto p/ matches.
-- Vínculo: finance_transactions.imported_transaction_id <-> finance_imported_transactions.reconciled_transaction_id.

create or replace function public.unreconcile_transaction(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_imp_id uuid;
begin
  select imported_transaction_id into v_imp_id from finance_transactions where id = p_transaction_id;

  update finance_imported_transactions
     set reconciled = false, reconciled_transaction_id = null
   where id = v_imp_id or reconciled_transaction_id = p_transaction_id;

  update finance_transactions
     set imported_transaction_id = null
   where id = p_transaction_id;
end; $$;

grant execute on function public.unreconcile_transaction(uuid) to anon, authenticated;
