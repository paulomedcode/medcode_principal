/**
 * Espelho local do que está sendo digitado na ficha.
 *
 * Os registros da grade já têm fila offline própria; o que faltava proteger era
 * o resto — cabeçalho, descrição do ato anestésico, ventilador, destino. Isso só
 * ia para o banco quando alguém lembrava de clicar em Salvar, e tablet
 * descarregado no meio da cirurgia levava tudo junto.
 *
 * Aqui a regra é simples: a cada tecla o conteúdo é copiado para o aparelho, e
 * só some depois que o banco confirmar. Ao reabrir a ficha, um espelho mais novo
 * que o banco vira oferta de restauração — nunca sobrescrita automática, porque
 * o que está no banco pode ser de outro aparelho e mais completo.
 */

const PREFIXO = 'fa_dados_';

function chave(fichaId) {
    return `${PREFIXO}${fichaId}`;
}

export function gravarRascunho(fichaId, conteudo) {
    if (!fichaId) return;
    try {
        localStorage.setItem(chave(fichaId), JSON.stringify({ em: new Date().toISOString(), conteudo }));
    } catch (erro) {
        console.warn('[fichaAnestesica] não foi possível guardar o rascunho local:', erro);
    }
}

/** @returns {{em: string, conteudo: object}|null} */
export function lerRascunho(fichaId) {
    if (!fichaId) return null;
    try {
        const bruto = localStorage.getItem(chave(fichaId));
        if (!bruto) return null;
        const dados = JSON.parse(bruto);
        return dados?.conteudo ? dados : null;
    } catch {
        return null;
    }
}

export function limparRascunho(fichaId) {
    try {
        localStorage.removeItem(chave(fichaId));
    } catch { /* localStorage indisponível */ }
}

/**
 * O espelho só interessa se for mais novo que o banco: se o servidor já tem
 * versão igual ou posterior, o que está aqui é sobra de um salvamento que deu
 * certo.
 */
export function rascunhoMaisNovo(rascunho, atualizadoEm) {
    if (!rascunho?.em) return false;
    if (!atualizadoEm) return true;

    const local = new Date(rascunho.em).getTime();
    const servidor = new Date(atualizadoEm).getTime();
    if (Number.isNaN(local) || Number.isNaN(servidor)) return false;

    // Um segundo de folga: relógio de tablet e de servidor não batem no milissegundo.
    return local > servidor + 1000;
}
