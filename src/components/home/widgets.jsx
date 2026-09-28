import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { CalendarClock, CalendarRange, Check, X, Instagram, Activity, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMyUpcomingShifts, fetchEscalaPlantoes } from '../../utils/escalaShifts';
import { CARD_SHELL, CardHeader, CardLink } from './cardUI.jsx';

/*
 * Catálogo de widgets da Tela Inicial.
 * Cada widget é auto-contido (busca seus próprios dados) e recebe um "props bag"
 * comum vindo do <Slot>: { currentUser, refreshTrigger }.
 */

// ---------------------------------------------------------------------------
// AGENDA / COMPROMISSOS
// ---------------------------------------------------------------------------
export const AgendaPessoalWidget = ({ currentUser, refreshTrigger }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [quickAddDate, setQuickAddDate] = useState(null);
    const [quickAddText, setQuickAddText] = useState('');
    const [quickAddSaving, setQuickAddSaving] = useState(false);

    const generateDays = () => {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            days.push(date);
        }
        return days;
    };

    const weekDays = generateDays();

    const loadTasks = async () => {
        if (!currentUser?.id) return;
        try {
            let query = supabase
                .from('agenda_pessoal')
                .select('*, users!agenda_pessoal_user_id_fkey(name)');

            // Médicos veem apenas a própria agenda (atribuída a ou criada por eles).
            // Perfis administrativos enxergam todas as agendas para conseguir agendar para terceiros.
            const veApenasPropria = currentUser?.role === 'Médico' || currentUser?.role === 'Médico Coordenador';

            if (veApenasPropria) {
                query = query.or(`user_id.eq.${currentUser?.id},autor_id.eq.${currentUser?.id}`);
            }

            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            setTasks(data || []);
        } catch (error) {
            console.error("Erro ao carregar agenda", error);
        } finally {
            setLoading(false);
        }
    };

    const parseTaskText = (texto) => {
        const match = texto.match(/^\[(\d{2}:\d{2})\]\s(.*)/);
        if (match) {
            return { time: match[1], text: match[2] };
        }
        return { time: null, text: texto };
    };

    useEffect(() => {
        loadTasks();
    }, [currentUser?.id, refreshTrigger]);

    const toggleTask = async (id, currentStatus) => {
        try {
            const { error } = await supabase
                .from('agenda_pessoal')
                .update({ concluido: !currentStatus })
                .eq('id', id);
            if (error) throw error;
            setTasks(tasks.map(t => t.id === id ? { ...t, concluido: !currentStatus } : t));
        } catch {
            toast.error("Erro ao atualizar tarefa.");
        }
    };

    const handleQuickAdd = async () => {
        if (!quickAddText.trim() || !quickAddDate) return;
        setQuickAddSaving(true);
        try {
            const dateStr = formatDateString(quickAddDate);
            const { error } = await supabase
                .from('agenda_pessoal')
                .insert([{
                    user_id: currentUser.id,
                    texto: quickAddText,
                    data_agendada: dateStr,
                    autor_id: currentUser.id
                }]);
            if (error) throw error;
            toast.success("Adicionado!");
            setQuickAddText('');
            setQuickAddDate(null);
            loadTasks();
        } catch {
            toast.error("Erro ao salvar.");
        } finally {
            setQuickAddSaving(false);
        }
    };

    const formatDayName = (date) => {
        const nomes = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
        return nomes[date.getDay()];
    };

    const formatDateString = (date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    return (
        <div className="flex-1 rounded-[2.5rem] p-5 flex flex-col bg-white/40 backdrop-blur-3xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.06)] transition-all min-h-[300px] sm:min-h-[160px] relative overflow-hidden">
            <div className="flex flex-row gap-3 overflow-x-auto custom-scrollbar w-full pt-1 pb-2 px-1 h-full snap-x snap-mandatory sm:snap-none">
                {weekDays.map((date, idx) => {
                    const dateStr = formatDateString(date);
                    const todayStr = formatDateString(new Date());
                    const isToday = dateStr === todayStr;
                    const dayTasks = tasks.filter(t => t.data_agendada === dateStr || (!t.data_agendada && idx === 0));
                    const parsedTasks = dayTasks.map(t => ({ ...t, parsed: parseTaskText(t.texto) }));
                    const sortedTasks = parsedTasks.sort((a, b) => {
                        const timeA = a.parsed.time || "24:00";
                        const timeB = b.parsed.time || "24:00";
                        return timeA.localeCompare(timeB);
                    });

                    return (
                        <div key={idx} onClick={() => setQuickAddDate(date)} className={`cursor-pointer group/day flex flex-col min-w-[82%] sm:min-w-[130px] flex-1 snap-start rounded-[1.5rem] p-3 border shrink-0 transition-all duration-300 ${isToday ? 'bg-indigo-50/80 border-indigo-200/80 shadow-sm' : 'bg-white/40 border-white/50 hover:bg-white/70 hover:shadow-sm'}`}>
                            <div className={`flex items-center justify-between mb-3 border-b pb-2 ${isToday ? 'border-indigo-200/60' : 'border-white/50'}`}>
                                <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                                    {isToday ? 'HOJE' : formatDayName(date)}
                                </span>
                                <span className={`text-xl font-black leading-none drop-shadow-none ${isToday ? 'text-indigo-800' : 'text-slate-700'}`}>{date.getDate()}</span>
                            </div>

                            <div className="flex flex-col gap-2.5 overflow-y-auto custom-scrollbar pr-1 flex-1 min-h-[80px]">
                                {loading ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin opacity-50"></div>
                                    </div>
                                ) : sortedTasks.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center opacity-40 group-hover/day:opacity-70 transition-opacity pb-2">
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Livre</span>
                                    </div>
                                ) : (
                                    sortedTasks.map(task => {
                                        const { time, text } = task.parsed;
                                        return (
                                            <div key={task.id} className="flex items-start gap-2.5 group cursor-pointer p-1.5 -mx-1.5 rounded-xl hover:bg-white/60 transition-colors" onClick={(e) => { e.stopPropagation(); toggleTask(task.id, task.concluido); }}>
                                                <button
                                                    className={`w-4 h-4 mt-[2px] rounded-md border-2 flex items-center justify-center shrink-0 transition-colors shadow-sm ${task.concluido ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 group-hover:border-indigo-400 bg-white/80'}`}
                                                >
                                                    {task.concluido && <Check size={10} className="text-white" strokeWidth={4} />}
                                                </button>
                                                <div className="flex flex-col flex-1 pt-[1px]">
                                                    {time && <span className={`text-[11px] font-black mb-0.5 ${task.concluido ? 'text-slate-400' : 'text-indigo-600'}`}>{time}</span>}
                                                    <span className={`text-[11px] font-bold leading-snug tracking-normal ${task.concluido ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                                        {task.users?.name && (
                                                            <span className="block text-[8px] uppercase tracking-widest text-indigo-500 mb-[1px]">Para: {task.users.name.split(' ')[0]}</span>
                                                        )}
                                                        {text}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {quickAddDate && (
                <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 rounded-[2.5rem] transition-all" onClick={() => setQuickAddDate(null)}>
                    <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[2rem] shadow-2xl border border-white w-full max-w-sm flex flex-col gap-3 animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-1.5"><CalendarClock size={14}/> {quickAddDate.getDate()} de {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][quickAddDate.getMonth()]}</span>
                            <button onClick={() => setQuickAddDate(null)} className="text-slate-400 hover:text-rose-500 bg-slate-100 hover:bg-rose-50 p-1 rounded-full transition-colors"><X size={14}/></button>
                        </div>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Compromisso (Ex: [14:00] Reunião)..."
                            className="w-full text-xs font-semibold p-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 shadow-sm"
                            value={quickAddText}
                            onChange={e => setQuickAddText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                        />
                        <button
                            onClick={handleQuickAdd}
                            disabled={!quickAddText.trim() || quickAddSaving}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all flex justify-center items-center h-10 shadow-md hover:shadow-lg"
                        >
                            {quickAddSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Salvar Compromisso'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// PRÓXIMOS PLANTÕES
// ---------------------------------------------------------------------------
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// "qua, 9 set" — data por extenso curto em vez de etiqueta em caixa alta. É
// informação de apoio: precisa ser legível, não gritada.
const dataDoPlantao = (d) => `${DIAS_CURTOS[d.getDay()]}, ${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`;

const quandoLabel = (parsedDate) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dias = Math.ceil((parsedDate - hoje) / 86400000);
    if (dias === 0) return 'Hoje';
    if (dias === 1) return 'Amanhã';
    return `Em ${dias} dias`;
};

// O horário do plantão descreve o turno melhor que o nome do setor, então o
// turno é derivado dele quando dá.
const turnoDoPlantao = (shift) => {
    const t = shift.time || '';
    // A ordem importa: os intervalos fechados primeiro, os soltos só no fim.
    // '07-19h' contém '19h' — testar o solto antes marcaria um diurno como
    // noturno.
    if (t.includes('19-07') || t.includes('20-08') || t.includes('19:00-07')) return 'Noturno';
    if (t.includes('07-19') || t.includes('08-20') || t.includes('07:00-19')) return 'Diurno';
    if (t.includes('13-19') || t.includes('13:00')) return 'Tarde';
    if (t.includes('07-13') || t.includes('07:00-13')) return 'Manhã';
    if (t.includes('19:00') || t.includes('19h')) return 'Noturno';
    if (t.includes('07:00') || t.includes('07h')) return 'Diurno';
    return shift.period;
};

export const ProximosPlantoesWidget = ({ currentUser }) => {
    const navigate = useNavigate();
    const [upcomingShifts, setUpcomingShifts] = useState([]);
    const [loadingShifts, setLoadingShifts] = useState(true);

    useEffect(() => {
        const fetchShifts = async () => {
            try {
                setLoadingShifts(true);
                const userName = currentUser?.name || currentUser?.nome || currentUser?.displayName;
                if (!userName) {
                    setLoadingShifts(false);
                    return;
                }

                // Lê a tabela relacional escala_plantoes (mesma fonte da grade da
                // Escala). O blob settings.escala fica defasado em edições de célula.
                const assignments = await fetchEscalaPlantoes(supabase);
                const myShifts = getMyUpcomingShifts(assignments, userName).slice(0, 8);
                setUpcomingShifts(myShifts);
            } catch (error) {
                console.error("Erro ao buscar plantões", error);
            } finally {
                setLoadingShifts(false);
            }
        };

        if (currentUser) {
            fetchShifts();
        }
    }, [currentUser]);

    return (
        <div className={`${CARD_SHELL} p-4 flex flex-col flex-1 min-w-0 overflow-hidden min-h-[250px] md:min-h-0`}>
            <CardHeader
                icon={CalendarClock}
                title="Próximos plantões"
                action={<CardLink onClick={() => navigate('/escala')}>Ver tudo</CardLink>}
            />

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar -mx-1 px-1">
                {loadingShifts ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 size={16} className="animate-spin text-indigo-300" />
                    </div>
                ) : upcomingShifts.length > 0 ? (
                    /* Lista com fios finos, não uma pilha de cartões: seis cartões
                       empilhados num card já é caixa dentro de caixa. */
                    <div className="divide-y divide-slate-900/[0.06]">
                        {upcomingShifts.map((shift, idx) => {
                            const proximo = idx === 0;
                            const turno = turnoDoPlantao(shift);
                            return (
                                <button
                                    key={idx}
                                    onClick={() => navigate('/escala')}
                                    className="w-full text-left flex items-start gap-2.5 py-2.5 group/turno"
                                >
                                    {/* Ponto no lugar de fundo colorido: marca o próximo
                                        sem transformar a linha inteira num bloco. */}
                                    <span className={`mt-[7px] w-[5px] h-[5px] rounded-full shrink-0 ${proximo ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[12.5px] font-semibold text-slate-800 leading-snug truncate group-hover/turno:text-indigo-600 transition-colors">
                                            {shift.hospitalName}{turno ? <span className="text-slate-500 font-medium"> · {turno}</span> : null}
                                        </p>
                                        <p className="text-[10.5px] font-medium text-slate-500/90 leading-snug mt-0.5 truncate">
                                            {dataDoPlantao(shift.parsedDate)}{shift.time ? ` · ${String(shift.time).replace('-', '–')}` : ''}
                                        </p>
                                    </div>
                                    <span className={`text-[10px] font-medium shrink-0 mt-[2px] ${proximo ? 'text-indigo-500' : 'text-slate-400'}`}>
                                        {quandoLabel(shift.parsedDate)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1.5">
                        <CalendarRange size={20} className="text-slate-300" />
                        <p className="text-[11.5px] font-medium text-slate-400">Nenhum plantão escalado</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// SUPORTE RÁPIDO
// ---------------------------------------------------------------------------
export const SuporteRapidoWidget = () => {
    const { theme } = useWhiteLabel();

    const handleWhatsappClick = (link) => {
        if (!link) return toast.error("WhatsApp não configurado!");
        const finalLink = link.startsWith('http') ? link : `https://${link}`;
        window.open(finalLink, '_blank');
    };

    const handleInstagramClick = (link) => {
        if (!link) return toast.error("Instagram não configurado!");
        const finalLink = link.startsWith('http') ? link : `https://${link}`;
        window.open(finalLink, '_blank');
    };

    const formatContactName = (name) => {
        if (!name) return { name: 'Suporte', desc: '' };
        let n = name.replace(/falar com/i, '').trim();
        let parts = n.split('-');
        if (parts.length > 1) {
            return { name: parts[0].trim(), desc: parts.slice(1).join('-').trim() };
        }
        return { name: n, desc: '' };
    };

    const ast1 = formatContactName(theme.hubAssistant1Name);
    const ast2 = formatContactName(theme.hubAssistant2Name);

    return (
        <div className="shrink-0 h-[140px] rounded-[2rem] p-4 flex flex-col justify-center bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:bg-white/50 transition-all">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 text-center">
                Suporte Rápido
            </h3>
            <div className="flex flex-row items-center justify-center gap-4">
                {/* Assistente 1 */}
                <div className="flex flex-col items-center group cursor-pointer flex-1" onClick={() => handleWhatsappClick(theme.hubAssistant1Whatsapp)}>
                    <div className="w-10 h-10 rounded-full overflow-hidden mb-1.5 bg-white/70 border-2 border-transparent group-hover:border-white/400 flex items-center justify-center transition-all shadow-lg hover:shadow-xl">
                        {theme.hubAssistant1Photo ? (
                            <img src={theme.hubAssistant1Photo} className="w-full h-full object-cover" alt="Assistente 1" />
                        ) : (
                            <span className="text-sm font-black text-slate-600">A1</span>
                        )}
                    </div>
                    <span className="text-[9px] font-bold text-slate-700 text-center uppercase tracking-wider group-hover:text-slate-800 transition-colors">{ast1.name}</span>
                    {ast1.desc && <span className="text-[8px] font-semibold text-slate-500 text-center uppercase tracking-widest leading-none mt-0.5">{ast1.desc}</span>}
                </div>

                {/* Assistente 2 */}
                <div className="flex flex-col items-center group cursor-pointer flex-1" onClick={() => handleWhatsappClick(theme.hubAssistant2Whatsapp)}>
                    <div className="w-10 h-10 rounded-full overflow-hidden mb-1.5 bg-white/70 border-2 border-transparent group-hover:border-white/400 flex items-center justify-center transition-all shadow-lg hover:shadow-xl">
                        {theme.hubAssistant2Photo ? (
                            <img src={theme.hubAssistant2Photo} className="w-full h-full object-cover" alt="Assistente 2" />
                        ) : (
                            <span className="text-sm font-black text-slate-600">A2</span>
                        )}
                    </div>
                    <span className="text-[9px] font-bold text-slate-700 text-center uppercase tracking-wider group-hover:text-slate-800 transition-colors">{ast2.name}</span>
                    {ast2.desc && <span className="text-[8px] font-semibold text-slate-500 text-center uppercase tracking-widest leading-none mt-0.5">{ast2.desc}</span>}
                </div>

                {/* Instagram */}
                <div className="flex flex-col items-center group cursor-pointer flex-1" onClick={() => handleInstagramClick(theme.hubInstagramLink)}>
                    <div className="w-10 h-10 bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] rounded-full flex items-center justify-center mb-1.5 shadow-lg opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all">
                        <Instagram size={16} className="text-slate-800" />
                    </div>
                    <span className="text-[9px] font-bold text-slate-600 text-center uppercase tracking-wider group-hover:text-slate-800 transition-colors">Insta</span>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// AVISOS (texto institucional)
// ---------------------------------------------------------------------------
export const AvisosWidget = () => {
    const { theme } = useWhiteLabel();
    const marqueeText = theme.marqueeText;

    return (
        <div className="flex-1 rounded-[2rem] p-6 flex items-center justify-center bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:bg-white/50 transition-all min-h-[120px]">
            {marqueeText ? (
                <p className="text-[13px] md:text-[14px] lg:text-[15px] font-medium text-slate-700 leading-relaxed tracking-wide text-center drop-shadow-sm px-4">
                    "{marqueeText}"
                </p>
            ) : (
                <div className="flex flex-col items-center justify-center text-center opacity-80">
                    <Activity size={24} className="text-slate-500 mb-2"/>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nenhum aviso importante</p>
                </div>
            )}
        </div>
    );
};
