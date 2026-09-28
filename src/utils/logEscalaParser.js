// Lê o texto livre dos logs de escala e devolve, em campos separados, a DATA DO
// PLANTÃO afetado e o MÉDICO envolvido — na auditoria o que interessa não é só
// "quando mexeram", é "em que dia da escala mexeram e quem entrou/saiu".
//
// Precisa dar conta de três gerações de mensagem:
//   1ª (abr/2026): "Plantão salvo: 2026-04-w4-1-0-2 - Médico: FULANO"        (slotId cru)
//   2ª:            "Plantão Diurno (30/10) no Hospital X salvo - Médico: FULANO | Detalhes: …"
//   3ª (atual):    "Plantão Diurno (05/09/2026) no Hospital X salvo - Médico: FULANO (antes: BELTRANO)"
// e ainda vaga descoberta e a Escala Fixa, cuja data literal é "Padrão".

const RE_DATA = /\((\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\)/;
const RE_PADRAO = /\((Padrão)\)/i;
const RE_MEDICO = /M[ée]dico:\s*([^|(]+?)\s*(?:\(antes:|\||$)/i;
const RE_ANTERIOR = /\(antes:\s*([^)]+)\)/i;
const RE_DESCOBERTA = /VAGA DESCOBERTA/i;
// slotId da 1ª geração: AAAA-MM-wN-hospital-setor-diaDaSemana (ou FIXED-fw1-… na Escala Fixa)
const RE_SLOT_ID = /\b(\d{4})-(\d{2})-w(\d+)-\d+-\d+-(\d+)\b/;
const RE_SLOT_FIXO = /\bFIXED-fw\d+/i;

// Só mexe em log de escala; os demais (financeiro, APA…) ficam sem estes campos.
const ehLogDePlantao = (log) => {
    const acao = String(log?.action || '').toLowerCase();
    return acao.includes('plantao') || acao.includes('plantão');
};

// Reconstrói a data a partir do slotId, repetindo o calendário da Escala: a
// grade começa na segunda-feira da semana em que cai o dia 1º do mês.
const dataDoSlotId = (ano, mes, semana, diaIndex) => {
    const primeiro = new Date(ano, mes - 1, 1);
    const desloca = primeiro.getDay() === 0 ? 6 : primeiro.getDay() - 1;
    const d = new Date(ano, mes - 1, 1 - desloca + (semana - 1) * 7 + diaIndex);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Logs antigos gravaram só dia/mês. O ano vem do próprio log: normalmente é o
// mesmo, mas uma escala de janeiro montada em dezembro cai no ano seguinte
// (e vice-versa) — daí a correção quando a distância passa de 6 meses.
const completaAno = (ddmm, timestamp) => {
    const [dia, mes] = ddmm.split('/').map((n) => parseInt(n, 10));
    const base = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(base.getTime()) || !mes) return ddmm;
    let ano = base.getFullYear();
    const diferenca = mes - (base.getMonth() + 1);
    if (diferenca < -6) ano += 1;
    else if (diferenca > 6) ano -= 1;
    return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
};

export const extrairDadosDoPlantao = (log) => {
    const vazio = { dataPlantao: '', medico: '', medicoAnterior: '' };
    if (!ehLogDePlantao(log)) return vazio;
    const texto = String(log?.details || '');
    if (!texto) return vazio;

    let dataPlantao = '';
    const casaData = texto.match(RE_DATA);
    if (casaData) {
        dataPlantao = casaData[1].split('/').length === 3 ? casaData[1] : completaAno(casaData[1], log?.timestamp);
    } else if (RE_PADRAO.test(texto) || RE_SLOT_FIXO.test(texto)) {
        dataPlantao = 'Padrão (Escala Fixa)';
    } else {
        const slot = texto.match(RE_SLOT_ID);
        if (slot) dataPlantao = dataDoSlotId(+slot[1], +slot[2], +slot[3], +slot[4]);
    }

    let medico = RE_DESCOBERTA.test(texto) ? 'Vaga descoberta' : (texto.match(RE_MEDICO)?.[1] || '').trim();
    if (/^(undefined|null)$/i.test(medico)) medico = '';

    const medicoAnterior = (texto.match(RE_ANTERIOR)?.[1] || '').trim();

    return { dataPlantao, medico, medicoAnterior };
};

// Usada na hora de GRAVAR o log: monta a data completa do plantão a partir do
// slotId (AAAA-MM-…, que é o mês ativo da grade) e do dia/mês da célula. Os dias
// de transbordo entre dezembro e janeiro pertencem ao ano vizinho.
export const dataCompletaDoPlantao = (slotId, dataDDMM) => {
    const texto = String(dataDDMM || '');
    if (!/^\d{1,2}\/\d{1,2}$/.test(texto)) return texto; // "Padrão" e afins passam direto
    const prefixo = String(slotId || '').match(/^(\d{4})-(\d{2})/);
    if (!prefixo) return texto;
    let ano = parseInt(prefixo[1], 10);
    const mesAtivo = parseInt(prefixo[2], 10);
    const mes = parseInt(texto.split('/')[1], 10);
    if (mesAtivo === 12 && mes === 1) ano += 1;
    else if (mesAtivo === 1 && mes === 12) ano -= 1;
    return `${texto}/${ano}`;
};
