import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { X, Search, Loader2, CalendarPlus, Phone, Calendar } from 'lucide-react';
import { usePermission } from '../contexts/PermissionContext';
import { useUnit } from '../contexts/UnitContext';

export const QueueSelectionModal = ({ isOpen, onClose, slotInfo, onSelectSurgery }) => {
    const { hasPermission } = usePermission();
    const { unidadeAtual } = useUnit();
    const canBlockAgenda = hasPermission('Acao: Bloquear Agenda');

    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCirurgiao, setFilterCirurgiao] = useState('');
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' para mais antigos, 'desc' para mais recentes
    
    // Novo Estado para Bloqueio
    const [isBlocking, setIsBlocking] = useState(false);
    const [blockReason, setBlockReason] = useState('');
    const [blockEnd, setBlockEnd] = useState('');

    useEffect(() => {
        if (isBlocking && slotInfo?.horario) {
            const [h, m] = slotInfo.horario.split(':').map(Number);
            const endTimeDate = new Date();
            endTimeDate.setHours(h + 1, m);
            setBlockEnd(endTimeDate.toTimeString().slice(0, 5));
        }
    }, [isBlocking, slotInfo]);

    useEffect(() => {
        if (!isOpen) return;
        const fetchQueue = async () => {
            setLoading(true);
            try {
                // Filtro por unidade (evita vazamento entre hospitais no modal de agendamento):
                // traz as da unidade atual + as sem unidade (legado/null/vazio). Sem unidade
                // selecionada, traz só as não vinculadas. Mesmo padrão da fila principal.
                const filtroUnidade = unidadeAtual
                    ? `unidade.eq."${unidadeAtual}",unidade.is.null,unidade.eq.""`
                    : `unidade.is.null,unidade.eq.""`;
                const { data, error } = await supabase
                    .from('surgeries')
                    .select('*')
                    .or(filtroUnidade)
                    .limit(5000);
                
                if (error) throw error;

                // Filtra: Só mostra quem NÃO tem data agendada e NÃO está finalizado
                const validQueue = (data || []).filter(s => {
                    const status = String(s.status || '').toUpperCase();
                    const isFinalized = status.includes('REALIZADO') || status.includes('CANCELADO') || status.includes('DESISTIU') || status.includes('ALTA') || status.includes('NÃO INTERNOU');
                    const needsReschedule = status.includes('SUSPENS') || status.includes('REAGENDAR');
                    
                    // Se estiver finalizada, ou se tem data normal e não precisa ser reagendada, oculta
                    if (isFinalized) return false;
                    if (s.dataAgendado && !needsReschedule) return false;
                    return true;
                });

                setQueue(validQueue);
            } catch (err) {
                console.error('Erro ao carregar fila:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchQueue();
    }, [isOpen, unidadeAtual]);

    if (!isOpen) return null;

    const uniqueCirurgioes = [...new Set(queue.map(item => item.cirurgiao).filter(Boolean))].sort();

    const filteredQueue = queue.filter(s => {
        const searchLower = searchTerm.toLowerCase();
        const searchDigits = searchTerm.replace(/\D/g, '');
        
        const matchesSearch = (s.nomePaciente || s.paciente || '').toLowerCase().includes(searchLower) ||
                              (s.procedimento || '').toLowerCase().includes(searchLower) ||
                              (searchDigits.length > 0 && ((s.telefone1 || '').replace(/\D/g, '').includes(searchDigits) || (s.telefone || '').replace(/\D/g, '').includes(searchDigits)));
        const matchesCirurgiao = !filterCirurgiao || s.cirurgiao === filterCirurgiao;
        return matchesSearch && matchesCirurgiao;
    }).sort((a, b) => {
        const dateA = a.dataAtendimento ? new Date(a.dataAtendimento).getTime() : Infinity;
        const dateB = b.dataAtendimento ? new Date(b.dataAtendimento).getTime() : Infinity;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    return (
        <>
            {/* Fundo Escuro Isolado */}
            <div className="fixed top-16 inset-x-0 bottom-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm z-[99998] animate-in fade-in" onClick={onClose} />
            
            {/* Container Invisível aos Cliques */}
            <div className="fixed top-16 inset-x-0 bottom-0 z-[99999] flex items-center justify-center p-4 pointer-events-none">
                
                {/* A Caixa Branca (Restaura os cliques nela) */}
                <div className="bg-white/60 rounded-3xl shadow-2xl backdrop-blur-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] pointer-events-auto">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/40 flex justify-between items-center bg-white/60">
                    <div>
                        <h2 className="text-lg font-black text-slate-900 drop-shadow-none flex items-center gap-2">
                            <CalendarPlus className="text-blue-600" /> Agendar da Fila
                        </h2>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                            Selecionado: <span className="text-blue-600">{slotInfo?.sala}</span> • {slotInfo?.data} às {slotInfo?.horario}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {canBlockAgenda && (
                            <button 
                                onClick={() => setIsBlocking(!isBlocking)} 
                                className={`px-4 py-2 text-[11px] font-black uppercase rounded-lg transition-all shadow-sm flex items-center gap-2 border ${isBlocking ? 'bg-rose-500/20 text-white border-rose-600' : 'bg-white/60 text-rose-500 border-rose-100 hover:bg-rose-500/20'}`}
                            >
                                {isBlocking ? 'Cancelar Bloqueio' : 'Bloquear Horário'}
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 bg-white/60 hover:bg-white/70 text-slate-500 hover:text-slate-600 rounded-full transition-colors shadow-sm border border-white/60">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Seção de Bloqueio Condicional */}
                {isBlocking && (
                    <div className="p-4 border-b border-rose-100 bg-rose-500/20/50 flex flex-col md:flex-row items-end animate-in collapse-in gap-3">
                        <div className="flex-1 w-full space-y-1">
                            <label className="text-[11px] font-black text-rose-700 uppercase tracking-widest block">Motivo do Bloqueio</label>
                            <input 
                                type="text"
                                value={blockReason}
                                onChange={e => setBlockReason(e.target.value)}
                                placeholder="Refeitório, Manutenção, Reunião, Feriado..."
                                className="w-full text-xs font-bold text-slate-700 p-2.5 rounded-lg border border-rose-200 outline-none focus:ring-2 focus:ring-rose-500/20 uppercase bg-white/60 placeholder:normal-case placeholder:font-normal"
                            />
                        </div>
                        <div className="w-full md:w-32 space-y-1">
                            <label className="text-[11px] font-black text-rose-700 uppercase tracking-widest block">Hora Final</label>
                            <input 
                                type="time"
                                value={blockEnd}
                                onChange={e => setBlockEnd(e.target.value)}
                                className="w-full text-xs font-bold text-slate-700 p-2.5 rounded-lg border border-rose-200 outline-none focus:ring-2 focus:ring-rose-500/20 bg-white/60"
                            />
                        </div>
                        <div className="w-full md:w-auto flex items-end">
                            <button 
                                disabled={!blockReason.trim() || !blockEnd}
                                onClick={() => {
                                    const [startH, startM] = slotInfo.horario.split(':').map(Number);
                                    const [endH, endM] = blockEnd.split(':').map(Number);
                                    let duration = (endH * 60 + endM) - (startH * 60 + startM);
                                    if (duration <= 0) duration = 60; // fallback se for negativo/inválido
                                    onSelectSurgery({ isBlock: true, reason: blockReason, duration });
                                }}
                                className="w-full md:w-auto h-10 px-6 bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] uppercase rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Confirmar Bloqueio
                            </button>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="p-4 border-b border-white/40 bg-white/60 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar paciente ou procedimento na fila..." 
                            className="w-full pl-10 pr-4 py-2.5 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase placeholder:normal-case placeholder:font-normal"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select 
                        value={sortOrder} 
                        onChange={e => setSortOrder(e.target.value)} 
                        className="bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 px-3 h-10 w-36 uppercase"
                    >
                        <option value="asc">Mais Antigos</option>
                        <option value="desc">Mais Recentes</option>
                    </select>
                    <select
                        value={filterCirurgiao}
                        onChange={(e) => setFilterCirurgiao(e.target.value)}
                        className="w-[35%] lg:w-1/3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 px-3 uppercase"
                    >
                        <option value="">Todos os Cirurgiões</option>
                        {uniqueCirurgioes.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 bg-white/60 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-3 text-blue-500">
                            <Loader2 size={32} className="animate-spin" />
                            <span className="text-xs font-bold uppercase tracking-widest">Buscando fila...</span>
                        </div>
                    ) : filteredQueue.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                            <span className="text-sm font-bold">Nenhum paciente encontrado na fila.</span>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredQueue.map(surgery => (
                                <div 
                                    key={surgery.id} 
                                    className="bg-white/60 p-3 rounded-xl border border-white/60 shadow-sm flex items-center justify-between"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-slate-900 drop-shadow-none uppercase group-hover:text-blue-700 transition-colors">
                                            {surgery.nomePaciente || surgery.paciente || 'NOME NÃO INFORMADO'}
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-500 uppercase mt-0.5">
                                            {surgery.procedimento || 'PROCEDIMENTO NÃO INFORMADO'}
                                        </span>
                                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                                            <span className="px-2 py-0.5 bg-white/70 text-slate-600 rounded text-[10px] font-black uppercase">
                                                Dr. {(surgery.cirurgiao || '').split(' ').slice(0, 2).join(' ')}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${surgery.prioridade === 'Urgência' || surgery.prioridade === 'Emergência' ? 'bg-rose-100 text-rose-700' : 'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none'}`}>
                                                {surgery.prioridade || 'ELETIVA'}
                                            </span>
                                            {(surgery.telefone1 || surgery.telefone) && (
                                                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                                    <Phone size={10} /> {surgery.telefone1 || surgery.telefone}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-500">
                                                <Calendar size={10} /> Atend: {surgery.dataAtendimento ? surgery.dataAtendimento.split('-').reverse().join('/') : 'N/I'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <button 
                                            onClick={() => onSelectSurgery(surgery)}
                                            className="h-8 px-4 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none font-bold text-[11px] uppercase rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                                        >
                                            SELECIONAR
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};
