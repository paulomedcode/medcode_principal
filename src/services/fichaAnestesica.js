import { supabase } from './supabase';

/**
 * Persistência da Ficha Anestésica.
 *
 * Premissa do ambiente: sala de cirurgia tem Wi-Fi ruim. Nada do que o
 * anestesista registra pode depender da rede estar de pé no instante do
 * registro — os eventos vão primeiro para uma fila local e de lá são enviados.
 * O acréscimo no banco é idempotente (RPC `fa_append_eventos`), então reenviar
 * o mesmo lote nunca duplica registro.
 */

const TABELA = 'fichas_anestesicas';
const PREFIXO_FILA = 'fa_fila_';

/* -------------------------------------------------------------------------- */
/* Fila local                                                                  */
/* -------------------------------------------------------------------------- */

function chaveFila(fichaId) {
    return `${PREFIXO_FILA}${fichaId}`;
}

/** Eventos aguardando envio para uma ficha. */
export function lerFila(fichaId) {
    try {
        return JSON.parse(localStorage.getItem(chaveFila(fichaId)) || '[]');
    } catch {
        return [];
    }
}

function gravarFila(fichaId, eventos) {
    try {
        if (eventos.length === 0) localStorage.removeItem(chaveFila(fichaId));
        else localStorage.setItem(chaveFila(fichaId), JSON.stringify(eventos));
    } catch (erro) {
        console.warn('[fichaAnestesica] não foi possível gravar a fila local:', erro);
    }
}

/** Fichas que têm eventos pendentes de envio (para avisar o usuário). */
export function fichasComPendencia() {
    const pendentes = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const chave = localStorage.key(i);
            if (!chave?.startsWith(PREFIXO_FILA)) continue;
            const fichaId = chave.slice(PREFIXO_FILA.length);
            const quantidade = lerFila(fichaId).length;
            if (quantidade > 0) pendentes.push({ fichaId, quantidade });
        }
    } catch { /* localStorage indisponível */ }
    return pendentes;
}

/* -------------------------------------------------------------------------- */
/* Eventos                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Registra eventos: entram na fila local e são enviados em seguida.
 *
 * Sempre resolve — falha de rede não é erro para quem está registrando, é
 * pendência. Quem chama olha `enviados` para saber se já foi ou se ficou na fila.
 */
export async function registrarEventos(fichaId, novosEventos) {
    const lista = Array.isArray(novosEventos) ? novosEventos : [novosEventos];
    if (!fichaId || lista.length === 0) return { enviados: false, pendentes: 0, erro: null };

    gravarFila(fichaId, [...lerFila(fichaId), ...lista]);
    return sincronizarFila(fichaId);
}

/**
 * Envia a fila local. Só limpa o que o banco confirmou.
 *
 * Erro de regra (ficha finalizada, ficha excluída) não pode ficar reciclando na
 * fila para sempre: nesse caso a fila é devolvida a quem chamou, junto do erro.
 */
export async function sincronizarFila(fichaId) {
    const fila = lerFila(fichaId);
    if (fila.length === 0) return { enviados: true, pendentes: 0, erro: null };

    const { error } = await supabase.rpc('fa_append_eventos', {
        p_ficha: fichaId,
        p_eventos: fila
    });

    if (error) {
        const regraDeNegocio = /finalizada|não encontrada|nao encontrada/i.test(error.message || '');
        if (regraDeNegocio) gravarFila(fichaId, []);
        return { enviados: false, pendentes: regraDeNegocio ? 0 : fila.length, erro: error, bloqueada: regraDeNegocio };
    }

    gravarFila(fichaId, []);
    return { enviados: true, pendentes: 0, erro: null };
}

/** Marca um evento como removido, preservando o histórico. */
export async function removerEventoDaFicha(fichaId, eventoId, autorId) {
    return supabase.rpc('fa_marcar_removido', {
        p_ficha: fichaId,
        p_evento: eventoId,
        p_autor: autorId || null
    });
}

/* -------------------------------------------------------------------------- */
/* Ficha                                                                       */
/* -------------------------------------------------------------------------- */

export async function criarFicha(ficha) {
    return supabase.from(TABELA).insert([ficha]).select().single();
}

export async function carregarFicha(id) {
    return supabase.from(TABELA).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
}

/**
 * Lista as fichas do recorte pedido.
 *
 * `unidades` (lista) só é usada por quem tem permissão para ver fora da própria
 * unidade — a tela decide isso; aqui a lista chega pronta. Ficha sem unidade
 * gravada aparece junto da unidade atual, senão sumiria de todo lugar.
 *
 * O período filtra por `inicio_anestesia`; ficha ainda sem início registrado
 * não é excluída pelo filtro de período, porque ela é justamente a que está
 * acontecendo agora.
 */
export async function listarFichas({
    unidade = null,
    unidades = null,
    status = null,
    pacienteId = null,
    dataInicio = null,
    dataFim = null,
    limite = 200,
    lixeira = false
} = {}) {
    let consulta = supabase
        .from(TABELA)
        .select('id, paciente_nome, procedimento, status, inicio_anestesia, fim_anestesia, anestesista_nome, unidade, surgery_id, apa_id, responsavel_id, responsavel_nome, passagem_para_id, deleted_at')
        .order('inicio_anestesia', { ascending: false, nullsFirst: false })
        .limit(limite);

    // A lixeira é a mesma lista, do outro lado do `deleted_at`.
    consulta = lixeira ? consulta.not('deleted_at', 'is', null) : consulta.is('deleted_at', null);

    if (Array.isArray(unidades) && unidades.length > 0) consulta = consulta.in('unidade', unidades);
    else if (unidade) consulta = consulta.or(`unidade.eq."${unidade}",unidade.is.null`);

    if (status) consulta = consulta.eq('status', status);
    if (pacienteId) consulta = consulta.eq('paciente_id', pacienteId);
    if (dataInicio) consulta = consulta.or(`inicio_anestesia.gte.${dataInicio}T00:00:00,inicio_anestesia.is.null`);
    if (dataFim) consulta = consulta.or(`inicio_anestesia.lte.${dataFim}T23:59:59,inicio_anestesia.is.null`);

    return consulta;
}

/** Salva o cabeçalho, técnicas, ventilador e demais dados fora da linha do tempo. */
export async function salvarDados(fichaId, dados) {
    return supabase.from(TABELA).update({ dados }).eq('id', fichaId);
}

export async function salvarHorarios(fichaId, { inicioAnestesia, fimAnestesia }) {
    const alteracoes = {};
    if (inicioAnestesia !== undefined) alteracoes.inicio_anestesia = inicioAnestesia;
    if (fimAnestesia !== undefined) alteracoes.fim_anestesia = fimAnestesia;
    return supabase.from(TABELA).update(alteracoes).eq('id', fichaId);
}

/**
 * Finaliza e assina. Quem assina é sempre o usuário logado no momento.
 * Envia a fila antes: nada pode ficar de fora do documento assinado.
 */
export async function finalizarFicha(fichaId, { usuarioId, usuarioNome, fimAnestesia = null }) {
    const fila = await sincronizarFila(fichaId);
    if (!fila.enviados && fila.pendentes > 0) {
        return { data: null, error: new Error('Há registros ainda não enviados. Reconecte antes de finalizar a ficha.') };
    }

    return supabase
        .from(TABELA)
        .update({
            status: 'finalizada',
            ...(fimAnestesia ? { fim_anestesia: fimAnestesia } : {}),
            assinada_em: new Date().toISOString(),
            assinada_por: usuarioId || null,
            assinada_por_nome: usuarioNome || null
        })
        .eq('id', fichaId)
        .select()
        .single();
}

/**
 * Reabre uma ficha finalizada. Exige motivo — o banco recusa reabertura sem
 * registro de quem reabriu e por quê.
 *
 * Quem reabre fica com o caso: é quem vai corrigir e assinar de novo. Sem isso a
 * ficha voltaria a andar na mão do responsável anterior, que pode nem estar mais
 * no hospital.
 */
export async function reabrirFicha(fichaId, { motivo, usuarioId, usuarioNome }) {
    if (!motivo?.trim()) {
        return { data: null, error: new Error('Informe o motivo da reabertura.') };
    }

    const { data: atual, error: erroLeitura } = await supabase
        .from(TABELA).select('reaberturas, passagens, responsavel_id, responsavel_nome, responsavel_desde').eq('id', fichaId).single();
    if (erroLeitura) return { data: null, error: erroLeitura };

    const agora = new Date().toISOString();
    const reaberturas = [
        ...(atual?.reaberturas || []),
        { motivo: motivo.trim(), autor_id: usuarioId || null, autor_nome: usuarioNome || null, reaberta_em: agora }
    ];

    const trocouDeMao = usuarioId && atual?.responsavel_id !== usuarioId;
    const passagens = trocouDeMao
        ? [...(atual?.passagens || []), {
            de_id: atual?.responsavel_id || null,
            de_nome: atual?.responsavel_nome || null,
            para_id: usuarioId,
            para_nome: usuarioNome || null,
            assumida_em: agora,
            motivo: `Reabertura da ficha: ${motivo.trim()}`
        }]
        : (atual?.passagens || []);

    return supabase
        .from(TABELA)
        .update({
            status: 'em_andamento',
            reaberturas,
            passagens,
            ...(trocouDeMao ? { responsavel_id: usuarioId, responsavel_nome: usuarioNome || null } : {}),
            passagem_para_id: null,
            passagem_para_nome: null
        })
        .eq('id', fichaId)
        .select()
        .single();
}

/* -------------------------------------------------------------------------- */
/* Responsável pelo caso                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Indica quem deve assumir o caso na troca de plantão.
 *
 * A ficha continua com o responsável atual: ele segue registrando até o outro
 * assumir de fato. Nada de buraco entre "avisei" e "pegou".
 */
export async function indicarProximoResponsavel(fichaId, { paraId, paraNome }) {
    return supabase
        .from(TABELA)
        .update({ passagem_para_id: paraId || null, passagem_para_nome: paraNome || null })
        .eq('id', fichaId)
        .select()
        .single();
}

/**
 * Assume o caso. A partir daqui é esta pessoa que registra na ficha — e só a
 * partir daqui: o trecho anterior é de quem estava com o paciente naquela hora,
 * e o banco recusa registro, correção ou remoção antes do momento da passagem.
 *
 * Com indicação do responsável, é a troca de plantão combinada. Sem indicação —
 * o anestesista saiu, passou mal, esqueceu de passar —, ainda é possível
 * assumir, mas o motivo é obrigatório e fica na ficha: o banco recusa passagem
 * sem justificativa.
 */
export async function assumirFicha(fichaId, { usuarioId, usuarioNome, motivo = '' }) {
    if (!usuarioId) return { data: null, error: new Error('Não foi possível identificar quem está assumindo o caso.') };

    const { data: atual, error: erroLeitura } = await supabase
        .from(TABELA)
        .select('status, responsavel_id, responsavel_nome, passagem_para_id, passagens')
        .eq('id', fichaId)
        .single();
    if (erroLeitura) return { data: null, error: erroLeitura };

    if (atual.status !== 'em_andamento') {
        return { data: null, error: new Error('Ficha finalizada não troca de responsável.') };
    }
    if (atual.responsavel_id === usuarioId) {
        return { data: null, error: new Error('Este caso já está com você.') };
    }

    const indicado = atual.passagem_para_id === usuarioId;
    if (!indicado && !motivo.trim()) {
        return { data: null, error: new Error('Sem indicação do anestesista responsável, informe o motivo para assumir o caso.') };
    }

    const passagens = [...(atual.passagens || []), {
        de_id: atual.responsavel_id || null,
        de_nome: atual.responsavel_nome || null,
        para_id: usuarioId,
        para_nome: usuarioNome || null,
        assumida_em: new Date().toISOString(),
        ...(indicado ? {} : { motivo: motivo.trim() })
    }];

    return supabase
        .from(TABELA)
        .update({
            responsavel_id: usuarioId,
            responsavel_nome: usuarioNome || null,
            passagem_para_id: null,
            passagem_para_nome: null,
            // A partir daqui a ficha é dele — e só daqui para frente. O que o
            // colega registrou antes continua sendo do colega.
            responsavel_desde: new Date().toISOString(),
            passagens
        })
        .eq('id', fichaId)
        .select()
        .single();
}

/** Complemento após a finalização, sem reabrir a ficha. */
export async function adicionarAdendo(fichaId, { texto, usuarioId, usuarioNome }) {
    if (!texto?.trim()) return { data: null, error: new Error('Adendo vazio.') };

    const { data: atual, error: erroLeitura } = await supabase
        .from(TABELA).select('adendos').eq('id', fichaId).single();
    if (erroLeitura) return { data: null, error: erroLeitura };

    const adendos = [
        ...(atual?.adendos || []),
        { texto: texto.trim(), autor_id: usuarioId || null, autor_nome: usuarioNome || null, criado_em: new Date().toISOString() }
    ];

    return supabase.from(TABELA).update({ adendos }).eq('id', fichaId).select().single();
}

/* -------------------------------------------------------------------------- */
/* APA de origem                                                               */
/* -------------------------------------------------------------------------- */

/** Só os dígitos, para comparar CPF gravado com e sem máscara. */
function apenasDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}

/**
 * Procura APAs do paciente para alimentar a ficha.
 *
 * A tabela `surgeries` não guarda `pacienteId`, então quando a ficha nasce da
 * fila a busca é por CPF e, em último caso, por nome. Nome é indício fraco:
 * por isso a função devolve `confianca`, e a tela pede confirmação antes de
 * importar qualquer dado clínico — puxar a APA do paciente errado seria pior
 * do que não puxar nada.
 *
 * @returns {{apas: Array, confianca: 'alta'|'media'|'nenhuma'}}
 */
export async function buscarApasDoPaciente({ pacienteId = null, cpf = null, nome = null }) {
    const selecao = '*';

    if (pacienteId) {
        const { data } = await supabase.from('apas').select(selecao)
            .eq('pacienteId', pacienteId).is('deleted_at', null);
        if (data?.length) return { apas: data, confianca: 'alta' };
    }

    const cpfLimpo = apenasDigitos(cpf);
    if (cpfLimpo.length === 11) {
        const { data } = await supabase.from('apas').select(selecao)
            .is('deleted_at', null).ilike('cpf', `%${cpfLimpo.slice(0, 3)}%`);
        const casadas = (data || []).filter(apa => apenasDigitos(apa.cpf) === cpfLimpo);
        if (casadas.length) return { apas: casadas, confianca: 'alta' };
    }

    if (nome?.trim()) {
        const { data } = await supabase.from('apas').select(selecao)
            .is('deleted_at', null).ilike('nome', nome.trim());
        if (data?.length) return { apas: data, confianca: 'media' };
    }

    return { apas: [], confianca: 'nenhuma' };
}

/**
 * Traz a ficha de volta da lixeira.
 *
 * Nada é apagado de verdade e nada expira sozinho — ao contrário da APA, que se
 * apaga em definitivo 60 dias depois de ir para a lixeira. Ficha anestésica é
 * documento médico-legal: sumir por contagem de dias é pior do que ocupar espaço.
 */
export async function restaurarFicha(fichaId) {
    return supabase.from(TABELA).update({ deleted_at: null }).eq('id', fichaId).select().single();
}

/** Exclusão lógica: o banco não expõe DELETE para a ficha. */
export async function excluirFicha(fichaId) {
    return supabase.from(TABELA).update({ deleted_at: new Date().toISOString() }).eq('id', fichaId);
}
