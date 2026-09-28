// ============================================================================
// Trava do quadro (bloco de database) dentro do editor.
//
// O quadro é um bloco como outro qualquer para o editor: uma tecla Backspace
// insistente no fim da página chegava nele e o apagava sem perguntar nada —
// e junto ia a tabela inteira da vista de quem estava lendo. Um quadro não é
// um parágrafo: sai só por decisão explícita.
//
// A trava é uma transação filtrada no ProseMirror, e não um `keydown` na tela,
// porque assim ela vale para TODOS os caminhos: Backspace, Delete, selecionar
// tudo e apagar, recortar (Ctrl+X), arrastar para fora. Qualquer transação que
// diminua o número de quadros é recusada, a menos que venha do botão Excluir
// (que passa por `removerQuadro`).
// ============================================================================
import { Plugin, PluginKey } from 'prosemirror-state';

export const TIPO_QUADRO = 'linked_database';
export const TRAVA_QUADRO_KEY = new PluginKey('ws-trava-quadro');

// Só é `true` durante a chamada síncrona de `removerQuadro`. Não é estado de
// tela: é uma janela de uma transação, aberta e fechada no mesmo instante.
let removendoDePropósito = false;

function contarQuadros(doc) {
  let n = 0;
  doc.descendants((node) => { if (node.type.name === TIPO_QUADRO) n += 1; });
  return n;
}

export function criarTravaDeQuadro() {
  return new Plugin({
    key: TRAVA_QUADRO_KEY,
    filterTransaction: (tr, state) => {
      if (!tr.docChanged || removendoDePropósito) return true;
      return contarQuadros(tr.doc) >= contarQuadros(state.doc);
    },
  });
}

/** Única porta de saída de um quadro: o botão Excluir, já confirmado. */
export function removerQuadro(editor, block) {
  removendoDePropósito = true;
  try { editor.removeBlocks([block]); }
  finally { removendoDePropósito = false; }
}
