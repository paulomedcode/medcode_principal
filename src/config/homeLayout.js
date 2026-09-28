/*
 * Quem vê qual tela inicial.
 *
 * São duas, fixas: a do médico e a do administrativo. Não há configuração por
 * cargo nem por usuário — era o que existia antes (settings.id='home_layouts')
 * e o que fez a pendência de assinatura sumir da home de um médico sem deixar
 * rastro. Trocar de tela = trocar o cargo da pessoa no cadastro.
 */

const PERFIS_MEDICOS = ['Médico', 'Médico Coordenador'];

export const ehTelaMedico = (user) => PERFIS_MEDICOS.includes(user?.role);
