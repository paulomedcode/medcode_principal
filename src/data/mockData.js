import { STATUS, LOCAIS, CIRURGIOES, MUNICIPIOS, CONVENIOS } from './constants';

const today = new Date();
const formatDate = (date) => date.toISOString().split('T')[0];

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

export const mockSurgeries = [
    {
        id: '1',
        nomePaciente: 'João Silva',
        dataNascimento: '1980-05-15',
        idade: 43,
        telefone: '(11) 99999-1234',
        procedimento: 'Colecistectomia Videolaparoscópica',
        cirurgiao: 'Dr Goda',
        status: STATUS.AGUARDANDO,
        dataAtendimento: '2023-10-01',
        municipio: 'Registro',
        observacoes: 'Paciente diabético. Aguarda liberação cardio.',
        convenio: 'SUS',
        local: '',
        dataAgendado: '',
        createdAt: '2023-10-25',
    },
    {
        id: '2',
        nomePaciente: 'Maria Oliveira',
        dataNascimento: '1995-12-10',
        idade: 28,
        telefone: '(13) 98888-5678',
        procedimento: 'Hernioplastia Inguinal',
        cirurgiao: 'Dr Evandro',
        status: STATUS.AGENDADO,
        dataAgendado: formatDate(today), // Hoje
        horario: '08:00',
        local: LOCAIS.CC,
        municipio: 'Cajati',
        convenio: 'SUS',
        createdAt: '2023-10-26'
    },
    {
        id: '3',
        nomePaciente: 'Carlos Souza',
        dataNascimento: '2015-03-20',
        idade: 8,
        telefone: '(13) 97777-1111',
        procedimento: 'Amigdalectomia',
        cirurgiao: 'Dra Katia',
        status: STATUS.AGENDADO,
        dataAgendado: formatDate(today), // Hoje
        horario: '14:30',
        local: LOCAIS.ANEXO,
        municipio: 'Iguape',
        convenio: 'Particular',
        createdAt: '2023-10-15'
    },
    {
        id: '4',
        nomePaciente: 'Ana Pereira',
        dataNascimento: '1990-07-07',
        idade: 33,
        telefone: '(11) 91234-5678',
        procedimento: 'Cesariana',
        cirurgiao: 'Dra Ananda',
        status: STATUS.EXECUTADO,
        dataAgendado: formatDate(addDays(today, -1)), // Ontem
        horario: '10:00',
        local: LOCAIS.CC,
        municipio: 'Registro',
        convenio: 'SUS',
        createdAt: '2023-10-27'
    },
    {
        id: '5',
        nomePaciente: 'Pedro Alves',
        dataNascimento: '1960-11-30',
        idade: 63,
        telefone: '(13) 99876-5432',
        procedimento: 'Artroplastia de Quadril',
        cirurgiao: 'Dr Petrônio',
        status: STATUS.DESISTIU,
        municipio: 'Miracatu',
        convenio: 'IAMSP',
        createdAt: '2023-10-10',
        observacoes: 'Desistência do paciente via telefone.'
    },
    {
        id: '6',
        nomePaciente: 'Julia Lima',
        dataNascimento: '1988-02-14',
        idade: 35,
        telefone: '(13) 95555-4444',
        procedimento: 'Laqueadura',
        cirurgiao: 'Dra Ananda',
        status: STATUS.AGENDADO,
        dataAgendado: formatDate(addDays(today, 1)), // Amanhã
        horario: '09:00',
        local: LOCAIS.CC,
        municipio: 'Sete Barras',
        convenio: 'SUS',
        createdAt: '2023-11-01'
    },
    {
        id: '7',
        nomePaciente: 'Roberta Santos',
        dataNascimento: '1975-09-22',
        idade: 48,
        telefone: '(13) 93333-2222',
        procedimento: 'Histerectomia',
        cirurgiao: 'Dr Diego',
        status: STATUS.AGENDADO,
        dataAgendado: formatDate(today),
        horario: '13:00',
        local: LOCAIS.CC, // Tarde CC
        municipio: 'Registro',
        convenio: 'SUS',
        createdAt: '2023-11-02'
    },
    {
        id: '8',
        nomePaciente: 'Marcos Vinicius',
        dataNascimento: '2000-01-01',
        idade: 23,
        telefone: '(13) 91111-0000',
        procedimento: 'Postectomia',
        cirurgiao: 'Dr Guilherme',
        status: STATUS.AGENDADO,
        dataAgendado: formatDate(today),
        horario: '07:30',
        local: LOCAIS.ANEXO, // Manhã Anexo
        municipio: 'Cajati',
        convenio: 'Outros', // Unimed -> Outros
        createdAt: '2023-11-03'
    },
    {
        id: '9',
        nomePaciente: 'Fernanda Costa',
        dataNascimento: '1985-05-05',
        idade: 38,
        telefone: '(13) 99999-8888',
        procedimento: 'Colecistectomia',
        cirurgiao: 'Dr Alceu',
        status: STATUS.MENSAGEM_ENVIADA,
        dataAtendimento: '2023-11-01',
        municipio: 'Eldorado',
        convenio: 'SUS',
        createdAt: '2023-11-05',
        observacoes: 'Aguardando retorno do paciente via WhatsApp.'
    },
    {
        id: '10',
        nomePaciente: 'Ricardo Nunes',
        dataNascimento: '1970-10-10',
        idade: 53,
        telefone: '(13) 97777-6666',
        procedimento: 'Herniorrafia Umbilical',
        cirurgiao: 'Dr Goda',
        status: STATUS.COM_PENDENCIA,
        dataAtendimento: '2023-11-02',
        municipio: 'Jacupiranga',
        convenio: 'SUS',
        createdAt: '2023-11-06',
        observacoes: 'Falta resultado do exame de sangue (coagulograma).'
    },
    {
        id: '11',
        nomePaciente: 'Sonia Lima',
        dataNascimento: '1965-01-20',
        idade: 58,
        telefone: '(13) 91234-1234',
        procedimento: 'Varizes Bilateral',
        cirurgiao: 'Dr Matsuda',
        status: STATUS.SUSPENSA,
        dataAtendimento: '2023-10-15',
        municipio: 'Registro',
        convenio: 'SUS',
        createdAt: '2023-10-20',
        observacoes: 'Cirurgia suspensa por pressão alta no dia.'
    }
];

// Helper para calcular stats iniciais
export const calculateStats = (data) => {
    const stats = {
        hojeTotal: 0,
        hojeCC: 0,
        hojeAnexo: 0,
        hojeManha: 0,
        hojeTarde: 0,
        totalAguardando: 0,
        totalAgendado: 0,
        totalRealizado: 0,
        totalGeral: data.length
    };

    const hojeStr = formatDate(today);

    data.forEach(item => {
        // Stats de Status
        if (item.status === STATUS.AGUARDANDO) stats.totalAguardando++;
        if (item.status === STATUS.AGENDADO) stats.totalAgendado++;
        if (item.status === STATUS.EXECUTADO) stats.totalRealizado++;

        // Stats de Hoje
        if (item.status === STATUS.AGENDADO && item.dataAgendado === hojeStr) {
            stats.hojeTotal++;

            if (item.local === LOCAIS.CC) stats.hojeCC++;
            if (item.local === LOCAIS.ANEXO) stats.hojeAnexo++;

            const hora = parseInt(item.horario?.split(':')[0] || '0');
            if (hora < 12) stats.hojeManha++;
            else stats.hojeTarde++;
        }
    });

    return stats;
};

export const initialStats = calculateStats(mockSurgeries);
