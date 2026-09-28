/**
 * Laudos padrão do exame físico normal da APA.
 *
 * Estes são apenas os valores de fábrica: o texto realmente usado vem de
 * `settings.id = 'apa_exame_padrao'` e é editável em
 * Configurações → APA — Regras e Textos. Os valores abaixo servem para o
 * sistema já nascer funcionando e como "restaurar padrão".
 */

export const CAMPOS_EXAME_PADRAO = [
    {
        campo: 'acv',
        rotulo: 'Cardiovascular (ACV)',
        padrao: 'Ritmo cardíaco regular, bulhas normofonéticas em dois tempos, sem sopros audíveis. Pulsos periféricos presentes e simétricos. Sem edema periférico.'
    },
    {
        campo: 'ar',
        rotulo: 'Respiratório (AR)',
        padrao: 'Murmúrio vesicular presente e bilateralmente distribuído, sem sibilos, estertores ou outros ruídos adventícios.'
    },
    {
        campo: 'abdome',
        rotulo: 'Abdome',
        padrao: 'Abdome plano, flácido, indolor à palpação, sem visceromegalias ou massas palpáveis. Ruídos hidroaéreos presentes.'
    }
];

/** Mapa { campo: textoPadrão } com os valores de fábrica. */
export const TEXTOS_EXAME_FABRICA = CAMPOS_EXAME_PADRAO.reduce((mapa, item) => {
    mapa[item.campo] = item.padrao;
    return mapa;
}, {});
