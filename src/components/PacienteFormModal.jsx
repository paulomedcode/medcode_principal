import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { supabase } from '../services/supabase';

import { logAction } from '../utils/logger';
import { User, Loader2, Phone, MapPin, X, Save, FileText, Clock, Printer, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { EditSurgeryModal } from '../pages/SurgeryQueue';
import { gerarPdfAih } from '../utils/geradorPdfAih';
import { maskCPF, maskTelefone, maskCEP, maskCNS } from '../utils/masks';
import { usePermission } from '../contexts/PermissionContext';
import ApaPrintTemplate from './ApaPrintTemplate';

const STATUS_COLORS = {
    'Aguardando': 'bg-white/60 text-slate-500 border-white/60',
    'Agendado': 'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none border-blue-100',
    'Realizado': 'bg-emerald-500/20 text-emerald-600 border-emerald-100',
    'Cancelado': 'bg-rose-500/20 text-rose-500 border-rose-100',
    'Aguardando Autorização': 'bg-amber-500/20 text-amber-600 border-amber-100',
    'Mensagem Enviada': 'bg-sky-50 text-sky-600 border-sky-100'
};

export const PacienteFormModal = ({ isOpen, onClose, onSuccess, paciente, onReload = () => { }, customSaveText = "Salvar Alterações" }) => {
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Criar Pacientes') || hasPermission('Editar Pacientes');

    const [editingId, setEditingId] = useState(paciente ? paciente.id : null);
    const [saving, setSaving] = useState(false);
    const [abaAtiva, setAbaAtiva] = useState('cadastro');
    const [cirurgiaEmEdicao, setCirurgiaEmEdicao] = useState(null);
    const [settings, setSettings] = useState({});

    const [historicoCirurgias, setHistoricoCirurgias] = useState([]);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [historicoAihs, setHistoricoAihs] = useState([]);
    const [loadingAihs, setLoadingAihs] = useState(false);

    const [historicoApas, setHistoricoApas] = useState([]);
    const [loadingApas, setLoadingApas] = useState(false);
    const [apaParaImprimir, setApaParaImprimir] = useState(null);

    const [formData, setFormData] = useState({
        nome: '',
        cpf: '',
        cns: '',
        dataNascimento: '',
        sexo: '',
        nomeMae: '',
        telefone: '',
        rua: '',
        numero: '',
        bairro: '',
        municipio: '',
        uf: 'SP',
        cep: '',
        peso: '',
        altura: '',
        email: ''
    });

    useEffect(() => {
        if (paciente) {
            setFormData({
                nome: paciente.nome || '',
                cpf: paciente.cpf || '',
                cns: paciente.cns || '',
                dataNascimento: paciente.dataNascimento || '',
                sexo: paciente.sexo || '',
                nomeMae: paciente.nomeMae || '',
                telefone: paciente.telefone || '',
                rua: paciente.rua || '',
                numero: paciente.numero || '',
                bairro: paciente.bairro || '',
                municipio: paciente.municipio || '',
                uf: paciente.uf || 'SP',
                cep: paciente.cep || '',
                peso: paciente.peso || '',
                altura: paciente.altura || '',
                email: paciente.email || ''
            });
            setEditingId(paciente.id);

            buscarHistoricoCirurgico(paciente.cpf);
            buscarHistoricoAihs(paciente.id);
            buscarHistoricoApas(paciente);
        } else {
            setFormData({
                nome: '',
                cpf: '',
                cns: '',
                dataNascimento: '',
                sexo: '',
                nomeMae: '',
                telefone: '',
                rua: '',
                numero: '',
                bairro: '',
                municipio: '',
                uf: 'SP',
                cep: '',
                peso: '',
                altura: '',
                email: ''
            });
            setEditingId(null);
            setHistoricoCirurgias([]);
            setHistoricoAihs([]);
            setHistoricoApas([]);
        }
    }, [paciente]);

    useEffect(() => {
        const fetchSettings = async () => {
            const { data } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
            if (data && data.data) setSettings(data.data);
        };
        fetchSettings();
    }, []);

    const buscarHistoricoCirurgico = async (cpf) => {
        setLoadingHistorico(true);
        try {
            if (!cpf) {
                setHistoricoCirurgias([]);
                setLoadingHistorico(false);
                return;
            }
            const { data, error } = await supabase.from('surgeries').select('*').limit(5000).eq('cpf', cpf);
            if (error) throw error;

            const dados = data || [];
            dados.sort((a, b) => {
                const dataA = a.dataAgendado || a.createdAt || '';
                const dataB = b.dataAgendado || b.createdAt || '';
                return dataB.localeCompare(dataA);
            });

            setHistoricoCirurgias(dados);
        } catch (error) {
            console.error("Erro ao buscar histórico no Supabase:", error);
            toast.error("Erro ao carregar histórico cirúrgico.");
        } finally {
            setLoadingHistorico(false);
        }
    };

    const buscarHistoricoAihs = async (pacienteId) => {
        setLoadingAihs(true);
        try {
            const { data, error } = await supabase.from('aihs').select('*').eq('pacienteId', pacienteId);
            if (error) throw error;
            const dados = data || [];

            dados.sort((a, b) => {
                const dataA = a.dataSolicitacao || a.createdAt || '';
                const dataB = b.dataSolicitacao || b.createdAt || '';
                return dataB.localeCompare(dataA);
            });

            setHistoricoAihs(dados);
        } catch (error) {
            console.error("Erro ao buscar AIHs:", error);
            toast.error("Erro ao carregar histórico de AIHs.");
        } finally {
            setLoadingAihs(false);
        }
    };

    const buscarHistoricoApas = async (pac) => {
        setLoadingApas(true);
        try {
            let queryObj = supabase.from('apas').select('*');
            if (pac.cpf) {
                queryObj = queryObj.eq('cpf', pac.cpf);
            } else {
                queryObj = queryObj.eq('nome', pac.nome);
            }
            const { data, error } = await queryObj;
            if (error) throw error;
            const dados = data || [];

            dados.sort((a, b) => {
                const dataA = a.dataRegistro || '';
                const dataB = b.dataRegistro || '';
                return dataB.localeCompare(dataA);
            });

            setHistoricoApas(dados);
        } catch (error) {
            console.error("Erro ao buscar APAs:", error);
            toast.error("Erro ao carregar histórico de APAs.");
        } finally {
            setLoadingApas(false);
        }
    };

    const handleChange = (e) => {
        let { name, value } = e.target;

        if (name === 'cpf') value = maskCPF(value);
        if (name === 'telefone') value = maskTelefone(value);
        if (name === 'cep') value = maskCEP(value);
        if (name === 'cns') value = maskCNS(value);

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();

        // Validação
        if (!formData.nome.trim()) return toast.error("O Nome é obrigatório!");
        if (!formData.sexo) return toast.error("O Sexo é obrigatório!");

        setSaving(true);
        try {
            const payload = {
                ...formData,
                updatedAt: new Date().toISOString()
            };

            let returnedObj = {};
            if (editingId) {
                // LÓGICA DE DIFF PARA O LOG DE AUDITORIA
                const alteracoesReais = [];
                Object.keys(formData).forEach(key => {
                    const oldVal = (paciente[key] === null || paciente[key] === undefined || paciente[key] === '') ? 'Vazio' : paciente[key];
                    const newVal = (formData[key] === null || formData[key] === undefined || formData[key] === '') ? 'Vazio' : formData[key];

                    if (String(oldVal) !== String(newVal)) {
                        alteracoesReais.push(`${key.toUpperCase()}: de [${oldVal}] para [${newVal}]`);
                    }
                });

                // Executa o Update
                const { error } = await supabase.from('pacientes').update(payload).eq('id', editingId);
                if (error) throw error;

                // Salva o Log Detalhado
                const alteracoesStr = alteracoesReais.length > 0 
                    ? `Mudanças Cadastrais: ${alteracoesReais.join(' | ')}` 
                    : 'Salvo sem alterações reais';

                await logAction('Edição de Paciente', `Paciente: ${payload.nome} (CPF: ${payload.cpf}) -> ${alteracoesStr}`);
                toast.success('Paciente atualizado com sucesso!');
                returnedObj = { id: editingId, ...payload };
            } else {
                // Create
                payload.createdAt = new Date().toISOString();
                const { data, error } = await supabase.from('pacientes').insert([payload]).select();
                if (error) throw error;

                await logAction('Criação de Paciente', `Novo Paciente cadastrado: ${payload.nome} (CPF: ${payload.cpf}).`);
                toast.success('Paciente cadastrado com sucesso!');
                returnedObj = data[0];
            }

            if (onSuccess) onSuccess(returnedObj);
            setAbaAtiva('cadastro');
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Erro ao salvar paciente.');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = "w-full h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-800 placeholder:text-slate-400";
    const labelStyle = "text-[11px] font-bold text-slate-600 uppercase ml-1 mb-1.5 block tracking-wide";

    const handleVisualizarPdf = (apa) => {
        setApaParaImprimir(apa);

        setTimeout(() => {
            // 1. Guarda o título original do site
            const tituloOriginal = document.title;

            // 2. Monta o nome do arquivo limpo (substitui barras por traços na data para não dar erro no Windows)
            const nomePct = apa?.nome || 'Paciente';
            const dataDoc = (apa?.dataCriacao || new Date().toLocaleDateString('pt-BR')).replace(/\//g, '-');

            // 3. Altera o título da aba (o Chrome usará isso como nome do PDF)
            document.title = `APA - ${nomePct} - ${dataDoc}`;

            // 4. Abre a tela de impressão
            window.print();

            // 5. Restaura o título original e limpa a tela de impressão
            document.title = tituloOriginal;
            setApaParaImprimir(null);
        }, 500);
    };

    if (!isOpen) return null;

    return (
        <>
            {/* 1. O Fundo Escuro Isolado (Recebe o clique e fecha) */}
            <div className="fixed top-16 inset-x-0 bottom-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm z-[99998] animate-in fade-in" onClick={onClose} />
            
            {/* 2. Container centralizador invisível aos cliques (pointer-events-none) */}
            <div className="fixed top-16 inset-x-0 bottom-0 z-[99999] flex items-center justify-center p-4 font-sans pointer-events-none print:hidden">
                <div className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto">
                {/* Header Modal */}
                <div className="px-6 py-4 flex justify-between items-start bg-white border-b border-slate-200">
                    <div>
                        {editingId ? (
                            <>
                                <h2 className="text-xl font-black text-slate-900 drop-shadow-none uppercase tracking-wider flex items-center gap-2">
                                    {formData.nome || 'Carregando...'}
                                </h2>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[11px] font-bold tracking-widest uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">Prontuário Eletrônico</span>
                                    {formData.cpf && <span className="text-[11px] font-bold text-slate-500 uppercase">CPF: {formData.cpf}</span>}
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-black text-slate-900 drop-shadow-none uppercase tracking-wider">
                                    Novo Paciente
                                </h2>
                            </>
                        )}
                    </div>
                    <button onClick={() => { setAbaAtiva('cadastro'); onClose(); }} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-xl transition-colors shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Navegação de Abas */}
                {editingId && (
                    <div className="flex border-b border-slate-200 px-6 bg-white overflow-x-auto custom-scrollbar">
                        <button type="button" onClick={() => setAbaAtiva('cadastro')} className={`px-4 py-3 text-xs font-bold uppercase transition-all border-b-2 whitespace-nowrap ${abaAtiva === 'cadastro' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Dados Cadastrais</button>
                        <button type="button" onClick={() => setAbaAtiva('historico')} className={`px-4 py-3 text-xs font-bold uppercase transition-all border-b-2 whitespace-nowrap ${abaAtiva === 'historico' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Histórico Cirúrgico</button>
                        <button type="button" onClick={() => setAbaAtiva('aih')} className={`px-4 py-3 text-xs font-bold uppercase transition-all border-b-2 whitespace-nowrap ${abaAtiva === 'aih' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>AIHs</button>
                        <button type="button" onClick={() => setAbaAtiva('apa')} className={`px-4 py-3 text-xs font-bold uppercase transition-all border-b-2 whitespace-nowrap ${abaAtiva === 'apa' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>APAs</button>
                    </div>
                )}

                {/* ABA 1: DADOS CADASTRAIS */}
                {abaAtiva === 'cadastro' && (
                    <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Bloco 1: Dados Principais */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <User size={14} /> Dados Principais
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-2">
                                    <label className={labelStyle}>Nome Completo *</label>
                                    <input type="text" name="nome" value={formData.nome} onChange={handleChange} className={inputStyle} placeholder="Nome do paciente" required disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Data Nascimento</label>
                                    <input type="date" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange} className={inputStyle} disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Sexo *</label>
                                    <select name="sexo" value={formData.sexo} onChange={handleChange} className={`${inputStyle} uppercase`} required disabled={!podeEditar}>
                                        <option value="">Selecione...</option>
                                        <option value="Masculino">Masculino</option>
                                        <option value="Feminino">Feminino</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelStyle}>Peso (kg)</label>
                                    <input type="text" name="peso" value={formData.peso} onChange={handleChange} className={inputStyle} placeholder="Ex: 75.5" disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Altura (m)</label>
                                    <input type="text" name="altura" value={formData.altura} onChange={handleChange} className={inputStyle} placeholder="Ex: 1,78" disabled={!podeEditar} />
                                </div>
                            </div>
                        </div>

                        {/* Bloco 2: Dados Complementares */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <FileText size={14} /> Dados Complementares
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className={labelStyle}>CPF</label>
                                    <input type="text" name="cpf" value={formData.cpf} onChange={handleChange} className={inputStyle} placeholder="000.000.000-00" maxLength="14" disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>CNS</label>
                                    <input type="text" name="cns" value={formData.cns} onChange={handleChange} className={inputStyle} placeholder="000 0000 0000 0000" maxLength="18" disabled={!podeEditar} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelStyle}>Nome da Mãe</label>
                                    <input type="text" name="nomeMae" value={formData.nomeMae} onChange={handleChange} className={inputStyle} placeholder="Nome completo da mãe" disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Telefone</label>
                                    <input type="text" name="telefone" value={formData.telefone} onChange={handleChange} className={inputStyle} placeholder="(00) 00000-0000" maxLength="15" disabled={!podeEditar} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelStyle}>E-mail</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleChange} className={inputStyle} placeholder="paciente@email.com" disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>CEP</label>
                                    <input type="text" name="cep" value={formData.cep} onChange={handleChange} className={inputStyle} placeholder="00000-000" maxLength="9" disabled={!podeEditar} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelStyle}>Endereço (Rua)</label>
                                    <input type="text" name="rua" value={formData.rua} onChange={handleChange} className={inputStyle} placeholder="Ext: Rua das Flores" disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Número</label>
                                    <input type="text" name="numero" value={formData.numero} onChange={handleChange} className={inputStyle} placeholder="Ex: 123" disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Bairro</label>
                                    <input type="text" name="bairro" value={formData.bairro} onChange={handleChange} className={inputStyle} placeholder="Ex: Centro" disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Município</label>
                                    <input type="text" name="municipio" value={formData.municipio} onChange={handleChange} className={inputStyle} disabled={!podeEditar} />
                                </div>
                                <div>
                                    <label className={labelStyle}>UF</label>
                                    <input type="text" name="uf" value={formData.uf} onChange={handleChange} className={inputStyle} maxLength={2} disabled={!podeEditar} />
                                </div>
                            </div>
                        </div>

                        {/* Footer Moda/Ações */}
                        <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
                            <button type="button" onClick={onClose} className="h-10 px-6 text-slate-500 font-bold text-xs uppercase hover:bg-slate-100 rounded-lg transition-colors">
                                {podeEditar ? 'Cancelar' : 'Fechar'}
                            </button>
                            {podeEditar && (
                                <button type="submit" disabled={saving} className="h-10 px-8 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase rounded-lg shadow-lg shadow-slate-800/30 transition-all flex items-center gap-2 disabled:opacity-50">
                                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                    {customSaveText}
                                </button>
                            )}
                        </div>
                    </form>
                )}

                {/* ABA 2: HISTÓRICO CIRÚRGICO */}
                {abaAtiva === 'historico' && (
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-start text-center border-t border-white/40">
                        {loadingHistorico ? (
                            <div className="mt-24">
                                <Loader2 className="animate-spin text-blue-500 mx-auto mb-4" size={40} />
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Buscando histórico na base...</p>
                            </div>
                        ) : historicoCirurgias.length === 0 ? (
                            <div className="mt-24 flex flex-col items-center max-w-sm">
                                <div className="p-6 bg-white/60 rounded-full mb-6 text-slate-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-activity opacity-50"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                                </div>
                                <h3 className="text-base font-black uppercase tracking-wider text-slate-900 drop-shadow-none mb-2">Nenhum registro encontrado</h3>
                                <p className="text-xs font-semibold text-slate-500">Este paciente não possui cirurgias documentadas em seu histórico.</p>
                            </div>
                        ) : (
                            <div className="w-full text-left">
                                <h3 className="text-xs font-black tracking-widest uppercase text-slate-500 mb-5 flex items-center gap-2 px-1"><Clock size={16} /> Linha do Tempo Cirúrgica</h3>
                                <div className="space-y-4">
                                    {historicoCirurgias.map(cir => (
                                        <div
                                            key={cir.id}
                                            onClick={() => setCirurgiaEmEdicao(cir)}
                                            className="p-5 bg-white/60 border-2 border-white/40 rounded-2xl shadow-sm backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-5 cursor-pointer hover:shadow-md hover:border-blue-400 transition-all"
                                        >
                                            <div className="flex-1">
                                                <div className="text-sm font-black uppercase text-slate-900 drop-shadow-none line-clamp-1" title={cir.procedimento}>{cir.procedimento || 'PROCEDIMENTO NÃO INFORMADO'}</div>
                                                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase mt-2">
                                                    <span className="flex items-center gap-1"><User size={12} className="text-blue-400" /> Dr(a). {cir.cirurgiao || 'Não def.'}</span>
                                                    <span className="w-1 h-1 rounded-full bg-white/80"></span>
                                                    <span className="text-emerald-500">{cir.especialidade || 'Geral'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-white/40 pt-3 md:pt-0">
                                                <div className="text-left md:text-right">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Data Agendada</div>
                                                    <div className="text-xs font-bold text-slate-900 drop-shadow-none bg-white/60 px-3 py-1.5 rounded-lg border border-white/40 inline-block">{cir.dataAgendado ? cir.dataAgendado.split('-').reverse().join('/') : '---'}</div>
                                                </div>
                                                <div className="shrink-0">
                                                    <span className={`px-4 py-2 text-[11px] font-black uppercase border rounded-xl shadow-sm tracking-wide ${STATUS_COLORS[cir.status] || 'bg-white/70 border-white/60 text-slate-500'}`}>
                                                        {cir.status || 'Aguardando'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ABA 3: AIHs */}
                {abaAtiva === 'aih' && (
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-start text-center border-t border-white/40">
                        {loadingAihs ? (
                            <div className="mt-24">
                                <Loader2 className="animate-spin text-blue-500 mx-auto mb-4" size={40} />
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Buscando laudos...</p>
                            </div>
                        ) : historicoAihs.length === 0 ? (
                            <div className="mt-24 flex flex-col items-center max-w-sm">
                                <div className="p-6 bg-white/60 rounded-full mb-6 text-slate-500">
                                    <FileText size={48} className="opacity-50" />
                                </div>
                                <h3 className="text-base font-black uppercase tracking-wider text-slate-900 drop-shadow-none mb-2">Nenhum laudo encontrado</h3>
                                <p className="text-xs font-semibold text-slate-500">Nenhuma AIH emitida para este paciente.</p>
                            </div>
                        ) : (
                            <div className="w-full text-left">
                                <h3 className="text-xs font-black tracking-widest uppercase text-slate-500 mb-5 flex items-center gap-2 px-1"><FileText size={16} /> Histórico de Internações</h3>
                                <div className="space-y-4">
                                    {historicoAihs.map(aih => (
                                        <div key={aih.id} className="p-5 bg-white/60 border-2 border-white/40 rounded-2xl shadow-sm backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-5 hover:border-blue-100 hover:shadow-md transition-all">
                                            <div className="flex-1">
                                                <div className="text-sm font-black uppercase text-slate-900 drop-shadow-none line-clamp-1" title={aih.procedimento}>{aih.procedimento || 'PROCEDIMENTO NÃO INFORMADO'}</div>
                                                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase mt-2">
                                                    <span className="flex items-center gap-1"><User size={12} className="text-blue-400" /> Dr(a). {aih.medico || 'Não def.'}</span>
                                                    <span className="w-1 h-1 rounded-full bg-white/80"></span>
                                                    <span className="text-emerald-500 font-black">{aih.caraterInternacao || 'ELETIVA'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-white/40 pt-3 md:pt-0">
                                                <div className="text-left md:text-right">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Data Solicitação</div>
                                                    <div className="text-xs font-bold text-slate-900 drop-shadow-none bg-white/60 px-3 py-1.5 rounded-lg border border-white/40 inline-block">{aih.dataSolicitacao ? aih.dataSolicitacao.split('-').reverse().join('/') : '---'}</div>
                                                </div>
                                                {aih.codigoProcedimento && (
                                                    <div className="shrink-0 mb-2 md:mb-0 mr-2 border-r border-white/40 pr-4">
                                                        <span className="px-4 py-2 text-[11px] font-black uppercase border rounded-xl shadow-sm tracking-wide bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none border-blue-100 block md:inline-block">
                                                            COD: {aih.codigoProcedimento}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="shrink-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); gerarPdfAih(aih); }}
                                                        className="px-4 py-2 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none hover:bg-blue-600 hover:text-white rounded-xl shadow-sm transition-all border border-blue-100 flex items-center justify-center gap-2 text-[11px] font-black uppercase"
                                                        title="Imprimir Laudo AIH"
                                                    >
                                                        <Printer size={14} /> PDF
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ABA 4: APAs */}
                {abaAtiva === 'apa' && (
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-start text-center border-t border-white/40">
                        {loadingApas ? (
                            <div className="mt-24">
                                <Loader2 className="animate-spin text-blue-500 mx-auto mb-4" size={40} />
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Buscando avaliações pré-anestésicas...</p>
                            </div>
                        ) : historicoApas.length === 0 ? (
                            <div className="mt-24 flex flex-col items-center max-w-sm">
                                <div className="p-6 bg-white/60 rounded-full mb-6 text-slate-500">
                                    <Activity size={48} className="opacity-50" />
                                </div>
                                <h3 className="text-base font-black uppercase tracking-wider text-slate-900 drop-shadow-none mb-2">Nenhuma APA encontrada</h3>
                                <p className="text-xs font-semibold text-slate-500">Nenhuma avaliação pré-anestésica registrada para este paciente.</p>
                            </div>
                        ) : (
                            <div className="w-full text-left">
                                <h3 className="text-xs font-black tracking-widest uppercase text-slate-500 mb-5 flex items-center gap-2 px-1"><Activity size={16} /> Histórico de Avaliações Pré-Anestésicas</h3>
                                <div className="space-y-4">
                                    {historicoApas.map(apa => (
                                        <div key={apa.id} className="p-5 bg-white/60 border-2 border-white/40 rounded-2xl shadow-sm backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-5 hover:border-blue-100 hover:shadow-md transition-all">
                                            <div className="flex-1">
                                                <div className="text-sm font-black uppercase text-slate-900 drop-shadow-none line-clamp-1" title={apa.procedimento}>{apa.procedimento || 'PROCEDIMENTO NÃO INFORMADO'}</div>
                                                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase mt-2">
                                                    <span className="flex items-center gap-1"><User size={12} className="text-blue-400" /> Dr(a). {apa.profissional || 'Não def.'}</span>
                                                    <span className="w-1 h-1 rounded-full bg-white/80"></span>
                                                    <span className={`font-black ${apa.parecerFinal === 'Apto' ? 'text-emerald-500' : apa.parecerFinal === 'Restricao' ? 'text-amber-500' : 'text-rose-500'}`}>{apa.parecerFinal === 'Restricao' ? 'APTO COM RESTRIÇÕES' : apa.parecerFinal?.toUpperCase() || 'AVALIAÇÃO PENDENTE'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-white/40 pt-3 md:pt-0">
                                                <div className="text-left md:text-right">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Data Registro</div>
                                                    <div className="text-xs font-bold text-slate-900 drop-shadow-none bg-white/60 px-3 py-1.5 rounded-lg border border-white/40 inline-block">
                                                        {apa.dataRegistro ? new Date(apa.dataRegistro).toLocaleDateString('pt-BR') : '---'}
                                                    </div>
                                                </div>
                                                <div className="shrink-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleVisualizarPdf(apa);
                                                        }}
                                                        className="px-4 py-2 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none hover:bg-blue-600 hover:text-white rounded-xl shadow-sm transition-all border border-blue-100 flex items-center justify-center gap-2 text-[11px] font-black uppercase"
                                                        title="Visualizar / Imprimir APA"
                                                    >
                                                        <Printer size={14} /> APA
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>

            {/* Modal de Edição de Cirurgia Restrito */}
            {cirurgiaEmEdicao && (
                <EditSurgeryModal
                    geometry="fixed"
                    surgery={cirurgiaEmEdicao}
                    settings={settings}
                    pacientes={[]} // Can be passed if needed
                    onClose={() => setCirurgiaEmEdicao(null)}
                    onSave={async (id, data) => {
                        if (id) {
                            await supabase.from('surgeries').update(data).eq('id', id);
                            await logAction('ATUALIZAÇÃO DE CIRURGIA COMPLETA', `Cirurgia do paciente ${data.paciente || data.nomePaciente || 'Desconhecido'} atualizada via Prontuário.`);
                            toast.success("Informações cirúrgicas salvas!");
                        } else {
                            await supabase.from('surgeries').insert([{ ...data, createdAt: new Date().toISOString() }]);
                            await logAction('NOVO AGENDAMENTO', `Cirurgia agendada para ${data.paciente || data.nomePaciente || 'Desconhecido'} no dia ${data.dataAgendado ? data.dataAgendado.split('-').reverse().join('/') : 'Não def.'} via Prontuário.`);
                            toast.success("Cirurgia registrada!");
                        }
                        setCirurgiaEmEdicao(null);
                        buscarHistoricoCirurgico(formData.cpf); // reload na tela atual
                    }}
                />
            )}

            {/* Componente Invisível que só aparece no Print Nativo */}
            {apaParaImprimir && createPortal(
                <div className="print-master-container">
                    <ApaPrintTemplate data={apaParaImprimir} />
                </div>,
                document.body
            )}
        </>
    );
};
