-- Tempo real no financeiro: publica as tabelas que a UI precisa refletir ao vivo
-- (lançamentos, saldos das contas, baixas e extrato importado) na publicação
-- supabase_realtime. Assim qualquer mudança — inclusive vinda de gatilhos (saldo) ou
-- de outra aba/aparelho — chega ao cliente sem F5. Idempotente.

do $$
declare t text;
begin
  foreach t in array array[
    'finance_transactions', 'finance_accounts',
    'finance_transaction_payments', 'finance_imported_transactions'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
