// Explicação de cada tipo de serviço na proposta, em linguagem de quem não é
// da área. Entra quando o item do orçamento não tem texto próprio (item
// "Livre" ou serviço do catálogo sem texto padrão) — o tipo é reconhecido
// pelo nome do item. Texto do item ou do catálogo sempre tem prioridade.

export const TEXTOS_SERVICOS = [
    {
        id: 'LANDING_PAGE',
        reconhece: /landing|lading|pagina de (vendas|captura|divulgacao)/,
        rotulo: 'Página de divulgação',
        descricao: 'Uma página na internet feita para apresentar o seu serviço e transformar visitante em contato. Quem chega por um anúncio, pelo Instagram ou pelo Google entende o que você oferece, por que escolher você, e fala com você no WhatsApp com um toque.',
        entregaveis: [
            'Página única, rápida e pensada para o celular',
            'Textos que explicam o seu serviço de forma simples',
            'Botão direto para o seu WhatsApp',
            'Fotos, depoimentos e perguntas frequentes',
            'Publicada no ar, com endereço próprio',
            'Pronta para receber anúncios do Google e do Instagram',
        ],
        resumo: 'Página de divulgação com textos, WhatsApp e publicação',
    },
    {
        id: 'AGENTE_IA',
        reconhece: /agente|\bia\b|inteligencia artificial|chatbot|robo|atendimento automatico/,
        rotulo: 'Atendimento 24h no WhatsApp',
        descricao: 'Funciona como uma secretária que atende o seu WhatsApp 24 horas por dia, inclusive à noite e no fim de semana. Antes de ir para o ar, nós ensinamos tudo sobre o seu negócio (serviços, preços, horários e o jeito de falar com o cliente) para ele responder como a sua equipe responderia, em segundos.',
        entregaveis: [
            'Responde dúvidas, preços e horários na hora',
            'Agenda e confirma horários',
            'Envia lembretes para reduzir faltas',
            'Passa a conversa para uma pessoa quando precisa',
            'Treinamento com as informações do seu negócio',
            'Ajustes durante o primeiro mês de uso',
        ],
        resumo: 'Implantação, treinamento e ajustes no primeiro mês',
    },
    {
        id: 'PRESENCA',
        reconhece: /presenca|google|instagram|maps|redes sociais|perfil/,
        rotulo: 'Ser encontrado',
        descricao: 'Deixamos o seu negócio fácil de achar por quem já está procurando o que você faz. Criamos ou atualizamos o seu perfil no Google (o que aparece no Google Maps e nas buscas) e organizamos o Instagram com links, site e o contato do atendimento.',
        entregaveis: [
            'Perfil no Google Maps criado ou atualizado',
            'Endereço, horários, telefone, fotos e categoria corretos',
            'Instagram com bio, links e contato organizados',
            'Google, Instagram, site e WhatsApp ligados entre si',
        ],
        resumo: 'Google Maps e Instagram configurados',
    },
    {
        id: 'SISTEMA',
        reconhece: /sistema|software|aplicativo|\bapp\b|plataforma|gestao/,
        rotulo: 'Gestão do seu jeito',
        descricao: 'Um sistema feito para a rotina do seu negócio, em vez de você se adaptar a um programa pronto. Reúne num só lugar o que hoje está espalhado em planilhas, cadernos e conversas, e funciona no computador e no celular.',
        entregaveis: [
            'Conversa sobre a sua rotina antes de começar',
            'Cadastros do que o seu negócio usa (clientes, serviços, agenda…)',
            'Controle financeiro e relatórios',
            'Acesso por usuário, cada um vendo o que precisa',
            'Funciona no computador e no celular',
            'Treinamento da equipe',
        ],
        resumo: 'Sistema sob medida, com treinamento da equipe',
    },
    {
        id: 'CONSULTORIA',
        reconhece: /consultoria|mentoria|diagnostico|planejamento/,
        rotulo: 'Direção para crescer',
        descricao: 'Encontros para entender onde o seu negócio está hoje, o que trava o crescimento e o que fazer primeiro no digital, com um plano claro, prático e sem termos técnicos.',
        entregaveis: [
            'Diagnóstico da sua presença digital hoje',
            'Plano de ação com as prioridades',
            'Reuniões de acompanhamento',
            'Indicação de ferramentas e fornecedores',
        ],
        resumo: 'Diagnóstico e plano de ação',
    },
    {
        id: 'SITE',
        reconhece: /site|website|pagina|dominio/,
        rotulo: 'Seu endereço na internet',
        descricao: 'O site do seu negócio, com o seu nome no endereço (por exemplo, seunegocio.com.br). Tem várias páginas (quem somos, serviços, contato) e passa a credibilidade de uma empresa estabelecida para quem pesquisa você no Google.',
        entregaveis: [
            'Páginas de início, sobre, serviços e contato',
            'Endereço com o nome do seu negócio (seunegocio.com.br)',
            'Funciona bem no celular, tablet e computador',
            'Contato por WhatsApp, formulário e mapa',
            'Preparado para aparecer nas buscas do Google',
            'Fácil de atualizar depois',
        ],
        resumo: 'Site com várias páginas, endereço próprio e Google',
    },
];

const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Texto padrão do tipo de serviço reconhecido pelo nome do item (ou null). */
export function textoPadraoDoServico(nome) {
    const n = normalizar(nome);
    return TEXTOS_SERVICOS.find((t) => t.reconhece.test(n)) || null;
}
