-- Correção do revoke anterior: funções nascem com EXECUTE para PUBLIC, então revogar só de
-- `anon` não adianta (anon herda de PUBLIC). Revoga de PUBLIC e de anon; garante authenticated
-- e service_role. Assim só usuário logado (authenticated) e o backend (service_role) chamam.
-- Idempotente.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'adjust_account_balance','approve_quote','create_quote','create_repasse',
         'create_split_transactions','create_transfer','delete_payment','delete_split_group',
         'delete_transfer','launch_imported_transactions','launch_imported_transactions_detailed',
         'pay_repasse','reconcile_match','reconcile_partial','settle_group','settle_transaction',
         'unreconcile_transaction','update_quote'
       )
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
