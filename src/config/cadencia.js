// Cadência de acompanhamento da Prospecção (colunas cadencia_inicio e
// cadencia_etapa, supabase/migrations/20261017120000_prospeccao_cadencia.sql).
//
// Depois da abordagem, cada lead recebe até três toques, contados a partir do
// dia em que a abordagem foi enviada. O toque da vez aparece em "Meu dia" e na
// ficha do lead com o texto pronto para revisar e mandar no WhatsApp.
//
// {empresa} vira o nome do lead. O índice no array é a etapa em que o lead
// precisa estar para receber aquele toque (cadencia_etapa = 0 recebe o dia 2).

export const TOQUES = [
    {
        dias: 2,
        titulo: 'Primeiro toque',
        aviso: '2 dias sem resposta',
        texto: 'Oi! Tudo bem? Passando pra saber se você conseguiu dar uma olhada no que te mandei. Qual parte faria mais sentido pra {empresa} hoje?',
    },
    {
        dias: 5,
        titulo: 'Segundo toque',
        aviso: '5 dias sem resposta',
        texto: 'Oi! Tive uma ideia: posso montar um teste do agente com as informações da {empresa}, pra você ver funcionando do jeito que os seus clientes conversariam. Sem compromisso. Topa?',
    },
    {
        dias: 10,
        titulo: 'Agradecer e encerrar',
        aviso: '10 dias sem resposta',
        texto: 'Oi! Não quero ficar te enchendo de mensagem 😊 Obrigado pela atenção! Se um dia fizer sentido melhorar o atendimento no WhatsApp da {empresa}, é só me chamar.',
        encerra: true,
    },
];

const iso = (dt) => {
    const p = (x) => String(x).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};
export const hojeISO = () => iso(new Date());
export const somarDias = (dataISO, n) => {
    const [y, m, d] = dataISO.split('-').map(Number);
    return iso(new Date(y, m - 1, d + n));
};
/** Dias inteiros entre duas datas AAAA-MM-DD. */
export const diasEntre = (de, ate) => {
    const [a, b] = [de, ate].map((s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); });
    return Math.round((b - a) / 86400000);
};

/** O toque que o lead está esperando (ou null se não está em cadência). */
export const toqueDaVez = (lead) => (lead?.cadencia_etapa == null ? null : TOQUES[lead.cadencia_etapa] || null);

/** Dia em que o toque `etapa` vence, nunca antes de amanhã quando é para remarcar. */
export const diaDoToque = (inicio, etapa, { aPartirDeAmanha = false } = {}) => {
    const dia = somarDias(inicio, TOQUES[etapa].dias);
    const amanha = somarDias(hojeISO(), 1);
    return aPartirDeAmanha && dia < amanha ? amanha : dia;
};

export const textoDoToque = (toque, lead) => toque.texto.replaceAll('{empresa}', lead?.nome || 'a sua empresa');
