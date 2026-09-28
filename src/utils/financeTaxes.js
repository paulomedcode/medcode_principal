// Impostos sobre o faturamento (lucro presumido) — regra do negócio:
// a retenção na fonte e o imposto complementar (pago depois via DARF) somam SEMPRE 8,23%.
//   6,15% retido na fonte + 2,08% depois → padrão
//   5,85% retido na fonte + 2,38% depois → AME
//   0%    retido na fonte + 8,23% depois → contratante que não retém nada
// O complementar incide sobre o BRUTO da nota e é provisionado no DRE por competência
// (independe de o DARF já ter sido pago). Fica gravado em finance_transactions.comp_tax_pct;
// NULL (lançamento antigo) → o DRE aplica a regra padrão (2,08 / AME 2,38).

export const WITHHOLD_DEFAULT_PCT = '6.15'; // retenção padrão
export const WITHHOLD_AME_PCT = '5.85';     // retenção do AME
export const COMP_TAX_DEFAULT = 2.08;       // complementar padrão (%)
export const COMP_TAX_AME = 2.38;           // complementar AME (%)
export const COMP_TAX_FULL = 8.23;          // sem retenção: paga tudo depois (%)

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// A contraparte é o AME? (ex.: "AME Centro") — usado só como fallback/pré-seleção.
export const isAmeParty = (name) => /\bame\b/.test(norm(name));
