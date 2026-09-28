import { supabase } from '../services/supabase';

/*
 * Meus Repasses — leitura do lado do médico.
 *
 * Tudo passa pela função meus_repasses() do banco (SECURITY DEFINER), nunca
 * por um select em finance_transactions com filtro no client. A diferença
 * importa: com RLS desligado, filtrar no navegador protege a TELA, não o DADO
 * — qualquer pessoa autenticada poderia pedir a tabela inteira pela API. Quem
 * decide de quem é a sessão, e devolve só as linhas daquele médico, é o
 * servidor.
 */

// Função ainda não aplicada neste banco (cada hospital tem o seu). Erro
// específico para a tela poder explicar em vez de mostrar "erro inesperado".
const FUNCAO_AUSENTE = ['42883', 'PGRST202'];

export const fetchMeusRepasses = async () => {
    const { data, error } = await supabase.rpc('meus_repasses');
    if (error) {
        if (FUNCAO_AUSENTE.includes(error.code)) {
            const err = new Error('Esta unidade ainda não recebeu a atualização do Meus Repasses. Avise a administração.');
            err.code = 'SEM_FUNCAO';
            throw err;
        }
        throw error;
    }
    return data || [];
};

/*
 * Logo de cada hospital, para o PDF da folha sair igual ao do RH.
 *
 * Vive no mesmo settings.id='escala' que a Escala já lê. Falhar aqui não pode
 * derrubar a folha: sem logo o documento continua válido, então o erro é
 * engolido de propósito.
 */
export const fetchLogosDosHospitais = async () => {
    try {
        const { data } = await supabase.from('settings').select('data').eq('id', 'escala').maybeSingle();
        const hospitais = data?.data?.hospitais || [];
        return Object.fromEntries(hospitais.map(h => [h.name, h.logoUrl || '']));
    } catch {
        return {};
    }
};

// ---------------------------------------------------------------------------
// Como cada estado se chama para quem vai receber o dinheiro.
//
// 'EM_PROCESSAMENTO' é o estado que o financeiro não tem: a folha está
// assinada, mas ainda não virou conta a pagar. Chamar isso de "pendente"
// faria o médico cobrar um pagamento que ninguém ainda registrou.
export const ESTADOS = {
    EM_PROCESSAMENTO: {
        // "Em processamento" não dizia nada a quem espera dinheiro. O estado
        // real é: assinada, ainda não virou conta a pagar no financeiro.
        label: 'Aguardando envio',
        tone: 'neutral',
    },
    PENDENTE: { label: 'A receber', tone: 'warn' },
    PARCIAL: { label: 'Pago parcial', tone: 'accent' },
    PAGO: { label: 'Pago', tone: 'ok' },
};

export const estadoDe = (r) => ESTADOS[r?.pagamento] || ESTADOS.EM_PROCESSAMENTO;

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const dataBR = (iso) => {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return (y && m && d) ? `${d}/${m}/${y}` : '';
};

// A frase de apoio de cada linha: é ela que evita o telefonema. "A receber"
// sozinho não diz nada; "previsão 30/09" diz.
export const legendaDe = (r) => {
    switch (r?.pagamento) {
        case 'PAGO':
            return r.pago_em ? `Pago em ${dataBR(r.pago_em)}` : 'Pagamento registrado';
        case 'PARCIAL':
            return `Recebido R$ ${brl(r.paid_amount)} de R$ ${brl(r.valor)}${r.pago_em ? ` · última em ${dataBR(r.pago_em)}` : ''}`;
        case 'PENDENTE':
            return r.due_date ? `Previsão de pagamento: ${dataBR(r.due_date)}` : 'Aguardando pagamento';
        default:
            return 'Folha assinada · aguardando envio ao financeiro';
    }
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const rotuloMes = (monthVal) => {
    if (!monthVal || !monthVal.includes('-')) return monthVal || '';
    const [y, m] = monthVal.split('-');
    return `${MESES[parseInt(m, 10) - 1] || m} de ${y}`;
};

export { brl, dataBR };
