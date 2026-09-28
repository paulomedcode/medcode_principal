import React from 'react';
import { Clock } from 'lucide-react';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { useAuth } from '../contexts/AuthContext';

// Landscape A4 has exact width 1123px and height 794px.
// Landscape A4 has exact width 1123px and height 794px.
const ROW_HEIGHT = 80; 
const PIXELS_PER_MINUTE = ROW_HEIGHT / 60;
const START_HOUR = 7;  
const END_HOUR = 18;   
const EXTRA_MINUTES = 10; // Extra room until 19:10

const PrintableWeeklyMap = ({ surgeries, weekDays, temposByCode, temposByName, pageNumber = 1 }) => {
    const { theme } = useWhiteLabel();
    const { currentUser } = useAuth();

    const dataImpressao = new Date().toLocaleString('pt-BR', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });

    // --- Helpers ---
    function normalizeKey(str) {
        return (str || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function parseDurationMinutes(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
        const raw = String(value).trim().toLowerCase();
        if (!raw) return null;
        const hhmm = raw.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
        if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
        const hMatch = raw.match(/(\d{1,2})\s*h/);
        const mMatch = raw.match(/(\d{1,3})\s*m/);
        if (hMatch || mMatch) return (hMatch ? Number(hMatch[1]) : 0) * 60 + (mMatch ? Number(mMatch[1]) : 0);
        const digits = raw.match(/(\d{1,3})/);
        if (digits) return Number.isFinite(Number(digits[1])) && Number(digits[1]) > 0 ? Number(digits[1]) : null;
        return null;
    }

    const addMinutesToTime = (hhmm, minutesToAdd) => {
        if (!hhmm) return '';
        const [h, m] = hhmm.split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
        const total = h * 60 + m + minutesToAdd;
        const hh = Math.floor((total % (24 * 60)) / 60);
        const mm = total % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    const getProcedureName = (surgery) => {
        const value = surgery?.procedimento ?? surgery?.procedimentoNome ?? surgery?.nomeProcedimento ?? surgery?.descricaoProcedimento ?? surgery?.descricao ?? surgery?.procedimentoSigtap ?? '';
        return String(value || '').trim();
    };

    const getProcedureCode = (surgery) => {
        const code = surgery?.codigoSus ?? surgery?.codigoSUS ?? surgery?.codigo_sus ?? surgery?.codigoProcedimento ?? surgery?.codProcedimento ?? surgery?.procedimentoCodigo ?? surgery?.sus ?? null;
        return code ? String(code).trim() : null;
    };

    const getDurationMinutesForSurgery = (surgery) => {
        const rawFromSurgery = surgery?.duracao ?? surgery?.duracaoMinutos ?? surgery?.tempo ?? surgery?.tempoMin ?? surgery?.tempoPrevisto ?? null;
        const direct = parseDurationMinutes(rawFromSurgery);
        if (direct && direct > 0) return direct;
        const code = getProcedureCode(surgery);
        if (code && temposByCode?.has(code)) return temposByCode.get(code);
        const name = getProcedureName(surgery);
        const key = normalizeKey(name);
        if (key && temposByName?.has(key)) return temposByName.get(key);
        return 60;
    };

    const formatDateHeader = (dateStr) => {
        const date = new Date(dateStr + 'T12:00:00');
        const dia = String(date.getDate()).padStart(2, '0');
        const mes = String(date.getMonth() + 1).padStart(2, '0');
        const semana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
        return `${semana[date.getDay()]} ${dia}/${mes}`;
    };

    const formatSmartName = (fullName) => {
        if (!fullName) return '';
        const parts = fullName.trim().toUpperCase().split(/\s+/);
        if(parts.length > 2) return `${parts[0]} ${parts[parts.length-1]}`;
        return parts.join(' ');
    };

    const getPriorityStyles = (prioridadeRaw) => {
        const p = String(prioridadeRaw || '').trim().toUpperCase();

        if (p === 'EMERGÊNCIA' || p === 'EMERGENCIA') {
            return {
                badge: 'bg-rose-50/70 text-rose-600 border-rose-200/50 font-bold',
                card: 'border-slate-200 border-l-[4px] border-l-rose-500 border-y border-r',
                shadow: 'shadow-sm'
            };
        }

        if (p === 'URGÊNCIA' || p === 'URGENCIA') {
            return {
                badge: 'bg-amber-50/70 text-amber-600 border-amber-200/50 font-bold',
                card: 'border-slate-200 border-l-[4px] border-l-amber-500 border-y border-r',
                shadow: 'shadow-sm'
            };
        }

        if (p === 'PRIORIDADE') {
            return {
                badge: 'bg-indigo-50/70 text-indigo-500 border-indigo-200/50 font-bold',
                card: 'border-slate-200 border-l-[4px] border-l-indigo-500 border-y border-r',
                shadow: 'shadow-sm'
            };
        }

        if (p === 'BLOQUEIO') {
            return {
                badge: 'bg-slate-50 text-slate-500 border-slate-200/60 font-bold',
                card: 'border-slate-300 border-[2px] border-dashed bg-slate-50/50 font-bold',
                shadow: 'shadow-none'
            };
        }

        return {
            badge: 'bg-blue-50/70 text-blue-500 border-blue-200/50 font-bold',
            card: 'border-slate-200 border-l-[4px] border-l-blue-400 border-y border-r',
            shadow: 'shadow-sm'
        };
    };

    const timeSlots = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
    const TOTAL_MINUTES_GRID = timeSlots.length * 60 + EXTRA_MINUTES;
    const TOTAL_HEIGHT = (TOTAL_MINUTES_GRID / 60) * ROW_HEIGHT; 

    return (
        <div className="bg-slate-50/30 pt-4 pb-8 px-4 w-full text-slate-800 font-sans flex flex-col justify-start print:h-auto gap-3">
            
            {/* CABEÇALHO */}
            <div className="flex justify-between items-end border-b border-slate-200 pb-2 shrink-0 px-1">
                <div className="flex items-center gap-4">
                    {theme.logoUrl && <img src={theme.logoUrl} alt="Logo" className="h-[32px] w-auto object-contain drop-shadow-sm" />}
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-normal uppercase leading-none mb-1">Mapa Semanal</h1>
                        <h2 className="text-[11px] font-bold uppercase text-slate-500 tracking-widest">{theme.nomeInstituicao}</h2>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end">
                    <p className="text-[12px] font-black uppercase text-blue-700 bg-blue-50 px-4 py-1.5 rounded-lg border border-blue-100 shadow-sm">
                        {weekDays[0].split('-').reverse().join('/')} até {weekDays[weekDays.length-1].split('-').reverse().join('/')}
                    </p>
                </div>
            </div>

            {/* GRID PRINCIPAL */}
            <div className="flex border border-slate-200 rounded-lg relative bg-white shrink-0 shadow-sm overflow-hidden">
                
                {/* Coluna Horários */}
                <div className="w-10 border-r border-slate-200 shrink-0 bg-slate-50/50 flex flex-col">
                    <div className="h-8 border-b border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                        <Clock size={12} className="text-slate-500" />
                    </div>
                    {timeSlots.map((hour, idx) => (
                        <div 
                            key={hour} 
                            className={`border-b border-slate-100 flex items-start justify-center pt-1.5 shrink-0 box-border ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`} 
                            style={{ height: `${ROW_HEIGHT}px` }}
                        >
                            <span className="text-[10px] font-black text-slate-500">{String(hour).padStart(2, '0')}h</span>
                        </div>
                    ))}
                    <div style={{ height: `${(EXTRA_MINUTES / 60) * ROW_HEIGHT}px` }} className="shrink-0 box-border bg-white" />
                </div>

                {/* Colunas dos Dias (7 dias) */}
                <div className="flex-1 flex relative">
                    {weekDays.map((dayDate, dayIndex) => {
                        const daySurgeries = surgeries.filter(s => s.dataAgendado === dayDate);
                        
                        // Organizar para evitar sobreposição excessiva
                        // Precisamos calcular uma "coluna" virtual para cada evento que se sobrepõe
                        const placedSurgeries = [];
                        
                        daySurgeries.sort((a,b) => {
                            const timeA = a.horario ? parseInt(a.horario.split(':')[0])*60 + parseInt(a.horario.split(':')[1]) : 0;
                            const timeB = b.horario ? parseInt(b.horario.split(':')[0])*60 + parseInt(b.horario.split(':')[1]) : 0;
                            return timeA - timeB;
                        }).forEach(surgery => {
                            const durationMin = getDurationMinutesForSurgery(surgery);
                            const [hStr, mStr] = (surgery.horario || '00:00').split(':');
                            const h = parseInt(hStr) || 0;
                            const m = parseInt(mStr) || 0;
                            const startMinutes = (h - START_HOUR) * 60 + m;
                            const endMinutes = startMinutes + durationMin;
                            
                            // Find overlapping
                            const overlaps = placedSurgeries.filter(p => p.startMinutes < endMinutes && p.endMinutes > startMinutes);
                            
                            // Find first available virtual column
                            let vCol = 0;
                            while(overlaps.some(p => p.vCol === vCol)) {
                                vCol++;
                            }
                            
                            placedSurgeries.push({
                                ...surgery,
                                startMinutes,
                                endMinutes,
                                h, m, durationMin,
                                vCol,
                                totalCols: 1 // Vão ser atualizados depois
                            });
                        });
                        
                        // Update total cols for clustered overlapping ones
                        placedSurgeries.forEach(p => {
                            const overlaps = placedSurgeries.filter(o => o.startMinutes < p.endMinutes && o.endMinutes > p.startMinutes);
                            const maxCol = Math.max(...overlaps.map(o => o.vCol));
                            p.totalCols = Math.max(p.totalCols, maxCol + 1);
                        });

                        return (
                            <div key={dayDate} className="flex-1 border-r border-slate-200 last:border-r-0 relative">
                                <div className={`h-8 border-b border-slate-200 flex items-center justify-center font-black text-[11px] uppercase tracking-wider z-20 relative shadow-sm ${dayIndex % 2 === 0 ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-800'}`}>
                                    {formatDateHeader(dayDate)}
                                </div>

                                <div style={{ position: 'relative', height: `${TOTAL_HEIGHT}px`, width: '100%' }}>
                                    
                                    {/* Linhas de fundo */}
                                    <div className="absolute inset-0 z-0 flex flex-col pointer-events-none">
                                        {timeSlots.map((hour, idx) => (
                                            <div 
                                                key={hour} 
                                                className={`border-b border-slate-100 w-full shrink-0 box-border ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`} 
                                                style={{ height: `${ROW_HEIGHT}px` }}
                                            />
                                        ))}
                                        <div style={{ height: `${(EXTRA_MINUTES / 60) * ROW_HEIGHT}px` }} className="w-full shrink-0 box-border bg-white" />
                                    </div>

                                    {/* Eventos */}
                                    {placedSurgeries.map(surgery => {
                                        if (surgery.h < START_HOUR || surgery.h > 21) return null; 

                                        const topPct = (surgery.startMinutes / TOTAL_MINUTES_GRID) * 100;
                                        const heightPct = (surgery.durationMin / TOTAL_MINUTES_GRID) * 100;
                                        
                                        // Distribuir na largura da coluna do dia baseado na coluna virtual do evento
                                        const widthPct = 95 / surgery.totalCols;
                                        const leftPct = (surgery.vCol * widthPct) + 1;

                                        const style = {
                                            top: `${topPct}%`,
                                            height: `${heightPct}%`,
                                            left: `${leftPct}%`,
                                            width: `${widthPct}%`,
                                            position: 'absolute',
                                            zIndex: 10 + surgery.vCol
                                        };

                                        const endTime = addMinutesToTime(surgery.horario, surgery.durationMin);
                                        const procedimento = getProcedureName(surgery).toUpperCase();
                                        const pacienteCompleto = String(surgery.nomePaciente || surgery.paciente || '').toUpperCase().trim();
                                        
                                        const statusUpper = String(surgery.status || '').toUpperCase();
                                        const prioridade = String(surgery.prioridade || 'ELETIVA').toUpperCase();
                                        const isRealizado = statusUpper === 'REALIZADO' || statusUpper === 'CONCLUÍDA' || statusUpper === 'CONCLUÍDO';
                                        const isSuspensa = statusUpper === 'SUSPENSA REAGENDAR' || statusUpper === 'SUSPENSA' || statusUpper === 'SUSPENSO';
                                        const isNaoInternou = statusUpper === 'AGUARDANDO' && String(surgery.observacoes || '').includes('[⚠️ NÃO INTERNOU');
                                        
                                        const cirurgiaoClean = (surgery.cirurgiao || '').replace(/^dr\.?\s+/i, '').trim().toUpperCase();
                                        const cirurgiao = cirurgiaoClean ? `${cirurgiaoClean.split(' ').slice(0, 2).join(' ')}` : '---';

                                        const dob = surgery.nascimento || surgery.dataNascimento;
                                        let idade = '';
                                        if (dob) {
                                            const birth = new Date(dob);
                                            const today = new Date();
                                            let age = today.getFullYear() - birth.getFullYear();
                                            if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
                                            idade = age >= 0 ? `${age}A` : '';
                                        }

                                        const anestesia = String(surgery.anestesia || '---').toUpperCase();
                                        const cidade = String(surgery.municipio || '').toUpperCase().trim();

                                        const pStyle = getPriorityStyles(prioridade);
                                        let cardBgClass = 'bg-white';
                                        let cardBorderClass = pStyle.card;

                                        if (isRealizado) {
                                            cardBgClass = 'bg-slate-100/80';
                                            cardBorderClass = "border-slate-200 border-l-[4px] border-l-emerald-500 border-y border-r";
                                        } else if (isSuspensa) {
                                            cardBgClass = 'bg-orange-50/90';
                                            cardBorderClass = "border-slate-200 border-l-[4px] border-l-orange-500 border-y border-r";
                                        } else if (isNaoInternou) {
                                            cardBgClass = 'bg-rose-50/90';
                                            cardBorderClass = "border-slate-200 border-l-[4px] border-l-rose-500 border-y border-r";
                                        } else if (statusUpper === 'BLOQUEIO') {
                                            cardBgClass = 'bg-rose-50/90 text-rose-900';
                                            cardBorderClass = "border-2 border-rose-300 border-dashed font-bold";
                                        }

                                        const combinedStyle = {
                                            ...style,
                                            minHeight: 'min-content'
                                        };

                                        return (
                                            <div key={surgery.id} style={combinedStyle} className="py-[0.5px]">
                                                <div className={`h-full w-full ${cardBgClass} rounded ${cardBorderClass} shadow-sm px-[2.5px] py-[1.5px] flex flex-col justify-start relative`}>
                                                    
                                                    {statusUpper === 'BLOQUEIO' ? (
                                                        <div className="flex flex-col items-center justify-center h-full text-center p-[1px] w-full relative">
                                                            <div className="font-extrabold text-[9px] text-rose-900 tracking-normal mb-[1px] bg-rose-100/80 px-[2px] py-[1px] rounded-[2px] border border-rose-200">
                                                                {surgery.horario} - {endTime}
                                                            </div>
                                                            <div className="text-[9px] font-black text-rose-950 uppercase leading-tight whitespace-normal break-words">
                                                                {procedimento}
                                                            </div>
                                                            <div className="text-[7px] font-bold text-rose-600 mt-[1px] uppercase tracking-widest bg-rose-100/80 px-[2px] py-[1px] rounded-full inline-block border border-rose-200/50">
                                                                🔒 Bloqueado
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* Bloco 1: Topo */}
                                                            <div className="flex items-start justify-between shrink-0 gap-[2px] mb-[1px]">
                                                                <span className="text-[9.5px] font-black text-slate-900 tracking-normal leading-none whitespace-nowrap pt-[1px]">
                                                                    {surgery.horario} - {endTime}
                                                                </span>
                                                                <div className={`px-[3px] py-[1px] rounded-[3px] text-[7px] font-bold uppercase tracking-wide border whitespace-nowrap ${pStyle.badge.replace('bg-', 'bg-white/90 border-').replace('text-', 'text-')}`}>
                                                                    {prioridade}
                                                                </div>
                                                            </div>

                                                            {/* Bloco 2: Procedimento */}
                                                            <div className="flex items-start shrink-0 mb-[1px]">
                                                                <div className="text-[10.5px] font-black text-slate-900 uppercase leading-[1.05] whitespace-normal break-words">
                                                                    {procedimento}
                                                                </div>
                                                            </div>

                                                            {/* Bloco 3: Paciente */}
                                                            <div className="flex items-start shrink-0 mb-[1px]">
                                                                <div className="text-[10px] font-extrabold text-slate-700 uppercase leading-[1.05] whitespace-normal break-words pt-[1px]">
                                                                    {pacienteCompleto} {idade && <span className="text-[9px] text-slate-500 font-medium ml-[1.5px]">({idade})</span>}
                                                                </div>
                                                            </div>

                                                            {/* Bloco 4: Médico */}
                                                            <div className="flex flex-col shrink-0 mt-auto">
                                                                <div className="text-[9px] font-bold text-slate-500 uppercase truncate">
                                                                    Dr. {cirurgiao}
                                                                </div>
                                                            </div>

                                                            {/* Divisor */}
                                                            <div className="w-full h-px bg-slate-100 my-[1px] shrink-0" />

                                                            {/* Rodapé: Chips */}
                                                            <div className="flex items-center gap-[2px] overflow-hidden shrink-0 pb-0">
                                                                {surgery.convenio && (
                                                                    <span className="px-[3px] py-[1px] bg-slate-50 text-slate-600 rounded-[3px] text-[7px] font-bold uppercase tracking-wide shrink-0 border border-slate-200 max-w-[45px] truncate leading-none">
                                                                        {surgery.convenio}
                                                                    </span>
                                                                )}
                                                                {cidade && (
                                                                    <span className="px-[3px] py-[1px] bg-slate-50 text-slate-600 rounded-[3px] text-[7px] font-bold uppercase tracking-wide truncate border border-slate-200 leading-none">
                                                                        {cidade}
                                                                    </span>
                                                                )}
                                                                {anestesia !== '---' && (
                                                                    <span className="px-[3px] py-[1px] bg-slate-50 text-slate-600 rounded-[3px] text-[7px] font-bold uppercase tracking-wide shrink-0 border border-slate-200 leading-none">
                                                                        {anestesia}
                                                                    </span>
                                                                )}
                                                                {surgery.sala && (
                                                                    <span className="inline-block ml-auto text-[6.5px] font-black uppercase text-blue-500 px-[3px] py-[1px] rounded bg-blue-50 border border-blue-100 leading-none shrink-0 truncate max-w-[40%]">
                                                                        {surgery.sala}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RODAPÉ */}
            <div className="mt-1 px-1 flex justify-between items-center shrink-0">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Documento Restrito - Uso Interno - Pág {pageNumber} de 2</span>
                <span className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-sm border border-slate-200">
                    Gerado por <strong className="text-slate-700 uppercase">{currentUser?.name || currentUser?.displayName || currentUser?.email || 'Sistema'}</strong> em: <strong className="text-slate-700">{dataImpressao}</strong>
                </span>
            </div>
        </div>
    );
};

export default PrintableWeeklyMap;
