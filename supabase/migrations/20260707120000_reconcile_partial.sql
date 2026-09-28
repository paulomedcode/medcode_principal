-- Baixa PARCIAL via conciliação: a linha do banco quita PARTE de um lançamento maior
-- (ex.: nota de R$ 155 mil recebida em dois TEDs). Atômico: registra a baixa via
-- settle_transaction (valor/data/conta da linha do extrato) e marca a linha como
-- conciliada. O lançamento NÃO recebe imported_transaction_id — continua livre para
-- receber as próximas parcelas; o vínculo p/ auditoria/desconciliação fica em
-- reconciled_transaction_id. Idempotente (create or replace).

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

  -- Registra a baixa parcial (valida valor > 0 e <= saldo a quitar; atualiza status p/ PARCIAL/PAGO).
  v_tx := public.settle_transaction(p_transaction_id, abs(v_imp.amount), v_imp.transaction_date, null, v_imp.account_id, null);

  update finance_imported_transactions
     set reconciled = true, reconciled_transaction_id = p_transaction_id
   where id = p_imported_id;

  return v_tx;
end $$;

grant execute on function public.reconcile_partial(uuid, uuid) to anon, authenticated;
