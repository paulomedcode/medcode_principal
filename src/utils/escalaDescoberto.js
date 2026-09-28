/**
 * "Vaga descoberta" = plantão sem plantonista definido, sinalizado de propósito.
 *
 * Antes isso era feito cadastrando um MÉDICO chamado "Dr. Descoberto!!!" e
 * escalando ele — ou seja, uma pessoa representando a ausência de uma pessoa.
 * Isso fazia o placeholder entrar na folha de ponto, na lista de médicos, nos
 * PDFs e, depois da regra de duplicidade, impedia marcar dois locais descobertos
 * no mesmo horário (ele "estaria em dois lugares").
 *
 * Agora é um ESTADO do plantão: `doctorName` vazio + `appearance.uncovered`.
 * Sem médico, não há duplicidade possível — pode haver quantas vagas descobertas
 * forem necessárias no mesmo horário.
 */

/**
 * Cadastros que só existiam para marcar ausência. Serve para (a) tirá-los da
 * lista de médicos e (b) converter os plantões antigos ao carregar, sem exigir
 * mexer no banco. Se você usa outro nome para isso, acrescente aqui.
 */
const PLACEHOLDER_PATTERN = /descobert|sem\s*cobertura|vaga\s*aberta/i;

export const isPlaceholderDoctor = (name) => PLACEHOLDER_PATTERN.test(String(name || ''));

/** Rótulo mostrado na grade e nos PDFs no lugar do nome do médico. */
export const UNCOVERED_LABEL = 'DESCOBERTO';

export const isUncovered = (assignment) => !!assignment?.appearance?.uncovered;

/**
 * Compatibilidade com o que já está gravado: um plantão preenchido com o antigo
 * médico-placeholder é lido como vaga descoberta. O texto livre (ex.: "parte da
 * manhã, negociando com a Rosi") é preservado no subtítulo. A conversão só vira
 * definitiva no banco quando o plantão for salvo de novo.
 */
export const asUncoveredIfPlaceholder = (assignment) => {
    if (!assignment || !isPlaceholderDoctor(assignment.doctorName)) return assignment;
    return {
        ...assignment,
        doctorName: '',
        appearance: { ...(assignment.appearance || {}), uncovered: true, color: 'red' }
    };
};

/** Marca/desmarca a vaga como descoberta, cuidando do vermelho da célula. */
export const setUncovered = (assignment, value) => {
    const appearance = { ...(assignment.appearance || {}) };
    if (value) {
        appearance.uncovered = true;
        appearance.color = 'red';
    } else {
        delete appearance.uncovered;
        if (appearance.color === 'red') appearance.color = 'default';
    }
    return {
        ...assignment,
        doctorName: value ? '' : assignment.doctorName,
        appearance
    };
};
