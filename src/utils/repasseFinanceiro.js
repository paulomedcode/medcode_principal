import { supabase } from '../services/supabase';
import { financeService } from '../services/financeService';
import { computeFolhaHash, fetchFolhaShiftsByAssignmentIds } from './folhaAssinaturas';

/*
 * Ponte Escala -> Financeiro: transforma uma folha de ponto ASSINADA numa conta
 * a pagar (finance_transactions, type='SAIDA', status='PENDENTE').
 *
 * Daqui pra frente o dinheiro é assunto do financeiro: status, valor pago e
 * saldo saem de lá (RPC settle_transaction + trigger sync_auto_payment). Esta
 * ponte é de mão única — nunca escreve status nem baixa.
 *
 * A chave determinística `folha:<mês>:<hospital>:<médico>` vai em
 * finance_transactions.shift_id, protegida por índice único parcial
 * (migration 20260903180000). É ela que impede conta a pagar duplicada quando
 * o botão é clicado duas vezes ou em duas abas ao mesmo tempo.
 */

const SETTINGS_ID = 'escala_financeiro';

// UUID do centro de custo "Geral", semeado pela migration do financeiro. Só
// entra como último recurso — o normal é o contrato do hospital.
export const DEFAULT_CC_ID = '30000000-0000-0000-0000-000000000001';

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Tira o prefixo de numeração do plano de contas ("5.01 Santa Casa..." -> "santa casa...").
const semPrefixo = (s) => norm(s).replace(/^[\d.]+\s*/, '');

const palavras = (s) => semPrefixo(s).split(/[\s/-]+/).filter(Boolean);

/*
 * Casa um nome de hospital da escala com um centro de custo, por PALAVRAS
 * inteiras — não por substring. Substring erraria feio aqui: "MedVita" é
 * pedaço de "MedVitalis", e mandar repasse pro contrato errado é dinheiro no
 * lugar errado, calado. Se mais de um centro casar, devolve null de propósito:
 * ambiguidade vira escolha manual, nunca chute.
 */
export const sugerirCentroDeCusto = (hospitalName, costCenters) => {
    const alvo = palavras(hospitalName);
    if (alvo.length === 0) return null;
    const candidatos = (costCenters || []).filter(cc => {
        const p = palavras(cc.name);
        return alvo.every(w => p.includes(w));
    });
    return candidatos.length === 1 ? candidatos[0].id : null;
};

const acharPorNome = (lista, termo) => {
    const t = norm(termo);
    const achados = (lista || []).filter(x => norm(x.name).includes(t));
    return achados.length === 1 ? achados[0].id : null;
};

/*
 * Monta a sugestão inicial de configuração resolvendo tudo POR NOME.
 * Nada de UUID fixo no código: cada hospital tem seu próprio banco Supabase,
 * com ids diferentes para conta, categoria e centro de custo.
 */
export const sugerirConfig = ({ accounts, categories, costCenters, hospitalNames }) => {
    const hospitals = {};
    (hospitalNames || []).forEach(h => { hospitals[h] = sugerirCentroDeCusto(h, costCenters) || ''; });
    return {
        accountId: acharPorNome(accounts, 'sisprime') || '',
        categoryId: acharPorNome((categories || []).filter(c => c.type === 'SAIDA'), 'repasse medico') || '',
        hospitals,
        confirmedAt: null,
    };
};

export const loadRepasseConfig = async () => {
    const { data, error } = await supabase.from('settings').select('data').eq('id', SETTINGS_ID).maybeSingle();
    if (error) throw error;
    return data?.data || null;
};

export const saveRepasseConfig = async (config) => {
    const payload = { ...config, confirmedAt: new Date().toISOString() };
    const { error } = await supabase.from('settings').upsert({ id: SETTINGS_ID, data: payload });
    if (error) throw error;
    return payload;
};

// Chave determinística da folha. Normalizada para não virar chave nova só
// porque alguém arrumou um acento no nome do médico.
export const folhaKey = (monthVal, hospitalName, doctorName) =>
    `folha:${monthVal}:${norm(hospitalName)}:${norm(doctorName)}`;

/*
 * Vencimento = último dia do mês SEGUINTE à competência.
 * ago/2026 -> 30/09/2026 · set/2026 -> 31/10/2026 · dez/2026 -> 31/01/2027.
 */
export const vencimentoDaCompetencia = (monthVal) => {
    const [y, m] = (monthVal || '').split('-').map(Number);
    if (!y || !m) return null;
    const d = new Date(y, m + 1, 0); // dia 0 do mês+2 = último dia do mês+1
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/*
 * Lançamentos de repasse já existentes no mês (status/valor pago/saldo).
 * Traz o lançamento COMPLETO de propósito: o BaixaModal do financeiro é
 * reaproveitado na tela de Repasses e precisa de type/account_id/
 * payment_method/doc_number para montar a baixa igualzinho a Contas a Pagar.
 */
export const fetchRepassesDoMes = async (monthVal) => {
    const { data, error } = await supabase
        .from('finance_transactions')
        .select('id, shift_id, amount, paid_amount, status, due_date, doctor_id, cost_center_id, description, type, account_id, payment_method, doc_number, split_group_id, imported_transaction_id')
        .like('shift_id', `folha:${monthVal}:%`);
    if (error) throw error;
    return data || [];
};

/*
 * Envia UMA folha. Não lança exceção para os casos esperados — devolve um
 * resultado que o lote sabe resumir:
 *   { status: 'enviada' | 'ja_enviada' | 'bloqueada', motivo, transactionId }
 *
 * As travas rodam ANTES de qualquer escrita. É dinheiro: na dúvida, não envia.
 */
export const enviarFolhaParaFinanceiro = async ({
    doctorName, hospitalName, monthVal, shifts, assinatura, config, doctorsList, currentUser,
}) => {
    const bloqueio = (motivo) => ({ status: 'bloqueada', motivo, doctorName, hospitalName });

    // 1. Só folha assinada vai para o financeiro.
    if (!assinatura || assinatura.status !== 'assinado') {
        return bloqueio('folha ainda não assinada pelo médico');
    }

    // 2. O valor assinado tem que ser o valor atual. Se algum plantão mudou
    //    depois da assinatura, o que o médico assinou não é mais o que seria
    //    pago — precisa reenviar para assinatura antes.
    const liveShifts = await fetchFolhaShiftsByAssignmentIds(assinatura.assignment_ids);
    const { hash } = await computeFolhaHash({ doctorName, hospitalName, monthVal, shifts: liveShifts });
    if (hash !== assinatura.content_hash) {
        return bloqueio('os plantões mudaram depois da assinatura — reenvie para assinar de novo');
    }

    // 3. Hospital precisa de centro de custo mapeado (nada de cair no "Geral" calado).
    const costCenterId = config?.hospitals?.[hospitalName];
    if (!costCenterId) return bloqueio(`sem centro de custo configurado para "${hospitalName}"`);
    if (!config?.accountId) return bloqueio('conta bancária não configurada');
    if (!config?.categoryId) return bloqueio('categoria de repasse não configurada');

    // 4. Médico precisa existir em users — senão o lançamento nasce órfão.
    const docRecord = (doctorsList || []).find(d => (d.name || d.nome) === doctorName);
    if (!docRecord?.id) return bloqueio('médico não encontrado no cadastro de usuários');

    // 5. Valor tem que fazer sentido — e o que já foi pago sai da
    //    conta a pagar. A folha continua mostrando o plantão inteiro (o médico
    //    trabalhou), mas o repasse do mês paga só o que falta; senão o dia
    //    adiantado seria pago duas vezes.
    //
    //    O desconto vem de liveShifts (lido do banco agora), não do que a tela
    //    mandou: é o mesmo conjunto que acabou de bater com o hash assinado.
    const bruto = (shifts || []).reduce((s, a) => s + (Number(a.val) || 0), 0);
    const adiantado = liveShifts.reduce((s, a) => s + (Number(a.avista?.valor) || 0), 0);
    const amount = bruto - adiantado;
    if (!(bruto > 0)) return bloqueio('valor total da folha é zero');
    if (!(amount > 0)) {
        return bloqueio(adiantado > 0
            ? 'todos os plantões desta folha já foram pagos — não há saldo a lançar'
            : 'valor total da folha é zero');
    }

    // 6. Já enviada? Não duplica.
    const key = folhaKey(monthVal, hospitalName, doctorName);
    const { data: existente } = await supabase
        .from('finance_transactions').select('id').eq('shift_id', key).maybeSingle();
    if (existente?.id) {
        await vincularAssinatura(assinatura.id, existente.id, currentUser?.id);
        return { status: 'ja_enviada', doctorName, hospitalName, transactionId: existente.id };
    }

    const payload = {
        account_id: config.accountId,
        category_id: config.categoryId,
        cost_center_id: costCenterId,
        doctor_id: docRecord.id,
        party_id: null,
        type: 'SAIDA',
        // NUNCA 'PAGO' na criação: isso dispararia baixa automática (trigger
        // sync_auto_payment) e mexeria no saldo do banco na hora.
        status: 'PENDENTE',
        amount,
        transaction_date: new Date().toISOString().slice(0, 10),
        due_date: vencimentoDaCompetencia(monthVal),
        reference_month: monthVal,
        // A descrição diz o desconto: quem abrir a conta a pagar precisa
        // entender por que ela não bate com o total da folha.
        description: adiantado > 0
            ? `Repasse Plantões — ${doctorName} — ${hospitalName} — ${monthVal} (folha R$ ${bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} − R$ ${adiantado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} já pagos)`
            : `Repasse Plantões — ${doctorName} — ${hospitalName} — ${monthVal}`,
        shift_id: key,
    };

    try {
        const tx = await financeService.createTransaction(payload);
        await vincularAssinatura(assinatura.id, tx.id, currentUser?.id);
        return { status: 'enviada', doctorName, hospitalName, transactionId: tx.id, amount };
    } catch (e) {
        // 23505 = índice único da folha. Duas requisições simultâneas passaram
        // as duas pela checagem do passo 6; o banco barrou a segunda. Isso não
        // é erro para o usuário — é exatamente a trava fazendo o trabalho dela.
        if (e?.code === '23505') {
            const { data: achado } = await supabase
                .from('finance_transactions').select('id').eq('shift_id', key).maybeSingle();
            if (achado?.id) {
                await vincularAssinatura(assinatura.id, achado.id, currentUser?.id);
                return { status: 'ja_enviada', doctorName, hospitalName, transactionId: achado.id };
            }
        }
        throw e;
    }
};

/*
 * Desfaz o envio: apaga a conta a pagar e solta o vínculo, deixando a folha
 * pronta para ser enviada de novo (envio errado, valor corrigido, etc).
 *
 * Este é o ponto mais perigoso do fluxo e o banco NÃO protege sozinho:
 *  - finance_transaction_payments tem FK ON DELETE CASCADE, então apagar o
 *    lançamento apagaria as baixas junto;
 *  - o trigger trg_payment_update_balance roda no DELETE e MEXERIA NO SALDO
 *    da conta bancária;
 *  - a guarda guard_transaction_update só cobre UPDATE, não DELETE.
 * Ou seja: quem tem que barrar é este código. Na dúvida, não apaga.
 */
export const desfazerEnvioFinanceiro = async ({ assinatura, transactionId }) => {
    const id = transactionId || assinatura?.transaction_id;
    if (!id) return { status: 'bloqueada', motivo: 'esta folha não tem lançamento vinculado' };

    // Relê do banco AGORA: entre desenhar a tela e clicar, alguém pode ter dado
    // baixa. Decidir por estado velho aqui apagaria um pagamento real.
    const { data: tx, error } = await supabase
        .from('finance_transactions')
        .select('id, amount, paid_amount, status, imported_transaction_id, description')
        .eq('id', id).maybeSingle();
    if (error) throw error;

    if (!tx) {
        // Lançamento já não existe: só limpa o vínculo órfão.
        await limparVinculo(assinatura?.id);
        return { status: 'desfeita', motivo: 'o lançamento já não existia; vínculo limpo' };
    }

    const pago = Number(tx.paid_amount) || 0;
    if (pago > 0) {
        return {
            status: 'bloqueada',
            motivo: `este lançamento já tem baixa de R$ ${pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Estorne a baixa no Financeiro antes de desfazer o envio.`,
        };
    }
    if (tx.imported_transaction_id) {
        return {
            status: 'bloqueada',
            motivo: 'este lançamento está conciliado com o extrato. Desconcilie no Financeiro antes de desfazer o envio.',
        };
    }

    await financeService.deleteTransaction(id);
    await limparVinculo(assinatura?.id);
    return { status: 'desfeita', amount: Number(tx.amount) || 0 };
};

const limparVinculo = async (assinaturaId) => {
    if (!assinaturaId) return;
    const { error } = await supabase.from('folha_assinaturas').update({
        transaction_id: null,
        sent_to_finance_at: null,
        sent_by: null,
        updated_at: new Date().toISOString(),
    }).eq('id', assinaturaId);
    if (error) throw error;
};

// Guarda o vínculo do lado da Escala. Falha aqui não desfaz o lançamento (nem
// deveria): a chave determinística permite religar depois sem duplicar.
const vincularAssinatura = async (assinaturaId, transactionId, userId) => {
    if (!assinaturaId) return;
    try {
        await supabase.from('folha_assinaturas').update({
            transaction_id: transactionId,
            sent_to_finance_at: new Date().toISOString(),
            sent_by: userId || null,
            updated_at: new Date().toISOString(),
        }).eq('id', assinaturaId);
    } catch (e) {
        console.error('Lançamento criado, mas falhou ao vincular na folha:', e);
    }
};
