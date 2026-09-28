// ============================================================================
// Carimbo automático de autoria nas Observações e andamento.
//
// Assim que a pessoa começa a escrever uma anotação nova, a linha já nasce com
// "08/09/2026 14:32 · FULANO — " em negrito. O objetivo é o histórico se
// escrever sozinho: ninguém lembra de datar o próprio comentário, e semanas
// depois é impossível saber quem disse o quê.
//
// Duas regras seguram o carimbo para ele não virar praga:
//
//   • UMA VEZ POR ABERTURA. Carimba na primeira tecla e cala a boca. A pessoa
//     escreve o parágrafo inteiro, dá Enter, continua — nada de novo carimbo.
//     Fechou a tarefa e voltou depois para escrever outra coisa? Aí sim.
//
//   • SÓ EM LINHA VAZIA. Se o cursor está no meio de um texto que já existe, a
//     pessoa está corrigindo, não registrando — carimbar ali cravaria a data no
//     meio da frase de outra pessoa.
//
// A intercepção é `handleTextInput` (e não o onChange do editor) porque ela
// acontece ANTES do caractere entrar: carimbo e primeira letra saem na mesma
// transação, então não existe o intervalo em que o texto aparece sem autoria.
// ============================================================================
import { Plugin, PluginKey } from 'prosemirror-state';

export const CARIMBO_KEY = new PluginKey('ws-carimbo-autoria');

/**
 * @param obterCarimbo () => string  — texto do carimbo ("data · nome — ")
 * @param jaCarimbou   () => boolean — se esta abertura já registrou o autor
 * @param aoCarimbar   () => void    — avisa que carimbou (fecha a janela)
 */
export function criarCarimboDeAutoria({ obterCarimbo, jaCarimbou, aoCarimbar }) {
  return new Plugin({
    key: CARIMBO_KEY,
    props: {
      handleTextInput: (view, from, to, text) => {
        if (jaCarimbou()) return false;

        // Linha vazia = anotação nova. Qualquer outra coisa é edição.
        const { $from } = view.state.selection;
        if (!$from.parent.isTextblock || $from.parent.content.size > 0) return false;

        const carimbo = obterCarimbo();
        if (!carimbo) return false;

        const { schema } = view.state;
        const negrito = schema.marks.bold ? [schema.marks.bold.create()] : undefined;
        const tr = view.state.tr.replaceWith(from, to, [
          schema.text(carimbo, negrito),
          schema.text(text),
        ]);
        // Sem isto o negrito do carimbo pegaria carona no resto da frase.
        tr.setStoredMarks([]);
        view.dispatch(tr.scrollIntoView());

        aoCarimbar();
        return true; // o caractere já entrou junto com o carimbo
      },
    },
  });
}
