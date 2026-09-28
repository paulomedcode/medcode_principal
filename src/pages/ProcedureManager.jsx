import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';

import {
    Search, Clock, Save, Loader2, Stethoscope,
    AlertCircle, CheckCircle2, FileText, Filter,
    ArrowUpRight
} from 'lucide-react';
import toast from 'react-hot-toast';

const ProcedureManager = () => {
    // Estados principais
    const [procedures, setProcedures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Estado para controlar qual linha está sendo editada
    const [editingTimes, setEditingTimes] = useState({});

    // --- CARREGAMENTO DOS DADOS ---
    useEffect(() => {
        const fetchProcedures = async () => {
            try {
                let allData = [];
                let from = 0;
                const step = 1000;
                let hasMore = true;

                while (hasMore) {
                    const { data, error } = await supabase
                        .from('sigtap')
                        .select('*')
                        .order('nome', { ascending: true })
                        .range(from, from + step - 1);

                    if (error || !data) throw error || new Error("Erro na busca de SIGTAP");
                    allData = [...allData, ...data];
                    if (data.length < step) hasMore = false;
                    else from += step;
                }
                setProcedures(allData);
            } catch (error) {
                console.error('Erro ao buscar procedimentos', error);
                toast.error('Erro ao carregar os procedimentos');
            } finally {
                setLoading(false);
            }
        };
        fetchProcedures();
    }, []);

    // --- MANIPULAÇÃO DO INPUT ---
    const handleTimeChange = (id, value) => {
        // Atualiza apenas o input daquela linha específica
        setEditingTimes(prev => ({
            ...prev,
            [id]: value
        }));
    };

    // --- SALVAR NO FIREBASE ---
    const handleSave = async (id, originalName) => {
        const timeValue = editingTimes[id];

        if (!timeValue || timeValue <= 0) {
            return toast.error("Por favor, digite um tempo válido em minutos.");
        }

        const toastId = toast.loading("Atualizando banco de dados...");
        try {
            // Atualiza o campo 'tempoPadrao' no documento do procedimento
            const { error } = await supabase.from('sigtap').update({
                tempoPadrao: parseInt(timeValue)
            }).eq('id', id);

            if (error) throw error;

            await logAction('GESTOR DE PROCEDIMENTOS', `Tempo padrão do procedimento "${originalName}" definido para ${timeValue} min.`);

            toast.success(`Tempo de "${originalName}" definido para ${timeValue} min!`, { id: toastId });

            // Limpa o estado de edição dessa linha
            setEditingTimes(prev => {
                const newState = { ...prev };
                delete newState[id];
                return newState;
            });

        } catch (error) {
            console.error("Erro ao salvar:", error);
            toast.error("Erro ao conectar com o servidor.", { id: toastId });
        }
    };

    // --- FILTRAGEM INTELIGENTE ---
    // Pesquisa na lista completa (4000+ itens) mas exibe apenas os 50 primeiros resultados
    // Isso impede que a tela trave ao tentar renderizar tudo de uma vez
    const filteredData = procedures.filter(item => {
        if (!searchTerm) return true;

        const term = searchTerm.toLowerCase();
        const nome = item.nome ? item.nome.toLowerCase() : '';
        const codigo = item.codigo ? String(item.codigo) : '';

        return nome.includes(term) || codigo.includes(term);
    }).slice(0, 50);

    // --- RENDERIZAÇÃO ---
    return (
        <div className="px-4 sm:px-6 pr-8 py-10 min-h-full bg-white/60 font-sans animate-in fade-in duration-700">

            {/* CABEÇALHO DA PÁGINA COMPACTO */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b border-white/60 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-lg text-white shadow-md shadow-blue-200">
                        <Clock size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 uppercase tracking-widest">
                            Gestão de Tempos
                        </h1>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                            {loading ? 'Sincronizando...' : `${procedures.length} procedimentos`}
                        </p>
                    </div>
                </div>

                {/* BARRA DE PESQUISA COMPACTA */}
                <div className="relative w-full md:w-[400px] group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Pesquise por nome ou código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg shadow-sm outline-none focus:border-blue-500 text-sm font-semibold text-slate-900 drop-shadow-none transition-all placeholder:text-slate-500 h-10"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {loading && <Loader2 className="animate-spin text-blue-500" size={16} />}
                    </div>
                </div>
            </div>

            {/* TABELA DE DADOS DENSA */}
            <div className="bg-white/60 backdrop-blur-lg rounded-lg shadow-sm border border-white/400 overflow-hidden flex flex-col h-[calc(100vh-220px)]">
                <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <table className="w-full text-left border-collapse">
                        {/* Cabeçalho da Tabela Sticky */}
                        <thead className="bg-white/60 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/60 w-32">Código SUS</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/60">Nome do Procedimento</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/60 w-40">Duração (Min)</th>
                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/60 text-center w-32">Status</th>
                            </tr>
                        </thead>

                        {/* Corpo da Tabela */}
                        <tbody className="divide-y divide-white/50">
                            {loading ? (
                                // Estado de Carregamento
                                <tr>
                                    <td colSpan="4" className="py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Loader2 className="animate-spin text-blue-500" size={32} />
                                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Carregando...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredData.length > 0 ? (
                                // Lista de Procedimentos
                                filteredData.map((item, idx) => (
                                    <tr key={item.codigo || item.id || idx} className="hover:bg-white/60 transition-all group">

                                        {/* Coluna Código */}
                                        <td className="px-4 py-2 align-middle">
                                            <span className="font-mono font-bold text-[11px] text-slate-600 bg-white/60 px-2 py-0.5 rounded border border-white/60 group-hover:bg-white/80 group-hover:border-blue-200 transition-colors">
                                                {item.codigo || '---'}
                                            </span>
                                        </td>

                                        {/* Coluna Nome */}
                                        <td className="px-4 py-2 align-middle">
                                            <div className="flex items-center gap-2">
                                                <div className="text-slate-600 group-hover:text-blue-400 transition-colors">
                                                    <Stethoscope size={14} />
                                                </div>
                                                <span className="font-bold text-xs text-slate-700 uppercase leading-snug truncate max-w-[400px] block" title={item.nome}>
                                                    {item.nome}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Coluna Input de Tempo */}
                                        <td className="px-4 py-2 align-middle">
                                            <div className={`flex items-center gap-2 bg-white/60 px-2 py-1 rounded-md border transition-all w-24 ${editingTimes[item.id] ? 'border-blue-400 ring-2 ring-blue-50' : 'border-white/60 group-hover:border-blue-300'}`}>
                                                <Clock size={12} className="text-slate-500" />
                                                <input
                                                    type="number"
                                                    placeholder={item.tempoPadrao || "0"}
                                                    value={editingTimes[item.id] !== undefined ? editingTimes[item.id] : (item.tempoPadrao || '')}
                                                    onChange={(e) => handleTimeChange(item.id, e.target.value)}
                                                    className="w-full outline-none text-xs font-bold text-slate-700 placeholder:text-slate-600 bg-transparent"
                                                />
                                            </div>
                                        </td>

                                        {/* Coluna Ações */}
                                        <td className="px-4 py-2 align-middle text-center">
                                            {/* Botão Salvar (Aparece só quando edita) */}
                                            {editingTimes[item.id] ? (
                                                <button
                                                    onClick={() => handleSave(item.id, item.nome)}
                                                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-700 transition-all flex items-center gap-1 mx-auto font-bold text-[10px] uppercase tracking-wide animate-in zoom-in duration-200"
                                                >
                                                    <Save size={12} /> Salvar
                                                </button>
                                            ) : item.tempoPadrao ? (
                                                // Indicador de "Já Configurado"
                                                <div className="text-emerald-500 flex items-center justify-center" title="Tempo Definido">
                                                    <CheckCircle2 size={16} />
                                                </div>
                                            ) : (
                                                // Estado Vazio
                                                <div className="text-slate-700 flex items-center justify-center">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/80"></div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                // Estado "Não Encontrado"
                                <tr>
                                    <td colSpan="4" className="py-20 text-center opacity-70">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="bg-white/60 p-3 rounded-full">
                                                <Filter size={24} className="text-slate-500" />
                                            </div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                                Nada encontrado para "{searchTerm}"
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProcedureManager;