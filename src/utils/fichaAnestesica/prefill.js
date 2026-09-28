/**
 * Aproveitamento da APA na abertura da Ficha Anestésica.
 *
 * Traz o que já foi levantado na avaliação pré-anestésica para o cabeçalho da
 * ficha, sem obrigar o anestesista a redigitar. Tudo o que vem daqui é
 * *sugestão*: o peso muda no dia, a técnica planejada pode não ser a executada,
 * e a ficha registra o que de fato aconteceu.
 *
 * Por isso cada campo carrega a marca `origem: 'apa'` — a tela mostra de onde
 * veio e o médico corrige à vontade.
 *
 * Função pura: nada de React nem Supabase.
 */

/** Idade em anos a partir da data de nascimento, na data de referência. */
export function idadeEmAnos(dataNasc, referencia = new Date()) {
    if (!dataNasc) return null;
    const nascimento = new Date(`${String(dataNasc).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(nascimento.getTime())) return null;

    let idade = referencia.getFullYear() - nascimento.getFullYear();
    const mes = referencia.getMonth() - nascimento.getMonth();
    if (mes < 0 || (mes === 0 && referencia.getDate() < nascimento.getDate())) idade--;
    return idade >= 0 && idade <= 130 ? idade : null;
}

/** IMC a partir de peso (kg) e altura (cm ou m). */
export function calcularImc(peso, altura) {
    const p = Number(String(peso ?? '').replace(',', '.'));
    let a = Number(String(altura ?? '').replace(',', '.'));
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(a) || a <= 0) return null;
    if (a > 3) a = a / 100; // veio em centímetros
    const imc = p / (a * a);
    return Number.isFinite(imc) ? Number(imc.toFixed(1)) : null;
}

/** Campos da APA que são texto com JSON dentro (`alergias`, `medicamentos`). */
function listaDeJson(valor) {
    if (Array.isArray(valor)) return valor;
    if (typeof valor !== 'string' || !valor.trim()) return [];
    try {
        const dados = JSON.parse(valor);
        return Array.isArray(dados) ? dados : [];
    } catch {
        return [];
    }
}

/** Resumo em uma linha das alergias, para o cabeçalho da ficha. */
export function resumirAlergias(apa) {
    if (apa?.negaAlergia) return 'Nega alergias';
    const itens = listaDeJson(apa?.alergias)
        .map(item => [item?.substancia, item?.reacao].filter(Boolean).join(' — '))
        .filter(Boolean);
    return itens.length ? itens.join('; ') : '';
}

/** Medicamentos de uso contínuo, com a conduta definida na APA. */
export function medicamentosEmUso(apa) {
    if (apa?.negaMed) return [];
    return listaDeJson(apa?.medicamentos)
        .filter(item => item?.nome?.trim())
        .map(item => ({
            nome: item.nome.trim(),
            dose: item.dose || '',
            frequencia: item.frequencia || '',
            conduta: item.conduta || ''
        }));
}

/**
 * Monta o cabeçalho da FA a partir de uma APA.
 *
 * @param {object} apa           registro da tabela `apas`
 * @param {object} [opcoes]
 * @param {Date}   [opcoes.referencia] data usada para calcular a idade
 * @returns {object} cabeçalho sugerido, sempre com as chaves esperadas
 */
export function cabecalhoDaApa(apa, { referencia = new Date() } = {}) {
    const vazio = {
        origem: null, apaId: null, apaData: null,
        paciente: '', idade: null, peso: '', altura: '', imc: null,
        sexo: '', alergias: '', asa: '', comorbidades: [],
        viaAerea: { mallampati: '', aberturaBucal: '', distanciaTireomentoniana: '', mobilidadeCervical: '', proteseDentaria: '', previsaoDificil: '', observacao: '' },
        planoAnestesico: { tecnica: '', viaAerea: '', monitorizacao: '', acessoVenoso: '', destino: '', observacao: '' },
        jejum: '', procedimento: '', medicamentosEmUso: []
    };

    if (!apa) return vazio;

    return {
        ...vazio,
        origem: 'apa',
        apaId: apa.id || null,
        apaData: apa.dataRegistro || apa.dataAvaliacao || null,

        paciente: apa.nome || '',
        idade: idadeEmAnos(apa.dataNasc, referencia),
        peso: apa.peso || '',
        altura: apa.altura || '',
        imc: calcularImc(apa.peso, apa.altura),
        sexo: apa.sexo || '',

        alergias: resumirAlergias(apa),
        asa: apa.asa || '',
        comorbidades: Array.isArray(apa.comorbidadesList) ? apa.comorbidadesList : [],

        viaAerea: {
            mallampati: apa.mallampati || '',
            aberturaBucal: apa.va_abertura || '',
            distanciaTireomentoniana: apa.va_dtm || '',
            mobilidadeCervical: apa.va_cervical || '',
            proteseDentaria: apa.va_protese || '',
            previsaoDificil: apa.va_dificil || '',
            observacao: apa.va_obs || ''
        },

        planoAnestesico: {
            tecnica: apa.plan_tecnica || '',
            viaAerea: apa.plan_via_aerea || '',
            monitorizacao: apa.plan_monitor || '',
            acessoVenoso: apa.plan_acesso || '',
            destino: apa.plan_destino || '',
            observacao: apa.plan_obs || ''
        },

        jejum: apa.jejum_orientacao || '',
        procedimento: apa.procedimento || '',
        medicamentosEmUso: medicamentosEmUso(apa)
    };
}

/**
 * Escolhe a APA que deve alimentar a ficha: a mais recente do paciente que não
 * esteja na lixeira. Empate resolve pelo registro mais novo.
 */
export function apaMaisRecente(apas) {
    const candidatas = (apas || []).filter(apa => apa && !apa.deleted_at);
    if (candidatas.length === 0) return null;

    const instante = (apa) => {
        const data = new Date(apa.dataProcedimento || apa.dataRegistro || apa.createdAt || 0);
        return Number.isNaN(data.getTime()) ? 0 : data.getTime();
    };

    return [...candidatas].sort((a, b) => instante(b) - instante(a))[0];
}
