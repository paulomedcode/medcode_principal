import { supabase } from '../services/supabase';
import { resolveClientIdentity } from './logger';
import { rowTotal } from './escalaValores';

/*
 * Assinatura eletrônica simples (Nível 1) da Folha de Ponto: sem certificado
 * digital, o médico confirma dentro da plataforma e isso fica registrado com
 * hash do conteúdo exibido + autor + IP + timestamp (Lei 14.063/2020).
 *
 * Uma linha em `folha_assinaturas` por (doctor_name, hospital_name, month_val).
 * `content_hash` garante que a folha assinada é a mesma que foi exibida: se
 * algum plantão do conjunto mudar depois do envio, o hash recalculado não
 * bate mais e a assinatura precisa ser reenviada.
 */

const toHex = (buffer) => Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

// Serialização determinística: mesma ordem de campos sempre, senão o hash de
// um mesmo conjunto de plantões mudaria a cada geração.
export const computeFolhaHash = async ({ doctorName, hospitalName, monthVal, shifts }) => {
    const assignmentIds = (shifts || []).map(s => s.slotId).sort();
    const payload = {
        doctorName,
        hospitalName,
        monthVal,
        assignmentIds,
        items: (shifts || [])
            .map(s => ({
                slotId: s.slotId,
                date: s.displayDate || s.date || '',
                time: s.time || '',
                val: Number(s.val) || 0,
                // O adiantamento entra no hash porque muda o que o médico vai
                // receber: sem isso daria para marcar um plantão como pago à
                // pago DEPOIS que ele assinou, e a assinatura continuaria
                // valendo para um valor a pagar menor.
                //
                // A chave só aparece quando existe pagamento avulso: assim o
                // payload das folhas sem adiantamento continua idêntico ao de
                // antes desta mudança, e as 21 folhas de agosto já assinadas não
                // viram "hash não bate" precisando de reassinatura.
                ...(s.avista ? { avista: `${s.avista.data}:${Number(s.avista.valor) || 0}` } : {}),
            }))
            .sort((a, b) => a.slotId.localeCompare(b.slotId)),
    };
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return { hash: toHex(digest), assignmentIds };
};

export const sendFolhaForSignature = async ({ doctorId, doctorName, hospitalName, monthVal, shifts, requestedBy }) => {
    const { hash, assignmentIds } = await computeFolhaHash({ doctorName, hospitalName, monthVal, shifts });
    const { error } = await supabase.from('folha_assinaturas').upsert([{
        doctor_id: doctorId || null,
        doctor_name: doctorName,
        hospital_name: hospitalName,
        month_val: monthVal,
        assignment_ids: assignmentIds,
        content_hash: hash,
        status: 'pendente',
        requested_by: requestedBy || null,
        requested_at: new Date().toISOString(),
        signed_by: null,
        signed_at: null,
        // Reenviar zera o documento junto com a assinatura: o snapshot antigo
        // pertence a uma assinatura que não vale mais.
        signed_snapshot: null,
        ip_address: null,
        user_agent: null,
        updated_at: new Date().toISOString(),
    }], { onConflict: 'doctor_name,hospital_name,month_val' });
    if (error) throw error;
};

export const fetchFolhaAssinaturas = async (monthVal) => {
    const { data, error } = await supabase
        .from('folha_assinaturas')
        .select('*')
        .eq('month_val', monthVal);
    if (error) throw error;
    return data || [];
};

// Busca as linhas atuais de escala_plantoes que compõem uma folha (pelos
// assignment_ids gravados no envio) e monta o mesmo formato de shift usado
// por computeFolhaHash — usada tanto pra exibir a folha ao médico quanto
// pra recalcular o hash na hora de assinar.
export const fetchFolhaShiftsByAssignmentIds = async (assignmentIds) => {
    if (!assignmentIds || assignmentIds.length === 0) return [];
    const { data, error } = await supabase
        .from('escala_plantoes')
        .select('assignment_id, date, time, subtitle, financial_base, financial_extra, extra_items, folha_outros, paid_cash_at, paid_cash_amount, paid_cash_tx')
        .in('assignment_id', assignmentIds);
    if (error) throw error;
    return (data || []).map(row => ({
        slotId: row.assignment_id,
        displayDate: (row.date && row.date !== 'Padrão') ? row.date : '',
        time: row.time || '',
        val: rowTotal(row),
        outros: !!row.folha_outros,
        subtitle: row.subtitle || '',
        // As linhas do "Mais Opções" viajam junto para que o PDF possa quebrar o
        // plantão "Outros" em uma linha por item, igual à folha do RH. Não entram
        // no hash (computeFolhaHash só olha slotId/data/horário/valor), então
        // acrescentá-las aqui não invalida assinatura nenhuma.
        financial: { extraItems: row.extra_items || [] },
        // Plantão já pago: continua valendo o valor cheio na folha (ele
        // trabalhou), e este carimbo é o que faz o repasse do mês descontar e a
        // tela do médico dizer o dia em que o dinheiro saiu.
        avista: row.paid_cash_at
            ? { data: row.paid_cash_at, valor: Number(row.paid_cash_amount) || 0, transactionId: row.paid_cash_tx }
            : null,
    }));
};

/*
 * Folhas esperando a assinatura do usuário logado.
 *
 * Casa por id do cadastro OU por nome: o envio grava os dois, mas o nome vem da
 * escala e o do cadastro pode divergir (acento, abreviação, "Dr."). Só pelo
 * nome, uma diferença de grafia esconderia a pendência sem erro nenhum.
 */
export const fetchPendingSignatures = async (currentUser) => {
    const doctorName = currentUser?.name || currentUser?.nome;
    const doctorId = currentUser?.id;
    if (!doctorName && !doctorId) return [];

    const criterios = [];
    if (doctorId) criterios.push(`doctor_id.eq.${doctorId}`);
    // Aspas: nome com vírgula quebraria a lista de critérios do PostgREST.
    if (doctorName) criterios.push(`doctor_name.eq."${doctorName}"`);

    const { data, error } = await supabase
        .from('folha_assinaturas')
        .select('*')
        .or(criterios.join(','))
        .eq('status', 'pendente')
        .order('month_val', { ascending: false });
    if (error) throw error;
    return data || [];
};

// Recalcula o hash a partir dos dados atuais (não confia no estado do
// widget) e só grava a assinatura se ele bater com o que foi enviado.
export const signFolha = async ({ record, liveShifts, currentUser, signatureImage }) => {
    const { hash } = await computeFolhaHash({
        doctorName: record.doctor_name,
        hospitalName: record.hospital_name,
        monthVal: record.month_val,
        shifts: liveShifts,
    });
    if (hash !== record.content_hash) {
        const err = new Error('Os plantões desta folha mudaram desde o envio. Peça pro RH reenviar.');
        err.code = 'HASH_MISMATCH';
        throw err;
    }

    const identity = await resolveClientIdentity();
    const { error } = await supabase
        .from('folha_assinaturas')
        .update({
            status: 'assinado',
            /*
             * O documento, congelado.
             *
             * O hash prova que a folha mudou; o snapshot preserva o que foi
             * assinado. Sem ele, reimprimir uma folha assinada significava
             * remontá-la a partir da escala de HOJE — e um plantão alterado ou
             * excluído depois fazia o documento assinado mudar (ou sumir) nas
             * costas do médico. Daqui em diante toda reimpressão sai daqui.
             */
            signed_snapshot: {
                versao: 1,
                doctorName: record.doctor_name,
                hospitalName: record.hospital_name,
                monthVal: record.month_val,
                crm: currentUser?.crm || '',
                assinadoEm: new Date().toISOString(),
                shifts: liveShifts,
                total: (liveShifts || []).reduce((s, a) => s + (Number(a.val) || 0), 0),
                adiantado: (liveShifts || []).reduce((s, a) => s + (Number(a.avista?.valor) || 0), 0),
            },
            signature_image: signatureImage || null,
            signed_by: currentUser?.id || null,
            signed_at: new Date().toISOString(),
            ip_address: identity.ipAddress,
            user_agent: identity.userAgent,
            updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);
    if (error) throw error;
};

/*
 * Cancela o ENVIO de uma folha que ainda não foi assinada: desfaz o pedido.
 *
 * Diferente de cancelFolhaSignature — lá existe uma assinatura para preservar
 * (quem assinou, quando, de qual IP), então a linha só é marcada 'invalidado'.
 * Aqui não há nada assinado: a linha some e a folha volta a "não enviada",
 * sumindo também das pendências do médico.
 *
 * O `.eq('status','pendente')` é a trava: se o médico assinar entre a tela
 * carregar e o clique, o DELETE não pega nada em vez de apagar a assinatura
 * dele — e a função avisa em vez de mentir que deu certo.
 */
export const cancelFolhaEnvio = async ({ record }) => {
    const { data, error } = await supabase
        .from('folha_assinaturas')
        .delete()
        .eq('id', record.id)
        .eq('status', 'pendente')
        .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
        const err = new Error('Esta folha não está mais pendente — o médico pode ter assinado agora há pouco. Atualize a tela.');
        err.code = 'NAO_PENDENTE';
        throw err;
    }
};

// Cancela uma assinatura já dada (ex.: plantão/valor corrigido depois do
// médico assinar). Não apaga a linha nem os dados de quem assinou — só marca
// 'invalidado', preservando o histórico. Depois de cancelada, o admin manda
// de novo pelo mesmo caminho de reenvio das folhas pendentes.
export const cancelFolhaSignature = async ({ record, cancelledBy }) => {
    const { error } = await supabase
        .from('folha_assinaturas')
        .update({
            status: 'invalidado',
            cancelled_by: cancelledBy || null,
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);
    if (error) throw error;
};

/*
 * Os plantões de uma folha ASSINADA, para exibir ou reimprimir.
 *
 * Ordem que importa: primeiro o snapshot gravado na assinatura (o documento
 * que o médico viu), e só na falta dele a escala atual. O fallback existe para
 * as folhas assinadas antes do snapshot — não dá para inventar retroativamente
 * o que não foi guardado, mas para elas o hash continua denunciando divergência.
 */
export const shiftsDaFolhaAssinada = async (record) => {
    const doSnapshot = record?.signed_snapshot?.shifts;
    if (Array.isArray(doSnapshot) && doSnapshot.length > 0) return doSnapshot;
    return fetchFolhaShiftsByAssignmentIds(record?.assignment_ids);
};

/*
 * Esta folha (a que contém este plantão) já foi assinada?
 *
 * Trava para qualquer operação que mude o conteúdo de um plantão — inclusive
 * marcar como pago, que altera o que o médico vai receber e entra no hash. Depois
 * da assinatura, mexer no plantão exige cancelar a assinatura antes.
 */
export const folhaAssinadaDoPlantao = async (assignmentId) => {
    if (!assignmentId) return null;
    const { data, error } = await supabase
        .from('folha_assinaturas')
        .select('id, doctor_name, hospital_name, month_val')
        .eq('status', 'assinado')
        .contains('assignment_ids', [assignmentId])
        .maybeSingle();
    if (error) return null;
    return data || null;
};
