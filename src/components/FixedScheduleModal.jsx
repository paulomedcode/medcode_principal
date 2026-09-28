import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { X, Save, Loader2, Calendar, Plus, Trash2, Clock, User, Stethoscope, Printer, Copy, Layers, ChevronLeft, ChevronRight, CheckCircle2, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { format, parse, addMonths, subMonths, startOfMonth, startOfWeek, endOfMonth, differenceInCalendarWeeks, addDays, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAction } from '../utils/logger';

export const FixedScheduleModal = ({ isOpen, onClose, rooms = [], allRooms = [], hiddenRooms = [], setHiddenRooms = () => {} }) => {
    const { theme } = useWhiteLabel();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    
    // Monthly states
    const [globalData, setGlobalData] = useState({});
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [scheduleData, setScheduleData] = useState({});
    const [settingsData, setSettingsData] = useState({ especialidades: [] });
    const [medicos, setMedicos] = useState([]);

    // UI states
    const [editingBlock, setEditingBlock] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showRoomModal, setShowRoomModal] = useState(false);

    // DYNAMIC WEEKS BASED ON SELECTED MONTH
    const monthDateObj = parse(selectedMonth, 'yyyy-MM', new Date());
    const monthStart = startOfMonth(monthDateObj);
    const monthEnd = endOfMonth(monthDateObj);
    const numWeeks = differenceInCalendarWeeks(monthEnd, monthStart, { weekStartsOn: 1 }) + 1;
    const WEEKS = Array.from({ length: numWeeks }, (_, i) => i + 1);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });

    const getDateForCell = (weekNum, dayId) => {
        const weekIndex = weekNum - 1;
        const dayOffset = dayId === 0 ? 6 : dayId - 1; 
        return addDays(gridStart, weekIndex * 7 + dayOffset);
    };
    const DAYS = [
        { id: 1, label: 'Segunda', short: 'Seg' },
        { id: 2, label: 'Terça', short: 'Ter' },
        { id: 3, label: 'Quarta', short: 'Qua' },
        { id: 4, label: 'Quinta', short: 'Qui' },
        { id: 5, label: 'Sexta', short: 'Sex' },
        { id: 6, label: 'Sábado', short: 'Sab' },
        { id: 0, label: 'Domingo', short: 'Dom' }
    ];

    const COLORS = [
        { id: 'blue',  class: 'bg-blue-100 text-blue-800 border-blue-300' },
        { id: 'emerald', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
        { id: 'purple', class: 'bg-purple-100 text-purple-800 border-purple-300' },
        { id: 'amber', class: 'bg-amber-100 text-amber-800 border-amber-300' },
        { id: 'rose', class: 'bg-rose-100 text-rose-800 border-rose-300' },
        { id: 'indigo', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
        { id: 'slate', class: 'bg-white/80 text-slate-900 drop-shadow-none border-slate-400' }
    ];

    useEffect(() => {
        if (!isOpen) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                // Buscar configurações gerais (especialidades, etc)
                const genRes = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
                if (genRes.data && genRes.data.data) {
                    setSettingsData({
                        especialidades: genRes.data.data.especialidades || []
                    });
                }
                
                // Buscar médicos
                const { data: medicosData } = await supabase.from('users').select('*').in('role', ['Médico', 'Médico Coordenador']).eq('status', 'Ativo').order('name', { ascending: true });
                if (medicosData) {
                    setMedicos(medicosData);
                }

                // Buscar Programação Fixa Relacional (apenas o mês selecionado: evita o teto de 1000 linhas da API e refetch desnecessário)
                const { data: fixedRows, error: fixedError } = await supabase
                    .from('cirurgias_programacao_fixa')
                    .select('*')
                    .eq('mes', selectedMonth);
                if (fixedError) {
                    console.error("Tabela cirurgias_programacao_fixa pode não existir ainda. Rode o script SQL.", fixedError);
                    toast.error("Erro ao carregar programação fixa.");
                    setScheduleData({});
                    setGlobalData(prev => ({ ...prev, [selectedMonth]: {} }));
                    return;
                }

                const monthData = {};
                (fixedRows || []).forEach(row => {
                    if (!monthData[row.semana]) monthData[row.semana] = {};
                    if (!monthData[row.semana][row.sala]) monthData[row.semana][row.sala] = [];

                    monthData[row.semana][row.sala].push({
                        id: row.id,
                        dayOfWeek: Number(row.dia),
                        periodo: row.periodo,
                        startHour: row.time_start,
                        endHour: row.time_end,
                        especialidade: row.especialidade,
                        medico: row.medico,
                        procedimento: row.procedimento,
                        telefone: row.telefone,
                        color: row.color || 'blue',
                        observacoes: row.observacoes || ''
                    });
                });

                setGlobalData(prev => ({ ...prev, [selectedMonth]: monthData }));
                setScheduleData(monthData);
            } catch (err) {
                console.error(err);
                toast.error("Erro ao carregar programação fixa.");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [isOpen, selectedMonth]);

    // Centraliza as gravações no banco: controla o indicador "Salvando..." e dá feedback de erro real
    const runDbWrite = async (label, query) => {
        setSaving(true);
        try {
            const { error } = await query;
            if (error) {
                console.error(`Erro ao salvar (${label}):`, error);
                toast.error(`Erro ao salvar: ${label} (${error.message || 'falha no banco'})`);
                return false;
            }
            return true;
        } catch (err) {
            console.error(`Erro ao salvar (${label}):`, err);
            toast.error(`Erro ao salvar: ${label}`);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleMonthChange = (e) => {
        const newMonth = e.target.value;
        setSelectedMonth(newMonth);
        setScheduleData(globalData[newMonth] || {});
    };

    const handlePrevMonth = () => {
        const d = parse(selectedMonth, 'yyyy-MM', new Date());
        const pd = subMonths(d, 1);
        const newM = format(pd, 'yyyy-MM');
        setSelectedMonth(newM);
        setScheduleData(globalData[newM] || {});
    };

    const handleNextMonth = () => {
        const d = parse(selectedMonth, 'yyyy-MM', new Date());
        const nd = addMonths(d, 1);
        const newM = format(nd, 'yyyy-MM');
        setSelectedMonth(newM);
        setScheduleData(globalData[newM] || {});
    };

    const handleReplicateToNextMonth = async () => {
        if (!scheduleData || Object.keys(scheduleData).length === 0) {
            return toast.error("A grade deste mês está vazia! Crie blocos antes de replicar.");
        }
        const [yearStr, monthStr] = selectedMonth.split('-');
        let nextYear = parseInt(yearStr);
        let nextMonth = parseInt(monthStr) + 1;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
        }
        const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
        
        const newMonthData = {};
        const newRows = [];
        
        Object.keys(scheduleData).forEach(week => {
            newMonthData[week] = {};
            Object.keys(scheduleData[week]).forEach(room => {
                newMonthData[week][room] = scheduleData[week][room].map(b => {
                    const newId = crypto.randomUUID();
                    newRows.push({
                        id: newId,
                        mes: nextMonthKey,
                        semana: parseInt(week),
                        sala: room,
                        dia: b.dayOfWeek,
                        periodo: b.periodo,
                        time_start: b.startHour,
                        time_end: b.endHour,
                        especialidade: b.especialidade,
                        medico: b.medico,
                        procedimento: b.procedimento,
                        telefone: b.telefone,
                        color: b.color,
                        observacoes: b.observacoes
                    });
                    return { ...b, id: newId };
                });
            });
        });

        // Substitui a grade do próximo mês no banco (apaga o que existir e insere a cópia) para não duplicar linhas
        const ok = await runDbWrite(`Replicar para ${nextMonthKey}`, (async () => {
            const del = await supabase.from('cirurgias_programacao_fixa').delete().eq('mes', nextMonthKey);
            if (del.error) return del;
            return supabase.from('cirurgias_programacao_fixa').insert(newRows);
        })());

        setGlobalData(prev => {
            const updated = { ...prev, [nextMonthKey]: newMonthData };
            return updated;
        });

        if (ok) {
            logAction('Grade Fixa - Mês Replicado', `Grade de ${selectedMonth} replicada para ${nextMonthKey} (${newRows.length} blocos).`);
        }
        toast.success(`Copiado para ${format(parse(nextMonthKey, 'yyyy-MM', new Date()), 'MMM yyyy', {locale: ptBR}).toUpperCase()}!`, { icon: '✨' });
    };

    const handleClearMonth = async () => {
        if (!scheduleData || Object.keys(scheduleData).length === 0) {
            return toast.error("A grade deste mês já está vazia.");
        }

        if (window.confirm(`ATENÇÃO: Você está prestes a apagar TODOS os blocos cirúrgicos de ${format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM/yyyy', {locale: ptBR}).toUpperCase()}. Tem certeza que deseja esvaziar a grade deste mês?`)) {
            setScheduleData({});
            setGlobalData(prevGlobal => {
                const updated = { ...prevGlobal };
                delete updated[selectedMonth];
                return updated;
            });

            // Apaga todos os blocos do mês diretamente no banco
            const ok = await runDbWrite("limpeza do mês", supabase.from('cirurgias_programacao_fixa').delete().eq('mes', selectedMonth));
            if (ok) {
                logAction('Grade Fixa - Mês Limpo', `Todos os blocos de ${selectedMonth} foram apagados.`);
            }

            toast.success("Mês limpo com sucesso!");
        }
    };

    const handleAddBlockClick = (week, dayId, room) => {
        setEditingBlock({
            id: crypto.randomUUID(),
            week: week,
            room: room,
            dayOfWeek: dayId,
            startHour: '07:00',
            endHour: '12:00',
            medico: '',
            especialidade: '',
            color: 'blue',
            observacoes: ''
        });
        setShowEditModal(true);
    };

    const handleBlockEditClick = (block, week, room) => {
        setEditingBlock({ ...block, week, room });
        setShowEditModal(true);
    };

    const saveBlock = async (e) => {
        e.preventDefault();
        if (!editingBlock.startHour || !editingBlock.endHour) return toast.error("Preencha horários de inicio e fim!");
        if (!editingBlock.especialidade) return toast.error("A especialidade é obrigatória.");

        const { week, room, ...blockData } = editingBlock;
        // Garante período preenchido (coluna pode ser NOT NULL e o formulário não edita esse campo)
        if (!blockData.periodo) {
            blockData.periodo = parseInt(blockData.startHour, 10) < 12 ? 'Manhã' : 'Tarde';
        }

        setScheduleData(prev => {
            const newData = { ...prev };
            if (!newData[week]) newData[week] = {};
            if (!newData[week][room]) newData[week][room] = [];

            const roomList = [...newData[week][room]];
            const existingIdx = roomList.findIndex(b => b.id === blockData.id);

            if (existingIdx >= 0) {
                roomList[existingIdx] = blockData;
            } else {
                roomList.push(blockData);
            }

            // Ordenar por horário de início
            roomList.sort((a, b) => a.startHour.localeCompare(b.startHour));

            newData[week][room] = roomList;
            setGlobalData(prevGlobal => ({ ...prevGlobal, [selectedMonth]: newData }));
            return newData;
        });

        // Persiste o bloco no banco (fora do updater de estado para não disparar setState aninhado)
        const ok = await runDbWrite("bloco", supabase.from('cirurgias_programacao_fixa').upsert({
            id: blockData.id,
            mes: selectedMonth,
            semana: parseInt(week),
            sala: room,
            dia: blockData.dayOfWeek,
            periodo: blockData.periodo,
            time_start: blockData.startHour,
            time_end: blockData.endHour,
            especialidade: blockData.especialidade,
            medico: blockData.medico,
            procedimento: blockData.procedimento,
            telefone: blockData.telefone,
            color: blockData.color,
            observacoes: blockData.observacoes
        }));

        // Só audita quando a gravação confirmou no banco — evita falso "salvo".
        if (ok) {
            logAction('Grade Fixa - Bloco Salvo', `Sala ${room} | ${selectedMonth} S${week} | ${blockData.especialidade || ''} ${blockData.medico ? '- ' + blockData.medico : ''}${blockData.observacoes ? ' | Obs: ' + blockData.observacoes : ''}`);
        }

        setShowEditModal(false);
        setEditingBlock(null);
    };

    const replicateBlock = async () => {
        if (!editingBlock.startHour || !editingBlock.endHour) return toast.error("Preencha horários de inicio e fim!");
        if (!editingBlock.especialidade) return toast.error("A especialidade é obrigatória.");

        const { week: currentWeek, room, ...blockData } = editingBlock;
        if (!blockData.periodo) {
            blockData.periodo = parseInt(blockData.startHour, 10) < 12 ? 'Manhã' : 'Tarde';
        }

        // Monta as linhas replicadas (uma por semana, exceto a atual) com IDs UUID válidos
        const replicatedRows = [];
        WEEKS.forEach(targetWeek => {
            if (targetWeek === currentWeek) return;
            replicatedRows.push({
                id: crypto.randomUUID(),
                mes: selectedMonth,
                semana: parseInt(targetWeek),
                sala: room,
                dia: blockData.dayOfWeek,
                periodo: blockData.periodo,
                time_start: blockData.startHour,
                time_end: blockData.endHour,
                especialidade: blockData.especialidade,
                medico: blockData.medico,
                procedimento: blockData.procedimento,
                telefone: blockData.telefone,
                color: blockData.color,
                observacoes: blockData.observacoes
            });
        });

        const okRep = await runDbWrite("replicação", supabase.from('cirurgias_programacao_fixa').insert(replicatedRows));
        if (okRep) {
            logAction('Grade Fixa - Bloco Replicado', `Sala ${room} | ${selectedMonth} | ${blockData.especialidade || ''}${blockData.medico ? ' - ' + blockData.medico : ''} replicado para ${replicatedRows.length} semana(s).`);
        }

        setScheduleData(prev => {
            const newData = { ...prev };
            replicatedRows.forEach(repBlock => {
                const targetWeek = repBlock.semana;
                if (!newData[targetWeek]) newData[targetWeek] = {};
                if (!newData[targetWeek][room]) newData[targetWeek][room] = [];

                const roomList = [...newData[targetWeek][room]];
                roomList.push({ ...blockData, id: repBlock.id });
                roomList.sort((a, b) => a.startHour.localeCompare(b.startHour));
                newData[targetWeek][room] = roomList;
            });

            setGlobalData(prevGlobal => ({ ...prevGlobal, [selectedMonth]: newData }));
            return newData;
        });

        toast.success("Replicado para as demais semanas!");

        // Finaliza salvando o bloco na própria semana e fechando o modal
        saveBlock({ preventDefault: () => {} });
    };

    const deleteBlock = async () => {
        const { week, room, id } = editingBlock;
        const removido = (scheduleData?.[week]?.[room] || []).find(b => b.id === id);
        setScheduleData(prev => {
            const newData = { ...prev };
            if (newData[week] && newData[week][room]) {
                newData[week][room] = newData[week][room].filter(b => b.id !== id);
            }
            setGlobalData(prevGlobal => ({ ...prevGlobal, [selectedMonth]: newData }));
            return newData;
        });

        const ok = await runDbWrite("exclusão", supabase.from('cirurgias_programacao_fixa').delete().eq('id', id));
        if (ok) {
            logAction('Grade Fixa - Bloco Excluído', `Sala ${room} | ${selectedMonth} S${week}${removido?.especialidade ? ' | ' + removido.especialidade : ''}${removido?.medico ? ' - ' + removido.medico : ''}`);
        }

        setShowEditModal(false);
        setEditingBlock(null);
    };

    const getBlocks = (week, room, dayId) => {
        const list = scheduleData?.[week]?.[room] || [];
        // dia vem como texto do banco ("3") mas o id do dia na grade é número (3).
        // Comparar com Number nos dois lados evita que blocos salvos "sumam" após recarregar.
        return list.filter(b => Number(b.dayOfWeek) === Number(dayId));
    };

    const handleExportPdf = async () => {
        const input = document.getElementById('fixed-schedule-print-area');
        if (!input) return toast.error("Área de impressão não encontrada.");

        setIsPrinting(true);
        const toastId = toast.loading("Gerando arquivo PDF...");

        try {
            await new Promise(resolve => setTimeout(resolve, 300));

            const imgData = await toJpeg(input, {
                quality: 1.0,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });

            const pdf = new jsPDF('l', 'mm', 'a3'); // A3 for a massive grid
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const imgProps = pdf.getImageProperties(imgData);
            const imgRatio = imgProps.width / imgProps.height;
            const pdfRatio = pdfWidth / pdfHeight;

            let finalWidth = pdfWidth;
            let finalHeight = pdfHeight;

            if (imgRatio > pdfRatio) {
                finalHeight = pdfWidth / imgRatio;
            } else {
                finalWidth = pdfHeight * imgRatio;
            }

            const x = (pdfWidth - finalWidth) / 2;
            const y = (pdfHeight - finalHeight) / 2;

            pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
            pdf.save(`Grade_Fixa_Padrao.pdf`);
            toast.success("PDF gerado com sucesso!", { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("Erro ao gerar PDF", { id: toastId });
        } finally {
            setIsPrinting(false);
        }
    };

    const renderGrid = (isPrint = false) => (
        <div className={`bg-white border-slate-200 flex flex-col min-w-max overflow-hidden ${isPrint ? 'border' : 'bg-white/95 backdrop-blur-xl rounded-[1.5rem] shadow-sm border min-h-full'}`}>
            
            {/* Header dos Dias da Semana */}
            <div className={`flex border-b-2 border-slate-300/60 bg-white/80 shrink-0 ${isPrint ? '' : 'sticky top-0 z-30 shadow-sm backdrop-blur-md'}`}>
                <div className={`shrink-0 border-r border-slate-200/80 flex items-center justify-center bg-slate-50/50 ${isPrint ? 'w-10' : 'w-12'}`} />
                {DAYS.map(day => (
                    <div key={`head-${day.id}`} className={`flex-1 flex flex-col border-r-[3px] border-slate-300 last:border-0`} style={{ minWidth: isPrint ? '180px' : `${Math.max(400, rooms.length * 180)}px` }}>
                        <div className={`flex items-center justify-center border-b border-slate-200/80 bg-slate-50/50 ${isPrint ? 'py-1' : 'py-2.5'}`}>
                            <span className={`${isPrint ? 'text-[10px]' : 'text-xs'} font-black uppercase tracking-widest text-slate-800`}>{day.label}</span>
                        </div>
                        <div className="flex flex-1">
                            {rooms.map((room, idx) => {
                                const roomName = String(room).toUpperCase();
                                const displayName = roomName.includes('SALA') || roomName.includes('SETOR') || roomName.includes('CENTRO') ? roomName : `SALA ${roomName}`;
                                return (
                                    <div key={`h-${day.id}-${room}`} className={`flex-1 flex items-center justify-center px-1 bg-white/80 ${isPrint ? 'py-0.5' : 'py-2'} ${idx !== rooms.length - 1 ? 'border-r border-slate-200' : ''}`}>
                                        <span className={`${isPrint ? 'text-[7px]' : 'text-[9px]'} font-black tracking-normal text-slate-600 text-center uppercase leading-tight line-clamp-2`}>{displayName}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Linhas das Semanas */}
            {WEEKS.map((week, wIdx) => (
                <div key={`week-${week}`} className={`flex hover:bg-slate-50/30 transition-colors ${wIdx !== WEEKS.length - 1 ? 'border-b-4 border-slate-300' : ''}`} style={{ minHeight: isPrint ? '120px' : '260px' }}>
                    
                    {/* Título da Semana (Coluna Lateral) */}
                    <div className={`shrink-0 border-r border-slate-200/80 flex flex-col items-center justify-center bg-slate-50/50 ${isPrint ? 'w-10 py-1' : 'w-12 py-4'}`}>
                        <span className={`${isPrint ? 'text-[9px]' : 'text-[11px]'} font-black uppercase text-slate-600 tracking-widest rotate-180`} style={{ writingMode: 'vertical-rl' }}>Semana {week}</span>
                    </div>

                    {/* Células dos Dias */}
                    {DAYS.map(day => {
                        const cellDate = getDateForCell(week, day.id);
                        const isCurrentMonth = isSameMonth(cellDate, monthDateObj);
                        
                        return (
                            <div key={`cell-${week}-${day.id}`} className={`flex-1 flex flex-col border-r-[3px] border-slate-300 last:border-0 ${isPrint ? 'p-0.5 gap-0.5' : 'p-2.5 gap-2'} ${!isCurrentMonth ? 'bg-slate-100 opacity-60' : 'bg-white'}`} style={{ minWidth: isPrint ? '180px' : `${Math.max(400, rooms.length * 180)}px` }}>
                                
                                {/* DATA DO DIA */}
                                <div className={`w-full text-center ${isPrint ? 'text-[7px] pb-0.5' : 'text-[11px] pb-1'} font-black uppercase tracking-wider ${!isCurrentMonth ? 'text-slate-500' : 'text-slate-700'}`}>
                                    {format(cellDate, "dd 'de' MMM", { locale: ptBR })}
                                </div>
                                
                                <div className={`flex w-full flex-1 ${isPrint ? 'gap-0.5' : 'gap-2'}`}>
                                    {/* Célula das Salas Lado a Lado */}
                                    {rooms.map((room, rIdx) => {
                                        const blocks = getBlocks(week, room, day.id);
                                        return (
                                            <div key={`cell-r-${room}`} className={`flex-1 flex flex-col min-w-0 bg-slate-50/50 border border-slate-200 overflow-hidden group hover:border-blue-400 transition-colors ${isPrint ? 'rounded-sm' : 'rounded-xl shadow-sm'}`}>
                                        <div className={`flex-1 flex flex-col overflow-y-auto ${isPrint ? 'p-0.5 gap-0.5' : 'p-1.5 gap-1.5'}`}>
                                            {blocks.map(block => {
                                                const colorTheme = COLORS.find(c => c.id === block.color) || COLORS[0];
                                                return (
                                                    <div 
                                                        key={block.id}
                                                        onClick={() => !isPrint && handleBlockEditClick(block, week, room)}
                                                        className={`w-full rounded border ${!isPrint ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} relative ${colorTheme.class} ${isPrint ? 'p-1' : 'p-1.5'}`}
                                                    >
                                                        <div className={`${isPrint ? 'text-[7px] mb-0' : 'text-[10px] mb-0.5'} font-black tracking-normal opacity-80 flex items-center justify-between`}>
                                                            <span>{block.startHour} - {block.endHour}</span>
                                                        </div>
                                                        <div className={`${isPrint ? 'text-[9px]' : 'text-[11px]'} font-black uppercase leading-tight whitespace-normal break-words`}>
                                                            {block.especialidade}
                                                        </div>
                                                        {block.medico && (
                                                            <div className={`${isPrint ? 'text-[6px]' : 'text-[9px]'} font-bold mt-0.5 uppercase whitespace-normal break-words opacity-80 flex items-start gap-1 leading-tight`}>
                                                                <User size={10} className="mt-0.5 shrink-0" /> <span className="flex-1">{block.medico}</span>
                                                            </div>
                                                        )}
                                                        {block.observacoes && (
                                                            <div className={`${isPrint ? 'text-[6px] border-black/5 mt-0.5 pt-0.5' : 'text-[9px] border-black/10 mt-1 pt-1'} font-semibold uppercase italic opacity-75 line-clamp-2 leading-tight border-t`}>
                                                                Obs: {block.observacoes}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Botão de Adicionar Bloco */}
                                            {!isPrint && isCurrentMonth && (
                                                <button 
                                                    onClick={() => handleAddBlockClick(week, day.id, room)}
                                                    className="w-full flex items-center justify-center py-2 rounded border border-dashed border-white/80 text-slate-500 hover:text-blue-600 hover:bg-blue-500/20 hover:border-blue-300 transition-colors mt-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                >
                                                    <Plus size={14} />
                                                </button>
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
            ))}

        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed top-16 left-0 right-0 bottom-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-white/40 backdrop-blur-sm backdrop-blur-sm print:hidden">
            <div className="bg-white/95 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-2xl w-full max-w-[95vw] h-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                      <div className="px-6 py-5 border-b border-white/40 flex justify-between items-center bg-white/60 shrink-0 flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl shadow-sm backdrop-blur-md border border-blue-200/50">
                            <Calendar size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 drop-shadow-none uppercase tracking-wider">Grade Padrão <span className="text-slate-500 font-bold">- Centro Cirúrgico</span></h2>
                            <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">Todas as salas e semanas lado a lado</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
                        <div className="flex items-center bg-white/60 rounded-xl border border-white/60 p-1 shadow-sm shrink-0">
                            <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white/60 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"><ChevronLeft size={16} strokeWidth={3} /></button>
                            <div className="px-3 flex flex-col items-center justify-center min-w-[140px] relative group cursor-pointer">
                                <span className="text-xs font-black text-slate-700 uppercase tracking-widest leading-none mt-1">{format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM', { locale: ptBR })}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{format(parse(selectedMonth, 'yyyy-MM', new Date()), 'yyyy', { locale: ptBR })}</span>
                                <input type="month" value={selectedMonth} onChange={handleMonthChange} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                            </div>
                            <button onClick={handleNextMonth} className="p-1.5 hover:bg-white/60 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"><ChevronRight size={16} strokeWidth={3} /></button>
                        </div>
                        
                        <div className="h-6 w-px bg-white/80 shrink-0"></div>

                        <button onClick={handleReplicateToNextMonth} disabled={loading} className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-100 text-amber-700 rounded-xl font-black text-[11px] uppercase flex items-center gap-2 transition-all shrink-0">
                            <Copy size={16} /> <span className="hidden sm:inline">Replicar P/ Próx. Mês</span> <span className="sm:hidden">Copiar</span>
                        </button>

                        <button onClick={handleClearMonth} disabled={loading} className="px-4 py-2.5 bg-rose-500/20 hover:bg-rose-100 text-rose-700 rounded-xl font-black text-[11px] uppercase flex items-center gap-2 transition-all shrink-0">
                            <Trash2 size={16} /> <span className="hidden sm:inline">Limpar Mês</span> <span className="sm:hidden">Limpar</span>
                        </button>
                        
                        <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-600 px-3 py-2 rounded-xl border border-emerald-100/50 shrink-0">
                            {saving ? (
                                <><Loader2 size={14} className="animate-spin" /> <span className="text-[11px] font-bold uppercase tracking-widest">Salvando...</span></>
                            ) : (
                                <><CheckCircle2 size={14} /> <span className="text-[11px] font-bold uppercase tracking-widest">Salvo Auto</span></>
                            )}
                        </div>

                        <div className="relative print:hidden flex shrink-0">
                            <button type="button" onClick={() => setShowRoomModal(true)} className="p-2.5 sm:px-4 sm:py-2.5 bg-white/70 hover:bg-white text-slate-600 border border-slate-200/50 rounded-xl font-black text-[11px] uppercase flex items-center gap-2 transition-all shadow-sm">
                                <Eye size={16} /> <span className="hidden sm:inline">Salas</span>
                            </button>
                        </div>

                        <button onClick={handleExportPdf} disabled={isPrinting || loading} className="p-2.5 sm:px-5 sm:py-2.5 bg-indigo-500/20 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-black text-[11px] uppercase flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 shrink-0">
                            {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                            <span className="hidden sm:inline">Exportar PDF</span>
                        </button>
                        <button onClick={onClose} className="p-2.5 sm:p-2 hover:bg-white/70 rounded-xl transition-colors border border-slate-200/50 text-slate-500 shrink-0"><X size={18} /></button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-white/60">
                            <Loader2 size={40} className="animate-spin mb-4 text-blue-500" />
                            <p className="font-bold text-sm uppercase tracking-widest">Carregando Matriz...</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto bg-slate-100/50 custom-scrollbar p-3">
                            {renderGrid(false)}
                        </div>
                    )}
                </div>
            </div>

            {/* INVISIBLE PRINT AREA FOR PDF EXPORT */}
            <div style={{ position: 'absolute', top: '-20000px', left: '-20000px', width: '2200px', backgroundColor: '#ffffff', opacity: 0 }} className="print:hidden pointer-events-none">
                <div id="fixed-schedule-print-area" className="flex flex-col bg-white/60" style={{ width: '2200px', height: '1400px', backgroundColor: '#ffffff', padding: '80px' }}>
                    <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-6">
                        <div className="flex items-center gap-4">
                            {theme?.logoUrl && <img src={theme.logoUrl} alt="Logo" className="h-12 object-contain" />}
                            <div>
                                <h1 className="text-2xl font-black text-slate-900 drop-shadow-none uppercase tracking-wider">Grade Padrão - Centro Cirúrgico</h1>
                                <p className="text-sm font-bold text-slate-500 uppercase">Mapa de Escala Cirúrgica Fixa &bull; {format(monthDateObj, "MMMM 'de' yyyy", { locale: ptBR })}</p>
                            </div>
                        </div>
                    </div>
                    {renderGrid(true)}
                </div>
            </div>

            {/* Modal de Edição de Bloco */}
            {showEditModal && editingBlock && (
                <div className="fixed top-16 inset-x-0 bottom-0 z-[999999] flex items-center justify-center p-4 bg-white/40 backdrop-blur-sm backdrop-blur-sm print:hidden animate-in fade-in duration-200">
                    <form onSubmit={saveBlock} className="bg-white/95 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-white/40 flex items-center justify-between bg-white/60">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                                    <Plus size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-900 drop-shadow-none uppercase text-lg tracking-normal leading-none">Bloco Fixo</h3>
                                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                        Semana {editingBlock.week} • Sala {editingBlock.room}
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-rose-500 bg-white/60 p-2 rounded-full shadow-sm hover:shadow transition-all border border-white/40"><X size={18} /></button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-1">Início</label>
                                    <input type="time" required value={editingBlock.startHour} onChange={e => setEditingBlock({...editingBlock, startHour: e.target.value})} className="w-full text-sm font-bold p-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-1">Fim</label>
                                    <input type="time" required value={editingBlock.endHour} onChange={e => setEditingBlock({...editingBlock, endHour: e.target.value})} className="w-full text-sm font-bold p-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-black uppercase tracking-widest text-emerald-600 block mb-1">Especialidade / Serviço</label>
                                {settingsData.especialidades.length > 0 ? (
                                    <select required value={editingBlock.especialidade} onChange={e => setEditingBlock({...editingBlock, especialidade: e.target.value})} className="w-full text-xs font-bold uppercase p-2 border border-emerald-200 bg-emerald-500/20 rounded-lg outline-none">
                                        <option value="">SELECIONE...</option>
                                        {settingsData.especialidades.map((esp, idx) => {
                                            const nomeEsp = typeof esp === 'object' ? esp.nome || esp.especialidade || esp.name : esp;
                                            const idEsp = typeof esp === 'object' ? esp.id || String(idx) : String(esp);
                                            return <option key={`esp-${idEsp}`} value={String(nomeEsp).toUpperCase()}>{String(nomeEsp).toUpperCase()}</option>
                                        })}
                                    </select>
                                ) : (
                                    <input type="text" required value={editingBlock.especialidade} onChange={e => setEditingBlock({...editingBlock, especialidade: e.target.value})} placeholder="Ex: UROLOGIA" className="w-full text-xs font-bold uppercase p-2 border border-emerald-200 bg-emerald-500/20 rounded-lg outline-none" />
                                )}
                            </div>

                            <div>
                                <label className="text-[11px] font-black uppercase tracking-widest text-blue-600 block mb-1">Médico Titular (Opcional)</label>
                                {medicos.length > 0 ? (
                                    <select value={editingBlock.medico} onChange={e => setEditingBlock({...editingBlock, medico: e.target.value})} className="w-full text-xs font-bold uppercase p-2 border border-blue-200 bg-blue-500/20 rounded-lg outline-none">
                                        <option value="">A DEFINIR / ROTATIVO...</option>
                                        {medicos.map((doc, idx) => {
                                            const nomeDoc = typeof doc === 'object' ? doc.nome || doc.cirurgiao || doc.name : doc;
                                            const idDoc = typeof doc === 'object' ? doc.id || String(idx) : String(doc);
                                            return <option key={`doc-${idDoc}`} value={String(nomeDoc).toUpperCase()}>{String(nomeDoc).toUpperCase()}</option>
                                        })}
                                    </select>
                                ) : (
                                    <input type="text" value={editingBlock.medico} onChange={e => setEditingBlock({...editingBlock, medico: e.target.value})} placeholder="Ex: Dr. Fulano" className="w-full text-xs font-bold uppercase p-2 border border-blue-200 bg-blue-500/20 rounded-lg outline-none" />
                                )}
                            </div>

                            <div>
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-1">Observações (Opcional)</label>
                                <textarea 
                                    value={editingBlock.observacoes || ''} 
                                    onChange={e => setEditingBlock({...editingBlock, observacoes: e.target.value})} 
                                    placeholder="Detalhes ou restrições..." 
                                    className="w-full text-xs font-bold uppercase p-2 border border-white/60 bg-white/60 rounded-lg outline-none min-h-[60px] resize-none" 
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-2">Cor do Bloco</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setEditingBlock({...editingBlock, color: c.id})}
                                            className={`w-7 h-7 rounded-full shadow-sm border-2 transition-all ${editingBlock.color === c.id ? `scale-110 border-slate-800` : 'border-transparent'} ${c.class.split(' ')[0]}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/40 flex items-center justify-between bg-white/60 gap-2">
                            {editingBlock.id && scheduleData[editingBlock.week] && scheduleData[editingBlock.week][editingBlock.room] && scheduleData[editingBlock.week][editingBlock.room].some(b => b.id === editingBlock.id) ? (
                                <button type="button" onClick={deleteBlock} className="p-2.5 text-rose-500 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1 text-[11px] font-bold uppercase">
                                    <Trash2 size={16} /> Excluir
                                </button>
                            ) : (
                                <div />
                            )}
                            <div className="flex gap-2">
                                <button type="button" onClick={replicateBlock} className="px-5 py-2.5 bg-indigo-500/20 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-colors flex items-center gap-2 text-[10px] font-black uppercase">
                                    <Layers size={14} /> Replicar Mensal
                                </button>
                                <button type="submit" className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-700 hover:to-indigo-600 text-white rounded-xl transition-all flex items-center gap-2 text-[11px] font-black uppercase shadow-md shadow-blue-500/30">
                                    <Save size={16} /> Salvar Neste Dia
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal de Salas Visíveis */}
            {showRoomModal && (
                <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
                    <div className="bg-white/95 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-white/40 flex items-center justify-between bg-white/60">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                                    <Eye size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-900 drop-shadow-none uppercase text-lg tracking-normal leading-none">Visibilidade</h3>
                                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                        Exibir ou Ocultar Salas
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowRoomModal(false)} className="text-slate-500 hover:text-rose-500 bg-white/60 p-2 rounded-full shadow-sm hover:shadow transition-all border border-white/40"><X size={18} /></button>
                        </div>
                        <div className="p-5 max-h-[50vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {allRooms.map(r => (
                                <label key={r} className="flex items-center justify-between p-4 bg-white/60 border border-slate-200/60 rounded-xl cursor-pointer hover:border-blue-300 transition-colors shadow-sm group">
                                    <span className="text-sm font-black text-slate-700 uppercase">{String(r).includes('SALA') || String(r).includes('SETOR') || String(r).includes('CENTRO') ? r : `SALA ${r}`}</span>
                                    <input 
                                        type="checkbox" 
                                        checked={!hiddenRooms.includes(r)} 
                                        onChange={(e) => {
                                            if (e.target.checked) setHiddenRooms(prev => prev.filter(h => h !== r));
                                            else setHiddenRooms(prev => [...prev, r]);
                                        }} 
                                        className="w-5 h-5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 bg-white"
                                    />
                                </label>
                            ))}
                        </div>
                        <div className="p-5 border-t border-white/40 bg-white/60">
                            <button onClick={() => setShowRoomModal(false)} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-sm shadow-blue-500/20 transition-colors">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
