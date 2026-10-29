// /api/google — ponte entre o sistema e o Google Agenda de cada pessoa.
//
// Ações (?acao=...), todas com o token do usuário logado no cabeçalho:
//   GET  conectar     → endereço da tela de permissão do Google
//   GET  status       → { configurado, conectado, email }
//   POST desconectar  → apaga a ligação
//   GET  eventos      → eventos do Google entre ?de e ?ate (AAAA-MM-DD)
//   POST reuniao      → cria o evento com link do Meet, convida, registra no histórico
//   POST sincronizar  → leva os compromissos do Planejamento Geral e os próximos
//                       passos com hora (Vendas) para o Google
// E o retorno do Google (?code&state), que grava a ligação e volta para /home.
//
// A chave de serviço do Supabase só existe aqui no servidor: é ela que lê o
// refresh_token (o navegador nunca vê) e escreve em google_contas/google_eventos.
// Quem é o usuário vem sempre do token dele (meu_cadastro), nunca do corpo.
//
// Escrito só com a API do Node (req/res): roda igual na Vercel e no
// `npm run dev` (vite.config.js encaminha /api/google para cá).
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const FUSO = 'America/Sao_Paulo';
const ESCOPOS = ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/calendar.events'];
const CAL = 'https://www.googleapis.com/calendar/v3';

class Falha extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function json(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}

function redirecionar(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const partes = [];
  for await (const p of req) partes.push(p);
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}

function origemDe(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
async function sb(caminho, { metodo = 'GET', corpo, token, prefer } = {}) {
  const chave = token ? ANON : SERVICO;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${token || SERVICO}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`supabase ${metodo} ${caminho.split('?')[0]}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// O cadastro (public.users) de quem chamou, a partir do token do navegador.
async function quemChamou(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Falha(401, 'Faça login de novo.');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/meu_cadastro`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (r.status === 401 || r.status === 403) throw new Falha(401, 'Sua sessão expirou. Entre de novo no sistema.');
  if (!r.ok) throw new Error(`meu_cadastro: ${r.status}`);
  const [eu] = await r.json();
  if (!eu?.id) throw new Falha(403, 'Seu usuário não tem cadastro no sistema.');
  return { id: eu.id, nome: eu.nome, token };
}

// ---------------------------------------------------------------------------
// Google: estado assinado, tokens e chamadas
// ---------------------------------------------------------------------------
const assinar = (txt) => crypto.createHmac('sha256', CLIENT_SECRET).update(txt).digest('base64url');

function criarEstado(userId) {
  const corpo = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

function lerEstado(estado) {
  const [corpo, sig] = String(estado || '').split('.');
  if (!corpo || !sig) return null;
  const esperado = assinar(corpo);
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
  return dados.e > Date.now() ? dados : null;
}

async function tokenDoGoogle(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const dados = await r.json().catch(() => ({}));
  return { ok: r.ok, dados };
}

async function contaDe(userId) {
  const [conta] = await sb(`google_contas?user_id=eq.${userId}&select=*`);
  return conta || null;
}

// Access token novo a cada chamada (vale 1 h; não vale a pena guardar).
// Ligação revogada no Google → apaga a conta aqui e avisa.
async function acessoDe(conta) {
  const { ok, dados } = await tokenDoGoogle({ grant_type: 'refresh_token', refresh_token: conta.refresh_token });
  if (!ok) {
    if (dados.error === 'invalid_grant') {
      await sb(`google_contas?user_id=eq.${conta.user_id}`, { metodo: 'DELETE' });
      throw new Falha(409, 'A ligação com o Google expirou. Conecte de novo.');
    }
    throw new Error(`token google: ${JSON.stringify(dados)}`);
  }
  return dados.access_token;
}

async function google(acesso, caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`${CAL}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 204) return null;
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`google ${metodo} ${caminho}: ${r.status} ${dados.error?.message || ''}`);
    e.status = r.status;
    throw e;
  }
  return dados;
}

// ---------------------------------------------------------------------------
// Datas (sempre no fuso de São Paulo)
// ---------------------------------------------------------------------------
const somarDias = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

// Deslocamento do fuso numa data (ex.: "-03:00"), para montar RFC3339.
function deslocamento(iso) {
  const ref = new Date(`${iso}T12:00:00Z`);
  const local = new Date(ref.toLocaleString('en-US', { timeZone: FUSO }));
  const min = Math.round((local - new Date(ref.toLocaleString('en-US', { timeZone: 'UTC' }))) / 60000);
  const s = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

function localDe(dateTime) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(dateTime));
  const v = (t) => p.find((x) => x.type === t)?.value;
  return { data: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}` };
}

function horario(data, hora, duracaoMin = 60) {
  if (!hora) return { start: { date: data }, end: { date: somarDias(data, 1) } };
  const ini = new Date(`${data}T${hora.slice(0, 5)}:00${deslocamento(data)}`);
  const fim = new Date(ini.getTime() + duracaoMin * 60000);
  return {
    start: { dateTime: ini.toISOString(), timeZone: FUSO },
    end: { dateTime: fim.toISOString(), timeZone: FUSO },
  };
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
async function conectar(req, res) {
  const eu = await quemChamou(req);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${origemDe(req)}/api/google`,
    response_type: 'code',
    scope: ESCOPOS.join(' '),
    access_type: 'offline',
    prompt: 'consent',            // garante o refresh_token mesmo em reconexão
    include_granted_scopes: 'true',
    state: criarEstado(eu.id),
  }).toString();
  json(res, 200, { url: url.toString() });
}

async function retornoDoGoogle(req, res, q) {
  const volta = (r) => redirecionar(res, `${origemDe(req)}/home?google=${r}`);
  if (q.get('error')) return volta('cancelado');
  const estado = lerEstado(q.get('state'));
  if (!estado) return volta('expirou');

  const { ok, dados } = await tokenDoGoogle({
    grant_type: 'authorization_code', code: q.get('code'), redirect_uri: `${origemDe(req)}/api/google`,
  });
  if (!ok || !dados.refresh_token) { console.error('[google] troca do code', dados); return volta('erro'); }
  if (!String(dados.scope || '').includes('calendar.events')) return volta('sem-permissao');

  let email = null;
  try {
    const eu = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${dados.access_token}` } });
    email = (await eu.json()).email || null;
  } catch { /* o e-mail é só para mostrar */ }

  await sb('google_contas?on_conflict=user_id', {
    metodo: 'POST', prefer: 'resolution=merge-duplicates',
    corpo: { user_id: estado.u, email, refresh_token: dados.refresh_token, calendario_id: 'primary', conectado_em: new Date().toISOString() },
  });
  return volta('ok');
}

async function status(req, res) {
  const eu = await quemChamou(req);
  const conta = await contaDe(eu.id);
  json(res, 200, { configurado: true, conectado: !!conta, email: conta?.email || null });
}

async function desconectar(req, res) {
  const eu = await quemChamou(req);
  const conta = await contaDe(eu.id);
  if (conta) {
    // Revoga no Google também; se falhar, a ligação some daqui de qualquer jeito.
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conta.refresh_token)}`, { method: 'POST' }).catch(() => {});
    await sb(`google_contas?user_id=eq.${eu.id}`, { metodo: 'DELETE' });
    await sb(`google_eventos?user_id=eq.${eu.id}`, { metodo: 'DELETE' });
  }
  json(res, 200, { ok: true });
}

async function eventos(req, res, q) {
  const eu = await quemChamou(req);
  const conta = await contaDe(eu.id);
  if (!conta) return json(res, 200, { conectado: false, eventos: [] });
  const de = q.get('de'); const ate = q.get('ate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de || '') || !/^\d{4}-\d{2}-\d{2}$/.test(ate || '')) throw new Falha(400, 'Período inválido.');

  const acesso = await acessoDe(conta);
  const lista = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      timeMin: `${de}T00:00:00${deslocamento(de)}`, timeMax: `${somarDias(ate, 1)}T00:00:00${deslocamento(ate)}`,
      singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeZone: FUSO,
      ...(pageToken ? { pageToken } : {}),
    });
    const r = await google(acesso, `/calendars/${encodeURIComponent(conta.calendario_id)}/events?${params}`);
    lista.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken && lista.length < 5000);

  const saida = [];
  for (const ev of lista) {
    if (ev.status === 'cancelled') continue;
    // Recusou o convite → não é compromisso.
    if ((ev.attendees || []).some((a) => a.self && a.responseStatus === 'declined')) continue;
    const priv = ev.extendedProperties?.private || {};
    const meet = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || null;
    const base = {
      id: ev.id, titulo: ev.summary || '(sem título)', link: ev.htmlLink, meet,
      local: ev.location || null,
      origem: priv.medcodeOrigem ? { tipo: priv.medcodeOrigem, id: priv.medcodeId } : null,
    };
    if (ev.start?.date) {
      // Dia inteiro (o fim é exclusivo); evento de vários dias aparece em cada um, até 31.
      for (let d = ev.start.date, n = 0; d < ev.end.date && n < 31; d = somarDias(d, 1), n++) {
        if (d >= de && d <= ate) saida.push({ ...base, data: d, hora: null });
      }
    } else if (ev.start?.dateTime) {
      const ini = localDe(ev.start.dateTime);
      const fim = ev.end?.dateTime ? localDe(ev.end.dateTime) : null;
      saida.push({ ...base, data: ini.data, hora: ini.hora, horaFim: fim && fim.data === ini.data ? fim.hora : null });
    }
  }
  json(res, 200, { conectado: true, email: conta.email, eventos: saida });
}

async function reuniao(req, res) {
  const eu = await quemChamou(req);
  const conta = await contaDe(eu.id);
  if (!conta) throw new Falha(409, 'Conecte o Google Agenda primeiro (no Início, acima da agenda).');
  const b = await lerCorpo(req);
  const titulo = String(b.titulo || '').trim();
  if (!titulo) throw new Falha(400, 'Dê um nome para a reunião.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '') || !/^\d{2}:\d{2}/.test(b.hora || '')) throw new Falha(400, 'Escolha dia e hora.');
  const duracao = Math.min(Math.max(Number(b.duracaoMin) || 60, 15), 480);
  const convidados = [...new Set((b.convidados || []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];

  // 1) Histórico primeiro, com o token do usuário: as regras de acesso (RLS)
  //    dizem se ele pode registrar naquela venda/cliente/projeto.
  const [atv] = await sb('crm_atividades', {
    metodo: 'POST', token: eu.token, prefer: 'return=representation',
    corpo: {
      party_id: b.party_id || null, oportunidade_id: b.oportunidade_id || null, projeto_id: b.projeto_id || null,
      tipo: 'REUNIAO', titulo: `Reunião marcada: ${titulo}`, descricao: b.descricao?.trim() || null,
      proximo_passo: titulo, proximo_passo_em: b.data, proximo_passo_hora: b.hora.slice(0, 5), autor_id: eu.id,
    },
  });

  // 2) O evento no Google, com Meet. Se falhar, desfaz o registro.
  let ev;
  try {
    const acesso = await acessoDe(conta);
    ev = await google(acesso, `/calendars/${encodeURIComponent(conta.calendario_id)}/events?conferenceDataVersion=1&sendUpdates=${convidados.length ? 'all' : 'none'}`, {
      metodo: 'POST',
      corpo: {
        summary: titulo,
        description: b.descricao?.trim() || undefined,
        ...horario(b.data, b.hora, duracao),
        attendees: convidados.map((email) => ({ email })),
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
        extendedProperties: { private: { medcodeOrigem: 'atividade', medcodeId: atv.id } },
        reminders: { useDefault: true },
      },
    });
  } catch (e) {
    await sb(`crm_atividades?id=eq.${atv.id}`, { metodo: 'DELETE', token: eu.token }).catch(() => {});
    throw e;
  }

  const meet = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || null;
  await sb(`crm_atividades?id=eq.${atv.id}`, { metodo: 'PATCH', corpo: { meet_link: meet, google_event_id: ev.id } });
  await sb('google_eventos?on_conflict=origem,origem_id', {
    metodo: 'POST', prefer: 'resolution=merge-duplicates',
    corpo: { origem: 'atividade', origem_id: atv.id, user_id: eu.id, event_id: ev.id, atualizado_em: new Date().toISOString() },
  });
  json(res, 200, { ok: true, meet, link: ev.htmlLink, atividadeId: atv.id, convidados: convidados.length });
}

// ---------------------------------------------------------------------------
// Planejamento Geral → Google
//
// Reconcilia tudo de uma vez (é idempotente): cada compromisso com data vai
// para o Google do RESPONSÁVEL; sem responsável, para o de quem o criou. Só
// mexe no Google de quem chamou — o de cada um se acerta quando ele abre o
// sistema. O sistema manda: mudança feita no Google num evento que veio
// daqui é sobrescrita na próxima sincronização.
// ---------------------------------------------------------------------------
const RE_FEITO = /conclu|feito|finaliz|cancel|arquiv|done/i;

async function compromissosQueSaoMeus(userId) {
  const dbs = await sb('workspace_pages?type=eq.database&parent_id=is.null&deleted_at=is.null&select=id,title');
  if (!dbs.length) return [];
  const ids = dbs.map((d) => d.id).join(',');
  const [views, props] = await Promise.all([
    sb(`workspace_db_views?type=eq.calendar&database_id=in.(${ids})&select=database_id,config`),
    sb(`workspace_db_properties?database_id=in.(${ids})&select=id,database_id,name,type,options`),
  ]);
  const agendas = dbs.map((db) => {
    const cal = views.find((v) => v.database_id === db.id);
    if (!cal) return null;
    const doDb = props.filter((p) => p.database_id === db.id);
    const data = doDb.find((p) => p.id === cal.config?.dateProp)
      || doDb.find((p) => p.type === 'date' && /expectativa|conclus|prazo|vencimento|entrega/i.test(p.name))
      || doDb.find((p) => p.type === 'date' && !/cria[çc]/i.test(p.name))
      || doDb.find((p) => p.type === 'date');
    if (!data) return null;
    return {
      db, data,
      hora: doDb.find((p) => p.type === 'time') || doDb.find((p) => /^(hora|hor[aá]rio)$/i.test(p.name)) || null,
      status: doDb.find((p) => p.type === 'status') || doDb.find((p) => p.type === 'select' && /status|situa/i.test(p.name)) || null,
      pessoa: doDb.find((p) => p.type === 'person') || null,
    };
  }).filter(Boolean);
  if (!agendas.length) return [];

  const linhas = await sb(`workspace_pages?parent_id=in.(${agendas.map((a) => a.db.id).join(',')})&deleted_at=is.null&select=id,title,parent_id,created_by`);
  if (!linhas.length) return [];
  const valores = [];
  for (let i = 0; i < linhas.length; i += 150) {
    valores.push(...await sb(`workspace_db_values?row_id=in.(${linhas.slice(i, i + 150).map((l) => l.id).join(',')})&select=row_id,property_id,value`));
  }
  const porLinha = new Map();
  valores.forEach((v) => { const m = porLinha.get(v.row_id) || {}; m[v.property_id] = v.value; porLinha.set(v.row_id, m); });

  return linhas.map((l) => {
    const a = agendas.find((x) => x.db.id === l.parent_id);
    const v = porLinha.get(l.id) || {};
    const data = v[a.data.id] ? String(v[a.data.id]).slice(0, 10) : null;
    if (!data) return null;
    const dono = (a.pessoa && v[a.pessoa.id]) || l.created_by;
    if (dono !== userId) return null;
    const statusVal = a.status ? v[a.status.id] : null;
    const opt = a.status ? (a.status.options || []).find((o) => o.id === statusVal) : null;
    const hora = a.hora && v[a.hora.id] ? String(v[a.hora.id]).slice(0, 5) : null;
    return { id: l.id, titulo: l.title || 'Sem título', data, hora, feito: RE_FEITO.test(opt?.name || ''), agenda: a.db.title };
  }).filter(Boolean);
}

// Próximos passos COM HORA (visita, reunião, ligação marcada) de quem chamou
// também vão para o Google. Sem hora (ex.: "enviar proposta") ficam só no
// sistema. Os de "Marcar reunião" já têm evento próprio (com Meet) e ficam de fora.
async function passosQueSaoMeus(userId) {
  const linhas = await sb(`crm_atividades?autor_id=eq.${userId}&proximo_passo_em=not.is.null&proximo_passo_hora=not.is.null&google_event_id=is.null`
    + '&select=id,proximo_passo,titulo,proximo_passo_em,proximo_passo_hora,proximo_passo_concluido_em,empresa:finance_parties(name)');
  return linhas.map((a) => {
    const nome = a.proximo_passo || a.titulo || 'Compromisso';
    const empresa = a.empresa?.name;
    return {
      id: a.id, titulo: empresa && !nome.toLowerCase().includes(empresa.toLowerCase()) ? `${nome} · ${empresa}` : nome,
      data: String(a.proximo_passo_em).slice(0, 10), hora: String(a.proximo_passo_hora).slice(0, 5),
      feito: !!a.proximo_passo_concluido_em, agenda: 'Vendas',
    };
  });
}

async function sincronizar(req, res) {
  const eu = await quemChamou(req);
  const conta = await contaDe(eu.id);
  if (!conta) return json(res, 200, { conectado: false });

  const [linhas, passos, mapasLinha, mapasPasso] = await Promise.all([
    compromissosQueSaoMeus(eu.id),
    passosQueSaoMeus(eu.id),
    sb(`google_eventos?origem=eq.linha&user_id=eq.${eu.id}&select=*`),
    // Só os que a sincronização criou (têm assinatura); os de "Marcar reunião" não.
    sb(`google_eventos?origem=eq.atividade&user_id=eq.${eu.id}&assinatura=not.is.null&select=*`),
  ]);
  const acesso = await acessoDe(conta);
  const cal = `/calendars/${encodeURIComponent(conta.calendario_id)}/events`;
  const cont = { criados: 0, atualizados: 0, removidos: 0 };
  // Não despeja o passado no Google: item que nunca foi só entra se for recente e pendente.
  const desde = somarDias(new Date().toISOString().slice(0, 10), -7);

  const levar = async (origem, itens, mapas) => {
    const porId = new Map(mapas.map((m) => [m.origem_id, m]));
    for (const it of itens) {
      const mapa = porId.get(it.id);
      porId.delete(it.id);
      if (!mapa && (it.data < desde || it.feito)) continue;   // concluído que nunca foi: não cria
      const corpo = {
        summary: `${it.feito ? '✓ ' : ''}${it.titulo}`,
        description: `Compromisso do MedCode (${it.agenda}). Para mudar, altere no sistema.`,
        ...horario(it.data, it.hora, 60),
        status: 'confirmed',   // se foi apagado no Google, volta
        extendedProperties: { private: { medcodeOrigem: origem, medcodeId: it.id } },
      };
      const assinatura = crypto.createHash('sha1').update(JSON.stringify([corpo.summary, corpo.start, corpo.end])).digest('hex');
      if (mapa && mapa.assinatura === assinatura) continue;

      let ev = null;
      if (mapa) {
        try { ev = await google(acesso, `${cal}/${encodeURIComponent(mapa.event_id)}`, { metodo: 'PATCH', corpo }); cont.atualizados++; }
        catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }   // sumiu de vez no Google → cria de novo
      }
      if (!ev) { ev = await google(acesso, cal, { metodo: 'POST', corpo }); cont.criados++; }
      await sb('google_eventos?on_conflict=origem,origem_id', {
        metodo: 'POST', prefer: 'resolution=merge-duplicates',
        corpo: { origem, origem_id: it.id, user_id: eu.id, event_id: ev.id, assinatura, atualizado_em: new Date().toISOString() },
      });
    }
    // O que sobrou no mapa saiu da agenda (apagado, sem data/hora, mudou de dono).
    for (const mapa of porId.values()) {
      try { await google(acesso, `${cal}/${encodeURIComponent(mapa.event_id)}`, { metodo: 'DELETE' }); }
      catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
      await sb(`google_eventos?origem=eq.${origem}&origem_id=eq.${mapa.origem_id}`, { metodo: 'DELETE' });
      cont.removidos++;
    }
  };

  await levar('linha', linhas, mapasLinha);
  await levar('atividade', passos, mapasPasso);
  json(res, 200, { conectado: true, ...cont });
}

// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (!SUPABASE_URL || !ANON) throw new Error('Supabase não configurado no servidor.');
    if (!CLIENT_ID || !CLIENT_SECRET || !SERVICO) {
      if (q.get('acao') === 'status') return json(res, 200, { configurado: false, conectado: false });
      throw new Falha(503, 'A integração com o Google ainda não foi configurada no servidor.');
    }
    if (q.get('code') || q.get('error')) return await retornoDoGoogle(req, res, q);

    const acao = q.get('acao');
    const rotas = {
      GET: { conectar, status, eventos },
      POST: { desconectar, reuniao, sincronizar },
    };
    const fn = rotas[req.method]?.[acao];
    if (!fn) throw new Falha(404, 'Ação desconhecida.');
    return await fn(req, res, q);
  } catch (e) {
    if (e instanceof Falha) return json(res, e.status, { erro: e.message });
    console.error('[google]', e);
    return json(res, 500, { erro: 'Não foi possível falar com o Google agora.' });
  }
}
