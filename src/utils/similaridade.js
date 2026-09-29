/**
 * Similaridade de nomes (0..1), puro JS. Usada na conciliação bancária para
 * sugerir o fornecedor/cliente a partir do texto do extrato.
 */

export const norm = (v) => String(v ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim().toLowerCase();

// Dice sobre bigramas — bom para nomes e descrições.
function dice(a, b) {
  a = norm(a); b = norm(b);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const big = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = big(a), B = big(b); let inter = 0;
  for (const [g, c] of A) if (B.has(g)) inter += Math.min(c, B.get(g));
  return (2 * inter) / ((a.length - 1) + (b.length - 1));
}

// Boost por token/prefixo: "ANTONIO PAZ" ⊂ "ANTONIO PAZ NETO".
export function nameScore(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (nb.startsWith(na) || na.startsWith(nb)) return Math.max(0.9, dice(na, nb));
  const ta = new Set(na.split(' ')), tb = new Set(nb.split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const tok = inter / Math.max(ta.size, tb.size);
  return Math.max(dice(na, nb), tok >= 0.6 ? 0.85 : tok * 0.8);
}
