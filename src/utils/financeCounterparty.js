// "Origem / Destino" — contraparte de um lançamento no financeiro: o cliente
// (em quem paga) ou o fornecedor (em quem recebe), do cadastro único de
// empresas/pessoas (finance_parties).

// Rótulo do campo conforme o tipo do lançamento.
//   ENTRADA (dinheiro que entra) → quem originou o dinheiro = "Origem"
//   SAIDA   (dinheiro que sai)   → para onde foi o dinheiro   = "Destino"
export function counterpartyLabel(type) {
  return type === 'ENTRADA' ? 'Origem' : 'Destino';
}

// Nome a exibir para a contraparte de um lançamento já carregado (com joins).
export function counterpartyName(tx) {
  if (!tx) return '';
  return tx.finance_parties?.name || tx.party_name || '';
}
