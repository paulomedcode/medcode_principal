/**
 * Preferências da Ficha Anestésica que valem por aparelho, não por usuário.
 *
 * O tablet da sala e o desktop da secretária não pedem a mesma coisa: de luva, em
 * pé, o teclado na tela é o que funciona; no desktop ele só ocupa espaço na frente
 * da grade. Por isso a escolha mora no aparelho e não acompanha o login.
 */

const CHAVE_TECLADO = 'fa_teclado_na_tela';

/** Sem ponteiro fino (tablet, celular), o teclado na tela nasce ligado. */
function ehAparelhoDeToque() {
    try {
        return window.matchMedia('(pointer: coarse)').matches;
    } catch {
        return false;
    }
}

export function lerTecladoNaTela() {
    try {
        const gravado = localStorage.getItem(CHAVE_TECLADO);
        if (gravado === 'sim') return true;
        if (gravado === 'nao') return false;
    } catch { /* localStorage indisponível */ }
    return ehAparelhoDeToque();
}

export function gravarTecladoNaTela(ativo) {
    try {
        localStorage.setItem(CHAVE_TECLADO, ativo ? 'sim' : 'nao');
    } catch (erro) {
        console.warn('[fichaAnestesica] não foi possível gravar a preferência de teclado:', erro);
    }
}
