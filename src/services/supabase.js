import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// O link de "redefinir senha" volta com o resultado no hash
// (#access_token=...&type=recovery, ou #error=...&error_description=...).
// O cliente abaixo lê e LIMPA esse hash ao iniciar, então ele é guardado
// antes — é daqui que a tela de redefinir senha sabe se o link venceu.
export const HASH_INICIAL = window.location.hash;

// Para onde o link do e-mail de redefinição devolve a pessoa. Precisa estar
// na lista de redirects do Auth no Supabase (uri_allow_list).
export const urlRedefinirSenha = () => `${window.location.origin}/redefinir-senha`;

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
