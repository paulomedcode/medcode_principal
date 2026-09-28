import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Plus, ArrowLeft, Printer, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { gerarPdfAih } from '../utils/geradorPdfAih';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';

import toast from 'react-hot-toast';
import cidData from '../utils/cid10.json';
import { maskCPF, maskTelefone, maskCEP, maskCNS } from '../utils/masks';
import { usePermission } from '../contexts/PermissionContext';
import { SigtapAutocomplete } from '../components/SigtapAutocomplete';
import { useUnit } from '../contexts/UnitContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import UnitPrompt from '../components/UnitPrompt';

const Aih = ({ paciente }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const { unidadeAtual, unidadesObj } = useUnit();
    const { theme } = useWhiteLabel();
    const [pacientes, setPacientes] = useState([]);
    const [showPacientes, setShowPacientes] = useState(false);
    const [clinicasConfig, setClinicasConfig] = useState([]);
    const [caraterConfig, setCaraterConfig] = useState([]);
    const [medicosConfig, setMedicosConfig] = useState([]);
    const [showCid, setShowCid] = useState(false);

    // Gestão de visualização (Dashboard vs Formulário)
    const [modoVisao, setModoVisao] = useState('lista');
    const [listaAihs, setListaAihs] = useState([]);
    const [loadingAihs, setLoadingAihs] = useState(true);
    const [searchAih, setSearchAih] = useState('');

    const initialFormData = {
        pacienteId: '',
        estabelecimentoSolicitante: '',
        cnesSolicitante: '',
        estabelecimentoExecutante: '',
        cnesExecutante: '',
        pacienteNome: '',
        prontuario: '',
        cns: '',
        dataNascimento: '',
        sexo: '',
        nomeMae: '',
        telefone: '',
        endereco: '',
        codigoIbge: '',
        uf: 'SP',
        cep: '',
        municipio: '',
        resultadosProvas: '',
        diagnosticoInicial: '',
        cid10: '',
        cid10Secundario: '',
        sinaisSintomas: '',
        justificativa: '',
        procedimento: '',
        codigoProcedimento: '',
        clinica: 'Cirúrgica',
        caraterInternacao: '01 - ELETIVA',
        medico: '',
        crm: '',
        tipoDocumentoProfissional: 'CPF',
        numeroDocumento: '',
        dataSolicitacao: new Date().toISOString().split('T')[0]
    };

    const [formData, setFormData] = useState(initialFormData);

    const handleChange = (e) => {
        let { name, value } = e.target;

        if (name === 'cpf') value = maskCPF(value);
        if (name === 'telefone') value = maskTelefone(value);
        if (name === 'cep') value = maskCEP(value);
        if (name === 'cns') value = maskCNS(value);

        if (name === 'justificativa') value = value.replace(/\n/g, ' ');
        if (name === 'sinaisSintomas') value = value.replace(/\n/g, ' ');
        if (name === 'resultadosProvas') value = value.replace(/\n/g, ' ');

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Keep Solicitante/Executante dynamic based on current contexts
    useEffect(() => {
        const currentUnit = (unidadesObj || []).find(u => u.nome === unidadeAtual) || {};
        const estabSol = currentUnit.nome || '';
        const cnesSol = currentUnit.cnes || '';
        const estabExec = theme?.executanteNome || theme?.nomeInstituicao || '';
        const cnesExec = theme?.executanteCnes || '';

        setFormData(prev => ({
            ...prev,
            estabelecimentoSolicitante: estabSol,
            cnesSolicitante: cnesSol,
            estabelecimentoExecutante: estabExec,
            cnesExecutante: cnesExec
        }));
    }, [unidadeAtual, unidadesObj, theme]);

    // PREENCHIMENTO AUTOMÁTICO VIA PROP (Quando aberto do PEP)
    useEffect(() => {
        const fetchDetalhesPaciente = async () => {
            if (paciente) {
                let p = { ...paciente };
                const pid = paciente.paciente_id || paciente.id;
                if (pid) {
                    try {
                        const { data } = await supabase.from('pacientes').select('*').eq('id', pid).single();
                        if (data) p = { ...p, ...data };
                    } catch (e) {}
                }

                setFormData(prev => ({
                    ...prev,
                    pacienteId: p.paciente_id || p.id,
                    pacienteNome: p.paciente_nome || p.nome || '',
                    pacienteCpf: p.paciente_cpf || p.cpf || '',
                    cns: p.cns || '',
                    dataNascimento: p.dataNascimento || p.nascimento || p.paciente_nascimento || '',
                    sexo: p.sexo ? (p.sexo.toUpperCase().startsWith('M') ? 'M' : p.sexo.toUpperCase().startsWith('F') ? 'F' : '') : '',
                    nomeMae: p.nomeMae || '',
                    telefone: p.telefone || p.telefone1 || '',
                    endereco: `${p.rua || ''} ${p.numero || ''} ${p.bairro || ''}`.trim() || '',
                    municipio: p.municipio || '',
                    uf: p.uf || 'SP',
                    cep: p.cep || '',
                    prontuario: p.prontuario || ''
                }));
                setModoVisao('formulario');
            }
        };
        fetchDetalhesPaciente();
    }, [paciente]);

    useEffect(() => {
        const fetchProfissionalData = async () => {
            // 1. Garante que temos o e-mail (Tenta do contexto, se falhar tenta direto do Auth)
            let userEmail = currentUser?.email;
            if (!userEmail) {
                const { data: authSession } = await supabase.auth.getSession();
                userEmail = authSession?.session?.user?.email;
            }
            if (!userEmail) return;
            console.log("🔍 [AUTO-FILL] Buscando ficha para o e-mail:", userEmail);
            try {
                // 2. Busca usando ilike (case-insensitive) e maybeSingle para não quebrar
                const { data, error } = await supabase
                    .from('users')
                    .select('name, crm, cpf, rqe')
                    .ilike('email', userEmail)
                    .maybeSingle();
                console.log("📥 [AUTO-FILL] Resposta do Banco - Dados:", data, "| Erro:", error);
                if (data) {
                    // 3. Injeta na tela
                    setFormData(prev => ({
                        ...prev,
                        medico: data.name || '',
                        crm: data.crm || '',
                        numeroDocumento: data.cpf || '',
                        tipoDocumentoProfissional: data.cpf ? 'CPF' : 'CRM'
                    }));
                } else {
                    console.warn("⚠️ [AUTO-FILL] Nenhuma ficha encontrada na tabela 'users' para o e-mail:", userEmail);
                }
            } catch (err) {
                console.error("❌ [AUTO-FILL] Erro na execução da query:", err);
            }
        };
        fetchProfissionalData();
    }, [currentUser]);

    useEffect(() => {
        // 1. Busca Pacientes
        const fetchPacientes = async () => {
            try {
                const { data, error } = await supabase.from('pacientes').select('*').order('nome', { ascending: true });
                if (error) throw error;
                setPacientes(data || []);
            } catch (error) {
                console.error("Erro ao buscar pacientes:", error);
            }
        };
        fetchPacientes();

        // 3. Busca Configurações (Clínicas e Caráter)
        const fetchSettings = async () => {
            try {
                const { data, error } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
                if (data && data.data) {
                    const dados = data.data;
                    const clinicas = dados.clinicas || ['Cirúrgica', 'Ambulatorial'];
                    const carater = dados.caraterInternacao || ['01 - ELETIVA', '02 - URGÊNCIA', '03 - EMERGÊNCIA'];
                    const medicos = dados.cirurgioes || [];

                    setClinicasConfig(clinicas);
                    setCaraterConfig(carater);
                    setMedicosConfig(medicos);

                    // Garante que o initial state já assuma os primeiros valores configurados
                    setFormData(prev => ({
                        ...prev,
                        clinica: prev.clinica || clinicas[0],
                        caraterInternacao: prev.caraterInternacao || carater[0]
                    }));
                }
            } catch (error) {
                console.error("Erro ao buscar configurações gerais para AIH:", error);
            }
        };
        fetchSettings();
    }, []);

    const filteredPacientes = pacientes.filter(p => {
        if (!formData.pacienteNome) return false;
        const term = formData.pacienteNome.toLowerCase();
        return (p.nome?.toLowerCase() || '').includes(term) || (p.cpf || '').includes(term);
    }).slice(0, 10);

    const handleSelectPaciente = (p) => {
        setFormData(prev => ({
            ...prev,
            pacienteId: p.id,
            pacienteNome: p.nome,
            pacienteCpf: p.cpf || prev.pacienteCpf || '',
            cns: p.cns || prev.cns || '',
            dataNascimento: p.dataNascimento || prev.dataNascimento || '',
            sexo: p.sexo ? (p.sexo.toUpperCase().startsWith('M') ? 'M' : p.sexo.toUpperCase().startsWith('F') ? 'F' : '') : prev.sexo || '',
            nomeMae: p.nomeMae || prev.nomeMae || '',
            telefone: p.telefone || prev.telefone || '',
            endereco: `${p.rua || ''} ${p.numero || ''} ${p.bairro || ''}`.trim() || prev.endereco || '',
            municipio: p.municipio || prev.municipio || '',
            uf: p.uf || prev.uf || 'SP',
            cep: p.cep || prev.cep || '',
            prontuario: p.prontuario || prev.prontuario || '' // Mantém se houver
        }));
        setShowPacientes(false);
    };

    const filteredCid = cidData.filter(item => {
        if (!formData.diagnosticoInicial) return false;
        const term = formData.diagnosticoInicial.toLowerCase();
        return (
            (item.c.toLowerCase().includes(term)) ||
            (item.d.toLowerCase().includes(term))
        );
    }).slice(0, 50);

    const handleSelectCid = (item) => {
        setFormData(prev => ({
            ...prev,
            cid10: item.c,
            diagnosticoInicial: item.d
        }));
        setShowCid(false);
    };

    const handleChangeMedico = (e) => {
        const valor = e.target.value;
        const selectedMedico = medicosConfig.find(m => {
            if (typeof m === 'string') return m === valor;
            return m.nome === valor;
        });

        if (selectedMedico) {
            setFormData(prev => ({
                ...prev,
                medico: typeof selectedMedico === 'string' ? selectedMedico : selectedMedico.nome,
                crm: typeof selectedMedico === 'string' ? prev.crm : (selectedMedico.crm || prev.crm),
                numeroDocumento: typeof selectedMedico === 'string' ? prev.numeroDocumento : (selectedMedico.cpf || prev.numeroDocumento),
                tipoDocumentoProfissional: 'CRM'
            }));
        } else {
            setFormData(prev => ({ ...prev, medico: valor }));
        }
    };

    const loadAihs = async () => {
        if (!unidadeAtual) return;
        try {
            setLoadingAihs(true);
            const { data, error } = await supabase.from('aihs').select('*').eq('unidade', unidadeAtual).order('createdAt', { ascending: false });
            if (error) throw error;
            setListaAihs(data || []);
        } catch (error) {
            console.error('Erro ao buscar AIHs:', error);
        } finally {
            setLoadingAihs(false);
        }
    };

    useEffect(() => {
        if (modoVisao === 'lista') {
            loadAihs();
        }
    }, [modoVisao, unidadeAtual]);

    const filteredAihs = listaAihs.filter(aih => {
        const term = searchAih.toLowerCase();
        return (
            (aih.pacienteNome && aih.pacienteNome.toLowerCase().includes(term)) ||
            (aih.prontuario && aih.prontuario.toLowerCase().includes(term)) ||
            (aih.cns && aih.cns.toLowerCase().includes(term))
        );
    });

    const exportarParaPDF = async (data) => {
        const currentUnitObj = (unidadesObj || []).find(u => u.nome === unidadeAtual) || null;
        const isNew = !data.id;

        const payload = {
            ...data,
            estabelecimentoSolicitante: data.estabelecimentoSolicitante || (isNew ? (currentUnitObj?.nome || '') : ''),
            cnesSolicitante: data.cnesSolicitante || (isNew ? (currentUnitObj?.cnes || '') : ''),
            estabelecimentoExecutante: data.estabelecimentoExecutante || (isNew ? (theme?.executanteNome || theme?.nomeInstituicao || '') : ''),
            cnesExecutante: data.cnesExecutante || (isNew ? (theme?.executanteCnes || '') : ''),
            orgaoEmissor: theme?.orgaoEmissor || ''
        };

        await gerarPdfAih(payload);
    };

    const handleSalvarNovaAih = async () => {
        if (!unidadeAtual) {
            toast.error('Ação Bloqueada: Selecione o Local de Atendimento antes de salvar.');
            return;
        }
        if (!formData.pacienteId) {
            toast.error('Por favor, selecione um paciente cadastrado antes de gerar a AIH.');
            return;
        }

        const currentUnitObj = (unidadesObj || []).find(u => u.nome === unidadeAtual) || null;

        try {
            const dadosAIH = {
                ...formData,
                estabelecimentoSolicitante: currentUnitObj?.nome || '',
                cnesSolicitante: currentUnitObj?.cnes || '',
                estabelecimentoExecutante: theme?.executanteNome || theme?.nomeInstituicao || '',
                cnesExecutante: theme?.executanteCnes || '',
                orgaoEmissor: theme?.orgaoEmissor || '',
                unidade: unidadeAtual,
                status: 'pendente',
                numeroAutorizacao: '',
                motivoDevolucao: '',
                autorizadoPor: '',
                dataAutorizacao: null,
                createdAt: new Date().toISOString(),
                dataEmissao: new Date().toISOString()
            };
            const { error, data: aihSalva } = await supabase.from('aihs').insert([dadosAIH]).select();
            if (error) throw error;

            // LOGICA INTEGRAÇÃO FILA CIRURGICA
            // Se for uma AIH normal recém-criada: status: 'Aguardando Autorização'.
            // Se for uma AIH de via rápida (Oncologia/Urgência): status: 'Aguardando Agendamento'.
            let initialSurgeryStatus = 'Aguardando Autorização';
            const caraterLowerCase = String(formData.caraterInternacao || '').toLowerCase();
            const procedimentoLowerCase = String(formData.procedimento || '').toLowerCase();
            const clinicaLowerCase = String(formData.clinica || '').toLowerCase();

            const isViaRapida = caraterLowerCase.includes('urgência') || caraterLowerCase.includes('urgencia') || caraterLowerCase.includes('emergência') || caraterLowerCase.includes('emergencia') || caraterLowerCase.includes('oncologia') || clinicaLowerCase.includes('oncologia');

            if (isViaRapida) {
                initialSurgeryStatus = 'Aguardando Agendamento';
            }

            const payloadCirurgia = {
                nomePaciente: formData.pacienteNome || 'Desconhecido',
                cpf: formData.pacienteCpf || '',
                nascimento: formData.dataNascimento || '',
                telefone1: formData.telefone || '',
                municipio: formData.municipio || '',
                procedimento: formData.procedimento || '',
                cirurgiao: formData.medico || '',
                especialidade: formData.clinica || '',
                status: isViaRapida ? 'AGENDADO' : 'AGUARDANDO',
                prioridade: isViaRapida ? 'Urgência' : 'Eletiva',
                unidade: unidadeAtual,
                createdAt: new Date().toISOString(),
                aih: true, // Avisa que tem AIH
                autorizada: false, // REMOVIDO isViaRapida. Nasce SEMPRE false (cinza).
                dataAtendimento: formData.dataSolicitacao || new Date().toISOString().split('T')[0] // Preenche a data automaticamente
            };

            const { error: errorSurgeries } = await supabase.from('surgeries').insert([payloadCirurgia]);
            if (errorSurgeries) {
                console.error("ERRO COMPLETO SURGERIES:", errorSurgeries);
                toast.error(`Falha ao enviar para fila: ${errorSurgeries.message || errorSurgeries.details}`);
                return; // Interrompe para não dar a mensagem de sucesso falso
            }

            await logAction('CRIAÇÃO DE AIH', `Solicitação de AIH gerada para ${formData.pacienteNome || 'Desconhecido'}.`);
            toast.success('AIH salva com sucesso no histórico do paciente!');

            await exportarParaPDF(dadosAIH);

            setFormData(prev => ({
                ...initialFormData,
                clinica: clinicasConfig[0] || 'Cirúrgica',
                caraterInternacao: caraterConfig[0] || '01 - ELETIVA',
                // PRESERVA OS DADOS DO MÉDICO (Auto-fill)
                medico: prev.medico,
                crm: prev.crm,
                numeroDocumento: prev.numeroDocumento,
                tipoDocumentoProfissional: prev.tipoDocumentoProfissional
            }));
            setModoVisao('lista');
            loadAihs();
        } catch (error) {
            console.error('Erro ao salvar AIH:', error);
            toast.error('Erro ao processar a AIH. Verifique a conexão e tente novamente.');
        }
    };

    const handleExcluirAih = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta AIH? Esta ação não pode ser desfeita.')) {
            try {
                const aih = listaAihs.find(a => a.id === id);
                const { error } = await supabase.from('aihs').delete().eq('id', id);
                if (error) throw error;
                await logAction('EXCLUSÃO DE AIH', `AIH do paciente ${aih?.pacienteNome || 'Desconhecido'} foi excluída.`);
                toast.success('AIH excluída com sucesso!');
                loadAihs();
            } catch (error) {
                console.error('Erro ao excluir AIH:', error);
                toast.error('Erro ao excluir a AIH.');
            }
        }
    };

    // Estilos reutilizáveis (Compact Mode)
    const glassCard = "bg-white/60 backdrop-blur-md border border-white/400 shadow-sm p-4 rounded-xl mb-4 relative";
    const labelStyle = "block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1";
    const inputStyle = "w-full bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-900 drop-shadow-none text-xs font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-400 transition-all";
    const readOnlyStyle = "w-full bg-slate-100/50 border border-white/60 text-slate-500 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center h-[34px] cursor-not-allowed";

    const currentUnitObj = (unidadesObj || []).find(u => u.nome === unidadeAtual) || null;

    if (!unidadeAtual) {
        return <UnitPrompt />;
    }

    return (
        <div className="py-4 px-2 sm:px-4 font-sans animate-in fade-in duration-700 w-full min-h-full">
            <div className="max-w-7xl mx-auto space-y-3">

                {/* Cabeçalho Global */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3 border-b border-white/60 pb-3">
                    <div className="flex items-center gap-3">
                        {modoVisao === 'lista' && (
                            <>
                                <button 
                                    onClick={() => navigate('/pep-hub')}
                                    className="p-2 md:p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/20 rounded-xl transition-colors shrink-0"
                                    title="Voltar para a Central"
                                >
                                    <ArrowLeft size={22} strokeWidth={2.5} />
                                </button>
                                <div className="w-px h-8 bg-white/80 shrink-0 hidden md:block"></div>
                            </>
                        )}
                        <div className="p-2 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-xl text-blue-600 shadow-sm flex items-center justify-center">
                            <FileText size={22} strokeWidth={2} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 drop-shadow-none uppercase tracking-widest">
                                {modoVisao === 'lista' ? 'Central de AIHs' : 'Emissão de AIH'}
                            </h1>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                {modoVisao === 'lista' ? 'Monitoramento e Histórico de Laudos Gerados' : 'Geração automática do Laudo para Solicitação de Internação'}
                            </p>
                        </div>
                    </div>
                    {modoVisao === 'lista' && hasPermission('Criar/Editar AIH') && (
                        <button
                            onClick={() => {
                                setFormData(prev => ({
                                    ...initialFormData,
                                    clinica: clinicasConfig[0] || 'Cirúrgica',
                                    caraterInternacao: caraterConfig[0] || '01 - ELETIVA',
                                    // PRESERVA OS DADOS DO MÉDICO (Auto-fill)
                                    medico: prev.medico,
                                    crm: prev.crm,
                                    numeroDocumento: prev.numeroDocumento,
                                    tipoDocumentoProfissional: prev.tipoDocumentoProfissional
                                }));
                                setModoVisao('formulario');
                            }}
                            className="bg-white/80 hover:bg-white text-blue-600 border border-slate-200 px-5 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wide shadow-sm transition-all flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Nova AIH
                        </button>
                    )}
                </div>

                {modoVisao === 'lista' ? (
                    /* ====== MODO LISTA / DASHBOARD ====== */
                    <div className="space-y-6">
                        <div className="bg-white/60 backdrop-blur-lg p-4 rounded-xl shadow-sm border border-white/400">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="Pesquisar por Paciente, Prontuário ou CNS..."
                                    value={searchAih}
                                    onChange={(e) => setSearchAih(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold text-xs placeholder:text-slate-500"
                                />
                            </div>
                        </div>

                        <div className="bg-white/60 backdrop-blur-lg rounded-xl shadow-sm border border-white/400 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-white/60">
                                        <tr className="text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                            <th className="py-1.5 px-3">Emissão / Solicitação</th>
                                            <th className="py-1.5 px-3">Paciente</th>
                                            <th className="py-1.5 px-3">Procedimento Solicitado</th>
                                            <th className="py-1.5 px-3">Equipe Médica</th>
                                            <th className="py-1.5 px-3 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-transparent">
                                        {loadingAihs ? (
                                            <tr><td colSpan="5" className="py-20 text-center"><Loader2 className="animate-spin text-blue-500 mx-auto" size={32} /></td></tr>
                                        ) : filteredAihs.length > 0 ? (
                                            filteredAihs.map(aih => (
                                                <tr key={aih.id} className="hover:bg-white/60 transition-colors group">
                                                    <td className="px-3 py-1.5">
                                                        <div className="text-xs font-black text-slate-700">{aih.dataEmissao ? new Date(aih.dataEmissao).toLocaleDateString('pt-BR') : '---'}</div>
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Sol: {aih.dataSolicitacao ? aih.dataSolicitacao.split('-').reverse().join('/') : '---'}</div>
                                                    </td>
                                                    <td className="px-3 py-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <div className="font-bold text-slate-900 drop-shadow-none text-xs uppercase">{aih.pacienteNome || 'NÃO INFORMADO'}</div>
                                                            {/* Etiqueta de Status Inteligente */}
                                                            {aih.status === 'autorizada' ? (
                                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase tracking-wider">Autorizada</span>
                                                            ) : aih.status === 'negada' || aih.status === 'devolvida' ? (
                                                                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded uppercase tracking-wider">Devolvida</span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded uppercase tracking-wider flex items-center gap-1 shadow-sm border border-amber-200">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500/20 animate-pulse"></span> Pendente
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">CNS: {aih.cns || '---'}</div>
                                                    </td>
                                                    <td className="px-3 py-1.5">
                                                        <div className="text-[11px] font-bold text-slate-700 uppercase line-clamp-1" title={aih.procedimento}>{aih.procedimento || '---'}</div>
                                                        {aih.codigoProcedimento && <div className="text-[10px] font-bold text-blue-500 bg-blue-500/20 px-1.5 py-0.5 rounded inline-block mt-0.5">CÓD: {aih.codigoProcedimento}</div>}
                                                    </td>
                                                    <td className="px-3 py-1.5">
                                                        <div className="text-[11px] font-bold text-slate-700 uppercase">Dr(a). {aih.medico || '---'}</div>
                                                        <div className="text-[10px] font-black text-emerald-600 mt-0.5">{aih.caraterInternacao || '---'}</div>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {hasPermission('Imprimir Documentos') && (
                                                                <button
                                                                    onClick={() => exportarParaPDF(aih)}
                                                                    className="p-1.5 bg-blue-50 text-blue-600 border border-blue-100 shadow-sm hover:bg-blue-600 hover:text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                    title="Re-imprimir Laudo"
                                                                >
                                                                    <Printer size={16} />
                                                                </button>
                                                            )}
                                                            {hasPermission('Excluir AIH/APA') && (
                                                                <button
                                                                    onClick={() => handleExcluirAih(aih.id)}
                                                                    className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all shadow-sm opacity-0 group-hover:opacity-100"
                                                                    title="Excluir Laudo"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="5" className="py-20 text-center text-slate-500 font-bold uppercase text-sm">Nenhuma AIH encontrada no sistema central.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ====== MODO FORMULÁRIO ====== */
                    <div className="p-6 bg-white/60 backdrop-blur-lg border border-white/400 shadow-sm rounded-[2rem] min-h-[80vh] relative">
                        <button onClick={() => setModoVisao('lista')} className="absolute top-6 right-6 text-[11px] font-black uppercase text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors bg-white/60 px-3 py-1.5 rounded-lg shadow-sm">
                            <ArrowLeft size={14} /> Voltar à Central
                        </button>

                        {/* Bloco 1: Identificação do Estabelecimento */}
                        <div className={`${glassCard} z-[40]`}>
                            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/400 pb-1.5">1. Identificação do Estabelecimento</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="lg:col-span-3">
                                    <label className={labelStyle}>Estabelecimento Solicitante</label>
                                    <div className={readOnlyStyle}>
                                        {formData.id ? formData.estabelecimentoSolicitante : (currentUnitObj?.nome || 'Unidade não selecionada')}
                                    </div>
                                </div>
                                <div>
                                    <label className={labelStyle}>CNES Solicitante</label>
                                    <div className={readOnlyStyle}>
                                        {formData.id ? formData.cnesSolicitante : (currentUnitObj?.cnes || '---')}
                                    </div>
                                </div>
                                <div className="lg:col-span-3">
                                    <label className={labelStyle}>Estabelecimento Executante</label>
                                    <div className={readOnlyStyle}>
                                        {formData.id ? formData.estabelecimentoExecutante : (theme?.executanteNome || 'Não configurado')}
                                    </div>
                                </div>
                                <div>
                                    <label className={labelStyle}>CNES Executante</label>
                                    <div className={readOnlyStyle}>
                                        {formData.id ? formData.cnesExecutante : (theme?.executanteCnes || '---')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bloco 2: Identificação do Paciente */}
                        <div className={`${glassCard} z-[30]`}>
                            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/400 pb-1.5">2. Identificação do Paciente</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="lg:col-span-3 relative">
                                    <label className={labelStyle}>Nome do Paciente</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                        <input
                                            type="text"
                                            name="pacienteNome"
                                            value={formData.pacienteNome}
                                            onChange={(e) => { handleChange(e); setShowPacientes(true); }}
                                            onFocus={() => setShowPacientes(true)}
                                            className={`${inputStyle} pl-9 uppercase`}
                                            placeholder="Buscar por Nome ou CPF..."
                                            autoComplete="off"
                                        />
                                    </div>
                                    {showPacientes && formData.pacienteNome && (
                                        <div className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-xl border border-white/60 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                                            {filteredPacientes.length > 0 ? filteredPacientes.map(p => (
                                                <div key={p.id} onClick={() => handleSelectPaciente(p)} className="p-3 hover:bg-white/60 cursor-pointer border-b border-white/40 last:border-0 transition-colors">
                                                    <div className="text-xs font-bold uppercase text-slate-900 drop-shadow-none">{p.nome}</div>
                                                    <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">CPF: {p.cpf || '---'} | CNS: {p.cns || '---'}</div>
                                                </div>
                                            )) : (
                                                <div className="p-3 bg-white/60 flex flex-col items-center text-center gap-2 border-t border-white/40">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase">Nenhum paciente encontrado.</span>
                                                    <button type="button" onClick={() => navigate('/pacientes')} className="text-[11px] font-black text-blue-600 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg uppercase transition-colors flex items-center gap-1">
                                                        Cadastre este paciente na aba Pacientes primeiro.
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className={labelStyle}>Prontuário</label>
                                    <input
                                        type="text"
                                        name="prontuario"
                                        value={formData.prontuario}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    />
                                </div>
                                <div className="lg:col-span-2">
                                    <label className={labelStyle}>Cartão Nacional de Saúde (CNS)</label>
                                    <input
                                        type="text"
                                        name="cns"
                                        value={formData.cns}
                                        onChange={handleChange}
                                        className={inputStyle}
                                        placeholder="Ex: 123 4567 8901 2345"
                                        maxLength="18"
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>Data de Nascimento</label>
                                    <input
                                        type="date"
                                        name="dataNascimento"
                                        value={formData.dataNascimento}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>Sexo</label>
                                    <select
                                        name="sexo"
                                        value={formData.sexo}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="M">Masculino</option>
                                        <option value="F">Feminino</option>
                                    </select>
                                </div>
                                <div className="lg:col-span-3">
                                    <label className={labelStyle}>Nome da Mãe</label>
                                    <input
                                        type="text"
                                        name="nomeMae"
                                        value={formData.nomeMae}
                                        onChange={handleChange}
                                        className={inputStyle}
                                        placeholder="Nome completo da mãe"
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>Telefone</label>
                                    <input
                                        type="text"
                                        name="telefone"
                                        value={formData.telefone}
                                        onChange={handleChange}
                                        className={inputStyle}
                                        placeholder="(XX) XXXXX-XXXX"
                                        maxLength="15"
                                    />
                                </div>
                                <div className="lg:col-span-4">
                                    <label className={labelStyle}>Endereço Completo</label>
                                    <input
                                        type="text"
                                        name="endereco"
                                        value={formData.endereco}
                                        onChange={handleChange}
                                        className={inputStyle}
                                        placeholder="Logradouro, Número, Bairro"
                                    />
                                </div>
                                <div className="lg:col-span-2">
                                    <label className={labelStyle}>Município</label>
                                    <input
                                        type="text"
                                        name="municipio"
                                        value={formData.municipio}
                                        onChange={handleChange}
                                        className={inputStyle}
                                        placeholder="Cidade de residência"
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>Cód. IBGE</label>
                                    <input
                                        type="text"
                                        name="codigoIbge"
                                        value={formData.codigoIbge}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>UF</label>
                                    <input
                                        type="text"
                                        name="uf"
                                        value={formData.uf}
                                        onChange={handleChange}
                                        className={inputStyle}
                                        maxLength="2"
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>CEP</label>
                                    <input
                                        type="text"
                                        name="cep"
                                        value={formData.cep}
                                        onChange={handleChange}
                                        className={inputStyle}
                                        maxLength="9"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Bloco 3: Dados Clínicos */}
                        <div className={`${glassCard} z-[20]`}>
                            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/400 pb-1.5">3. Dados Clínicos e Justificativa</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="lg:col-span-4">
                                    <label className={labelStyle}>Justificativa da Internação</label>
                                    <textarea
                                        name="justificativa"
                                        value={formData.justificativa}
                                        onChange={handleChange}
                                        rows="2"
                                        maxLength={400}
                                        className={`${inputStyle} resize-none`}
                                        placeholder="Fundamentação médica para a internação..."
                                    />
                                </div>
                                <div className="lg:col-span-4">
                                    <label className={labelStyle}>Principais Sinais e Sintomas</label>
                                    <textarea
                                        name="sinaisSintomas"
                                        value={formData.sinaisSintomas}
                                        onChange={handleChange}
                                        rows="2"
                                        maxLength={1100}
                                        className={`${inputStyle} resize-none`}
                                        placeholder="Descreva o quadro clínico..."
                                    />
                                </div>
                                <div className="lg:col-span-4">
                                    <label className={labelStyle}>Resultados de Provas Diagnósticas</label>
                                    <textarea
                                        name="resultadosProvas"
                                        value={formData.resultadosProvas}
                                        onChange={handleChange}
                                        rows="2"
                                        maxLength={400}
                                        className={`${inputStyle} resize-none`}
                                        placeholder="Resultados relevantes..."
                                    />
                                </div>
                                <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-4 gap-3 relative z-[60]">
                                    <div className="md:col-span-3 relative">
                                        <label className={labelStyle}>Diagnóstico Inicial</label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                            <input
                                                type="text"
                                                name="diagnosticoInicial"
                                                value={formData.diagnosticoInicial}
                                                onChange={(e) => { handleChange(e); setShowCid(true); }}
                                                onFocus={() => setShowCid(true)}
                                                className={`${inputStyle} pl-9 uppercase`}
                                                placeholder="Buscar por Nome do Diagnóstico ou CID..."
                                                autoComplete="off"
                                            />
                                        </div>
                                        {showCid && formData.diagnosticoInicial && (
                                            <div className="absolute z-[100] w-full mt-1 bg-white/60 backdrop-blur-xl border border-white/60 rounded-xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.3)] max-h-60 overflow-y-auto custom-scrollbar">
                                                {filteredCid.length > 0 ? filteredCid.map((item, idx) => (
                                                    <div key={idx} onClick={() => handleSelectCid(item)} className="p-3 hover:bg-white/60 cursor-pointer border-b border-white/40 last:border-0 transition-colors">
                                                        <div className="text-xs font-bold uppercase text-slate-900 drop-shadow-none">{item.d}</div>
                                                        <div className="text-[11px] font-semibold text-blue-500 uppercase mt-0.5">CID: {item.c}</div>
                                                    </div>
                                                )) : (
                                                    <div className="p-3 bg-white/60 flex flex-col items-center text-center gap-2 border-t border-white/40">
                                                        <span className="text-[11px] font-bold text-slate-500 uppercase">Nenhum diagnóstico encontrado na base CID-10.</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className={labelStyle}>CID-10 Principal</label>
                                        <input
                                            type="text"
                                            name="cid10"
                                            value={formData.cid10}
                                            readOnly
                                            className={`${inputStyle} bg-white/70 border-white/60 text-slate-600 font-bold cursor-not-allowed`}
                                            placeholder="Automático"
                                        />
                                    </div>
                                </div>
                                <div className="lg:col-span-4">
                                    <label className={labelStyle}>CID-10 Secundário</label>
                                    <input
                                        type="text"
                                        name="cid10Secundario"
                                        value={formData.cid10Secundario}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    />
                                </div>
                                <div className="lg:col-span-3 relative z-[50]">
                                    <label className={labelStyle}>Procedimento Solicitado (SIGTAP)</label>
                                    <SigtapAutocomplete
                                        value={formData.procedimento}
                                        onSelect={(selecionado) => {
                                            setFormData(prev => ({
                                                ...prev,
                                                procedimento: selecionado.nome,
                                                codigoProcedimento: selecionado.codigo
                                            }));
                                        }}
                                        className={`${inputStyle} pl-9 uppercase`}
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>Cód. Procedimento</label>
                                    <input
                                        type="text"
                                        name="codigoProcedimento"
                                        value={formData.codigoProcedimento}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    />
                                </div>
                                <div className="lg:col-span-2">
                                    <label className={labelStyle}>Clínica</label>
                                    <select
                                        name="clinica"
                                        value={formData.clinica}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    >
                                        <option value="">Selecione a Clínica...</option>
                                        {clinicasConfig.map((cli, idx) => (
                                            <option key={idx} value={cli}>{cli}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="lg:col-span-2">
                                    <label className={labelStyle}>Caráter da Internação</label>
                                    <select
                                        name="caraterInternacao"
                                        value={formData.caraterInternacao}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    >
                                        <option value="">Selecione o Caráter...</option>
                                        {caraterConfig.map((car, idx) => (
                                            <option key={idx} value={car}>{car}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Bloco 4: Profissional Solicitante */}
                        <div className={`${glassCard} z-[10]`}>
                            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/400 pb-1.5">4. Profissional Solicitante</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 relative z-[40]">
                                <div className="lg:col-span-2">
                                    <label className={labelStyle}>Profissional Solicitante (Selecione ou Digite)</label>
                                    <input
                                        type="text"
                                        name="medico"
                                        value={formData.medico}
                                        disabled={currentUser?.role?.toLowerCase() === 'médico' || currentUser?.role?.toLowerCase() === 'médico autorizador' || currentUser?.role?.toLowerCase() === 'desenvolvedor'}
                                        onChange={(e) => {
                                            handleChange(e);
                                            handleChangeMedico(e);
                                        }}
                                        list="listaMedicos"
                                        className={inputStyle}
                                        placeholder="Dr(a). ..."
                                        autoComplete="off"
                                    />
                                    <datalist id="listaMedicos">
                                        {medicosConfig.map((m, idx) => {
                                            const isString = typeof m === 'string';
                                            const value = isString ? m : m.nome;
                                            const label = isString ? m : `${m.nome} (CRM: ${m.crm || '---'})`;
                                            return <option key={idx} value={value} label={label} />;
                                        })}
                                    </datalist>
                                </div>
                                <div>
                                    <label className={labelStyle}>Data da Solicitação</label>
                                    <input
                                        type="date"
                                        name="dataSolicitacao"
                                        value={formData.dataSolicitacao}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    />
                                </div>
                                <div>
                                    {/* Espaçador */}
                                </div>
                                <div className="lg:col-span-1">
                                    <label className={labelStyle}>Tipo de Documento</label>
                                    <select
                                        name="tipoDocumentoProfissional"
                                        value={formData.tipoDocumentoProfissional}
                                        disabled={currentUser?.role?.toLowerCase() === 'médico' || currentUser?.role?.toLowerCase() === 'médico autorizador' || currentUser?.role?.toLowerCase() === 'desenvolvedor'}
                                        onChange={handleChange}
                                        className={inputStyle}
                                    >
                                        <option value="CRM">CRM</option>
                                        <option value="CNS">CNS</option>
                                        <option value="CPF">CPF</option>
                                        <option value="CRO">CRO</option>
                                    </select>
                                </div>
                                <div className="lg:col-span-1">
                                    <label className={labelStyle}>Nº Documento / CRM</label>
                                    <input
                                        type="text"
                                        name="crm"
                                        value={formData.crm}
                                        readOnly
                                        className={`${inputStyle} bg-white/70 border-white/60 text-slate-600 font-bold cursor-not-allowed uppercase`}
                                        placeholder="Automático"
                                    />
                                </div>
                                <div className="lg:col-span-2">
                                    <label className={labelStyle}>Nº CPF / CNS</label>
                                    <input
                                        type="text"
                                        name="numeroDocumento"
                                        value={formData.numeroDocumento || ''}
                                        readOnly
                                        className={`${inputStyle} bg-white/70 border-white/60 text-slate-600 font-bold cursor-not-allowed`}
                                        placeholder="Automático"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Botão de Ação */}
                        <div className="flex justify-end mt-8">
                            <button
                                onClick={handleSalvarNovaAih}
                                className="w-full md:w-auto px-10 py-3.5 bg-slate-800 hover:bg-slate-900 text-white text-sm uppercase tracking-wide font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                <FileText size={18} />
                                Gerar e Salvar Laudo AIH (PDF)
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default Aih;
