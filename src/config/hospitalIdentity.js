// Identidade da empresa exibida no PDF de Agendamento Cirúrgico e na visão
// semanal. Um deploy = um cliente, então a identidade é uma só.
//
// Os documentos por unidade (APA, requisição de transfusão) não usam este
// arquivo: leem razão social/endereço/CNPJ do cadastro da própria unidade.

const IDENTITY = {
    headerLine1: 'MedCode',
    headerLine2: 'Assessoria',
    headerSubtitle: 'São Paulo',
    slogan: null,
    footerName: 'MedCode Assessoria',
    footerAddress: 'Av. Brigadeiro Faria Lima, 1811 - Jardim Paulistano, São Paulo - SP, 01452-001',
    footerContacts: ['(15) 98804-1307', 'contato@medcodedev.com'],
    footerCnpj: 'CNPJ 68.955.873/0001-91',
    // Corpo do PDF
    localApresentacao: 'na recepção do Hospital',
    mostrarTransporte: false, // parágrafo sobre transporte de outro município
    whatsappRetorno: '(15) 98804-1307', // WhatsApp do retorno pós-cirúrgico
    // Ao imprimir, pergunta o horário de internação (05:00 / 11:00) em vez de
    // usar a regra pré-configurada por especialidade.
    perguntarInternacaoAoImprimir: true,
};

export function getHospitalIdentity() {
    return IDENTITY;
}
