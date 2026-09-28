/**
 * Testes da "vaga descoberta" (plantão sem plantonista, sinalizado de propósito).
 * Rodar com:  node scripts/test-escala-descoberto.mjs
 */
import { isPlaceholderDoctor, asUncoveredIfPlaceholder, setUncovered, isUncovered } from '../src/utils/escalaDescoberto.js';
import { findScheduleConflicts } from '../src/utils/escalaConflitos.js';

let ok = 0, fail = 0;
const t = (nome, cond) => { if (cond) { ok++; console.log('  OK  ', nome); } else { fail++; console.log('  FALHA', nome); } };

// Reconhecimento do cadastro-placeholder antigo
t('reconhece "Dr. Descoberto!!!"', isPlaceholderDoctor('Dr. Descoberto!!!'));
t('reconhece "DESCOBERTO"', isPlaceholderDoctor('DESCOBERTO'));
t('não confunde com médico real', !isPlaceholderDoctor('Dr. Fulano'));
t('nome vazio não é placeholder', !isPlaceholderDoctor(''));

// Conversão automática ao carregar do banco
const legado = {
    doctorName: 'Dr. Descoberto!!!',
    subtitle: 'parte da manhã, negociando com a Rosi',
    appearance: { bold: false, color: 'red', verified: false }
};
const convertido = asUncoveredIfPlaceholder(legado);
t('plantão legado vira vaga descoberta', isUncovered(convertido));
t('conversão limpa o nome do médico', convertido.doctorName === '');
t('conversão preserva a anotação', convertido.subtitle === 'parte da manhã, negociando com a Rosi');
t('médico real passa intacto', asUncoveredIfPlaceholder({ doctorName: 'Dr. Fulano' }).doctorName === 'Dr. Fulano');

// Marcar / desmarcar
const marcado = setUncovered({ doctorName: 'Dr. Fulano', appearance: { color: 'default' } }, true);
t('marcar como descoberta tira o médico', marcado.doctorName === '' && isUncovered(marcado));
t('marcar deixa a célula vermelha', marcado.appearance.color === 'red');
const desmarcado = setUncovered(marcado, false);
t('desmarcar remove o estado', !isUncovered(desmarcado));
t('desmarcar devolve a cor padrão', desmarcado.appearance.color === 'default');

// O ponto do exercício: duas vagas descobertas no mesmo horário são permitidas
const vagaPF = { slotId: '2026-08-w6-1-0-0', doctorName: '', hospitalName: 'Hospital A', sectorName: 'Diurno', date: '31/08', period: 'Diurno', time: '07-19h', appearance: { uncovered: true } };
const vagaSL = { slotId: '2026-08-w6-4-0-0', doctorName: '', hospitalName: 'Hospital B', sectorName: 'Diurno', date: '31/08', period: 'Diurno', time: '07-19h', appearance: { uncovered: true } };
t('duas vagas descobertas no mesmo horário NÃO conflitam', findScheduleConflicts({ [vagaPF.slotId]: vagaPF }, vagaSL).length === 0);

const medicoPF = { ...vagaPF, doctorName: 'Dr. Fulano', appearance: {} };
t('vaga descoberta não conflita com médico real', findScheduleConflicts({ [medicoPF.slotId]: medicoPF }, vagaSL).length === 0);
t('médico real continua bloqueado apesar da vaga vizinha', findScheduleConflicts({ [medicoPF.slotId]: medicoPF, [vagaSL.slotId]: vagaSL }, { ...vagaSL, doctorName: 'Dr. Fulano', appearance: {} }).length === 1);

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
