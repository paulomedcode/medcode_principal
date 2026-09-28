// ============================================================================
// Concluir um lembrete de fora do módulo Compromisso.
//
// O botão de concluir nasceu dentro do painel da tarefa, onde o editor de
// blocos está montado e devolve os blocos prontos. Na tela inicial não há
// editor nenhum: a pendência é uma linha de lista. Então o mesmo efeito é
// montado aqui, direto no banco — trocar o status e anexar a linha de registro
// ao conteúdo da página.
//
// É seguro escrever o conteúdo por fora justamente porque o editor não está
// aberto: dentro do Compromisso isso seria sobrescrito pelo autosave dele.
// ============================================================================
import * as ws from './workspace';
import { findStatusProp, findDoneOption } from '../components/workspace/databaseUtils';
import { carimboDeRegistro } from '../components/workspace/registroDeAndamento';

const novoId = () =>
  (globalThis.crypto?.randomUUID?.() || `blk-${Math.random().toString(36).slice(2)}-${Date.now()}`);

/** Parágrafo no formato do BlockNote, com todas as props que ele espera. */
const paragrafo = (conteudo) => ({
  id: novoId(),
  type: 'paragraph',
  props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
  content: conteudo,
  children: [],
});

/**
 * Marca a tarefa `rowId` como concluída e registra quem fez isso e quando.
 *
 * Devolve { ok: true } ou { ok: false, motivo } — nunca lança por causa de um
 * banco montado de outro jeito (sem coluna de status, sem opção "Concluído").
 * Quem chama decide o que dizer na tela.
 */
export async function concluirLembrete(rowId, currentUser) {
  const page = await ws.getPage(rowId);
  if (!page) return { ok: false, motivo: 'A tarefa não foi encontrada.' };
  if (!page.parent_id) return { ok: false, motivo: 'A tarefa não está num banco de dados.' };

  const props = await ws.listProperties(page.parent_id);
  const statusProp = findStatusProp(props);
  const opcao = findDoneOption(statusProp);
  if (!statusProp || !opcao) {
    return { ok: false, motivo: 'A coluna de status não tem uma opção de conclusão (ex.: "Concluído").' };
  }

  await ws.setRowValue(rowId, statusProp.id, opcao.id);

  // O registro é o que sobra depois: sem ele, semanas depois ninguém sabe quem
  // fechou a pendência. Se falhar, o status já mudou — e é melhor assim do que
  // deixar a pendência acesa por causa de um texto.
  try {
    const anterior = Array.isArray(page.content) ? page.content : [];
    const linha = paragrafo(carimboDeRegistro(currentUser, 'concluiu o lembrete.'));
    await ws.saveContent(rowId, [...anterior, linha]);
  } catch (e) {
    console.error('Lembrete concluído, mas o registro não foi gravado', e);
  }

  return { ok: true };
}
