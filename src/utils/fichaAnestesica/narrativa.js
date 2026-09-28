/**
 * Resumos e narrativa da Ficha Anestésica, derivados dos eventos.
 *
 * A descrição do ato anestésico é gerada a partir do que foi efetivamente
 * registrado — e continua editável antes da assinatura. Texto automático é
 * rascunho, nunca laudo pronto: quem assina é o anestesista.
 *
 * Funções puras.
 */

import { TIPOS, eventosVigentes, paraMs } from './eventos.js';
import { PROCEDIMENTOS, CAMPOS_VENTILADOR, tecnicaDaFicha } from './vocabulario.js';
import { normalizar, contemTermo } from '../apaMedicationRules.js';

const hora = (t) => {
    const ms = paraMs(t);
    if (ms == null) return '';
    const data = new Date(ms);
    return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
};

const numeroBonito = (valor) => {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return String(valor ?? '');
    return Number.isInteger(numero) ? String(numero) : String(numero).replace('.', ',');
};

/**
 * Consumo por fármaco: quantas doses e o total administrado.
 * É a base para custo e para a conferência da farmácia.
 */
export function resumoConsumo(eventos) {
    const porFarmaco = new Map();

    eventosVigentes(eventos)
        .filter(evento => evento.tipo === TIPOS.MEDICACAO)
        .forEach(evento => {
            const chave = `${evento.alvo}|${evento.unidade}`;
            const atual = porFarmaco.get(chave) || { farmaco: evento.alvo, unidade: evento.unidade, total: 0, doses: 0, vias: new Set() };
            atual.total += Number(evento.valor) || 0;
            atual.doses += 1;
            if (evento.via) atual.vias.add(evento.via);
            porFarmaco.set(chave, atual);
        });

    return [...porFarmaco.values()]
        .map(item => ({ ...item, vias: [...item.vias] }))
        .sort((a, b) => a.farmaco.localeCompare(b.farmaco, 'pt-BR'));
}

/** Sequência de valores de cada infusão contínua, ignorando repetições. */
export function resumoInfusoes(eventos) {
    const porAlvo = new Map();

    eventosVigentes(eventos)
        .filter(evento => evento.tipo === TIPOS.INFUSAO)
        .forEach(evento => {
            const lista = porAlvo.get(evento.alvo) || { alvo: evento.alvo, unidade: evento.unidade, registros: [] };
            const ultimo = lista.registros[lista.registros.length - 1];
            if (!ultimo || String(ultimo.valor) !== String(evento.valor)) {
                lista.registros.push({ hora: hora(evento.t), valor: evento.valor });
            }
            porAlvo.set(evento.alvo, lista);
        });

    return [...porAlvo.values()];
}

/** Tudo o que foi registrado, em ordem cronológica — base da tabela impressa. */
export function linhaDoTempo(eventos, rotulos = {}) {
    return eventosVigentes(eventos).map(evento => ({
        hora: hora(evento.t),
        tipo: evento.tipo,
        rotulo: rotulos[evento.alvo] || evento.alvo,
        valor: numeroBonito(evento.valor),
        unidade: evento.unidade || '',
        via: evento.via || '',
        observacao: evento.observacao || ''
    }));
}

/**
 * Rascunho da descrição do ato anestésico.
 *
 * @param {object} dados
 * @param {object} dados.cabecalho  cabeçalho da ficha
 * @param {object} dados.ficha      registro da ficha (horários, anestesista)
 * @param {Array}  dados.eventos
 * @param {object} dados.balanco    saída de resumoFluidos()
 * @param {object} [dados.rotulos]  código do parâmetro → nome exibido
 */
/**
 * Frase de cada procedimento realizado, com os detalhes que o médico informou.
 * Só entra o que foi marcado — a ficha não descreve o que não aconteceu.
 */
export function descreverProcedimentos(extras = {}) {
    const marcados = extras.procedimentos || {};

    return PROCEDIMENTOS
        .filter(({ chave }) => marcados[chave]?.realizado)
        .map(({ chave, rotulo, campos }) => {
            const item = marcados[chave];
            const detalhes = campos
                .map(campo => (item[campo.nome] ? `${campo.rotulo.toLowerCase()}: ${item[campo.nome]}` : null))
                .filter(Boolean)
                .join(', ');
            const horario = hora(item.horario);
            return `${rotulo}${horario ? ` às ${horario}` : ''}${detalhes ? ` (${detalhes})` : ''}`;
        });
}

/**
 * Troca os {{campos}} do modelo pelos dados informados na ficha.
 *
 * O que o médico não preencheu vira [campo] em vez de sumir: no papel, um
 * colchete pede complemento; um texto sem a informação passa por completo.
 */
export function preencherModelo(texto, dados = {}) {
    return String(texto || '').replace(/\{\{(\w+)\}\}/g, (_, campo) => {
        const valor = dados[campo];
        return valor != null && String(valor).trim() !== '' ? String(valor) : `[${campo}]`;
    });
}

/**
 * Descrições que se aplicam a esta ficha: as da técnica planejada e as dos
 * procedimentos marcados no rodapé.
 */
export function aplicarModelos({ modelos = [], cabecalho = {}, extras = {} }) {
    // A técnica vem das caixas marcadas no cabeçalho; fichas antigas ainda
    // trazem o texto que veio do plano da APA.
    const tecnica = normalizar(tecnicaDaFicha(cabecalho));
    const procedimentos = extras.procedimentos || {};

    return (modelos || [])
        .filter(modelo => modelo && modelo.ativo !== false)
        .filter(modelo => {
            if (modelo.origem === 'procedimento') return !!procedimentos[modelo.chave]?.realizado;
            return tecnica && (modelo.termos || []).some(termo => contemTermo(tecnica, termo));
        })
        .map(modelo => {
            const item = modelo.origem === 'procedimento' ? (procedimentos[modelo.chave] || {}) : {};
            const horario = hora(item.horario);
            return {
                titulo: modelo.titulo,
                horario,
                texto: preencherModelo(modelo.texto, item)
            };
        });
}

export function gerarNarrativa({ cabecalho = {}, ficha = {}, extras = {}, eventos = [], balanco = null, rotulos = {}, modelos = [] }) {
    const paragrafos = [];

    const inicio = hora(ficha.inicio_anestesia);
    const fim = hora(ficha.fim_anestesia);
    const tecnica = tecnicaDaFicha(cabecalho);

    const identificacao = [
        cabecalho.paciente ? `Paciente ${cabecalho.paciente}` : 'Paciente',
        cabecalho.idade ? `${cabecalho.idade} anos` : null,
        cabecalho.asa ? `estado físico ${cabecalho.asa}` : null
    ].filter(Boolean).join(', ');

    paragrafos.push(
        `${identificacao}, submetido a ${cabecalho.procedimento || 'procedimento cirúrgico'}` +
        `${tecnica ? ` sob ${String(tecnica).toLowerCase()}` : ''}.` +
        `${inicio ? ` Início da anestesia às ${inicio}.` : ''}${fim ? ` Término às ${fim}.` : ''}`
    );

    if (cabecalho.alergias) {
        paragrafos.push(`Alergias: ${cabecalho.alergias}.`);
    }

    const viaAerea = cabecalho.viaAerea || {};
    if (viaAerea.previsaoDificil || viaAerea.mallampati) {
        paragrafos.push(
            `Via aérea: Mallampati ${viaAerea.mallampati || 'não informado'}` +
            `${viaAerea.previsaoDificil ? `, previsão de dificuldade: ${viaAerea.previsaoDificil}` : ''}.`
        );
    }

    const infusoes = resumoInfusoes(eventos);
    if (infusoes.length) {
        const texto = infusoes
            .map(item => {
                const nome = rotulos[item.alvo] || item.alvo;
                const sequencia = item.registros.map(r => `${r.hora} ${numeroBonito(r.valor)}${item.unidade ? ` ${item.unidade}` : ''}`).join('; ');
                return `${nome} (${sequencia})`;
            })
            .join('. ');
        paragrafos.push(`Agentes e infusões contínuas: ${texto}.`);
    }

    const consumo = resumoConsumo(eventos);
    if (consumo.length) {
        const texto = consumo
            .map(item => `${item.farmaco} ${numeroBonito(item.total)} ${item.unidade}${item.doses > 1 ? ` em ${item.doses} doses` : ''}${item.vias.length ? ` (${item.vias.join(', ')})` : ''}`)
            .join('; ');
        paragrafos.push(`Medicações administradas: ${texto}.`);
    }

    if (balanco && (balanco.totalEntradas || balanco.totalSaidas)) {
        paragrafos.push(
            `Balanço hidroeletrolítico: entradas ${balanco.totalEntradas} ml, saídas ${balanco.totalSaidas} ml, ` +
            `saldo ${balanco.balanco > 0 ? '+' : ''}${balanco.balanco} ml.`
        );
    }

    const horarios = extras.horarios || {};
    const tempos = [
        horarios.entradaSala ? `entrada em sala às ${hora(horarios.entradaSala)}` : null,
        horarios.inicioCirurgia ? `início da cirurgia às ${hora(horarios.inicioCirurgia)}` : null,
        horarios.fimCirurgia ? `término da cirurgia às ${hora(horarios.fimCirurgia)}` : null
    ].filter(Boolean);
    if (tempos.length) paragrafos.push(`Tempos do procedimento: ${tempos.join(', ')}.`);

    // Com modelos cadastrados, a descrição sai por extenso; sem eles, resta a
    // lista objetiva do que foi marcado.
    const descricoes = aplicarModelos({ modelos, cabecalho, extras });
    if (descricoes.length) {
        descricoes.forEach(descricao => {
            paragrafos.push(`${descricao.titulo}${descricao.horario ? ` — ${descricao.horario}` : ''}: ${descricao.texto}`);
        });
    } else {
        const procedimentos = descreverProcedimentos(extras);
        if (procedimentos.length) {
            paragrafos.push(`Procedimentos realizados: ${procedimentos.join('. ')}.`);
        }
    }

    const posicoes = extras.posicoes || [];
    if (posicoes.length) {
        paragrafos.push(
            `Posicionamento: ${posicoes.map(p => `${p.nome}${p.horario ? ` às ${hora(p.horario)}` : ''}`).join('; ')}.`
        );
    }

    const ventilador = extras.ventilador || {};
    const parametrosVent = CAMPOS_VENTILADOR
        .filter(campo => String(ventilador[campo.nome] ?? '').trim())
        .map(campo => `${campo.rotulo} ${ventilador[campo.nome]}`);
    if (parametrosVent.length) {
        paragrafos.push(`Ventilação mecânica com ${parametrosVent.join(', ')}.`);
    }

    const consumoInfusoes = extras.consumo || {};
    const frascos = Object.entries(consumoInfusoes)
        .filter(([, dados]) => Number(dados?.frascos) > 0)
        .map(([codigo, dados]) => {
            const nome = rotulos[codigo] || codigo;
            const diluicao = dados.diluicao ? ` diluído a ${dados.diluicao}` : '';
            return `${nome}: ${dados.frascos} frasco(s)/ampola(s)${diluicao}`;
        });
    if (frascos.length) paragrafos.push(`Consumo de infusões contínuas: ${frascos.join('; ')}.`);

    // Troca de anestesista no meio do caso é informação clínica, não detalhe
    // administrativo: quem assinou o quê e a partir de quando.
    const passagens = ficha.passagens || [];
    if (passagens.length) {
        const texto = passagens
            .map(item => `${hora(item.assumida_em)} de ${item.de_nome || '—'} para ${item.para_nome || '—'}${item.motivo ? ` (${item.motivo})` : ''}`)
            .join('; ');
        paragrafos.push(`Passagem do caso: ${texto}.`);
    }

    const destino = extras.destino || {};
    if (destino.local) {
        paragrafos.push(
            `Encaminhado à ${destino.local}${destino.ventilacao ? ` em ${destino.ventilacao}` : ''}.` +
            `${destino.observacao ? ` ${destino.observacao}` : ''}`
        );
    }

    paragrafos.push(
        destino.observacao
            ? 'Paciente mantido sob monitorização contínua durante todo o procedimento.'
            : 'Paciente mantido sob monitorização contínua durante todo o procedimento, sem intercorrências anestésicas.'
    );

    return paragrafos.join('\n\n');
}
