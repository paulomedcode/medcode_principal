// Roteiros de abordagem da Prospecção. Aparecem na ficha do lead (com o nome
// da empresa já preenchido) e no botão "Roteiros" da tela de Prospecção.
//
// {empresa} vira o nome do lead. O que está entre [colchetes] é para você
// completar antes de mandar.
//
// `whats: true` mostra o botão "Mandar no WhatsApp", que abre a conversa com o
// texto pronto e conta como tentativa de contato.

export const ROTEIROS = [
    {
        id: 'teste-noturno',
        titulo: 'Teste noturno',
        quando: 'Depois das 20h ou no fim de semana, do seu número pessoal',
        dica: 'Mande como um paciente de verdade e anote no histórico a hora do envio e quando responderam. Esse resultado é a sua prova na abordagem.',
        texto: 'Oi, boa noite! Vocês fazem clareamento? Queria saber o valor e se tem horário essa semana.',
        whats: true,
        conta: false,
    },
    {
        id: 'abordagem-whats',
        titulo: 'Abordagem no dia seguinte',
        quando: 'Para quem demorou ou não respondeu o teste',
        texto: `Oi, tudo bem? Sou o Paulo, da MedCode, aqui de Tatuí.

Ontem às [hora] mandei uma mensagem pra {empresa} como se fosse paciente, perguntando de clareamento. A resposta [chegou só hoje às __ / não chegou].

Não é crítica: fora do horário ninguém consegue responder. Mas é exatamente aí que o paciente vai pro próximo da lista do Google.

A gente coloca um atendente de IA no WhatsApp da clínica que responde na hora, tira dúvida, passa valores e já agenda. Pra você ver como funciona, manda um "oi" pro nosso número que quem responde é o nosso agente.

Posso passar aí 15 minutos essa semana pra te mostrar?`,
        whats: true,
        conta: true,
    },
    {
        id: 'visita',
        titulo: 'Visita presencial',
        quando: 'Fim de manhã ou meio da tarde, nunca no horário de pico',
        dica: 'Peça para falar com o dono ou o gestor. Leve o celular com o agente demo aberto e deixe a pessoa conversar com ele ali mesmo.',
        texto: 'Oi, tudo bem? Sou o Paulo, tenho uma empresa aqui em Tatuí que coloca atendente de IA no WhatsApp de clínicas. Ontem à noite mandei uma mensagem pra vocês e [ninguém respondeu / demorou]. Posso te mostrar em 2 minutos como seria se fosse com o agente? Pode testar aqui no meu celular.',
        whats: false,
    },
    {
        id: 'piloto',
        titulo: 'Oferta de cliente-piloto',
        quando: 'Quando o interesse aparecer',
        dica: 'Você decide a condição (implantação sem custo ou com desconto forte). O que você pede em troca precisa estar claro desde o início.',
        texto: `Estou escolhendo só 3 clínicas de Tatuí pra serem as primeiras. Pra essas, a implantação sai em condição de fundador: [condição]. A plataforma de IA fica no nome da clínica, a partir de R$ 147 por mês.

Em troca eu peço duas coisas: um depoimento depois de 30 dias e autorização pra mostrar os números (quantas conversas o agente atendeu fora do horário, quantos agendamentos fez).

Se depois de 30 dias não fizer sentido, você desliga e pronto, sem fidelidade.`,
        whats: true,
        conta: true,
    },
    {
        id: 'followup-2',
        titulo: 'Follow-up D+2',
        quando: '2 dias depois da abordagem',
        texto: 'Oi! Conseguiu testar o nosso agente? Se quiser, mando um vídeo de 1 minuto dele marcando uma consulta.',
        whats: true,
        conta: true,
    },
    {
        id: 'followup-5',
        titulo: 'Follow-up D+5',
        quando: '5 dias depois da abordagem',
        texto: 'Fiz o teste de novo ontem à noite e [resultado]. Ainda tenho [n] vagas de piloto, posso reservar uma pra {empresa}?',
        whats: true,
        conta: true,
    },
    {
        id: 'followup-10',
        titulo: 'Follow-up D+10',
        quando: '10 dias depois, o último',
        texto: 'Vou fechar as vagas de piloto essa semana. Se não for o momento, sem problema, me avisa que eu não insisto.',
        whats: true,
        conta: true,
    },
];

export const OBJECOES = [
    { pergunta: 'Já tenho secretária', resposta: 'Ela continua. O agente cobre a noite, o fim de semana e o pico do dia, e a secretária foca em quem está na clínica.' },
    { pergunta: 'IA parece robô', resposta: 'Peça para a pessoa testar agora no seu número. Não discuta, mostre.' },
    { pergunta: 'Tá caro', resposta: 'Pergunte quanto vale um paciente de implante ou de harmonização. Um paciente recuperado por mês paga a plataforma do ano.' },
    { pergunta: 'Vou pensar', resposta: '"Claro. O que você precisaria ver pra decidir?" e marque o retorno na hora, com data.' },
    { pergunta: 'Meus pacientes não gostam de robô', resposta: 'O agente passa para a equipe quando o caso pede, e a clínica acompanha todas as conversas.' },
];

/** Troca {empresa} pelo nome do lead; sem lead, deixa o marcador à vista. */
export const preencherRoteiro = (texto, lead) => texto.replaceAll('{empresa}', lead?.nome || 'a clínica');
