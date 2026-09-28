/**
 * Motor de conduta pré-operatória de medicamentos (APA).
 *
 * Funções puras, sem React e sem Supabase, para que possam ser testadas
 * isoladamente (`node scripts/test-apa-regras.mjs`).
 *
 * Uma regra tem o formato:
 * {
 *   id, ativo, ordem,
 *   classe:    'Ácido acetilsalicílico',
 *   termos:    ['aas', 'aspirina', 'acido acetilsalicilico'],
 *   conduta:   'Em geral, manter',            // frase curta, vira o chip
 *   texto:     'Em pacientes com stent...',   // explicação completa
 *   nivel:     'alta' | 'atencao',
 *   contexto:  'sempre' | 'neuroeixo',        // 'neuroeixo' só vale se o plano previr punção
 *   clcr_faixas: [{ ate: 30, conduta, texto }] | null,
 *   referencia, revisado_por, revisado_em
 * }
 */

/** Termos que indicam punção de neuroeixo ou bloqueio no plano anestésico. */
const TERMOS_NEUROEIXO = [
    'raqui', 'raquianestesia', 'raqui anestesia',
    'peridural', 'epidural', 'neuroeixo', 'espinhal', 'subaracnoidea',
    'bloqueio', 'bloqueios', 'plexo', 'duplo bloqueio'
];

/**
 * Normaliza texto para comparação: minúsculas, sem acento, sem pontuação,
 * hífen vira espaço e espaços repetidos colapsam.
 */
export function normalizar(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[-_/,.;:()[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Verifica se um termo aparece no texto respeitando limite de palavra.
 *
 * É o que evita o falso positivo por substring que existia no protótipo de
 * referência (onde 'aas' casava dentro de qualquer palavra que o contivesse).
 */
export function contemTermo(textoNormalizado, termo) {
    const alvo = normalizar(termo);
    if (!alvo) return false;
    const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(textoNormalizado);
}

/** O plano anestésico prevê punção de neuroeixo ou bloqueio periférico? */
export function planoTemNeuroeixo(planTecnica) {
    const texto = normalizar(planTecnica);
    if (!texto) return false;
    return TERMOS_NEUROEIXO.some(termo => contemTermo(texto, termo));
}

/**
 * A conduta escrita na linha é de manutenção do medicamento?
 *
 * Serve só para colorir o campo: uma conduta como "Em geral, manter" não pode
 * aparecer em vermelho de suspensão.
 */
export function condutaEhManutencao(conduta) {
    const texto = normalizar(conduta);
    if (!texto) return false;
    if (/\b(suspender|suspensao|descontinuar|interromper|evitar|contraindica)\b/.test(texto)) return false;
    return /\b(manter|mantida|mantido|manutencao)\b/.test(texto);
}

/**
 * Clearance de creatinina por Cockcroft-Gault, em mL/min.
 * Retorna null quando falta qualquer dado ou quando os valores são implausíveis.
 */
export function calcularClCr({ idade, peso, creatinina, sexo }) {
    const idadeNum = Number(String(idade ?? '').replace(',', '.'));
    const pesoNum = Number(String(peso ?? '').replace(',', '.'));
    const creatNum = Number(String(creatinina ?? '').replace(',', '.'));

    if (!Number.isFinite(idadeNum) || idadeNum <= 0 || idadeNum > 120) return null;
    if (!Number.isFinite(pesoNum) || pesoNum <= 0 || pesoNum > 400) return null;
    if (!Number.isFinite(creatNum) || creatNum <= 0 || creatNum > 30) return null;

    let clcr = ((140 - idadeNum) * pesoNum) / (72 * creatNum);
    if (normalizar(sexo).startsWith('f')) clcr *= 0.85;
    return Math.round(clcr);
}

/**
 * Escolhe a faixa de ClCr aplicável. As faixas são ordenadas por `ate`
 * (limite superior, exclusivo do topo); a última pode ter `ate: null`.
 */
function faixaClCrAplicavel(faixas, clcr) {
    if (!Array.isArray(faixas) || faixas.length === 0 || clcr == null) return null;
    const ordenadas = [...faixas].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
    return ordenadas.find(faixa => faixa.ate == null || clcr < faixa.ate) || null;
}

/**
 * Avalia UM medicamento contra a lista de regras.
 *
 * O casamento é feito somente sobre o campo `nome`, que é onde o médico
 * escreve o medicamento. Dose e frequência ficam de fora de propósito: incluí-las
 * aumenta o ruído sem ganho clínico.
 *
 * @returns {{ alertas: Array, ocultosPorContexto: Array }}
 *   `ocultosPorContexto` são regras que casaram mas cujo contexto não se aplica
 *   (ex.: regra de neuroeixo num plano de anestesia geral). Elas não somem da
 *   interface: viram um aviso discreto que o médico pode expandir.
 */
export function avaliarMedicamento(medicamento, regras, contexto = {}) {
    const nome = normalizar(medicamento?.nome);
    if (!nome) return { alertas: [], ocultosPorContexto: [] };

    const { temNeuroeixo = false, clcr = null } = contexto;
    const alertas = [];
    const ocultosPorContexto = [];

    (regras || [])
        .filter(regra => regra && regra.ativo !== false)
        .forEach(regra => {
            const casou = (regra.termos || []).some(termo => contemTermo(nome, termo));
            if (!casou) return;

            let conduta = regra.conduta;
            let texto = regra.texto;
            let detalheClCr = null;

            const faixa = faixaClCrAplicavel(regra.clcr_faixas, clcr);
            if (faixa) {
                conduta = faixa.conduta || conduta;
                texto = faixa.texto || texto;
                detalheClCr = `ClCr estimado ${clcr} mL/min (Cockcroft-Gault)`;
            } else if (Array.isArray(regra.clcr_faixas) && regra.clcr_faixas.length > 0) {
                detalheClCr = 'Informe creatinina, peso e data de nascimento para estimar o ClCr.';
            }

            const alerta = {
                regraId: regra.id,
                codigo: regra.codigo,
                classe: regra.classe,
                conduta,
                texto,
                nivel: regra.nivel === 'alta' ? 'alta' : 'atencao',
                contexto: regra.contexto || 'sempre',
                referencia: regra.referencia || '',
                revisado: !!regra.revisado,
                detalheClCr
            };

            if (alerta.contexto === 'neuroeixo' && !temNeuroeixo) {
                ocultosPorContexto.push(alerta);
            } else {
                alertas.push(alerta);
            }
        });

    const ordemNivel = { alta: 0, atencao: 1 };
    alertas.sort((a, b) => ordemNivel[a.nivel] - ordemNivel[b.nivel]);

    return { alertas, ocultosPorContexto };
}

/**
 * Avalia a lista inteira de medicamentos da APA.
 *
 * Diferente do protótipo de referência — que concatenava todos os medicamentos
 * num único texto e perdia a origem do alerta — aqui cada alerta fica preso à
 * linha que o gerou.
 *
 * @returns {{ linhas: Array, totalAlertas: number, totalAltos: number, totalOcultos: number }}
 */
export function avaliarMedicamentos(medicamentos, regras, contexto = {}) {
    const linhas = (medicamentos || []).map((medicamento, index) => {
        const { alertas, ocultosPorContexto } = avaliarMedicamento(medicamento, regras, contexto);
        return { index, medicamento, alertas, ocultosPorContexto };
    });

    return {
        linhas,
        totalAlertas: linhas.reduce((total, linha) => total + linha.alertas.length, 0),
        totalAltos: linhas.reduce((total, linha) => total + linha.alertas.filter(a => a.nivel === 'alta').length, 0),
        totalOcultos: linhas.reduce((total, linha) => total + linha.ocultosPorContexto.length, 0)
    };
}
