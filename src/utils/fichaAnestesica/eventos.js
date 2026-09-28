/**
 * Modelo de eventos da Ficha Anestésica.
 *
 * A ficha não guarda "a célula da coluna 7": guarda o que aconteceu, com o
 * horário real em que aconteceu. A grade é uma projeção desses eventos sobre
 * uma régua de tempo (ver ./projecao.js).
 *
 * Isso é o que permite: duração livre de cirurgia, reabrir a ficha depois,
 * corrigir um valor errado sem apagar o original, atravessar a meia-noite e
 * ter auditoria de quem registrou o quê e quando.
 *
 * Funções puras: nada de React, Supabase ou DOM.
 */

/** Naturezas de registro. O tipo define como o valor se comporta no tempo. */
export const TIPOS = {
    /** Medida pontual: vale só no instante medido (FC, PA, SpO₂, temperatura). */
    MEDIDA: 'medida',
    /** Infusão contínua: o valor vale até ser trocado ou desligado (O₂, sevo, propofol). */
    INFUSAO: 'infusao',
    /** Volume administrado ou perdido num instante (soluções, sangue, diurese). */
    FLUIDO: 'fluido',
    /** Dose única de fármaco num instante. */
    MEDICACAO: 'medicacao',
    /** Marco do procedimento (indução, intubação, incisão, extubação). */
    MARCO: 'marco'
};

const TIPOS_VALIDOS = new Set(Object.values(TIPOS));

/** Converte Date | ISO | epoch para epoch em ms. Devolve null se inválido. */
export function paraMs(valor) {
    if (valor == null || valor === '') return null;
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.getTime();
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data.getTime();
}

function novoId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Cria um evento normalizado.
 *
 * @throws {Error} quando falta tipo, alvo ou horário — falhar aqui é melhor do
 *         que gravar um evento órfão que some da grade sem explicação.
 */
export function criarEvento({
    tipo, alvo, valor = null, unidade = '', t,
    autorId = null, observacao = '', via = '', substitui = null, id = null
}) {
    if (!TIPOS_VALIDOS.has(tipo)) throw new Error(`Tipo de evento inválido: ${tipo}`);
    if (!alvo || !String(alvo).trim()) throw new Error('Evento sem alvo (o que está sendo registrado).');

    const ms = paraMs(t);
    if (ms == null) throw new Error('Evento sem horário válido.');

    return {
        id: id || novoId(),
        tipo,
        alvo: String(alvo).trim(),
        valor,
        unidade: String(unidade || ''),
        t: new Date(ms).toISOString(),
        autorId,
        observacao: String(observacao || ''),
        via: String(via || ''),
        substitui,
        removido: false,
        registradoEm: new Date().toISOString()
    };
}

/**
 * Corrige um evento sem destruir o original.
 *
 * O registro anterior continua na ficha (rastro médico-legal); apenas deixa de
 * aparecer na grade, substituído pelo novo.
 */
export function corrigirEvento(original, alteracoes, autorId = null) {
    return criarEvento({
        tipo: original.tipo,
        alvo: alteracoes.alvo ?? original.alvo,
        valor: alteracoes.valor ?? original.valor,
        unidade: alteracoes.unidade ?? original.unidade,
        t: alteracoes.t ?? original.t,
        via: alteracoes.via ?? original.via,
        observacao: alteracoes.observacao ?? original.observacao,
        autorId: autorId ?? original.autorId,
        substitui: original.id
    });
}

/** Marca um evento como removido, também sem apagá-lo do histórico. */
export function removerEvento(evento, autorId = null) {
    return {
        ...evento,
        removido: true,
        removidoPor: autorId,
        removidoEm: new Date().toISOString()
    };
}

/**
 * Eventos que devem aparecer na grade: exclui os removidos e os que foram
 * substituídos por uma correção posterior.
 */
export function eventosVigentes(eventos) {
    const substituidos = new Set();
    (eventos || []).forEach(evento => {
        if (evento?.substitui && !evento.removido) substituidos.add(evento.substitui);
    });

    return (eventos || [])
        .filter(evento => evento && !evento.removido && !substituidos.has(evento.id))
        .sort((a, b) => paraMs(a.t) - paraMs(b.t));
}

/** Histórico completo de um evento e suas correções, do mais antigo ao mais novo. */
export function historicoDoEvento(eventos, eventoId) {
    const porId = new Map((eventos || []).map(evento => [evento.id, evento]));
    const cadeia = [];

    let atual = porId.get(eventoId);
    while (atual) {
        cadeia.unshift(atual);
        atual = atual.substitui ? porId.get(atual.substitui) : null;
    }

    let sucessor = (eventos || []).find(evento => evento.substitui === eventoId);
    while (sucessor) {
        cadeia.push(sucessor);
        const proximo = (eventos || []).find(evento => evento.substitui === sucessor.id);
        sucessor = proximo;
    }

    return cadeia;
}
