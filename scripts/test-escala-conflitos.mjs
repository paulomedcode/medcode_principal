/**
 * Testes do detector de duplicidade de plantão (mesmo médico, dois lugares).
 * Rodar com:  node scripts/test-escala-conflitos.mjs
 */
import { findScheduleConflicts, resolveSlotDay, describeTime } from '../src/utils/escalaConflitos.js';


let ok = 0, fail = 0;
const t = (nome, cond) => { if (cond) { ok++; console.log('  OK  ', nome); } else { fail++; console.log('  FALHA', nome); } };

// Cenário real: 31/08/2026 (segunda) = w6? Agosto/2026 começa sábado.
// Vamos usar ids coerentes: 2026-08-wN-hId-sIdx-diaIdx (dia 0=segunda)
const pf = { slotId: '2026-08-w6-1-0-0', doctorName: 'Dr. Fulano', hospitalName: 'Hospital A', sectorName: 'Anestesista Extra 1', date: '31/08', period: 'Diurno', time: '07-19h' };
const sl = { slotId: '2026-08-w6-4-0-0', doctorName: 'Dr. Fulano', hospitalName: 'Hospital B', sectorName: 'Diurno',              date: '31/08', period: 'Diurno', time: '07-19h' };

const base = { [pf.slotId]: pf };

t('duplicidade real 31/08 (PF x SL) é detectada', findScheduleConflicts(base, sl).length === 1);
t('mensagem traz o hospital certo', findScheduleConflicts(base, sl)[0].hospitalName === 'Hospital A');
t('editar o PRÓPRIO plantão não acusa conflito', findScheduleConflicts(base, pf).length === 0);
t('médico diferente não conflita', findScheduleConflicts(base, {...sl, doctorName: 'Dr. Marcos André'}).length === 0);
t('nome com/sem "Dr." casa igual', findScheduleConflicts(base, {...sl, doctorName: 'FULANO'}).length === 1);

// Sobreposições parciais
t('Manhã 07-13h dentro de Diurno 07-19h CONFLITA', findScheduleConflicts(base, {...sl, period:'Manhã', time:'07-13h'}).length === 1);
t('Tarde 13-19h dentro de Diurno 07-19h CONFLITA', findScheduleConflicts(base, {...sl, period:'Tarde', time:'13-19h'}).length === 1);
t('Noturno 19-07h x Diurno 07-19h NÃO conflita', findScheduleConflicts(base, {...sl, period:'Noturno', time:'19-07h'}).length === 0);

// Virada de meia-noite
const not31 = { slotId: '2026-08-w6-1-4-0', doctorName: 'Dr. Fulano', hospitalName: 'Hospital A', sectorName: 'Noturno', date: '31/08', period: 'Noturno', time: '19-07h' };
t('Noturno 31/08 x Diurno 01/09 NÃO conflita (acaba 07h)', findScheduleConflicts({ [not31.slotId]: not31 }, { slotId:'2026-09-w1-4-0-1', doctorName:'Dr. Fulano', hospitalName:'Hospital B', date:'01/09', period:'Diurno', time:'07-19h' }).length === 0);
t('Noturno 31/08 x Noturno 31/08 em outro hospital CONFLITA', findScheduleConflicts({ [not31.slotId]: not31 }, { slotId:'2026-08-w6-4-2-0', doctorName:'Dr. Fulano', hospitalName:'Hospital B', date:'31/08', period:'Noturno', time:'19-07h' }).length === 1);
t('Noturno 31/08 x Madrugada 01/09 05-08h CONFLITA', findScheduleConflicts({ [not31.slotId]: not31 }, { slotId:'2026-09-w1-4-0-1', doctorName:'Dr. Fulano', hospitalName:'Hospital B', date:'01/09', period:'Diurno', time:'05-08h' }).length === 1);

// Mesmo hospital, duas linhas
t('mesmo hospital, 2 linhas no mesmo horário CONFLITA', findScheduleConflicts(base, {...pf, slotId:'2026-08-w6-1-1-0', sectorName:'Anestesista Extra 2'}).length === 1);

// Data "Padrão" resolvida pelo slot (agosto/2026: w1 = 27/07 a 02/08 -> dia 0 = 27/07)
const padrao = { slotId: '2026-08-w2-1-0-0', doctorName: 'Dr. Fulano', hospitalName: 'Hospital A', sectorName: 'Diurno', date: 'Padrão', period: 'Diurno', time: '07-19h' };
const dPadrao = resolveSlotDay(padrao.slotId, 'Padrão');
const dReal = resolveSlotDay('2026-08-w2-9-0-0', '03/08');
t('data "Padrão" resolve pela semana/dia do slot', dPadrao && dReal && dPadrao.day === dReal.day);
t('"Padrão" conflita com plantão datado do mesmo dia', findScheduleConflicts({ [padrao.slotId]: padrao }, { slotId:'2026-08-w2-4-0-0', doctorName:'Dr. Fulano', hospitalName:'Hospital B', date:'03/08', period:'Manhã', time:'07-13h' }).length === 1);

// Escala Fixa (template) — universo separado
const fix = { slotId: 'FIXED-fw1-1-0-0', doctorName: 'Dr. Fulano', hospitalName: 'Hospital A', sectorName: 'Diurno', date: 'Padrão', period: 'Diurno', time: '07-19h' };
t('Fixa: mesmo dia-da-semana em 2 hospitais CONFLITA', findScheduleConflicts({ [fix.slotId]: fix }, { slotId:'FIXED-fw1-4-0-0', doctorName:'Dr. Fulano', hospitalName:'Hospital B', date:'Padrão', period:'Diurno', time:'07-19h' }).length === 1);
t('Fixa: dias diferentes não conflitam', findScheduleConflicts({ [fix.slotId]: fix }, { slotId:'FIXED-fw1-4-0-1', doctorName:'Dr. Fulano', hospitalName:'Hospital B', date:'Padrão', period:'Diurno', time:'07-19h' }).length === 0);
t('Fixa não conflita com mês real', findScheduleConflicts({ [fix.slotId]: fix }, sl).length === 0);

// Horário ausente cai no default do período / do setor
t('sem time, usa o padrão do período', findScheduleConflicts(base, { slotId:'2026-08-w6-4-0-0', doctorName:'Dr. Fulano', hospitalName:'Hospital B', sectorName:'Manhã', date:'31/08' }).length === 1);
t('horário customizado 08:30-12:00 conflita com diurno', findScheduleConflicts(base, {...sl, time:'08:30-12:00'}).length === 1);
t('describeTime formata com minutos', describeTime({ time:'08:30-12:00' }) === '08:30-12h');

// Plantão vazio (sem médico) nunca conflita
t('slot sem médico é ignorado', findScheduleConflicts({ vazio: { slotId:'2026-08-w6-9-0-0', doctorName:'', hospitalName:'X', date:'31/08' } }, sl).length === 0);

// Fonte extra (banco) mesclada sem duplicar
t('extra do banco não duplica o mesmo slotId', findScheduleConflicts(base, sl, [pf]).length === 1);

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
