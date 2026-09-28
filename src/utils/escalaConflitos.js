/**
 * Detector de duplicidade de plantão — "o mesmo médico não pode estar em dois
 * lugares no mesmo horário".
 *
 * A comparação NÃO é por período ("Diurno" x "Diurno"): cada plantão vira um
 * INTERVALO REAL de tempo (dia absoluto + minuto inicial → minuto final, com o
 * Noturno atravessando a meia-noite) e conflito é qualquer sobreposição. Assim:
 *   - Diurno 07-19h x Manhã 07-13h  → CONFLITA (a manhã cabe dentro do diurno)
 *   - Diurno 07-19h x Tarde 13-19h  → CONFLITA
 *   - Diurno 07-19h x Noturno 19-07h→ não conflita (encostam na borda)
 *   - Noturno 31/08 x Diurno 01/09  → não conflita (o noturno acaba às 07h)
 *
 * Tudo aqui é função pura, sem React e sem Supabase, para poder ser testado
 * isoladamente (ver scripts de verificação) e reaproveitado em outros pontos
 * (import em lote, relatórios, validação no servidor).
 */

import { normalizeName } from './escalaShifts.js';

const DEFAULT_TIME_BY_PERIOD = {
    'diurno': '07-19h',
    'noturno': '19-07h',
    'manhã': '07-13h',
    'manha': '07-13h',
    'tarde': '13-19h'
};

/** Mesma normalização de período usada na Escala (nome do setor → período). */
export const normalizePeriod = (p) => {
    const s = (p || '').toLowerCase();
    if (s.includes('noturno')) return 'Noturno';
    if (s.includes('manhã') || s.includes('manha')) return 'Manhã';
    if (s.includes('tarde')) return 'Tarde';
    return 'Diurno';
};

/**
 * "07-19h" | "19-07h" | "07:30 - 13:00" → { startMin, durMin }.
 * Aceita hora com minutos e qualquer separador; devolve null se não der pra ler.
 * Fim <= início significa virada de meia-noite (soma 24h).
 */
export const parseHourRange = (time) => {
    if (!time) return null;
    const nums = String(time).match(/(\d{1,2})(?:[:h.](\d{2}))?/g);
    if (!nums || nums.length < 2) return null;
    const toMin = (chunk) => {
        const m = chunk.match(/(\d{1,2})(?:[:h.](\d{2}))?/);
        const h = parseInt(m[1], 10);
        const mi = m[2] ? parseInt(m[2], 10) : 0;
        if (isNaN(h) || h > 23 || mi > 59) return null;
        return h * 60 + mi;
    };
    const start = toMin(nums[0]);
    const end = toMin(nums[1]);
    if (start === null || end === null) return null;
    let dur = end - start;
    if (dur <= 0) dur += 24 * 60;
    return { startMin: start, durMin: dur };
};

/** Horário efetivo do plantão: o que está gravado, senão o padrão do período. */
export const effectiveTime = (time, period, sectorName) => {
    const parsed = parseHourRange(time);
    if (parsed) return parsed;
    const norm = normalizePeriod(period || sectorName).toLowerCase();
    return parseHourRange(DEFAULT_TIME_BY_PERIOD[norm] || '07-19h');
};

/**
 * Reconstrói o calendário de um mês igual à grade (semana começa na segunda,
 * semanas identificadas w1..w6, só entram semanas com algum dia do mês).
 * Devolve { w1: [Date x7], ... } para resolver a data real de um slot cujo
 * campo `date` está vazio ou como "Padrão" (herdado da Escala Fixa).
 */
const monthWeeks = (year, month) => {
    const weeks = {};
    const cursor = new Date(year, month - 1, 1);
    const firstDow = cursor.getDay() === 0 ? 6 : cursor.getDay() - 1;
    cursor.setDate(cursor.getDate() - firstDow);
    let idx = 0;
    for (let i = 0; i < 6; i++) {
        const days = [];
        let hasValid = false;
        for (let j = 0; j < 7; j++) {
            if (cursor.getMonth() === month - 1) hasValid = true;
            days.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        if (hasValid) {
            idx += 1;
            weeks[`w${idx}`] = days;
        }
    }
    return weeks;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dia do plantão como número inteiro comparável.
 *
 * `space` separa dois universos que nunca se comparam entre si:
 *   'M' = escala mensal (dia real, contado em dias desde 1970)
 *   'F' = Escala Fixa (template): dia sintético fwN*7 + diaIdx, para que
 *         "noturno da 1ª segunda" ainda encoste na "1ª terça" corretamente.
 *
 * assignment_id: `YYYY-MM-wN-hId-sIdx-diaIdx` ou `FIXED-fwN-hId-sIdx-diaIdx`.
 */
export const resolveSlotDay = (slotId, dateStr) => {
    if (!slotId) return null;
    const parts = String(slotId).split('-');

    if (String(slotId).startsWith('FIXED-')) {
        const fw = parseInt(String(parts[1] || '').replace(/\D/g, ''), 10);
        const dayIdx = parseInt(parts[4], 10);
        if (isNaN(fw) || isNaN(dayIdx)) return null;
        return { space: 'F', day: fw * 7 + dayIdx };
    }

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (isNaN(year) || isNaN(month)) return null;

    // Caminho normal: o dia vem gravado como "DD/MM" e o ano/mês do próprio id.
    const clean = String(dateStr || '').trim();
    const m = clean.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        // Vira do ano: dezembro (mês 12) exibindo 01/01 pertence ao ano seguinte.
        const y = (month === 12 && mo === 1) ? year + 1 : (month === 1 && mo === 12) ? year - 1 : year;
        return { space: 'M', day: Math.round(Date.UTC(y, mo - 1, d) / DAY_MS) };
    }

    // Fallback ("Padrão" ou vazio): resolve pela semana + dia da grade.
    const weekId = parts[2];
    const dayIdx = parseInt(parts[5], 10);
    if (isNaN(dayIdx)) return null;
    const days = monthWeeks(year, month)[weekId];
    if (!days || !days[dayIdx]) return null;
    const dt = days[dayIdx];
    return { space: 'M', day: Math.round(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / DAY_MS) };
};

/**
 * Plantão → intervalo absoluto em minutos { space, start, end }.
 * Devolve null quando não dá pra situar no tempo (id fora do padrão).
 */
export const shiftInterval = (shift) => {
    if (!shift) return null;
    const dayRef = resolveSlotDay(shift.slotId, shift.date);
    if (!dayRef) return null;
    const range = effectiveTime(shift.time, shift.period, shift.sectorName);
    if (!range) return null;
    const start = dayRef.day * 24 * 60 + range.startMin;
    return { space: dayRef.space, start, end: start + range.durMin };
};

const overlaps = (a, b) => a && b && a.space === b.space && a.start < b.end && b.start < a.end;

/** "07-19h" a partir do que existir, só para exibir na mensagem de conflito. */
export const describeTime = (shift) => {
    const range = effectiveTime(shift.time, shift.period, shift.sectorName);
    if (!range) return '';
    const fmt = (min) => {
        const total = ((min % 1440) + 1440) % 1440;
        const h = Math.floor(total / 60).toString().padStart(2, '0');
        const mi = (total % 60).toString().padStart(2, '0');
        return mi === '00' ? h : `${h}:${mi}`;
    };
    return `${fmt(range.startMin)}-${fmt(range.startMin + range.durMin)}h`;
};

/**
 * Procura plantões do MESMO médico com horário sobreposto ao candidato.
 *
 * @param {Object} assignments  mapa slotId → plantão (o estado da Escala)
 * @param {Object} candidate    { slotId, doctorName, date, period, time, sectorName, hospitalName }
 * @param {Array}  extra        plantões avulsos (ex.: recém-lidos do banco) no formato
 *                              { slotId, doctorName, date, period, time, sectorName, hospitalName }
 * @returns {Array} conflitos, com hospital/turno/data/horário para a mensagem
 */
export const findScheduleConflicts = (assignments, candidate, extra = []) => {
    if (!candidate?.doctorName) return [];
    const alvo = shiftInterval(candidate);
    if (!alvo) return [];
    const nome = normalizeName(candidate.doctorName);
    if (!nome) return [];

    const pool = [
        ...Object.entries(assignments || {}).map(([slotId, a]) => ({ ...a, slotId })),
        ...(extra || [])
    ];

    const vistos = new Set();
    const conflitos = [];
    pool.forEach((a) => {
        if (!a || !a.doctorName) return;
        if (a.slotId === candidate.slotId) return;          // o próprio plantão sendo editado
        if (vistos.has(a.slotId)) return;                    // banco + estado local trazem o mesmo id
        if (normalizeName(a.doctorName) !== nome) return;
        const outro = shiftInterval(a);
        if (!overlaps(alvo, outro)) return;
        vistos.add(a.slotId);
        conflitos.push({
            slotId: a.slotId,
            doctorName: a.doctorName,
            hospitalName: a.hospitalName || '',
            sectorName: a.sectorName || '',
            date: a.date || '',
            period: normalizePeriod(a.period || a.sectorName),
            time: describeTime(a),
            sameHospital: (a.hospitalName || '') === (candidate.hospitalName || '')
        });
    });

    return conflitos.sort((a, b) => (a.hospitalName || '').localeCompare(b.hospitalName || ''));
};
