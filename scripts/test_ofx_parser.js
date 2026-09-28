import { parseOFX } from '../src/utils/ofxParser.js';

// OFX simulado (comum em bancos brasileiros com tags abertas)
const mockOFX = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>1
      <STATUS>
        <CODE>0
        <SEVERITY>INFO
      </STATUS>
      <STMTRS>
        <CURDEF>BRL
        <BANKTRANLIST>
          <DTSTART>20260401
          <DTEND>20260430
          
          <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20260410120000[-3:BRT]
            <TRNAMT>-150.00
            <FITID>20260410001
            <CHECKNUM>001
            <MEMO>PAGAMENTO FORNECEDOR MEDICAMENTO
          </STMTTRN>
          
          <STMTTRN>
            <TRNTYPE>CREDIT
            <DTPOSTED>20260415120000
            <TRNAMT>2500.00
            <FITID>20260415002
            <NAME>FATURAMENTO UNIMED ANES
            <MEMO>CONVENIO UNIMED FECHAMENTO
          </STMTTRN>
          
          <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20260420000000
            <TRNAMT>-45.50
            <FITID>20260420003
            <NAME>TARIFA BANCARIA
          </STMTTRN>
          
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;

function runTest() {
  console.log("🧪 Iniciando Teste do Parser OFX...");
  try {
    const transactions = parseOFX(mockOFX);
    console.log("✅ Parser executado! Quantidade de transações encontradas:", transactions.length);
    console.log("\n--- Detalhamento das transações ---");
    
    transactions.forEach((tx, idx) => {
      console.log(`\nTransação #${idx + 1}:`);
      console.log(`- ID Único (FITID):`, tx.fitid);
      console.log(`- Data Formatada:`, tx.transaction_date);
      console.log(`- Valor:`, tx.amount);
      console.log(`- Tipo:`, tx.type);
      console.log(`- Descrição:`, tx.description);
      console.log(`- Memo:`, tx.memo);
    });

    // Asserções básicas
    if (transactions.length !== 3) throw new Error("Deveriam ter sido encontradas 3 transações.");
    if (transactions[0].amount !== -150.00) throw new Error("Valor da transação 1 incorreto.");
    if (transactions[1].type !== 'ENTRADA') throw new Error("Tipo da transação 2 deveria ser ENTRADA.");
    if (transactions[2].transaction_date !== '2026-04-20') throw new Error("Data da transação 3 incorreta.");

    console.log("\n🎉 TESTE PASSOU COM SUCESSO!");
  } catch (err) {
    console.error("❌ O teste falhou com erro:", err.message);
    process.exit(1);
  }
}

runTest();
