import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePermission } from '../contexts/PermissionContext';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import ApaPrintTemplate from '../components/ApaPrintTemplate';
import { supabase } from '../services/supabase';
import { abrirArquivo } from '../services/arquivos';
import { prepararArquivo } from '../utils/arquivoUpload';
import { logAction } from '../utils/logger';
import { Search, Printer, Save, Activity, Plus, ArrowLeft, Loader2, ZoomIn, ZoomOut, Eye, Trash2, ChevronRight, ChevronDown, User, Stethoscope, FileText, ActivitySquare, CheckSquare, AlertTriangle, Copy, Sparkles, Upload, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { maskCPF, maskTelefone } from '../utils/masks';
import UnitPrompt from '../components/UnitPrompt';
import { SigtapAutocomplete } from '../components/SigtapAutocomplete';
import AlertaCondutaMedicamento from '../components/apa/AlertaCondutaMedicamento';
import ExameNormalAlterado from '../components/apa/ExameNormalAlterado';
import { carregarRegrasAtivas } from '../services/apaRegras';
import { carregarTextosExame } from '../services/apaExamePadrao';
import { CAMPOS_EXAME_PADRAO, TEXTOS_EXAME_FABRICA } from '../config/apaExamePadrao';
import { avaliarMedicamentos, planoTemNeuroeixo, calcularClCr, condutaEhManutencao } from '../utils/apaMedicationRules';

// --- Requisição de Transfusão (folha anexa da APA) ---------------------------
// Opções da requisição exigida pelo banco de sangue (RDC 57/2010 - ANVISA).
const HEMO_TIPOS_TRANSFUSAO = ['Programada', 'Não urgente (até 24h)', 'Urgente (até 3h)', 'Extrema urgência'];
const HEMO_PROC_ESPECIAIS = ['Filtrado', 'Irradiado', 'Lavado', 'Fenotipado'];

// Estado "zerado" da requisição. Usado quando a reserva é desmarcada e quando o
// protocolo de recusa de hemotransfusão é marcado (as duas coisas não convivem).
const HEMO_REQUISICAO_VAZIA = {
    plan_hemo_indicacao: '', plan_hemo_transf_previa: '', plan_hemo_reacao: '', plan_hemo_reacao_qual: '',
    plan_hemo_ultima_transf: '', plan_hemo_gestacoes: '', plan_hemo_gestacoes_qtd: '',
    plan_hemo_tipo: '', plan_hemo_prog_data: '', plan_hemo_prog_hora: '',
    plan_hemo_ch: '', plan_hemo_plaq: '', plan_hemo_pfc: '', plan_hemo_crio: '',
    plan_hemo_outros: '', plan_hemo_outros_qtd: '',
    plan_hemo_esp: [], plan_hemo_esp_just: '', plan_hemo_obs: ''
};

// O banco pode devolver null/'' no lugar do array de procedimentos especiais
// (o load da APA troca todo null por string vazia), então normaliza sempre.
const listaProcEspeciais = (valor) => (Array.isArray(valor) ? valor : []);

const HEMO_INPUT_CLS = "w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all shadow-sm disabled:opacity-70";
const HEMO_LABEL_CLS = "block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5";

const HemoSimNao = ({ value, onSelect, disabled }) => (
    <div className="flex flex-wrap gap-3">
        {['Não', 'Sim'].map(opt => (
            <button key={opt} type="button" disabled={disabled} onClick={() => onSelect(opt)} className={`px-5 py-1.5 text-xs font-bold rounded-lg border transition-all ${value === opt ? (opt === 'Sim' ? 'bg-rose-500/20 border-rose-500 text-rose-700 shadow-sm font-black' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm font-black') : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {opt}
            </button>
        ))}
    </div>
);

const InlineCalendar = ({ value, onChange, disabled }) => {
    const [currentMonth, setCurrentMonth] = useState(() => {
        if (value) {
            const [y, m, d] = value.split('-');
            return new Date(y, m - 1, d);
        }
        return new Date();
    });

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const allWeeks = [];
    while (days.length > 0) {
        allWeeks.push(days.splice(0, 7));
    }

    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));

    const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

    return (
        <div className={`border border-white/60 rounded-lg p-2 bg-white/60 flex flex-col ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-center mb-2">
                <button type="button" onClick={prevMonth} className="px-2 py-1 text-slate-500 hover:bg-white/70 rounded">&lt;</button>
                <span className="text-[11px] font-bold uppercase text-slate-700">{monthNames[month]} {year}</span>
                <button type="button" onClick={nextMonth} className="px-2 py-1 text-slate-500 hover:bg-white/70 rounded">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-500 mb-1">
                <div>D</div><div>S</div><div>T</div><div>Q</div><div>Q</div><div>S</div><div>S</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {allWeeks.map((week, wi) => (
                    <React.Fragment key={wi}>
                        {week.map((d, di) => {
                            if (!d) return <div key={`empty-${wi}-${di}`}></div>;
                            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const isSelected = value === dStr;
                            let isToday = false;
                            try { isToday = new Date().toISOString().split('T')[0] === dStr; } catch(e){}
                            return (
                                <div 
                                    key={d} 
                                    onClick={() => onChange(dStr)}
                                    className={`py-1 text-xs font-bold rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : isToday ? 'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none' : 'text-slate-700 hover:bg-white/70'}`}
                                >
                                    {d}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

const DataNascInput = ({ value, onChange, disabled }) => {
    const [displayValue, setDisplayValue] = useState('');

    useEffect(() => {
        if (value && value.includes('-')) {
            setDisplayValue(value.split('-').reverse().join('/'));
        } else {
            setDisplayValue(value || '');
        }
    }, [value]);

    const handleLocalChange = (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 8) val = val.slice(0, 8);
        
        let formatted = val;
        if (val.length > 2) formatted = val.slice(0,2) + '/' + val.slice(2);
        if (val.length > 4) formatted = val.slice(0,2) + '/' + val.slice(2,4) + '/' + val.slice(4);
        
        setDisplayValue(formatted);
        
        if (val.length === 8) {
            const d = val.slice(0,2);
            const m = val.slice(2,4);
            const y = val.slice(4,8);
            onChange({ target: { name: 'dataNasc', value: `${y}-${m}-${d}`, type: 'text' }});
        } else if (val.length === 0) {
            onChange({ target: { name: 'dataNasc', value: '', type: 'text' }});
        }
    };

    return (
        <input 
            type="tel"
            disabled={disabled}
            value={displayValue}
            onChange={handleLocalChange}
            placeholder="DD/MM/AAAA"
            className="w-full px-3 py-1.5 text-base md:text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
    );
};

const getDoctorPrefix = (nome, sexo) => {
    if (sexo === 'Masculino' || sexo === 'M') return 'DR.';
    if (sexo === 'Feminino' || sexo === 'F') return 'DRA.';
    if (!nome) return 'DR(A).';
    
    try {
        const pNome = nome.trim().toUpperCase().split(' ')[0];
        const nomesFem = ['ALINE', 'CRISTIANE', 'SIMONE', 'TATIANE', 'LILIAN', 'CARMEN', 'HELEN', 'EVELYN', 'IVONE', 'JAQUELINE', 'KAREN', 'RAQUEL', 'ROSE', 'SUELI', 'THAIS', 'THAIZ', 'ISIS', 'LAIS', 'LAÍS', 'BEATRIZ', 'ALICE', 'JANAINA', 'MARIA', 'ANA', 'JULIANA', 'CAMILA', 'FERNANDA', 'BRUNA', 'LETICIA', 'GABRIELA'];
        const nomesMasc = ['MARCOS', 'ANDRE', 'ANDRÉ', 'DANIEL', 'GABRIEL', 'LUCAS', 'MATHEUS', 'MATEUS', 'RAFAEL', 'FELIPE', 'GUILHERME', 'ARTHUR', 'HEITOR', 'BERNARDO', 'DAVI', 'MIGUEL', 'THIAGO', 'TIAGO', 'IGOR', 'VITOR', 'DENIS', 'WILLIAN', 'ALLAN', 'ALAN', 'ALEX', 'CAUE', 'CAUÊ', 'GIOVANI', 'GIOVANNI', 'JEFERSON', 'JONATAS', 'JONATHAN', 'LUIZ', 'LUIS', 'MICHEL', 'WAGNER', 'ALESSANDRO', 'ANDERSON'];
        
        if (nomesFem.includes(pNome) || pNome.endsWith('A')) return 'DRA.';
        if (nomesMasc.includes(pNome) || pNome.endsWith('O') || pNome.endsWith('S') || pNome.endsWith('R') || pNome.endsWith('L') || pNome.endsWith('M') || pNome.endsWith('N') || pNome.endsWith('E') || pNome.endsWith('D')) return 'DR.';
    } catch(e) {}
    
    return 'DR.'; // Default fallback para masculino ao invés de ficar o estético DR(A)
};

const capitalizeName = (str) => {
    if (!str) return '';
    const preposicoes = ['de', 'da', 'do', 'das', 'dos', 'e'];
    return str.toLowerCase().split(' ').map((word, index) => {
        if (index > 0 && preposicoes.includes(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
};

export default function Apa({ paciente }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    // Ver APA de outra unidade virou permissão (antes o botão era livre para
    // qualquer um que abrisse a tela). A da Ficha Anestésica é outra chave.
    const podeVerTodasUnidades = hasPermission('Ver APAs de Todas as Unidades') || hasPermission('Acesso Total (Admin)');
    const { currentUser: user } = useAuth();
    const { unidadeAtual, unidades } = useUnit();

    const getDraft = () => {
        if (location.state?.apaId) return null;
        try {
            const stored = sessionStorage.getItem('apa_draft_state');
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    };
    const draftState = getDraft();

    const [settings, setSettings] = useState({});

    const [apaIdParaCarregar, setApaIdParaCarregar] = useState(location.state?.apaId || null);
    const [isReadOnly, setIsReadOnly] = useState(Boolean(location.state?.apaId));
    
    const [modoVisao, setModoVisao] = useState(draftState?.modoVisao || 'lista');
    const [activeTab, setActiveTab] = useState(draftState?.activeTab || 'dados');
    const [searchTerm, setSearchTerm] = useState(draftState?.searchTerm || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiValidationData, setAiValidationData] = useState(null);
    const [aiValidationFileUrl, setAiValidationFileUrl] = useState(null);
    const [pendingExameFile, setPendingExameFile] = useState(null);
    const [exameFileToUpload, setExameFileToUpload] = useState(null);
    const fileInputRef = useRef(null);
    
    const [apaParaImprimir, setApaParaImprimir] = useState(null);
    const [listaApas, setListaApas] = useState([]);
    const [loadingApas, setLoadingApas] = useState(true);
    const [searchApa, setSearchApa] = useState('');
    const [filterStatus, setFilterStatus] = useState('Todos');
    const [filterDataInicio, setFilterDataInicio] = useState('');
    const [filterDataFim, setFilterDataFim] = useState('');
    const [filterProcedimento, setFilterProcedimento] = useState('Todos');
    const [mostrarTodasUnidades, setMostrarTodasUnidades] = useState(false);

    // Paginação e Lixeira
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [totalApas, setTotalApas] = useState(0);
    const [mostrarLixeira, setMostrarLixeira] = useState(false);
    const itensPorPagina = 1500;

    const [pacientes, setPacientes] = useState([]);
    const [showPacientes, setShowPacientes] = useState(false);
    
    // Controle do menu de Ações mobile
    const [openActionApaId, setOpenActionApaId] = useState(null);

    const defaultFormData = {
        nome: '', cpf: '', dataNasc: '', sexo: '', peso: '', altura: '', telefone: '', convenio: 'SUS', nome_mae: '',
        resp_nome: '', resp_cpf: '', resp_parentesco: '',
        procedimento: '', profissional: '', dataProcedimento: '', carater: 'Eletivo', porte: '', posicao: '',
        has: false, dm: false, cardio: false, arritmia: false, icc: false, iam: false, asma: false, dpoc: false,
        pneumo: false, renal: false, hepato: false, tireo: false, neuro: false, convulsao: false, avc: false,
        coag: false, apneia: false, refluxo: false, obesidade: false, marcapasso: false, gestante: false,
        hiv: false, neoplasia: false, psiq: false, detalhes_comorbidades: '',
        cirurgias: '', anestesias_previas: '', hist_fam: '', hm: '',
        tabagismo: 'Não', carga_tabagica: '', parou_fumo: '', etilismo: 'Não', drogas: 'Nega', mets: '',
        pa: '', fc: '', spo2: '', fr: '', temp: '', acv: '', ar: '', abdome: '', dorso: '', ef_outros: '',
        va_abertura: '', va_dtm: '', va_dem: '', va_cervical: '', va_protese: 'Não', va_cormack: '', va_dificil: '', va_obs: '',
        asa: '',
        ex_hb: '', ex_ht: '', ex_plaq: '', ex_leuco: '', ex_inr: '', ex_ttpa: '', ex_glic: '', ex_hba1c: '',
        ex_ureia: '', ex_creat: '', ex_na: '', ex_k: '', ex_tgo: '', ex_tgp: '', ex_eco: '', ex_ecg: '', ex_rx: '', ex_outros: '', ex_obs: '', exames_url: '',
        ex_data_lab: '', ex_data_cardio: '', ex_data_imagem: '',
        jejum_orientacao: '', profilaxia_asp: 'Não indicada',
        jejum_liquidos: '', jejum_leite: '', jejum_formula: '', jejum_leve: '', jejum_completa: '',
        plan_tecnica: '', plan_via_aerea: '', plan_monitor: 'Básica (ECG, SpO2, PANI, Capno)', plan_acesso: 'Periférico 1 via',
        plan_hemoderivados: 'Não', plan_recusa_hemo: '', plan_destino: 'Não', plan_obs: '',
        ...HEMO_REQUISICAO_VAZIA,
        mpa_ansio: 'Não prescrito', mpa_nvpo: 'Não indicada', mpa_atb: 'Não indicada', mpa_outras: '',
        parecer_obs: '', parecer_aval_esp: 'Não', parecer_aval_especialidade: '', parecer_aval_motivo: '',
        neuro_consciencia: '', neuro_deficit: '', coluna_dorso: '', acesso_venoso: '', tabag_cigarros: '', tabag_anos: '',
        pacienteInapto: false
    };

    const [formData, setFormData] = useState(draftState?.formData ? { ...defaultFormData, ...draftState.formData } : defaultFormData);

    const [negaAlergia, setNegaAlergia] = useState(draftState?.negaAlergia ?? false);
    const [alergias, setAlergias] = useState(draftState?.alergias || [{ substancia: '', reacao: '' }]);
    const [negaMed, setNegaMed] = useState(draftState?.negaMed ?? false);
    const [medicamentos, setMedicamentos] = useState(draftState?.medicamentos || [{ nome: '', dose: '', frequencia: '', conduta: '' }]);
    const [mallampati, setMallampati] = useState(draftState?.mallampati || '');
    const [parecer, setParecer] = useState(draftState?.parecer || '');
    const [regrasMedicamento, setRegrasMedicamento] = useState([]);
    const [textosExamePadrao, setTextosExamePadrao] = useState(TEXTOS_EXAME_FABRICA);

    // 2. Salva o rascunho continuamente a cada alteração
    useEffect(() => {
        if (isReadOnly && apaIdParaCarregar) return; // Não salvar rascunho se for apenas leitura
        const stateToSave = {
            formData, activeTab, modoVisao, alergias, negaAlergia,
            medicamentos, negaMed, mallampati, parecer, searchTerm
        };
        sessionStorage.setItem('apa_draft_state', JSON.stringify(stateToSave));
    }, [formData, activeTab, modoVisao, alergias, negaAlergia, medicamentos, negaMed, mallampati, parecer, searchTerm, isReadOnly, apaIdParaCarregar]);

    useEffect(() => {
        const loadPacientes = async () => {
            try {
                const { data, error } = await supabase.from('pacientes').select('*');
                if (error) throw error;
                setPacientes(data || []);
            } catch (error) { console.error(error); }
        };
        const loadSettings = async () => {
             const { data } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
             if (data && data.data) {
                 setSettings(data.data);
             }
        };
        loadPacientes();
        loadSettings();
    }, []);

    useEffect(() => {
        const loadApa = async () => {
            if (apaIdParaCarregar) {
                try {
                    const { data, error } = await supabase.from('apas').select('*').eq('id', apaIdParaCarregar).maybeSingle();
                    if (data && !error) {
                        const fData = { ...formData, ...data, id: undefined, dataRegistro: undefined, dataAtualizacao: undefined };
                        
                        // Replace null with empty string to avoid React uncontrolled input warnings
                        Object.keys(fData).forEach(key => {
                            if (fData[key] === null) fData[key] = '';
                        });

                        delete fData.alergias; delete fData.medicamentos; delete fData.negaAlergia; delete fData.negaMed; delete fData.mallampati; delete fData.parecerFinal;

                        // Parse comorbidades backwards
                        if (data.comorbidadesList && Array.isArray(data.comorbidadesList)) {
                            data.comorbidadesList.forEach(k => { fData[k] = true; });
                        }

                        setFormData(prev => ({ ...prev, ...fData }));

                        let loadedAlergias = [];
                        try { loadedAlergias = typeof data.alergias === 'string' ? JSON.parse(data.alergias) : data.alergias; } catch(e) {}
                        
                        let loadedMedicamentos = [];
                        try { loadedMedicamentos = typeof data.medicamentos === 'string' ? JSON.parse(data.medicamentos) : data.medicamentos; } catch(e) {}

                        if (data.negaAlergia !== undefined) setNegaAlergia(data.negaAlergia);
                        if (loadedAlergias && loadedAlergias.length > 0) setAlergias(loadedAlergias);

                        if (data.negaMed !== undefined) setNegaMed(data.negaMed);
                        if (loadedMedicamentos && loadedMedicamentos.length > 0) setMedicamentos(loadedMedicamentos);

                        if (data.mallampati) setMallampati(data.mallampati);
                        if (data.parecerFinal) setParecer(data.parecerFinal);

                        setSearchTerm(data.nome || '');
                        setIsReadOnly(true);
                        setModoVisao('formulario');
                    }
                } catch (error) { toast.error("Erro ao carregar APA."); }
            }
        };
        loadApa();
    }, [apaIdParaCarregar]);

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
                    nome: p.paciente_nome || p.nome || '',
                    cpf: p.paciente_cpf || p.cpf || '',
                    dataNasc: p.dataNascimento || p.nascimento || p.paciente_nascimento || '',
                    sexo: p.sexo ? (p.sexo.toUpperCase().startsWith('M') ? 'Masculino' : p.sexo.toUpperCase().startsWith('F') ? 'Feminino' : '') : '',
                    telefone: p.telefone || p.telefone1 || '',
                    peso: p.peso || '',
                    altura: p.altura || ''
                }));
                setSearchTerm(p.paciente_nome || p.nome || '');
                setModoVisao('formulario');
            }
        };
        fetchDetalhesPaciente();
    }, [paciente]);

    const loadApasList = async () => {
        if (!unidadeAtual && !mostrarTodasUnidades) {
            setListaApas([]);
            setLoadingApas(false);
            return;
        }
        setLoadingApas(true);

        // Limpeza silenciosa de APAs apagadas há mais de 60 dias
        try {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
            await supabase.from('apas').delete().lt('deleted_at', sixtyDaysAgo.toISOString());
        } catch (e) {
            // Ignora erro se a coluna ainda não existir
        }

        try {
            const from = (paginaAtual - 1) * itensPorPagina;
            const to = from + itensPorPagina - 1;

            let query = supabase
                .from('apas')
                .select('id, nome, cpf, dataRegistro, procedimento, parecerFinal, unidade, exames_url, asa, anestesistaNome', { count: 'exact' })
                .order('createdAt', { ascending: false })
                .range(from, to);

            if (podeVerTodasUnidades && mostrarTodasUnidades && unidades && unidades.length > 0) {
                query = query.in('unidade', unidades);
            } else if (unidadeAtual) {
                query = query.or(`unidade.eq."${unidadeAtual}",unidade.is.null`);
            }

            if (mostrarLixeira) {
                query = query.not('deleted_at', 'is', null);
            } else {
                query = query.is('deleted_at', null);
            }

            const { data, error, count } = await query;

            if (error) {
                if (error.code === '42703' || error.message?.includes('does not exist')) {
                    if (mostrarLixeira) {
                        toast.error("Você precisa criar a coluna 'deleted_at' (tipo timestampZ) na tabela 'apas' para usar a lixeira.");
                        setMostrarLixeira(false);
                    }
                    // Fallback para quando a coluna não existe ainda
                    let fallbackQuery = supabase
                        .from('apas')
                        .select('id, nome, cpf, dataRegistro, procedimento, parecerFinal, unidade, exames_url, asa, anestesistaNome', { count: 'exact' })
                        .order('createdAt', { ascending: false })
                        .range(from, to);
                    
                    if (podeVerTodasUnidades && mostrarTodasUnidades && unidades && unidades.length > 0) {
                        fallbackQuery = fallbackQuery.in('unidade', unidades);
                    } else if (unidadeAtual) {
                        fallbackQuery = fallbackQuery.or(`unidade.eq."${unidadeAtual}",unidade.is.null`);
                    }

                    const fallback = await fallbackQuery;
                    setListaApas(fallback.data || []);
                    setTotalApas(fallback.count || 0);
                } else {
                    throw error;
                }
            } else {
                setListaApas(data || []);
                setTotalApas(count || 0);
            }
        } catch (error) {
            console.warn('Aviso: Erro ao carregar apas. Retornando vazio.', error);
            setListaApas([]);
            setTotalApas(0);
        } finally {
            setLoadingApas(false);
        }
    };

    useEffect(() => {
        if (modoVisao === 'lista') {
            loadApasList();
        }
    }, [modoVisao, unidadeAtual, mostrarTodasUnidades, unidades, paginaAtual, mostrarLixeira]);

    const handleNovaApa = () => {
        setFormData({
            nome: '', dataNasc: '', cpf: '', sexo: '', peso: '', altura: '', convenio: 'SUS', nome_mae: '',
            resp_nome: '', resp_cpf: '', resp_parentesco: '', telefone: '',
            procedimento: '', profissional: '', dataProcedimento: '', carater: 'Eletivo', porte: '', posicao: '',
            has: false, dm: false, cardio: false, arritmia: false, icc: false, iam: false, asma: false, dpoc: false,
            pneumo: false, renal: false, hepato: false, tireo: false, neuro: false, convulsao: false, avc: false,
            coag: false, apneia: false, refluxo: false, obesidade: false, marcapasso: false, gestante: false,
            hiv: false, neoplasia: false, psiq: false, detalhes_comorbidades: '',
            cirurgias: '', anestesias_previas: '', hist_fam: '', hm: '',
            tabagismo: 'Não', carga_tabagica: '', parou_fumo: '', etilismo: 'Não', drogas: 'Nega', mets: '',
            pa: '', fc: '', spo2: '', fr: '', temp: '', acv: '', ar: '', abdome: '', dorso: '', ef_outros: '',
            va_abertura: '', va_dtm: '', va_dem: '', va_cervical: '', va_protese: 'Não', va_cormack: '', va_dificil: '', va_obs: '',
            asa: '', asa_e: false,
            ex_hb: '', ex_ht: '', ex_plaq: '', ex_leuco: '', ex_inr: '', ex_ttpa: '', ex_glic: '', ex_hba1c: '',
            ex_ureia: '', ex_creat: '', ex_na: '', ex_k: '', ex_coagulo: '', ex_eco: '', ex_hepato: '', ex_outros_esp: '', ex_ecg: '', ex_rx: '', ex_outros: '', ex_obs: '',
            ex_data_lab: '', ex_data_cardio: '', ex_data_imagem: '',
            jejum_orientacao: '', profilaxia_asp: 'Não indicada',
            plan_tecnica: '', plan_via_aerea: '', plan_monitor: 'Básica (ECG, SpO2, PANI, Capno)', plan_acesso: 'Periférico 1 via',
            plan_hemoderivados: 'Não', plan_recusa_hemo: '', plan_destino: '', plan_obs: '',
            ...HEMO_REQUISICAO_VAZIA,
            mpa_ansio: 'Não prescrito', mpa_nvpo: 'Não indicada', mpa_atb: 'Não indicada', mpa_outras: '',
            parecer_obs: ''
        });
        setNegaAlergia(false); setAlergias([{ substancia: '', reacao: '' }]);
        setNegaMed(false); setMedicamentos([{ nome: '', dose: '', frequencia: '', conduta: '' }]);
        setMallampati(''); setParecer(''); setSearchTerm(''); setApaIdParaCarregar(null); setIsReadOnly(false);
        setModoVisao('formulario'); setActiveTab('dados');
    };

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

            // 5. Restaura o título e limpa a tela SOMENTE APÓS a impressão
            // No iOS/Safari mobile, window.print() não trava a thread!
            // Se limparmos imediatamente, ele gera um PDF em branco.
            let limpou = false;
            const limpar = () => {
                if (limpou) return;
                limpou = true;
                document.title = tituloOriginal;
                setApaParaImprimir(null);
                window.removeEventListener('afterprint', limpar);
                window.removeEventListener('focus', limpar);
            };

            window.addEventListener('afterprint', limpar);
            window.addEventListener('focus', limpar); // fallback para iOS que as vezes usa focus
            
            // Fallback total se os eventos falharem
            setTimeout(limpar, 60000);

        }, 800); // Aumentei o delay para 800ms para garantir renderização do Portal no celular
    };

    const handleVerPreviewPdf = async (apaResumo) => {
        try {
            const { data, error } = await supabase.from('apas').select('*').eq('id', apaResumo.id).single();
            if (error) throw error;
            setApaParaImprimir(data);
            setModoVisao('preview');
        } catch (error) {
            console.error(error);
            toast.error("Erro ao carregar dados completos para impressão.");
        }
    };

    const handleDuplicarApa = async (apaBase) => {
        const loadingToast = toast.loading("Carregando prontuário completo...");
        try {
            const { data: apaCompleta, error } = await supabase.from('apas').select('*').eq('id', apaBase.id).single();
            if (error) throw error;
            
            const fData = { ...defaultFormData, ...apaCompleta, id: undefined, dataRegistro: undefined, dataAtualizacao: undefined, exames_url: undefined };
            Object.keys(fData).forEach(key => { if (fData[key] === null) fData[key] = ''; });
            
            fData.dataProcedimento = new Date().toISOString().split('T')[0];
            delete fData.alergias; delete fData.medicamentos; delete fData.negaAlergia; delete fData.negaMed; delete fData.mallampati; delete fData.parecerFinal;
            if (apaCompleta.comorbidadesList && Array.isArray(apaCompleta.comorbidadesList)) { apaCompleta.comorbidadesList.forEach(k => { fData[k] = true; }); }
            setFormData(prev => ({ ...prev, ...fData }));
            
            let loadedAlergias = []; try { loadedAlergias = typeof apaCompleta.alergias === 'string' ? JSON.parse(apaCompleta.alergias) : apaCompleta.alergias; } catch(e) {}
            let loadedMedicamentos = []; try { loadedMedicamentos = typeof apaCompleta.medicamentos === 'string' ? JSON.parse(apaCompleta.medicamentos) : apaCompleta.medicamentos; } catch(e) {}
            
            setNegaAlergia(apaCompleta.negaAlergia !== undefined ? apaCompleta.negaAlergia : false);
            setAlergias((loadedAlergias && loadedAlergias.length > 0) ? loadedAlergias : [{ substancia: '', reacao: '' }]);
            
            setNegaMed(apaCompleta.negaMed !== undefined ? apaCompleta.negaMed : false);
            setMedicamentos((loadedMedicamentos && loadedMedicamentos.length > 0) ? loadedMedicamentos : [{ nome: '', dose: '', frequencia: '', conduta: '' }]);
            
            setMallampati(apaCompleta.mallampati || '');
            setParecer(apaCompleta.parecerFinal || '');
            setSearchTerm(apaCompleta.nome || '');
            
            setApaIdParaCarregar(null);
            setIsReadOnly(false);
            setModoVisao('formulario');
            setActiveTab('dados');
            
            toast.dismiss(loadingToast);
            toast.success("APA Duplicada! Ajuste o que for necessário e clique em Salvar.", { duration: 4500 });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            console.error(error);
            toast.dismiss(loadingToast);
            toast.error("Erro ao carregar os dados para duplicação.");
        }
    };

    const handleExcluirApa = async (id, permanente = false) => {
        const msg = permanente 
            ? 'Excluir PERMANENTEMENTE esta avaliação? Ela não poderá ser recuperada!'
            : 'Mover esta avaliação para a lixeira?';

        if (window.confirm(msg)) {
            try {
                const apa = listaApas.find(a => a.id === id);
                if (permanente) {
                    const { error } = await supabase.from('apas').delete().eq('id', id);
                    if (error) throw error;
                    await logAction('EXCLUSÃO DE APA', `APA do paciente ${apa?.nome || 'Desconhecido'} excluída definitivamente.`);
                    toast.success('Excluída permanentemente!');
                } else {
                    const { error } = await supabase.from('apas').update({ deleted_at: new Date().toISOString() }).eq('id', id);
                    if (error) throw error;
                    await logAction('LIXEIRA DE APA', `APA do paciente ${apa?.nome || 'Desconhecido'} movida para a lixeira.`);
                    toast.success('Movida para a lixeira!');
                }
                loadApasList();
            }
            catch (error) { 
                console.error(error);
                toast.error("Erro ao excluir. Verifique se a coluna 'deleted_at' foi criada."); 
            }
        }
    };

    const handleRestaurarApa = async (id) => {
        if (window.confirm('Restaurar esta avaliação da lixeira?')) {
            try {
                const apa = listaApas.find(a => a.id === id);
                const { error } = await supabase.from('apas').update({ deleted_at: null }).eq('id', id);
                if (error) throw error;
                await logAction('RESTAURAÇÃO DE APA', `APA do paciente ${apa?.nome || 'Desconhecido'} foi restaurada da lixeira.`);
                toast.success('APA Restaurada!');
                loadApasList();
            }
            catch (error) { toast.error("Erro ao restaurar."); }
        }
    };

    const handleSalvarApa = async () => {
        if (isSaving) return;

        if (!unidadeAtual) return toast.error("Ação Bloqueada: Selecione o Local de Atendimento antes de salvar.");
        if (!formData.nome) return toast.error("Selecione um paciente antes de salvar.");
        if (!formData.dataNasc) return toast.error("A Data de Nascimento é obrigatória.");
        
        const idadeStr = calcularIdade(formData.dataNasc);
        const idadeInt = parseInt(idadeStr);
        if (!isNaN(idadeInt) && idadeInt < 18) {
            if (!formData.resp_nome) return toast.error("Obrigatório: Nome do Responsável Legal (paciente menor de idade).");
            if (!formData.resp_cpf) return toast.error("Obrigatório: CPF do Responsável Legal (paciente menor de idade).");
            if (!formData.resp_parentesco) return toast.error("Obrigatório: Grau de Parentesco (paciente menor de idade).");
        }

        if (!formData.pacienteInapto) {
            if (!formData.sexo) return toast.error("O Sexo é obrigatório.");
            if (!formData.peso) return toast.error("O Peso é obrigatório.");
            if (!formData.altura) return toast.error("A Altura é obrigatória.");
            if (!formData.procedimento) return toast.error("O Procedimento Cirúrgico é obrigatório.");
            if (!formData.carater) return toast.error("O Caráter é obrigatório.");

            // Validação de Alergias
            if (!negaAlergia && alergias.filter(a => a.substancia && a.substancia.trim() !== '').length === 0) {
                return toast.error("Obrigatório: Marque 'Nega alergias' ou descreva as substâncias.");
            }

            // Validação de Medicamentos (Conduta)
            const medsPreenchidos = medicamentos.filter(m => m.nome && m.nome.trim() !== '');
            if (medsPreenchidos.some(m => !m.conduta || m.conduta.trim() === '')) {
                return toast.error("Obrigatório: Defina a Conduta (Manter ou Suspender) para cada medicamento inserido em uso.");
            }

            // Validação de Novos Campos Obrigatórios
            if (!mallampati) return toast.error("Obrigatório: Preencha a Avaliação da Via Aérea (Mallampati).");
            if (!formData.va_dificil) return toast.error("Obrigatório: Informe se há previsão de Via Aérea Difícil.");
            if (!formData.asa) return toast.error("Obrigatório: Selecione a Classificação ASA.");
            if (!formData.plan_tecnica) return toast.error("Obrigatório: Selecione a Técnica Anestésica Prevista.");
            // Para menor a resposta é sempre "Não" e a tela não oferece alternativa:
            // exigir o clique seria pedir para confirmar o óbvio.
            if (!pacienteEhMenor && !formData.plan_recusa_hemo) return toast.error("Obrigatório: Informe se há Protocolo de Recusa de Hemotransfusão.");
            if (!formData.plan_destino) return toast.error("Obrigatório: Informe o Destino Pós-Op Previsto.");
            if (!parecer) return toast.error("Obrigatório: Assinale o Parecer Anestésico final (Apto/Restrição/Inapto).");
            
            if ((parecer === 'Restricao' || parecer === 'Inapto') && !formData.parecer_obs?.trim()) {
                return toast.error("Obrigatório: Justificativas/Recomendações finais são obrigatórias quando o parecer for APTO C/ RESTRIÇÕES ou INAPTO.");
            }
        }

        setIsSaving(true);

        // 1. DADOS DE SEGURANÇA BÁSICOS (Login Auth)
        let nomeMedico = user?.nome || user?.displayName || user?.name || '';
        let crmMedico = user?.crm || '';
        let rqeMedico = user?.rqe || '';
        let sexoMedico = user?.sexo || ''; // <-- NOVO: Preparando a variável
        let idMedico = user?.uid || user?.id || '';

        // 2. BUSCA FORÇADA NO BANCO DE DADOS
        if (idMedico) {
            try {
                const { data: userData, error: userError } = await supabase.from('users').select('*').eq('id', idMedico).maybeSingle();
                if (userData) {
                    nomeMedico = userData.nome || userData.name || nomeMedico;
                    crmMedico = userData.crm || crmMedico;
                    rqeMedico = userData.rqe || rqeMedico;
                    sexoMedico = userData.sexo || sexoMedico; // <-- NOVO: Puxando do banco
                }
            } catch (error) {
                console.error("Erro ao buscar dados reais do médico no banco:", error);
            }
        }

        // 3. MONTA A APA COM OS DADOS REAIS CARIMBADOS E EMPACOTADOS
        const keysComorb = ['has', 'dm', 'cardio', 'arritmia', 'icc', 'iam', 'asma', 'dpoc', 'pneumo', 'renal', 'hepato', 'tireo', 'neuro', 'convulsao', 'avc', 'coag', 'apneia', 'refluxo', 'obesidade', 'marcapasso', 'gestante', 'hiv', 'neoplasia', 'psiq'];
        const comorbidadesListPayload = keysComorb.filter(k => formData[k]);

        // Menor de idade não recusa hemotransfusão (a tela nem oferece a opção);
        // se a data de nascimento foi corrigida depois de marcada, cai aqui.
        const recusaNormalizada = pacienteEhMenor ? 'Não' : formData.plan_recusa_hemo;

        let apaCompleta = {
            ...formData,
            plan_recusa_hemo: recusaNormalizada,
            idadeInfo: calcularIdade(formData.dataNasc),
            imc: imcData?.valor || '',
            comorbidadesList: comorbidadesListPayload,
            mallampati, parecerFinal: parecer,
            negaAlergia, 
            alergias: negaAlergia ? JSON.stringify([]) : JSON.stringify(alergias),
            negaMed, 
            medicamentos: negaMed ? JSON.stringify([]) : JSON.stringify(medicamentos),
            anestesistaNome: nomeMedico,
            anestesistaCRM: crmMedico,
            anestesistaRQE: rqeMedico,
            anestesistaSexo: sexoMedico, // <-- NOVO: Salvando na APA
            anestesistaId: idMedico,
            unidade: unidadeAtual // <-- NOVO: Salva a unidade em que foi criada
        };

        // Prevenção de erro de Sintaxe no Postgres (Date column com string vazia)
        if (!apaCompleta.dataNasc || String(apaCompleta.dataNasc).trim() === '') {
            apaCompleta.dataNasc = null;
        }
        if (!apaCompleta.dataProcedimento || String(apaCompleta.dataProcedimento).trim() === '') {
            apaCompleta.dataProcedimento = null;
        }
        if (!apaCompleta.ex_data_lab || String(apaCompleta.ex_data_lab).trim() === '') {
            apaCompleta.ex_data_lab = null;
        }
        if (!apaCompleta.ex_data_cardio || String(apaCompleta.ex_data_cardio).trim() === '') {
            apaCompleta.ex_data_cardio = null;
        }
        if (!apaCompleta.ex_data_imagem || String(apaCompleta.ex_data_imagem).trim() === '') {
            apaCompleta.ex_data_imagem = null;
        }

        // Prevenção de erro de Sintaxe no Postgres (UUID column com string vazia)
        if (apaCompleta.pacienteId === '') {
            apaCompleta.pacienteId = null;
        }
        if (apaCompleta.anestesistaId === '') {
            apaCompleta.anestesistaId = null;
        }

        // Prevenção de erro de Sintaxe no Postgres (Boolean column com string vazia)
        if (apaCompleta.pacienteInapto === '') {
            apaCompleta.pacienteInapto = false;
        }
        if (apaCompleta.asa_e === '') {
            apaCompleta.asa_e = false;
        }

        // Removendo campos "fantasmas" que não têm input na interface atual
        delete apaCompleta.dorso;
        delete apaCompleta.ef_outros;
        delete apaCompleta.hist_fam;
        


        // Limpeza de chaves de sistema e controle para evitar Rest API Errors (not-null constraint id / missing schema info)
        delete apaCompleta.id;
        delete apaCompleta.dataRegistro;
        delete apaCompleta.dataAtualizacao;
        delete apaCompleta.dataAvaliacao;
        delete apaCompleta.createdAt;
        delete apaCompleta.deleted_at;
        delete apaCompleta.idadeInfo;
        delete apaCompleta.imc;

        // Remove boolean flags individually because they are now encoded in comorbidadesList array
        keysComorb.forEach(k => delete apaCompleta[k]);

        console.log("Médico sendo salvo:", nomeMedico, "- CRM:", crmMedico);

        try {
            let finalExamesUrl = formData.exames_url || null;

            if (exameFileToUpload) {
                const toastId = toast.loading("Fazendo upload do PDF do exame...");
                const fileExt = exameFileToUpload.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

                let prontoParaSubir = null;
                try {
                    prontoParaSubir = await prepararArquivo(exameFileToUpload, { maxMB: 20 });
                } catch (erroArquivo) {
                    toast.error(erroArquivo.message, { id: toastId });
                }

                if (prontoParaSubir) {
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('exames')
                        .upload(fileName, prontoParaSubir);

                    if (uploadError) {
                        toast.error("Falha ao fazer upload do PDF, mas a APA será salva.", { id: toastId });
                        console.error("Erro no upload:", uploadError);
                    } else {
                        // Bucket privado: guarda o caminho. Exame de paciente não
                        // pode ficar com link público e eterno.
                        finalExamesUrl = uploadData.path;
                        toast.success("Upload de exame concluído!", { id: toastId });
                    }
                }
            }

            apaCompleta.exames_url = finalExamesUrl;

            if (apaIdParaCarregar) {
                // Atualiza APA existente
                const { error } = await supabase.from('apas').update({ ...apaCompleta, dataAtualizacao: new Date().toISOString() }).eq('id', apaIdParaCarregar);
                if (error) throw error;
                await logAction('EDIÇÃO DE APA', `APA do paciente ${apaCompleta.nome || 'Desconhecido'} atualizada.`);
                sessionStorage.removeItem('apa_draft_state');
                toast.success("APA atualizada!");
                setModoVisao('lista');
                loadApasList();
                handleVisualizarPdf(apaCompleta);
            } else {
                // Salva nova APA
                const { error } = await supabase.from('apas').insert([{ ...apaCompleta, dataRegistro: new Date().toISOString() }]);
                if (error) throw error;
                await logAction('CRIAÇÃO DE APA', `APA criada para o paciente ${apaCompleta.nome || 'Desconhecido'}.`);
                sessionStorage.removeItem('apa_draft_state');
                toast.success("APA salva!");
                setModoVisao('lista');
                loadApasList();
                // Injeta a data atual provisória apenas para a tela de PDF não mostrar em branco enquanto salva no banco
                handleVisualizarPdf({ ...apaCompleta, dataRegistro: new Date() });
            }
        } catch (err) {
            console.error(err);
            toast.error("Erro BD: " + (err?.message || err?.details || JSON.stringify(err)));
        } finally {
            setIsSaving(false);
        }
    };

    const handleGeneratePDF = () => {
        const keysComorb = ['has', 'dm', 'cardio', 'arritmia', 'icc', 'iam', 'asma', 'dpoc', 'pneumo', 'renal', 'hepato', 'tireo', 'neuro', 'convulsao', 'avc', 'coag', 'apneia', 'refluxo', 'obesidade', 'marcapasso', 'gestante', 'hiv', 'neoplasia', 'psiq'];
        const comorbidadesListPayload = keysComorb.filter(k => formData[k]);

        handleVisualizarPdf({
            ...formData,
            idadeInfo: calcularIdade(formData.dataNasc),
            imc: imcData?.valor || '',
            comorbidadesList: comorbidadesListPayload,
            mallampati, parecerFinal: parecer,
            negaAlergia, alergias,
            negaMed, medicamentos
        });
    };

    const handleAiUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 8 * 1024 * 1024) {
            toast.error("O arquivo deve ter no máximo 8MB");
            return;
        }

        setIsAiLoading(true);
        let loadingToast = toast.loading("Lendo exame com IA...");

        try {
            const base64String = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result.toString().split(',')[1]);
                reader.onerror = error => reject(error);
            });

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) throw new Error("Chave VITE_GEMINI_API_KEY não configurada no .env");

            const mimeType = file.type === "application/pdf" ? "application/pdf" : (file.type.startsWith("image/") ? file.type : "application/pdf");
            
            const fileUrl = URL.createObjectURL(file);
            setAiValidationFileUrl({ url: fileUrl, type: mimeType });
            setPendingExameFile(file);

            const prompt = `Você é um assistente médico especialista.
Leia este exame e extraia os seguintes valores pontuais.
Retorne EXATAMENTE UM JSON válido, sem \`\`\`json, apenas chaves e valores literais.
Chaves obrigatórias (se não achar algo no texto, retorne string vazia ""):
"ex_hb": (Hemoglobina - apenas numero)
"ex_ht": (Hematócrito - apenas numero)
"ex_plaq": (Plaquetas - multiplique por mil p/ ser exato se for abreviado. Ex: 246 => 246.000)
"ex_leuco": (Leucócitos - apenas numero)
"ex_inr": (TAP / INR)
"ex_ttpa": (TTPA / RNI)
"ex_glic": (Glicemia de jejum)
"ex_hba1c": (HbA1c)
"ex_ureia": (Ureia)
"ex_creat": (Creatinina)
"ex_na": (Sódio)
"ex_k": (Potássio)
"ex_ecg": (Eletrocardiograma - laudo ex: Ritmo Sinusal)
"ex_rx": (Raio-X Tórax - conclusão)
"ex_eco": (Ecocardiograma - conclusão)
"ex_hepato": (Função Hepática TGO/TGP - sumarizado)
"ex_coagulo": (Coagulograma - apenas se tiver algo digno de nota, ou vazio)
"ex_outros_esp": (Outros exames achados ex: TSH)

Responda SOMENTE o bloco JSON.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64String } }] }]
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            let resultText = data.candidates[0].content.parts[0].text;
            resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            const extracted = JSON.parse(resultText);
            setAiValidationData(extracted);
            toast.success("Leitura concluída! Confirme os dados lidos.", { id: loadingToast });
        } catch (error) {
            console.error(error);
            toast.error("Erro na IA: " + error.message, { id: loadingToast });
        } finally {
            setIsAiLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleChange = (e) => {
        let { name, type, checked, value } = e.target;
        if (name === 'cpf' || name === 'resp_cpf') value = maskCPF(value);
        if (name === 'telefone') value = maskTelefone(value);
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    // Recusa de hemotransfusão e reserva de hemoderivados não convivem: quando há
    // protocolo de recusa, a reserva fica travada em "Não".
    const recusaHemoAtiva = formData.plan_recusa_hemo === 'Sim';
    const procEspSelecionados = listaProcEspeciais(formData.plan_hemo_esp);
    const alternarProcEspecial = (proc) => {
        setFormData(prev => {
            const atuais = listaProcEspeciais(prev.plan_hemo_esp);
            return { ...prev, plan_hemo_esp: atuais.includes(proc) ? atuais.filter(p => p !== proc) : [...atuais, proc] };
        });
    };

    const calcularIdade = (dataNasc) => {
        if (!dataNasc) return '--';
        const hoje = new Date(); const nasc = new Date(dataNasc);
        let idade = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
        return idade + " anos";
    };

    // Recusa de hemotransfusão é ato de adulto capaz: pelas normas atuais do STF,
    // menor de idade não recusa (a decisão é do responsável legal e não gera
    // termo de recusa). Então a opção nem aparece para menor.
    const pacienteEhMenor = (() => {
        const anos = parseInt(calcularIdade(formData.dataNasc), 10);
        return !isNaN(anos) && anos < 18;
    })();

    const imcData = useMemo(() => {
        const p = parseFloat(formData.peso), a = parseFloat(formData.altura) / 100;
        if (p > 0 && a > 0) {
            const imc = parseFloat((p / (a * a)).toFixed(1));
            let label = "";
            let color = "";
            if (imc < 18.5) { label = "Abaixo"; color = "text-amber-700 bg-amber-100 border-l border-amber-200"; }
            else if (imc < 25) { label = "Normal"; color = "text-emerald-700 bg-emerald-100 border-l border-emerald-200"; }
            else if (imc < 30) { label = "Sobrepeso"; color = "text-orange-700 bg-orange-100 border-l border-orange-200"; }
            else if (imc < 35) { label = "Obeso I"; color = "text-rose-600 bg-rose-500/20 border-l border-rose-100"; }
            else if (imc < 40) { label = "Obeso II"; color = "text-rose-700 bg-rose-100 border-l border-rose-200"; }
            else { label = "Obeso III"; color = "text-rose-800 bg-rose-200 border-l border-rose-300"; }
            return { value: imc, label, color };
        }
        return { value: '--', label: '', color: '' };
    }, [formData.peso, formData.altura]);

    // --- Conduta pré-operatória de medicamentos ---------------------------------
    useEffect(() => {
        let ativo = true;
        carregarRegrasAtivas()
            .then(regras => { if (ativo) setRegrasMedicamento(regras); })
            .catch(() => { /* degradação limpa: a APA segue sem os alertas */ });
        carregarTextosExame()
            .then(textos => { if (ativo) setTextosExamePadrao(textos); })
            .catch(() => { /* mantém os laudos padrão de fábrica */ });
        return () => { ativo = false; };
    }, []);

    const contextoConduta = useMemo(() => {
        const idade = parseInt(calcularIdade(formData.dataNasc), 10);
        return {
            temNeuroeixo: planoTemNeuroeixo(formData.plan_tecnica),
            clcr: calcularClCr({
                idade: Number.isFinite(idade) ? idade : null,
                peso: formData.peso,
                creatinina: formData.ex_creat,
                sexo: formData.sexo
            })
        };
    }, [formData.plan_tecnica, formData.dataNasc, formData.peso, formData.ex_creat, formData.sexo]);

    const avaliacaoMedicamentos = useMemo(() => {
        if (negaMed || regrasMedicamento.length === 0) {
            return { linhas: [], totalAlertas: 0, totalAltos: 0, totalOcultos: 0 };
        }
        return avaliarMedicamentos(medicamentos, regrasMedicamento, contextoConduta);
    }, [medicamentos, regrasMedicamento, contextoConduta, negaMed]);

    const uniqueProcedimentos = useMemo(() => {
        const procs = new Set();
        listaApas.forEach(apa => {
            if (apa.procedimento) procs.add(apa.procedimento.trim().toUpperCase());
        });
        return Array.from(procs).sort();
    }, [listaApas]);

    const filteredApasList = listaApas.filter(apa => {
        const term = searchApa.toLowerCase();
        const matchesSearch = (apa.nome?.toLowerCase().includes(term) || apa.cpf?.includes(term) || apa.procedimento?.toLowerCase().includes(term));
        const matchesStatus = filterStatus === 'Todos' ||
            (filterStatus === 'Apto' && apa.parecerFinal === 'Apto') ||
            (filterStatus === 'Restricao' && (apa.parecerFinal === 'Restricao' || apa.parecerFinal === 'Apto com restrições')) ||
            (filterStatus === 'Inapto' && apa.parecerFinal === 'Inapto');

        const procUpper = apa.procedimento ? apa.procedimento.trim().toUpperCase() : '';
        const matchesProc = filterProcedimento === 'Todos' || procUpper === filterProcedimento;

        let matchesData = true;
        if (filterDataInicio || filterDataFim) {
            const apaDateStr = apa.dataRegistro ? apa.dataRegistro.split('T')[0] : '';
            if (apaDateStr) {
                if (filterDataInicio && apaDateStr < filterDataInicio) matchesData = false;
                if (filterDataFim && apaDateStr > filterDataFim) matchesData = false;
            } else {
                matchesData = false;
            }
        }

        return matchesSearch && matchesStatus && matchesProc && matchesData;
    });

    const filteredPacientes = pacientes.filter(p => p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) || p.cpf?.includes(searchTerm)).slice(0, 10);

    const comorbidadesList = [
        { key: 'has', label: 'Hipertensão Arterial' }, { key: 'dm', label: 'Diabetes Mellitus' }, { key: 'cardio', label: 'Cardiopatia' },
        { key: 'arritmia', label: 'Arritmia' }, { key: 'icc', label: 'ICC' }, { key: 'iam', label: 'IAM prévio' },
        { key: 'asma', label: 'Asma' }, { key: 'dpoc', label: 'DPOC' }, { key: 'pneumo', label: 'Outra Pneumopatia' },
        { key: 'renal', label: 'Nefropatia' }, { key: 'hepato', label: 'Hepatopatia' }, { key: 'tireo', label: 'Tireopatia' },
        { key: 'neuro', label: 'Doença Neurológica' }, { key: 'convulsao', label: 'Epilepsia' }, { key: 'avc', label: 'AVC prévio' },
        { key: 'coag', label: 'Coagulopatia' }, { key: 'apneia', label: 'Apneia' }, { key: 'refluxo', label: 'DRGE / Refluxo' },
        { key: 'obesidade', label: 'Obesidade Mórbida' }, { key: 'marcapasso', label: 'Marca-passo / CDI' }, { key: 'gestante', label: 'Gestante' },
        { key: 'hiv', label: 'HIV / Imunossupressão' }, { key: 'neoplasia', label: 'Neoplasia' }, { key: 'psiq', label: 'Doença Psiquiátrica' }
    ];

    const updateArray = (arr, setter, idx, field, val) => {
        const newArr = [...arr]; newArr[idx][field] = val; setter(newArr);
    };
    const removeArray = (arr, setter, idx, emptyObj) => {
        if (arr.length > 1) setter(arr.filter((_, i) => i !== idx)); else setter([emptyObj]);
    };

    const tabs = [
        { id: 'dados', label: 'Identificação do paciente', icon: <User size={18} /> },
        { id: 'historico', label: 'Histórico Clínico', icon: <Stethoscope size={18} /> },
        { id: 'exame', label: 'Exame Físico', icon: <Activity size={18} /> },
        { id: 'exames', label: 'Exames e Jejum', icon: <FileText size={18} /> },
        { id: 'plano', label: 'Parecer Anestésico', icon: <CheckSquare size={18} /> },
    ];

    const validateCurrentTab = () => {
        if (formData.pacienteInapto) return null;
        if (activeTab === 'dados') {
            if (!formData.nome) return "Selecione um paciente.";
            if (!formData.dataNasc) return "A Data de Nascimento é obrigatória.";
            if (!formData.sexo) return "O Sexo é obrigatório.";
            if (!formData.peso) return "O Peso é obrigatório.";
            if (!formData.altura) return "A Altura é obrigatória.";
            if (!formData.procedimento) return "O Procedimento Cirúrgico é obrigatório.";
            if (!formData.carater) return "O Caráter é obrigatório.";
        }
        if (activeTab === 'historico') {
            if (!negaAlergia && (!alergias || alergias.length === 0 || !alergias[0].substancia)) return "Marque 'Nega alergias' ou descreva pelo menos uma substância.";
            if (!negaMed && (!medicamentos || medicamentos.length === 0 || !medicamentos[0].nome || !medicamentos[0].conduta)) return "Preencha Medicamento e Conduta, ou marque 'Nega uso de medicamentos'.";
            if (!formData.tabagismo) return "O status de Tabagismo é obrigatório.";
        }
        if (activeTab === 'exame') {
            if (!mallampati) return "A Classificação de Mallampati é obrigatória.";
            if (!formData.va_dificil) return "Informe se há previsão de Via Aérea Difícil.";
        }
        if (activeTab === 'exames') {
            if (!formData.asa) return "A Classificação ASA é obrigatória.";
        }
        if (activeTab === 'plano') {
            if (!formData.plan_tecnica) return "A Técnica Anestésica é obrigatória.";
            if (!formData.plan_destino) return "O Destino Pós-Op é obrigatório.";
            if (!parecer) return "O Parecer Anestésico é obrigatório.";
            if ((parecer === 'Restricao' || parecer === 'Inapto') && !formData.parecer_obs?.trim()) {
                return "Justificativas/Recomendações finais são obrigatórias quando o parecer for APTO C/ RESTRIÇÕES ou INAPTO.";
            }
        }
        return null;
    };

    const handleTabNavigation = (targetTabId) => {
        if (isReadOnly) {
            setActiveTab(targetTabId);
            return;
        }

        const currentIndex = tabs.findIndex(t => t.id === activeTab);
        const targetIndex = tabs.findIndex(t => t.id === targetTabId);

        if (targetIndex > currentIndex) {
            const erro = validateCurrentTab();
            if (erro) {
                toast.error(`Atenção: ${erro}`);
                return;
            }
        }
        setActiveTab(targetTabId);
    };

    const handleDownloadPDF = () => {
        const element = document.getElementById('apa-pdf-document');
        const opt = {
            margin: [5, 0, 5, 0],
            filename: `APA_${apaParaVisualizar?.nome || 'Paciente'}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                onclone: (document) => {
                    const el = document.getElementById('apa-pdf-document');
                    if (el) el.classList.add('pdf-export-mode');
                }
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: 'css', avoid: '.apa-section-block, .sig-grid' }
        };
        html2pdf().set(opt).from(element).save();
    };

    if (!unidadeAtual) {
        return <UnitPrompt />;
    }

    return (
        <div className="py-4 px-2 sm:px-4 font-sans animate-in fade-in duration-700 w-full min-h-full bg-slate-50/30">
            <div className="max-w-[1600px] mx-auto space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/60 backdrop-blur-2xl p-4 sm:p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white">
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
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0"><Activity size={20} /></div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 drop-shadow-none">
                                {modoVisao === 'lista' ? 'Avaliações Pré-Anestésicas' : modoVisao === 'preview' ? 'Documento APA' : (isReadOnly ? 'Visualizando APA' : 'Nova APA')}
                            </h1>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                {modoVisao === 'lista' ? 'Gestão do histórico de avaliações' : modoVisao === 'preview' ? 'Pré-visualização para impressão' : 'Preencha os dados do paciente'}
                            </p>
                        </div>
                    </div>
                    {modoVisao === 'lista' ? (
                        hasPermission('Criar/Editar APA') && (
                            <button onClick={handleNovaApa} className="bg-white/80 hover:bg-white text-blue-600 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-all">
                                <Plus size={18} /> Nova Avaliação
                            </button>
                        )
                    ) : modoVisao === 'preview' ? (
                        null /* Actions are displayed inside the preview container */
                    ) : (
                        <div className="flex items-center gap-3">
                            <button onClick={() => setModoVisao('lista')} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 transition-colors">
                                Cancelar
                            </button>
                            {isReadOnly && hasPermission('Imprimir Documentos') && (
                                <button type="button" onClick={handleGeneratePDF} className="text-sm flex items-center gap-1.5 border border-white/80 bg-white/60 text-slate-700 px-3 py-1.5 rounded-md hover:bg-white/60 transition-colors">
                                    <Printer size={16} /> Imprimir PDF
                                </button>
                            )}
                            {!isReadOnly && (
                                <button disabled={isSaving} onClick={handleSalvarApa} className="text-sm flex items-center gap-1.5 bg-slate-800 text-white px-4 py-1.5 rounded-md hover:bg-slate-900 font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {isSaving ? "Salvando..." : "Salvar e Imprimir"}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {modoVisao === 'preview' && apaParaImprimir ? (
                    <div className="max-w-4xl mx-auto pb-20 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex flex-wrap gap-4 justify-between items-center mb-6 bg-white/60 backdrop-blur-2xl p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white">
                            <button onClick={() => { setModoVisao('lista'); setApaParaImprimir(null); }} className="text-sm font-bold text-slate-600 hover:text-blue-600 flex items-center gap-2 transition-colors">
                                <ArrowLeft size={16} /> Voltar à Lista
                            </button>
                            {hasPermission('Imprimir Documentos') && (
                                <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all">
                                    <Printer size={16} /> Imprimir / Salvar
                                </button>
                            )}
                            {apaParaImprimir?.exames_url && (
                                <button onClick={() => abrirArquivo(apaParaImprimir.exames_url, 'exames')} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ml-2">
                                    <FileText size={16} /> Ver Exame Original
                                </button>
                            )}
                        </div>
                        <div className="w-full overflow-x-auto pb-8 custom-scrollbar">
                            <div className="bg-white shadow-xl mb-8 mx-auto print:shadow-none print:m-0 shrink-0" style={{ width: '210mm', minHeight: '297mm', padding: '15mm' }}>
                                <ApaPrintTemplate data={apaParaImprimir} />
                            </div>
                        </div>
                    </div>
                ) : modoVisao === 'lista' ? (
                    <div className="space-y-6 print:hidden animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
                        {/* iOS Spotlight Search & Filters */}
                        <div className="flex flex-col gap-3 w-full">
                            <div className="flex flex-col 2xl:flex-row gap-3 w-full items-start 2xl:items-center">
                                <div className="relative group flex-1 w-full">
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                        <Search className="text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                                    </div>
                                    <input 
                                        type="text" 
                                        placeholder="Buscar paciente por nome ou CPF..." 
                                        value={searchApa} 
                                        onChange={e => setSearchApa(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-white/60 backdrop-blur-3xl border border-white rounded-[1rem] text-base font-bold text-slate-900 drop-shadow-none placeholder-slate-400 focus:bg-white/80 focus:outline-none focus:ring-4 focus:ring-blue-500/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300"
                                    />
                                </div>
                                <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 w-full 2xl:w-auto shrink-0">
                                    <div className="relative flex-1 md:w-48 xl:w-48 shrink-0">
                                        <select 
                                            value={filterStatus}
                                            onChange={e => setFilterStatus(e.target.value)}
                                            className="w-full px-4 py-3 appearance-none bg-white/60 backdrop-blur-3xl border border-white rounded-[1rem] text-sm font-bold text-slate-600 focus:bg-white/80 focus:outline-none focus:ring-4 focus:ring-blue-500/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300 cursor-pointer"
                                        >
                                            <option value="Todos">Todos os Pareceres</option>
                                            <option value="Apto">Apto</option>
                                            <option value="Restricao">Apto c/ Restrição</option>
                                            <option value="Inapto">Inapto</option>
                                        </select>
                                        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                            <ChevronDown className="text-slate-500" size={16} />
                                        </div>
                                    </div>
                                    <div className="relative w-[48%] md:w-36 xl:w-36 shrink-0">
                                        <input 
                                            type="date" 
                                            value={filterDataInicio}
                                            onChange={e => setFilterDataInicio(e.target.value)}
                                            className="w-full px-3 py-3 bg-white/60 backdrop-blur-3xl border border-white rounded-[1rem] text-sm font-bold text-slate-600 focus:bg-white/80 focus:outline-none focus:ring-4 focus:ring-blue-500/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300 cursor-pointer"
                                        />
                                        <span className="absolute -top-2 left-4 text-[10px] font-black text-blue-600 px-1 bg-white/90 backdrop-blur-sm rounded uppercase tracking-widest pointer-events-none">Data Início</span>
                                    </div>
                                    <div className="relative w-[48%] md:w-36 xl:w-36 shrink-0">
                                        <input 
                                            type="date" 
                                            value={filterDataFim}
                                            onChange={e => setFilterDataFim(e.target.value)}
                                            className="w-full px-3 py-3 bg-white/60 backdrop-blur-3xl border border-white rounded-[1rem] text-sm font-bold text-slate-600 focus:bg-white/80 focus:outline-none focus:ring-4 focus:ring-blue-500/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300 cursor-pointer"
                                        />
                                        <span className="absolute -top-2 left-4 text-[10px] font-black text-blue-600 px-1 bg-white/90 backdrop-blur-sm rounded uppercase tracking-widest pointer-events-none">Data Fim</span>
                                    </div>
                                    <div className="relative flex-1 md:w-48 xl:w-48 shrink-0">
                                        <select 
                                            value={filterProcedimento}
                                            onChange={e => setFilterProcedimento(e.target.value)}
                                            className="w-full px-4 py-3 appearance-none bg-white/60 backdrop-blur-3xl border border-white rounded-[1rem] text-sm font-bold text-slate-600 focus:bg-white/80 focus:outline-none focus:ring-4 focus:ring-blue-500/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300 cursor-pointer"
                                        >
                                            <option value="Todos">Todos os Procedimentos</option>
                                            {uniqueProcedimentos.map((proc, index) => (
                                                <option key={index} value={proc}>{proc}</option>
                                            ))}
                                        </select>
                                        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                            <ChevronDown className="text-slate-500" size={16} />
                                        </div>
                                    </div>
                                    {(searchApa || filterStatus !== 'Todos' || filterDataInicio || filterDataFim || filterProcedimento !== 'Todos') && (
                                        <div className="flex-1 md:w-auto flex items-center justify-end">
                                            <button 
                                                onClick={() => { setSearchApa(''); setFilterStatus('Todos'); setFilterDataInicio(''); setFilterDataFim(''); setFilterProcedimento('Todos'); }} 
                                                className="w-full md:w-auto px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-bold uppercase tracking-widest rounded-[1rem] border border-rose-200 transition-colors shadow-sm"
                                            >
                                                Limpar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Toggles (Mostrar todas as unidades e Lixeira) */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 px-2 py-1">
                                {podeVerTodasUnidades && (
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className="relative">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only" 
                                            checked={mostrarTodasUnidades}
                                            onChange={(e) => setMostrarTodasUnidades(e.target.checked)}
                                        />
                                        <div className={`block w-10 h-6 rounded-full transition-colors border border-slate-200 shadow-inner ${mostrarTodasUnidades ? 'bg-indigo-500 border-indigo-500' : 'bg-slate-200/60'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform ${mostrarTodasUnidades ? 'transform translate-x-4' : ''}`}></div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 group-hover:text-slate-700 transition-colors">
                                        <Globe size={14} className={mostrarTodasUnidades ? 'text-blue-500' : ''} />
                                        Buscar em todas as minhas unidades
                                    </div>
                                </label>
                                )}

                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className="relative">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only" 
                                            checked={mostrarLixeira}
                                            onChange={(e) => {
                                                setMostrarLixeira(e.target.checked);
                                                setPaginaAtual(1); // Voltar para a página 1 ao alternar
                                            }}
                                        />
                                        <div className={`block w-10 h-6 rounded-full transition-colors border border-slate-200 shadow-inner ${mostrarLixeira ? 'bg-rose-500 border-rose-500' : 'bg-slate-200/60'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform ${mostrarLixeira ? 'transform translate-x-4' : ''}`}></div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 group-hover:text-rose-600 transition-colors">
                                        <Trash2 size={14} className={mostrarLixeira ? 'text-rose-500' : ''} />
                                        Lixeira (Apagadas)
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Apple-style Data List */}
                        <div className="bg-white/80 backdrop-blur-3xl border border-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.05)] overflow-hidden">
                            {loadingApas ? (
                                <div className="py-24 flex flex-col items-center justify-center">
                                    <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Carregando Avaliações...</span>
                                </div>
                            ) : filteredApasList.length === 0 ? (
                                <div className="py-24 flex flex-col items-center justify-center text-slate-500">
                                    <div className="w-16 h-16 bg-white/70 rounded-full flex items-center justify-center mb-4">
                                        <FileText size={24} className="opacity-40" />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-widest">Nenhuma avaliação encontrada</span>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100/60 relative">
                                    {/* Header Row */}
                                    <div className="sticky top-0 z-20 px-3 md:px-6 py-3 md:py-4 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex items-center text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">
                                        <div className="w-16 md:w-20 pl-1 md:pl-2">Data</div>
                                        <div className="flex-[2]">Paciente</div>
                                        <div className="flex-[1] hidden lg:block">Unidade</div>
                                        <div className="w-32 lg:w-48 hidden lg:block">Médico</div>
                                        <div className="flex-[1] hidden md:block">Procedimento</div>
                                        <div className="w-16 text-center hidden md:block">ASA</div>
                                        <div className="w-20 md:w-28 text-center">Parecer</div>
                                        <div className="w-[80px] md:w-[190px] text-right pr-2 md:pr-4">Ações</div>
                                    </div>
                                    
                                    {/* List Items */}
                                    {filteredApasList.map((apa, index) => (
                                        <div key={apa.id} className="group relative flex items-center px-3 md:px-6 py-3 md:py-4 hover:bg-slate-50/60 transition-all duration-200 cursor-default border-b border-slate-100/60 last:border-b-0" style={{ zIndex: openActionApaId === apa.id ? 50 : 1 }}>
                                            {/* Accent Left Bar on Hover */}
                                            <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500/20 rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            
                                            {/* Data */}
                                            <div className="w-16 md:w-20 pl-1 md:pl-2 text-[11px] md:text-[13px] font-bold text-slate-500 tracking-wide">
                                                {apa.dataRegistro ? new Date(apa.dataRegistro).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '--'}
                                            </div>
                                            
                                            {/* Paciente */}
                                            <div className="flex-[2] min-w-0 pr-4">
                                                <div className="text-sm md:text-base font-bold text-slate-900 drop-shadow-none truncate tracking-normal group-hover:text-blue-700 transition-colors">{capitalizeName(apa.nome)}</div>
                                                {apa.anestesistaNome && (
                                                    <div className="lg:hidden text-[11px] md:text-xs font-bold text-slate-500 truncate mt-0.5" title={apa.anestesistaNome}>
                                                        {capitalizeName(`${getDoctorPrefix(apa.anestesistaNome, apa.anestesistaSexo)} ${apa.anestesistaNome.split(' ')[0]}`)}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Unidade */}
                                            <div className="flex-[1] hidden lg:flex items-center gap-2 pr-4 min-w-0">
                                                <div className="flex-1 min-w-0 text-xs md:text-sm font-bold text-slate-500 truncate mt-0.5" title={apa.unidade}>
                                                    {capitalizeName(apa.unidade || '--')}
                                                </div>
                                            </div>

                                            {/* Médico */}
                                            <div className="w-32 lg:w-48 hidden lg:flex items-center gap-2 pr-4 min-w-0">
                                                <div className="flex-1 min-w-0 text-xs md:text-[13px] font-bold text-slate-600 truncate mt-0.5" title={apa.anestesistaNome}>
                                                    {apa.anestesistaNome ? capitalizeName(`${getDoctorPrefix(apa.anestesistaNome, apa.anestesistaSexo)} ${apa.anestesistaNome.split(' ')[0]}`) : '--'}
                                                </div>
                                            </div>

                                            {/* Procedimento */}
                                            <div className="flex-[1] hidden md:flex items-center gap-3 pr-4 min-w-0">
                                                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 shadow-sm flex-shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                    <Stethoscope size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0 text-xs md:text-[13px] font-bold text-slate-600 truncate mt-0.5" title={apa.procedimento}>
                                                    {capitalizeName(apa.procedimento)}
                                                </div>
                                            </div>

                                            {/* ASA */}
                                            <div className="w-16 hidden md:flex justify-center">
                                                <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60 shadow-sm">
                                                    {apa.asa ? apa.asa.replace('ASA ', '') : '--'}
                                                </span>
                                            </div>

                                            {/* Parecer */}
                                            <div className="w-20 md:w-28 flex justify-center">
                                                <span className={`px-2 py-1 md:px-3 md:py-1 rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-wider shadow-sm border flex items-center gap-1 ${apa.parecerFinal === 'Apto' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : apa.parecerFinal === 'Restricao' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${apa.parecerFinal === 'Apto' ? 'bg-emerald-500' : apa.parecerFinal === 'Restricao' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                                                    {apa.parecerFinal || 'N/A'}
                                                </span>
                                            </div>

                                            {/* Actions */}
                                            <div className="md:w-[190px] flex items-center justify-end opacity-100 transition-opacity duration-200 pr-1 md:pr-4 ml-auto">
                                                {/* Mobile Dropdown */}
                                                <div className="relative md:hidden">
                                                    <button 
                                                        onClick={() => setOpenActionApaId(openActionApaId === apa.id ? null : apa.id)} 
                                                        className="p-1 px-2 md:p-1.5 md:px-3 rounded-md border border-white/60 bg-white/60 text-slate-600 focus:outline-none cursor-pointer text-[11px] md:text-xs font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                                                    >
                                                        Ações
                                                    </button>
                                                    {openActionApaId === apa.id && (
                                                        <>
                                                            <div className="fixed inset-0 z-40" onClick={() => setOpenActionApaId(null)} />
                                                            <div className={`absolute right-0 w-36 bg-white/60 rounded-xl shadow-xl shadow-slate-200/50 border border-white/60 flex flex-col p-1.5 gap-1 z-50 animate-in fade-in zoom-in-95 duration-100 ${index >= filteredApasList.length - 2 && filteredApasList.length > 3 ? 'bottom-[calc(100%+8px)] origin-bottom-right' : 'top-[calc(100%+8px)] origin-top-right'}`}>
                                                                {!mostrarLixeira && (
                                                                    <>
                                                                        {apa.exames_url && <button onClick={() => { abrirArquivo(apa.exames_url, 'exames'); setOpenActionApaId(null); }} className="w-full flex items-center gap-2 p-2 text-indigo-600 hover:bg-indigo-500/20 rounded-lg text-left text-xs font-bold"><FileText size={14}/> Exame</button>}
                                                                        <button onClick={() => { handleVerPreviewPdf(apa); setOpenActionApaId(null); }} className="w-full flex items-center gap-2 p-2 text-blue-600 hover:bg-blue-500/20 rounded-lg text-left text-xs font-bold"><Eye size={14}/> Preview</button>
                                                                        {hasPermission('Criar/Editar APA') && <button onClick={() => { handleDuplicarApa(apa); setOpenActionApaId(null); }} className="w-full flex items-center gap-2 p-2 text-amber-600 hover:bg-amber-500/20 rounded-lg text-left text-xs font-bold"><Copy size={14}/> Duplicar</button>}
                                                                    </>
                                                                )}
                                                                {mostrarLixeira && (
                                                                    <button onClick={() => { handleRestaurarApa(apa.id); setOpenActionApaId(null); }} className="w-full flex items-center gap-2 p-2 text-emerald-600 hover:bg-emerald-500/20 rounded-lg text-left text-xs font-bold"><Copy size={14}/> Restaurar</button>
                                                                )}
                                                                {hasPermission('Excluir AIH/APA') && (
                                                                    <button onClick={() => { handleExcluirApa(apa.id, mostrarLixeira); setOpenActionApaId(null); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-xs font-bold ${mostrarLixeira ? 'text-red-600 hover:bg-red-50 bg-red-50/50' : 'text-rose-600 hover:bg-rose-500/20'}`}>
                                                                        <Trash2 size={14}/> {mostrarLixeira ? 'Excluir Final' : 'Excluir'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="hidden md:flex gap-1.5">
                                                    {!mostrarLixeira && (
                                                        <>
                                                            {apa.exames_url && <button onClick={() => abrirArquivo(apa.exames_url, 'exames')} className="p-2 text-indigo-600 hover:bg-indigo-100 bg-indigo-500/20 border border-indigo-100 rounded-xl transition-all active:scale-95" title="Ver Exame Original"><FileText size={16} strokeWidth={2.5}/></button>}
                                                            <button onClick={() => handleVerPreviewPdf(apa)} className="p-2 text-blue-600 hover:bg-blue-100 bg-blue-500/20 rounded-xl transition-all active:scale-95" title="Visualizar PDF na tela"><Eye size={16} strokeWidth={2.5}/></button>
                                                            {hasPermission('Criar/Editar APA') && <button onClick={() => handleDuplicarApa(apa)} className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-500/20 rounded-xl transition-all active:scale-95" title="Duplicar"><Copy size={16} strokeWidth={2.5}/></button>}
                                                        </>
                                                    )}
                                                    {mostrarLixeira && (
                                                        <button onClick={() => handleRestaurarApa(apa.id)} className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-500/20 rounded-xl transition-all active:scale-95" title="Restaurar"><Copy size={16} strokeWidth={2.5}/></button>
                                                    )}
                                                    {hasPermission('Excluir AIH/APA') && (
                                                        <button onClick={() => handleExcluirApa(apa.id, mostrarLixeira)} className={`p-2 rounded-xl transition-all active:scale-95 ${mostrarLixeira ? 'text-red-500 hover:text-red-700 hover:bg-red-100 bg-red-50' : 'text-slate-500 hover:text-rose-600 hover:bg-rose-500/20'}`} title={mostrarLixeira ? "Excluir Definitivamente" : "Excluir"}>
                                                            <Trash2 size={16} strokeWidth={2.5}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Paginação */}
                        {!loadingApas && totalApas > itensPorPagina && (
                            <div className="flex items-center justify-between mt-4 px-2">
                                <div className="text-xs font-bold text-slate-500">
                                    Mostrando de {(paginaAtual - 1) * itensPorPagina + 1} a {Math.min(paginaAtual * itensPorPagina, totalApas)} de {totalApas} APAs {mostrarLixeira ? 'na lixeira' : ''}
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        disabled={paginaAtual === 1}
                                        onClick={() => setPaginaAtual(p => p - 1)}
                                        className="px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold text-slate-600 hover:bg-white/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Página Anterior
                                    </button>
                                    <button 
                                        disabled={paginaAtual * itensPorPagina >= totalApas}
                                        onClick={() => setPaginaAtual(p => p + 1)}
                                        className="px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-xs font-bold text-slate-600 hover:bg-white/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Próxima Página
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col xl:flex-row gap-6">
                        {/* Sidebar nav / Top Bar */}
                        <div className="w-full xl:w-72 flex-shrink-0 space-y-4">
                            <button onClick={() => setModoVisao('lista')} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-2 font-medium">
                                <ArrowLeft size={16} /> Voltar à Lista
                            </button>
                            <div className="flex flex-row xl:flex-col overflow-x-auto pb-2 xl:pb-0 gap-2 custom-scrollbar scroll-smooth">
                                {tabs.map(tab => (
                                    <button key={tab.id} onClick={() => handleTabNavigation(tab.id)}
                                        className={`flex-shrink-0 w-auto xl:w-full flex items-center gap-3 px-4 py-3 xl:py-3.5 rounded-2xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border-transparent' : 'bg-white/60 text-slate-600 hover:bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl'}`}>
                                        <div className={`${activeTab === tab.id ? 'text-blue-100' : 'text-slate-500'}`}>
                                            {tab.icon}
                                        </div>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main Form Content */}
                        <div className="flex-1 bg-white/60 rounded-3xl shadow-sm border border-white/60 overflow-hidden">
                            <div className="p-4 md:p-5 space-y-5">

                                {/* TAB 1: DADOS E PROCEDIMENTO */}
                                {activeTab === 'dados' && (
                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <section>
                                            <div className="flex items-center justify-between border-b border-white/40 pb-1.5 mb-3">
                                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">1. Identificação do Paciente</h3>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${formData.pacienteInapto ? 'text-red-500' : 'text-slate-400 group-hover:text-slate-600'}`}>Paciente Inapto</span>
                                                    <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData.pacienteInapto ? 'bg-red-500' : 'bg-slate-300'} ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${formData.pacienteInapto ? 'translate-x-4.5' : 'translate-x-1'}`} />
                                                    </div>
                                                    <input type="checkbox" disabled={isReadOnly} checked={formData.pacienteInapto || false} onChange={e => setFormData({ ...formData, pacienteInapto: e.target.checked })} className="sr-only" />
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-5">
                                                <div className="relative md:col-span-6">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">NOME DO PACIENTE<span className="text-red-500 ml-0.5">*</span></label>
                                                    <input disabled={isReadOnly} type="text" name="nome" value={formData.nome} onChange={e => { handleChange(e); setSearchTerm(e.target.value); setShowPacientes(true); }} onFocus={() => setShowPacientes(true)} onBlur={() => setTimeout(() => setShowPacientes(false), 200)} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                                                    {showPacientes && searchTerm && (
                                                        <div className="absolute z-10 w-full mt-1 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg shadow-xl max-h-48 overflow-auto">
                                                            {filteredPacientes.map(p => (
                                                                <div key={p.id} onMouseDown={() => { 
                                                                    const formatAltura = (alt) => {
                                                                        if (!alt) return '';
                                                                        const val = parseFloat(alt.toString().replace(',', '.'));
                                                                        if (isNaN(val)) return '';
                                                                        return val < 3 ? Math.round(val * 100).toString() : val.toString();
                                                                    };
                                                                    setFormData(f => ({ ...f, pacienteId: p.id, nome: p.nome || '', cpf: p.cpf || '', dataNasc: p.dataNascimento || p.nascimento || '', sexo: p.sexo || '', peso: p.peso || '', altura: formatAltura(p.altura), telefone: p.telefone1 || p.telefone || '', nome_mae: p.nomeMae || '' }));
                                                                    setSearchTerm(p.nome); 
                                                                    setShowPacientes(false); 
                                                                }} className="p-3 hover:bg-blue-500/20 cursor-pointer border-b border-slate-50">
                                                                    <div className="font-semibold text-sm">{p.nome}</div><div className="text-xs text-slate-500">{p.cpf}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="md:col-span-3"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">CPF</label><input disabled={isReadOnly} type="text" name="cpf" value={formData.cpf} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
                                                <div className="md:col-span-3">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">CONVÊNIO</label>
                                                    <select disabled={isReadOnly} name="convenio" value={formData.convenio} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                                                        {formData.convenio && !(settings.convenios || []).some(c => String(c).toUpperCase() === String(formData.convenio).toUpperCase()) && <option value={formData.convenio}>{formData.convenio}</option>}
                                                        {(settings.convenios?.length ? settings.convenios : ['SUS']).map((c, idx) => <option key={idx} value={String(c).toUpperCase()}>{String(c).toUpperCase()}</option>)}
                                                    </select>
                                                </div>
                                                <div className="md:col-span-3"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">NASCIMENTO<span className="text-red-500 ml-0.5">*</span></label><DataNascInput disabled={isReadOnly} value={formData.dataNasc} onChange={handleChange} /></div>
                                                <div className="md:col-span-2"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">IDADE</label><div className="w-full px-3 py-1.5 text-xs font-semibold bg-white/80 border-2 border-white shadow-sm rounded-lg text-slate-700 font-medium">{calcularIdade(formData.dataNasc)}</div></div>
                                                <div className="md:col-span-3">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">SEXO<span className="text-red-500 ml-0.5">*</span></label>
                                                    <div className="flex flex-wrap gap-1">
                                                        {[{val: 'Masculino', label: 'Masc'}, {val: 'Feminino', label: 'Fem'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, sexo: opt.val})} className={`flex-1 h-[30px] flex items-center justify-center px-1 whitespace-nowrap text-xs font-bold rounded-lg border transition-all ${formData.sexo === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-4 flex items-end gap-2">
                                                    <div className="flex-1 w-full"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap mb-1">PESO (kg)<span className="text-red-500 ml-0.5">*</span></label><input disabled={isReadOnly} type="number" name="peso" value={formData.peso} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
                                                    <div className="flex-1 w-full"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap mb-1">ALTURA (cm)<span className="text-red-500 ml-0.5">*</span></label><input disabled={isReadOnly} type="number" name="altura" value={formData.altura} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
                                                    <div className="flex-[1.2] min-w-[70px] w-full">
                                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap mb-1">IMC</label>
                                                        <div className="w-full flex items-stretch border border-white/60 rounded-lg overflow-hidden text-xs font-semibold bg-white/70 h-[30px]">
                                                            <div className="px-2 py-1.5 text-slate-700 flex items-center justify-center w-8">{imcData.value}</div>
                                                            {imcData.label && (
                                                                <div className={`flex-1 px-1 py-1.5 flex items-center justify-center font-black uppercase text-[10px] tracking-normal ${imcData.color}`}>
                                                                    {imcData.label}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {(() => {
                                                    const idadeStr = calcularIdade(formData.dataNasc);
                                                    const idadeInt = parseInt(idadeStr);
                                                    if (!isNaN(idadeInt) && idadeInt < 18) {
                                                        return (
                                                            <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-3 mt-1 pt-3 border-t border-white/40 bg-amber-500/20/30 p-3 rounded-xl border border-amber-100">
                                                                <div className="md:col-span-12">
                                                                    <h4 className="text-[11px] font-black text-amber-800 uppercase flex items-center gap-1.5">
                                                                        <User size={12} /> Dados do Responsável Legal (Paciente Menor de Idade)
                                                                    </h4>
                                                                </div>
                                                                <div className="md:col-span-6">
                                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Nome do Responsável<span className="text-red-500 ml-0.5">*</span></label>
                                                                    <input disabled={isReadOnly} type="text" name="resp_nome" value={formData.resp_nome} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-amber-500 transition-all shadow-sm" />
                                                                </div>
                                                                <div className="md:col-span-3">
                                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">CPF do Responsável<span className="text-red-500 ml-0.5">*</span></label>
                                                                    <input disabled={isReadOnly} type="text" name="resp_cpf" value={formData.resp_cpf} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-amber-500 transition-all shadow-sm" />
                                                                </div>
                                                                <div className="md:col-span-3">
                                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Grau de Parentesco<span className="text-red-500 ml-0.5">*</span></label>
                                                                    <input disabled={isReadOnly} type="text" name="resp_parentesco" value={formData.resp_parentesco} onChange={handleChange} placeholder="Ex: Pai, Mãe" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-amber-500 transition-all shadow-sm" />
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </section>
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">2. Procedimento Proposto</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="md:col-span-2 relative">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">PROCEDIMENTO CIRÚRGICO<span className="text-red-500 ml-0.5">*</span></label>
                                                    <SigtapAutocomplete
                                                        value={formData.procedimento}
                                                        onSelect={(p) => setFormData(prev => ({ ...prev, procedimento: p.nome }))}
                                                        disabled={isReadOnly}
                                                        className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all uppercase"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mt-2">
                                                        <div className="col-span-1 md:col-span-2 space-y-4">
                                                            <div className="relative">
                                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ESPECIALIDADE</label>
                                                                <input 
                                                                    disabled={isReadOnly} 
                                                                    name="profissional" 
                                                                    value={formData.profissional} 
                                                                    onChange={handleChange} 
                                                                    list="especialidadesList"
                                                                    placeholder="SELECIONE OU DIGITE..."
                                                                    className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                                                                />
                                                                <datalist id="especialidadesList">
                                                                    {settings.especialidades?.map((m, idx) => { 
                                                                        const label = typeof m === 'string' ? m : m.nome; 
                                                                        const display = label ? label.toUpperCase() : ''; 
                                                                        return <option key={idx} value={label}>{display}</option>; 
                                                                    })}
                                                                </datalist>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="flex flex-col">
                                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">CARÁTER<span className="text-red-500 ml-0.5">*</span></label>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {[{val: 'Eletivo', label: 'Eletivo'}, {val: 'Urgência', label: 'Urgência'}, {val: 'Emergência', label: 'Emergência'}].map(opt => (
                                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, carater: opt.val})} className={`flex-1 h-[32px] flex items-center justify-center px-1 whitespace-nowrap text-[11px] md:text-xs font-bold rounded-lg border transition-all ${formData.carater === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                                {opt.label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">POSIÇÃO</label>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {[{val: 'Dorsal Horizontal', label: 'Dorsal Horizontal'}, {val: 'Ventral', label: 'Ventral'}, {val: 'Lateral Esquerdo', label: 'Lateral Esquerdo'}, {val: 'Lateral Direito', label: 'Lateral Direito'}, {val: 'Sentado', label: 'Sentado'}, {val: 'Litotomia', label: 'Litotomia'}].map(opt => (
                                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, posicao: opt.val})} className={`flex-[1_1_30%] h-[32px] flex items-center justify-center px-0.5 whitespace-nowrap text-[10px] font-bold rounded-lg border transition-all ${formData.posicao === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                                {opt.label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">DATA PREVISTA</label>
                                                            <InlineCalendar disabled={isReadOnly} value={formData.dataProcedimento} onChange={(val) => setFormData(prev => ({ ...prev, dataProcedimento: val }))} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                        
                                        <section className="pt-4 border-t border-slate-100/50 mt-4">
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">Sinais Vitais Básicos</h3>
                                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">PA (mmHg)</label>
                                                    <div className="flex items-center gap-1">
                                                        <input 
                                                            disabled={isReadOnly} 
                                                            type="number" 
                                                            value={formData.pa ? formData.pa.split(/x|\//)[0] || '' : ''} 
                                                            onChange={e => {
                                                                const dia = formData.pa ? formData.pa.split(/x|\//)[1] || '' : '';
                                                                const sis = e.target.value;
                                                                setFormData(prev => ({ ...prev, pa: (!sis && !dia) ? '' : `${sis}/${dia}` }));
                                                            }} 
                                                            placeholder="Máxima"
                                                            className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-center appearance-none" 
                                                        />
                                                        <span className="text-slate-500 font-black">/</span>
                                                        <input 
                                                            disabled={isReadOnly} 
                                                            type="number" 
                                                            value={formData.pa ? formData.pa.split(/x|\//)[1] || '' : ''} 
                                                            onChange={e => {
                                                                const sis = formData.pa ? formData.pa.split(/x|\//)[0] || '' : '';
                                                                const dia = e.target.value;
                                                                setFormData(prev => ({ ...prev, pa: (!sis && !dia) ? '' : `${sis}/${dia}` }));
                                                            }} 
                                                            placeholder="Mínima"
                                                            className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-center appearance-none" 
                                                        />
                                                    </div>
                                                </div>
                                                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">FC (bpm)</label><input disabled={isReadOnly} type="number" name="fc" value={formData.fc} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">SpO2 (%)</label><input disabled={isReadOnly} type="number" name="spo2" value={formData.spo2} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">FR (irpm)</label><input disabled={isReadOnly} type="number" name="fr" value={formData.fr} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">TEMP (°C)</label><input disabled={isReadOnly} type="text" name="temp" value={formData.temp} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                            </div>
                                        </section>
                                    </div>
                                )}

                                {/* TAB 2: HISTÓRICO CLÍNICO */}
                                {activeTab === 'historico' && (
                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">3. Comorbidades (Antecedentes Patológicos)</h3>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {comorbidadesList.map(c => (
                                                    <div 
                                                        key={c.key} 
                                                        onClick={!isReadOnly ? () => setFormData(prev => ({ ...prev, [c.key]: !prev[c.key] })) : undefined}
                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all select-none ${formData[c.key] ? 'border-rose-500 bg-rose-500 text-white shadow-[0_4px_15px_rgba(244,63,94,0.4)] border-none shadow-sm' : 'border-white/60 bg-white/60 text-slate-600 hover:border-white hover:bg-white/90'} ${isReadOnly ? 'opacity-80 cursor-not-allowed' : ''}`}
                                                    >
                                                        <div className={`w-2 h-2 rounded-full border ${formData[c.key] ? 'border-rose-600 bg-rose-500/20' : 'border-white/80'}`} />
                                                        <span className="text-[11px] tracking-normal font-bold uppercase">{c.label}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">DETALHES / OBSERVAÇÕES DE COMORBIDADES</label>
                                                <textarea disabled={isReadOnly} name="detalhes_comorbidades" value={formData.detalhes_comorbidades} onChange={handleChange} rows="2" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg"></textarea>
                                            </div>
                                        </section>
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5 flex items-center gap-1">4. Alergias <span className="text-rose-500">*</span></h3>
                                            <label className="flex items-center gap-2 mb-3">
                                                <input disabled={isReadOnly} type="checkbox" checked={negaAlergia} onChange={e => setNegaAlergia(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                                                <span className="font-semibold text-slate-900 drop-shadow-none">Nega alergias</span>
                                            </label>
                                            {!negaAlergia && (
                                                <div className="space-y-3 bg-white/60 p-4 rounded-xl border border-white/40">
                                                    {alergias.map((al, i) => (
                                                        <div key={i} className="flex gap-3 items-center">
                                                            <div className="flex-1"><input disabled={isReadOnly} type="text" placeholder="Substância" value={al.substancia} onChange={e => updateArray(alergias, setAlergias, i, 'substancia', e.target.value)} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                            <div className="flex-1"><input disabled={isReadOnly} type="text" placeholder="Reação" value={al.reacao} onChange={e => updateArray(alergias, setAlergias, i, 'reacao', e.target.value)} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                            {!isReadOnly && <button onClick={() => removeArray(alergias, setAlergias, i, { substancia: '', reacao: '' })} className="p-2 text-rose-500 hover:bg-rose-100 rounded-lg"><Trash2 size={18} /></button>}
                                                        </div>
                                                    ))}
                                                    {!isReadOnly && <button onClick={() => setAlergias([...alergias, { substancia: '', reacao: '' }])} className="text-sm text-blue-600 font-medium">+ Adicionar Alergia</button>}
                                                </div>
                                            )}
                                        </section>
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">5. Medicamentos em Uso</h3>
                                            <label className="flex items-center gap-2 mb-3">
                                                <input disabled={isReadOnly} type="checkbox" checked={negaMed} onChange={e => setNegaMed(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                                                <span className="font-semibold text-slate-900 drop-shadow-none">Nega uso de medicamentos contínuos</span>
                                            </label>
                                            {!negaMed && (
                                                <div className="space-y-3 bg-white/60 p-4 rounded-xl border border-white/40">
                                                    {medicamentos.map((med, i) => (
                                                      <div key={i} className="space-y-1">
                                                        <div className="flex flex-wrap md:flex-nowrap gap-3 items-center">
                                                            <div className="w-full md:flex-1"><input disabled={isReadOnly} type="text" placeholder="Nome" value={med.nome} onChange={e => updateArray(medicamentos, setMedicamentos, i, 'nome', e.target.value)} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                            <div className="w-full md:w-24"><input disabled={isReadOnly} type="text" placeholder="Dose" value={med.dose} onChange={e => updateArray(medicamentos, setMedicamentos, i, 'dose', e.target.value)} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                            <div className="w-full md:w-32">
                                                                <input disabled={isReadOnly} type="text" list={`freqList_${i}`} placeholder="Freq." value={med.frequencia} onChange={e => updateArray(medicamentos, setMedicamentos, i, 'frequencia', e.target.value)} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:font-normal" />
                                                                <datalist id={`freqList_${i}`}><option value="1x/dia" /><option value="2x/dia" /><option value="3x/dia" /><option value="8/8h" /><option value="12/12h" /><option value="SOS" /></datalist>
                                                            </div>
                                                            <div className="w-full md:w-[22rem] flex gap-1 p-0.5 bg-white/80 border-2 border-white shadow-sm rounded-lg shrink-0">
                                                                <button type="button" disabled={isReadOnly} onClick={() => updateArray(medicamentos, setMedicamentos, i, 'conduta', 'Manter')} className={`flex-[0.8] px-2 py-1 text-[11px] font-bold uppercase rounded-md transition-all ${med.conduta === 'Manter' ? 'bg-emerald-500/20 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/80'}`}>Manter</button>
                                                                {(med.conduta !== 'Manter' && med.conduta !== '') ? (
                                                                    <div className="flex-[2] flex relative">
                                                                        <input disabled={isReadOnly} type="text" placeholder="Suspender..." value={med.conduta} onChange={e => updateArray(medicamentos, setMedicamentos, i, 'conduta', e.target.value)} className={`w-full min-w-[100px] pl-2 pr-7 py-1 text-[16px] md:text-xs tracking-normal font-bold bg-white/60 border rounded-md outline-none ${condutaEhManutencao(med.conduta) ? 'text-emerald-700 border-emerald-300 focus:border-emerald-500' : 'text-rose-600 border-rose-300 focus:border-rose-500'}`} />
                                                                        <button type="button" onClick={() => updateArray(medicamentos, setMedicamentos, i, 'conduta', '')} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-rose-500 z-10 w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-500/20">✕</button>
                                                                    </div>
                                                                ) : (
                                                                    <button type="button" disabled={isReadOnly} onClick={() => updateArray(medicamentos, setMedicamentos, i, 'conduta', 'Suspender ')} className="flex-1 px-2 py-1 text-[11px] font-bold uppercase rounded-md transition-all text-slate-500 hover:text-slate-700 hover:bg-white/80">Suspender</button>
                                                                )}
                                                            </div>
                                                            {!isReadOnly && <button type="button" onClick={() => removeArray(medicamentos, setMedicamentos, i, { nome: '', dose: '', frequencia: '', conduta: '' })} className="p-2 text-rose-500 hover:bg-rose-100 rounded-lg"><Trash2 size={18} /></button>}
                                                        </div>
                                                        <AlertaCondutaMedicamento
                                                            avaliacao={avaliacaoMedicamentos.linhas[i]}
                                                            isReadOnly={isReadOnly}
                                                            onAplicarConduta={(conduta) => updateArray(medicamentos, setMedicamentos, i, 'conduta', conduta)}
                                                        />
                                                      </div>
                                                    ))}
                                                    {!isReadOnly && <button onClick={() => setMedicamentos([...medicamentos, { nome: '', dose: '', frequencia: '', conduta: '' }])} className="text-sm text-blue-600 font-medium">+ Adicionar Medicamento</button>}
                                                </div>
                                            )}
                                        </section>
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">6. Antecedentes Cirúrgicos / 7. Hábitos</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">CIRURGIAS PRÉVIAS</label><textarea disabled={isReadOnly} name="cirurgias" value={formData.cirurgias} onChange={handleChange} rows="2" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg"></textarea></div>
                                                <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ANESTESIAS PRÉVIAS / COMPLICAÇÕES</label><textarea disabled={isReadOnly} name="anestesias_previas" value={formData.anestesias_previas} onChange={handleChange} rows="2" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg"></textarea></div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                                <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-4">
                                                    <div className="md:col-span-4">
                                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">TABAGISMO</label>
                                                        <div className="flex flex-wrap gap-2">
                                                            {[{val: 'Não', label: 'Não'}, {val: 'Sim, ativo', label: 'Sim, ativo'}, {val: 'Ex-tabagista', label: 'Ex-tabagista'}].map(opt => (
                                                                <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => {
                                                                    let newCarga = formData.carga_tabagica;
                                                                    let newCig = formData.tabag_cigarros;
                                                                    let newAnos = formData.tabag_anos;
                                                                    if (opt.val === 'Não') {
                                                                        newCarga = '';
                                                                        newCig = '';
                                                                        newAnos = '';
                                                                    }
                                                                    setFormData({...formData, tabagismo: opt.val, carga_tabagica: newCarga, tabag_cigarros: newCig, tabag_anos: newAnos});
                                                                }} className={`flex-1 h-[40px] flex items-center justify-center px-1 whitespace-nowrap text-xs md:text-xs font-bold rounded-lg border transition-all ${formData.tabagismo === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                    {opt.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    
                                                    {(formData.tabagismo === 'Sim, ativo' || formData.tabagismo === 'Ex-tabagista') && (
                                                        <>
                                                            <div className="md:col-span-2">
                                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">Cigarros/dia</label>
                                                                <input disabled={isReadOnly} type="number" name="tabag_cigarros" value={formData.tabag_cigarros || ''} onChange={(e) => {
                                                                    const cig = e.target.value;
                                                                    const anos = formData.tabag_anos;
                                                                    const result = cig && anos ? ((parseFloat(cig) / 20) * parseFloat(anos)).toFixed(1).replace('.0', '') : '';
                                                                    setFormData({...formData, tabag_cigarros: cig, carga_tabagica: result});
                                                                }} className="w-full h-[40px] px-3 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all focus:bg-white/60" />
                                                            </div>
                                                            <div className="md:col-span-2">
                                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">Tempo (anos)</label>
                                                                <input disabled={isReadOnly} type="number" name="tabag_anos" value={formData.tabag_anos || ''} onChange={(e) => {
                                                                    const anos = e.target.value;
                                                                    const cig = formData.tabag_cigarros;
                                                                    const result = cig && anos ? ((parseFloat(cig) / 20) * parseFloat(anos)).toFixed(1).replace('.0', '') : '';
                                                                    setFormData({...formData, tabag_anos: anos, carga_tabagica: result});
                                                                }} className="w-full h-[40px] px-3 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all focus:bg-white/60" />
                                                            </div>
                                                            <div className="md:col-span-4">
                                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">Carga Tabágica (anos-maço)</label>
                                                                <input disabled type="text" value={formData.carga_tabagica} className="w-full h-[40px] px-3 text-xs font-bold text-slate-500 bg-white/80 border-2 border-white shadow-sm rounded-lg outline-none" />
                                                            </div>
                                                        </>
                                                    )}

                                                    {formData.tabagismo === 'Ex-tabagista' && (
                                                        <div className="md:col-span-4">
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">PAROU HÁ</label>
                                                            <input disabled={isReadOnly} type="text" name="parou_fumo" value={formData.parou_fumo} onChange={handleChange} className="w-full h-[40px] px-3 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all focus:bg-white/60" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="md:col-span-6">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">ETILISMO</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[{val: 'Não', label: 'Não'}, {val: 'Social', label: 'Social'}, {val: 'Diário', label: 'Diário'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, etilismo: opt.val})} className={`flex-1 h-[40px] flex items-center justify-center px-1 whitespace-nowrap text-xs md:text-xs font-bold rounded-lg border transition-all ${formData.etilismo === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-6">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">DROGAS ILÍCITAS</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[{val: 'Nega', label: 'Nega'}, {val: 'Maconha', label: 'Maconha'}, {val: 'Cocaína/Crack', label: 'Cocaína/Crack'}, {val: 'Outras', label: 'Outras'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, drogas: opt.val})} className={`flex-1 h-[40px] flex items-center justify-center px-1 whitespace-nowrap text-xs md:text-xs font-bold rounded-lg border transition-all ${formData.drogas === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                )}

                                {/* TAB 3: EXAME FÍSICO */}
                                {activeTab === 'exame' && (
                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">8. Exame Físico</h3>
                                            
                                            <div className="space-y-6">
                                                {/* 1. AVALIAÇÃO CLÍNICA GERAL */}
                                                <div>
                                                    <h4 className="text-[11px] font-bold text-slate-500 mb-2">1. AVALIAÇÃO CLÍNICA GERAL</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                                                        {CAMPOS_EXAME_PADRAO.map(({ campo, rotulo }) => (
                                                            <ExameNormalAlterado
                                                                key={campo}
                                                                rotulo={rotulo}
                                                                valor={formData[campo]}
                                                                textoPadrao={textosExamePadrao[campo]}
                                                                isReadOnly={isReadOnly}
                                                                onChange={(texto) => handleChange({ target: { name: campo, value: texto } })}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* 2. CAPACIDADE FUNCIONAL (METS) */}
                                                <div>
                                                    <h4 className="text-[11px] font-bold text-slate-500 mb-2">2. CAPACIDADE FUNCIONAL (METS)</h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[{val: '>10 METS', label: '>10 METS (Excelente)'}, {val: '4-7 METS', label: '4-7 METS'}, {val: '<4 METS', label: '<4 METS (Ruim)'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, mets: opt.val})} className={`px-4 py-1.5 text-xs md:text-xs font-bold rounded-lg border transition-all ${formData.mets === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                
                                                {/* 3. AVALIAÇÃO NEUROLÓGICA */}
                                                <div>
                                                    <h4 className="text-[11px] font-bold text-slate-500 mb-2">3. AVALIAÇÃO NEUROLÓGICA</h4>
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ESTADO DE CONSCIÊNCIA</label>
                                                            <div className="flex flex-wrap gap-1">
                                                                {[{val: 'Lúcido/Orientado', label: 'Lúcido/Orientado'}, {val: 'Alteração de Consciência', label: 'Alteração de Consciência'}].map(opt => (
                                                                    <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, neuro_consciencia: opt.val})} className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.neuro_consciencia === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-slate-50'}`}>{opt.label}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">DÉFICIT MOTOR/SENSITIVO</label>
                                                            <div className="flex flex-wrap gap-1">
                                                                {[{val: 'Sem Déficit', label: 'Sem Déficit'}, {val: 'Hemiparesia', label: 'Hemiparesia'}, {val: 'Parestesia', label: 'Parestesia'}, {val: 'Paraplegia', label: 'Paraplegia'}].map(opt => (
                                                                    <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, neuro_deficit: opt.val})} className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.neuro_deficit === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-slate-50'}`}>{opt.label}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 4. COLUNA VERTEBRAL E ACESSO VENOSO */}
                                                <div>
                                                    <h4 className="text-[11px] font-bold text-slate-500 mb-2">4. COLUNA VERTEBRAL E ACESSO VENOSO</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">COLUNA/DORSO</label>
                                                            <div className="flex gap-1">
                                                                {[{val: 'Normal', label: 'Normal'}, {val: 'Deformidade/Escoliose', label: 'Deformidade/Escoliose'}, {val: 'Restrição Local', label: 'Restrição Local'}].map(opt => (
                                                                    <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, coluna_dorso: opt.val})} className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.coluna_dorso === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-slate-50'}`}>{opt.label}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ACESSO VENOSO</label>
                                                            <div className="flex gap-1">
                                                                {[{val: 'Fácil', label: 'Fácil'}, {val: 'Difícil', label: 'Difícil'}, {val: 'Necessita USG', label: 'Necessita USG'}].map(opt => (
                                                                    <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, acesso_venoso: opt.val})} className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.acesso_venoso === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-slate-50'}`}>{opt.label}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 5. VIA AÉREA */}
                                                <div>
                                                    <h4 className="text-[11px] font-bold text-slate-500 mb-2">5. VIA AÉREA</h4>
                                            <div className="mb-6">
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">CLASSIFICAÇÃO DE MALLAMPATI <span className="text-rose-500 text-[11px]">*</span></label>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    {['I', 'II', 'III', 'IV'].map((m, index) => (
                                                        <div key={m} onClick={!isReadOnly ? () => setMallampati(m) : undefined} className={`p-4 rounded-xl border-2 text-center cursor-pointer transition-all ${mallampati === m ? 'border-blue-600 bg-blue-500/20 shadow-sm' : 'border-white/40 hover:border-white hover:bg-white/90 bg-white/5'} ${isReadOnly ? 'opacity-80 cursor-not-allowed' : ''}`}>
                                                            <div className={`w-20 h-24 mx-auto mb-3 rounded-xl overflow-hidden relative transition-all duration-300 ${mallampati === m ? 'shadow-[0_0_0_3px_#2563eb,0_4px_10px_rgba(0,0,0,0.1)] scale-110' : 'shadow-sm opacity-90'}`}>
                                                                <img src={`/mallampati-${index + 1}.jpg`} alt={`Mallampati ${m}`} className="w-full h-full object-contain bg-white" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                                                                <div style={{ display: 'none' }} className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center text-slate-400 text-[9px] p-2">
                                                                    <span>Salvar foto em</span>
                                                                    <span className="font-bold text-blue-500">public/mallampati-{index + 1}.jpg</span>
                                                                </div>
                                                            </div>
                                                            <div className={`text-xl font-black ${mallampati === m ? 'text-blue-700' : 'text-slate-500'}`}>{m}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-6">
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ABERTURA BUCAL</label>
                                                    <div className="flex gap-1">
                                                        {[{val: '> 3cm (Adequada)', label: '> 3cm (Adequada)', fallback: 'Adequada (> 3cm)'}, {val: '< 3cm (Restrita)', label: '< 3cm (Restrita)', fallback: 'Limitada (< 3cm)'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, va_abertura: opt.val})} className={`flex-1 px-2 py-1.5 text-[11px] md:text-xs font-bold rounded-lg border transition-all ${(formData.va_abertura === opt.val || formData.va_abertura === opt.fallback) ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:bg-white/5'}`}>{opt.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">DIST. TIREOMENTUAL</label>
                                                    <div className="flex gap-1">
                                                        {[{val: '> 6cm (Adequada)', label: '> 6cm (Adequada)', fallback: 'Adequada (> 6cm)'}, {val: '< 6cm (Curta)', label: '< 6cm (Curta)', fallback: 'Limitada (< 6cm)'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, va_dtm: opt.val})} className={`flex-1 px-2 py-1.5 text-[11px] md:text-xs font-bold rounded-lg border transition-all ${(formData.va_dtm === opt.val || formData.va_dtm === opt.fallback) ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:bg-white/5'}`}>{opt.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">DIST. ESTERNOMENTO</label>
                                                    <div className="flex gap-1">
                                                        {[{val: '> 12.5cm (Adequada)', label: '> 12.5cm (Adequada)', fallback: 'Adequada (> 12.5cm)'}, {val: '< 12.5cm (Curta)', label: '< 12.5cm (Curta)', fallback: 'Limitada (< 12.5cm)'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, va_dem: opt.val})} className={`flex-1 px-2 py-1.5 text-[11px] md:text-xs font-bold rounded-lg border transition-all ${(formData.va_dem === opt.val || formData.va_dem === opt.fallback) ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:bg-white/5'}`}>{opt.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">MOBILIDADE CERVICAL</label>
                                                    <div className="flex gap-1">
                                                        {[{val: 'Normal', label: 'Normal'}, {val: 'Limitada', label: 'Limitada'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, va_cervical: opt.val})} className={`flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.va_cervical === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:bg-white/5'}`}>{opt.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">PRÓTESE DENTÁRIA</label>
                                                    <div className="flex gap-1">
                                                        {[{val: 'Não', label: 'Não'}, {val: 'Fixa', label: 'Fixa'}, {val: 'Móvel', label: 'Móvel'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, va_protese: opt.val})} className={`flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.va_protese === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:bg-white/5'}`}>{opt.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className={`block text-[10px] font-black uppercase tracking-wide mb-1 ${formData.va_dificil === 'Sim' ? 'text-rose-600' : formData.va_dificil === 'Possível' ? 'text-amber-600' : 'text-slate-500'}`}>VA DIFÍCIL PREVISTA <span className="text-rose-500 text-[11px]">*</span></label>
                                                    <div className="flex gap-1">
                                                        {[{val: 'Não', label: 'Não'}, {val: 'Sim', label: 'Sim', color: 'rose'}, {val: 'Possível', label: 'Possível', color: 'amber'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, va_dificil: opt.val})} className={`flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.va_dificil === opt.val ? (opt.color === 'rose' ? 'bg-rose-500/20 border-rose-400 text-rose-700 shadow-sm' : opt.color === 'amber' ? 'bg-amber-500/20 border-amber-400 text-amber-700 shadow-sm' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm') : 'bg-white/60 border-white/60 text-slate-600 hover:bg-white/5'}`}>{opt.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                                    <div className="mt-4">
                                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">OBSERVAÇÕES VIA AÉREA</label>
                                                        <textarea disabled={isReadOnly} name="va_obs" value={formData.va_obs} onChange={handleChange} rows="2" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg"></textarea>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                )}

                                {/* TAB 4: EXAMES E JEJUM */}
                                {activeTab === 'exames' && (
                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">10. Estado Físico (ASA)</h3>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">CLASSIFICAÇÃO ASA <span className="text-rose-500 text-[11px]">*</span></label>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                        {[{val: 'ASA I', label: 'ASA I', sub: 'Saudável'}, {val: 'ASA II', label: 'ASA II', sub: 'Doença sist. leve'}, {val: 'ASA III', label: 'ASA III', sub: 'Doença sist. grave'}, {val: 'ASA IV', label: 'ASA IV', sub: 'Risco à vida'}, {val: 'ASA V', label: 'ASA V', sub: 'Sobrevida < 24h'}, {val: 'ASA VI', label: 'ASA VI', sub: 'Morte encefálica'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, asa: opt.val})} className={`w-full min-w-[100px] h-[40px] flex flex-col items-center justify-center px-1 whitespace-nowrap text-xs font-bold rounded-lg border transition-all ${formData.asa === opt.val ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                <span>{opt.label}</span>
                                                                <span className="text-[9px] font-semibold opacity-75">{opt.sub}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="mt-2">
                                                    <label className="flex items-center gap-2 cursor-pointer bg-white/60 p-2 rounded-lg border border-white/60 hover:border-white hover:bg-white/90 transition-all w-fit">
                                                        <div className="relative">
                                                            <input type="checkbox" className="sr-only" disabled={isReadOnly} checked={formData.asa_e === true || formData.asa_e === 'true'} onChange={(e) => setFormData({...formData, asa_e: e.target.checked})} />
                                                            <div className={`block w-10 h-6 outline-none rounded-full transition-colors ${formData.asa_e === true || formData.asa_e === 'true' ? 'bg-rose-500/20' : 'bg-slate-300'}`}></div>
                                                            <div className={`dot absolute left-1 top-1 bg-white/60 w-4 h-4 rounded-full transition-transform ${formData.asa_e === true || formData.asa_e === 'true' ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                        </div>
                                                        <span className="text-[11px] md:text-xs font-bold text-slate-600 uppercase tracking-wide">Emergência (E)</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </section>
                                        <section>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b border-white/40 pb-2">
                                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">11. Exames Complementares</h3>
                                                
                                                <div className="mt-2 md:mt-0 flex items-center">
                                                    {/* Botão de Leitura de Exame por IA oculto temporariamente */}
                                                    {formData.exames_url && (
                                                        <button 
                                                            type="button" 
                                                            onClick={() => abrirArquivo(formData.exames_url, 'exames')}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-[11px] sm:text-xs font-bold rounded-lg border border-sky-200 transition-all shadow-sm active:scale-95 ml-2"
                                                        >
                                                            <FileText size={14} className="text-sky-500" />
                                                            VER ORIGINAL
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                {/* Exames Laboratoriais (Compactos) */}
                                                <div className="mb-2">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h4 className="text-[11px] font-black text-slate-600 uppercase">Exames Laboratoriais</h4>
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[9px] font-bold text-slate-500 uppercase">Data do Exame:</label>
                                                            <input disabled={isReadOnly} type="date" name="ex_data_lab" value={formData.ex_data_lab || ''} onChange={handleChange} className="px-2 py-1 text-[11px] font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none" />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-3">
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">HB</label><input disabled={isReadOnly} type="text" name="ex_hb" value={formData.ex_hb} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">HT</label><input disabled={isReadOnly} type="text" name="ex_ht" value={formData.ex_ht} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 truncate">PLAQUETAS</label><input disabled={isReadOnly} type="text" name="ex_plaq" value={formData.ex_plaq} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 truncate">LEUCÓCITOS</label><input disabled={isReadOnly} type="text" name="ex_leuco" value={formData.ex_leuco} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 truncate">TAP/INR</label><input disabled={isReadOnly} type="text" name="ex_inr" value={formData.ex_inr} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">TTPA</label><input disabled={isReadOnly} type="text" name="ex_ttpa" value={formData.ex_ttpa} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 truncate">GLICEMIA JEJUM</label><input disabled={isReadOnly} type="text" name="ex_glic" value={formData.ex_glic} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">HBA1C</label><input disabled={isReadOnly} type="text" name="ex_hba1c" value={formData.ex_hba1c} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">UREIA</label><input disabled={isReadOnly} type="text" name="ex_ureia" value={formData.ex_ureia} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 truncate">CREATININA</label><input disabled={isReadOnly} type="text" name="ex_creat" value={formData.ex_creat} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 truncate">SÓDIO (NA+)</label><input disabled={isReadOnly} type="text" name="ex_na" value={formData.ex_na} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1 truncate">POTÁSSIO (K+)</label><input disabled={isReadOnly} type="text" name="ex_k" value={formData.ex_k} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">TGO (AST)</label><input disabled={isReadOnly} type="text" name="ex_tgo" value={formData.ex_tgo} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">TGP (ALT)</label><input disabled={isReadOnly} type="text" name="ex_tgp" value={formData.ex_tgp} onChange={handleChange} className="w-full px-2 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {/* Exames Cardíacos */}
                                                    <div className="border-t border-white/40 pt-3">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <h4 className="text-[11px] font-black text-slate-600 uppercase">Exames Cardíacos</h4>
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-[9px] font-bold text-slate-500 uppercase">Data do Exame:</label>
                                                                <input disabled={isReadOnly} type="date" name="ex_data_cardio" value={formData.ex_data_cardio || ''} onChange={handleChange} className="px-2 py-1 text-[11px] font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none" />
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-3">
                                                            <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ECG</label><input disabled={isReadOnly} type="text" name="ex_ecg" value={formData.ex_ecg} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                            <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ECOCARDIOGRAMA</label><input disabled={isReadOnly} type="text" name="ex_eco" value={formData.ex_eco} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        </div>
                                                    </div>

                                                    {/* Exames de Imagem */}
                                                    <div className="border-t border-white/40 pt-3 md:border-l md:pl-4 md:border-t-0 md:pt-3">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <h4 className="text-[11px] font-black text-slate-600 uppercase">Exames de Imagem</h4>
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-[9px] font-bold text-slate-500 uppercase">Data do Exame:</label>
                                                                <input disabled={isReadOnly} type="date" name="ex_data_imagem" value={formData.ex_data_imagem || ''} onChange={handleChange} className="px-2 py-1 text-[11px] font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none" />
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-3">
                                                            <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">RX TÓRAX</label><input disabled={isReadOnly} type="text" name="ex_rx" value={formData.ex_rx} onChange={handleChange} className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" /></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">OUTROS EXAMES</label>
                                                    <textarea disabled={isReadOnly} name="ex_outros" value={formData.ex_outros} onChange={handleChange} rows="2" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg"></textarea>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">OBSERVAÇÕES DOS EXAMES</label>
                                                    <textarea disabled={isReadOnly} name="ex_obs" value={formData.ex_obs} onChange={handleChange} rows="2" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg"></textarea>
                                                </div>
                                            </div>
                                        </section>
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5 flex justify-between items-center">
                                                <span>12. Jejum Pré-Operatório</span>
                                            </h3>
                                            
                                            {/* Radios de Seleção de Jejum */}
                                            <div className="flex gap-4 mb-3">
                                                <label className="flex items-center cursor-pointer">
                                                    <input disabled={isReadOnly} type="radio" name="jejum_tipo" checked={formData.jejum_orientacao === '' || formData.jejum_orientacao === 'Padrão ASA' || ['2h', '4h', '6h (Fórmula)', '6h', '8h'].includes(formData.jejum_orientacao)} onChange={() => handleChange({ target: { name: 'jejum_orientacao', value: 'Padrão ASA' }})} className="mr-2 accent-blue-600" />
                                                    <span className="text-xs font-bold text-slate-700">Padrão</span>
                                                </label>
                                                <label className="flex items-center cursor-pointer">
                                                    <input disabled={isReadOnly} type="radio" name="jejum_tipo" checked={formData.jejum_orientacao !== '' && formData.jejum_orientacao !== 'Padrão ASA' && !['2h','4h','6h (Fórmula)', '6h','8h'].includes(formData.jejum_orientacao)} onChange={() => handleChange({ target: { name: 'jejum_orientacao', value: 'Jejum diferenciado:\n' }})} className="mr-2 accent-blue-600" />
                                                    <span className="text-xs font-bold text-slate-700">Personalizado</span>
                                                </label>
                                            </div>

                                            {/* Exibição Condicional (Tabela ou Texto Livre) */}
                                            {formData.jejum_orientacao === '' || formData.jejum_orientacao === 'Padrão ASA' ? (
                                                <div className="bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl overflow-hidden mb-3 animate-in fade-in duration-300">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="bg-white/70 text-slate-600 font-bold">
                                                            <tr><th className="px-4 py-2 border-b border-white/60">Tipo de Alimento</th><th className="px-4 py-2 border-b border-white/60">Tempo de Jejum Mínimo</th></tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {[
                                                                { id: 'jejum_liquidos', food: 'Líquidos Claros (Água, Chá sem resíduos)' },
                                                                { id: 'jejum_leite', food: 'Leite Materno' },
                                                                { id: 'jejum_formula', food: 'Fórmula Láctea / Leite não humano' },
                                                                { id: 'jejum_leve', food: 'Refeição leve' },
                                                                { id: 'jejum_completa', food: 'Refeição completa' },
                                                            ].map(item => (
                                                                <tr key={item.id} className="hover:bg-white/60 transition-colors">
                                                                    <td className="px-4 py-3">{item.food}</td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex gap-2">
                                                                            {['2h', '4h', '6h', '8h'].map(time => (
                                                                                <button 
                                                                                    key={time}
                                                                                    type="button" 
                                                                                    disabled={isReadOnly} 
                                                                                    onClick={() => setFormData({...formData, [item.id]: formData[item.id] === time ? '' : time, jejum_orientacao: 'Padrão ASA'})}
                                                                                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${formData[item.id] === time ? 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm' : 'bg-white/60 border-white/60 text-slate-600 hover:bg-white/70'}`}
                                                                                >
                                                                                    {time}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="animate-in fade-in duration-300">
                                                    <textarea disabled={isReadOnly} name="jejum_orientacao" value={formData.jejum_orientacao} onChange={handleChange} rows="3" className="w-full px-3 py-2 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono" placeholder="Descreva o jejum personalizado..."></textarea>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                                                <div className="hidden">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">ORIENTAÇÃO ESPECÍFICA DE JEJUM</label>
                                                    <input disabled={isReadOnly} type="text" name="jejum_orientacao_old" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">PROFILAXIA DE ASPIRAÇÃO</label>
                                                    <div className="flex gap-2">
                                                        {[{val: 'Não indicada', label: 'Não indicada'}, {val: 'Indicada (Antiácido / Procinético)', label: 'Indicada'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, profilaxia_asp: opt.val})} className={`flex-1 h-[36px] text-xs font-bold rounded-lg border transition-all ${formData.profilaxia_asp === opt.val ? (opt.label === 'Indicada' ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-sm font-black' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm') : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                )}

                                {/* TAB 5: PLANO E PARECER */}
                                {activeTab === 'plano' && (
                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">13. Plano Anestésico</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">TÉCNICA PREVISTA <span className="text-rose-500 text-[11px]">*</span></label>
                                                    {(() => {
                                                        const tecnicasDisponiveis = settings?.anestesias && settings.anestesias.length > 0
                                                            ? settings.anestesias.map((a) => (a.nome || a))
                                                            : ["Geral", "Raquianestesia", "Bloqueio", "Sedação", "Local"];
                                                        
                                                        const selecionadas = formData.plan_tecnica ? formData.plan_tecnica.split(', ').filter(Boolean) : [];
                                                        
                                                        const handleToggle = (tecnica) => {
                                                            if (isReadOnly) return;
                                                            let novaLista = [...selecionadas];
                                                            if (novaLista.includes(tecnica)) {
                                                                novaLista = novaLista.filter(t => t !== tecnica);
                                                            } else {
                                                                novaLista.push(tecnica);
                                                            }
                                                            handleChange({ target: { name: 'plan_tecnica', value: novaLista.join(', ') } });
                                                        };

                                                        return (
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {tecnicasDisponiveis.map(tecnica => {
                                                                    const isSelected = selecionadas.includes(tecnica);
                                                                    return (
                                                                        <div 
                                                                            key={tecnica}
                                                                            onClick={() => handleToggle(tecnica)}
                                                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all border ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white/60 text-slate-600 border-white/60 hover:border-white hover:bg-white/90'} ${isReadOnly ? 'opacity-80 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            {tecnica}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">RESERVA DE UTI? <span className="text-rose-500 text-[11px]">*</span></label>
                                                    <div className="flex flex-wrap gap-3 mt-1">
                                                        {[{val: 'Não', label: 'Não'}, {val: 'Sim', label: 'Sim'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, plan_destino: opt.val})} className={`px-5 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.plan_destino === opt.val ? (opt.val === 'Sim' ? 'bg-rose-500/20 border-rose-500 text-rose-700 shadow-sm font-black' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm font-black') : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Hemoderivados & Protocolo de Recusa */}
                                            <div className="mt-5 pt-4 border-t border-white/40">
                                                <div className="flex flex-wrap gap-8">
                                                    <div>
                                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">RESERVA DE HEMODERIVADOS</label>
                                                        <div className="flex flex-wrap gap-3 mb-4">
                                                            {[{val: 'Não', label: 'Não'}, {val: 'Sim', label: 'Sim'}].map(opt => (
                                                                <button key={opt.val} type="button" disabled={isReadOnly || recusaHemoAtiva} onClick={() => setFormData(prev => opt.val === 'Não' ? {...prev, plan_hemoderivados: 'Não', ...HEMO_REQUISICAO_VAZIA} : {...prev, plan_hemoderivados: 'Sim'})} className={`px-5 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.plan_hemoderivados === opt.val ? (opt.val === 'Sim' ? 'bg-rose-500/20 border-rose-500 text-rose-700 shadow-sm font-black' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm font-black') : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'} ${recusaHemoAtiva ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                                    {opt.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    
                                                    <div>
                                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">Protocolo de Recusa de Hemotransfusão? <span className="text-red-500">*</span></label>
                                                        <div className="flex flex-wrap gap-3 mb-1">
                                                            {(pacienteEhMenor ? [{val: 'Não', label: 'Não'}] : [{val: 'Não', label: 'Não'}, {val: 'Sim', label: 'Sim'}]).map(opt => (
                                                                <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => {
                                                                    if (opt.val === 'Sim' && formData.plan_hemoderivados === 'Sim') toast('Reserva de hemoderivados removida: o paciente tem protocolo de recusa de hemotransfusão.', { icon: '⚠️', duration: 5000 });
                                                                    setFormData(prev => opt.val === 'Sim' ? {...prev, plan_recusa_hemo: 'Sim', plan_hemoderivados: 'Não', ...HEMO_REQUISICAO_VAZIA} : {...prev, plan_recusa_hemo: opt.val});
                                                                }} className={`px-5 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.plan_recusa_hemo === opt.val ? (opt.val === 'Sim' ? 'bg-amber-500/20 border-amber-500 text-amber-700 shadow-sm font-black' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm font-black') : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                    {opt.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        {pacienteEhMenor
                                                            ? <p className="text-[10px] font-bold text-slate-500 mb-4 max-w-[300px] leading-snug">Paciente menor de idade: recusar hemotransfusão é ato de adulto capaz.</p>
                                                            : <div className="mb-4" />}
                                                    </div>
                                                </div>
                                                {recusaHemoAtiva && (
                                                    <p className="text-[11px] font-bold text-amber-700 bg-amber-500/10 border border-amber-300 rounded-lg px-3 py-2 mb-3">
                                                        Reserva de hemoderivados bloqueada: este paciente tem protocolo de recusa de hemotransfusão.
                                                    </p>
                                                )}
                                                {formData.plan_hemoderivados === 'Sim' && (
                                                    <div className="flex flex-col gap-5 bg-rose-50/40 p-5 rounded-2xl border border-rose-100 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300 mt-2">
                                                        <div className="flex items-baseline justify-between gap-3 flex-wrap border-b border-rose-100 pb-2">
                                                            <h4 className="text-[11px] font-black text-rose-700 uppercase tracking-wider">Requisição de Transfusão</h4>
                                                            <span className="text-[10px] font-semibold text-slate-500">Sai como folha anexa junto com a APA e o termo.</span>
                                                        </div>

                                                        <div>
                                                            <label className={HEMO_LABEL_CLS}>Indicação para Transfusão</label>
                                                            <textarea disabled={isReadOnly} name="plan_hemo_indicacao" value={formData.plan_hemo_indicacao} onChange={handleChange} rows="2" placeholder="Ex: Anemia sintomática pré-operatória (Hb 7,2 g/dL) com previsão de sangramento..." className={HEMO_INPUT_CLS}></textarea>
                                                        </div>

                                                        {/* Histórico transfusional e gestações numa linha só: cada campo com a
                                                            largura da resposta que recebe — data é data, "quantas" é um número
                                                            de um dígito. Em grade de 3 colunas eles ficavam gigantes. */}
                                                        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                                                            <div>
                                                                <label className={HEMO_LABEL_CLS}>Já recebeu transfusão antes?</label>
                                                                <HemoSimNao disabled={isReadOnly} value={formData.plan_hemo_transf_previa} onSelect={(v) => setFormData(prev => ({ ...prev, plan_hemo_transf_previa: v, plan_hemo_reacao: v === 'Sim' ? prev.plan_hemo_reacao : '', plan_hemo_reacao_qual: v === 'Sim' ? prev.plan_hemo_reacao_qual : '', plan_hemo_ultima_transf: v === 'Sim' ? prev.plan_hemo_ultima_transf : '' }))} />
                                                            </div>
                                                            {formData.plan_hemo_transf_previa === 'Sim' && (
                                                                <>
                                                                    <div>
                                                                        <label className={HEMO_LABEL_CLS}>Apresentou reação transfusional?</label>
                                                                        <HemoSimNao disabled={isReadOnly} value={formData.plan_hemo_reacao} onSelect={(v) => setFormData(prev => ({ ...prev, plan_hemo_reacao: v, plan_hemo_reacao_qual: v === 'Sim' ? prev.plan_hemo_reacao_qual : '' }))} />
                                                                    </div>
                                                                    <div className="w-[168px]">
                                                                        <label className={HEMO_LABEL_CLS}>Data da última transfusão</label>
                                                                        <input disabled={isReadOnly} type="date" name="plan_hemo_ultima_transf" value={formData.plan_hemo_ultima_transf} onChange={handleChange} className={HEMO_INPUT_CLS} />
                                                                    </div>
                                                                </>
                                                            )}
                                                            <div>
                                                                <label className={HEMO_LABEL_CLS}>Gestações prévias?</label>
                                                                <HemoSimNao disabled={isReadOnly} value={formData.plan_hemo_gestacoes} onSelect={(v) => setFormData(prev => ({ ...prev, plan_hemo_gestacoes: v, plan_hemo_gestacoes_qtd: v === 'Sim' ? prev.plan_hemo_gestacoes_qtd : '' }))} />
                                                            </div>
                                                            {formData.plan_hemo_gestacoes === 'Sim' && (
                                                                <div className="w-[84px]">
                                                                    <label className={HEMO_LABEL_CLS}>Quantas?</label>
                                                                    <input disabled={isReadOnly} type="number" min="0" name="plan_hemo_gestacoes_qtd" value={formData.plan_hemo_gestacoes_qtd} onChange={handleChange} placeholder="0" className={`${HEMO_INPUT_CLS} text-center`} />
                                                                </div>
                                                            )}
                                                            {formData.plan_hemo_reacao === 'Sim' && (
                                                                <div className="flex-1 min-w-[240px] max-w-[460px]">
                                                                    <label className={HEMO_LABEL_CLS}>Qual reação?</label>
                                                                    <input disabled={isReadOnly} type="text" name="plan_hemo_reacao_qual" value={formData.plan_hemo_reacao_qual} onChange={handleChange} placeholder="Ex: Reação febril não hemolítica" className={HEMO_INPUT_CLS} />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <label className={HEMO_LABEL_CLS}>Tipo de Transfusão</label>
                                                            {/* Dia e hora entram na mesma linha dos botões, não numa faixa vazia embaixo */}
                                                            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                                                                <div className="flex flex-wrap gap-3">
                                                                    {HEMO_TIPOS_TRANSFUSAO.map(tipo => (
                                                                        <button key={tipo} type="button" disabled={isReadOnly} onClick={() => setFormData(prev => ({ ...prev, plan_hemo_tipo: tipo, plan_hemo_prog_data: tipo === 'Programada' ? prev.plan_hemo_prog_data : '', plan_hemo_prog_hora: tipo === 'Programada' ? prev.plan_hemo_prog_hora : '' }))} className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.plan_hemo_tipo === tipo ? (tipo === 'Extrema urgência' ? 'bg-rose-500/20 border-rose-500 text-rose-700 shadow-sm font-black' : tipo === 'Urgente (até 3h)' ? 'bg-orange-500/20 border-orange-500 text-orange-700 shadow-sm font-black' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm font-black') : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90'}`}>
                                                                            {tipo}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                {formData.plan_hemo_tipo === 'Programada' && (
                                                                    <div className="flex items-end gap-3">
                                                                        <div className="w-[168px]">
                                                                            <label className={HEMO_LABEL_CLS}>Dia</label>
                                                                            <input disabled={isReadOnly} type="date" name="plan_hemo_prog_data" value={formData.plan_hemo_prog_data} onChange={handleChange} className={HEMO_INPUT_CLS} />
                                                                        </div>
                                                                        <div className="w-[118px]">
                                                                            <label className={HEMO_LABEL_CLS}>Hora</label>
                                                                            <input disabled={isReadOnly} type="time" name="plan_hemo_prog_hora" value={formData.plan_hemo_prog_hora} onChange={handleChange} className={HEMO_INPUT_CLS} />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className={HEMO_LABEL_CLS}>Hemocomponentes (quantidade em unidades)</label>
                                                            {/* Colunas de largura fixa com a etiqueta em caixa de 2 linhas: assim os
                                                                campos de quantidade ficam alinhados entre si. */}
                                                            <div className="flex flex-wrap gap-x-5 gap-y-4">
                                                                {[
                                                                    { name: 'plan_hemo_ch', label: 'Concentrado de Hemácias (CH)' },
                                                                    { name: 'plan_hemo_plaq', label: 'Concentrado de Plaquetas (CP)' },
                                                                    { name: 'plan_hemo_pfc', label: 'Plasma Fresco Congelado (PFC)' },
                                                                    { name: 'plan_hemo_crio', label: 'Crioprecipitado (CRIO)' }
                                                                ].map(hc => (
                                                                    <div key={hc.name} className="w-[152px]">
                                                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide leading-tight mb-1.5 h-[26px]">{hc.label}</label>
                                                                        <div className="flex items-center gap-2">
                                                                            <input disabled={isReadOnly} type="number" name={hc.name} value={formData[hc.name]} onChange={handleChange} min="0" placeholder="0" className="w-16 px-2 py-1.5 text-center text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all shadow-sm" />
                                                                            <span className="text-[11px] text-slate-500 font-bold">un</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                <div className="w-[340px]">
                                                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide leading-tight mb-1.5 h-[26px]">Outros</label>
                                                                    <div className="flex items-center gap-2">
                                                                        <input disabled={isReadOnly} type="text" name="plan_hemo_outros" value={formData.plan_hemo_outros} onChange={handleChange} placeholder="Descrição detalhada..." className={`${HEMO_INPUT_CLS} flex-1 min-w-0`} />
                                                                        <input disabled={isReadOnly} type="number" name="plan_hemo_outros_qtd" value={formData.plan_hemo_outros_qtd} onChange={handleChange} min="0" placeholder="0" className="w-16 px-2 py-1.5 text-center text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all shadow-sm" />
                                                                        <span className="text-[11px] text-slate-500 font-bold">un</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className={HEMO_LABEL_CLS}>Procedimentos Especiais</label>
                                                            <div className="flex flex-wrap gap-3">
                                                                {HEMO_PROC_ESPECIAIS.map(proc => (
                                                                    <button key={proc} type="button" disabled={isReadOnly} onClick={() => alternarProcEspecial(proc)} className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all ${procEspSelecionados.includes(proc) ? 'bg-rose-500/20 border-rose-500 text-rose-700 shadow-sm font-black' : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90'}`}>
                                                                        {proc}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            {procEspSelecionados.length > 0 && (
                                                                <div className="mt-3">
                                                                    <label className={HEMO_LABEL_CLS}>Justificativa dos procedimentos especiais</label>
                                                                    <input disabled={isReadOnly} type="text" name="plan_hemo_esp_just" value={formData.plan_hemo_esp_just} onChange={handleChange} placeholder="Ex: Imunossupressão - risco de doença enxerto contra hospedeiro" className={HEMO_INPUT_CLS} />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <label className={HEMO_LABEL_CLS}>Observações da Requisição</label>
                                                            <textarea disabled={isReadOnly} name="plan_hemo_obs" value={formData.plan_hemo_obs} onChange={handleChange} rows="2" className={HEMO_INPUT_CLS}></textarea>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-4">
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">OBSERVAÇÕES DO PLANO</label>
                                                <textarea disabled={isReadOnly} name="plan_obs" value={formData.plan_obs} onChange={handleChange} rows="2" className="w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg"></textarea>
                                            </div>
                                        </section>
                                        <section>
                                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 border-b border-white/40 pb-1.5">14. Parecer Anestésico <span className="text-rose-500">*</span></h3>
                                            
                                            {/* Avaliação Especializada Prévia */}
                                            <div className="mb-8 border-l-4 border-white/60 pl-4 py-1">
                                                <div className="flex flex-col gap-2">
                                                    <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wide">Necessita avaliação especializada prévia?</label>
                                                    <div className="flex gap-3 mt-1">
                                                        {[{val: 'Não', label: 'Não'}, {val: 'Sim', label: 'Sim'}].map(opt => (
                                                            <button key={opt.val} type="button" disabled={isReadOnly} onClick={() => setFormData({...formData, parecer_aval_esp: opt.val, parecer_aval_especialidade: opt.val==='Não'?'':formData.parecer_aval_especialidade, parecer_aval_motivo: opt.val==='Não'?'':formData.parecer_aval_motivo})} className={`px-5 py-1.5 text-xs font-bold rounded-lg border transition-all ${formData.parecer_aval_esp === opt.val ? (opt.val === 'Sim' ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-sm font-black' : 'bg-blue-500/20 border-blue-500 text-blue-700 shadow-sm font-black') : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90 hover:bg-white/5'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {formData.parecer_aval_esp === 'Sim' && (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 bg-orange-50/40 p-5 rounded-2xl border border-orange-100 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
                                                        <div className="flex flex-col md:col-span-1">
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">Especialidade</label>
                                                            <input disabled={isReadOnly} type="text" name="parecer_aval_especialidade" value={formData.parecer_aval_especialidade} onChange={handleChange} className="w-full px-3 py-2 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all shadow-sm" placeholder="Ex: Cardiologista" />
                                                        </div>
                                                        <div className="flex flex-col md:col-span-2">
                                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">Motivo</label>
                                                            <textarea disabled={isReadOnly} name="parecer_aval_motivo" value={formData.parecer_aval_motivo} onChange={handleChange} rows="2" className="w-full px-3 py-2 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all resize-none shadow-sm" placeholder="Ex: Avaliar risco cirúrgico aumentado..."></textarea>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                                                <div onClick={!isReadOnly ? () => setParecer('Apto') : undefined} className={`p-3 py-2.5 rounded-lg border-2 text-center cursor-pointer transition-all flex items-center justify-center gap-2 ${parecer === 'Apto' ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.4)] border-none shadow-sm' : 'border-white/60 hover:border-white hover:bg-white/90 text-slate-600'} ${isReadOnly ? 'opacity-80 cursor-not-allowed' : ''}`}>
                                                    <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center">{parecer === 'Apto' && <div className="w-2 h-2 rounded-full bg-current" />}</div><span className="font-bold text-xs uppercase">APTO</span>
                                                </div>
                                                <div onClick={!isReadOnly ? () => setParecer('Restricao') : undefined} className={`p-3 py-2.5 rounded-lg border-2 text-center cursor-pointer transition-all flex items-center justify-center gap-2 ${parecer === 'Restricao' ? 'border-amber-500 bg-amber-500/20 text-amber-700 shadow-sm' : 'border-white/60 hover:border-white hover:bg-white/90 text-slate-600'} ${isReadOnly ? 'opacity-80 cursor-not-allowed' : ''}`}>
                                                    <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center">{parecer === 'Restricao' && <div className="w-2 h-2 rounded-full bg-current" />}</div><span className="font-bold text-xs uppercase">APTO C/ RESTRIÇÕES</span>
                                                </div>
                                                <div onClick={!isReadOnly ? () => setParecer('Inapto') : undefined} className={`p-3 py-2.5 rounded-lg border-2 text-center cursor-pointer transition-all flex items-center justify-center gap-2 ${parecer === 'Inapto' ? 'border-rose-500 bg-rose-500 text-white shadow-[0_4px_15px_rgba(244,63,94,0.4)] border-none shadow-sm' : 'border-white/60 hover:border-white hover:bg-white/90 text-slate-600'} ${isReadOnly ? 'opacity-80 cursor-not-allowed' : ''}`}>
                                                    <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center">{parecer === 'Inapto' && <div className="w-2 h-2 rounded-full bg-current" />}</div><span className="font-bold text-xs uppercase">INAPTO</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">
                                                    JUSTIFICATIVAS / RECOMENDAÇÕES FINAIS {(parecer === 'Restricao' || parecer === 'Inapto') && <span className="text-rose-500 text-[11px]">*</span>}
                                                </label>
                                                <textarea disabled={isReadOnly} name="parecer_obs" value={formData.parecer_obs} onChange={handleChange} rows="3" className={`w-full px-3 py-1.5 text-xs font-semibold bg-white/60 border rounded-lg transition-all ${(parecer === 'Restricao' || parecer === 'Inapto') && !formData.parecer_obs?.trim() ? 'border-rose-500 bg-rose-500/20/50 focus:ring-rose-500 outline-none focus:ring-1' : 'border-white/60'}`}></textarea>
                                            </div>
                                        </section>
                                    </div>
                                )}

                                {/* FOOTER WIZARD */}
                                <div className="pt-6 border-t border-white/40 flex justify-between items-center mt-6">
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const currentIndex = tabs.findIndex(t => t.id === activeTab);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                            if(currentIndex > 0) handleTabNavigation(tabs[currentIndex - 1].id);
                                        }}
                                        disabled={activeTab === tabs[0].id}
                                        className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === tabs[0].id ? 'opacity-0 pointer-events-none' : 'bg-white/70 text-slate-600 hover:bg-white/80'}`}
                                    >
                                        <ArrowLeft size={16} /> Etapa Anterior
                                    </button>

                                    {activeTab !== tabs[tabs.length - 1].id ? (
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const currentIndex = tabs.findIndex(t => t.id === activeTab);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                                if(currentIndex < tabs.length - 1) handleTabNavigation(tabs[currentIndex + 1].id);
                                            }}
                                            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all flex items-center gap-2"
                                        >
                                            Próxima Etapa <ChevronRight size={16} />
                                        </button>
                                    ) : (
                                        !isReadOnly && (
                                            <button type="button" onClick={handleSalvarApa} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-800 text-white shadow-lg shadow-blue-600/30 hover:bg-slate-900 transition-all flex items-center gap-2">
                                                <Save size={16} /> Salvar e Finalizar
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Validação de Extrato de Exames */}
            {aiValidationData && (
                <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white/60 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-white/40 flex justify-between items-center bg-white/60">
                            <h2 className="text-lg font-black text-slate-900 drop-shadow-none flex items-center gap-2">
                                <Sparkles className="text-indigo-600" size={20}/> Validação da Leitura
                            </h2>
                            <button onClick={() => { setAiValidationData(null); setAiValidationFileUrl(null); }} className="p-2 text-slate-500 hover:text-slate-600 hover:bg-white/80 rounded-lg transition-all">✕</button>
                        </div>
                        
                        {/* Body */}
                        <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
                            {/* Left: Document Viewer */}
                            <div className="w-full md:w-1/2 bg-white/70 border-r border-white/60 p-2 flex items-center justify-center overflow-hidden">
                                {aiValidationFileUrl?.type === 'application/pdf' ? (
                                    <iframe src={aiValidationFileUrl.url} className="w-full h-full rounded-xl border border-white/80 shadow-inner" />
                                ) : (
                                    <img src={aiValidationFileUrl?.url} className="max-w-full max-h-full rounded-xl object-contain shadow-sm" />
                                )}
                            </div>

                            {/* Right: Extracted Data */}
                            <div className="w-full md:w-1/2 overflow-y-auto p-5 bg-white/60">
                                <p className="text-xs text-slate-500 font-semibold mb-4 bg-blue-500/20 text-blue-800 border border-blue-200 p-3 rounded-xl shadow-sm">
                                    Confira os dados extraídos comparando com o documento original ao lado. Altere o que for necessário antes de confirmar a importação para a ficha.
                                </p>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    {Object.entries(aiValidationData).map(([key, value]) => {
                                        const labels = {
                                            ex_hb: "HB", ex_ht: "HT", ex_plaq: "Plaquetas", ex_leuco: "Leucócitos", 
                                            ex_coagulo: "Coagulograma", ex_inr: "TAP / INR", ex_ttpa: "TTPA", 
                                            ex_glic: "Glicemia", ex_hba1c: "HbA1c", ex_ureia: "Ureia", ex_creat: "Creatinina", 
                                            ex_na: "Sódio", ex_k: "Potássio", ex_eco: "Ecocardiograma", ex_hepato: "Função Hepática", 
                                            ex_outros_esp: "Outros TSH/Urina...", ex_ecg: "ECG", ex_rx: "RX Tórax"
                                        };
                                        const label = labels[key];
                                        if (!label) return null;

                                        return (
                                            <div key={key} className={['ex_ecg', 'ex_rx', 'ex_outros_esp', 'ex_eco', 'ex_hepato', 'ex_coagulo'].includes(key) ? "col-span-2" : ""}>
                                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">{label}</label>
                                                <input 
                                                    type="text" 
                                                    value={value} 
                                                    onChange={(e) => setAiValidationData({...aiValidationData, [key]: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-xs font-bold bg-indigo-500/20 border border-indigo-100 rounded-lg text-indigo-950 focus:bg-white/60 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all shadow-sm" 
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/40 flex justify-end gap-3 bg-white/60">
                            <button onClick={() => { setAiValidationData(null); setAiValidationFileUrl(null); setPendingExameFile(null); }} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-white/80 transition-all border border-white/80 bg-white/60">Cancelar</button>
                            <button onClick={() => { 
                                setFormData(prev => ({ ...prev, ...aiValidationData })); 
                                setExameFileToUpload(pendingExameFile);
                                setAiValidationData(null); 
                                setAiValidationFileUrl(null); 
                                setPendingExameFile(null);
                                toast.success("Dados importados com sucesso!");
                            }} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 hover:shadow-indigo-600/40 transition-all flex items-center gap-2">
                                <CheckSquare size={18} /> Confirmar Importação
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Componente Invisível que só aparece no Print Nativo */}
            {apaParaImprimir && createPortal(
                <div className="print-master-container">
                    <ApaPrintTemplate data={apaParaImprimir} />
                </div>,
                document.body
            )}
        </div>
    );
}
