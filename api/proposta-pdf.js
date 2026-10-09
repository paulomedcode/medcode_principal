// POST /api/proposta-pdf — recebe os dados da proposta e devolve o PDF.
//
// Só atende quem está logado e pode editar orçamentos (Editar Vendas ou
// Editar Financeiro). A conferência usa o próprio token do usuário contra o
// Supabase: não há chave de serviço aqui. Guardar o arquivo e registrar a
// versão fica com o navegador, sob as regras (RLS) do usuário.
//
// Escrito só com a API do Node (req/res), para servir igual na Vercel e no
// `npm run dev` (vite.config.js encaminha /api/proposta-pdf para cá).
import { gerarPropostaPDF } from '../medcode-proposta/src/gerar-pdf.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function responder(res, status, mensagem) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ erro: mensagem }));
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel já entrega o JSON
  const partes = [];
  for await (const p of req) partes.push(p);
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}

// 'ok', 'negado' ou 'sessao' (token vencido ou inválido). Separar os dois
// últimos importa: sessão vencida não é falta de permissão.
async function podeGerar(token) {
  const cab = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const usuario = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: cab });
  if (usuario.status === 401 || usuario.status === 403) return 'sessao';
  if (!usuario.ok) throw new Error(`auth/v1/user respondeu ${usuario.status}`);
  for (const p_permissao of ['Editar Vendas', 'Editar Financeiro']) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tem_permissao`, { method: 'POST', headers: cab, body: JSON.stringify({ p_permissao }) });
    if (!r.ok) throw new Error(`tem_permissao respondeu ${r.status}`);
    if ((await r.json()) === true) return 'ok';
  }
  return 'negado';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, 'Use POST.');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return responder(res, 500, 'Supabase não configurado no servidor.');

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return responder(res, 401, 'Faça login para gerar a proposta.');

  try {
    const acesso = await podeGerar(token);
    if (acesso === 'sessao') return responder(res, 401, 'Sua sessão expirou. Entre de novo no sistema e gere a proposta.');
    if (acesso === 'negado') return responder(res, 403, 'Sem permissão para gerar proposta.');
    const dados = await lerCorpo(req);
    if (!dados?.numero || !Array.isArray(dados.servicos)) return responder(res, 400, 'Dados da proposta incompletos.');

    const pdf = await gerarPropostaPDF(dados);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  } catch (e) {
    console.error('[proposta-pdf]', e);
    responder(res, 500, 'Não foi possível gerar o PDF.');
  }
}
