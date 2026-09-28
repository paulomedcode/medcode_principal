export const MUNICIPIOS = [
    'Registro', 'Barra do Turvo', 'Cajati', 'Cananeia', 'Eldorado',
    'Iguape', 'Ilha Comprida', 'Iporanga', 'Itariri', 'Jacupiranga',
    'Juquia', 'Miracatu', 'Pariquera-Açu', 'Pedro de Toledo', 'Sete Barras'
];

export const CIRURGIOES = [
    'Dr Alceu', 'Dr Matsuda', 'Dr Mikio', 'Dr Petrônio', 'Dra Katia',
    'Dr Evandro', 'Dr Diego', 'Dr Goda', 'Dra Ines', 'Dra Ananda',
    'Dr Zanini', 'Dr Guilherme', 'Outros'
];

export const CONVENIOS = [
    'SUS', 'IAMSP', 'Particular', 'Outros'
];

export const LOCAIS = {
    CC: 'C.C',
    ANEXO: 'Anexo'
};

export const STATUS = {
    AGUARDANDO: 'Aguardando',
    AGENDADO: 'Agendado',
    EXECUTADO: 'Executado',
    CANCELADO: 'Cancelado',
    MENSAGEM_ENVIADA: 'Mensagem Enviada',
    COM_PENDENCIA: 'Com Pendência',
    DESISTIU: 'Desistiu',
    PROBLEMA_TELEFONE: 'Problema com telefone',
    NAO_RESPONDE: 'Não responde',
    SUSPENSA: 'Suspensa (reagendar)'
};

export const STATUS_COLORS = {
    [STATUS.AGUARDANDO]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [STATUS.AGENDADO]: 'bg-blue-100 text-blue-800 border-blue-200',
    [STATUS.EXECUTADO]: 'bg-green-100 text-green-800 border-green-200',
    [STATUS.CANCELADO]: 'bg-red-100 text-red-800 border-red-200',
    [STATUS.MENSAGEM_ENVIADA]: 'bg-purple-100 text-purple-800 border-purple-200',
    [STATUS.COM_PENDENCIA]: 'bg-orange-100 text-orange-800 border-orange-200',
    [STATUS.DESISTIU]: 'bg-slate-100 text-slate-600 border-slate-200',
    [STATUS.PROBLEMA_TELEFONE]: 'bg-rose-100 text-rose-800 border-rose-200',
    [STATUS.NAO_RESPONDE]: 'bg-rose-100 text-rose-800 border-rose-200',
    [STATUS.SUSPENSA]: 'bg-red-50 text-red-600 border-red-100',
};
