import { supabase } from './supabase';
import { TEXTOS_EXAME_FABRICA } from '../config/apaExamePadrao';

/**
 * Laudos padrão do exame físico normal, guardados em settings.
 * Mesmo padrão key-value já usado por 'orientacoes' e 'medicas'.
 */

const CHAVE = 'apa_exame_padrao';

/** Sempre devolve todos os campos: o que não estiver salvo cai no valor de fábrica. */
export async function carregarTextosExame() {
    const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('id', CHAVE)
        .maybeSingle();

    if (error) {
        console.warn('[apaExamePadrao] falha ao carregar:', error.message);
        return { ...TEXTOS_EXAME_FABRICA };
    }

    return { ...TEXTOS_EXAME_FABRICA, ...(data?.data || {}) };
}

export async function salvarTextosExame(textos) {
    return supabase.from('settings').upsert({ id: CHAVE, data: textos });
}
