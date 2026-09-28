import { supabase } from './supabase';

/**
 * Acesso ao catálogo de regras de conduta medicamentosa da APA.
 *
 * Degradação limpa: se a tabela ainda não existir no banco deste hospital
 * (migration não aplicada), as funções de leitura devolvem lista vazia e a APA
 * segue funcionando exatamente como antes, apenas sem os alertas.
 */

const TABELA = 'apa_regras_medicamento';

let cacheRegrasAtivas = null;

/** Converte a linha do banco no formato que o motor espera. */
function paraRegra(linha) {
    return {
        id: linha.id,
        codigo: linha.codigo,
        ativo: linha.ativo,
        ordem: linha.ordem,
        classe: linha.classe,
        termos: Array.isArray(linha.termos) ? linha.termos : [],
        conduta: linha.conduta,
        texto: linha.texto || '',
        nivel: linha.nivel,
        contexto: linha.contexto,
        clcr_faixas: linha.clcr_faixas || null,
        referencia: linha.referencia || '',
        revisado: !!linha.revisado,
        revisado_por: linha.revisado_por || '',
        revisado_em: linha.revisado_em || null
    };
}

function tabelaAusente(error) {
    return error?.code === '42P01' || /does not exist/i.test(error?.message || '');
}

/** Regras ativas, para uso na avaliação. Cacheado durante a sessão. */
export async function carregarRegrasAtivas({ force = false } = {}) {
    if (cacheRegrasAtivas && !force) return cacheRegrasAtivas;

    const { data, error } = await supabase
        .from(TABELA)
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

    if (error) {
        if (!tabelaAusente(error)) console.warn('[apaRegras] falha ao carregar regras:', error.message);
        return [];
    }

    cacheRegrasAtivas = (data || []).map(paraRegra);
    return cacheRegrasAtivas;
}

/** Todas as regras, inclusive inativas — para a tela de cadastro. */
export async function listarTodasRegras() {
    const { data, error } = await supabase
        .from(TABELA)
        .select('*')
        .order('ordem', { ascending: true });

    if (error) {
        if (!tabelaAusente(error)) console.warn('[apaRegras] falha ao listar regras:', error.message);
        return { regras: [], erro: error };
    }
    return { regras: (data || []).map(paraRegra), erro: null };
}

/** Cria ou atualiza uma regra. Invalida o cache de leitura. */
export async function salvarRegra(regra) {
    const payload = {
        codigo: regra.codigo,
        ativo: regra.ativo !== false,
        ordem: Number(regra.ordem) || 100,
        classe: regra.classe,
        termos: regra.termos,
        conduta: regra.conduta,
        texto: regra.texto || '',
        nivel: regra.nivel === 'alta' ? 'alta' : 'atencao',
        contexto: regra.contexto === 'neuroeixo' ? 'neuroeixo' : 'sempre',
        clcr_faixas: regra.clcr_faixas || null,
        referencia: regra.referencia || null,
        revisado: !!regra.revisado,
        revisado_por: regra.revisado_por || null,
        revisado_em: regra.revisado_em || null
    };

    const resposta = regra.id
        ? await supabase.from(TABELA).update(payload).eq('id', regra.id).select().single()
        : await supabase.from(TABELA).insert([payload]).select().single();

    cacheRegrasAtivas = null;
    return resposta;
}

export async function excluirRegra(id) {
    const resposta = await supabase.from(TABELA).delete().eq('id', id);
    cacheRegrasAtivas = null;
    return resposta;
}

export function invalidarCacheRegras() {
    cacheRegrasAtivas = null;
}
