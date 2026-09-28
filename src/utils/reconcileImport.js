/**
 * Lógica de reconciliação + deduplicação do import da fila cirúrgica.
 * Puro, sem React. O modal consome analyzeRows() e finalizeRow().
 */

export const norm = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim().toLowerCase();

export const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');
const pad2 = (n) => String(n).padStart(2, '0');

// ---- similaridade (Dice de bigramas) ----
function dice(a, b) {
  a = norm(a); b = norm(b);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const big = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = big(a), B = big(b); let inter = 0;
  for (const [g, c] of A) if (B.has(g)) inter += Math.min(c, B.get(g));
  return (2 * inter) / ((a.length - 1) + (b.length - 1));
}
// boost por token/prefixo: "ANTONIO PAZ" ⊂ "ANTONIO PAZ NETO"
export function nameScore(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (nb.startsWith(na) || na.startsWith(nb)) return Math.max(0.9, dice(na, nb));
  const ta = new Set(na.split(' ')), tb = new Set(nb.split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const tok = inter / Math.max(ta.size, tb.size);
  return Math.max(dice(na, nb), tok >= 0.6 ? 0.85 : tok * 0.8);
}
function topMatches(value, list, getText, scorer, n = 5) {
  return list.map((item) => ({ item, score: scorer(value, getText(item)) }))
    .sort((x, y) => y.score - x.score).slice(0, n);
}
const TH_SUGGEST = 0.82;

// ---- datas / hora / flags ----
export function parseDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return { value: null };
  if (v instanceof Date && !isNaN(v)) return { value: `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}` };
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { value: s };
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return { value: `${m[3]}-${m[2]}-${m[1]}` };
  return { erro: `data inválida "${s}" (use AAAA-MM-DD)` };
}
export function parseHora(v) {
  if (v === null || v === undefined || String(v).trim() === '') return { value: null };
  if (v instanceof Date && !isNaN(v)) return { value: `${pad2(v.getHours())}:${pad2(v.getMinutes())}` };
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m) return { value: `${pad2(+m[1])}:${m[2]}` };
  return { erro: `horário inválido (use HH:MM)` };
}
const TRUE_SET = new Set(['sim', 's', '1', 'true', 'verdadeiro', 'x', 'autorizada']);
const FALSE_SET = new Set(['', 'nao', 'n', '0', 'false', 'falso']);
export function reconcileFlag(v) {
  const s = norm(v);
  if (TRUE_SET.has(s)) return { value: true };
  if (FALSE_SET.has(s)) return { value: false };
  return { value: false, strange: String(v) };
}

// ---- reconciliação ----
// enum: {status:'exact'|'suggest'|'new'|'empty', value, canonical, options}
export function reconcileEnum(value, list) {
  const v = String(value ?? '').trim();
  if (!v) return { status: 'empty', value: null };
  const exact = list.find((c) => norm(c) === norm(v));
  if (exact) return { status: 'exact', value: exact };
  const top = topMatches(v, list, (x) => x, dice, 3);
  if (top[0] && top[0].score >= TH_SUGGEST)
    return { status: 'suggest', value: v, canonical: top[0].item, options: list };
  return { status: 'new', value: v, options: list };
}
// cirurgiao: {status:'exact'|'suggest'|'none'|'empty', value, canonical, candidates}
export function reconcileCirurgiao(value, medicos) {
  const v = String(value ?? '').trim();
  if (!v) return { status: 'empty', value: null };
  const exact = medicos.find((m) => norm(m.name) === norm(v));
  if (exact) return { status: 'exact', value: exact.name };
  const cand = topMatches(v, medicos, (m) => m.name, nameScore, 6).filter((c) => c.score > 0.45);
  if (cand[0] && cand[0].score >= TH_SUGGEST)
    return { status: 'suggest', value: v, canonical: cand[0].item.name, candidates: cand.map((c) => c.item.name) };
  return { status: 'none', value: v, candidates: cand.map((c) => c.item.name) };
}
// procedimento: {status:'exact'|'suggest'|'none'|'empty', value, codigo, suggestions[]}
export function reconcileProcedimento(rawValue, sigtap) {
  const v = String(rawValue ?? '').trim();
  if (!v) return { status: 'empty', value: null };
  const digits = onlyDigits(v);
  if (digits && digits.length >= 6) {
    const hit = sigtap.find((s) => onlyDigits(s.codigo) === digits);
    if (hit) return { status: 'exact', value: hit.nome, codigo: hit.codigo };
    return { status: 'none', value: v, suggestions: [] };
  }
  const exact = sigtap.find((s) => norm(s.nome) === norm(v));
  if (exact) return { status: 'exact', value: exact.nome, codigo: exact.codigo };
  const top = topMatches(v, sigtap, (s) => s.nome, dice, 6).filter((m) => m.score > 0.4);
  const sugg = top.map((m) => ({ codigo: m.item.codigo, nome: m.item.nome, score: +m.score.toFixed(2) }));
  if (top[0] && top[0].score >= TH_SUGGEST)
    return { status: 'suggest', value: v, codigo: top[0].item.codigo, canonical: top[0].item.nome, suggestions: sugg };
  return { status: 'none', value: v, suggestions: sugg };
}

// ---- dedup ----
export function buildDedupKey(row) {
  const paciente = onlyDigits(row.cpf) || onlyDigits(row.cns) || '';
  if (!paciente) return null;
  return [paciente, norm(row.procedimento), norm(row.dataAtendimento || '')].join('|');
}

// ---- cabeçalhos ----
const normHeader = (v) => norm(v).replace(/[\s._\-/]+/g, '');
const HEADER_ALIASES = {
  nomepaciente: 'nomePaciente', nome: 'nomePaciente', paciente: 'nomePaciente',
  cpf: 'cpf', cns: 'cns', cartaosus: 'cns',
  nascimento: 'nascimento', datanascimento: 'nascimento', dn: 'nascimento',
  telefone1: 'telefone1', telefone: 'telefone1', fone: 'telefone1', celular: 'telefone1',
  telefone2: 'telefone2', fone2: 'telefone2',
  municipio: 'municipio', cidade: 'municipio',
  cirurgiao: 'cirurgiao', medico: 'cirurgiao',
  especialidade: 'especialidade',
  procedimento: 'procedimento', procedimentocodigo: 'procedimento', codigosigtap: 'procedimento', sigtap: 'procedimento', cirurgia: 'procedimento',
  anestesia: 'anestesia', tipoanestesia: 'anestesia',
  convenio: 'convenio',
  prioridade: 'prioridade', classificacao: 'prioridade',
  sala: 'sala',
  dataatendimento: 'dataAtendimento', atendimento: 'dataAtendimento',
  dataautorizacao: 'dataAutorizacao', autorizacao: 'dataAutorizacao',
  dataagendado: 'dataAgendado', dataagendamento: 'dataAgendado', agendamento: 'dataAgendado',
  horario: 'horario', hora: 'horario',
  aih: 'aih', autorizada: 'autorizada', apa: 'apa', opme: 'opme',
  status: 'status', observacoes: 'observacoes', observacao: 'observacoes', obs: 'observacoes',
  unidade: 'unidade', duracao: 'duracao', duração: 'duracao',
};
export function mapHeaders(firstRow) {
  const map = {};
  Object.keys(firstRow).forEach((h) => { const c = HEADER_ALIASES[normHeader(h)]; if (c) map[h] = c; });
  return map;
}
export const makeGetter = (headerMap) => (obj, canon) => {
  const h = Object.keys(headerMap).find((k) => headerMap[k] === canon);
  return h ? obj[h] : '';
};

const ENUM_FIELDS = ['especialidade', 'anestesia', 'convenio', 'prioridade', 'status'];

/**
 * Analisa uma linha crua -> estrutura com resultados por campo + erros base.
 * ctx = { medicos, sigtap, lists:{status,convenio,anestesia,prioridade,especialidade,sala}, get }
 */
export function analyzeRow(raw, linha, ctx) {
  const { get, medicos, sigtap, lists } = ctx;
  const baseErrors = [];
  const warnings = [];
  const scalar = {
    nomePaciente: String(get(raw, 'nomePaciente') || '').trim(),
    cpf: onlyDigits(get(raw, 'cpf')) || null,
    cns: onlyDigits(get(raw, 'cns')) || null,
    telefone1: String(get(raw, 'telefone1') || '').trim() || null,
    telefone2: String(get(raw, 'telefone2') || '').trim() || null,
    municipio: String(get(raw, 'municipio') || '').trim() || null,
    sala: String(get(raw, 'sala') || '').trim() || null,
    observacoes: String(get(raw, 'observacoes') || '').trim() || null,
    duracao: String(get(raw, 'duracao') || '').trim() || null,
  };
  if (!scalar.nomePaciente) baseErrors.push('nome do paciente é obrigatório');
  if (!scalar.cpf && !scalar.cns) baseErrors.push('informe CPF ou CNS (necessário para deduplicação)');

  // datas/hora
  const dates = {};
  for (const f of ['nascimento', 'dataAtendimento', 'dataAutorizacao', 'dataAgendado']) {
    const r = parseDate(get(raw, f));
    if (r.erro) baseErrors.push(`${f}: ${r.erro}`); else dates[f] = r.value;
  }
  const hr = parseHora(get(raw, 'horario'));
  if (hr.erro) baseErrors.push(hr.erro); else dates.horario = hr.value;

  // flags
  const flags = {};
  for (const f of ['aih', 'autorizada', 'apa', 'opme']) {
    const r = reconcileFlag(get(raw, f));
    flags[f] = r.value;
    if (r.strange) warnings.push(`${f}: valor "${r.strange}" interpretado como NAO`);
  }

  // campos reconciliados
  const fields = {
    cirurgiao: reconcileCirurgiao(get(raw, 'cirurgiao'), medicos),
    procedimento: reconcileProcedimento(get(raw, 'procedimento'), sigtap),
  };
  for (const f of ENUM_FIELDS) fields[f] = reconcileEnum(get(raw, f), lists[f] || []);

  // obrigatórios de negócio que dependem de reconciliação
  if (fields.cirurgiao.status === 'empty') baseErrors.push('cirurgião é obrigatório');
  if (fields.procedimento.status === 'empty') baseErrors.push('procedimento é obrigatório');
  if (fields.status.status === 'empty') {
    // default Aguardando
    const aguard = (lists.status || []).find((s) => norm(s) === 'aguardando') || 'AGUARDANDO';
    fields.status = { status: 'exact', value: aguard };
  }

  return { linha, scalar, dates, flags, fields, baseErrors, warnings };
}

// quais campos exigem decisão do usuário
export function fieldNeedsDecision(res) {
  return res && (res.status === 'suggest' || res.status === 'new' || res.status === 'none');
}

/**
 * Aplica as decisões do usuário e devolve {status, payload, pending[]}.
 * decisions[campo] = valor escolhido (string) | {codigo,nome} p/ procedimento | '__free__' p/ manter texto.
 */
export function finalizeRow(an, decisions = {}, unidade = null) {
  const pending = [];
  const p = {
    nomePaciente: an.scalar.nomePaciente,
    cpf: an.scalar.cpf, cns: an.scalar.cns,
    telefone1: an.scalar.telefone1, telefone2: an.scalar.telefone2,
    municipio: an.scalar.municipio, sala: an.scalar.sala,
    observacoes: an.scalar.observacoes, duracao: an.scalar.duracao,
    nascimento: an.dates.nascimento ?? null,
    dataAtendimento: an.dates.dataAtendimento ?? null,
    dataAutorizacao: an.dates.dataAutorizacao ?? null,
    dataAgendado: an.dates.dataAgendado ?? null,
    horario: an.dates.horario ?? null,
    aih: an.flags.aih, autorizada: an.flags.autorizada, apa: an.flags.apa, opme: an.flags.opme,
    unidade,
  };

  const resolve = (campo, res, applyFree) => {
    if (!res) { p[campo] = null; return; }
    if (res.status === 'exact') { p[campo] = res.value; return; }
    if (res.status === 'empty') { p[campo] = null; return; }
    const d = decisions[campo];
    if (d === undefined) { pending.push(campo); p[campo] = null; return; }
    applyFree(d);
  };

  resolve('cirurgiao', an.fields.cirurgiao, (d) => { p.cirurgiao = d === '__free__' ? an.fields.cirurgiao.value : d; });
  resolve('status', an.fields.status, (d) => { p.status = d === '__free__' ? an.fields.status.value : d; });
  for (const f of ['especialidade', 'anestesia', 'convenio', 'prioridade']) {
    resolve(f, an.fields[f], (d) => { p[f] = d === '__free__' ? an.fields[f].value : d; });
  }
  // procedimento: decisão = {codigo,nome} ou '__free__'
  const pr = an.fields.procedimento;
  if (pr.status === 'exact') p.procedimento = pr.value;
  else if (pr.status === 'empty') p.procedimento = null;
  else {
    const d = decisions.procedimento;
    if (d === undefined) { pending.push('procedimento'); p.procedimento = null; }
    else if (d === '__free__') p.procedimento = pr.value;
    else p.procedimento = d.nome;
  }

  const status = an.baseErrors.length ? 'erro' : (pending.length ? 'decisao' : 'ok');
  return { status, payload: p, pending };
}
