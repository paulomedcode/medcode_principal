/**
 * Parser para arquivos OFX (Open Financial Exchange) no browser.
 * Suporta formatos com tags abertas (SGML clássico) e fechadas (XML).
 */
export function parseOFX(ofxText) {
  try {
    // 1. Remove quebras de linha desnecessárias e limpa o texto
    const cleanedText = ofxText.replace(/\r/g, '');

    // 2. Extrai os blocos de transação <STMTTRN>...</STMTTRN>
    const transactionRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    const transactions = [];
    let match;

    while ((match = transactionRegex.exec(cleanedText)) !== null) {
      const block = match[1];
      
      // Função auxiliar para extrair valor de uma tag, tratando tags abertas e fechadas
      const getTagValue = (tagName) => {
        // Tenta encontrar com tag de fechamento: <TAG>valor</TAG>
        const closedRegex = new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'i');
        const closedMatch = closedRegex.exec(block);
        if (closedMatch) return closedMatch[1].trim();

        // Tenta encontrar com tag aberta (padrão SGML): <TAG>valor até a próxima linha ou tag
        const openRegex = new RegExp(`<${tagName}>([^<\n]*)`, 'i');
        const openMatch = openRegex.exec(block);
        if (openMatch) return openMatch[1].trim();

        return null;
      };

      // Alguns bancos (ex.: Sisprime) repetem a tag <MEMO>: o 1º é o histórico
      // ("Crédito Transf C/C") e o 2º é a contraparte ("FULANO DE TAL").
      const getAllTagValues = (tagName) => {
        const re = new RegExp(`<${tagName}>([^<\n]*)`, 'gi');
        const out = []; let mm;
        while ((mm = re.exec(block)) !== null) { const v = mm[1].trim(); if (v) out.push(v); }
        return out;
      };

      const fitid = getTagValue('FITID');
      const trnamtStr = getTagValue('TRNAMT');
      const dtpostedStr = getTagValue('DTPOSTED');
      const nameTag = getTagValue('NAME');
      const memos = getAllTagValues('MEMO');
      // Histórico: prioriza <NAME>; senão o 1º <MEMO>.
      const name = nameTag || memos[0] || 'Transação Bancária';
      // Contraparte/complemento: se há <NAME>, os <MEMO> são complemento; senão
      // é do 2º <MEMO> em diante. "Sem complemento" é tratado como vazio.
      let memo = nameTag ? memos.join(' ') : memos.slice(1).join(' ');
      if (/^sem\s+complemento$/i.test(memo.trim())) memo = '';
      const trntype = getTagValue('TRNTYPE') || 'OTHER';

      if (!fitid || !trnamtStr || !dtpostedStr) {
        continue; // Pula transações inválidas ou incompletas
      }

      // Trata o valor numérico (corrige vírgulas para pontos se necessário)
      const amount = parseFloat(trnamtStr.replace(/,/g, '.'));

      // Trata a data (formato padrão OFX: YYYYMMDDHHMMSS ou YYYYMMDD)
      const dateStr = dtpostedStr.substring(0, 8); // Pega apenas "YYYYMMDD"
      let formattedDate = '';
      if (dateStr.length === 8) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        formattedDate = `${year}-${month}-${day}`;
      } else {
        formattedDate = new Date().toISOString().split('T')[0]; // fallback
      }

      transactions.push({
        fitid,
        amount,
        transaction_date: formattedDate,
        description: decodeHtmlEntities(name),
        memo: decodeHtmlEntities(memo),
        type: amount >= 0 ? 'ENTRADA' : 'SAIDA'
      });
    }

    return transactions;
  } catch (error) {
    console.error("Erro ao analisar arquivo OFX:", error);
    throw new Error("Formato do arquivo OFX inválido.");
  }
}

/**
 * Decodifica entidades HTML comuns em arquivos OFX de bancos brasileiros (ex: &amp; para &)
 */
function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/(\n|\r)+/g, ' ')
    .trim();
}
