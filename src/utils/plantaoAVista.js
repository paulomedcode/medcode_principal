import { supabase } from '../services/supabase';
import { financeService } from '../services/financeService';
import { folhaKey } from './repasseFinanceiro';
import { folhaAssinadaDoPlantao } from './folhaAssinaturas';

/*
 * Plantão já pago.
 *
 * "Já pago", e não "à vista": o pagamento pode ter saído no dia do plantão,
 * antes ou depois — o que importa para a folha é que aquele dia já foi quitado
 * fora do repasse do mês (decisão do Paulo, set/2026). O nome técnico interno
 * (arquivo, prefixo `avista:` em shift_id, colunas `paid_cash_*`) ficou como
 * nasceu: renomear chave de dinheiro já gravada no banco vale menos do que o
 * risco, e ela nunca aparece para ninguém.
 *
 * O médico recebe aquele dia fora do fechamento do mês. O
 * plantão continua saindo na folha pelo valor cheio — ele trabalhou, e a folha
 * é o documento do que foi feito — mas o repasse do mês desconta o que já foi
 * pago. Folha de 16 mil com um plantão de 2 mil adiantado vira conta a pagar de
 * 14 mil.
 *
 * Dois registros, cada um com sua função:
 *   • no FINANCEIRO, um lançamento SAIDA com baixa na data em que o dinheiro
 *     saiu — é o que aparece no extrato, no DRE e na conciliação;
 *   • na ESCALA, o carimbo (data, valor, id do lançamento) na linha do plantão
 *     — é o que a folha e a tela do médico leem, sem precisar tocar na tabela
 *     do caixa da empresa.
 *
 * Como no envio da folha, as travas rodam ANTES de qualquer escrita. É dinheiro:
 * na dúvida, não paga.
 */

export const avistaKey = (assignmentId) => `avista:${assignmentId}`;

const bloqueio = (motivo) => ({ status: 'bloqueada', motivo });

/*
 * Lançamentos à vista de um mês, para a Escala saber quais plantões já foram
 * pagos sem perguntar linha por linha. A chave carrega o assignment_id, que
 * começa com o mês ('2026-08-w2-...').
 */
export const fetchAVistaDoMes = async (monthVal) => {
    const { data, error } = await supabase
        .from('finance_transactions')
        .select('id, shift_id, amount, paid_amount, status, transaction_date')
        .like('shift_id', `avista:${monthVal}-%`);
    if (error) throw error;
    return data || [];
};

/*
 * Registra o pagamento à vista de UM plantão.
 *
 * O lançamento nasce PENDENTE e recebe baixa em seguida — nunca é criado como
 * PAGO. Criar já pago dispara a baixa automática pelo trigger sync_auto_payment
 * e mexe no saldo do banco na hora, sem a data, a conta e a forma que a pessoa
 * escolheu aqui.
 */
export const registrarPlantaoAVista = async ({
    assignmentId, doctorName, hospitalName, monthVal, displayDate,
    valor, data, contaId, forma, doc,
    config, doctorsList, jaEnviadaAoFinanceiro,
}) => {
    // 1. A folha do mês já virou conta a pagar? Então o valor cheio já está lá:
    //    descontar agora exigiria mexer num lançamento que pode até já ter
    //    baixa. Quem decide isso é o financeiro, à mão.
    if (jaEnviadaAoFinanceiro) {
        return bloqueio('a folha deste médico neste mês já foi enviada ao financeiro. Dê baixa parcial no lançamento, ou desfaça o envio antes.');
    }

    /*
     * 1b. Folha já assinada não recebe pagamento à vista.
     *
     * O médico assinou um documento que diz "a receber X". Marcar um dia como
     * pago à vista depois muda esse número — e muda o hash, invalidando a
     * própria assinatura. O caminho é cancelar a assinatura, marcar o
     * pagamento e reenviar para assinar.
     */
    const assinada = await folhaAssinadaDoPlantao(assignmentId);
    if (assinada) {
        return bloqueio('a folha deste mês já foi ASSINADA pelo médico. Cancele a assinatura na Folha de Ponto, marque o pagamento e reenvie para assinatura.');
    }

    if (!(Number(valor) > 0)) return bloqueio('o valor do plantão é zero');
    if (!data) return bloqueio('informe a data do pagamento');
    if (!contaId) return bloqueio('selecione a conta de onde o dinheiro saiu');

    // 2. Mesmas amarrações do repasse do mês: o dinheiro cai na mesma categoria
    //    e no mesmo centro de custo, senão este pagamento sumiria do contrato do
    //    hospital no DRE.
    const costCenterId = config?.hospitals?.[hospitalName];
    if (!costCenterId) return bloqueio(`sem centro de custo configurado para "${hospitalName}"`);
    if (!config?.categoryId) return bloqueio('categoria de repasse não configurada');

    const docRecord = (doctorsList || []).find(d => (d.name || d.nome) === doctorName);
    if (!docRecord?.id) return bloqueio('médico não encontrado no cadastro de usuários');

    // 3. Já pago? Não paga de novo.
    const key = avistaKey(assignmentId);
    const { data: existente } = await supabase
        .from('finance_transactions').select('id').eq('shift_id', key).maybeSingle();
    if (existente?.id) return { status: 'ja_pago', transactionId: existente.id };

    const payload = {
        account_id: contaId,
        category_id: config.categoryId,
        cost_center_id: costCenterId,
        doctor_id: docRecord.id,
        party_id: null,
        type: 'SAIDA',
        status: 'PENDENTE',
        amount: Number(valor),
        transaction_date: data,
        due_date: data,
        // Competência é o mês da ESCALA, não o do pagamento: um plantão de
        // agosto pago em agosto ou em setembro pertence ao resultado de agosto.
        reference_month: monthVal,
        payment_method: forma || null,
        description: `Plantão já pago — ${doctorName} — ${hospitalName} — ${displayDate || monthVal}`,
        shift_id: key,
    };

    let tx;
    try {
        tx = await financeService.createTransaction(payload);
    } catch (e) {
        // 23505 = o índice único pegou uma corrida (dois cliques simultâneos).
        // Não é erro para o usuário: é a trava trabalhando.
        if (e?.code === '23505') {
            const { data: achado } = await supabase
                .from('finance_transactions').select('id').eq('shift_id', key).maybeSingle();
            if (achado?.id) return { status: 'ja_pago', transactionId: achado.id };
        }
        throw e;
    }

    // 4. A baixa, com a data/conta/forma escolhidas. Se falhar aqui, o
    //    lançamento fica PENDENTE e visível em contas a pagar — melhor do que
    //    sumir com o registro de um dinheiro que já saiu.
    await financeService.settleTransaction(tx.id, {
        amount: Number(valor), date: data, method: forma || null, accountId: contaId, doc: doc || null,
    });

    /*
     * 5. O carimbo na escala — e a verificação junto.
     *
     * Pagar é o ato mais forte de conferência que existe: ninguém paga um
     * plantão que não conferiu. Além disso, a folha de ponto só junta plantões
     * VERIFICADOS — um plantão pago e não verificado ficaria fora da folha, e o
     * médico veria um dia a menos do que fez.
     *
     * O appearance é lido agora e mesclado, nunca substituído: cor, negrito e
     * sinalizado são de quem monta a escala, e sumiriam num update cego.
     */
    const { data: linha } = await supabase
        .from('escala_plantoes').select('appearance').eq('assignment_id', assignmentId).maybeSingle();

    const { error } = await supabase
        .from('escala_plantoes')
        .update({
            paid_cash_at: data,
            paid_cash_amount: Number(valor),
            paid_cash_tx: tx.id,
            appearance: { ...(linha?.appearance || {}), verified: true },
            updated_at: new Date().toISOString(),
        })
        .eq('assignment_id', assignmentId);
    if (error) throw error;

    return { status: 'pago', transactionId: tx.id, amount: Number(valor) };
};

/*
 * Desfaz o pagamento à vista: estorna a baixa, apaga o lançamento e solta o
 * carimbo do plantão.
 *
 * Ponto perigoso, como o desfazer do envio da folha: apagar lançamento com
 * baixa mexe no saldo da conta por gatilho. Por isso o estado é RELIDO agora —
 * entre desenhar a tela e clicar, alguém pode ter conciliado o lançamento com
 * o extrato, e aí quem decide é o financeiro.
 */
export const desfazerPlantaoAVista = async ({ assignmentId, transactionId }) => {
    const id = transactionId;
    if (!id) {
        await limparCarimbo(assignmentId);
        return { status: 'desfeito', motivo: 'não havia lançamento vinculado; carimbo limpo' };
    }

    const { data: tx, error } = await supabase
        .from('finance_transactions')
        .select('id, amount, paid_amount, status, imported_transaction_id')
        .eq('id', id).maybeSingle();
    if (error) throw error;

    if (!tx) {
        await limparCarimbo(assignmentId);
        return { status: 'desfeito', motivo: 'o lançamento já não existia; carimbo limpo' };
    }

    if (tx.imported_transaction_id) {
        return bloqueio('este pagamento já está conciliado com o extrato. Desconcilie no Financeiro antes de desfazer.');
    }

    // Estorna baixa por baixa: o gatilho devolve o saldo à conta a cada uma.
    const baixas = await financeService.getTransactionPayments(id);
    for (const p of (baixas || [])) {
        await financeService.deletePayment(p.id);
    }
    await financeService.deleteTransaction(id);
    await limparCarimbo(assignmentId);
    return { status: 'desfeito', amount: Number(tx.amount) || 0 };
};

/*
 * Solta só o carimbo do pagamento. A VERIFICAÇÃO não volta atrás: marcar como
 * verificado é definitivo em toda a Escala, e desfazer um pagamento não desfaz
 * a conferência que já aconteceu.
 */
const limparCarimbo = async (assignmentId) => {
    const { error } = await supabase
        .from('escala_plantoes')
        .update({ paid_cash_at: null, paid_cash_amount: null, paid_cash_tx: null, updated_at: new Date().toISOString() })
        .eq('assignment_id', assignmentId);
    if (error) throw error;
};

/*
 * A folha deste médico/hospital/mês já virou conta a pagar?
 *
 * Usada como trava antes de registrar um à vista: depois do envio, o valor
 * cheio já está no financeiro.
 */
export const folhaJaEnviada = async (monthVal, hospitalName, doctorName) => {
    const { data } = await supabase
        .from('finance_transactions')
        .select('id')
        .eq('shift_id', folhaKey(monthVal, hospitalName, doctorName))
        .maybeSingle();
    return !!data?.id;
};
