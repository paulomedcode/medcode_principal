import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // localStorage mantém a sessão entre abas e ao reabrir o navegador
    // (evita o logout "toda hora"). O tempo de sessão é controlado no
    // AuthContext: logout por inatividade somente no desktop.
    storage: window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
