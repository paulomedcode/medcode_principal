import React, { useState, useEffect } from 'react';

import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';
import {
    Search, Plus, Edit, Trash2, X, Save, User, Loader2, Phone, MapPin, CheckCircle2, FileText, Clock, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { gerarPdfAih } from '../utils/geradorPdfAih';
import { PacienteFormModal } from '../components/PacienteFormModal';
import { usePermission } from '../contexts/PermissionContext';

const STATUS_COLORS = {
    'Aguardando': 'bg-white/60 text-slate-500 border-white/60',
    'Agendado': 'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none border-blue-100',
    'Realizado': 'bg-emerald-500/20 text-emerald-600 border-emerald-100',
    'Cancelado': 'bg-rose-500/20 text-rose-500 border-rose-100',
    'Aguardando Autorização': 'bg-amber-500/20 text-amber-600 border-amber-100',
    'Mensagem Enviada': 'bg-sky-50 text-sky-600 border-sky-100'
};

const Pacientes = () => {
    const [pacientes, setPacientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [historicoCirurgias, setHistoricoCirurgias] = useState([]);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [historicoAihs, setHistoricoAihs] = useState([]);
    const [loadingAihs, setLoadingAihs] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();
    const { hasPermission } = usePermission();

    const [settings, setSettings] = useState(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPaciente, setSelectedPaciente] = useState(null);

    // Load Data
    const fetchPacientes = async () => {
        setLoading(true);
        try {
            // Paginação para burlar o limite da API (ex: 1000 linhas)
            let allData = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('pacientes')
                    .select('*')
                    .order('nome', { ascending: true })
                    .range(from, from + step - 1);

                if (error || !data) throw error || new Error("Erro na busca paginada");
                allData = [...allData, ...data];
                if (data.length < step) hasMore = false;
                else from += step;
            }

            setPacientes(allData);
        } catch (error) {
            console.error("Erro ao buscar pacientes no Supabase:", error);
            toast.error("Erro ao carregar lista de pacientes.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const fetchSettings = async () => {
            const { data } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
            if (data && data.data) setSettings(data.data);
        };
        fetchSettings();
        fetchPacientes();

        const subscription = supabase
            .channel('custom-pacientes-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pacientes' },
                (payload) => {
                    console.log('Mudança detectada em Pacientes:', payload);
                    fetchPacientes();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    // Filter Logic
    const filteredPacientes = pacientes.filter(p => {
        const term = searchTerm.toLowerCase();
        return (
            (p.nome && p.nome.toLowerCase().includes(term)) ||
            (p.cpf && p.cpf.includes(term)) ||
            (p.cns && p.cns.includes(term))
        );
    });

    const handleOpenModal = (paciente = null) => {
        setSelectedPaciente(paciente);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedPaciente(null);
    };

    const handleDelete = async (paciente) => {
        if (window.confirm('Tem certeza que deseja excluir este paciente? Esta ação não pode ser desfeita.')) {
            try {
                const { error } = await supabase.from('pacientes').delete().eq('id', paciente.id);
                if (error) throw error;

                // LOG DE EXCLUSÃO
                const dadosExcluidos = Object.entries(paciente)
                    .filter(([k, v]) => v !== null && v !== '' && k !== 'id' && k !== 'created_at')
                    .map(([k, v]) => `${k.toUpperCase()}: [${v}]`)
                    .join(' | ');
                    
                await logAction('EXCLUSÃO DE REGISTRO', `Excluiu o paciente: ${paciente.nome || 'Desconhecido'} | Dados Perdidos -> ${dadosExcluidos}`);
                toast.success('Paciente excluído.');
                fetchPacientes();
            } catch (error) {
                console.error(error);
                if (error.code === '23503') {
                    toast.error('Este paciente não pode ser excluído pois possui registros vinculados (consultas, cirurgias, etc).');
                } else {
                    toast.error('Erro ao excluir.');
                }
            }
        }
    };

    const inputStyle = "w-full h-9 px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/30 transition-all text-slate-900 drop-shadow-none placeholder:text-slate-500";
    const labelStyle = "text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block tracking-wider";

    return (
        <div className="px-4 lg:px-4 pr-4 py-4 sm:px-4 font-sans animate-in fade-in duration-700 text-slate-800 w-full min-h-full bg-slate-50/20 print:hidden">
            <div className="max-w-7xl mx-auto space-y-3">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-3 pb-3 border-b border-white/60 gap-3">
                    <div>
                        <h1 className="text-lg font-black tracking-normal text-slate-800 flex items-center gap-2">
                            <User className="text-blue-600" size={20} /> Central de Pacientes
                        </h1>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Prontuário Eletrônico</p>
                    </div>
                    {hasPermission('Criar Pacientes') && (
                        <button onClick={() => handleOpenModal()} className="px-4 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-[0_4px_15px_rgba(79,70,229,0.4)] transition-all flex items-center gap-2">
                            <Plus size={16} strokeWidth={3} /> Novo Paciente
                        </button>
                    )}
                </div>

                {/* Filtro Principal */}
                <div className="bg-white/60 backdrop-blur-lg p-2.5 rounded-xl shadow-sm border border-white/400 mb-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                            type="text"
                            placeholder="Pesquisar por Nome, CPF ou CNS..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full py-1.5 pl-8 pr-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold text-xs placeholder:text-slate-500"
                        />
                    </div>
                </div>

                {/* Tabela de Pacientes */}
                <div className="bg-white/60 backdrop-blur-lg rounded-xl shadow-sm border border-white/400 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] divide-y divide-slate-200">
                            <thead className="bg-white/60">
                                <tr className="text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="py-1.5 px-3">Paciente</th>
                                    <th className="py-1.5 px-3">Documentos</th>
                                    <th className="py-1.5 px-3">Nascimento</th>
                                    <th className="py-1.5 px-3">Contato</th>
                                    <th className="py-1.5 px-3 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-transparent">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="py-20 text-center">
                                            <Loader2 className="animate-spin mx-auto text-blue-500" size={32} />
                                        </td>
                                    </tr>
                                ) : filteredPacientes.length > 0 ? (
                                    filteredPacientes.map((paciente) => (
                                        <tr
                                            key={paciente.id}
                                            onClick={() => handleOpenModal(paciente)}
                                            className="hover:bg-white/60 transition-colors group cursor-pointer"
                                        >
                                            <td className="px-3 py-1.5">
                                                <div className="font-bold text-slate-900 drop-shadow-none text-xs uppercase">{paciente.nome}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">{paciente.sexo || 'N/I'}</div>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <div className="text-[11px] font-bold text-slate-600">CPF: {paciente.cpf || '---'}</div>
                                                <div className="text-[10px] font-semibold text-slate-500">CNS: {paciente.cns || '---'}</div>
                                            </td>
                                            <td className="px-3 py-1.5 text-xs font-bold text-slate-600">
                                                {paciente.dataNascimento ? paciente.dataNascimento.split('-').reverse().join('/') : '---'}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><Phone size={12} className="text-emerald-500" /> {paciente.telefone || '---'}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 truncate max-w-[150px] mt-0.5"><MapPin size={10} className="inline mr-1" />{paciente.municipio}-{paciente.uf}</div>
                                            </td>
                                            <td className="px-3 py-1.5 text-center">
                                                <div className="flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {hasPermission('Editar Pacientes') && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleOpenModal(paciente); }} className="p-1.5 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none hover:bg-blue-100 rounded-lg transition-colors" title="Ver Perfil">
                                                            <Edit size={14} />
                                                        </button>
                                                    )}
                                                    {hasPermission('Excluir Pacientes') && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(paciente); }} className="p-1.5 bg-rose-500/20 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors" title="Excluir">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="py-20 text-center text-slate-500 font-bold uppercase text-sm">
                                            Nenhum paciente encontrado.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <PacienteFormModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    paciente={selectedPaciente}
                    onSuccess={() => {
                        fetchPacientes();
                    }}
                />
            </div>
        </div>
    );
};

export default Pacientes;
