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
    'Desenvolvedor', 'Administrador', 'Operador', 'Visualizador', 'Médico',
    'Médico Coordenador', 'Enfermagem', 'Assistente', 'Centro Cirúrgico', 'Teste'
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
        id: 'atendimento',
        home: 'atendimento',
        label: 'Atendimento',
        desc: 'Recepção, pacientes e agenda',
        route: '/atendimento',
        icon: 'Building2',
        gradient: 'from-emerald-400 to-teal-500',
        accent: 'emerald',
        accessKey: 'Acessar Atendimento',
        permissions: [
            { id: 'Acessar Atendimento', label: 'Acessar o módulo', desc: 'Abre o bloco Atendimento e o painel de recepção' },
            { id: 'Acessar Recepção', label: 'Recepção: acessar painel' },
            { id: 'Visualizar Pacientes', label: 'Pacientes: visualizar lista' },
            { id: 'Criar Pacientes', label: 'Pacientes: criar/cadastrar' },
            { id: 'Editar Pacientes', label: 'Pacientes: editar cadastro' },
            { id: 'Excluir Pacientes', label: 'Pacientes: excluir' },
        ],
    },
    {
        id: 'mapa',
        home: 'mapa',
        label: 'Mapa Cirúrgico',
        desc: 'Fila e mapa das unidades',
        route: '/semana',
        icon: 'CalendarRange',
        gradient: 'from-blue-400 to-indigo-500',
        accent: 'blue',
        accessKey: 'Acessar Mapa Cirúrgico',
        permissions: [
            { id: 'Acessar Mapa Cirúrgico', label: 'Acessar o módulo', desc: 'Abre o bloco Mapa Cirúrgico' },
            { id: 'Visualizar Fila', label: 'Acessar a fila cirúrgica' },
            { id: 'Visualizar Mapa/Agenda', label: 'Acessar o mapa semanal' },
            { id: 'Criar Agendamentos', label: 'Inserir/agendar paciente' },
            { id: 'Editar Agendamentos', label: 'Editar/desmarcar/reagendar' },
            { id: 'Excluir Agendamentos', label: 'Excluir registro' },
            { id: 'Acao: Confirmar', label: 'Ação: confirmar paciente' },
            { id: 'Acao: Realizada', label: 'Ação: marcar realizada' },
            { id: 'Acao: Suspensa', label: 'Ação: marcar suspensa' },
            { id: 'Acao: Nao Internou', label: 'Ação: marcar não internou' },
            { id: 'Acao: Retrabalho', label: 'Ação: reagendar / resetar / desmarcar' },
            { id: 'Acao: Anotar', label: 'Ação: anotar observações' },
            { id: 'Acao: Editar Tudo', label: 'Ação: botão Editar Tudo' },
            { id: 'Acao: Imprimir', label: 'Ação: imprimir documentos do mapa' },
            { id: 'Acao: Anexos', label: 'Ação: visualizar/inserir anexos' },
            { id: 'Acao: Bloquear Agenda', label: 'Ação: bloquear/liberar agenda' },
        ],
    },
    {
        id: 'pep',
        home: 'pep',
        label: 'PEP',
        desc: 'Prontuário, AIH, APA e Ficha Anestésica',
        route: '/pep-hub',
        icon: 'Activity',
        gradient: 'from-indigo-400 to-purple-500',
        accent: 'indigo',
        // Chave antiga que já era o porteiro de fato das telas clínicas.
        accessKey: 'Visualizar Atendimentos',
        permissions: [
            { id: 'Visualizar Atendimentos', label: 'Acessar o módulo', desc: 'Abre o PEP, AIH, APA e Ficha Anestésica' },
            { id: 'Criar/Editar AIH', label: 'AIH: criar/editar' },
            { id: 'Criar/Editar APA', label: 'APA: criar/editar' },
            // A chave continua a mesma para não tirar de quem já tem; o que mudou é
            // que ela agora também manda na exclusão da Ficha Anestésica.
            { id: 'Excluir AIH/APA', label: 'AIH, APA e Ficha Anestésica: excluir', desc: 'Enviar o documento para a lixeira' },
            { id: 'Imprimir Documentos', label: 'Imprimir prontuários e documentos' },
            // Sem estas duas, cada tela mostra só a unidade escolhida na sessão.
            // Separadas de propósito: quem cuida da APA de várias unidades não é
            // necessariamente quem acompanha a anestesia delas.
            { id: 'Ver APAs de Todas as Unidades', label: 'APA: ver de todas as unidades', desc: 'Libera o botão que busca APAs fora da unidade escolhida' },
            { id: 'Ver Fichas de Todas as Unidades', label: 'Ficha Anestésica: ver de todas as unidades', desc: 'Libera o botão que busca fichas fora da unidade escolhida' },
            // Fica no PEP, e não em Configurações, de propósito: é conteúdo
            // clínico. Assim um médico cuida das regras sem receber a chave das
            // Configurações do sistema inteiro.
            { id: 'Gerenciar Regras APA/FA', label: 'APA e Ficha Anestésica: gerenciar regras e catálogos', desc: 'Regras de medicamentos, textos do exame físico, descrições do ato e linhas/fármacos da ficha — sem abrir o resto das Configurações' },
            { id: 'Criar/Editar FA', label: 'Ficha Anestésica: criar/editar' },
            { id: 'Finalizar FA', label: 'Ficha Anestésica: finalizar e assinar' },
            { id: 'Reabrir FA Finalizada', label: 'Ficha Anestésica: reabrir depois de assinada' },
            { id: 'Assumir FA de Outro', label: 'Ficha Anestésica: assumir caso sem indicação', desc: 'Continuar uma ficha em andamento de outro anestesista; exige justificativa e fica registrado' },
        ],
    },
    {
        id: 'financeiro',
        home: 'financeiro',
        label: 'Financeiro',
        desc: 'Repasses, extratos e relatórios',
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
        id: 'escala',
        home: 'escala',
        label: 'Escala Médica',
        desc: 'Plantões, folha de ponto e regras',
        route: '/escala',
        icon: 'CalendarClock',
        gradient: 'from-amber-400 to-orange-500',
        accent: 'amber',
        accessKey: 'Acessar Escala',
        permissions: [
            { id: 'Acessar Escala', label: 'Acessar o módulo', desc: 'Abre os plantões mensais' },
            { id: 'Visualizar Toda Escala', label: 'Ver a escala de todos (todos os hospitais)' },
            { id: 'Operacional Escala', label: 'Acessar financeiro / folha de ponto' },
            // A observação do plantão (o "Subtítulo / Especialidade") nasceu como
            // anotação interna de quem administra a escala: só Admin e Operacional
            // enxergavam na grade. Esta chave libera SÓ a leitura dela — dá para
            // marcar no cargo Médico inteiro ou conceder a uma pessoa só, sem abrir
            // junto o financeiro/folha de ponto.
            { id: 'Ver Observações Escala', label: 'Ver as observações do plantão', desc: 'Mostra o subtítulo/observação embaixo do nome na grade. Admin e Operacional já veem.' },
            { id: 'Admin Escala', label: 'Adm da escala: gerenciar meses e regras' },
            { id: 'Editar Verificados Escala', label: 'Editar/excluir plantões já verificados' },
            { id: 'Forçar Conflito Escala', label: 'Escalar médico em conflito de horário (exige justificativa)' },
        ],
    },
    {
        // A contraparte da Escala do lado de quem plantona: a folha que ele
        // assinou e o andamento do pagamento dela. É módulo próprio, e não uma
        // tela do Financeiro, exatamente para não haver caminho entre o
        // repasse do médico e o caixa da empresa — quem tem esta chave não
        // ganha nada do módulo Financeiro, e vice-versa.
        id: 'meusRepasses',
        home: 'meusRepasses',
        /*
         * Módulo PESSOAL: mostra os dados de quem está logado, e de mais
         * ninguém. Por isso o coringa 'Acesso Total (Admin)' NÃO abre este —
         * para o administrativo a tela só teria as folhas dele próprio, que não
         * existem, e o bloco ficaria na home de todo mundo sem servir para nada.
         * Quem entra aqui é quem assina folha: Médico e Médico Coordenador.
         */
        pessoal: true,
        label: 'Meus Repasses',
        desc: 'Folhas assinadas e pagamentos do médico',
        route: '/meus-repasses',
        icon: 'Wallet',
        gradient: 'from-emerald-400 to-green-500',
        accent: 'emerald',
        accessKey: 'Acessar Meus Repasses',
        permissions: [
            { id: 'Acessar Meus Repasses', label: 'Acessar o módulo', desc: 'Cada pessoa vê apenas as próprias folhas assinadas e os próprios pagamentos' },
        ],
    },
    {
        id: 'relatorios',
        home: 'relatorios',
        label: 'Relatórios',
        desc: 'Dashboard e relatórios gerenciais',
        route: '/dashboard',
        icon: 'LayoutDashboard',
        gradient: 'from-rose-400 to-pink-500',
        accent: 'rose',
        accessKey: 'Acessar Relatórios',
        permissions: [
            { id: 'Acessar Relatórios', label: 'Acessar o módulo', desc: 'Abre o dashboard gerencial' },
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
        // cuida do cadastro das pessoas não precisa da chave que abre unidades,
        // convênios, SIGTAP e o resto do sistema junto.
        id: 'usuarios',
        label: 'Usuários',
        desc: 'Cadastro de pessoas e permissões',
        route: '/usuarios',
        icon: 'Users',
        gradient: 'from-purple-400 to-fuchsia-500',
        accent: 'purple',
        accessKey: 'Acessar Usuarios',
        permissions: [
            { id: 'Acessar Usuarios', label: 'Acessar o módulo', desc: 'Cadastrar e editar usuários: dados, contato, unidades e situação' },
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
        id: 'regulacao',
        // Sem bloco na tela inicial: vive no menu lateral.
        label: 'Regulação',
        desc: 'Guias e autorizações',
        route: '/autorizacoes',
        icon: 'ShieldCheck',
        gradient: 'from-sky-400 to-cyan-500',
        accent: 'sky',
        accessKey: 'Acessar Autorizações',
        permissions: [
            { id: 'Acessar Autorizações', label: 'Acessar o painel de guias' },
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
