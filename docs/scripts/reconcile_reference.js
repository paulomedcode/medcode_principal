/**
 * Código de REFERÊNCIA da reconciliação + deduplicação do import da fila cirúrgica.
 * Puro JS, sem dependências (similaridade implementada à mão).
 * Objetivo: rodar no dry-run (client) e classificar cada campo/linha.
 * NÃO grava nada — só decide. A gravação (upsert) está no fim, separada.
 */

// ---------------------------------------------------------------------------
// 1) NORMALIZAÇÃO + SIMILARIDADE
// ---------------------------------------------------------------------------
export const norm = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tira acento
  .replace(/\s+/g, ' ').trim().toLowerCase();

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

// Dice coefficient sobre bigramas — bom para nomes/descrições (0..1)
function dice(a, b) {
  a = norm(a); b = norm(b);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const big = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = big(a), B = big(b); let inter = 0;
  for (const [g, c] of A) if (B.has(g)) inter += Math.min(c, B.get(g));
  return (2 * inter) / ((a.length - 1) + (b.length - 1));
}

// Top-N candidatos por similaridade
function topMatches(value, list, getText, n = 5) {
  return list
    .map((item) => ({ item, score: dice(value, getText(item)) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, n);
}

// Limiares (ajustáveis)
const TH_EXACT = 0.999;   // igual após normalizar
const TH_SUGGEST = 0.82;  // alto o bastante p/ sugerir 1 clique

// ---------------------------------------------------------------------------
// 2) RECONCILIAÇÃO DE CAMPO DE LISTA FECHADA
//    (especialidade, anestesia, convenio, prioridade, sala, status)
//    -> {status:'exact'|'suggest'|'new'|'empty', value, canonical, suggestions}
// ---------------------------------------------------------------------------
export function reconcileEnum(value, canonicalList) {
  const v = String(value ?? '').trim();
  if (!v) return { status: 'empty', value: null };
  const exact = canonicalList.find((c) => norm(c) === norm(v));
  if (exact) return { status: 'exact', value: exact };
  const [best] = topMatches(v, canonicalList, (x) => x, 3);
  if (best && best.score >= TH_SUGGEST)
    return { status: 'suggest', value: v, canonical: best.item, suggestions: [best.item] };
  // valor novo: usuário decide [adicionar à lista] ou [manter como está]
  return { status: 'new', value: v, suggestions: topMatches(v, canonicalList, (x) => x, 3).map((m) => m.item) };
}

// ---------------------------------------------------------------------------
// 3) RECONCILIAÇÃO DE CIRURGIÃO (vs users médicos ativos)
//    medicos: [{id, name, crm, especialidade}]
//    -> {status:'exact'|'suggest'|'none', value, canonical, candidates}
// ---------------------------------------------------------------------------
export function reconcileCirurgiao(value, medicos) {
  const v = String(value ?? '').trim();
  if (!v) return { status: 'empty', value: null };
  // match por CRM se a planilha trouxe CRM embutido
  const exact = medicos.find((m) => norm(m.name) === norm(v));
  if (exact) return { status: 'exact', value: exact.name, canonical: exact };
  const cand = topMatches(v, medicos, (m) => m.name, 5).filter((c) => c.score > 0.45);
  if (cand[0] && cand[0].score >= TH_SUGGEST)
    return { status: 'suggest', value: v, canonical: cand[0].item, candidates: cand.map((c) => c.item) };
  // nenhum: usuário escolhe [criar médico] / [associar a existente] / [manter texto livre]
  return { status: 'none', value: v, candidates: cand.map((c) => c.item) };
}

// ---------------------------------------------------------------------------
// 4) RECONCILIAÇÃO DE PROCEDIMENTO (vs tabela `sigtap`: {codigo, nome})
//    EXIGE casar com um código real. Planilha pode trazer código OU nome.
//    Grava o NOME canônico em surgeries.procedimento (a fila não tem coluna de código).
//    -> {status:'exact'|'suggest'|'none', value, codigo, nome, suggestions}
// ---------------------------------------------------------------------------
export function reconcileProcedimento(rawValue, sigtap) {
  const v = String(rawValue ?? '').trim();
  if (!v) return { status: 'empty', value: null };
  const digits = onlyDigits(v);

  // a) veio um código → casa exato por código
  if (digits && digits.length >= 6) {
    const hit = sigtap.find((s) => onlyDigits(s.codigo) === digits);
    if (hit) return { status: 'exact', codigo: hit.codigo, nome: hit.nome, value: hit.nome };
    return { status: 'none', value: v, suggestions: topMatches(v, sigtap, (s) => s.codigo, 5) };
  }

  // b) veio um nome → exato por nome, senão top-N por similaridade
  const exact = sigtap.find((s) => norm(s.nome) === norm(v));
  if (exact) return { status: 'exact', codigo: exact.codigo, nome: exact.nome, value: exact.nome };
  const top = topMatches(v, sigtap, (s) => s.nome, 5).filter((m) => m.score > 0.4);
  if (top[0] && top[0].score >= TH_SUGGEST)
    return { status: 'suggest', value: v, codigo: top[0].item.codigo, nome: top[0].item.nome,
             suggestions: top.map((m) => ({ codigo: m.item.codigo, nome: m.item.nome, score: +m.score.toFixed(2) })) };
  // sem match suficiente: NUNCA inventa código — mostra os mais próximos p/ escolher
  return { status: 'none', value: v,
           suggestions: top.map((m) => ({ codigo: m.item.codigo, nome: m.item.nome, score: +m.score.toFixed(2) })) };
}

// ---------------------------------------------------------------------------
// 5) FLAGS aih/autorizada/apa/opme -> boolean (convenção real do app)
// ---------------------------------------------------------------------------
const TRUE_SET = new Set(['sim', 's', '1', 'true', 'verdadeiro', 'x', 'autorizada']);
const FALSE_SET = new Set(['', 'nao', 'n', '0', 'false', 'falso']);
export function reconcileFlag(value) {
  const s = norm(value);
  if (TRUE_SET.has(s)) return { status: 'ok', value: true };
  if (FALSE_SET.has(s)) return { status: 'ok', value: false };
  return { status: 'strange', value: false, raw: value }; // sinaliza, default false
}

// ---------------------------------------------------------------------------
// 6) DEDUPLICAÇÃO / UPSERT (o banco não tem UNIQUE — chave lógica em app)
// ---------------------------------------------------------------------------
// Chave lógica recomendada: paciente (cpf, senão cns) + procedimento + dataAtendimento.
// Justificativa: cpf/cns são nullable; o mesmo paciente pode ter VÁRIAS cirurgias,
// então só identidade não basta — agrega procedimento + data. Quando dataAtendimento
// é nula (entrada na fila ainda sem data), trata-se como o mesmo "slot lógico" para
// que reimportar a mesma planilha ATUALIZE em vez de duplicar.
export function buildDedupKey(row) {
  const paciente = onlyDigits(row.cpf) || onlyDigits(row.cns) || '';
  if (!paciente) return null; // sem cpf e sem cns -> não dá pra deduplicar
  return [paciente, norm(row.procedimento), norm(row.dataAtendimento || '')].join('|');
}

// Classifica cada linha contra o que já existe no banco.
// existing: linhas atuais de surgeries (já carregadas no client).
// Retorna 'insert' | 'update'(com id) | 'no-key'(insere sempre, alerta).
export function classifyForUpsert(rows, existing) {
  const map = new Map();
  for (const e of existing) { const k = buildDedupKey(e); if (k) map.set(k, e.id); }
  const seen = new Set();
  return rows.map((r) => {
    const k = buildDedupKey(r);
    if (!k) return { ...r, _op: 'no-key' };
    if (seen.has(k)) return { ...r, _op: 'dup-in-file', _key: k };
    seen.add(k);
    if (map.has(k)) return { ...r, _op: 'update', _id: map.get(k), _key: k };
    return { ...r, _op: 'insert', _key: k };
  });
}

// Gravação app-side (sem ON CONFLICT, pois não há índice UNIQUE ainda).
// Recebe o supabase client já autenticado. Roda em chunks.
export async function commitUpsert(supabase, classified, unidade) {
  const toInsert = classified.filter((r) => r._op === 'insert' || r._op === 'no-key');
  const toUpdate = classified.filter((r) => r._op === 'update');
  const strip = (r) => { const { _op, _id, _key, ...clean } = r; return { ...clean, unidade }; };

  let inserted = 0, updated = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200).map(strip);
    const { error } = await supabase.from('surgeries').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  for (const r of toUpdate) {
    const { error } = await supabase.from('surgeries').update(strip(r)).eq('id', r._id);
    if (error) throw error;
    updated += 1;
  }
  return { inserted, updated };
}
