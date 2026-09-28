import React, { useState, useEffect } from 'react';
import { X, Search, User, FileText } from 'lucide-react';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';
import toast from 'react-hot-toast';

export const NovoAtendimentoModal = ({ isOpen, onClose, unidadeAtual }) => {
    const [pacientes, setPacientes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showPacientes, setShowPacientes] = useState(false);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        pacienteId: '', nomePaciente: '', cpf: '', idadeInfo: '',
        queixaPrincipal: '', tipoAtendimento: 'Consulta Agendada'
    });

    useEffect(() => {
        if (!isOpen) return;
        const fetchPacientes = async () => {
            try {
                const { data, error } = await supabase.from('pacientes').select('*');
                if (error) throw error;
                setPacientes(data || []);
            } catch (error) { console.error(error); }
        };
        fetchPacientes();
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredPacientes = pacientes.filter(p =>
        p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cpf?.includes(searchTerm)
    ).slice(0, 5);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.pacienteId) return toast.error('Selecione um paciente!');
        if (!formData.queixaPrincipal) return toast.error('Informe a queixa principal!');

        setLoading(true);
        try {
            const { error } = await supabase.from('atendimentos').insert([{
                ...formData,
                unidade: unidadeAtual,
                status: 'Aguardando Triagem',
                classificacaoRisco: 'Não Classificado',
                dataChegada: new Date().toISOString(),
                triagemRealizada: false,
                medicoAtribuido: ''
            }]);

            if (error) throw error;
            await logAction('NOVO ATENDIMENTO P.A.', `Paciente ${formData.nomePaciente} adicionado à fila de triagem.`);

            toast.success('Paciente na fila de triagem!');
            onClose();
        } catch (error) {
            toast.error('Erro ao adicionar à fila.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[200] flex items-center justify-center p-4 bg-white/40 backdrop-blur-sm backdrop-blur-sm animate-in fade-in">
            <div className="bg-white/60 rounded-2xl shadow-2xl backdrop-blur-xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div className="bg-blue-600 px-4 py-3 flex justify-between items-center">
                    <h2 className="text-slate-800 font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                        <User size={16} /> Novo Atendimento - {unidadeAtual}
                    </h2>
                    <button onClick={onClose} className="text-white/70 hover:text-slate-800 transition-colors"><X size={20} /></button>
                </div>

                <form onSubmit={handleSave} className="p-5 space-y-4 bg-white/60">
                    <div className="bg-white/60 p-4 rounded-xl shadow-sm border border-white/40">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Buscar Paciente</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                            <input
                                type="text" value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setShowPacientes(true); }}
                                onFocus={() => setShowPacientes(true)}
                                className="w-full pl-9 pr-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                                placeholder="Nome ou CPF..." autoComplete="off"
                            />

                            {showPacientes && searchTerm && (
                                <div className="absolute z-50 w-full mt-1 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl shadow-xl overflow-hidden">
                                    {filteredPacientes.map(p => (
                                        <div key={p.id} onMouseDown={() => {
                                            setFormData(prev => ({ ...prev, pacienteId: p.id, nomePaciente: p.nome, cpf: p.cpf || '', idadeInfo: p.idade || '--' }));
                                            setSearchTerm(p.nome);
                                            setShowPacientes(false);
                                        }} className="p-3 hover:bg-blue-500/20 cursor-pointer border-b border-slate-50">
                                            <div className="text-xs font-bold text-slate-900 drop-shadow-none">{p.nome}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">{p.cpf || 'Sem CPF'}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white/60 p-4 rounded-xl shadow-sm border border-white/40 space-y-3">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Tipo de Atendimento</label>
                            <select
                                value={formData.tipoAtendimento} onChange={e => setFormData({ ...formData, tipoAtendimento: e.target.value })}
                                className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs font-semibold outline-none"
                            >
                                <option value="Consulta Agendada">Consulta Agendada (Atenção Básica)</option>
                                <option value="Demanda Espontânea">Demanda Espontânea (Chegou agora)</option>
                                <option value="Urgência">Urgência / Emergência</option>
                                <option value="Retorno">Retorno de Exames</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><FileText size={12} /> Queixa Principal / Motivo</label>
                            <textarea
                                value={formData.queixaPrincipal} onChange={e => setFormData({ ...formData, queixaPrincipal: e.target.value })}
                                rows="3" className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs font-semibold outline-none resize-none"
                                placeholder="Ex: Dor de cabeça há 2 dias, febre..."
                            ></textarea>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-white/80 rounded-lg transition-colors">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-6 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md disabled:opacity-50 flex items-center gap-2">
                            {loading ? 'Adicionando...' : 'Enviar para Triagem'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
