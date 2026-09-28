// Simulação das fórmulas de repasse e rateio médico do ERP

const mockDoctorSettings = {
  admin_fee_rate: 10.00, // 10% retidos pela PJ
};

const mockShifts = [
  { id: 'shift-1', hospitalName: 'Hospital A', baseValue: 1200.00, extraValue: 200.00 },
  { id: 'shift-2', hospitalName: 'Hospital B', baseValue: 1000.00, extraValue: 0.00 }
];

const mockSurgeries = [
  { id: 'surg-1', paciente: 'MARIA SILVA', procedimento: 'COLECISTECTOMIA', value: 500.00 },
  { id: 'surg-2', paciente: 'JOÃO SOUZA', procedimento: 'HERNIOPLASTIA', value: 500.00 }
];

const mockGlosas = [
  { id: 'glosa-1', convenio: 'UNIMED', amount: 150.00, reason: 'Falta de justificativa' }
];

function calculateRepasseSim() {
  console.log("🧪 Simulando Fórmula de Repasse Médico...");
  
  // 1. Calcula Bruto dos Plantões
  const grossShifts = mockShifts.reduce((acc, curr) => acc + (curr.baseValue + curr.extraValue), 0);
  console.log(`- Bruto de Plantões (${mockShifts.length} itens): R$ ${grossShifts.toFixed(2)}`);

  // 2. Calcula Bruto das Cirurgias
  const grossSurgeries = mockSurgeries.reduce((acc, curr) => acc + curr.value, 0);
  console.log(`- Bruto de Cirurgias (${mockSurgeries.length} itens): R$ ${grossSurgeries.toFixed(2)}`);

  // 3. Bruto Total
  const grossTotal = grossShifts + grossSurgeries;
  console.log(`- Faturamento Bruto Total: R$ ${grossTotal.toFixed(2)}`);

  // 4. Desconto da Taxa Administrativa (10%)
  const feeRate = mockDoctorSettings.admin_fee_rate;
  const feeAmount = (grossTotal * feeRate) / 100;
  console.log(`- Taxa Administrativa Retida pela PJ (${feeRate}%): R$ ${feeAmount.toFixed(2)}`);

  // 5. Dedução de Glosas
  const glosaDeduction = mockGlosas.reduce((acc, curr) => acc + curr.amount, 0);
  console.log(`- Glosas Deduzidas do Profissional: R$ ${glosaDeduction.toFixed(2)}`);

  // 6. Líquido a Pagar
  const netAmount = grossTotal - feeAmount - glosaDeduction;
  console.log(`- Valor Líquido Final a Pagar: R$ ${netAmount.toFixed(2)}`);

  // Asserções
  const expectedGross = 1200 + 200 + 1000 + 500 + 500; // 3400
  const expectedFee = 3400 * 0.1; // 340
  const expectedGlosa = 150;
  const expectedNet = 3400 - 340 - 150; // 2910

  if (grossTotal !== expectedGross) throw new Error("Faturamento bruto incorreto!");
  if (feeAmount !== expectedFee) throw new Error("Taxa administrativa incorreta!");
  if (glosaDeduction !== expectedGlosa) throw new Error("Dedução de glosa incorreta!");
  if (netAmount !== expectedNet) throw new Error("Líquido final incorreto!");

  console.log("\n🎉 TESTE DE CÁLCULO DE REPASSE E RATEIO PASSOU COM SUCESSO!");
}

calculateRepasseSim();
