// Roteiros de abordagem da Prospecção. Aparecem na ficha do lead (com o nome
// da empresa já preenchido) e no botão "Roteiros" da tela de Prospecção.
//
// {empresa} vira o nome do lead. O que está entre [colchetes] é para você
// completar antes de mandar.
//
// `grupo` separa os roteiros por etapa da conversa, na ordem em que aparecem.
//
// `whats: true` mostra o botão "Mandar no WhatsApp", que abre a conversa com o
// texto pronto e conta como tentativa de contato.

export const ROTEIROS = [
    {
        id: 'teste-noturno',
        grupo: 'Clínicas · teste noturno',
        titulo: 'Teste noturno',
        quando: 'Depois das 20h ou no fim de semana, do seu número pessoal',
        dica: 'Mande como um paciente de verdade e anote no histórico a hora do envio e quando responderam. Esse resultado é a sua prova na abordagem.',
        texto: 'Oi, boa noite! Vocês fazem clareamento? Queria saber o valor e se tem horário essa semana.',
        whats: true,
        conta: false,
    },
    {
        id: 'abordagem-whats',
        grupo: 'Clínicas · teste noturno',
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
        grupo: 'Clínicas · teste noturno',
        titulo: 'Visita presencial',
        quando: 'Fim de manhã ou meio da tarde, nunca no horário de pico',
        dica: 'Peça para falar com o dono ou o gestor. Leve o celular com o agente demo aberto e deixe a pessoa conversar com ele ali mesmo.',
        texto: 'Oi, tudo bem? Sou o Paulo, tenho uma empresa aqui em Tatuí que coloca atendente de IA no WhatsApp de clínicas. Ontem à noite mandei uma mensagem pra vocês e [ninguém respondeu / demorou]. Posso te mostrar em 2 minutos como seria se fosse com o agente? Pode testar aqui no meu celular.',
        whats: false,
    },
    {
        id: 'piloto',
        grupo: 'Clínicas · teste noturno',
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
        grupo: 'Clínicas · teste noturno',
        titulo: 'Follow-up D+2',
        quando: '2 dias depois da abordagem',
        texto: 'Oi! Conseguiu testar o nosso agente? Se quiser, mando um vídeo de 1 minuto dele marcando uma consulta.',
        whats: true,
        conta: true,
    },
    {
        id: 'followup-5',
        grupo: 'Clínicas · teste noturno',
        titulo: 'Follow-up D+5',
        quando: '5 dias depois da abordagem',
        texto: 'Fiz o teste de novo ontem à noite e [resultado]. Ainda tenho [n] vagas de piloto, posso reservar uma pra {empresa}?',
        whats: true,
        conta: true,
    },
    {
        id: 'followup-10',
        grupo: 'Clínicas · teste noturno',
        titulo: 'Follow-up D+10',
        quando: '10 dias depois, o último',
        texto: 'Vou fechar as vagas de piloto essa semana. Se não for o momento, sem problema, me avisa que eu não insisto.',
        whats: true,
        conta: true,
    },

    // ── Abertura ──
    {
        id: 'quente-rede',
        grupo: 'Abertura',
        titulo: 'Lista quente · rede e conhecidos',
        quando: 'Primeiro contato com quem já te conhece (amigos, família, ex-colegas)',
        texto: `Oi [NOME], tudo bem?
Estou desenvolvendo sites e agentes de IA pra ajudar empresas a vender mais.
Você conhece algum comércio aqui de Tatuí que tá precisando de site, ou que tem um site velho e parado? Salão, clínica, loja, restaurante, oficina...
Se você indicar alguém e o projeto fechar, te dou uma comissão de [VALOR OU %] como agradecimento. E se for pra você mesmo, melhor ainda.`,
        whats: false,
    },
    {
        id: 'quente-indicacao',
        grupo: 'Abertura',
        titulo: 'Lista quente · parceria de indicação',
        quando: 'Propor parceria: você chega oferecendo ganho, não pedindo favor',
        texto: `Fala [NOME], tudo bem?
Estou desenvolvendo sites e agentes de IA pra ajudar empresas a vender mais e quero expandir minha carteira de clientes.
Topa uma parceria? Você me indica donos de negócio que precisam (sem site, ou com um feio e lento) e, pra cada projeto que fechar, você ganha uma comissão de [VALOR OU %].
Pode ser cliente seu, vizinho de comércio, ou você mesmo. O que acha? 🙏`,
        whats: false,
    },
    {
        id: 'fria-sem-site',
        grupo: 'Abertura',
        titulo: 'Lista fria · negócio sem site',
        quando: 'Prospecção fria, negócio que não tem site nenhum',
        texto: `Oi, tudo bem? Falo com o responsável pela {empresa}?
Sou o Paulo, da MedCode, aqui de Tatuí. Vi que vocês ainda não têm site e hoje o cliente pesquisa tudo no Google antes de decidir.
Montei uma prévia rápida de como ficaria a página de vocês. Posso te mostrar? Sem compromisso nenhum.`,
        whats: true,
        conta: true,
    },
    {
        id: 'fria-site-ruim',
        grupo: 'Abertura',
        titulo: 'Lista fria · site quebrado ou lento',
        quando: 'O site está lento, feio ou sem WhatsApp. Chegue com o diagnóstico na mão',
        texto: `Oi, tudo bem? É da {empresa}?
Sou o Paulo, da MedCode, trabalho com sites aqui de Tatuí. Entrei no site de vocês e reparei que ele tá [demorando pra abrir no celular / desatualizado / sem botão de WhatsApp].
Isso faz cliente desistir antes de chegar em vocês. Fiz uns ajustes de exemplo pra te mostrar como fica mais rápido e vendendo mais. Te mando aqui?`,
        whats: true,
        conta: true,
    },
    {
        id: 'fria-instagram',
        grupo: 'Abertura',
        titulo: 'Lista fria · direct do Instagram',
        quando: 'O negócio só tem Instagram, sem link organizado nem site',
        dica: 'Mande pelo direct do Instagram.',
        texto: `Oi! Acompanhei o perfil de vocês e curti demais o trabalho. 👏
Sou o Paulo, da MedCode, faço sites pra negócios como o de vocês. Reparei que no perfil não tem um link com tudo junto (serviços, fotos, botão de WhatsApp).
Montei uma ideia de página pra vocês. Posso te mandar aqui pra dar uma olhada?`,
        whats: false,
    },
    {
        id: 'amostra-link',
        grupo: 'Abertura',
        titulo: 'Enviar a amostra no ar',
        quando: 'A pessoa topou ver, ou você quer causar impacto já mandando o site pronto',
        dica: 'Suba uma amostra e mande o link do site funcionando de verdade.',
        texto: `Olha só o que eu preparei pra {empresa}. 👇
Já deixei uma amostra no ar pra você ver funcionando de verdade, no celular e no computador:
🔗 [LINK DA AMOSTRA]
É um exemplo com a cara de vocês pra você sentir como fica. Dá uma navegada e me diz: o que você mudaria?`,
        whats: true,
        conta: true,
    },
    {
        id: 'abertura-followup-1',
        grupo: 'Abertura',
        titulo: 'Follow-up 1 · sem resposta',
        quando: '1 ou 2 dias depois da abertura, sem retorno',
        texto: `Oi [NOME], passando só pra confirmar se você chegou a ver minha mensagem.
Deixo a prévia aqui de novo pra facilitar: [LINK]
Se fizer sentido a gente conversa 5 minutinhos. Se não for o momento, sem problema, é só me falar. 👍`,
        whats: true,
        conta: true,
    },
    {
        id: 'abertura-followup-2',
        grupo: 'Abertura',
        titulo: 'Follow-up 2 · último toque',
        quando: 'Terceiro contato sem resposta. Encerra sem queimar a ponte',
        texto: `[NOME], esse é meu último toque por aqui pra não te incomodar.
Deixo a porta aberta: quando quiser colocar a {empresa} pra aparecer no Google e vender pelo site, é só me chamar.
Guarda meu contato. Sucesso aí! 🙌`,
        whats: true,
        conta: true,
    },

    // ── Qualificação e diagnóstico ──
    {
        id: 'qualificacao',
        grupo: 'Qualificação e diagnóstico',
        titulo: 'Perguntas de qualificação',
        quando: 'A pessoa respondeu com interesse. Antes de propor, entenda',
        texto: `Que bom que você topou! Pra eu montar a melhor solução (e não te empurrar coisa que não precisa), me responde rapidinho:
1. Vocês já têm site ou é do zero?
2. O que o cliente mais procura de vocês? (serviço, produto, agendamento...)
3. Hoje as pessoas entram em contato por onde? (WhatsApp, Insta, telefone)
4. Tem alguma data ou temporada que você quer usar como prazo?
Com isso eu já te dou um caminho certeiro.`,
        whats: true,
    },
    {
        id: 'diagnostico',
        grupo: 'Qualificação e diagnóstico',
        titulo: 'Diagnóstico · mostrar o problema',
        quando: 'Depois de olhar o que o cliente tem hoje. Mostre o buraco antes de vender a ponte',
        texto: `Dei uma olhada com calma no que vocês têm hoje. 3 pontos que estão fazendo você perder cliente:
• No celular o site [abre lento / quebra o layout], e 8 de cada 10 pessoas acessam pelo celular.
• Não tem um botão de WhatsApp fixo, então quem quer comprar precisa caçar o contato.
• As fotos e informações estão desatualizadas, passa impressão de "tá fechado".
Tudo isso tem conserto. Te mostro como fica?`,
        whats: true,
    },
    {
        id: 'chamar-call',
        grupo: 'Qualificação e diagnóstico',
        titulo: 'Chamar pra call',
        quando: 'O papo esquentou e você quer sair do texto pra uma conversa',
        texto: `Pra te explicar direitinho e já te mostrar a prévia funcionando, que tal uma call rápida de 15 minutos?
Consigo hoje às [HORÁRIO] ou amanhã às [HORÁRIO]. Qual encaixa melhor pra você?`,
        whats: true,
    },

    // ── Proposta e preço ──
    {
        id: 'valor-antes-preco',
        grupo: 'Proposta e preço',
        titulo: 'Apresentar o valor antes do preço',
        quando: 'Logo antes de falar de dinheiro. Ancore no que a pessoa leva',
        texto: `Antes de te passar o valor, deixa eu te mostrar o que você leva:
✅ Site completo e rápido, feito pra vender (não é template genérico)
✅ Otimizado pro Google e pro celular
✅ Botão de WhatsApp e formulário de contato
✅ 60 dias de garantia: qualquer ajuste nesse período é por minha conta
Ou seja: a {empresa} aparecendo profissional pra quem pesquisa. Fechou a ideia?`,
        whats: true,
    },
    {
        id: 'tres-opcoes',
        grupo: 'Proposta e preço',
        titulo: 'Ancoragem · 3 opções',
        quando: 'Apresentar preço. Três faixas fazem a do meio parecer a escolha óbvia',
        texto: `Montei 3 formas da gente trabalhar, você escolhe a que cabe:
🥉 Essencial: site de 1 página (institucional + WhatsApp) por R$ [X]
🥈 Completo: site com várias seções, fotos e SEO por R$ [Y]  ⭐ mais escolhido
🥇 Premium: site + agente de WhatsApp + manutenção mensal por R$ [Z]
Qual faz mais sentido pra {empresa} agora?`,
        whats: true,
    },
    {
        id: 'resumo-proposta',
        grupo: 'Proposta e preço',
        titulo: 'Envio da proposta · resumo',
        quando: 'Fechar o combinado por escrito, pronto pro sim',
        texto: `[NOME], segue o resumo do que combinamos:
• Entrega: [o que será feito]
• Prazo: [X] dias úteis depois do sinal
• Investimento: R$ [VALOR] (30% pra começar, 70% na entrega)
• Garantia: 60 dias de ajustes inclusos
Se estiver tudo certo, eu já te mando o contrato e a gente começa essa semana. Pode ser?`,
        whats: true,
    },

    // ── Objeções ──
    {
        id: 'obj-caro',
        grupo: 'Objeções',
        titulo: '"Tá caro"',
        quando: 'A pessoa acha o valor alto. Traga pro custo x retorno',
        texto: `Entendo total. Mas pensa comigo: um cliente novo por mês já paga esse site em [X] meses, e ele trabalha pra você todo dia, 24h, sem salário.
Se o valor à vista pesou, a gente parcela. Prefere em [2x] ou [3x]?`,
        whats: true,
    },
    {
        id: 'obj-pensar',
        grupo: 'Objeções',
        titulo: '"Vou pensar"',
        quando: 'O clássico. Descubra a objeção real por trás',
        texto: `Fechado, decisão importante mesmo. 👍
Só pra eu entender: o que te segura é o valor, o prazo, ou é mais uma questão de momento?
Se me falar o ponto, talvez eu já resolva agora e você nem precise adiar.`,
        whats: true,
    },
    {
        id: 'obj-ja-tenho',
        grupo: 'Objeções',
        titulo: '"Já tenho site" ou "meu sobrinho faz"',
        quando: 'A pessoa diz que já está resolvido. Questione o resultado, não a pessoa',
        texto: `Perfeito, ter já é meio caminho. A pergunta é: ele tá te trazendo cliente?
Muita gente tem site, mas ele é lento, não aparece no Google e ninguém acha. Se for o caso, eu faço uma análise gratuita do seu e te falo na real se vale mexer. Topa?`,
        whats: true,
    },
    {
        id: 'obj-momento',
        grupo: 'Objeções',
        titulo: '"Agora não é o momento"',
        quando: 'Adiamento. Mantenha vivo sem pressionar',
        texto: `Sem problema, respeito. Só não deixa pra depois e perde a temporada.
Posso deixar sua prévia salva e te chamar de novo em [2 semanas]? Se aí fizer sentido, a gente retoma exatamente daqui.`,
        whats: true,
    },
    {
        id: 'obj-por-escrito',
        grupo: 'Objeções',
        titulo: '"Me manda tudo por escrito"',
        quando: 'Pedido de material. Aproveite pra facilitar a decisão',
        texto: `Claro, já te mando!
Prefere que eu mande o resumo por aqui mesmo no WhatsApp, ou em PDF pra você guardar e mostrar pra alguém?`,
        whats: true,
    },

    // ── Fechamento e contrato ──
    {
        id: 'pedir-sim',
        grupo: 'Fechamento e contrato',
        titulo: 'Fechamento · pedir o sim',
        quando: 'Tudo alinhado, hora de puxar a decisão',
        texto: `Então tá tudo alinhado: [entrega], em [prazo], por R$ [VALOR].
Pra garantir sua vaga na minha agenda dessa semana, eu te mando o contrato agora e você faz o sinal de 30%. Assim que cair, eu já começo.
Posso te mandar? 🙌`,
        whats: true,
    },
    {
        id: 'contrato-sinal',
        grupo: 'Fechamento e contrato',
        titulo: 'Envio do contrato + sinal de 30%',
        quando: 'A pessoa disse sim. Envie contrato e Pix juntos, sem fricção',
        texto: `[NOME], segue o contrato pra gente oficializar. 📄
É simples e protege os dois lados: escopo do que será feito, prazo e garantia.
Pra começar, o sinal é de 30%: R$ [VALOR DO SINAL].
Chave Pix: [SUA CHAVE PIX]
Assim que você assinar e o sinal cair, eu inicio o projeto hoje mesmo.`,
        whats: true,
    },
    {
        id: 'lembrete-sinal',
        grupo: 'Fechamento e contrato',
        titulo: 'Cobrança do sinal · lembrete gentil',
        quando: 'Mandou o contrato e o sinal não caiu. Lembre sem constranger',
        texto: `Oi [NOME]! Tudo certo por aí?
Deixei sua vaga reservada na agenda essa semana. Assim que o sinal de 30% cair, eu começo na hora.
Precisa de outra forma de pagamento além do Pix? Me fala que eu ajeito. 👍`,
        whats: true,
    },
    {
        id: 'confirmacao-inicio',
        grupo: 'Fechamento e contrato',
        titulo: 'Confirmação de início',
        quando: 'Sinal pago, contrato assinado. Confirme e alinhe o próximo passo',
        texto: `Recebido! Sinal confirmado e contrato assinado. 🎉
A partir de agora a {empresa} entra na produção. Te dou o primeiro retorno até [DATA] com [primeira entrega ou rascunho].
Qualquer coisa que você lembrar no caminho, é só me mandar aqui.`,
        whats: true,
    },

    // ── Pós-venda e recorrência ──
    {
        id: 'entrega-feedback',
        grupo: 'Pós-venda e recorrência',
        titulo: 'Entrega + pedido de feedback',
        quando: 'Projeto no ar. Entregue com orgulho e abra pro elogio',
        texto: `[NOME], tá no ar! 🚀 Seu site: [LINK]
Dá uma navegada com calma, testa no celular e no computador. Se quiser ajustar alguma coisa, me fala nesses 60 dias que tá tudo incluso.
E me conta: o que você achou? 😄`,
        whats: true,
    },
    {
        id: 'pedir-indicacao',
        grupo: 'Pós-venda e recorrência',
        titulo: 'Pedir indicação',
        quando: 'Logo depois de um elogio. É o melhor momento pra pedir',
        texto: `Que bom que você curtiu o resultado! 🙌
Posso te pedir uma força? Se você conhece mais 1 ou 2 donos de negócio que precisam de site, me indica?
Quem vem por indicação sua eu atendo com uma condição especial. Combinado?`,
        whats: true,
    },
    {
        id: 'oferecer-manutencao',
        grupo: 'Pós-venda e recorrência',
        titulo: 'Oferecer manutenção mensal',
        quando: 'Transformar entrega única em receita mensal',
        texto: `[NOME], seu site tá voando. Pra ele continuar rápido, seguro e atualizado (fotos novas, promoções, textos), tenho um plano de manutenção mensal de R$ [X].
Você não precisa se preocupar com nada técnico, deixa comigo. Quer que eu te explique como funciona?`,
        whats: true,
    },
    {
        id: 'reativar-cliente',
        grupo: 'Pós-venda e recorrência',
        titulo: 'Reativar cliente antigo',
        quando: 'Cliente parado há meses. Volte com uma novidade e uma condição',
        texto: `Oi [NOME], quanto tempo! Tudo bem com a {empresa}?
Passando pra saber como tá o site e se você quer dar uma repaginada ou colocar algo novo (agendamento online, loja, agente de WhatsApp).
Tenho uma condição boa esse mês pra clientes que já são de casa. Quer ver?`,
        whats: true,
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
