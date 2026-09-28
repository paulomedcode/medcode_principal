-- LEVA 4 (segurança) — fecha o vetor "mover dinheiro sem login".
-- As RPCs financeiras estavam concedidas a `anon` (a chave anon vai no bundle),
-- permitindo chamá-las sem autenticar. O app usa Supabase Auth de verdade
-- (signInWithPassword) e o módulo financeiro fica atrás de login, então usuário
-- real chama como `authenticated`. Revogamos `anon` e garantimos `authenticated`
-- em TODAS as sobrecargas dessas funções (por nome, independente da assinatura).
--
-- ATENÇÃO (não fecha tudo): as tabelas finance_* ainda estão com RLS DESLIGADO, então
-- `anon` ainda alcança as tabelas DIRETO pela REST API sem passar por estas RPCs. Blindar
-- isso exige habilitar RLS + políticas em todas as finance_* — esforço dedicado à parte
-- (ver memória rls-desabilitado-producao). Idempotente.

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
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
