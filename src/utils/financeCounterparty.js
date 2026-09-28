// "Origem / Destino" — conceito unificado de contraparte no financeiro.
//
// Regra de negócio (definida pelo usuário):
//   - Nas categorias "Repasse Médico" e "Coordenação" a contraparte é um MÉDICO
//     (puxa da lista de médicos → doctor_id).
//   - Em todas as demais categorias a contraparte é o FORNECEDOR/PAGADOR
//     (puxa da lista de parties → party_id).
//
// Não altera o banco: continua havendo doctor_id e party_id. A UI apenas
// apresenta um único campo/coluna "Origem/Destino" e decide de onde puxar/gravar
// conforme a categoria escolhida.

const norm = (s) => (s || '')
  .toString()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '') // remove acentos (combining marks)
  .toLowerCase();

// Uma categoria usa MÉDICO como contraparte? (Repasse Médico / Coordenação)
export function isDoctorCategory(categoryName) {
  const n = norm(categoryName);
  if (!n) return false;
  return n.includes('repasse medico') || n.includes('coordena');
}

// Rótulo do campo conforme o tipo do lançamento.
//   ENTRADA (dinheiro que entra) → quem originou o dinheiro = "Origem"
//   SAIDA   (dinheiro que sai)   → para onde foi o dinheiro   = "Destino"
export function counterpartyLabel(type) {
  return type === 'ENTRADA' ? 'Origem' : 'Destino';
}

// Nome a exibir para a contraparte de um lançamento já carregado (com joins).
// Aceita tanto o formato do Supabase (finance_parties/users) quanto campos soltos.
export function counterpartyName(tx) {
  if (!tx) return '';
  const category = tx.finance_categories?.name || tx.category_name || tx.category;
  const doctorName = tx.users?.name || tx.doctor_name;
  const partyName = tx.finance_parties?.name || tx.party_name;
  // Se a categoria é de médico e há médico vinculado, ele é a contraparte.
  if (isDoctorCategory(category) && doctorName) return doctorName;
  // Caso geral: fornecedor/pagador; se faltar, cai para o médico (se houver).
  return partyName || doctorName || '';
}
