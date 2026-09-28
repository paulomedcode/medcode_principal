// ============================================================================
// Pedido de "abra esta tarefa" entre a página do Compromisso e a tabela.
//
// Clicar num aviso do sino precisa abrir A TAREFA, não só o módulo. Só que a
// tarefa é uma LINHA de um database, e quem sabe abrir uma linha é o
// DatabaseView — que nem existe ainda no momento do clique: ele nasce dentro do
// editor de blocos, depois que a página do database termina de carregar.
//
// Daí este intermediário mínimo: a página anota o pedido, e o DatabaseView o
// pega quando estiver de pé (e reconhecer a linha como sua). O pedido fica
// guardado até alguém atender, então a ordem de montagem não importa.
// ============================================================================

let pendente = null;
const ouvintes = new Set();

/** Pede que a linha `rowId` seja aberta assim que possível. */
export function pedirAberturaDeTarefa(rowId) {
  if (!rowId) return;
  pendente = rowId;
  ouvintes.forEach((fn) => { try { fn(rowId); } catch (e) { console.error(e); } });
}

/** Quem sabe abrir linhas assina aqui. Recebe também um pedido já pendente. */
export function assinarAberturaDeTarefa(fn) {
  ouvintes.add(fn);
  if (pendente) fn(pendente);
  return () => ouvintes.delete(fn);
}

/** Atendido: ninguém mais precisa abrir esta linha. */
export function pedidoAtendido(rowId) {
  if (pendente === rowId) pendente = null;
}
