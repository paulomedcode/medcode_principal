/*
 * Helpers para interpretar a escala e extrair os próximos plantões de um usuário.
 *
 * Fonte de verdade dos plantões = tabela relacional `escala_plantoes` (a mesma
 * que a grade da Escala carrega). O blob JSONB legado `settings.id='escala'`
 * fica defasado para edições de célula, por isso NÃO deve ser usado aqui.
 *
 * Centraliza a lógica de casamento por nome e de parse de data.
 */

export const normalizeName = (name) => {
    if (!name) return '';
    const n = name.toUpperCase()
        .replace(/^DR[A]?\.?\s+/, '')
        .trim();
    return n.normalize('NFD').replace(/[̀-ͯ]/g, '');
};

const matchesUser = (doctorName, userNorm) => {
    const docNorm = normalizeName(doctorName);
    if (!docNorm || !userNorm) return false;
    if (docNorm === userNorm || docNorm.includes(userNorm) || userNorm.includes(docNorm)) return true;

    const docWords = docNorm.split(' ').filter(w => w.length > 2);
    const userWords = userNorm.split(' ').filter(w => w.length > 2);

    if (docWords.length > 0 && userWords.length > 0 && docWords[0] === userWords[0]) {
        const matchCount = docWords.filter(w => userWords.includes(w)).length;
        if (matchCount > 1 || docWords.length === 1 || userWords.length === 1) return true;
    }
    return false;
};

const parseShiftDate = (a, today) => {
    if (a.date && a.date.includes('/')) {
        const [dayStr, monthStr] = a.date.split('/');
        const year = today.getFullYear();
        const shiftDate = new Date(year, parseInt(monthStr, 10) - 1, parseInt(dayStr, 10));

        if (shiftDate.getMonth() < today.getMonth() - 2) {
            shiftDate.setFullYear(year + 1);
        } else if (shiftDate.getMonth() > today.getMonth() + 2 && today.getMonth() < 2) {
            shiftDate.setFullYear(year - 1);
        }
        return shiftDate;
    }
    if (a._key && a._key.match(/^\d{4}-\d{2}-w\d/)) {
        const parts = a._key.split('-');
        if (parts.length >= 6) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const weekIdx = parseInt(parts[2].replace('w', ''), 10) - 1;
            const dayIdx = parseInt(parts[5], 10);

            const firstDay = new Date(year, month - 1, 1);
            const startDayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

            const shiftDate = new Date(firstDay);
            shiftDate.setDate(shiftDate.getDate() - startDayOffset + (weekIdx * 7) + dayIdx);
            return shiftDate;
        }
    }
    return null;
};

/*
 * Retorna os próximos plantões (>= hoje) do usuário, ordenados por data.
 * `assignments` é um objeto { assignment_id -> { doctorName, date, ... } }
 * (formato montado a partir das linhas de `escala_plantoes`).
 * Cada item é o assignment original acrescido de { _key, parsedDate }.
 */
export const getMyUpcomingShifts = (assignments, userName, today = new Date()) => {
    if (!assignments || !userName) return [];
    const base = new Date(today);
    base.setHours(0, 0, 0, 0);
    const userNorm = normalizeName(userName);

    return Object.entries(assignments)
        .map(([key, a]) => ({ ...a, _key: key }))
        .filter(a => matchesUser(a.doctorName, userNorm))
        .map(a => {
            const shiftDate = parseShiftDate(a, base);
            if (shiftDate) a.parsedDate = shiftDate;
            return a;
        })
        .filter(a => a.parsedDate && a.parsedDate >= base)
        .sort((a, b) => a.parsedDate - b.parsedDate);
};

// Deriva o turno/horário a partir do setor (mesma regra de Escala.jsx, já que a
// tabela escala_plantoes não guarda time/period — só o sector_name).
const getNormalizedPeriod = (p) => {
    const s = (p || '').toLowerCase();
    if (s.includes('noturno')) return 'Noturno';
    if (s.includes('manhã') || s.includes('manha')) return 'Manhã';
    if (s.includes('tarde')) return 'Tarde';
    if (s.includes('diurno') || s.includes('extra') || s.includes('anestesista')) return 'Diurno';
    return 'Diurno';
};

const getDefaultTimeForPeriod = (period) => {
    switch (getNormalizedPeriod(period).toLowerCase()) {
        case 'diurno': return '07-19h';
        case 'noturno': return '19-07h';
        case 'manhã': return '07-13h';
        case 'tarde': return '13-19h';
        default: return '';
    }
};

/*
 * Carrega os plantões da tabela `escala_plantoes` (paginado, como a grade da
 * Escala faz) e devolve no formato { assignment_id -> assignment } esperado por
 * getMyUpcomingShifts. Isola a leitura para o widget não depender do JSONB legado.
 */
export const fetchEscalaPlantoes = async (supabase) => {
    const assignments = {};
    let from = 0;
    const step = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('escala_plantoes')
            .select('assignment_id, doctor_name, hospital_name, sector_name, date, subtitle')
            .range(from, from + step - 1);
        if (error || !data) break;
        data.forEach(p => {
            assignments[p.assignment_id] = {
                doctorName: p.doctor_name,
                hospitalName: p.hospital_name,
                sectorName: p.sector_name,
                date: p.date,
                subtitle: p.subtitle,
                period: getNormalizedPeriod(p.sector_name),
                time: getDefaultTimeForPeriod(p.sector_name),
            };
        });
        if (data.length < step) break;
        from += step;
    }
    return assignments;
};
