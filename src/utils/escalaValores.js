/*
 * Cálculo do valor do plantão — fonte única.
 *
 * Estas quatro funções decidem quanto um plantão vale e como ele é descrito na
 * folha de ponto. Elas viviam duplicadas: uma cópia dentro de Escala.jsx (para
 * a grade e os modais) e outra dentro de folhaAssinaturas.js (para o hash da
 * assinatura). Duas cópias de uma regra de dinheiro é exatamente o tipo de
 * coisa que diverge calada — bastaria alguém ajustar o cálculo do repasse num
 * lugar para o valor assinado deixar de bater com o valor exibido.
 *
 * Agora quem precisa saber quanto vale um plantão pergunta aqui: a Escala, a
 * folha de ponto, o PDF, a assinatura e a tela do médico (Meus Repasses).
 */

// Uma linha do "Mais Opções": o repasse é percentual do que se recebe, ou um
// valor digitado à mão. Nunca os dois.
export const calcRepasseItem = (it) => it?.repMode === 'manual'
    ? (parseFloat(it.repValor) || 0)
    : (parseFloat(it?.receber) || 0) * ((parseFloat(it?.repPct) || 0) / 100);

export const sumRepasses = (a) => (a?.financial?.extraItems || []).reduce((s, it) => s + calcRepasseItem(it), 0);

// Total do plantão para a folha de ponto e os relatórios: base + extra +
// repasses das linhas do "Mais Opções" (quando ticado, o base é zerado e o que
// vale é o repasse).
export const getAssignmentTotal = (a) => (parseFloat(a?.financial?.baseValue) || 0) + (parseFloat(a?.financial?.extraValue) || 0) + sumRepasses(a);

// Descrição do plantão "Outros" na folha: as descrições das linhas do Mais
// Opções; senão o subtítulo; senão as observações.
export const getOutrosDescricao = (a) => {
    const descs = (a?.financial?.extraItems || []).map(it => (it.descricao || '').trim()).filter(Boolean);
    if (descs.length > 0) return descs.join(' • ');
    return a?.subtitle || a?.financial?.observations || '-';
};

// Mesma conta, a partir da LINHA CRUA de escala_plantoes (colunas do banco),
// e não do objeto montado pela tela. Usada por quem lê a tabela direto:
// a assinatura da folha e a tela Meus Repasses.
export const rowTotal = (row) => {
    const repasses = (row?.extra_items || []).reduce((s, it) => s + calcRepasseItem(it), 0);
    return (parseFloat(row?.financial_base) || 0) + (parseFloat(row?.financial_extra) || 0) + repasses;
};
