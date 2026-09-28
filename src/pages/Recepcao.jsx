import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useUnit } from '../contexts/UnitContext';
import { Search, Plus, UserPlus, Activity, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { logAction } from '../utils/logger';
import { NovoAtendimentoModal } from '../components/NovoAtendimentoModal';
import UnitPrompt from '../components/UnitPrompt';

export default function Recepcao() {
    const { unidadeAtual } = useUnit();
    const [atendimentos, setAtendimentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Estados do Modal de Triagem
    const [isTriagemModalOpen, setIsTriagemModalOpen] = useState(false);
    const [pacienteTriagem, setPacienteTriagem] = useState(null);
    const [savingTriagem, setSavingTriagem] = useState(false);
    const [formTriagem, setFormTriagem] = useState({
        pa: '', fc: '', tax: '', spo2: '', queixa: '', classificacao: '', medico_destino: ''
    });

    const handleSalvarTriagem = async (e) => {
        e.preventDefault();
        if (!formTriagem.classificacao) return toast.error("Selecione uma cor de classificação de risco!");
        setSavingTriagem(true);
        try {
            const observacoesTriagem = `[TRIAGEM - ${formTriagem.classificacao.toUpperCase()}]\nQueixa: ${formTriagem.queixa}\nSinais Vitais: PA ${formTriagem.pa} | FC ${formTriagem.fc} | Tax ${formTriagem.tax} | SpO2 ${formTriagem.spo2}`;
            
            const { error } = await supabase.from('atendimentos')
                .update({
                    status: 'Aguardando Médico',
                    classificacaoRisco: formTriagem.classificacao,
                    observacoes: observacoesTriagem,
                    medico: formTriagem.medico_destino
                })
                .eq('id', pacienteTriagem.id);
            
            if (error) throw error;

            await logAction('TRIAGEM', `Triagem realizada para ${pacienteTriagem.nomePaciente}. Classificação: ${formTriagem.classificacao}.`);

            toast.success("Triagem concluída! Paciente enviado para o Médico.");
            setIsTriagemModalOpen(false);
            setFormTriagem({ pa: '', fc: '', tax: '', spo2: '', queixa: '', classificacao: '', medico_destino: '' });
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar triagem.");
        } finally {
            setSavingTriagem(false);
        }
    };

    // Cores do Protocolo de Manchester
    const manchesterColors = {
        'Emergência': 'bg-red-500 text-white border-red-600',
        'Muito Urgente': 'bg-orange-500 text-slate-800 border-orange-600',
        'Urgente': 'bg-yellow-400 text-slate-900 drop-shadow-none border-yellow-500',
        'Pouco Urgente': 'bg-green-500 text-slate-800 border-green-600',
        'Não Urgente': 'bg-blue-500/20 text-white border-blue-600',
        'Não Classificado': 'bg-white/70 text-slate-600 border-white/60'
    };

    useEffect(() => {
        // Se a unidade não estiver definida (ex: Recepcionista que não tem o gatekeeper obrigatório), não busca nada ainda
        if (!unidadeAtual) {
            setLoading(false);
            return;
        }

        const loadAtendimentos = async () => {
            const inicioDoDia = new Date();
            inicioDoDia.setHours(0, 0, 0, 0);

            try {
                const { data, error } = await supabase
                    .from('atendimentos')
                    .select('*')
                    .eq('unidade', unidadeAtual)
                    .in('status', ['Aguardando Triagem', 'Aguardando Médico', 'Em Atendimento'])
                    .gte('dataChegada', inicioDoDia.toISOString())
                    .order('dataChegada', { ascending: true });

                if (error) throw error;

                const lista = data || [];
                // Ordenação inteligente: Primeiro por Risco (Manchester), depois por Hora de Chegada
                const prioridades = { 'Emergência': 1, 'Muito Urgente': 2, 'Urgente': 3, 'Pouco Urgente': 4, 'Não Urgente': 5, 'Não Classificado': 6 };

                lista.sort((a, b) => {
                    const prioA = prioridades[a.classificacaoRisco || 'Não Classificado'];
                    const prioB = prioridades[b.classificacaoRisco || 'Não Classificado'];
                    if (prioA !== prioB) return prioA - prioB;
                    return 0; // Se for igual, mantém a ordem de chegada do banco
                });

                setAtendimentos(lista);
            } catch (error) {
                console.error('Erro buscar atendimentos:', error);
            } finally {
                setLoading(false);
            }
        };

        loadAtendimentos();

        // Inscrição para atualizações em tempo real (Supabase Realtime)
        const subscription = supabase
            .channel('custom-atendimentos-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'atendimentos' },
                (payload) => {
                    console.log('Mudança detectada em Atendimentos:', payload);
                    loadAtendimentos();
                }
            )
            .subscribe();

        // Cleanup ao desmontar
        return () => {
            supabase.removeChannel(subscription);
        };
    }, [unidadeAtual]);

    if (!unidadeAtual) {
        return <UnitPrompt />;
    }

    return (
        <div className="py-4 px-2 sm:px-4 font-sans animate-in fade-in duration-500 w-full min-h-full">
            <div className="max-w-7xl mx-auto space-y-4">

                {/* CABEÇALHO */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/60 backdrop-blur-md p-4 rounded-2xl shadow-sm backdrop-blur-md border border-white/400 relative overflow-hidden">
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><UserPlus size={22} /></div>
                        <div>
                            <h1 className="text-lg font-black text-slate-900 drop-shadow-none uppercase tracking-widest">Recepção & Triagem</h1>
                            <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                {unidadeAtual}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-[0_4px_15px_rgba(37,99,235,0.4)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.5)] border-none flex items-center gap-2 transition-all uppercase tracking-widest">
                        <Plus size={18} /> Novo Atendimento
                    </button>
                </div>

                {/* FILA VIVA (CARDS) */}
                <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-sm backdrop-blur-md border border-white/400 p-4">
                    <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-4 border-b border-white/400 pb-2 flex items-center justify-between">
                        <span>Fila de Espera ({atendimentos.length})</span>
                    </h2>

                    {loading ? (
                        <div className="flex justify-center p-8"><Activity className="animate-spin text-blue-500" size={24} /></div>
                    ) : atendimentos.length === 0 ? (
                        <div className="text-center p-8 border-2 border-dashed border-white/60 rounded-xl bg-white/60">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fila Vazia. Nenhum paciente aguardando.</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {atendimentos.map(pac => (
                                <div key={pac.id} className="bg-white/60 border border-white/40 p-3.5 rounded-xl shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="text-xs font-black text-slate-900 drop-shadow-none uppercase tracking-wider">{pac.nomePaciente}</div>
                                            <div className="text-[11px] font-bold text-slate-500 uppercase mt-0.5">Idade: {pac.idadeInfo || '--'}</div>
                                        </div>
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${manchesterColors[pac.classificacaoRisco || 'Não Classificado']}`}>
                                            {pac.classificacaoRisco || 'Aguardando Triagem'}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase">
                                            <Clock size={12} />
                                            {pac.dataChegada ? new Date(pac.dataChegada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                        </div>
                                        <div className="text-[11px] font-black uppercase tracking-widest text-blue-600 bg-blue-300 px-2 py-1 rounded-md">
                                            {pac.status}
                                        </div>
                                    </div>
                                    {pac.status === 'Aguardando Triagem' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setPacienteTriagem(pac); setIsTriagemModalOpen(true); }}
                                            className="mt-3 w-full bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none hover:bg-blue-600 hover:text-white border border-blue-200 py-1.5 rounded text-xs font-bold uppercase transition-colors"
                                        >
                                            Realizar Triagem
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Note: In order to auto-refresh the list after a modal creates an entry, you can pass loadAtendimentos down conceptually. 
                Currently modal handles its own stuff. Let's just rely on the user refreshing or the list reloading next time. */}
            <NovoAtendimentoModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); /* if there's a loadAtendimentos function accessible here, call it */ }} unidadeAtual={unidadeAtual} />

            {/* MODAL DE TRIAGEM */}
            {isTriagemModalOpen && pacienteTriagem && (
                <>
                    <div className="fixed top-16 inset-x-0 bottom-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm z-[9998]" onClick={() => setIsTriagemModalOpen(false)} />
                    <div className="fixed top-16 inset-x-0 bottom-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl backdrop-blur-xl w-full max-w-2xl overflow-hidden pointer-events-auto border border-white">
                            <div className="px-6 py-4 border-b border-white/40 flex justify-between items-center bg-white/60">
                                <h3 className="font-black text-lg text-slate-900 drop-shadow-none uppercase tracking-wider flex items-center gap-2">
                                    Triagem / Classificação de Risco
                                </h3>
                                <button onClick={() => setIsTriagemModalOpen(false)} className="p-2 text-slate-500 hover:bg-rose-500/20 hover:text-rose-500 rounded-xl transition-colors">✕</button>
                            </div>

                            <form onSubmit={handleSalvarTriagem} className="p-6 space-y-5">
                                <div className="bg-white/60 p-3 rounded-xl border border-white/40 mb-4">
                                    <p className="text-sm font-black text-slate-900 drop-shadow-none uppercase">{pacienteTriagem.paciente_nome || pacienteTriagem.nomePaciente}</p>
                                </div>

                                <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block">Encaminhar para *</label>
                                    <select required value={formTriagem.medico_destino} onChange={e => setFormTriagem({...formTriagem, medico_destino: e.target.value})} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500/30">
                                        <option value="">Selecione o Consultório...</option>
                                        <option value="DR. CARLOS">Consultório 1 - DR. CARLOS</option>
                                        <option value="DRA. MARIA">Consultório 2 - DRA. MARIA</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block">PA (mmHg)</label>
                                        <input type="text" value={formTriagem.pa} onChange={e => setFormTriagem({...formTriagem, pa: e.target.value})} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="Ex: 120x80" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block">FC (bpm)</label>
                                        <input type="text" value={formTriagem.fc} onChange={e => setFormTriagem({...formTriagem, fc: e.target.value})} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="Ex: 85" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block">Temp (ºC)</label>
                                        <input type="text" value={formTriagem.tax} onChange={e => setFormTriagem({...formTriagem, tax: e.target.value})} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="Ex: 37.5" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block">SpO2 (%)</label>
                                        <input type="text" value={formTriagem.spo2} onChange={e => setFormTriagem({...formTriagem, spo2: e.target.value})} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="Ex: 98" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block">Queixa Principal / Breve Histórico</label>
                                    <textarea value={formTriagem.queixa} onChange={e => setFormTriagem({...formTriagem, queixa: e.target.value})} required className="w-full h-20 px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" placeholder="Relato do paciente..."></textarea>
                                </div>

                                <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-2 block">Classificação de Risco (Manchester)</label>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                        {[
                                            { cor: 'Emergência', bg: 'bg-red-500', text: 'text-slate-800' },
                                            { cor: 'Muito Urgente', bg: 'bg-orange-500', text: 'text-slate-800' },
                                            { cor: 'Urgente', bg: 'bg-yellow-400', text: 'text-slate-900 drop-shadow-none' },
                                            { cor: 'Pouco Urgente', bg: 'bg-green-500', text: 'text-slate-800' },
                                            { cor: 'Não Urgente', bg: 'bg-blue-500/20', text: 'text-slate-800' }
                                        ].map(btn => (
                                            <button type="button" key={btn.cor} onClick={() => setFormTriagem({...formTriagem, classificacao: btn.cor})} className={`h-12 rounded-xl text-[11px] font-black uppercase transition-all border-2 ${formTriagem.classificacao === btn.cor ? `border-slate-800 scale-105 shadow-lg ${btn.bg} ${btn.text}` : `border-transparent opacity-60 hover:opacity-100 ${btn.bg} ${btn.text}`}`}>
                                                {btn.cor}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-white/40">
                                    <button type="button" onClick={() => setIsTriagemModalOpen(false)} className="h-10 px-6 text-slate-500 hover:bg-white/70 font-bold text-xs uppercase rounded-lg transition-colors">Cancelar</button>
                                    <button type="submit" disabled={savingTriagem} className="h-10 px-8 bg-blue-600 text-white font-bold text-xs uppercase rounded-lg shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50">
                                        {savingTriagem ? 'Salvando...' : 'Finalizar Triagem'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
