// ============================================================================
// Helpers puros das propriedades de database (sem componentes — ver PropertyCell.jsx).
// Inclui a engine de filtro/ordenação usada pelas visões (config salvo em view.config).
// ============================================================================

// Paleta das opções (select/status). `pill` = fundo+texto+borda; `dot` = cor sólida
// do pontinho; `swatch` = cor de amostra no seletor de cores.
//
// As oito primeiras são as originais e NÃO podem trocar de nome: opções já
// gravadas no banco guardam a chave ('blue', 'amber'...). As demais foram
// acrescentadas depois, para dar mais escolha no seletor de cores.
export const OPT_COLORS = {
  gray:    { pill: 'bg-slate-100 text-slate-700 border-slate-200',       dot: 'bg-slate-400',   swatch: 'bg-slate-300',   label: 'Cinza' },
  blue:    { pill: 'bg-blue-100 text-blue-700 border-blue-200',          dot: 'bg-blue-500',    swatch: 'bg-blue-400',    label: 'Azul' },
  green:   { pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', swatch: 'bg-emerald-400', label: 'Verde' },
  amber:   { pill: 'bg-amber-100 text-amber-700 border-amber-200',       dot: 'bg-amber-500',   swatch: 'bg-amber-400',   label: 'Âmbar' },
  red:     { pill: 'bg-rose-100 text-rose-700 border-rose-200',          dot: 'bg-rose-500',    swatch: 'bg-rose-400',    label: 'Vermelho' },
  purple:  { pill: 'bg-violet-100 text-violet-700 border-violet-200',    dot: 'bg-violet-500',  swatch: 'bg-violet-400',  label: 'Roxo' },
  pink:    { pill: 'bg-pink-100 text-pink-700 border-pink-200',          dot: 'bg-pink-500',    swatch: 'bg-pink-400',    label: 'Rosa' },
  teal:    { pill: 'bg-teal-100 text-teal-700 border-teal-200',          dot: 'bg-teal-500',    swatch: 'bg-teal-400',    label: 'Turquesa' },
  orange:  { pill: 'bg-orange-100 text-orange-700 border-orange-200',    dot: 'bg-orange-500',  swatch: 'bg-orange-400',  label: 'Laranja' },
  yellow:  { pill: 'bg-yellow-100 text-yellow-800 border-yellow-200',    dot: 'bg-yellow-500',  swatch: 'bg-yellow-400',  label: 'Amarelo' },
  lime:    { pill: 'bg-lime-100 text-lime-800 border-lime-200',          dot: 'bg-lime-500',    swatch: 'bg-lime-400',    label: 'Limão' },
  cyan:    { pill: 'bg-cyan-100 text-cyan-700 border-cyan-200',          dot: 'bg-cyan-500',    swatch: 'bg-cyan-400',    label: 'Ciano' },
  sky:     { pill: 'bg-sky-100 text-sky-700 border-sky-200',             dot: 'bg-sky-500',     swatch: 'bg-sky-400',     label: 'Céu' },
  indigo:  { pill: 'bg-indigo-100 text-indigo-700 border-indigo-200',    dot: 'bg-indigo-500',  swatch: 'bg-indigo-400',  label: 'Índigo' },
  fuchsia: { pill: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200', dot: 'bg-fuchsia-500', swatch: 'bg-fuchsia-400', label: 'Magenta' },
  brown:   { pill: 'bg-stone-200 text-stone-700 border-stone-300',       dot: 'bg-stone-500',   swatch: 'bg-stone-400',   label: 'Marrom' },
};

export const COLOR_KEYS = Object.keys(OPT_COLORS);

/** Nome da cor em português (tooltip do seletor). */
export const colorLabel = (color) => (OPT_COLORS[color] || OPT_COLORS.gray).label;

export function colorClass(color) {
  return (OPT_COLORS[color] || OPT_COLORS.gray).pill;
}
export function dotClass(color) {
  return (OPT_COLORS[color] || OPT_COLORS.gray).dot;
}
export function swatchClass(color) {
  return (OPT_COLORS[color] || OPT_COLORS.gray).swatch;
}

export function findOption(prop, value) {
  return (prop.options || []).find((o) => o.id === value) || null;
}

export function userName(users, id) {
  const u = (users || []).find((x) => x.id === id);
  return u?.name || u?.email || '';
}

export function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** 'YYYY-MM-DD' de hoje no fuso local (toISOString jogaria para UTC). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'HH:MM' — o input de hora não engole segundos nem texto solto. */
export function formatHora(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(v);
}

/**
 * Valor de uma célula em TEXTO PURO — o que vai para o papel (impressão) e
 * para qualquer exportação. É o espelho do PropertyValue, sem as pílulas
 * coloridas: quem lê no papel precisa do nome da opção, não da cor dela.
 */
export function cellText(prop, value, users = []) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return '';
  switch (prop?.type) {
    case 'status':
    case 'select':
      return findOption(prop, value)?.name || '';
    case 'multi_select':
      return (Array.isArray(value) ? value : [])
        .map((id) => findOption(prop, id)?.name).filter(Boolean).join(', ');
    case 'person': return userName(users, value);
    case 'date': return formatDateBR(value);
    case 'time': return formatHora(value);
    case 'checkbox': return value ? 'Sim' : 'Não';
    default: return String(value);
  }
}

/**
 * Quão perto do prazo a data está: usado para colorir a Expectativa de
 * conclusão sem precisar de um campo extra de prioridade.
 * 'late' = venceu · 'today' = é hoje · 'soon' = até 2 dias · null = tranquilo.
 */
export function dueTone(iso) {
  if (!iso) return null;
  const hoje = todayISO();
  if (iso < hoje) return 'late';
  if (iso === hoje) return 'today';
  const limite = new Date();
  limite.setDate(limite.getDate() + 2);
  const lim = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
  return iso <= lim ? 'soon' : null;
}

/**
 * Texto puro do conteúdo de uma página (blocos do BlockNote) — é o que vira a
 * prévia embaixo do nome da tarefa, para dar de bater o olho e ver a última
 * anotação sem precisar abrir. Formato dos blocos: [{ content: [{ text }] }],
 * com filhos aninhados em `children`.
 *
 * `sep = '\n'` (com um `max` alto) devolve a anotação inteira, um parágrafo
 * por bloco — é o que o relatório impresso usa.
 */
export function plainTextFromBlocks(content, max = 220, sep = ' · ') {
  if (!content) return '';
  const parts = [];
  const walk = (blocks) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (parts.join(' ').length > max) return;
      const inline = b?.content;
      if (Array.isArray(inline)) {
        const t = inline.map((i) => (typeof i === 'string' ? i : i?.text || '')).join('').trim();
        if (t) parts.push(t);
      } else if (typeof inline === 'string' && inline.trim()) {
        parts.push(inline.trim());
      }
      if (b?.children) walk(b.children);
    }
  };
  walk(Array.isArray(content) ? content : content?.blocks);
  // Com separador de linha (impressão) cada bloco vira um parágrafo; com o
  // separador padrão vira uma frase só, que é o formato da prévia da tabela.
  const txt = sep === '\n'
    // Linha em branco entre parágrafos vira só quebra: no papel, o buraco de
    // uma linha vazia separa a tarefa da seguinte mais do que separa os
    // parágrafos dela.
    ? parts.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
    : parts.join(sep).replace(/\s+/g, ' ').trim();
  return txt.length > max ? `${txt.slice(0, max)}…` : txt;
}

// ----------------------------------------------------------------------------
// TAREFA CONCLUÍDA
// Serve para tirar da frente o que já acabou (a tabela recolhe os concluídos
// no rodapé). A leitura é pelo NOME da opção de status porque é o que o
// usuário controla — renomear "Concluído" para "Finalizado" continua valendo.
// ----------------------------------------------------------------------------
const DONE_RE = /conclu|finaliz|feito|pronto|entregue|encerrad|done/i;

/** A coluna que manda no andamento da tarefa (status, ou um select "Status"). */
export function findStatusProp(props = []) {
  return props.find((p) => p.type === 'status')
    || props.find((p) => p.type === 'select' && /status|situa/i.test(p.name))
    || null;
}

/** true se a linha está num status de conclusão. */
export function isRowDone(row, props, statusProp = findStatusProp(props)) {
  if (!statusProp) return false;
  const v = row?.values?.[statusProp.id];
  if (v == null || v === '') return false;
  const opt = (statusProp.options || []).find((o) => o.id === v);
  return DONE_RE.test(opt?.name || String(v));
}

/** A opção de conclusão da coluna de status ("Concluído", "Feito"...), se houver. */
export function findDoneOption(statusProp) {
  return (statusProp?.options || []).find((o) => DONE_RE.test(o?.name || '')) || null;
}

/** Gera um id estável para uma nova opção de select/status. */
export const optionId = () =>
  (globalThis.crypto?.randomUUID?.() || `opt-${Math.random().toString(36).slice(2)}-${Date.now()}`);

// Rótulos amigáveis dos tipos de propriedade (para o editor de coluna).
export const PROP_TYPE_LABELS = {
  text: 'Texto',
  number: 'Número',
  select: 'Seleção',
  multi_select: 'Multi-seleção',
  status: 'Status',
  date: 'Data',
  time: 'Hora',
  person: 'Pessoa',
  checkbox: 'Caixa de seleção',
  url: 'Link',
};

// Tipos que o usuário pode escolher no editor de coluna.
export const SELECTABLE_PROP_TYPES = ['text', 'number', 'select', 'multi_select', 'status', 'date', 'time', 'person', 'checkbox', 'url'];

/**
 * Largura de cada coluna na tabela, por tipo (px).
 *
 * O que importa é o NOME da tarefa: ele fica sem largura fixa e engole toda a
 * sobra. As demais recebem só o que o conteúdo pede — uma hora não precisa do
 * mesmo espaço que um nome de pessoa. Fora daqui, cai no padrão.
 */
export const COL_WIDTH = {
  status: 118,
  select: 132,
  multi_select: 190,
  date: 116,
  time: 78,
  person: 168,
  checkbox: 56,
  number: 96,
  url: 180,
  text: 150,
};

export const colWidth = (prop) => {
  if (!prop) return COL_WIDTH.text;
  // Colunas de rastreio (ex.: "Ref. agenda") não merecem espaço nobre.
  if (/^ref\./i.test(prop.name)) return 96;
  const base = COL_WIDTH[prop.type] || COL_WIDTH.text;
  // O título da coluna também pesa: "Expectativa de conclusão" não cabe nos
  // 116px de uma data qualquer. Como o cabeçalho quebra em duas linhas, basta
  // metade do texto — o resto do espaço fica com o nome da tarefa.
  const rotulo = Math.min(170, Math.round((prop.name || '').length * 3.4) + 40);
  return Math.max(base, rotulo);
};

/** Tipos que usam a lista de opções (select-like). */
export const OPTION_TYPES = new Set(['select', 'multi_select', 'status']);

// ----------------------------------------------------------------------------
// FILTROS
// Modelo: filter = [{ id, propId, op, value }]. propId '__title' filtra o Nome.
// ----------------------------------------------------------------------------

// Operadores disponíveis por tipo de propriedade.
export const FILTER_OPS = {
  text: [
    { op: 'contains', label: 'contém' },
    { op: 'not_contains', label: 'não contém' },
    { op: 'equals', label: 'é igual a' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  url: [
    { op: 'contains', label: 'contém' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  number: [
    { op: 'eq', label: '=' },
    { op: 'neq', label: '≠' },
    { op: 'gt', label: '>' },
    { op: 'lt', label: '<' },
    { op: 'gte', label: '≥' },
    { op: 'lte', label: '≤' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  select: [
    { op: 'is', label: 'é' },
    { op: 'is_not', label: 'não é' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  status: [
    { op: 'is', label: 'é' },
    { op: 'is_not', label: 'não é' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  multi_select: [
    { op: 'contains', label: 'contém' },
    { op: 'not_contains', label: 'não contém' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  person: [
    { op: 'is', label: 'é' },
    { op: 'is_not', label: 'não é' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  date: [
    { op: 'eq', label: 'é' },
    { op: 'before', label: 'antes de' },
    { op: 'after', label: 'depois de' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  time: [
    { op: 'eq', label: 'é' },
    { op: 'before', label: 'antes de' },
    { op: 'after', label: 'depois de' },
    { op: 'is_empty', label: 'está vazio', noValue: true },
    { op: 'is_not_empty', label: 'não está vazio', noValue: true },
  ],
  checkbox: [
    { op: 'is_true', label: 'marcado', noValue: true },
    { op: 'is_false', label: 'desmarcado', noValue: true },
  ],
};

export function opsForType(type) {
  return FILTER_OPS[type] || FILTER_OPS.text;
}

const isBlank = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const lc = (v) => String(v ?? '').toLowerCase();

/** Avalia UM filtro contra o valor bruto de uma linha. */
function matchOne(op, cellValue, target, type) {
  switch (op) {
    case 'is_empty': return isBlank(cellValue);
    case 'is_not_empty': return !isBlank(cellValue);
    case 'is_true': return cellValue === true;
    case 'is_false': return !cellValue;
    case 'contains':
      if (type === 'multi_select') return Array.isArray(cellValue) && cellValue.includes(target);
      return lc(cellValue).includes(lc(target));
    case 'not_contains':
      if (type === 'multi_select') return !(Array.isArray(cellValue) && cellValue.includes(target));
      return !lc(cellValue).includes(lc(target));
    case 'equals': return lc(cellValue) === lc(target);
    case 'is': return cellValue === target;
    case 'is_not': return cellValue !== target;
    case 'eq':
      // Data e hora comparam como texto ('2026-07-31', '08:00' já ordenam certo).
      if (type === 'date' || type === 'time') return String(cellValue || '') === String(target || '');
      return Number(cellValue) === Number(target);
    case 'neq': return Number(cellValue) !== Number(target);
    case 'gt': return Number(cellValue) > Number(target);
    case 'lt': return Number(cellValue) < Number(target);
    case 'gte': return Number(cellValue) >= Number(target);
    case 'lte': return Number(cellValue) <= Number(target);
    case 'before': return String(cellValue || '') !== '' && String(cellValue) < String(target);
    case 'after': return String(cellValue || '') !== '' && String(cellValue) > String(target);
    default: return true;
  }
}

const cellOf = (row, propId) => (propId === '__title' ? (row.title || '') : row.values?.[propId]);

/** Aplica a lista de filtros (AND) sobre as linhas. `filters` inválidos são ignorados. */
export function applyFilters(rows, filters, props) {
  const active = (filters || []).filter((f) => f && f.propId && f.op);
  if (active.length === 0) return rows;
  const typeOf = (propId) => (propId === '__title' ? 'text' : (props.find((p) => p.id === propId)?.type || 'text'));
  return rows.filter((row) =>
    active.every((f) => {
      const spec = opsForType(typeOf(f.propId)).find((o) => o.op === f.op);
      if (spec && !spec.noValue && isBlank(f.value)) return true; // filtro sem valor ainda: não restringe
      return matchOne(f.op, cellOf(row, f.propId), f.value, typeOf(f.propId));
    })
  );
}

// ----------------------------------------------------------------------------
// ORDENAÇÃO
// Modelo: sort = [{ propId, dir: 'asc'|'desc' }]. propId '__title' ordena o Nome.
// ----------------------------------------------------------------------------
// Compara dois valores NÃO vazios (o tratamento de vazio fica no applySort,
// para que "vazio por último" valha tanto no crescente quanto no decrescente).
function compareValues(a, b, type) {
  if (type === 'number') return Number(a) - Number(b);
  if (type === 'checkbox') return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
}

/** Ordena estável por múltiplas chaves. Vazios sempre por último. Não muta o array. */
export function applySort(rows, sorts, props) {
  const active = (sorts || []).filter((s) => s && s.propId);
  if (active.length === 0) return rows;
  const typeOf = (propId) => (propId === '__title' ? 'text' : (props.find((p) => p.id === propId)?.type || 'text'));
  const decorated = rows.map((r, i) => [r, i]);
  decorated.sort(([a, ia], [b, ib]) => {
    for (const s of active) {
      const av = cellOf(a, s.propId), bv = cellOf(b, s.propId);
      const ba = isBlank(av), bb = isBlank(bv);
      if (ba && bb) continue;
      if (ba) return 1;   // vazio sempre por último (independe da direção)
      if (bb) return -1;
      const c = compareValues(av, bv, typeOf(s.propId));
      if (c !== 0) return s.dir === 'desc' ? -c : c;
    }
    return ia - ib; // estabilidade
  });
  return decorated.map(([r]) => r);
}
