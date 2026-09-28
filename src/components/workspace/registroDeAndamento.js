// ============================================================================
// Carimbo de quem escreveu e quando, nas Observações e andamento da tarefa.
//
// A caixa de observações é o histórico da pendência: várias pessoas escrevem
// nela ao longo de dias. Sem data e autor, o texto vira um bloco anônimo em que
// ninguém sabe quem disse o quê nem quando — e é justamente isso que se quer
// provar depois ("quando foi que avisaram que o repasse tinha caído?").
//
// O carimbo é texto comum, em negrito: fica no conteúdo da página como
// qualquer outra linha, sai na impressão e não depende de nenhuma coluna nova.
// ============================================================================

const doisDigitos = (n) => String(n).padStart(2, '0');

/** "08/09/2026 14:32" no fuso de quem está escrevendo. */
export function agoraFormatado(d = new Date()) {
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} `
    + `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** Nome curto de quem está logado — cai no e-mail e, no limite, em "Usuário". */
export function nomeDoAutor(currentUser) {
  return currentUser?.name || currentUser?.email || 'Usuário';
}

/**
 * Conteúdo inline do carimbo: "08/09/2026 14:32 · FULANO — " em negrito,
 * pronto para virar (ou abrir) um parágrafo do editor.
 */
export function carimboDeRegistro(currentUser, sufixo = '', quando = new Date()) {
  return [{
    type: 'text',
    text: `${agoraFormatado(quando)} · ${nomeDoAutor(currentUser)} — ${sufixo}`,
    styles: { bold: true },
  }];
}
