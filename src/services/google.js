// ============================================================================
// Google Agenda — o navegador só conversa com /api/google (api/google.js).
// A chave do Google de cada pessoa fica no servidor; aqui vai só o token da
// sessão do sistema, para o servidor saber quem está pedindo.
// ============================================================================
import { supabase } from './supabase';

async function chamar(acao, { metodo = 'GET', corpo, params } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const qs = new URLSearchParams({ acao, ...(params || {}) });
  const r = await fetch(`/api/google?${qs}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(json.erro || 'Não foi possível falar com o Google.');
    e.status = r.status;
    throw e;
  }
  return json;
}

// Lembra na sessão se a pessoa está conectada, para as edições no
// Compromisso não chamarem o servidor à toa quando não há Google ligado.
let conectado = null;

/** { configurado, conectado, email } */
export async function statusGoogle() {
  const st = await chamar('status');
  conectado = !!st.conectado;
  return st;
}

/** Leva para a tela de permissão do Google; ele volta em /home?google=ok. */
export async function conectarGoogle() {
  const { url } = await chamar('conectar');
  window.location.assign(url);
}

export async function desconectarGoogle() {
  await chamar('desconectar', { metodo: 'POST' });
  conectado = false;
}

/** Eventos do Google entre duas datas 'AAAA-MM-DD'. */
export const eventosGoogle = (de, ate) => chamar('eventos', { params: { de, ate } });

/**
 * Marca uma reunião com Meet: cria o evento, convida e registra no histórico.
 * `vinculo` = { party_id, oportunidade_id, projeto_id } (o que houver).
 */
export const marcarReuniao = (dados) => chamar('reuniao', { metodo: 'POST', corpo: dados });

// Leva os compromissos do Planejamento Geral para o Google. Várias edições
// seguidas viram uma chamada só (espera 4 s de calmaria).
let timer = null;
let rodando = null;
export function sincronizarGoogle({ agora = false } = {}) {
  clearTimeout(timer);
  const rodar = async () => {
    if (conectado === null) { try { await statusGoogle(); } catch { return null; } }
    if (!conectado) return null;
    if (rodando) return rodando;
    rodando = chamar('sincronizar', { metodo: 'POST' })
      .catch((e) => { console.warn('[google] sincronizar', e.message); return null; })
      .finally(() => { rodando = null; });
    return rodando;
  };
  if (agora) return rodar();
  timer = setTimeout(rodar, 4000);
  return null;
}
