/**
 * Projeção dos eventos da Ficha Anestésica sobre a régua de tempo.
 *
 * A grade que o anestesista vê é sempre calculada a partir dos eventos —
 * nunca o contrário. Trocar o passo de 5 para 10 minutos, esticar a duração
 * ou reabrir a ficha no dia seguinte apenas recalcula esta projeção, sem
 * tocar em nenhum dado registrado.
 *
 * Funções puras: nada de React, Supabase ou DOM.
 */

import { TIPOS, paraMs, eventosVigentes } from './eventos.js';

const MIN_EM_MS = 60 * 1000;

/** Arredonda para o múltiplo do passo, para baixo ou para cima. */
function arredondar(ms, passoMin, modo) {
    const data = new Date(ms);
    data.setSeconds(0, 0);
    const resto = data.getMinutes() % passoMin;
    if (resto === 0) return data.getTime();
    if (modo === 'cima') data.setMinutes(data.getMinutes() + (passoMin - resto));
    else data.setMinutes(data.getMinutes() - resto);
    return data.getTime();
}

function rotuloHora(ms) {
    const data = new Date(ms);
    return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

/**
 * Monta a régua de tempo da ficha.
 *
 * Diferente do protótipo de referência — 24 colunas fixas de 5 min presas à
 * hora em que a página abriu — aqui a régua nasce do início real da anestesia
 * e vai até o fim (ou até agora, se a cirurgia ainda está acontecendo).
 *
 * @param {object} opcoes
 * @param {Date|string|number} opcoes.inicio  início da anestesia
 * @param {Date|string|number} [opcoes.fim]   fim da anestesia; ausente = em andamento
 * @param {number} [opcoes.passoMin=5]        minutos por coluna
 * @param {Date|string|number} [opcoes.agora] usado quando não há fim
 * @param {number} [opcoes.margemMin=15]      folga à direita, para registrar adiante
 * @param {number} [opcoes.maxColunas=288]    teto de segurança (24 h a 5 min)
 */
export function criarRegua({ inicio, fim = null, passoMin = 5, agora = null, margemMin = 15, maxColunas = 288 }) {
    const passo = Math.max(1, Number(passoMin) || 5);
    const inicioMs = paraMs(inicio);
    if (inicioMs == null) return { colunas: [], passoMin: passo, inicioMs: null, fimMs: null, truncada: false };

    const agoraMs = paraMs(agora) ?? Date.now();
    const fimBruto = paraMs(fim) ?? Math.max(agoraMs, inicioMs) + margemMin * MIN_EM_MS;

    const primeiro = arredondar(inicioMs, passo, 'baixo');
    const ultimo = Math.max(arredondar(fimBruto, passo, 'cima'), primeiro + passo * MIN_EM_MS);

    const total = Math.round((ultimo - primeiro) / (passo * MIN_EM_MS));
    const quantidade = Math.min(total, maxColunas);

    const colunas = [];
    for (let i = 0; i < quantidade; i++) {
        const colunaInicio = primeiro + i * passo * MIN_EM_MS;
        colunas.push({
            indice: i,
            inicioMs: colunaInicio,
            fimMs: colunaInicio + passo * MIN_EM_MS,
            rotulo: rotuloHora(colunaInicio)
        });
    }

    return {
        colunas,
        passoMin: passo,
        inicioMs: primeiro,
        fimMs: primeiro + quantidade * passo * MIN_EM_MS,
        truncada: total > maxColunas
    };
}

/** Índice da coluna que contém o instante; -1 se está fora da régua. */
export function colunaDoInstante(regua, t) {
    const ms = paraMs(t);
    if (ms == null || !regua?.colunas?.length) return -1;
    if (ms < regua.inicioMs || ms >= regua.fimMs) return -1;
    return Math.floor((ms - regua.inicioMs) / (regua.passoMin * MIN_EM_MS));
}

/** Um valor que "desliga" uma infusão contínua. */
function desligado(valor) {
    return valor == null || valor === '' || Number(valor) === 0;
}

/**
 * Projeta os eventos na régua.
 *
 * @param {Array}  eventos  eventos crus da ficha (removidos e corrigidos são tratados)
 * @param {object} regua    saída de criarRegua()
 * @param {object} [opcoes]
 * @param {Date|string|number} [opcoes.propagarAte] até onde uma infusão contínua se
 *        estende sem novo registro. Padrão: agora — não se preenche o futuro.
 *
 * @returns {{
 *   linhas: Object.<string, {tipo: string, unidade: string, celulas: Array}>,
 *   medicacoes: Array, marcos: Array, foraDaRegua: Array
 * }}
 */
export function projetar(eventos, regua, opcoes = {}) {
    const linhas = {};
    const medicacoes = [];
    const marcos = [];
    const foraDaRegua = [];

    const colunas = regua?.colunas || [];
    if (colunas.length === 0) return { linhas, medicacoes, marcos, foraDaRegua };

    const limiteMs = paraMs(opcoes.propagarAte) ?? Date.now();
    const vigentes = eventosVigentes(eventos);

    const garantirLinha = (evento) => {
        if (!linhas[evento.alvo]) {
            linhas[evento.alvo] = {
                tipo: evento.tipo,
                unidade: evento.unidade || '',
                celulas: new Array(colunas.length).fill(null)
            };
        }
        return linhas[evento.alvo];
    };

    // 1ª passada: posiciona cada evento na sua coluna.
    vigentes.forEach(evento => {
        const coluna = colunaDoInstante(regua, evento.t);
        if (coluna < 0) {
            foraDaRegua.push(evento);
            return;
        }

        if (evento.tipo === TIPOS.MEDICACAO) {
            medicacoes.push({ coluna, evento });
            return;
        }
        if (evento.tipo === TIPOS.MARCO) {
            marcos.push({ coluna, evento });
            return;
        }

        const linha = garantirLinha(evento);
        if (evento.unidade && !linha.unidade) linha.unidade = evento.unidade;

        if (evento.tipo === TIPOS.FLUIDO) {
            // No mesmo intervalo pode entrar mais de uma coisa — soro fisiológico
            // e Ringer, concentrado de hemácias e plaquetas. Cada um mantém o
            // próprio volume e os próprios registros (é o que permite corrigir um
            // sem apagar o outro), e a célula guarda também a soma, que é o que
            // vai para o balanço.
            const atual = linha.celulas[coluna];
            const volume = Number(evento.valor) || 0;
            const nome = String(evento.observacao || '').trim();

            const itens = [...(atual?.itens || [])];
            const indice = itens.findIndex(item => item.nome === nome);
            if (indice >= 0) {
                itens[indice] = {
                    ...itens[indice],
                    valor: itens[indice].valor + volume,
                    eventoIds: [...itens[indice].eventoIds, evento.id]
                };
            } else {
                itens.push({ nome, valor: volume, eventoIds: [evento.id] });
            }

            linha.celulas[coluna] = {
                valor: (atual?.valor || 0) + volume,
                unidade: evento.unidade || linha.unidade,
                itens,
                eventoIds: [...(atual?.eventoIds || []), evento.id],
                propagado: false
            };
            return;
        }

        // Medida e infusão: o registro mais recente da coluna prevalece.
        linha.celulas[coluna] = {
            valor: evento.valor,
            unidade: evento.unidade || linha.unidade,
            eventoIds: [evento.id],
            propagado: false
        };
    });

    // 2ª passada: infusão contínua vale até ser trocada, desligada ou até o
    // limite de propagação (por padrão, agora — o futuro fica em branco).
    Object.values(linhas).forEach(linha => {
        if (linha.tipo !== TIPOS.INFUSAO) return;

        let corrente = null;
        linha.celulas.forEach((celula, indice) => {
            const passouDoLimite = colunas[indice].inicioMs > limiteMs;

            if (celula) {
                corrente = desligado(celula.valor) ? null : celula;
                return;
            }
            if (corrente && !passouDoLimite) {
                linha.celulas[indice] = { ...corrente, propagado: true };
            }
        });
    });

    return { linhas, medicacoes, marcos, foraDaRegua };
}

/**
 * Balanço hidroeletrolítico a partir dos eventos.
 *
 * Nada de somar o que está escrito na tela: o total vem dos próprios
 * registros, então continua correto se a régua ou o layout mudarem.
 *
 * @param {Array} eventos
 * @param {Array<string>} [alvosDeSaida] alvos que contam como perda
 */
export function resumoFluidos(eventos, alvosDeSaida = ['sangue', 'diurese']) {
    const saidas = new Set(alvosDeSaida);
    const porAlvo = {};
    let totalEntradas = 0;
    let totalSaidas = 0;

    eventosVigentes(eventos)
        .filter(evento => evento.tipo === TIPOS.FLUIDO)
        .forEach(evento => {
            const volume = Number(evento.valor) || 0;
            porAlvo[evento.alvo] = (porAlvo[evento.alvo] || 0) + volume;
            if (saidas.has(evento.alvo)) totalSaidas += volume;
            else totalEntradas += volume;
        });

    return { porAlvo, totalEntradas, totalSaidas, balanco: totalEntradas - totalSaidas };
}
