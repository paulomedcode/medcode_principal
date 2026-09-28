// Extensão explícita para que o arquivo também rode no node puro
// (scripts/test-apa-regras.mjs), além do Vite.
import { normalizar } from './apaMedicationRules.js';

/**
 * Estado do campo de exame físico, derivado do texto que está gravado.
 *
 * Não existe coluna de status no banco de propósito: o texto continua sendo a
 * única fonte de verdade, então as APAs antigas abrem sem migração e o que foi
 * impresso continua valendo.
 *
 * @returns '' (nada escolhido) | 'normal' | 'alterado'
 */
export function statusDoExame(valor, textoPadrao) {
    const texto = String(valor || '').trim();
    if (!texto) return '';
    return normalizar(texto) === normalizar(textoPadrao) ? 'normal' : 'alterado';
}
