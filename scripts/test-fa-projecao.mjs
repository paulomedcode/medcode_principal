/**
 * Testes do núcleo da Ficha Anestésica (eventos + projeção).
 * Rodar com:  node scripts/test-fa-projecao.mjs
 */
import {
    TIPOS, criarEvento, corrigirEvento, removerEvento,
    eventosVigentes, historicoDoEvento, paraMs
} from '../src/utils/fichaAnestesica/eventos.js';
import {
    criarRegua, colunaDoInstante, projetar, resumoFluidos
} from '../src/utils/fichaAnestesica/projecao.js';
import {
    idadeEmAnos, calcularImc, resumirAlergias, medicamentosEmUso,
    cabecalhoDaApa, apaMaisRecente
} from '../src/utils/fichaAnestesica/prefill.js';
import {
    resumoConsumo, resumoInfusoes, linhaDoTempo, gerarNarrativa,
    preencherModelo, aplicarModelos
} from '../src/utils/fichaAnestesica/narrativa.js';
import { rascunhoMaisNovo } from '../src/utils/fichaAnestesica/rascunho.js';

let passou = 0;
let falhou = 0;

function teste(nome, fn) {
    try {
        fn();
        passou++;
        console.log(`  ok   ${nome}`);
    } catch (erro) {
        falhou++;
        console.log(`  FALHA ${nome}\n        ${erro.message}`);
    }
}

function igual(recebido, esperado, contexto = '') {
    const a = JSON.stringify(recebido);
    const b = JSON.stringify(esperado);
    if (a !== b) throw new Error(`${contexto}esperado ${b}, recebido ${a}`);
}
function verdadeiro(v, c = '') { if (!v) throw new Error(`${c}esperado verdadeiro`); }
function falso(v, c = '') { if (v) throw new Error(`${c}esperado falso`); }
function lanca(fn, trecho) {
    try { fn(); } catch (erro) {
        if (trecho && !erro.message.includes(trecho)) throw new Error(`mensagem inesperada: ${erro.message}`);
        return;
    }
    throw new Error('esperava erro, não houve');
}

/** Data local fixa, para os testes não dependerem do relógio. */
const dia = (hora, minuto = 0) => new Date(2026, 7, 11, hora, minuto, 0, 0);

console.log('\ncriarEvento() — validação');
teste('cria evento normalizado', () => {
    const ev = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 72, unidade: 'bpm', t: dia(8, 0) });
    igual(ev.alvo, 'fc');
    igual(ev.valor, 72);
    verdadeiro(ev.id);
    verdadeiro(ev.registradoEm);
    falso(ev.removido);
});
teste('recusa tipo inválido', () => lanca(() => criarEvento({ tipo: 'xpto', alvo: 'fc', t: dia(8) }), 'Tipo de evento inválido'));
teste('recusa evento sem alvo', () => lanca(() => criarEvento({ tipo: TIPOS.MEDIDA, alvo: '', t: dia(8) }), 'sem alvo'));
teste('recusa horário inválido', () => lanca(() => criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', t: 'ontem' }), 'horário válido'));
teste('aceita valor zero (desligar infusão)', () => {
    const ev = criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 0, t: dia(9) });
    igual(ev.valor, 0);
});

console.log('\nparaMs()');
teste('aceita Date, ISO e epoch', () => {
    const d = dia(8, 30);
    igual(paraMs(d), d.getTime());
    igual(paraMs(d.toISOString()), d.getTime());
    igual(paraMs(d.getTime()), d.getTime());
});
teste('devolve null para lixo', () => { igual(paraMs('abc'), null); igual(paraMs(null), null); });

console.log('\ncorreção e remoção — nada é destruído');
teste('correção substitui na grade mas o original fica no histórico', () => {
    const original = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 72, t: dia(8) });
    const corrigido = corrigirEvento(original, { valor: 127 });
    const todos = [original, corrigido];

    igual(eventosVigentes(todos).map(e => e.valor), [127]);
    igual(todos.length, 2, 'o original continua guardado: ');
    igual(corrigido.substitui, original.id);
});
teste('cadeia de duas correções mantém só a última', () => {
    const e1 = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 70, t: dia(8) });
    const e2 = corrigirEvento(e1, { valor: 80 });
    const e3 = corrigirEvento(e2, { valor: 90 });
    igual(eventosVigentes([e1, e2, e3]).map(e => e.valor), [90]);
});
teste('histórico devolve a cadeia inteira em ordem', () => {
    const e1 = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 70, t: dia(8) });
    const e2 = corrigirEvento(e1, { valor: 80 });
    const e3 = corrigirEvento(e2, { valor: 90 });
    igual(historicoDoEvento([e1, e2, e3], e2.id).map(e => e.valor), [70, 80, 90]);
});
teste('evento removido sai da grade mas permanece na lista', () => {
    const ev = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 72, t: dia(8) });
    const removido = removerEvento(ev, 'user-1');
    igual(eventosVigentes([removido]), []);
    verdadeiro(removido.removidoEm);
    igual(removido.removidoPor, 'user-1');
});
teste('eventos saem ordenados por horário', () => {
    const tarde = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 2, t: dia(9) });
    const cedo = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 1, t: dia(8) });
    igual(eventosVigentes([tarde, cedo]).map(e => e.valor), [1, 2]);
});

console.log('\ncriarRegua() — duração livre');
teste('cirurgia de 4 h cabe inteira (o protótipo travava em 2 h)', () => {
    const regua = criarRegua({ inicio: dia(8, 0), fim: dia(12, 0), passoMin: 5 });
    igual(regua.colunas.length, 48);
    igual(regua.colunas[0].rotulo, '08:00');
    igual(regua.colunas[47].rotulo, '11:55');
});
teste('início fora do passo é arredondado para baixo', () => {
    const regua = criarRegua({ inicio: dia(8, 7), fim: dia(9, 0), passoMin: 5 });
    igual(regua.colunas[0].rotulo, '08:05');
});
teste('passo de 10 min reduz as colunas pela metade', () => {
    const regua = criarRegua({ inicio: dia(8, 0), fim: dia(12, 0), passoMin: 10 });
    igual(regua.colunas.length, 24);
});
teste('cirurgia em andamento usa agora + margem', () => {
    const regua = criarRegua({ inicio: dia(8, 0), agora: dia(8, 30), margemMin: 15, passoMin: 5 });
    igual(regua.colunas[regua.colunas.length - 1].rotulo, '08:40');
});
teste('atravessa a meia-noite sem perder a ordem', () => {
    const regua = criarRegua({ inicio: new Date(2026, 7, 11, 23, 40), fim: new Date(2026, 7, 12, 0, 20), passoMin: 10 });
    igual(regua.colunas.map(c => c.rotulo), ['23:40', '23:50', '00:00', '00:10']);
});
teste('trunca no teto de segurança', () => {
    const regua = criarRegua({ inicio: dia(0, 0), fim: new Date(2026, 7, 13, 0, 0), passoMin: 5, maxColunas: 288 });
    igual(regua.colunas.length, 288);
    verdadeiro(regua.truncada);
});
teste('sem início devolve régua vazia em vez de quebrar', () => {
    igual(criarRegua({ inicio: null }).colunas, []);
});

console.log('\ncolunaDoInstante()');
const reguaBase = criarRegua({ inicio: dia(8, 0), fim: dia(9, 0), passoMin: 5 });
teste('primeiro instante cai na coluna 0', () => igual(colunaDoInstante(reguaBase, dia(8, 0)), 0));
teste('instante no meio do intervalo cai na mesma coluna', () => igual(colunaDoInstante(reguaBase, dia(8, 3)), 0));
teste('limite superior do intervalo já é a próxima', () => igual(colunaDoInstante(reguaBase, dia(8, 5)), 1));
teste('antes da régua devolve -1', () => igual(colunaDoInstante(reguaBase, dia(7, 59)), -1));
teste('depois da régua devolve -1', () => igual(colunaDoInstante(reguaBase, dia(9, 30)), -1));

console.log('\nprojetar() — medidas');
teste('medida pontual ocupa só a sua coluna', () => {
    const eventos = [criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 72, unidade: 'bpm', t: dia(8, 10) })];
    const { linhas } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(linhas.fc.celulas[2].valor, 72);
    igual(linhas.fc.celulas[3], null);
});
teste('registro mais recente da coluna prevalece', () => {
    const eventos = [
        criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 70, t: dia(8, 1) }),
        criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 88, t: dia(8, 4) })
    ];
    const { linhas } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(linhas.fc.celulas[0].valor, 88);
});
teste('evento corrigido projeta o valor novo', () => {
    const original = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 72, t: dia(8, 10) });
    const corrigido = corrigirEvento(original, { valor: 130 });
    const { linhas } = projetar([original, corrigido], reguaBase, { propagarAte: dia(9, 0) });
    igual(linhas.fc.celulas[2].valor, 130);
});
teste('evento fora da régua é reportado, não descartado em silêncio', () => {
    const eventos = [criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 72, t: dia(6, 0) })];
    const { linhas, foraDaRegua } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(Object.keys(linhas), []);
    igual(foraDaRegua.length, 1);
});

console.log('\nprojetar() — infusão contínua');
teste('infusão se propaga até o próximo registro', () => {
    const eventos = [
        criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 2, unidade: '%', t: dia(8, 0) }),
        criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 3, unidade: '%', t: dia(8, 20) })
    ];
    const { linhas } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(linhas.sevoflurano.celulas.slice(0, 4).map(c => c.valor), [2, 2, 2, 2]);
    igual(linhas.sevoflurano.celulas[4].valor, 3);
    falso(linhas.sevoflurano.celulas[0].propagado, 'a coluna do registro não é propagada: ');
    verdadeiro(linhas.sevoflurano.celulas[1].propagado, 'as seguintes são: ');
});
teste('valor zero desliga a infusão', () => {
    const eventos = [
        criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 2, t: dia(8, 0) }),
        criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 0, t: dia(8, 10) })
    ];
    const { linhas } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(linhas.sevoflurano.celulas[1].valor, 2);
    igual(linhas.sevoflurano.celulas[2].valor, 0);
    igual(linhas.sevoflurano.celulas[3], null, 'não propaga depois de desligada: ');
});
teste('não preenche o futuro', () => {
    const eventos = [criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'o2', valor: 2, t: dia(8, 0) })];
    const { linhas } = projetar(eventos, reguaBase, { propagarAte: dia(8, 15) });
    verdadeiro(linhas.o2.celulas[3], 'até o limite preenche: ');
    igual(linhas.o2.celulas[4], null, 'depois do limite não: ');
});
teste('medida não se propaga', () => {
    const eventos = [criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'spo2', valor: 98, t: dia(8, 0) })];
    const { linhas } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(linhas.spo2.celulas[1], null);
});

console.log('\nprojetar() — fluidos, medicações e marcos');
teste('volumes no mesmo intervalo somam', () => {
    const eventos = [
        criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'cristaloide', valor: 500, unidade: 'ml', t: dia(8, 1) }),
        criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'cristaloide', valor: 250, unidade: 'ml', t: dia(8, 3) })
    ];
    const { linhas } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(linhas.cristaloide.celulas[0].valor, 750);
    igual(linhas.cristaloide.celulas[0].eventoIds.length, 2);
});
teste('medicação vai para a lista, não para a grade', () => {
    const eventos = [criarEvento({ tipo: TIPOS.MEDICACAO, alvo: 'fentanil', valor: 100, unidade: 'mcg', via: 'IV', t: dia(8, 12) })];
    const { linhas, medicacoes } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(Object.keys(linhas), []);
    igual(medicacoes.length, 1);
    igual(medicacoes[0].coluna, 2);
    igual(medicacoes[0].evento.via, 'IV');
});
teste('marco vai para a lista de marcos', () => {
    const eventos = [criarEvento({ tipo: TIPOS.MARCO, alvo: 'intubacao', t: dia(8, 6) })];
    const { marcos } = projetar(eventos, reguaBase, { propagarAte: dia(9, 0) });
    igual(marcos.length, 1);
    igual(marcos[0].coluna, 1);
});
teste('lista vazia não quebra', () => {
    const { linhas, medicacoes } = projetar([], reguaBase);
    igual(Object.keys(linhas), []);
    igual(medicacoes, []);
});
teste('régua vazia não quebra', () => {
    const eventos = [criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 70, t: dia(8) })];
    igual(projetar(eventos, criarRegua({ inicio: null })).linhas, {});
});

console.log('\nresumoFluidos() — balanço vem dos eventos, não da tela');
teste('calcula entradas, saídas e balanço', () => {
    const eventos = [
        criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'cristaloide', valor: 1000, t: dia(8, 0) }),
        criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'concentrado_hemacias', valor: 300, t: dia(8, 30) }),
        criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'sangue', valor: 200, t: dia(8, 40) }),
        criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'diurese', valor: 150, t: dia(8, 50) })
    ];
    const resumo = resumoFluidos(eventos);
    igual(resumo.totalEntradas, 1300);
    igual(resumo.totalSaidas, 350);
    igual(resumo.balanco, 950);
});
teste('evento corrigido não é contado duas vezes', () => {
    const original = criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'cristaloide', valor: 1000, t: dia(8, 0) });
    const corrigido = corrigirEvento(original, { valor: 500 });
    igual(resumoFluidos([original, corrigido]).totalEntradas, 500);
});
teste('evento removido sai do balanço', () => {
    const ev = criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'cristaloide', valor: 1000, t: dia(8, 0) });
    igual(resumoFluidos([removerEvento(ev)]).totalEntradas, 0);
});
teste('balanço ignora medidas e infusões', () => {
    const eventos = [
        criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 80, t: dia(8, 0) }),
        criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'o2', valor: 2, t: dia(8, 0) })
    ];
    igual(resumoFluidos(eventos).balanco, 0);
});

console.log('\nintegração — mudar a régua não altera nenhum dado');
teste('mesmos eventos em passos diferentes mantêm os totais', () => {
    const eventos = [
        criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 2, t: dia(8, 3) }),
        criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'cristaloide', valor: 500, t: dia(8, 7) }),
        criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 75, t: dia(8, 12) })
    ];
    const cinco = projetar(eventos, criarRegua({ inicio: dia(8, 0), fim: dia(9, 0), passoMin: 5 }), { propagarAte: dia(9, 0) });
    const dez = projetar(eventos, criarRegua({ inicio: dia(8, 0), fim: dia(9, 0), passoMin: 10 }), { propagarAte: dia(9, 0) });

    igual(Object.keys(cinco.linhas).sort(), Object.keys(dez.linhas).sort());
    igual(resumoFluidos(eventos).totalEntradas, 500);
    igual(cinco.linhas.fc.celulas[2].valor, 75);
    igual(dez.linhas.fc.celulas[1].valor, 75);
});

console.log('\naproveitamento da APA na ficha');
const APA = {
    id: 'apa-1', nome: 'Maria Souza', dataNasc: '1970-03-15', sexo: 'Feminino',
    peso: '68', altura: '160', asa: 'ASA II', mallampati: 'II',
    comorbidadesList: ['has', 'dm'],
    negaAlergia: false,
    alergias: JSON.stringify([{ substancia: 'Dipirona', reacao: 'Urticária' }]),
    negaMed: false,
    medicamentos: JSON.stringify([
        { nome: 'Losartana', dose: '50mg', frequencia: '1x/dia', conduta: 'Manter' },
        { nome: '', dose: '', frequencia: '', conduta: '' }
    ]),
    va_abertura: 'Adequada', va_dificil: 'Não',
    plan_tecnica: 'Geral, Bloqueio', plan_monitor: 'Básica', plan_destino: 'Não',
    jejum_orientacao: '8 horas', procedimento: 'Colecistectomia',
    dataRegistro: '2026-08-01T10:00:00Z'
};

teste('idade calculada na data de referência', () => {
    igual(idadeEmAnos('1970-03-15', new Date(2026, 7, 11)), 56);
    igual(idadeEmAnos('1970-12-31', new Date(2026, 7, 11)), 55, 'aniversário ainda não passou: ');
});
teste('idade inválida devolve null', () => {
    igual(idadeEmAnos(''), null);
    igual(idadeEmAnos('data-ruim'), null);
});
teste('IMC aceita altura em cm e em m', () => {
    igual(calcularImc('68', '160'), 26.6);
    igual(calcularImc('68', '1,60'), 26.6);
});
teste('IMC sem dados devolve null', () => {
    igual(calcularImc('', '160'), null);
    igual(calcularImc('68', '0'), null);
});
teste('alergias viram uma linha só', () => {
    igual(resumirAlergias(APA), 'Dipirona — Urticária');
});
teste('nega alergias é explícito na ficha', () => {
    igual(resumirAlergias({ negaAlergia: true }), 'Nega alergias');
});
teste('medicamentos em branco são descartados', () => {
    const meds = medicamentosEmUso(APA);
    igual(meds.length, 1);
    igual(meds[0].conduta, 'Manter');
});
teste('nega medicamentos devolve lista vazia', () => {
    igual(medicamentosEmUso({ negaMed: true, medicamentos: APA.medicamentos }), []);
});
teste('cabeçalho traz os dados da APA marcados como importados', () => {
    const cab = cabecalhoDaApa(APA, { referencia: new Date(2026, 7, 11) });
    igual(cab.origem, 'apa');
    igual(cab.apaId, 'apa-1');
    igual(cab.paciente, 'Maria Souza');
    igual(cab.idade, 56);
    igual(cab.imc, 26.6);
    igual(cab.asa, 'ASA II');
    igual(cab.viaAerea.mallampati, 'II');
    igual(cab.planoAnestesico.tecnica, 'Geral, Bloqueio');
    igual(cab.comorbidades, ['has', 'dm']);
});
teste('sem APA devolve cabeçalho vazio com as mesmas chaves', () => {
    const cab = cabecalhoDaApa(null);
    igual(cab.origem, null);
    igual(cab.paciente, '');
    igual(cab.medicamentosEmUso, []);
    verdadeiro('viaAerea' in cab && 'planoAnestesico' in cab);
});
teste('JSON corrompido na APA não derruba a ficha', () => {
    const cab = cabecalhoDaApa({ ...APA, alergias: '{quebrado', medicamentos: 'nada' });
    igual(cab.alergias, '');
    igual(cab.medicamentosEmUso, []);
});
teste('escolhe a APA mais recente do paciente', () => {
    const escolhida = apaMaisRecente([
        { id: 'velha', dataProcedimento: '2026-01-10' },
        { id: 'nova', dataProcedimento: '2026-08-01' },
        { id: 'lixeira', dataProcedimento: '2026-08-05', deleted_at: '2026-08-06' }
    ]);
    igual(escolhida.id, 'nova');
});
teste('paciente sem APA devolve null', () => {
    igual(apaMaisRecente([]), null);
    igual(apaMaisRecente(null), null);
});

console.log('\nresumos e narrativa');
const EVENTOS_FICHA = [
    criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 2, unidade: '%', t: dia(8, 0) }),
    criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 2, unidade: '%', t: dia(8, 10) }),
    criarEvento({ tipo: TIPOS.INFUSAO, alvo: 'sevoflurano', valor: 3, unidade: '%', t: dia(8, 20) }),
    criarEvento({ tipo: TIPOS.MEDICACAO, alvo: 'Fentanil', valor: 100, unidade: 'mcg', via: 'IV', t: dia(8, 5) }),
    criarEvento({ tipo: TIPOS.MEDICACAO, alvo: 'Fentanil', valor: 50, unidade: 'mcg', via: 'IV', t: dia(8, 40) }),
    criarEvento({ tipo: TIPOS.FLUIDO, alvo: 'cristaloide', valor: 500, unidade: 'ml', t: dia(8, 15) })
];

teste('consumo soma doses do mesmo fármaco', () => {
    const consumo = resumoConsumo(EVENTOS_FICHA);
    igual(consumo.length, 1);
    igual(consumo[0].total, 150);
    igual(consumo[0].doses, 2);
    igual(consumo[0].vias, ['IV']);
});
teste('consumo ignora medicação removida', () => {
    const removida = removerEvento(EVENTOS_FICHA[3]);
    const consumo = resumoConsumo([removida, EVENTOS_FICHA[4]]);
    igual(consumo[0].total, 50);
});
teste('infusão repetida não vira registro novo', () => {
    const infusoes = resumoInfusoes(EVENTOS_FICHA);
    igual(infusoes.length, 1);
    igual(infusoes[0].registros.map(r => r.valor), [2, 3], 'o 2 repetido às 08:10 não entra: ');
});
teste('linha do tempo sai em ordem e com rótulo traduzido', () => {
    const linhas = linhaDoTempo(EVENTOS_FICHA, { sevoflurano: 'Sevoflurano', cristaloide: 'Cristaloide' });
    igual(linhas[0].hora, '08:00');
    igual(linhas[0].rotulo, 'Sevoflurano');
    igual(linhas[linhas.length - 1].hora, '08:40');
});
teste('narrativa cita paciente, técnica, fármacos e balanço', () => {
    const texto = gerarNarrativa({
        cabecalho: { paciente: 'Maria', idade: 56, asa: 'ASA II', procedimento: 'Colecistectomia', planoAnestesico: { tecnica: 'Geral' } },
        ficha: { inicio_anestesia: dia(8, 0).toISOString(), fim_anestesia: dia(9, 30).toISOString() },
        eventos: EVENTOS_FICHA,
        balanco: { totalEntradas: 500, totalSaidas: 100, balanco: 400 },
        rotulos: { sevoflurano: 'Sevoflurano' }
    });
    verdadeiro(texto.includes('Maria'), 'nome: ');
    verdadeiro(texto.includes('Colecistectomia'), 'procedimento: ');
    verdadeiro(texto.includes('08:00'), 'início: ');
    verdadeiro(texto.includes('Sevoflurano'), 'infusão: ');
    verdadeiro(texto.includes('Fentanil 150 mcg em 2 doses'), 'consumo: ');
    verdadeiro(texto.includes('saldo +400 ml'), 'balanço: ');
});
teste('narrativa de ficha vazia não quebra', () => {
    const texto = gerarNarrativa({});
    verdadeiro(texto.length > 0);
    verdadeiro(texto.includes('procedimento cirúrgico'));
});

console.log('\ncorreção de célula não duplica no documento');
teste('corrigir valor deixa uma linha só na impressão', () => {
    const t = dia(8, 0);
    const original = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 70, unidade: 'bpm', t });
    const corrigido = corrigirEvento(original, { valor: 80 });

    const regua = criarRegua({ inicio: t, fim: dia(9, 0), passoMin: 5 });
    const { linhas } = projetar([original, corrigido], regua, { propagarAte: dia(9, 0) });

    igual(linhas.fc.celulas[0].valor, 80, 'grade mostra o corrigido: ');
    igual(linhaDoTempo([original, corrigido]).map(r => r.valor), ['80'], 'impressão traz só o vigente: ');
});
teste('sem substituir, as duas medidas apareceriam — o que não pode acontecer', () => {
    const t = dia(8, 0);
    const a = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 70, t });
    const b = criarEvento({ tipo: TIPOS.MEDIDA, alvo: 'fc', valor: 80, t });
    igual(linhaDoTempo([a, b]).length, 2, 'este é o comportamento que a tela evita ao usar substitui: ');
});

console.log('\nmodelos de descrição do ato anestésico');
const MODELOS = [
    {
        codigo: 'raqui', titulo: 'Raquianestesia', origem: 'tecnica', ativo: true,
        termos: ['raqui', 'raquianestesia'],
        texto: 'Punção subaracnóidea em L4–L5 com agulha Quincke 27G.'
    },
    {
        codigo: 'central', titulo: 'Acesso venoso central', origem: 'procedimento', chave: 'acessoCentral', ativo: true,
        termos: [],
        texto: 'Acesso central em veia {{veia}}, lado {{lado}}, sob {{tecnica}}, até {{profundidade}} cm.'
    },
    {
        codigo: 'inativo', titulo: 'Modelo desligado', origem: 'tecnica', ativo: false,
        termos: ['raqui'], texto: 'Não deve aparecer.'
    }
];

teste('placeholder preenchido com o dado da ficha', () => {
    igual(preencherModelo('Veia {{veia}}, lado {{lado}}.', { veia: 'jugular interna', lado: 'direito' }),
        'Veia jugular interna, lado direito.');
});
teste('campo não preenchido vira colchete, não some', () => {
    igual(preencherModelo('Veia {{veia}}, lado {{lado}}.', { veia: 'subclávia' }), 'Veia subclávia, lado [lado].');
});
teste('modelo de técnica dispara pelo plano anestésico', () => {
    const r = aplicarModelos({ modelos: MODELOS, cabecalho: { planoAnestesico: { tecnica: 'Raquianestesia' } }, extras: {} });
    igual(r.map(x => x.titulo), ['Raquianestesia']);
});
teste('técnica diferente não dispara o modelo', () => {
    const r = aplicarModelos({ modelos: MODELOS, cabecalho: { planoAnestesico: { tecnica: 'Geral' } }, extras: {} });
    igual(r, []);
});
teste('modelo de procedimento só entra se foi marcado', () => {
    const semMarcar = aplicarModelos({ modelos: MODELOS, cabecalho: {}, extras: { procedimentos: { acessoCentral: { realizado: false } } } });
    igual(semMarcar, []);

    const marcado = aplicarModelos({
        modelos: MODELOS, cabecalho: {},
        extras: { procedimentos: { acessoCentral: { realizado: true, veia: 'jugular interna', lado: 'direito', tecnica: 'ultrassonografia', profundidade: 14 } } }
    });
    igual(marcado.length, 1);
    verdadeiro(marcado[0].texto.includes('jugular interna'));
    verdadeiro(marcado[0].texto.includes('14 cm'));
});
teste('modelo inativo é ignorado', () => {
    const r = aplicarModelos({ modelos: MODELOS, cabecalho: { planoAnestesico: { tecnica: 'raqui' } }, extras: {} });
    falso(r.some(x => x.titulo === 'Modelo desligado'));
});
teste('narrativa usa os modelos quando existem', () => {
    const texto = gerarNarrativa({
        cabecalho: { paciente: 'João', planoAnestesico: { tecnica: 'Raquianestesia' } },
        ficha: {}, modelos: MODELOS, extras: {}
    });
    verdadeiro(texto.includes('Quincke 27G'), 'texto do modelo: ');
});
teste('sem modelos, a narrativa mantém a lista objetiva', () => {
    const texto = gerarNarrativa({
        cabecalho: {}, ficha: {}, modelos: [],
        extras: { procedimentos: { venoclise: { realizado: true, abocath: '20' } } }
    });
    verdadeiro(texto.includes('Venóclise'), 'lista: ');
});

/* ---------------------------------------------------------------- rascunho */

console.log('\nEspelho local do que está sendo digitado');
teste('rascunho mais novo que o banco é oferecido', () => {
    const pronto = rascunhoMaisNovo({ em: '2026-08-13T12:05:00Z' }, '2026-08-13T12:00:00Z');
    verdadeiro(pronto === true, 'deveria oferecer: ');
});
teste('rascunho mais velho é sobra de salvamento que deu certo', () => {
    const pronto = rascunhoMaisNovo({ em: '2026-08-13T11:59:00Z' }, '2026-08-13T12:00:00Z');
    verdadeiro(pronto === false, 'não deveria oferecer: ');
});
teste('diferença de segundos entre relógios não vira oferta', () => {
    const pronto = rascunhoMaisNovo({ em: '2026-08-13T12:00:00.500Z' }, '2026-08-13T12:00:00Z');
    verdadeiro(pronto === false, 'folga de relógio: ');
});
teste('ficha nunca salva: o que está no aparelho vale', () => {
    verdadeiro(rascunhoMaisNovo({ em: '2026-08-13T12:00:00Z' }, null) === true, 'sem updated_at: ');
});
teste('sem rascunho não há o que restaurar', () => {
    verdadeiro(rascunhoMaisNovo(null, '2026-08-13T12:00:00Z') === false, 'nulo: ');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
