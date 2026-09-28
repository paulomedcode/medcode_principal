import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, CheckCircle, XCircle, Clock, Eye, FileText, Filter, Calendar, History, User, Activity, ChevronLeft, ChevronRight, FilterX, Wand2 } from 'lucide-react';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { gerarPdfAih } from '../utils/geradorPdfAih';
import UnitPrompt from '../components/UnitPrompt';

export default function Autorizacoes() {
    const { currentUser } = useAuth();
    const { unidadeAtual } = useUnit();
    const { theme } = useWhiteLabel();
    const [listaAihs, setListaAihs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalAberto, setModalAberto] = useState(false);
    const [aihSelecionada, setAihSelecionada] = useState(null);
    const [tipoAcao, setTipoAcao] = useState(''); // 'aprovar' ou 'devolver'
    const [inputRegulacao, setInputRegulacao] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos'); // Padrão agora é todos
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [cirurgiaoFilter, setCirurgiaoFilter] = useState('todos');
    const [especialidadeFilter, setEspecialidadeFilter] = useState('todos');
    const [procedimentoFilter, setProcedimentoFilter] = useState('todos');

    // Listas dinâmicas para os filtros
    const cirurgioes = [...new Set(listaAihs.map(a => a.medicoSolicitante || a.cirurgiao).filter(Boolean))].sort();
    const especialidades = [...new Set(listaAihs.map(a => a.especialidade).filter(Boolean))].sort();
    const procedimentos = [...new Set(listaAihs.map(a => a.procedimento).filter(Boolean))].sort();

    const navegarMes = (direcao) => {
        // direcao: -1 (anterior), 0 (atual), 1 (proximo)
        let dataReferencia = new Date();

        if (direcao !== 0 && dataInicio) {
            // Se já houver uma data e não for o botão "Mês Atual", usa a data atual do filtro
            dataReferencia = new Date(dataInicio + 'T00:00:00');
        }

        if (direcao === -1) {
            dataReferencia.setMonth(dataReferencia.getMonth() - 1);
        } else if (direcao === 1) {
            dataReferencia.setMonth(dataReferencia.getMonth() + 1);
        } else {
            dataReferencia = new Date(); // Volta para hoje
        }

        const y = dataReferencia.getFullYear();
        const m = dataReferencia.getMonth();

        const primeiroDia = new Date(y, m, 1);
        const ultimoDia = new Date(y, m + 1, 0);

        const formatarData = (d) => {
            const ano = d.getFullYear();
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const dia = String(d.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        };

        setDataInicio(formatarData(primeiroDia));
        setDataFim(formatarData(ultimoDia));
    };

    const limparFiltros = () => {
        setSearchTerm('');
        setStatusFilter('todos');
        setDataInicio('');
        setDataFim('');
        setCirurgiaoFilter('todos');
        setEspecialidadeFilter('todos');
        setProcedimentoFilter('todos');
    };

    const loadAihs = async () => {
        if (!unidadeAtual) {
            setListaAihs([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase.from('aihs').select('*').eq('unidade', unidadeAtual).order('createdAt', { ascending: false });
            if (error) throw error;
            setListaAihs(data || []);
        } catch (error) {
            console.error('Erro ao listar AIHs:', error);
            toast.error('Erro ao carregar lista de AIHs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAihs();
    }, [unidadeAtual]);

    const displayAihs = listaAihs.filter(aih => {
        const matchSearch = (aih.pacienteNome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (aih.cns || '').includes(searchTerm);
        const matchStatus = statusFilter === 'todos' || aih.status === statusFilter;
        const matchCirurgiao = cirurgiaoFilter === 'todos' || (aih.medicoSolicitante === cirurgiaoFilter || aih.cirurgiao === cirurgiaoFilter);
        const matchEspecialidade = especialidadeFilter === 'todos' || aih.especialidade === especialidadeFilter;
        const matchProcedimento = procedimentoFilter === 'todos' || aih.procedimento === procedimentoFilter;

        let matchData = true;
        if (dataInicio && dataFim && aih.dataEmissao) {
            const dataAih = aih.dataEmissao.split('T')[0];
            matchData = dataAih >= dataInicio && dataAih <= dataFim;
        }

        return matchSearch && matchStatus && matchCirurgiao && matchEspecialidade && matchProcedimento && matchData;
    });

    // Extrair histórico do paciente selecionado
    const historicoPaciente = aihSelecionada ? listaAihs.filter(a => a.cns === aihSelecionada.cns && a.id !== aihSelecionada.id) : [];

    const handleAbrirModal = (aih, tipo) => {
        setAihSelecionada(aih);
        setTipoAcao(tipo);
        setInputRegulacao('');
        setModalAberto(true);
    };

    const handleConfirmarAcao = async () => {
        if (!inputRegulacao.trim()) {
            toast.error(tipoAcao === 'aprovar' ? "Informe o número de autorização." : "Informe o motivo da devolução.");
            return;
        }

        try {
            if (tipoAcao === 'aprovar') {
                // BUSCA A CONFIGURAÇÃO DIRETO DO BANCO (Ignora o cache do Contexto)
                const { data: configData } = await supabase
                    .from('settings')
                    .select('data')
                    .eq('id', 'general')
                    .single();
                const codigoOrgao = configData?.data?.orgaoEmissor || '';

                const payloadAtualizacao = {
                    status: 'autorizada',
                    numeroAutorizacao: inputRegulacao,
                    dataAutorizacao: new Date().toISOString(),
                    autorizadoPor: currentUser?.name || currentUser?.displayName || 'Auditor',
                    autorizadorNome: currentUser?.name || currentUser?.displayName || 'NÃO IDENTIFICADO',
                    autorizadorCpf: currentUser?.cpf || '',
                    autorizadorCrm: currentUser?.crm || '',
                    orgaoEmissor: codigoOrgao // INJEÇÃO DIRETA DA FONTE
                };

                const { error } = await supabase.from('aihs').update(payloadAtualizacao).eq('id', aihSelecionada.id);
                if (error) throw error;

                // ATUALIZA O CARTÃO FILA CIRÚRGICA DESTE PACIENTE
                try {
                    const { error: errorCirurgia } = await supabase
                        .from('surgeries')
                        .update({
                            autorizada: true // MUITO IMPORTANTE: Apenas acende a flag, NÃO mexe no status!
                        })
                        .eq('pacienteId', aihSelecionada.pacienteId)
                        .eq('procedimento', aihSelecionada.procedimento) // Nova trava de segurança
                        .eq('autorizada', false) // Só atualiza se estiver pendente
                        .in('status', ['AGUARDANDO', 'Aguardando', 'Aguardando Autorização', 'Pendente']); // Ampliando a rede de segurança

                    if (errorCirurgia) console.warn("Aviso: Cirurgia não encontrada ou já atualizada na Fila.", errorCirurgia);
                } catch (err) {
                    console.error("Erro ao sincronizar aprovação com a Fila Cirúrgica:", err);
                }

                await logAction('AUTORIZAÇÃO AIH', `AIH do paciente ${aihSelecionada.pacienteNome || 'Desconhecido'} autorizada.`);
                toast.success('AIH Autorizada com sucesso!');

                const payloadPdf = {
                    ...aihSelecionada,
                    ...payloadAtualizacao,
                    orgaoEmissor: codigoOrgao
                };

                await gerarPdfAih(payloadPdf);
            } else if (tipoAcao === 'devolver') {
                const { error } = await supabase.from('aihs').update({
                    status: 'devolvida',
                    motivoDevolucao: inputRegulacao
                }).eq('id', aihSelecionada.id);
                if (error) throw error;
                await logAction('DEVOLUÇÃO DE AIH', `AIH do paciente ${aihSelecionada.pacienteNome || 'Desconhecido'} devolvida. Motivo: ${inputRegulacao}`);
                toast.success('AIH Devolvida com sucesso!');
            }

            setModalAberto(false);
            setAihSelecionada(null);
            setTipoAcao('');
            setInputRegulacao('');
            loadAihs();
        } catch (error) {
            console.error('Erro ao atualizar AIH:', error);
            toast.error('Erro ao processar a requisição.');
        }
    };

    const handleGerarNumeroSequencial = async () => {
        try {
            // Busca apenas os números para não pesar a memória
            const { data, error } = await supabase
                .from('aihs')
                .select('numeroAutorizacao')
                .not('numeroAutorizacao', 'is', null)
                .neq('numeroAutorizacao', '');

            if (error) throw error;

            let proximoNumero = 1; // Se não tiver nada, começa no 1
            if (data && data.length > 0) {
                // Filtra e converte para achar o verdadeiro MAIOR número matemático
                const numeros = data
                    .map(aih => parseInt(aih.numeroAutorizacao, 10))
                    .filter(num => !isNaN(num)); // Ignora lixo ou textos estranhos

                if (numeros.length > 0) {
                    const maiorNumero = Math.max(...numeros);
                    proximoNumero = maiorNumero + 1;
                }
            }
            // Formata lindamente: 0000001, 0000002, etc.
            const numeroFormatado = String(proximoNumero).padStart(7, '0');
            setInputRegulacao(numeroFormatado);

        } catch (err) {
            console.error("Erro ao gerar sequência:", err);
            toast.error("Erro ao gerar número sequencial.");
        }
    };

    if (!unidadeAtual) return <UnitPrompt />;

    return (
        <div className="py-4 px-2 sm:px-4 font-sans animate-in fade-in duration-700 w-full min-h-full">
            <div className="max-w-7xl mx-auto space-y-3">

                {/* Cabeçalho Global */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3 border-b border-white/60 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/20">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-slate-900 drop-shadow-none uppercase tracking-widest">Central de Regulação</h1>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Análise e Autorização de AIHs</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white/60 backdrop-blur-lg p-2.5 rounded-xl shadow-sm border border-white/400 mb-3 flex flex-col gap-2.5">
                    {/* Linha 1: Pesquisa e Filtros Principais */}
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[250px] relative">
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Buscar Paciente</label>
                            <Search className="absolute left-2.5 bottom-2 text-slate-500" size={14} />
                            <input type="text" placeholder="Nome ou CNS..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-8 pr-2 py-1.5 bg-white/80 border border-white/60 rounded-lg text-[11px] outline-none focus:border-blue-500 font-semibold" />
                        </div>
                        <div className="w-full md:w-auto">
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</label>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full py-1.5 px-2 bg-white/80 border border-white/60 rounded-lg text-[11px] text-slate-700 outline-none focus:border-blue-500 font-bold uppercase">
                                <option value="todos">Todos os Status</option>
                                <option value="pendente">Pendentes</option>
                                <option value="autorizada">Autorizadas</option>
                                <option value="devolvida">Devolvidas</option>
                            </select>
                        </div>
                        <div className="w-full md:w-auto flex items-center gap-2">
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Data Início</label>
                                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="py-1.5 px-2 bg-white/80 border border-white/60 rounded-lg text-[11px] text-slate-700 outline-none focus:border-blue-500 font-bold" />
                            </div>
                            <span className="text-slate-600 mt-4">-</span>
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Data Fim</label>
                                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="py-1.5 px-2 bg-white/80 border border-white/60 rounded-lg text-[11px] text-slate-700 outline-none focus:border-blue-500 font-bold" />
                            </div>
                        </div>
                        <div className="flex gap-1 w-full md:w-auto items-center">
                            <button onClick={() => navegarMes(-1)} className="p-1.5 bg-white/70 text-slate-500 rounded-lg hover:bg-blue-100 hover:text-blue-600 transition-colors shadow-sm" title="Mês Anterior">
                                <ChevronLeft size={16} strokeWidth={3} />
                            </button>
                            <button onClick={() => navegarMes(0)} className="px-3 py-1.5 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none rounded-lg text-[11px] font-black uppercase hover:bg-blue-100 transition-colors shadow-sm">
                                Mês Atual
                            </button>
                            <button onClick={() => navegarMes(1)} className="p-1.5 bg-white/70 text-slate-500 rounded-lg hover:bg-blue-100 hover:text-blue-600 transition-colors shadow-sm" title="Próximo Mês">
                                <ChevronRight size={16} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                    {/* Linha 2: Filtros Secundários e Limpar */}
                    <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-slate-200/50">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Especialidade</label>
                            <select value={especialidadeFilter} onChange={e => setEspecialidadeFilter(e.target.value)} className="w-full py-1.5 px-2 bg-white/80 border border-white/60 rounded-lg text-[11px] text-slate-700 outline-none focus:border-blue-500 font-semibold uppercase">
                                <option value="todos">Todas as Especialidades</option>
                                {especialidades.map(esp => <option key={esp} value={esp}>{esp}</option>)}
                            </select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Médico</label>
                            <select value={cirurgiaoFilter} onChange={e => setCirurgiaoFilter(e.target.value)} className="w-full py-1.5 px-2 bg-white/80 border border-white/60 rounded-lg text-[11px] text-slate-700 outline-none focus:border-blue-500 font-semibold uppercase">
                                <option value="todos">Todos os Médicos</option>
                                {cirurgioes.map(cir => <option key={cir} value={cir}>{cir}</option>)}
                            </select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Procedimento</label>
                            <select value={procedimentoFilter} onChange={e => setProcedimentoFilter(e.target.value)} className="w-full py-1.5 px-2 bg-white/80 border border-white/60 rounded-lg text-[11px] text-slate-700 outline-none focus:border-blue-500 font-semibold uppercase">
                                <option value="todos">Todos os Procedimentos</option>
                                {procedimentos.map(proc => <option key={proc} value={proc}>{proc}</option>)}
                            </select>
                        </div>
                        <div className="w-full md:w-auto mt-2 md:mt-0 ml-auto">
                            <button
                                onClick={limparFiltros}
                                className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/70 text-slate-500 rounded-lg text-[11px] font-black uppercase hover:bg-rose-500/20 hover:text-rose-600 transition-colors shadow-sm border border-transparent hover:border-rose-200"
                                title="Limpar todos os filtros"
                            >
                                <FilterX size={14} /> Limpar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabela de AIHs */}
                <div className="bg-white/60 backdrop-blur-lg rounded-xl shadow-sm border border-white/400 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-white/60">
                                <tr className="text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="py-1.5 px-3">Data</th>
                                    <th className="py-1.5 px-3">Paciente</th>
                                    <th className="py-1.5 px-3">Procedimento</th>
                                    <th className="py-1.5 px-3">Médico Solicitante</th>
                                    <th className="py-1.5 px-3">Status</th>
                                    <th className="py-1.5 px-3 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-transparent">
                                {loading ? (
                                    <tr><td colSpan="6" className="py-20 text-center text-slate-500 font-bold uppercase text-sm">Carregando...</td></tr>
                                ) : displayAihs.length > 0 ? (
                                    displayAihs.map(aih => (
                                        <tr key={aih.id} className="hover:bg-white/60 transition-colors">
                                            <td className="px-3 py-1">
                                                <div className="text-xs font-black text-slate-700">{aih.dataEmissao ? new Date(aih.dataEmissao).toLocaleDateString('pt-BR') : '---'}</div>
                                            </td>
                                            <td className="px-3 py-1">
                                                <div className="font-bold text-slate-900 drop-shadow-none text-xs uppercase">{aih.pacienteNome || 'NÃO INFORMADO'}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">CNS: {aih.cns || '---'}</div>
                                            </td>
                                            <td className="px-3 py-1">
                                                <div className="text-[11px] font-bold text-slate-700 uppercase line-clamp-1" title={aih.procedimento}>{aih.procedimento || '---'}</div>
                                            </td>
                                            <td className="px-3 py-1">
                                                <div className="text-[11px] font-bold text-slate-700 uppercase line-clamp-1" title={aih.medicoSolicitante || aih.cirurgiao}>
                                                    {aih.medicoSolicitante || aih.cirurgiao || '---'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-1">
                                                {/* Etiqueta de Status Inteligente */}
                                                {aih.status === 'autorizada' ? (
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase tracking-wider inline-block">Autorizada</span>
                                                ) : aih.status === 'negada' || aih.status === 'devolvida' ? (
                                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded uppercase tracking-wider inline-block">Devolvida</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded uppercase tracking-wider inline-flex items-center gap-1 shadow-sm border border-amber-200">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500/20 animate-pulse"></span> Pendente
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-1 text-center">
                                                {aih.status === 'pendente' ? (
                                                    <button onClick={() => { setAihSelecionada(aih); setTipoAcao(''); setModalAberto(true); }} className="px-2 py-1 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none hover:bg-blue-600 hover:text-white rounded-md transition-all shadow-sm text-[10px] font-bold uppercase flex items-center gap-1.5 mx-auto">
                                                        <Eye size={12} /> Analisar
                                                    </button>
                                                ) : (
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase">Analisada</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="6" className="py-20 text-center text-slate-500 font-bold uppercase text-sm">Nenhuma AIH encontrada.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal de Análise */}
                {modalAberto && aihSelecionada && (
                    <div className="fixed top-16 inset-x-0 bottom-0 z-50 flex items-center justify-center p-4 bg-white/40 backdrop-blur-sm backdrop-blur-sm">
                        <div className="bg-white/95 backdrop-blur-xl border border-white rounded-2xl shadow-2xl backdrop-blur-xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden">
                            <div className="p-4 border-b border-white/40 flex justify-between items-center bg-white/60">
                                <h2 className="text-sm font-black text-slate-900 drop-shadow-none uppercase tracking-widest flex items-center gap-2"><FileText size={18} className="text-blue-600" /> Análise de AIH</h2>
                                <button onClick={() => setModalAberto(false)} className="text-slate-500 hover:text-rose-500"><XCircle size={20} /></button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-50/30">
                                {/* Coluna 1: Resumo Clínico */}
                                <div className="space-y-5 bg-white/60 p-5 rounded-xl border border-white/60 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-700 uppercase flex items-center gap-2 border-b border-white/40 pb-2"><User size={14} className="text-blue-500" /> Dados Clínicos</h3>
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Paciente</p>
                                        <p className="text-sm font-black text-slate-900 drop-shadow-none uppercase leading-tight">{aihSelecionada.pacienteNome}</p>
                                        <p className="text-xs text-slate-500 font-bold mt-1">CNS: {aihSelecionada.cns}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Procedimento Solicitado</p>
                                        <p className="text-xs font-black text-slate-700 uppercase leading-snug">{aihSelecionada.procedimento}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Diagnóstico / CID</p>
                                        <p className="text-xs font-bold text-slate-700 uppercase">{aihSelecionada.diagnosticoInicial || 'NÃO INFORMADO'} <br /><span className="inline-block mt-1 text-blue-700 bg-blue-500/20 border border-blue-100 px-2 py-0.5 rounded font-black">{aihSelecionada.cid10 || ''}</span></p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Médico Solicitante</p>
                                        <p className="text-xs font-bold text-slate-700 uppercase">{aihSelecionada.medicoSolicitante || aihSelecionada.cirurgiao || '---'}</p>
                                    </div>
                                </div>
                                {/* Coluna 2: Histórico do Paciente */}
                                <div className="bg-white/60 p-5 rounded-xl border border-white/60 shadow-sm flex flex-col h-full max-h-[500px]">
                                    <h3 className="text-xs font-black text-slate-700 uppercase flex items-center gap-2 border-b border-white/40 pb-2 mb-3"><History size={14} className="text-purple-500" /> Histórico no SUS ({historicoPaciente.length})</h3>
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                        {historicoPaciente.length > 0 ? (
                                            historicoPaciente.map(hist => (
                                                <div key={hist.id} className="p-3 rounded-lg border border-white/40 bg-white/60 text-left">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[11px] font-black text-slate-500"><Calendar size={10} className="inline mr-1" /> {hist.dataEmissao ? new Date(hist.dataEmissao).toLocaleDateString('pt-BR') : '---'}</span>
                                                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${hist.status === 'autorizada' ? 'bg-emerald-100 text-emerald-700' : hist.status === 'devolvida' || hist.status === 'negada' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{hist.status}</span>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-slate-900 drop-shadow-none uppercase line-clamp-2">{hist.procedimento}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-60">
                                                <Activity size={32} className="mb-2" />
                                                <p className="text-[11px] uppercase font-bold text-center">Nenhum histórico anterior localizado para este CNS.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Coluna 3: Painel de Decisão */}
                                <div className="bg-white/50 text-slate-800 rounded-xl p-5 flex flex-col shadow-lg">
                                    <h3 className="text-xs font-black text-slate-700 uppercase mb-4 border-b border-slate-700 pb-2 flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-400" /> Parecer da Auditoria</h3>

                                    <div className="flex gap-2 mb-6">
                                        <button onClick={() => setTipoAcao('aprovar')} className={`flex-1 py-2.5 text-xs font-bold uppercase rounded-lg border transition-all ${tipoAcao === 'aprovar' ? 'bg-emerald-500/20 text-white border-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-white/50 text-slate-600 border-slate-600 hover:bg-slate-700'}`}><CheckCircle size={16} className="mx-auto mb-1" /> Aprovar</button>
                                        <button onClick={() => setTipoAcao('devolver')} className={`flex-1 py-2.5 text-xs font-bold uppercase rounded-lg border transition-all ${tipoAcao === 'devolver' ? 'bg-rose-500/20 text-white border-rose-500 shadow-lg shadow-rose-500/30' : 'bg-white/50 text-slate-600 border-slate-600 hover:bg-slate-700'}`}><XCircle size={16} className="mx-auto mb-1" /> Devolver</button>
                                    </div>
                                    {tipoAcao && (
                                        <div className="animate-in fade-in slide-in-from-top-4 flex-1 flex flex-col bg-white/40 backdrop-blur-sm p-4 rounded-xl border border-slate-700">
                                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                                {tipoAcao === 'aprovar' ? 'Número da Autorização (SES/SUS)' : 'Motivo da Devolução'}
                                            </label>
                                            <div className="relative mb-6">
                                                <input type="text" value={inputRegulacao} onChange={(e) => setInputRegulacao(e.target.value)} className="w-full bg-white/50 border border-slate-600 text-slate-800 text-sm font-semibold px-3 py-3 pr-10 rounded-lg focus:outline-none focus:border-blue-500 placeholder:text-slate-500" placeholder={tipoAcao === 'aprovar' ? 'Ex: 123456789' : 'Faltam exames complementares...'} autoFocus />
                                                {tipoAcao === 'aprovar' && (
                                                    <button onClick={handleGerarNumeroSequencial} className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-300 p-1 bg-slate-700/50 hover:bg-slate-700 rounded-md transition-colors" title="Gerar Número Automático Sequencial">
                                                        <Wand2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                            <button onClick={handleConfirmarAcao} className={`w-full py-3.5 rounded-xl text-xs font-black text-slate-800 uppercase tracking-wider mt-auto transition-all ${tipoAcao === 'aprovar' ? 'bg-emerald-500/20 hover:bg-emerald-600' : 'bg-rose-500/20 hover:bg-rose-600'}`}>Confirmar {tipoAcao === 'aprovar' ? 'Aprovação' : 'Devolução'}</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
