import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';
import toast from 'react-hot-toast';
import { 
    Bed, BedDouble, User, Activity, AlertCircle, 
    Settings, Plus, CheckCircle2, Loader2, RefreshCcw
} from 'lucide-react';

const STATUS_COLORS = {
    'Livre': 'bg-emerald-500/20 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
    'Ocupado': 'bg-blue-500/20 border-blue-200 text-blue-700 hover:bg-blue-100',
    'Limpeza': 'bg-amber-500/20 border-amber-200 text-amber-700 hover:bg-amber-100',
    'Manutenção': 'bg-white/70 border-white/80 text-slate-500 hover:bg-white/80'
};

const ICONS = {
    'Livre': <CheckCircle2 size={16} />,
    'Ocupado': <User size={16} />,
    'Limpeza': <RefreshCcw size={16} />,
    'Manutenção': <Settings size={16} />
};

const Internacao = () => {
    const [mapa, setMapa] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Indicadores (Totais)
    const [stats, setStats] = useState({ total: 0, livres: 0, ocupados: 0 });

    // Estados do Modal de Admissão
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [buscaPaciente, setBuscaPaciente] = useState('');
    const [resultadosPacientes, setResultadosPacientes] = useState([]);
    const [buscandoPacientes, setBuscandoPacientes] = useState(false);
    
    const initialForm = { paciente_id: null, paciente_nome: '', leito_id: '', medico_responsavel: '', diagnostico: '' };
    const [formData, setFormData] = useState(initialForm);

    // Estados do Modal de Gerenciamento de Leito
    const [isGerenciarModalOpen, setIsGerenciarModalOpen] = useState(false);
    const [leitoSelecionado, setLeitoSelecionado] = useState(null);

    useEffect(() => {
        const delay = setTimeout(async () => {
            if (buscaPaciente.length >= 3) {
                setBuscandoPacientes(true);
                const { data, error } = await supabase.from('pacientes').select('id, nome, cpf, data_nascimento').ilike('nome', `%${buscaPaciente}%`).limit(5);
                if (!error && data) setResultadosPacientes(data);
                setBuscandoPacientes(false);
            } else {
                setResultadosPacientes([]);
            }
        }, 400);
        return () => clearTimeout(delay);
    }, [buscaPaciente]);

    const selecionarPaciente = (pac) => {
        setFormData({ ...formData, paciente_id: pac.id, paciente_nome: pac.nome });
        setBuscaPaciente(pac.nome);
        setResultadosPacientes([]);
    };

    const handleSalvarAdmissao = async (e) => {
        e.preventDefault();
        if (!formData.paciente_id || !formData.leito_id) return toast.error("Selecione o paciente e o leito!");
        setSaving(true);
        try {
            // 1. Cria a internação
            const { error: errInt } = await supabase.from('internacoes').insert([{
                paciente_id: formData.paciente_id,
                paciente_nome: formData.paciente_nome,
                leito_id: formData.leito_id,
                medico_responsavel: formData.medico_responsavel,
                diagnostico: formData.diagnostico,
                status: 'Internado'
            }]);
            if (errInt) throw errInt;

            // 2. Atualiza o status do leito para Ocupado
            const { error: errLeito } = await supabase.from('leitos').update({ status: 'Ocupado' }).eq('id', formData.leito_id);
            if (errLeito) throw errLeito;

            await logAction('INTERNAÇÃO DE PACIENTE', `Paciente ${formData.paciente_nome} internado no leito ID: ${formData.leito_id}.`);

            toast.success("Paciente admitido com sucesso!");
            setIsModalOpen(false);
            setFormData(initialForm);
            setBuscaPaciente('');
            fetchMapa(); // Recarrega o mapa visual
        } catch (error) {
            console.error(error);
            toast.error("Erro ao realizar admissão.");
        } finally {
            setSaving(false);
        }
    };

    const handleAltaPaciente = async () => {
        if (!leitoSelecionado?.internacao) return;
        if (!window.confirm("Deseja realmente dar alta para este paciente?")) return;
        setSaving(true);
        try {
            // 1. Dar alta na internação
            const { error: errInt } = await supabase.from('internacoes')
                .update({ status: 'Alta', data_alta: new Date().toISOString() })
                .eq('id', leitoSelecionado.internacao.id);
            if (errInt) throw errInt;

            // 2. Mudar leito para Limpeza (Fluxo hospitalar padrão)
            const { error: errLeito } = await supabase.from('leitos')
                .update({ status: 'Limpeza' })
                .eq('id', leitoSelecionado.id);
            if (errLeito) throw errLeito;

            await logAction('ALTA DE PACIENTE', `Paciente ${leitoSelecionado.internacao.paciente_nome} recebeu alta do leito ${leitoSelecionado.identificacao}.`);

            toast.success('Alta realizada! Leito aguardando higienização.');
            setIsGerenciarModalOpen(false);
            fetchMapa(); // Atualiza a tela
        } catch (error) {
            console.error(error);
            toast.error('Erro ao realizar alta.');
        } finally {
            setSaving(false);
        }
    };

    const handleMudarStatusLeito = async (novoStatus) => {
        setSaving(true);
        try {
            const { error } = await supabase.from('leitos')
                .update({ status: novoStatus })
                .eq('id', leitoSelecionado.id);
            if (error) throw error;

            await logAction('STATUS DE LEITO', `Leito ${leitoSelecionado.identificacao} alterado para status ${novoStatus}.`);

            toast.success(`Status do leito atualizado para: ${novoStatus}`);
            setIsGerenciarModalOpen(false);
            fetchMapa();
        } catch (error) {
            console.error(error);
            toast.error('Erro ao atualizar status do leito.');
        } finally {
            setSaving(false);
        }
    };

    const fetchMapa = async () => {
        setLoading(true);
        try {
            // 1. Busca todos os setores
            const { data: setoresData, error: errSetores } = await supabase.from('leitos_setores').select('*').order('nome');
            if (errSetores) throw errSetores;

            // 2. Busca todos os leitos
            const { data: leitosData, error: errLeitos } = await supabase.from('leitos').select('*').order('identificacao');
            if (errLeitos) throw errLeitos;

            // 3. Busca internações ativas
            const { data: intData, error: errInt } = await supabase.from('internacoes').select('*').eq('status', 'Internado');
            if (errInt) throw errInt;

            // 4. Monta a estrutura (Merge)
            let tTotal = 0, tLivres = 0, tOcupados = 0;

            const mapaMontado = setoresData.map(setor => {
                const leitosDoSetor = leitosData.filter(l => l.setor_id === setor.id).map(leito => {
                    tTotal++;
                    if (leito.status === 'Livre') tLivres++;
                    if (leito.status === 'Ocupado') tOcupados++;

                    return {
                        ...leito,
                        internacao: intData.find(i => i.leito_id === leito.id) || null
                    };
                });
                return { ...setor, leitos: leitosDoSetor };
            });

            setStats({ total: tTotal, livres: tLivres, ocupados: tOcupados });
            setMapa(mapaMontado);
        } catch (error) {
            console.error("Erro ao buscar mapa:", error);
            toast.error("Erro ao carregar o mapa de leitos.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMapa();

        // Realtime para atualizar o painel de leitos automaticamente (com debounce para evitar refetch em massa)
        let debounceTimer;
        const debouncedFetch = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchMapa(), 400);
        };

        const channel = supabase
            .channel('realtime_internacao')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leitos' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'internacoes' }, debouncedFetch)
            .subscribe();

        return () => {
            clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, []);

    const handleLeitoClick = (leito) => {
        setLeitoSelecionado(leito);
        setIsGerenciarModalOpen(true);
    };

    return (
        <div className="px-4 sm:px-6 pr-4 lg:pr-8 py-6 min-h-full bg-white/60 font-sans">
            
            {/* HEADER */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/60 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-teal-600 text-white rounded-xl shadow-lg shadow-teal-500/30">
                        <BedDouble size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 uppercase tracking-wider">Mapa de Leitos</h1>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Gestão de Internações</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={fetchMapa} className="h-10 px-4 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-600 hover:text-teal-600 hover:bg-teal-50 hover:border-teal-200 rounded-lg font-bold text-xs uppercase transition-all flex items-center gap-2 shadow-sm">
                        <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar Mapa
                    </button>
                    <button onClick={() => setIsModalOpen(true)} className="h-10 px-5 bg-teal-600 text-white rounded-lg font-bold text-xs uppercase shadow-md shadow-teal-500/20 hover:bg-teal-700 transition-all flex items-center gap-2">
                        <Plus size={16} /> Nova Admissão
                    </button>
                </div>
            </div>

            {/* DASHBOARD INDICADORES */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white/60 backdrop-blur-lg p-4 rounded-2xl shadow-sm backdrop-blur-md border border-white/400 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Total de Leitos</p>
                        <h3 className="text-2xl font-black text-slate-900 drop-shadow-none">{stats.total}</h3>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center text-slate-500"><Bed size={20}/></div>
                </div>
                <div className="bg-emerald-500/20/60 backdrop-blur-lg p-4 rounded-2xl shadow-sm backdrop-blur-md border border-emerald-100 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-black text-emerald-600/70 uppercase tracking-widest">Leitos Livres</p>
                        <h3 className="text-2xl font-black text-emerald-700">{stats.livres}</h3>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-200/50 flex items-center justify-center text-emerald-600"><CheckCircle2 size={20}/></div>
                </div>
                <div className="bg-blue-500/20/60 backdrop-blur-lg p-4 rounded-2xl shadow-sm backdrop-blur-md border border-blue-100 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-black text-blue-600/70 uppercase tracking-widest">Ocupados</p>
                        <h3 className="text-2xl font-black text-blue-700">{stats.ocupados}</h3>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-200/50 flex items-center justify-center text-blue-600"><User size={20}/></div>
                </div>
                <div className="bg-amber-500/20/60 backdrop-blur-lg p-4 rounded-2xl shadow-sm backdrop-blur-md border border-amber-100 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-black text-amber-600/70 uppercase tracking-widest">Taxa Ocupação</p>
                        <h3 className="text-2xl font-black text-amber-700">
                            {stats.total > 0 ? Math.round((stats.ocupados / stats.total) * 100) : 0}%
                        </h3>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-amber-200/50 flex items-center justify-center text-amber-600"><Activity size={20}/></div>
                </div>
            </div>

            {/* MAPA VISUAL */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <Loader2 size={32} className="animate-spin mb-4 text-teal-500" />
                    <span className="text-xs font-bold uppercase tracking-widest">Carregando Mapa...</span>
                </div>
            ) : (
                <div className="space-y-8">
                    {mapa.map(setor => (
                        <div key={setor.id} className="bg-white/60 backdrop-blur-lg p-6 rounded-2xl shadow-sm backdrop-blur-md border border-white/400">
                            <h2 className="text-sm font-black text-slate-900 drop-shadow-none uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-white/40 pb-2">
                                <span className="w-2 h-2 rounded-full bg-teal-500"></span> {setor.nome}
                            </h2>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {setor.leitos.map(leito => (
                                    <div 
                                        key={leito.id}
                                        onClick={() => handleLeitoClick(leito)}
                                        className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer shadow-sm flex flex-col items-center justify-center text-center gap-2 ${STATUS_COLORS[leito.status]}`}
                                    >
                                        <div className="absolute top-2 right-2 opacity-50">
                                            {ICONS[leito.status]}
                                        </div>
                                        <BedDouble size={28} className="mt-2 opacity-80" />
                                        <div className="w-full">
                                            <h4 className="text-sm font-black uppercase tracking-wider truncate">{leito.identificacao}</h4>
                                            
                                            {leito.status === 'Ocupado' ? (
                                                <p className="text-[10px] font-bold uppercase mt-1 truncate px-1 bg-white/60 rounded text-blue-800">
                                                    {leito.internacao?.paciente_nome?.split(' ')[0] || 'Desconhecido'}
                                                </p>
                                            ) : (
                                                <p className="text-[10px] font-bold uppercase mt-1 opacity-70">{leito.status}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {setor.leitos.length === 0 && (
                                    <p className="col-span-full text-xs font-bold text-slate-500 uppercase py-4">Nenhum leito configurado neste setor.</p>
                                )}
                            </div>
                        </div>
                    ))}
                    {mapa.length === 0 && (
                        <div className="text-center py-10 text-slate-500">
                            <AlertCircle size={32} className="mx-auto mb-2 opacity-30"/>
                            <p className="text-[11px] font-bold uppercase tracking-widest">Nenhum setor cadastrado no sistema.</p>
                        </div>
                    )}
                </div>
            )}

            {isModalOpen && (
                <>
                    <div className="fixed top-16 inset-x-0 bottom-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm z-[9998]" onClick={() => setIsModalOpen(false)} />
                    <div className="fixed top-16 inset-x-0 bottom-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl backdrop-blur-xl w-full max-w-2xl overflow-hidden pointer-events-auto border border-white">
                            <div className="px-6 py-4 border-b border-white/40 flex justify-between items-center bg-white/60">
                                <h3 className="font-black text-lg text-slate-900 drop-shadow-none uppercase tracking-wider flex items-center gap-2">
                                    <BedDouble size={20} className="text-teal-600" /> Nova Admissão
                                </h3>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-500 hover:bg-rose-500/20 hover:text-rose-500 rounded-xl transition-colors">✕</button>
                            </div>

                            <form onSubmit={handleSalvarAdmissao} className="p-6 space-y-5">
                                <div className="relative">
                                    <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block tracking-widest">Buscar Paciente *</label>
                                    <input required type="text" value={buscaPaciente} onChange={(e) => { setBuscaPaciente(e.target.value); setFormData({...formData, paciente_id: null, paciente_nome: e.target.value}); }} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-700" placeholder="Digite o nome do paciente..." />
                                    {buscandoPacientes && <Loader2 size={14} className="absolute right-3 top-8 text-teal-500 animate-spin" />}
                                    
                                    {resultadosPacientes.length > 0 && (
                                        <div className="absolute z-50 w-full mt-1 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                            {resultadosPacientes.map(pac => (
                                                <div key={pac.id} onClick={() => selecionarPaciente(pac)} className="p-3 hover:bg-teal-50 cursor-pointer border-b border-white/40 transition-colors">
                                                    <div className="text-xs font-bold text-slate-900 drop-shadow-none uppercase">{pac.nome}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block tracking-widest">Leito Destino *</label>
                                        <select required value={formData.leito_id} onChange={e => setFormData({...formData, leito_id: e.target.value})} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-700">
                                            <option value="">Selecione um leito livre...</option>
                                            {mapa.map(setor => (
                                                <optgroup key={setor.id} label={setor.nome}>
                                                    {setor.leitos.filter(l => l.status === 'Livre').map(leito => (
                                                        <option key={leito.id} value={leito.id}>{leito.identificacao}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block tracking-widest">Médico Responsável</label>
                                        <input type="text" value={formData.medico_responsavel} onChange={e => setFormData({...formData, medico_responsavel: e.target.value})} className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-700" placeholder="Ex: Dr. Carlos..." />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[11px] font-black text-slate-500 uppercase ml-1 mb-1 block tracking-widest">Diagnóstico / Motivo da Internação</label>
                                    <textarea value={formData.diagnostico} onChange={e => setFormData({...formData, diagnostico: e.target.value})} className="w-full h-20 px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-700 resize-none" placeholder="Motivo da admissão..."></textarea>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-white/40">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="h-10 px-6 text-slate-500 hover:bg-white/70 font-bold text-xs uppercase rounded-lg transition-colors">Cancelar</button>
                                    <button type="submit" disabled={saving} className="h-10 px-8 bg-teal-600 text-white font-bold text-xs uppercase rounded-lg shadow-md shadow-teal-500/30 hover:bg-teal-700 transition-all flex items-center gap-2 disabled:opacity-50">
                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Confirmar Admissão
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </>
            )}

            {/* MODAL DE GERENCIAR LEITO */}
            {isGerenciarModalOpen && leitoSelecionado && (
                <>
                    <div className="fixed top-16 inset-x-0 bottom-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm z-[9998]" onClick={() => setIsGerenciarModalOpen(false)} />
                    <div className="fixed top-16 inset-x-0 bottom-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl backdrop-blur-xl w-full max-w-sm overflow-hidden pointer-events-auto border border-white">
                            <div className="px-6 py-4 border-b border-white/40 flex justify-between items-center bg-white/60">
                                <h3 className="font-black text-lg text-slate-900 drop-shadow-none uppercase tracking-wider flex items-center gap-2">
                                    <Settings size={20} className="text-slate-600" /> {leitoSelecionado.identificacao}
                                </h3>
                                <button onClick={() => setIsGerenciarModalOpen(false)} className="p-2 text-slate-500 hover:bg-rose-500/20 hover:text-rose-500 rounded-xl transition-colors">✕</button>
                            </div>

                            <div className="p-6 space-y-5">
                                {/* SE OCUPADO: MOSTRA DADOS DO PACIENTE E BOTÃO DE ALTA */}
                                {leitoSelecionado.status === 'Ocupado' && leitoSelecionado.internacao ? (
                                    <div className="space-y-4">
                                        <div className="p-4 bg-blue-500/20 border border-blue-100 rounded-xl">
                                            <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2"><User size={14}/> Paciente Internado</h4>
                                            <p className="text-sm font-black text-slate-900 drop-shadow-none uppercase">{leitoSelecionado.internacao.paciente_nome}</p>
                                            <div className="mt-3 space-y-1">
                                                <p className="text-[11px] font-bold text-slate-500 uppercase">Admissão: <span className="text-slate-700">{new Date(leitoSelecionado.internacao.data_admissao).toLocaleDateString('pt-BR')}</span></p>
                                                <p className="text-[11px] font-bold text-slate-500 uppercase">Médico: <span className="text-slate-700">{leitoSelecionado.internacao.medico_responsavel || 'Não informado'}</span></p>
                                            </div>
                                        </div>
                                        <button onClick={handleAltaPaciente} disabled={saving} className="w-full h-12 bg-rose-500/20 hover:bg-rose-600 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                                            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Dar Alta (Liberar Leito)
                                        </button>
                                    </div>
                                ) : (
                                    /* SE LIVRE/LIMPEZA/MANUTENÇÃO: MOSTRA BOTÕES DE STATUS */
                                    <div className="space-y-4">
                                        <div className="text-center p-4 bg-white/60 border border-white/40 rounded-xl mb-4">
                                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Status Atual do Leito</p>
                                            <p className={`text-lg font-black uppercase mt-1 ${leitoSelecionado.status === 'Livre' ? 'text-emerald-600' : leitoSelecionado.status === 'Limpeza' ? 'text-amber-600' : 'text-slate-600'}`}>
                                                {leitoSelecionado.status}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => handleMudarStatusLeito('Livre')} disabled={saving || leitoSelecionado.status === 'Livre'} className="h-10 bg-emerald-500/20 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] uppercase rounded-lg transition-all disabled:opacity-50">🟢 Marcar Livre</button>
                                            <button onClick={() => handleMudarStatusLeito('Limpeza')} disabled={saving || leitoSelecionado.status === 'Limpeza'} className="h-10 bg-amber-500/20 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold text-[11px] uppercase rounded-lg transition-all disabled:opacity-50">🟡 Em Limpeza</button>
                                            <button onClick={() => handleMudarStatusLeito('Manutenção')} disabled={saving || leitoSelecionado.status === 'Manutenção'} className="h-10 bg-white/70 hover:bg-white/80 text-slate-600 border border-white/80 font-bold text-[11px] uppercase rounded-lg transition-all disabled:opacity-50 col-span-2">⚪ Em Manutenção</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Internacao;
