import { supabase } from './supabase';

/**
 * Catálogos da Ficha Anestésica: linhas da grade e fármacos.
 * Carregados uma vez por sessão — mudam raramente e são pequenos.
 */

let cacheParametros = null;
let cacheFarmacos = null;
let cacheNarrativas = null;

function avisar(contexto, error) {
    if (error?.code !== '42P01') console.warn(`[faCatalogos] ${contexto}:`, error.message);
}

/** Linhas da grade, agrupadas por seção na ordem de exibição. */
export async function carregarParametros({ force = false } = {}) {
    if (cacheParametros && !force) return cacheParametros;

    const { data, error } = await supabase
        .from('fa_parametros')
        .select('*')
        .eq('ativo', true)
        .order('secao', { ascending: true })
        .order('ordem', { ascending: true });

    if (error) {
        avisar('falha ao carregar parâmetros', error);
        return [];
    }

    cacheParametros = data || [];
    return cacheParametros;
}

/** Fármacos de dose única, já na ordem de classe e nome. */
export async function carregarFarmacos({ force = false } = {}) {
    if (cacheFarmacos && !force) return cacheFarmacos;

    const { data, error } = await supabase
        .from('fa_farmacos')
        .select('*')
        .eq('ativo', true)
        .order('ordem_classe', { ascending: true })
        .order('ordem', { ascending: true });

    if (error) {
        avisar('falha ao carregar fármacos', error);
        return [];
    }

    cacheFarmacos = data || [];
    return cacheFarmacos;
}

/** Agrupa os parâmetros por seção, preservando a ordem. */
export function agruparPorSecao(parametros) {
    return (parametros || []).reduce((mapa, parametro) => {
        (mapa[parametro.secao] = mapa[parametro.secao] || []).push(parametro);
        return mapa;
    }, {});
}

/** Agrupa os fármacos por classe, para o seletor. */
export function agruparPorClasse(farmacos) {
    const mapa = new Map();
    (farmacos || []).forEach(farmaco => {
        if (!mapa.has(farmaco.classe)) mapa.set(farmaco.classe, []);
        mapa.get(farmaco.classe).push(farmaco);
    });
    return [...mapa.entries()].map(([classe, itens]) => ({ classe, itens }));
}

/* -------------------------------------------------------------------------- */
/* Manutenção dos catálogos (tela de Configurações)                            */
/* -------------------------------------------------------------------------- */

function codigoDe(texto) {
    return String(texto || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);
}

/** Todos os parâmetros, inclusive inativos. */
export async function listarParametros() {
    const { data, error } = await supabase
        .from('fa_parametros')
        .select('*')
        .order('secao', { ascending: true })
        .order('ordem', { ascending: true });

    if (error) {
        avisar('falha ao listar parâmetros', error);
        return { parametros: [], erro: error };
    }
    return { parametros: data || [], erro: null };
}

export async function salvarParametro(parametro) {
    const payload = {
        codigo: parametro.codigo?.trim() || codigoDe(parametro.rotulo),
        rotulo: parametro.rotulo,
        secao: parametro.secao,
        tipo: parametro.tipo,
        unidade: parametro.unidade || '',
        valor_padrao: parametro.valor_padrao || null,
        sinal: parametro.tipo === 'fluido' ? parametro.sinal : null,
        faixa_min: parametro.faixa_min ?? null,
        faixa_max: parametro.faixa_max ?? null,
        opcoes: parametro.tipo === 'lista' ? (parametro.opcoes || []) : [],
        apresentacao: parametro.apresentacao || null,
        diluicao_padrao: parametro.diluicao_padrao ?? null,
        diluicao_unidade: parametro.diluicao_unidade || null,
        ordem: Number(parametro.ordem) || 100,
        ativo: parametro.ativo !== false
    };

    const resposta = parametro.id
        ? await supabase.from('fa_parametros').update(payload).eq('id', parametro.id).select().single()
        : await supabase.from('fa_parametros').insert([payload]).select().single();

    cacheParametros = null;
    return resposta;
}

export async function excluirParametro(id) {
    const resposta = await supabase.from('fa_parametros').delete().eq('id', id);
    cacheParametros = null;
    return resposta;
}

/** Todos os fármacos, inclusive inativos. */
export async function listarFarmacos() {
    const { data, error } = await supabase
        .from('fa_farmacos')
        .select('*')
        .order('ordem_classe', { ascending: true })
        .order('ordem', { ascending: true });

    if (error) {
        avisar('falha ao listar fármacos', error);
        return { farmacos: [], erro: error };
    }
    return { farmacos: data || [], erro: null };
}

export async function salvarFarmaco(farmaco) {
    const payload = {
        codigo: farmaco.codigo?.trim() || codigoDe(farmaco.nome),
        nome: farmaco.nome,
        rotulo_curto: farmaco.rotulo_curto?.trim() || farmaco.nome,
        classe: farmaco.classe || 'Outros',
        ordem_classe: Number(farmaco.ordem_classe) || 99,
        unidade: farmaco.unidade || 'mg',
        via_padrao: farmaco.via_padrao || 'IV',
        ordem: Number(farmaco.ordem) || 100,
        ativo: farmaco.ativo !== false
    };

    const resposta = farmaco.id
        ? await supabase.from('fa_farmacos').update(payload).eq('id', farmaco.id).select().single()
        : await supabase.from('fa_farmacos').insert([payload]).select().single();

    cacheFarmacos = null;
    return resposta;
}

export async function excluirFarmaco(id) {
    const resposta = await supabase.from('fa_farmacos').delete().eq('id', id);
    cacheFarmacos = null;
    return resposta;
}

/* -------------------------------------------------------------------------- */
/* Modelos de descrição do ato anestésico                                      */
/* -------------------------------------------------------------------------- */

/** Modelos ativos, usados ao gerar a descrição. */
export async function carregarNarrativas({ force = false } = {}) {
    if (cacheNarrativas && !force) return cacheNarrativas;

    const { data, error } = await supabase
        .from('fa_narrativas')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

    if (error) {
        avisar('falha ao carregar modelos de descrição', error);
        return [];
    }

    cacheNarrativas = data || [];
    return cacheNarrativas;
}

/** Todos os modelos, inclusive inativos — para a tela de cadastro. */
export async function listarNarrativas() {
    const { data, error } = await supabase
        .from('fa_narrativas')
        .select('*')
        .order('origem', { ascending: true })
        .order('ordem', { ascending: true });

    if (error) {
        avisar('falha ao listar modelos', error);
        return { narrativas: [], erro: error };
    }
    return { narrativas: data || [], erro: null };
}

function codigoDoTitulo(titulo) {
    return String(titulo || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);
}

export async function salvarNarrativa(modelo) {
    const payload = {
        codigo: modelo.codigo?.trim() || codigoDoTitulo(modelo.titulo),
        titulo: modelo.titulo,
        origem: modelo.origem === 'procedimento' ? 'procedimento' : 'tecnica',
        chave: modelo.origem === 'procedimento' ? modelo.chave : null,
        termos: modelo.origem === 'tecnica' ? (modelo.termos || []) : [],
        texto: modelo.texto,
        ordem: Number(modelo.ordem) || 100,
        ativo: modelo.ativo !== false
    };

    const resposta = modelo.id
        ? await supabase.from('fa_narrativas').update(payload).eq('id', modelo.id).select().single()
        : await supabase.from('fa_narrativas').insert([payload]).select().single();

    cacheNarrativas = null;
    return resposta;
}

export async function excluirNarrativa(id) {
    const resposta = await supabase.from('fa_narrativas').delete().eq('id', id);
    cacheNarrativas = null;
    return resposta;
}

export function invalidarCacheCatalogos() {
    cacheParametros = null;
    cacheFarmacos = null;
    cacheNarrativas = null;
}
