import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useUnit } from '../../contexts/UnitContext';
import { getMyUpcomingShifts, fetchEscalaPlantoes } from '../../utils/escalaShifts';
import { STATUS_PALETTE, statusColor } from '../../config/statusColors';
import { CARD_SHELL, CardHeader, CardLink } from './cardUI.jsx';
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Stethoscope, LayoutDashboard, ArrowRight, Phone } from 'lucide-react';

/*
 * Widgets baseados na tabela `surgeries` (mapa cirúrgico):
 *  - MapaDoDiaWidget      : cirurgias de um dia (navegável), clique abre o mapa.
 *  - MapaDoPlantaoWidget  : mapa do hospital onde o médico logado está escalado —
 *                           hoje, se houver plantão hoje; senão o do próximo plantão.
 *  - DashboardStatusWidget: contagem de cirurgias por status (dia x total geral).
 */

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x; };
const fmtLabel = (d) => `${d.getDate()} ${MESES[d.getMonth()]} · ${DIAS[d.getDay()]}`;
const filterUnit = (rows, unidade) => (unidade ? rows.filter(s => !s.unidade || s.unidade === unidade) : rows);

const fetchSurgeriesForDay = async (dateStr) => {
    try {
        const { data, error } = await supabase
            .from('surgeries')
            .select('*')
            .like('dataAgendado', `${dateStr}%`)
            .neq('status', 'Cancelado');
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar cirurgias do dia:', error);
        return [];
    }
};

// ---------- subcomponentes (escopo de módulo) ----------

// ---------- card rico (mesmas infos do mapa cirúrgico) ----------

const calcAge = (dob) => {
    if (!dob) return '';
    const d = new Date(dob);
    if (isNaN(d.getTime())) return '';
    const age = Math.abs(new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970);
    return isNaN(age) ? '' : `${age}A`;
};

const prioStyle = (p) => {
    const u = String(p || '').toUpperCase();
    if (u.includes('EMERG') || u.includes('URG')) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (u.includes('PRIOR')) return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-blue-100 text-blue-700 border-blue-200'; // ELETIVA / padrão
};

const salaLabel = (s) => /^\d+$/.test(s) ? `SALA ${s}` : s;
const parseHour = (h) => { const m = String(h || '').match(/^(\d{1,2})/); return m ? parseInt(m[1], 10) : null; };
const roomOf = (s) => String(s.sala || s.local || '').toUpperCase().trim() || 'S/ SALA';

// Card compacto de uma cirurgia (dentro da célula de horário) — fontes reduzidas
const GridCard = ({ s }) => {
    const prioridade = (s.prioridade || 'ELETIVA').toUpperCase();
    const proc = (s.procedimento || '---').toUpperCase();
    const surgeon = (s.cirurgiao || '').replace(/^dr\.?\s+/i, '').trim().toUpperCase();
    const paciente = (s.nomePaciente || s.paciente || '—').toUpperCase();
    const idade = calcAge(s.nascimento || s.dataNascimento);
    const anestesia = String(s.anestesia || '').toUpperCase().trim();
    const convenio = String(s.convenio || 'SUS').toUpperCase().trim();
    const cidade = String(s.municipio || s.cidade || '').toUpperCase().trim();
    const tel = s.telefone1 || s.telefone;
    return (
        <div className="rounded-md bg-white/90 border border-white/70 border-l-[3px] px-1.5 py-1 flex flex-col gap-0.5 shadow-sm" style={{ borderLeftColor: statusColor(s.status).dot }}>
            <div className="flex items-center justify-between gap-1">
                <span className="text-[8.5px] font-black text-slate-800">{s.horario || '--:--'}</span>
                <span className={`px-1 rounded text-[6.5px] font-bold uppercase border leading-[1.4] ${prioStyle(prioridade)}`}>{prioridade}</span>
            </div>
            <div className="text-[8.5px] font-black text-slate-800 uppercase leading-[1.1] break-words">{proc}</div>
            <div className="text-[8px] font-bold text-slate-600 uppercase leading-tight break-words">{paciente}{idade && <span className="text-slate-400 font-medium"> ({idade})</span>}</div>
            <div className="text-[7.5px] font-medium text-slate-500 uppercase truncate">Dr. {surgeon || '---'}</div>
            {tel && <div className="text-[7.5px] text-slate-500 flex items-center gap-0.5"><Phone size={7} className="shrink-0" /><span className="truncate">{tel}</span></div>}
            {(convenio || cidade || anestesia) && (
                <div className="flex flex-wrap gap-0.5 pt-0.5 mt-0.5 border-t border-white/60">
                    {convenio && <span className="px-1 bg-slate-100/80 text-slate-500 rounded text-[6.5px] font-bold uppercase border border-white/60 leading-[1.5]">{convenio}</span>}
                    {cidade && <span className="px-1 bg-slate-100/80 text-slate-500 rounded text-[6.5px] font-bold uppercase border border-white/60 leading-[1.5]">{cidade}</span>}
                    {anestesia && <span className="px-1 bg-slate-100/80 text-slate-500 rounded text-[6.5px] font-bold uppercase border border-white/60 leading-[1.5]">{anestesia}</span>}
                </div>
            )}
        </div>
    );
};

// Grade de um dia no estilo mapa cirúrgico: horários (linhas) x salas (colunas)
const DayGrid = ({ label, loading, rows }) => {
    let rooms = [...new Set(rows.map(roomOf))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!rooms.length) rooms = ['—'];

    const hoursPresent = rows.map(s => parseHour(s.horario)).filter(h => h != null);
    const start = Math.min(7, ...(hoursPresent.length ? hoursPresent : [7]));
    const end = Math.max(17, ...(hoursPresent.length ? hoursPresent : [17]));
    const hours = [];
    for (let h = start; h <= end; h++) hours.push(h);
    const semHora = rows.filter(s => parseHour(s.horario) == null);

    const cellOf = (room, h) => rows
        .filter(s => roomOf(s) === room && parseHour(s.horario) === h)
        .sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')));

    const gridCols = { gridTemplateColumns: `30px repeat(${rooms.length}, minmax(112px, 1fr))` };

    return (
        <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded-2xl bg-white/30 border border-white/50 p-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1.5 px-0.5 shrink-0">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</span>
                <span className="text-[10px] font-medium text-slate-400 tabular-nums">{rows.length}</span>
            </div>
            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[120px]"><Loader2 className="animate-spin text-indigo-400" size={20} /></div>
            ) : !rows.length ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 min-h-[120px]">
                    <CalendarRange size={20} className="text-slate-300" />
                    <p className="text-[11.5px] font-medium text-slate-400">Sem cirurgias neste dia</p>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                    <div className="min-w-max">
                        <div className="grid sticky top-0 z-10 bg-white/80 backdrop-blur rounded-t" style={gridCols}>
                            <div className="text-[7px] font-black text-slate-400 flex items-end justify-center pb-1">H</div>
                            {rooms.map(r => <div key={r} className="text-[8.5px] font-black text-indigo-600 uppercase text-center py-1 truncate border-l border-white/60">{salaLabel(r)}</div>)}
                        </div>
                        {hours.map(h => (
                            <div key={h} className="grid border-t border-white/50" style={gridCols}>
                                <div className="text-[8px] font-black text-slate-500 text-center pt-1">{String(h).padStart(2, '0')}h</div>
                                {rooms.map(r => (
                                    <div key={r} className="border-l border-white/50 p-0.5 min-h-[24px] flex flex-col gap-0.5">
                                        {cellOf(r, h).map(s => <GridCard key={s.id} s={s} />)}
                                    </div>
                                ))}
                            </div>
                        ))}
                        {semHora.length > 0 && (
                            <div className="grid border-t border-white/50 bg-amber-50/40" style={gridCols}>
                                <div className="text-[7px] font-black text-amber-600 text-center pt-1">S/H</div>
                                {rooms.map(r => (
                                    <div key={r} className="border-l border-white/50 p-0.5 flex flex-col gap-0.5">
                                        {semHora.filter(s => roomOf(s) === r).map(s => <GridCard key={s.id} s={s} />)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ---------- MAPA DO DIA (1 dia, grade hora x sala; controles na lateral direita) ----------

export const MapaDoDiaWidget = () => {
    const navigate = useNavigate();
    const { unidadeAtual } = useUnit();
    const [offset, setOffset] = useState(0);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            const d = addDays(new Date(), offset);
            const r = await fetchSurgeriesForDay(toDateStr(d));
            if (active) { setRows(r); setLoading(false); }
        })();
        return () => { active = false; };
    }, [offset, unidadeAtual]);

    const date = addDays(new Date(), offset);
    const rowsU = filterUnit(rows, unidadeAtual);

    return (
        <div className="flex-1 rounded-[2rem] p-3 lg:p-4 flex gap-3 bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] min-h-[200px] overflow-hidden">
            {/* Área principal: grade de 1 dia (hora x sala) */}
            <DayGrid label={fmtLabel(date)} loading={loading} rows={rowsU} />

            {/* Lateral direita: título + navegação + abrir */}
            <div className="w-[150px] shrink-0 flex flex-col justify-between border-l border-white/50 pl-3 py-1">
                <div>
                    <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 leading-tight mb-1">
                        <CalendarRange size={16} className="shrink-0" /> Mapa do Dia
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-4">Cirurgias do dia</p>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setOffset(o => o - 1)} className="p-2 rounded-lg bg-white/70 hover:bg-white text-slate-600 border border-white/60 transition-colors" title="Dia anterior"><ChevronLeft size={16} /></button>
                        <button onClick={() => setOffset(o => o + 1)} className="p-2 rounded-lg bg-white/70 hover:bg-white text-slate-600 border border-white/60 transition-colors" title="Próximo dia"><ChevronRight size={16} /></button>
                    </div>
                    {offset !== 0 && (
                        <button onClick={() => setOffset(0)} className="mt-2 text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700">↩ Voltar pra hoje</button>
                    )}
                </div>
                <button onClick={() => navigate('/semana')} className="mt-3 flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 bg-white/60 hover:bg-white border border-white/60 rounded-xl py-2 transition-colors">
                    Abrir mapa completo <ArrowRight size={12} />
                </button>
            </div>
        </div>
    );
};

// ---------- MAPA DO PLANTÃO (hospital onde o médico logado está escalado) ----------

/*
 * A escala e o cadastro de unidades escrevem o mesmo hospital de formas
 * diferentes ("Central" x "HOSPITAL CENTRAL"), então o casamento
 * é por aproximação: contido em, ou tokens significativos com o mesmo começo.
 * Sem correspondência a gente NÃO filtra — mostrar o mapa do dia inteiro é
 * melhor do que mostrar um card vazio por causa de uma diferença de grafia.
 */
const semAcento = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const unidadeDoHospital = (hospitalName, unidades) => {
    const alvo = semAcento(hospitalName);
    if (!alvo || !unidades?.length) return null;

    const exato = unidades.find(u => semAcento(u) === alvo);
    if (exato) return exato;

    const contido = unidades.find(u => { const n = semAcento(u); return n.includes(alvo) || alvo.includes(n); });
    if (contido) return contido;

    const alvoTokens = alvo.split(' ').filter(t => t.length >= 4);
    if (!alvoTokens.length) return null;
    return unidades.find(u => {
        const tokens = semAcento(u).split(' ').filter(t => t.length >= 4);
        return alvoTokens.every(a => tokens.some(t => t.startsWith(a) || a.startsWith(t)));
    }) || null;
};

export const MapaDoPlantaoWidget = ({ currentUser }) => {
    const navigate = useNavigate();
    const [plantao, setPlantao] = useState(null);   // { data, hospital, ehHoje }
    const [unidade, setUnidade] = useState(null);   // nome no cadastro de unidades
    const [loadingPlantao, setLoadingPlantao] = useState(true);
    const [offset, setOffset] = useState(0);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                // getMyUpcomingShifts já devolve de hoje em diante, ordenado:
                // o primeiro item É o plantão de hoje quando existe um, e o
                // próximo quando não existe. Não precisa de dois caminhos.
                const [assignments, { data: unidades }] = await Promise.all([
                    fetchEscalaPlantoes(supabase),
                    supabase.from('unidades').select('nome'),
                ]);
                const userName = currentUser?.name || currentUser?.nome || currentUser?.displayName;
                const shifts = getMyUpcomingShifts(assignments, userName);
                if (!active) return;

                if (shifts.length) {
                    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                    const proximo = shifts[0];
                    setPlantao({
                        data: proximo.parsedDate,
                        hospital: proximo.hospitalName || null,
                        ehHoje: proximo.parsedDate.getTime() === hoje.getTime(),
                    });
                    setUnidade(unidadeDoHospital(proximo.hospitalName, (unidades || []).map(u => u.nome)));
                }
                setLoadingPlantao(false);
            } catch (error) {
                console.error('Erro ao buscar o plantão do médico:', error);
                if (active) setLoadingPlantao(false);
            }
        })();
        return () => { active = false; };
    }, [currentUser?.id]);

    useEffect(() => {
        let active = true;
        (async () => {
            if (!plantao) { if (active) setLoading(false); return; }
            setLoading(true);
            const r = await fetchSurgeriesForDay(toDateStr(addDays(plantao.data, offset)));
            if (active) { setRows(r); setLoading(false); }
        })();
        return () => { active = false; };
    }, [plantao, offset]);

    if (loadingPlantao) {
        return (
            <div className={`${CARD_SHELL} flex-1 p-5 flex items-center justify-center min-h-[200px]`}>
                <Loader2 className="animate-spin text-indigo-300" size={18} />
            </div>
        );
    }

    if (!plantao) {
        return (
            <div className={`${CARD_SHELL} flex-1 p-5 flex flex-col items-center justify-center gap-1.5 min-h-[200px] text-center`}>
                <Stethoscope size={22} className="text-slate-300" />
                <p className="text-[13px] font-semibold text-slate-600">Nenhum plantão à vista</p>
                <p className="text-[11px] font-medium text-slate-400">Sem escala daqui pra frente</p>
            </div>
        );
    }

    const date = addDays(plantao.data, offset);
    const rowsU = unidade ? rows.filter(s => !s.unidade || s.unidade === unidade) : rows;

    return (
        <div className={`${CARD_SHELL} flex-1 p-3 md:p-4 flex gap-3 min-h-[200px] overflow-hidden`}>
            <DayGrid label={fmtLabel(date)} loading={loading} rows={rowsU} />

            {/* Trilho de contexto: diz DE QUEM é o mapa e deixa navegar. É apoio
                da grade, então tudo aqui é mais leve que ela — sem botão cheio,
                sem caixa alta pesada. */}
            <div className="w-[136px] shrink-0 flex flex-col justify-between border-l border-slate-900/[0.06] pl-3 py-0.5">
                <div className="min-w-0">
                    <CardHeader icon={Stethoscope} title="Meu plantão" />
                    <p className="text-[13.5px] font-semibold text-slate-800 leading-tight truncate" title={plantao.hospital || undefined}>
                        {plantao.hospital || 'Hospital não informado'}
                    </p>
                    <p className="text-[10.5px] font-medium text-slate-400 leading-snug mt-0.5">
                        {plantao.ehHoje ? 'Escalado hoje' : 'Próximo plantão'}
                    </p>

                    <div className="flex items-center gap-1.5 mt-3">
                        <button onClick={() => setOffset(o => o - 1)} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/70 hover:bg-white text-slate-500 hover:text-slate-700 border border-white/70 transition-colors" title="Dia anterior"><ChevronLeft size={14} /></button>
                        <button onClick={() => setOffset(o => o + 1)} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/70 hover:bg-white text-slate-500 hover:text-slate-700 border border-white/70 transition-colors" title="Próximo dia"><ChevronRight size={14} /></button>
                    </div>
                    {offset !== 0 && (
                        <button onClick={() => setOffset(0)} className="mt-2 text-[10.5px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
                            Voltar pro plantão
                        </button>
                    )}
                </div>

                <CardLink onClick={() => navigate('/semana')}>
                    <span className="flex items-center gap-1">Abrir mapa completo <ArrowRight size={11} /></span>
                </CardLink>
            </div>
        </div>
    );
};

// ---------- DASHBOARD POR STATUS ----------

const fetchAllSurgeryStatuses = async () => {
    let all = [];
    let from = 0;
    const step = 1000;
    for (;;) {
        const { data, error } = await supabase
            .from('surgeries')
            .select('status, dataAgendado, unidade')
            .order('id', { ascending: true })
            .range(from, from + step - 1);
        if (error) { console.error('Erro ao agregar status:', error); break; }
        all = all.concat(data || []);
        if (!data || data.length < step) break;
        from += step;
    }
    return all;
};

// Ordem: Geral aparece primeiro ao abrir, depois Dia e Mês (idem no modo donut)
const FRAMES = [
    { mode: 'tiles', period: 'geral' },
    { mode: 'tiles', period: 'dia' },
    { mode: 'tiles', period: 'mes' },
    { mode: 'donut', period: 'geral' },
    { mode: 'donut', period: 'dia' },
    { mode: 'donut', period: 'mes' },
];
const PERIOD_LABEL = { dia: 'Hoje', mes: 'Este mês', geral: 'Geral' };
const MODE_LABEL = { tiles: 'Cards', donut: 'Gráfico' };

export const DashboardStatusWidget = () => {
    const { unidadeAtual } = useUnit();
    const [statuses, setStatuses] = useState([]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [{ data: gen }, surg] = await Promise.all([
                    supabase.from('settings').select('data').eq('id', 'general').maybeSingle(),
                    fetchAllSurgeryStatuses(),
                ]);
                if (active) {
                    setStatuses(Array.isArray(gen?.data?.status) ? gen.data.status : []);
                    setRows(surg);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Erro no dashboard de status:', error);
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, []);

    const todayStr = toDateStr(new Date());
    const monthStr = todayStr.slice(0, 7);
    const rowsU = filterUnit(rows, unidadeAtual);

    const base = useMemo(
        () => (statuses.length ? statuses : [...new Set(rowsU.map(r => r.status).filter(Boolean))]),
        [statuses, rowsU],
    );

    const colorOf = useMemo(() => {
        const m = {};
        base.forEach((st, i) => { m[st] = STATUS_PALETTE[i % STATUS_PALETTE.length]; });
        return (st) => m[st] || STATUS_PALETTE[8];
    }, [base]);

    const stats = useMemo(() => {
        const periods = ['dia', 'mes', 'geral'];
        const res = {};
        periods.forEach(p => { res[p] = { byStatus: {}, total: 0 }; base.forEach(st => { res[p].byStatus[st] = 0; }); });
        // Normaliza o status para a grafia oficial (case-insensitive), evitando buckets
        // duplicados como "Aguardando" vs "AGUARDANDO"
        const canonMap = {};
        base.forEach(st => { canonMap[String(st).trim().toLowerCase()] = st; });
        rowsU.forEach(r => {
            const raw = r.status || '';
            // Status fora da lista oficial (nulo/variação) caem em "OUTROS" → total sempre fecha
            const st = canonMap[String(raw).trim().toLowerCase()] || 'OUTROS';
            const d = String(r.dataAgendado || '');
            periods.forEach(p => {
                const match = p === 'dia' ? d.startsWith(todayStr) : p === 'mes' ? d.startsWith(monthStr) : true;
                if (match) {
                    if (res[p].byStatus[st] == null) res[p].byStatus[st] = 0;
                    res[p].byStatus[st] += 1;
                    res[p].total += 1;
                }
            });
        });
        return res;
    }, [base, rowsU, todayStr, monthStr]);

    const { mode, period } = FRAMES[frame];
    const cur = stats[period] || { byStatus: {}, total: 0 };
    const entries = Object.entries(cur.byStatus).map(([status, count]) => ({ status, count, color: colorOf(status) }));

    const donut = (() => {
        const positive = entries.filter(e => e.count > 0);
        const total = positive.reduce((s, e) => s + e.count, 0);
        if (!total) return { gradient: '#eef2f7', positive: [], total: 0 };
        let acc = 0;
        const stops = positive.map(e => {
            const start = (acc / total) * 360;
            acc += e.count;
            const end = (acc / total) * 360;
            return `${e.color.dot} ${start}deg ${end}deg`;
        });
        return { gradient: `conic-gradient(${stops.join(',')})`, positive, total };
    })();

    const go = (dir) => setFrame(f => (f + dir + FRAMES.length) % FRAMES.length);
    const isEmpty = !loading && rowsU.length === 0;

    return (
        <div className="flex-1 rounded-[2rem] p-5 flex flex-col bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:bg-white/50 transition-all min-h-[200px] overflow-hidden">
            <div className="flex justify-between items-center mb-3 shrink-0 gap-2">
                <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 min-w-0">
                    <LayoutDashboard size={16} className="shrink-0" /> <span className="truncate">Por Status</span>
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => go(-1)} className="p-1.5 rounded-lg bg-white/70 hover:bg-white text-slate-600 border border-white/60 transition-colors"><ChevronLeft size={14} /></button>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 px-2 min-w-[96px] text-center leading-tight">
                        {PERIOD_LABEL[period]}<span className="text-slate-400"> · {MODE_LABEL[mode]}</span>
                    </span>
                    <button onClick={() => go(1)} className="p-1.5 rounded-lg bg-white/70 hover:bg-white text-slate-600 border border-white/60 transition-colors"><ChevronRight size={14} /></button>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-400" size={22} /></div>
            ) : isEmpty ? (
                <div className="flex-1 flex items-center justify-center text-[11px] font-bold uppercase tracking-widest text-slate-500">Sem cirurgias cadastradas</div>
            ) : mode === 'tiles' ? (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2">
                    <div className="rounded-xl px-3 py-2 bg-indigo-600 text-white flex items-center justify-between shadow-sm shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-widest">Total Geral</span>
                        <span className="text-xl font-black leading-none">{cur.total}</span>
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                        {entries.map(e => (
                            <div key={e.status} className="rounded-xl px-2.5 py-2 flex flex-col" style={{ background: e.color.bg }}>
                                <span className="text-xl font-black leading-none" style={{ color: e.color.tx }}>{e.count}</span>
                                <span className="text-[8.5px] font-black uppercase tracking-wider mt-1 leading-tight" style={{ color: e.color.tx }}>{e.status}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-wrap items-center justify-center gap-5 overflow-y-auto custom-scrollbar pr-1 content-center">
                    <div className="relative w-[130px] h-[130px] shrink-0 rounded-full" style={{ background: donut.gradient }}>
                        <div className="absolute inset-[22px] bg-white rounded-full flex flex-col items-center justify-center">
                            <span className="text-2xl font-black text-slate-800 leading-none">{cur.total}</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">total</span>
                        </div>
                    </div>
                    <div className="flex-1 min-w-[140px] flex flex-col gap-1.5">
                        {(donut.positive.length ? donut.positive : entries).map(e => (
                            <div key={e.status} className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded shrink-0" style={{ background: e.color.dot }} />
                                <span className="flex-1 text-[11px] font-bold text-slate-700 truncate">{e.status}</span>
                                <span className="text-[11px] font-black text-slate-800">{e.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!loading && !isEmpty && (
                <div className="shrink-0 flex items-center justify-center gap-1.5 mt-3 pt-1">
                    {FRAMES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setFrame(i)}
                            aria-label={`Ver ${PERIOD_LABEL[FRAMES[i].period]} · ${MODE_LABEL[FRAMES[i].mode]}`}
                            className={`h-1.5 rounded-full transition-all ${i === frame ? 'w-5 bg-indigo-500' : 'w-1.5 bg-slate-300 hover:bg-slate-400'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
