// Extensão explícita para o arquivo rodar também no node puro
// (scripts/test-permissoes.mjs), além do Vite.
import { ADMIN_KEY, findModuleByPermission, ehPermissaoPessoal } from '../config/permissions.js';

/**
 * Regra de acesso do sistema, em um lugar só.
 *
 * A matriz já dizia — e a própria tela avisa — que "módulo desligado: as
 * permissões acima ficam guardadas, mas não valem enquanto a porta de entrada
 * estiver fechada". Só que a checagem olhava a permissão isolada, então um
 * cargo com `Acessar Compromissos: false` e `Excluir Páginas: true` continuava
 * podendo excluir página se chegasse até lá.
 *
 * Aqui a promessa passa a valer: permissão fina exige a chave de acesso do
 * módulo. Isso também conserta a tela de extras, que marcava como "já vem do
 * Perfil" permissões que na prática não valiam — e travava o botão.
 *
 * Funções puras, sem React: dá para testar sem montar tela.
 */

/**
 * A chave que abre o módulo dono desta permissão.
 * @returns {string|null} null quando a permissão não pertence a módulo nenhum.
 */
export function chaveDeAcessoDe(permissao) {
    const modulo = findModuleByPermission(permissao);
    return modulo ? modulo.accessKey : null;
}

/**
 * O conjunto de permissões concede esta permissão?
 *
 * @param {object} concedidas  mapa permissão → booleano (do cargo, dos extras, ou da soma)
 * @param {string} permissao
 * @param {object} [opcoes]
 * @param {object} [opcoes.porta] onde procurar a chave de acesso, quando ela vem
 *        de outra origem — por exemplo, extra que depende da porta aberta pelo cargo.
 */
export function concede(concedidas, permissao, { porta = null } = {}) {
    const perms = concedidas || {};
    if (!perms[permissao]) return false;

    const chave = chaveDeAcessoDe(permissao);
    // Sem módulo dono (permissões avulsas e legadas) ou sendo a própria porta,
    // não há o que exigir além dela mesma.
    if (!chave || chave === permissao) return true;

    return !!(porta || perms)[chave] || !!(perms[chave]);
}

/**
 * Decide o acesso de um usuário, considerando cargo, extras e Acesso Total.
 *
 * @param {object} dados
 * @param {string} [dados.cargo]
 * @param {object} [dados.matriz]  matriz de permissões por cargo
 * @param {object} [dados.extras]  permissões individuais do usuário
 * @param {string} dados.permissao
 */
export function podeAcessar({ cargo, matriz = {}, extras = {}, permissao }) {
    const papel = String(cargo || 'Visualizador');
    const doCargo = matriz[papel] || matriz[cargo] || {};

    /*
     * Módulo PESSOAL (marcado com `pessoal: true` no catálogo) não é aberto por coringa nenhum.
     *
     * 'Acesso Total (Admin)' e o passe do Desenvolvedor existem para administrar
     * o sistema — e a tela pessoal de alguém não é uma área administrativa.
     * Aqui vale só a concessão explícita, do cargo ou dos extras.
     */
    if (ehPermissaoPessoal(permissao)) {
        return !!{ ...doCargo, ...(extras || {}) }[permissao];
    }

    // Desenvolvedor tem passe livre, como sempre teve.
    if (['desenvolvedor', 'developer'].includes(papel.toLowerCase())) return true;

    if (doCargo[ADMIN_KEY]) return true;

    // A porta pode ter sido aberta pelo cargo ou por um extra: o que vale é a
    // soma, senão liberar um módulo inteiro para uma pessoa exigiria mexer no cargo.
    const somadas = { ...doCargo, ...(extras || {}) };
    return concede(somadas, permissao);
}
