// ============================================================================
// Catálogo de permissões — fonte única de verdade.
//
// Antes deste arquivo, a lista de permissões vivia dentro da tela de Usuários,
// os blocos da tela inicial tinham a lista deles, o menu lateral tinha outra e
// as rotas do App.jsx tinham uma terceira. Elas divergiram: existia permissão
// na matriz que o código nunca consultava ('Acessar Escala'), permissão que o
// código consultava e não existia na matriz ('Ver Escala de Todos') e módulo
// inteiro sem porteiro nenhum (Compromissos).
//
// A regra agora é: um módulo = um bloco da tela inicial = um grupo na matriz
// de permissões. Quem quiser saber se alguém entra em algum lugar pergunta
// aqui, e em nenhum outro lugar.
//
// Cada módulo tem uma CHAVE DE ACESSO (`accessKey`) — a permissão que abre a
// porta do módulo (o bloco na home, a rota, o item de menu). As demais são
// permissões finas de dentro dele. Marcar só a chave de acesso costuma
// significar "vê, mas não mexe".
// ============================================================================

// Perfis de acesso do sistema. 'Desenvolvedor' fica de fora da matriz porque
// tem bypass total em hasPermission().
export const ROLES = [
    'Desenvolvedor', 'Administrador', 'Sócio', 'Comercial', 'Gestor de Projetos',
    'Produção', 'Financeiro', 'Visualizador'
];

// Permissão coringa: quem tem ignora todas as outras.
export const ADMIN_KEY = 'Acesso Total (Admin)';

// Os módulos, na mesma ordem em que os blocos aparecem na tela inicial.
// - `home`: id do bloco correspondente em HomeHub (ausente = módulo sem bloco)
// - `route`: para onde o bloco leva (usado na home e para casar com as rotas)
// - `accessKey`: permissão que abre o módulo
// - `icon`: nome do ícone lucide (resolvido em quem desenha, para este arquivo
//    não virar dependência de UI)
// - `gradient`: mesmo gradiente do bloco na home, para a matriz "parecer" a home
// - `extra: false` numa permissão = não pode ser concedida individualmente
export const PERMISSION_MODULES = [
    {
        id: 'financeiro',
        home: 'financeiro',
        label: 'Financeiro',
        desc: 'Caixa, contas, conciliação e relatórios',
        route: '/finance/dashboard',
        icon: 'DollarSign',
        gradient: 'from-violet-400 to-fuchsia-500',
        accent: 'violet',
        accessKey: 'Acessar Financeiro',
        permissions: [
            { id: 'Acessar Financeiro', label: 'Acessar o módulo', desc: 'Vê tudo, sem poder alterar nada' },
            { id: 'Editar Financeiro', label: 'Editar: lançar, conciliar, dar baixa, excluir' },
        ],
    },
    {
        id: 'configuracoes',
        home: 'configuracoes',
        label: 'Configurações',
        desc: 'Ajustes do sistema e usuários',
        route: '/configuracoes',
        icon: 'Settings',
        gradient: 'from-slate-400 to-slate-500',
        accent: 'slate',
        accessKey: 'Acessar Configurações',
        permissions: [
            { id: 'Acessar Configurações', label: 'Acessar o módulo', desc: 'Abre os ajustes do sistema' },
        ],
    },
    {
        // Usuários saiu de dentro de Configurações e virou módulo próprio: quem
        // cuida do cadastro das pessoas não precisa da chave que abre o resto
        // das configurações do sistema junto.
        id: 'usuarios',
        label: 'Usuários',
        desc: 'Cadastro de pessoas e permissões',
        route: '/usuarios',
        icon: 'Users',
        gradient: 'from-purple-400 to-fuchsia-500',
        accent: 'purple',
        accessKey: 'Acessar Usuarios',
        permissions: [
            { id: 'Acessar Usuarios', label: 'Acessar o módulo', desc: 'Cadastrar e editar usuários: dados, contato e situação' },
            // Cadastro e permissão são coisas diferentes: dá para deixar alguém
            // cadastrar gente sem deixar essa pessoa distribuir acesso.
            { id: 'Gerenciar Permissões', label: 'Permissões: matriz, perfil e extras', desc: 'Abre a Matriz de Permissões e libera trocar o perfil do usuário e conceder permissões individuais' },
        ],
    },
    {
        id: 'compromissos',
        home: 'compromissos',
        label: 'Compromissos',
        desc: 'Páginas, tarefas e quadros',
        route: '/compromissos',
        icon: 'ClipboardList',
        gradient: 'from-fuchsia-400 to-pink-500',
        accent: 'fuchsia',
        accessKey: 'Acessar Compromissos',
        // Três objetos diferentes, três níveis de estrago:
        //  - PÁGINA: texto. Mexer nela afeta quem lê aquela página.
        //  - BANCO DE DADOS: a estrutura (colunas e visões) que todas as tarefas
        //    seguem. Excluir um apaga todas as linhas dele, para todo mundo.
        //  - QUADRO: o banco embutido dentro de uma página.
        // Escrever e editar TAREFA (linha) continua livre para quem acessa o
        // módulo — é o trabalho do dia a dia, não estrutura.
        permissions: [
            { id: 'Acessar Compromissos', label: 'Acessar o módulo', desc: 'Abre as páginas e tarefas; escrever tarefa é livre para quem entra' },
            { id: 'Criar Páginas Compromisso', label: 'Páginas: criar', desc: 'Nova página e subpágina' },
            { id: 'Editar Páginas Compromisso', label: 'Páginas: editar', desc: 'Título, ícone, conteúdo, visibilidade e reorganizar a árvore. Sem isso, a página abre só para leitura.' },
            { id: 'Excluir Páginas Compromisso', label: 'Páginas: excluir', desc: 'Mandar para a lixeira, restaurar e excluir definitivo' },
            { id: 'Criar Bancos Compromisso', label: 'Bancos de dados: criar', desc: 'Novo database (tabela/kanban/calendário)' },
            { id: 'Editar Bancos Compromisso', label: 'Bancos de dados: editar estrutura', desc: 'Colunas, visões, filtros e ordenação — muda para todos que usam o banco' },
            { id: 'Excluir Bancos Compromisso', label: 'Bancos de dados: excluir', desc: 'Apaga o banco e TODAS as linhas dele' },
            // Quadro = a tabela/calendário embutido numa página. Mexer nele muda a
            // página de todo mundo, então é permissão à parte de escrever tarefas.
            { id: 'Alterar Quadros Compromisso', label: 'Quadros: inserir / trocar a fonte' },
            { id: 'Excluir Quadros Compromisso', label: 'Quadros: excluir da página' },
        ],
    },
    {
        id: 'admin',
        label: 'Administração Geral',
        desc: 'Coringa: libera o sistema inteiro',
        icon: 'ShieldAlert',
        gradient: 'from-purple-500 to-purple-700',
        accent: 'purple',
        accessKey: ADMIN_KEY,
        permissions: [
            {
                id: ADMIN_KEY,
                label: 'Acesso total ao sistema',
                desc: 'Ignora todas as demais permissões. Conceda só a quem administra o sistema.',
                // Perigoso demais para sair como exceção individual num usuário.
                extra: false,
            },
        ],
    },
];

// Blocos da tela inicial → permissão que os abre. HomeHub e as rotas leem daqui.
export const HOME_BLOCK_PERMISSION = Object.fromEntries(
    PERMISSION_MODULES.filter(m => m.home).map(m => [m.home, m.accessKey])
);

/**
 * A permissão pertence a um módulo pessoal? Permissão pessoal não é concedida
 * por coringa: ou a pessoa tem a chave, ou não entra.
 */
export const ehPermissaoPessoal = (permId) => !!findModuleByPermission(permId)?.pessoal;

/** Módulo dono de uma permissão (ou undefined). */
export const findModuleByPermission = (permId) =>
    PERMISSION_MODULES.find(m => m.permissions.some(p => p.id === permId));

/** Todas as permissões que podem ser concedidas individualmente a um usuário. */
export const EXTRA_MODULES = PERMISSION_MODULES
    .map(m => ({ ...m, permissions: m.permissions.filter(p => p.extra !== false) }))
    .filter(m => m.permissions.length > 0);
