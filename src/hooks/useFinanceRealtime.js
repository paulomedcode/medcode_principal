import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

// Tempo real do financeiro: recarrega a tela sozinha quando qualquer uma das tabelas
// de dinheiro muda — inclusive por gatilho (saldo) ou por outra aba/aparelho. Sem F5.
// - reload: função de recarga da tela (ex.: loadInitialData). Guardada em ref para o
//   canal não recriar a cada render.
// - debounce (ms): junta rajadas de eventos (um settle dispara vários) numa recarga só.
const TABLES = ['finance_transactions', 'finance_accounts', 'finance_transaction_payments', 'finance_imported_transactions'];

export function useFinanceRealtime(reload, { debounce = 400 } = {}) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    let timer = null;
    const ping = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { reloadRef.current?.(); } catch (_) { /* noop */ } }, debounce);
    };

    const channel = supabase.channel('financeiro-tempo-real');
    TABLES.forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, ping);
    });
    channel.subscribe();

    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [debounce]);
}
