/**
 * Vocabulário da Ficha Anestésica: marcos de tempo, procedimentos, ventilador
 * e posições, além da conversão entre horário exibido e instante gravado.
 *
 * Fica fora dos componentes para poder ser usado também pela narrativa e pela
 * impressão, sem que nenhum deles dependa da tela.
 */

export const CAMPOS_HORARIO = [
    { campo: 'entradaSala', rotulo: 'Entrada na sala', acao: 'Agora' },
    { campo: 'inicioAnestesia', rotulo: 'Início anestesia', acao: 'Iniciar', destaque: true },
    { campo: 'inicioCirurgia', rotulo: 'Início cirurgia', acao: 'Iniciar' },
    { campo: 'fimCirurgia', rotulo: 'Fim cirurgia', acao: 'Finalizar', perigo: true },
    { campo: 'fimAnestesia', rotulo: 'Fim anestesia', acao: 'Finalizar', perigo: true }
];

/**
 * Técnicas anestésicas, como aparecem no cabeçalho da ficha de papel.
 *
 * São caixas de marcar e não campo de texto porque a ficha registra o que foi
 * feito, e mais de uma técnica no mesmo ato é rotina (geral + bloqueio).
 */
export const TECNICAS_ANESTESICAS = [
    'Geral balanceada (AGVI)',
    'Geral venosa total (AGVT)',
    'Sedação',
    'Raquianestesia',
    'Peridural',
    'Bloqueio periférico'
];

/**
 * Técnica em uma linha, para a narrativa e para casar com os modelos de
 * descrição. Aceita as duas formas: as marcadas no cabeçalho novo e o campo de
 * texto que vinha da APA nas fichas antigas.
 */
export function tecnicaDaFicha(cabecalho = {}) {
    const marcadas = Array.isArray(cabecalho.tecnicas) ? cabecalho.tecnicas.filter(Boolean) : [];
    if (marcadas.length) return marcadas.join(', ');
    return cabecalho.planoAnestesico?.tecnica || '';
}

/** ISO → "HH:MM" para o input; string vazia quando não há horário. */
export function paraHoraLocal(iso) {
    if (!iso) return '';
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return '';
    return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

/**
 * "HH:MM" → ISO, ancorado no dia de referência.
 *
 * Cirurgia que atravessa a meia-noite: um horário muito menor que a referência
 * é entendido como do dia seguinte, senão o fim cairia antes do início.
 */
export function paraIso(horaTexto, referenciaIso) {
    if (!horaTexto) return null;
    const [horas, minutos] = horaTexto.split(':').map(Number);
    if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return null;

    const referencia = referenciaIso ? new Date(referenciaIso) : new Date();
    const data = new Date(referencia);
    data.setHours(horas, minutos, 0, 0);

    if (referenciaIso && data.getTime() < referencia.getTime() - 12 * 3600 * 1000) {
        data.setDate(data.getDate() + 1);
    }
    return data.toISOString();
}

/** Cada procedimento traz os campos que a descrição precisa citar. */
export const PROCEDIMENTOS = [
    { chave: 'mantaTermica', rotulo: 'Manta térmica', campos: [] },
    {
        chave: 'acessoCentral', rotulo: 'Acesso venoso central',
        campos: [
            { nome: 'veia', rotulo: 'Veia', opcoes: ['jugular interna', 'subclávia', 'femoral'] },
            { nome: 'lado', rotulo: 'Lado', opcoes: ['direito', 'esquerdo'] },
            { nome: 'tecnica', rotulo: 'Técnica', opcoes: ['ultrassonografia', 'referências anatômicas'] },
            { nome: 'profundidade', rotulo: 'Profundidade (cm)', tipo: 'number' }
        ]
    },
    {
        chave: 'pai', rotulo: 'Pressão arterial invasiva (PAI)',
        campos: [
            { nome: 'arteria', rotulo: 'Artéria', opcoes: ['radial direita', 'radial esquerda', 'femoral', 'braquial'] },
            { nome: 'cateter', rotulo: 'Cateter', tipo: 'number' }
        ]
    },
    {
        chave: 'venoclise', rotulo: 'Venóclise',
        campos: [
            { nome: 'realizacao', rotulo: 'Realização', opcoes: ['previamente', 'em sala operatória'] },
            { nome: 'abocath', rotulo: 'Abocath nº', opcoes: ['14', '16', '18', '20', '22', '24'] },
            { nome: 'local', rotulo: 'Local', opcoes: ['MSD', 'MSE', 'MID', 'MIE'] }
        ]
    },
    {
        chave: 'bloqueioPeriferico', rotulo: 'Bloqueio periférico',
        campos: [
            {
                nome: 'bloqueio', rotulo: 'Bloqueio',
                opcoes: ['Interescalênico', 'Supraclavicular', 'Infraclavicular', 'Axilar', 'TAP',
                    'Quadrado lombar', 'Ilioinguinal', 'Bainha dos retos', 'Femoral', 'PENG',
                    'Ciático poplíteo', 'Canal dos adutores']
            },
            { nome: 'lado', rotulo: 'Lado', opcoes: ['direito', 'esquerdo', 'bilateral'] }
        ]
    },
    { chave: 'extubacao', rotulo: 'Extubação', campos: [] }
];

export const CAMPOS_VENTILADOR = [
    { nome: 'modo', rotulo: 'Modo', tipo: 'text', padrao: 'VCV' },
    { nome: 'vc', rotulo: 'VC (ml)', tipo: 'number' },
    { nome: 'fr', rotulo: 'FR (irpm)', tipo: 'number' },
    { nome: 'peep', rotulo: 'PEEP', tipo: 'number' },
    { nome: 'fio2', rotulo: 'FiO₂ (%)', tipo: 'number' },
    { nome: 'ie', rotulo: 'Relação I:E', tipo: 'text', padrao: '1:2' }
];

/**
 * Nome curto para caber na célula da grade — "Concentrado de hemácias" não cabe
 * em 58 px e cortado vira "Concentrad", que não diz nada. As siglas usadas em
 * sala vêm primeiro; o que não estiver na lista cai nas iniciais.
 *
 * O nome inteiro nunca some: fica no `title` da célula e na impressão.
 */
const SIGLAS = {
    'sf 0,9%': 'SF',
    'ringer lactato': 'RL',
    'ringer simples': 'RS',
    'soro glicosado 5%': 'SG 5%',
    'coloide': 'Coloide',
    'manitol': 'Manitol',
    'concentrado de hemácias': 'CH',
    'plasma fresco congelado': 'PFC',
    'plaquetas': 'Plaq',
    'crioprecipitado': 'Crio'
};

export function siglaDoItem(nome) {
    const texto = String(nome || '').trim();
    if (!texto) return '';

    const conhecida = SIGLAS[texto.toLowerCase()];
    if (conhecida) return conhecida;
    if (texto.length <= 8) return texto;

    const iniciais = texto
        .split(/\s+/)
        .filter(parte => parte.length > 2 || /\d/.test(parte))
        .map(parte => (/\d/.test(parte) ? parte : parte[0].toUpperCase()))
        .join('');

    return iniciais.length >= 2 ? iniciais : texto.slice(0, 8);
}

export const POSICOES = [
    'Decúbito dorsal', 'Decúbito ventral', 'Decúbito lateral direito', 'Decúbito lateral esquerdo',
    'Litotomia', 'Trendelenburg', 'Proclive', 'Cadeira de praia', 'Sentado'
];

