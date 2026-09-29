// Tipos de serviço que a MedCode vende — fonte única para CRM, funil e projetos.
//
// O `id` é o valor gravado no banco (check em crm_oportunidades.servico e
// projetos.servico). `categoria` é o nome da categoria de receita que o
// "Ganhar oportunidade" sugere para as parcelas. `fases` e `tarefas` montam a
// página de entregas que nasce com cada projeto (módulo Compromissos).

export const SERVICOS = [
    {
        id: 'SITE',
        label: 'Site',
        emoji: '🌐',
        cor: 'bg-sky-50 text-sky-700 border-sky-100',
        categoria: 'Sites',
        fases: ['Briefing', 'Conteúdo', 'Design', 'Desenvolvimento', 'Revisão', 'Publicação'],
        tarefas: [
            ['Reunião de briefing com o cliente', 'Briefing'],
            ['Receber logo, textos e fotos', 'Conteúdo'],
            ['Mapa do site e estrutura das páginas', 'Conteúdo'],
            ['Layout da página inicial', 'Design'],
            ['Aprovação do layout pelo cliente', 'Design'],
            ['Desenvolvimento das páginas', 'Desenvolvimento'],
            ['Formulários, WhatsApp e integrações', 'Desenvolvimento'],
            ['SEO básico e velocidade', 'Revisão'],
            ['Revisão com o cliente', 'Revisão'],
            ['Domínio, hospedagem e publicação', 'Publicação'],
        ],
    },
    {
        id: 'LANDING_PAGE',
        label: 'Landing Page',
        emoji: '🚀',
        cor: 'bg-teal-50 text-teal-700 border-teal-100',
        categoria: 'Landing Pages',
        fases: ['Briefing', 'Copy', 'Design', 'Desenvolvimento', 'Publicação'],
        tarefas: [
            ['Briefing: oferta, público e objetivo', 'Briefing'],
            ['Copy da página', 'Copy'],
            ['Layout', 'Design'],
            ['Aprovação do layout', 'Design'],
            ['Montagem da página', 'Desenvolvimento'],
            ['Pixel, tags e formulário de captura', 'Desenvolvimento'],
            ['Testes em celular e computador', 'Publicação'],
            ['Publicação e entrega', 'Publicação'],
        ],
    },
    {
        id: 'SISTEMA',
        label: 'Sistema sob medida',
        emoji: '🧩',
        cor: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        categoria: 'Sistemas sob medida',
        fases: ['Levantamento', 'Protótipo', 'Desenvolvimento', 'Testes', 'Implantação', 'Suporte'],
        tarefas: [
            ['Levantamento de requisitos', 'Levantamento'],
            ['Escopo fechado e cronograma', 'Levantamento'],
            ['Protótipo das telas', 'Protótipo'],
            ['Aprovação do protótipo', 'Protótipo'],
            ['Banco de dados e acesso', 'Desenvolvimento'],
            ['Módulos principais', 'Desenvolvimento'],
            ['Testes com o cliente', 'Testes'],
            ['Implantação e migração de dados', 'Implantação'],
            ['Treinamento da equipe do cliente', 'Implantação'],
            ['Acompanhamento pós-entrega', 'Suporte'],
        ],
    },
    {
        id: 'AGENTE_IA',
        label: 'Agente de IA',
        emoji: '🤖',
        cor: 'bg-violet-50 text-violet-700 border-violet-100',
        categoria: 'Agentes de IA',
        fases: ['Descoberta', 'Base de conhecimento', 'Prompt e fluxos', 'Integrações', 'Testes', 'Produção'],
        tarefas: [
            ['Mapear atendimento e objetivos do agente', 'Descoberta'],
            ['Coletar materiais, FAQ e documentos', 'Base de conhecimento'],
            ['Montar a base de conhecimento', 'Base de conhecimento'],
            ['Escrever prompt e personalidade', 'Prompt e fluxos'],
            ['Fluxos de conversa e transbordo humano', 'Prompt e fluxos'],
            ['Integrar WhatsApp / site / CRM', 'Integrações'],
            ['Testes com casos reais', 'Testes'],
            ['Ajustes com o cliente', 'Testes'],
            ['Ativar em produção e monitorar', 'Produção'],
        ],
    },
    {
        id: 'CONSULTORIA',
        label: 'Consultoria',
        emoji: '💡',
        cor: 'bg-amber-50 text-amber-700 border-amber-100',
        categoria: 'Consultoria',
        fases: ['Diagnóstico', 'Análise', 'Plano de ação', 'Acompanhamento'],
        tarefas: [
            ['Reunião de diagnóstico', 'Diagnóstico'],
            ['Levantamento de dados e processos', 'Diagnóstico'],
            ['Análise e oportunidades', 'Análise'],
            ['Relatório / apresentação', 'Plano de ação'],
            ['Plano de ação com prioridades', 'Plano de ação'],
            ['Reuniões de acompanhamento', 'Acompanhamento'],
        ],
    },
    {
        id: 'OUTRO',
        label: 'Outro',
        emoji: '📦',
        cor: 'bg-slate-50 text-slate-600 border-slate-200',
        categoria: null,
        fases: ['A fazer', 'Fazendo', 'Revisão', 'Entregue'],
        tarefas: [],
    },
];

export const servicoPorId = (id) => SERVICOS.find((s) => s.id === id) || SERVICOS[SERVICOS.length - 1];

export const STATUS_PROJETO = [
    { id: 'PLANEJAMENTO', label: 'Planejamento', cor: 'bg-slate-100 text-slate-600 border-slate-200' },
    { id: 'EM_ANDAMENTO', label: 'Em andamento', cor: 'bg-blue-50 text-blue-700 border-blue-100' },
    { id: 'EM_REVISAO', label: 'Em revisão', cor: 'bg-violet-50 text-violet-700 border-violet-100' },
    { id: 'PAUSADO', label: 'Pausado', cor: 'bg-amber-50 text-amber-700 border-amber-100' },
    { id: 'CONCLUIDO', label: 'Concluído', cor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { id: 'CANCELADO', label: 'Cancelado', cor: 'bg-rose-50 text-rose-700 border-rose-100' },
];

export const statusProjeto = (id) => STATUS_PROJETO.find((s) => s.id === id) || STATUS_PROJETO[0];

export const TIPOS_EMPRESA = [
    { id: 'LEAD', label: 'Lead', cor: 'bg-amber-50 text-amber-700 border-amber-100' },
    { id: 'CLIENTE', label: 'Cliente', cor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { id: 'FORNECEDOR', label: 'Fornecedor', cor: 'bg-slate-100 text-slate-600 border-slate-200' },
    { id: 'AMBOS', label: 'Cliente e fornecedor', cor: 'bg-sky-50 text-sky-700 border-sky-100' },
];

export const tipoEmpresa = (id) => TIPOS_EMPRESA.find((t) => t.id === id) || TIPOS_EMPRESA[0];

export const TIPOS_ATIVIDADE = [
    { id: 'NOTA', label: 'Nota', emoji: '📝' },
    { id: 'LIGACAO', label: 'Ligação', emoji: '📞' },
    { id: 'REUNIAO', label: 'Reunião', emoji: '🤝' },
    { id: 'EMAIL', label: 'E-mail', emoji: '✉️' },
    { id: 'WHATSAPP', label: 'WhatsApp', emoji: '💬' },
    { id: 'SISTEMA', label: 'Sistema', emoji: '⚙️' },
];

export const tipoAtividade = (id) => TIPOS_ATIVIDADE.find((t) => t.id === id) || TIPOS_ATIVIDADE[0];

// Formatação usada em todo o CRM.
export const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtData = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
