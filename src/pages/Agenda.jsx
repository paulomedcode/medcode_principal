import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { aoClicarNoArquivo } from '../services/arquivos';
import { prepararArquivo, TIPOS_DOCUMENTO_AMPLO } from '../utils/arquivoUpload';
import { logAction } from '../utils/logger';
import toast from 'react-hot-toast';
import { useUnit } from '../contexts/UnitContext';
import {
    CalendarDays, Search, Plus, Clock,
    Stethoscope, CheckCircle2, AlertCircle, Calendar as CalendarIcon,
    ChevronLeft, ChevronRight, Settings,
    XCircle, CalendarClock, X, Save, Loader2,
    UserSquare2, SlidersHorizontal, UserPlus, CalendarCheck, ThumbsUp, ThumbsDown, UserX, Ban, RefreshCw, UserCheck, Pencil, Paperclip, FileText
} from 'lucide-react';
import { maskCPF, maskTelefone } from '../utils/masks';
import { PacienteFormModal } from '../components/PacienteFormModal';
import { ImportAgendaModal } from '../components/ImportAgendaModal';
import html2pdf from 'html2pdf.js';
import UnitPrompt from '../components/UnitPrompt';

const DIAS_NOME = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const STATUS_COLORS = {
    'Agendado': { bg: 'bg-blue-500/20', border: 'border-blue-400', text: 'text-blue-800' },
    'Aguardando': { bg: 'bg-amber-500/20', border: 'border-amber-400', text: 'text-amber-800' },
    'Em Atendimento': { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-800' },
    'Atendido': { bg: 'bg-emerald-500/20', border: 'border-emerald-400', text: 'text-emerald-800' },
    'Cancelado': { bg: 'bg-rose-500/20', border: 'border-rose-400', text: 'text-rose-800' },
    'Faltou': { bg: 'bg-rose-500/20', border: 'border-rose-600', text: 'text-rose-800' },
    'Desistiu': { bg: 'bg-white/70', border: 'border-slate-400', text: 'text-slate-600' }
};

const DOCTOR_COLORS = [
    { bg: 'bg-indigo-500/20/70', borderL: 'border-l-indigo-400', border: 'border-indigo-200/50', headerBg: 'bg-indigo-100/90', text: 'text-indigo-800', icon: 'text-indigo-600' },
    { bg: 'bg-emerald-500/20/70', borderL: 'border-l-emerald-400', border: 'border-emerald-200/50', headerBg: 'bg-emerald-100/90', text: 'text-emerald-800', icon: 'text-emerald-600' },
    { bg: 'bg-rose-500/20/70', borderL: 'border-l-rose-400', border: 'border-rose-200/50', headerBg: 'bg-rose-100/90', text: 'text-rose-800', icon: 'text-rose-600' },
    { bg: 'bg-amber-500/20/70', borderL: 'border-l-amber-400', border: 'border-amber-200/50', headerBg: 'bg-amber-100/90', text: 'text-amber-800', icon: 'text-amber-600' },
    { bg: 'bg-fuchsia-50/70', borderL: 'border-l-fuchsia-400', border: 'border-fuchsia-200/50', headerBg: 'bg-fuchsia-100/90', text: 'text-fuchsia-800', icon: 'text-fuchsia-600' },
    { bg: 'bg-cyan-50/70', borderL: 'border-l-cyan-400', border: 'border-cyan-200/50', headerBg: 'bg-cyan-100/90', text: 'text-cyan-800', icon: 'text-cyan-600' },
    { bg: 'bg-orange-50/70', borderL: 'border-l-orange-400', border: 'border-orange-200/50', headerBg: 'bg-orange-100/90', text: 'text-orange-800', icon: 'text-orange-600' },
    { bg: 'bg-lime-50/70', borderL: 'border-l-lime-400', border: 'border-lime-200/50', headerBg: 'bg-lime-100/90', text: 'text-lime-800', icon: 'text-lime-600' },
    { bg: 'bg-violet-50/70', borderL: 'border-l-violet-400', border: 'border-violet-200/50', headerBg: 'bg-violet-100/90', text: 'text-violet-800', icon: 'text-violet-600' },
    { bg: 'bg-sky-50/70', borderL: 'border-l-sky-400', border: 'border-sky-200/50', headerBg: 'bg-sky-100/90', text: 'text-sky-800', icon: 'text-sky-600' }
];

const getDoctorColorSet = (name) => {
    if (!name) return DOCTOR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return DOCTOR_COLORS[Math.abs(hash) % DOCTOR_COLORS.length];
};

// --- CONFIGURAÇÃO DA GRADE MATRIZ ---
const ROW_HEIGHT = 360;
const PIXELS_PER_MINUTE = ROW_HEIGHT / 60;
const DEFAULT_INTERVAL = 15;

const getDuration = (c, defaultInterval = 15) => {
    if (c.observacoes && String(c.observacoes).includes('[DUR:')) {
        const match = String(c.observacoes).match(/\[DUR:(\d+)\]/);
        if (match && match[1]) return Number(match[1]);
    }
    return defaultInterval;
};

const Agenda = () => {
    const { unidadeAtual, unidades } = useUnit();
    const [now, setNow] = useState(new Date());
    const scrollRef = useRef(null);
    const hasInitialScrolled = useRef(false);

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const [referenceDate, setReferenceDate] = useState(new Date(new Date().setHours(12, 0, 0, 0)));

    const [gradeConfig, setGradeConfig] = useState(() => {
        const saved = localStorage.getItem('agendaConfigMedcode');
        let parsed = saved ? JSON.parse(saved) : null;
        return parsed || {
            intervalo: 15,
            inicio: 7,
            fim: 20
        };
    });

    const START_HOUR = Number(gradeConfig.inicio) || 7;
    const END_HOUR = Number(gradeConfig.fim) || 20;

    useEffect(() => localStorage.setItem('agendaConfigMedcode', JSON.stringify(gradeConfig)), [gradeConfig]);

    const [medicosDisponiveis, setMedicosDisponiveis] = useState([]);
    const [medicosObjetos, setMedicosObjetos] = useState([]);
    const [cidadesDisponiveis, setCidadesDisponiveis] = useState([]);
    const [especialidadesDisponiveis, setEspecialidadesDisponiveis] = useState([]);

    const cleanText = (text) => {
        if (!text) return '';
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const { data: usersData } = await supabase.from('users').select('name').eq('role', 'Médico');
                if (usersData) {
                    const arrDocs = usersData
                        .map(u => ({ 
                            nome: u.name ? u.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim() : '', 
                            especialidade: '' 
                        }))
                        .filter(u => u.nome)
                        .sort((a, b) => a.nome.localeCompare(b.nome));
                    setMedicosDisponiveis(arrDocs.map(c => c.nome));
                    setMedicosObjetos(arrDocs);
                }

                const { data, error } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
                if (data && data.data) {
                    if (data.data.cidades) setCidadesDisponiveis(data.data.cidades.map(c => {
                        const name = typeof c === 'string' ? c : (c.nome || c.cidade || c);
                        return typeof name === 'string' ? name.toUpperCase().trim() : name;
                    }));
                    if (data.data.especialidades) setEspecialidadesDisponiveis(data.data.especialidades.map(e => {
                        const name = typeof e === 'string' ? e : (e.id || e);
                        return typeof name === 'string' ? name.toUpperCase().trim() : name;
                    }));
                }
            } catch (error) {
                console.error("Erro ao buscar configurações:", error);
            }
        };
        fetchSettings();
    }, []);

    const [consultas, setConsultas] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReagendarModalOpen, setIsReagendarModalOpen] = useState(false);
    const [consultaToReagendar, setConsultaToReagendar] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [detalhesConsulta, setDetalhesConsulta] = useState(null);

    const [actionMenu, setActionMenu] = useState(null);
    const [quickPatient, setQuickPatient] = useState(null);
    const [reschedulingMode, setReschedulingMode] = useState(null);
    const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
    const [gradeForm, setGradeForm] = useState({ tipo: 'Grade', data: '', inicio: '', fim: '', medico: '', unidade: unidadeAtual || '', observacoes: '', replicar: false, titulo: '' });

    const [saving, setSaving] = useState(false);
    const [buscaPaciente, setBuscaPaciente] = useState('');
    const [resultadosPacientes, setResultadosPacientes] = useState([]);
    const [buscandoPacientes, setBuscandoPacientes] = useState(false);

    const [isNovoPacienteModalOpen, setIsNovoPacienteModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [novoPacienteSaving, setNovoPacienteSaving] = useState(false);
    const [novoPacienteForm, setNovoPacienteForm] = useState({ nome: '', cpf: '', telefone: '', dataNascimento: '', municipio: '' });
    const [checkinData, setCheckinData] = useState(null);

    const initialForm = {
        paciente_id: null,
        paciente_nome: '',
        paciente_cpf: '',
        paciente_telefone: '',
        paciente_nascimento: '',
        medico: '',
        unidade: unidadeAtual || '',
        especialidade: 'Consulta',
        tipo_atendimento: 'Consulta',
        convenio: 'SUS',
        data_agendamento: '',
        horario: '',
        observacoes: '',
        link_anexo: ''
    };
    const [formData, setFormData] = useState(initialForm);

    const weekDays = useMemo(() => {
        const d = new Date(referenceDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);

        const week = [];
        for (let i = 0; i < 7; i++) {
            week.push(new Date(d));
            d.setDate(d.getDate() + 1);
        }
        return week;
    }, [referenceDate]);

    const paramDateStr = (dateObj) => {
        const d = new Date(dateObj);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
    };

    const prevWeek = () => {
        const newRef = new Date(referenceDate);
        newRef.setDate(newRef.getDate() - 7);
        setReferenceDate(newRef);
    };
    const nextWeek = () => {
        const newRef = new Date(referenceDate);
        newRef.setDate(newRef.getDate() + 7);
        setReferenceDate(newRef);
    };

    const fetchConsultas = async () => {
        setLoadingData(true);
        try {
            const startDate = paramDateStr(weekDays[0]);
            const endDate = paramDateStr(weekDays[6]);

            let query = supabase
                .from('consultas')
                .select('*')
                .gte('data_agendamento', startDate)
                .lte('data_agendamento', endDate);

            // Isola a agenda por unidade: cada hospital vê apenas a sua.
            // Só filtra quando há unidade selecionada na sessão (evita esvaziar a tela
            // antes do usuário escolher a unidade).
            if (unidadeAtual) {
                query = query.eq('unidade', unidadeAtual);
            }

            const { data, error } = await query;

            if (error) throw error;

            let cData = data || [];
            if (cData.length > 0) {
                const pacIds = [...new Set(cData.map(c => c.paciente_id).filter(id => id))];
                if (pacIds.length > 0) {
                    const { data: pacs } = await supabase.from('pacientes').select('id, municipio').in('id', pacIds);
                    if (pacs) {
                        const pacMap = pacs.reduce((acc, p) => ({ ...acc, [p.id]: p.municipio }), {});
                        cData = cData.map(c => ({ ...c, paciente_cidade: pacMap[c.paciente_id] || '' }));
                    }
                }
            }

            setConsultas(cData);
        } catch (error) {
            console.error("Erro:", error);
            toast.error("Erro ao carregar a agenda.");
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => { fetchConsultas(); }, [referenceDate, unidadeAtual]);

    useEffect(() => {
        if (!loadingData && scrollRef.current && !hasInitialScrolled.current) {
            const h = now.getHours();
            if (h >= START_HOUR && h <= END_HOUR) {
                const px = ((h - START_HOUR) * 60) * PIXELS_PER_MINUTE;
                scrollRef.current.scrollTop = Math.max(0, px - 100);
            }
            hasInitialScrolled.current = true;
        }
    }, [loadingData, START_HOUR, END_HOUR]);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (formData.paciente_id) {
                setResultadosPacientes([]);
                return;
            }
            if (buscaPaciente.length >= 3) {
                setBuscandoPacientes(true);
                const { data, error } = await supabase.from('pacientes').select('id, nome, cpf, telefone, dataNascimento').ilike('nome', `%${buscaPaciente}%`).limit(5);
                if (!error && data) setResultadosPacientes(data);
                setBuscandoPacientes(false);
            } else {
                setResultadosPacientes([]);
            }
        }, 400);
        return () => clearTimeout(delayDebounceFn);
    }, [buscaPaciente, formData.paciente_id]);

    const selecionarPaciente = (pac) => {
        setFormData({ ...formData, paciente_id: pac.id, paciente_nome: pac.nome, paciente_cpf: pac.cpf || '', paciente_telefone: pac.telefone || '', paciente_nascimento: pac.dataNascimento || '' });
        setBuscaPaciente(pac.nome);
        setResultadosPacientes([]);
    };

    const handleSaveNovoPaciente = async (e) => {
        e.preventDefault();
        setNovoPacienteSaving(true);
        try {
            const payload = {
                nome: novoPacienteForm.nome,
                cpf: novoPacienteForm.cpf || null,
                telefone: novoPacienteForm.telefone || null,
                municipio: novoPacienteForm.municipio || null,
                dataNascimento: novoPacienteForm.dataNascimento || null
            };
            const { data, error } = await supabase.from('pacientes').insert([payload]).select();
            if (error) throw error;
            await logAction('CRIAÇÃO DE PACIENTE', `Novo paciente cadastrado pela Agenda: ${payload.nome} (${payload.cpf || 'Sem CPF'}).`);
            if (data && data[0]) {
                toast.success("Paciente cadastrado com sucesso!");
                selecionarPaciente(data[0]);
                setIsNovoPacienteModalOpen(false);
                setNovoPacienteForm({ nome: '', cpf: '', telefone: '', dataNascimento: '', municipio: '' });
            }
        } catch (error) {
            toast.error("Erro ao cadastrar paciente.");
            console.error(error);
        } finally {
            setNovoPacienteSaving(false);
        }
    };

    const abrirNovoAgendamento = (dataString, horario, preMedico = '') => {
        const docName = preMedico ? preMedico.toUpperCase().trim() : '';
        const docObj = medicosObjetos.find(d => typeof d === 'object' && d.nome === docName);
        const spec = docObj && docObj.especialidade ? docObj.especialidade : '';

        setFormData({
            ...initialForm,
            data_agendamento: dataString,
            horario: horario,
            medico: docName,
            especialidade: spec
        });
        setBuscaPaciente('');
        setSelectedFile(null);
        setIsModalOpen(true);
    };

    const handleSaveAgendamento = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            let finalLink = formData.link_anexo;

            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `${fileName}`;

                const prontoParaSubir = await prepararArquivo(selectedFile, { maxMB: 10, tipos: TIPOS_DOCUMENTO_AMPLO });

                const { error: uploadError } = await supabase.storage
                    .from('anexos')
                    .upload(filePath, prontoParaSubir);

                if (uploadError) {
                    console.error(uploadError);
                    toast.error("Erro no anexo. Verifique se o bucket 'anexos' existe.");
                    throw uploadError;
                }

                // Bucket privado: guarda o caminho. `link_anexo` aceita link
                // externo digitado à mão também — quem abre resolve os dois.
                finalLink = finalLink ? `${finalLink},${filePath}` : filePath;
            }

            let payload = { ...formData, link_anexo: finalLink };
            let rError;

            if (formData.id) {
                const { error } = await supabase.from('consultas').update(payload).eq('id', formData.id);
                rError = error;
                if (!error) await logAction('EDIÇÃO DE AGENDAMENTO', `Agendamento editado para ${payload.paciente_nome || 'Desconhecido'}.`);
            } else {
                payload.status = 'Agendado';
                const { error } = await supabase.from('consultas').insert([payload]);
                rError = error;
                if (!error) await logAction('CRIAÇÃO DE AGENDAMENTO', `Novo agendamento para ${payload.paciente_nome || 'Desconhecido'} no dia ${payload.data_agendamento}.`);
            }

            if (rError) throw rError;
            toast.success(formData.id ? "Agendamento atualizado com sucesso!" : "Agendamento criado!");
            setSelectedFile(null);
            setIsModalOpen(false);
            fetchConsultas();
        } catch (error) {
            toast.error("Erro ao salvar agendamento.");
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateStatus = async (id, novoStatus, confirmacao = null) => {
        try {
            const payload = {};
            if (novoStatus) payload.status = novoStatus;
            if (confirmacao !== null) payload.confirmado = confirmacao;

            const { error } = await supabase.from('consultas').update(payload).eq('id', id);
            if (error) throw error;
            await logAction('ATUALIZAÇÃO DE STATUS', `Status/Confirmação de agendamento alterado para ${novoStatus || (confirmacao ? 'Confirmado' : 'Não Confirmado')}.`);
            toast.success(novoStatus ? `Status alterado!` : (confirmacao ? "Presença confirmada!" : "Confirmação removida."));
            fetchConsultas();
            setDetalhesConsulta(null);
        } catch (error) { toast.error("Erro ao atualizar sistema."); }
    };

    const handleReagendar = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { error } = await supabase.from('consultas').update({ data_agendamento: formData.data_agendamento, horario: formData.horario }).eq('id', consultaToReagendar.id);
            if (error) throw error;
            await logAction('REAGENDAMENTO', `Consulta reagendada para ${formData.data_agendamento} às ${formData.horario}.`);
            toast.success("Reagendado!");
            setIsReagendarModalOpen(false);
            setDetalhesConsulta(null);
            fetchConsultas();
        } catch (error) { toast.error("Erro ao reagendar."); }
        finally { setSaving(false); }
    };

    const handleSaveReagendamentoVis = async (id, novaData, novoHorario) => {
        setSaving(true);
        const loadToast = toast.loading("Movendo agendamento...");
        try {
            const { error } = await supabase.from('consultas').update({ data_agendamento: novaData, horario: novoHorario }).eq('id', id);
            if (error) throw error;
            await logAction('REAGENDAMENTO VISUAL', `Consulta arrastada para ${novaData} às ${novoHorario}.`);
            toast.success("Paciente reagendado com sucesso!", { id: loadToast });
            setReschedulingMode(null);
            fetchConsultas();
        } catch (error) { toast.error("Erro ao reagendar.", { id: loadToast }); setSaving(false); }
    };

    const handleDeleteAgendamento = async (id) => {
        try {
            const consulta = consultas.find(c => c.id === id);
            const { error } = await supabase.from('consultas').delete().eq('id', id);
            if (error) {
                if (error.code === '23503' || String(error.message).includes('foreign key') || String(error).includes('409') || error.code === '409') {
                    toast.error("Não é possível apagar: já existem dados ou prontuários vinculados a esta consulta. Em vez de excluir, use a opção 'Desistiu' ou 'Cancelado'.", { duration: 6000 });
                    return;
                }
                throw error;
            }
            if (consulta) {
                await logAction('EXCLUSÃO DE AGENDAMENTO', `Agendamento do paciente ${consulta.paciente_nome || 'Desconhecido'} do dia ${consulta.data_agendamento} excluído.`);
            }
            toast.success("Agendamento excluído definitivamente!");
            fetchConsultas();
        } catch (error) { toast.error("Erro ao excluir."); console.error(error); }
    };

    const mapConsultas = useMemo(() => {
        const mapa = { grades: {}, bloqueios: {}, subreservas: {}, agendamentos: {} };

        consultas.forEach(c => {
            if (searchTerm && !['Grade', 'Bloqueio', 'SubReserva'].includes(c.status) && !c.paciente_nome?.toLowerCase().includes(searchTerm.toLowerCase())) return;

            const dStr = c.data_agendamento;
            let targetMap = mapa.agendamentos;

            if (c.status === 'Grade') targetMap = mapa.grades;
            else if (c.status === 'Bloqueio') targetMap = mapa.bloqueios;
            else if (c.status === 'SubReserva') targetMap = mapa.subreservas;

            if (!targetMap[dStr]) targetMap[dStr] = [];

            const dur = getDuration(c, Number(gradeConfig.intervalo));
            let hString = c.horario?.substring(0, 5) || '00:00';
            const [h, m] = hString.split(':').map(Number);

            if (isNaN(h) || isNaN(m)) return;

            const top = ((h - START_HOUR) * 60 + m) * PIXELS_PER_MINUTE;
            const height = dur * PIXELS_PER_MINUTE;

            targetMap[dStr].push({ ...c, rawTime: hString, top, height });
        });

        Object.keys(mapa.agendamentos).forEach(dStr => {
            let dayAps = mapa.agendamentos[dStr];
            dayAps.sort((a, b) => a.top - b.top);
            for (let i = 0; i < dayAps.length - 1; i++) {
                const cur = dayAps[i];
                const next = dayAps[i + 1];
                if (cur.top + cur.height > next.top) {
                    cur.height = Math.max(next.top - cur.top, 24);
                }
            }
        });

        return mapa;
    }, [consultas, searchTerm, gradeConfig.intervalo, START_HOUR, END_HOUR]);

    const getLinhaTempoPx = () => {
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        if (currentH < START_HOUR || currentH > END_HOUR) return null;
        return ((currentH - START_HOUR) * 60 + currentM) * PIXELS_PER_MINUTE;
    };

    const handleAreaClick = (e, dataStr) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;

        const minutesFromStart = Math.max(0, y / PIXELS_PER_MINUTE);
        const totalMinutes = START_HOUR * 60 + minutesFromStart;

        const intv = parseInt(gradeConfig.intervalo);
        const snappedMinutes = Math.floor(totalMinutes / intv) * intv;
        const hh = Math.floor(snappedMinutes / 60);
        const mm = snappedMinutes % 60;
        const hrObj = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

        let foundMedico = '';
        const gradesDoDia = mapConsultas.grades[dataStr] || [];
        for (const g of gradesDoDia) {
            const gDur = getDuration(g);
            const [gh, gm] = g.rawTime.split(':').map(Number);
            const startMins = gh * 60 + gm;
            const endMins = startMins + gDur;
            if (totalMinutes >= startMins && totalMinutes < endMins) {
                foundMedico = g.medico;
                break;
            }
        }

        let isBlocked = false;
        const bloqueiosDoDia = mapConsultas.bloqueios[dataStr] || [];
        for (const b of bloqueiosDoDia) {
            const bDur = getDuration(b);
            const [bh, bm] = b.rawTime.split(':').map(Number);
            const startMins = bh * 60 + bm;
            const endMins = startMins + bDur;
            if (totalMinutes >= startMins && totalMinutes < endMins) {
                isBlocked = true;
                break;
            }
        }

        if (reschedulingMode) {
            if (isBlocked) {
                toast.error("Horário bloqueado! Escolha outro horário.");
                return;
            }
            if (!window.confirm(`Confirmar novo horário para ${reschedulingMode.paciente_nome}: ${dataStr.split('-').reverse().join('/')} às ${hrObj}?`)) return;

            handleSaveReagendamentoVis(reschedulingMode.id, dataStr, hrObj);
            return;
        }

        setActionMenu({ x: e.clientX, y: e.clientY, dataStr, horario: hrObj, preMedico: foundMedico, isBlocked });
    };

    const abrirGradeFixaModal = (tipo, menuData) => {
        const addMins = (hhmm, mAdd) => {
            const [h, m] = hhmm.split(':').map(Number);
            const total = h * 60 + m + mAdd;
            return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        };

        setGradeForm({
            tipo,
            data: menuData.dataStr,
            inicio: menuData.horario,
            fim: addMins(menuData.horario, tipo === 'SubReserva' ? 60 : 120),
            medico: menuData.preMedico || '',
            unidade: unidadeAtual || '',
            titulo: '',
            observacoes: '',
            replicar: false
        });
        setIsGradeModalOpen(true);
    };

    const handleSaveGrade = async (e) => {
        e.preventDefault();
        const [h1, m1] = gradeForm.inicio.split(':').map(Number);
        const [h2, m2] = gradeForm.fim.split(':').map(Number);
        const diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);

        if (diffMins <= 0) {
            toast.error("O horário de término deve ser DEPOIS do início.");
            return;
        }

        setSaving(true);
        try {
            const obsEspecial = gradeForm.observacoes ? `${gradeForm.observacoes} [DUR:${diffMins}]` : `[DUR:${diffMins}]`;

            let pacNome = '[BLOQUEIO]';
            let med = '';

            if (gradeForm.tipo === 'Grade') {
                pacNome = `[BLOCO ${gradeForm.medico}]`;
                med = gradeForm.medico;
            } else if (gradeForm.tipo === 'SubReserva') {
                pacNome = gradeForm.titulo ? `[SUB-RESERVA: ${gradeForm.titulo}]` : '[SUB-RESERVA]';
                med = gradeForm.medico;
            }

            const payloadTemplate = {
                paciente_nome: pacNome,
                medico: med,
                horario: gradeForm.inicio,
                status: gradeForm.tipo,
                observacoes: obsEspecial,
                unidade: gradeForm.unidade
            };

            const payloads = [];
            payloads.push({ ...payloadTemplate, data_agendamento: gradeForm.data });

            if (gradeForm.replicar) {
                let dateObj = new Date(gradeForm.data + 'T12:00:00');
                const mesAtual = dateObj.getMonth();

                for (let i = 0; i < 4; i++) {
                    dateObj.setDate(dateObj.getDate() + 7);
                    if (dateObj.getMonth() !== mesAtual) break;
                    payloads.push({ ...payloadTemplate, data_agendamento: paramDateStr(dateObj) });
                }
            }

            const { error } = await supabase.from('consultas').insert(payloads);
            if (error) throw error;
            await logAction('CRIAÇÃO DE GRADE', `Criado bloco de ${gradeForm.tipo} para ${gradeForm.medico || 'N/A'}.`);
            toast.success(`${gradeForm.tipo} inserido com sucesso!`);
            setIsGradeModalOpen(false);
            fetchConsultas();
        } catch (error) {
            toast.error(`Erro ao criar ${gradeForm.tipo}.`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteGrade = async (id, isBloqueio = false, isSubReserva = false) => {
        const msg = isBloqueio
            ? "Deseja remover esse bloqueio?"
            : (isSubReserva ? "Deseja remover essa sub-reserva?" : "Deseja remover esse bloco médico? Apenas a restrição será apagada, os agendamentos já contidos nele permanecerão intactos.");
        if (!window.confirm(msg)) return;
        try {
            const consulta = consultas.find(c => c.id === id);
            const { error } = await supabase.from('consultas').delete().eq('id', id);
            if (error) throw error;
            if (consulta) {
                await logAction('EXCLUSÃO DE GRADE/BLOQUEIO', `Grade/Bloqueio: ${consulta.paciente_nome || 'Desconhecido'} do dia ${consulta.data_agendamento} removido.`);
            }
            toast.success("Bloco removido!");
            fetchConsultas();
        } catch (error) { toast.error("Erro ao deletar."); }
    };

    const hojePuro = paramDateStr(now);
    const inputStyle = "w-full h-9 px-3 bg-white/60 border border-white/80 rounded text-xs outline-none focus:border-blue-500 text-slate-900 drop-shadow-none";
    const labelStyle = "text-[11px] font-semibold text-slate-500 uppercase ml-1 block mb-1";

    return (
        <div className="flex flex-col h-full bg-white/60 font-sans" onClick={() => actionMenu && setActionMenu(null)}>

            <div className="h-14 bg-white/60 border-b border-white/60 flex items-center justify-between px-4 shrink-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 text-white rounded shadow-sm"><CalendarDays size={16} /></div>
                    <h1 className="hidden sm:block text-sm font-black text-slate-900 drop-shadow-none uppercase tracking-wider">Agenda de Consultas</h1>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative w-48 hidden md:block">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input type="text" placeholder="Buscar Paciente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-8 pl-8 pr-3 bg-white/70 border-none rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 transition-all font-medium" />
                    </div>
                    <button onClick={() => setIsImportModalOpen(true)} className="h-8 px-2 sm:px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-600 hover:text-emerald-600 rounded text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 shadow-sm shrink-0" title="Importar grade de consultas (PDF/Texto)">
                        <FileText size={14} /> <span className="hidden sm:inline">Importar</span>
                    </button>
                    <button onClick={() => setIsConfigModalOpen(true)} className="h-8 px-2 sm:px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-600 hover:text-blue-600 rounded text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 shadow-sm shrink-0" title="Personalizar visualização da grade neste dispositivo">
                        <Settings size={14} /> <span className="hidden sm:inline">Ajustar Grade</span>
                    </button>
                    <button onClick={() => abrirNovoAgendamento(hojePuro, '08:00', '')} className="h-8 px-2 sm:px-3 bg-blue-600 text-white rounded text-[11px] font-bold uppercase shadow-sm hover:bg-blue-700 transition-all flex items-center gap-1.5 shrink-0">
                        <Plus size={14} /> <span className="hidden sm:inline">Agendar</span>
                    </button>
                </div>
            </div>

            <div className="h-10 bg-white/60 border-b border-white/60 flex items-center justify-between px-4 shrink-0 z-40">
                <div className="flex items-center gap-2">
                    <button onClick={prevWeek} className="p-1 hover:bg-white/80 text-slate-600 rounded"><ChevronLeft size={16} /></button>
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide px-2 min-w-[140px] text-center">
                        {weekDays[0].getDate()}/{weekDays[0].getMonth() + 1} - {weekDays[6].getDate()}/{weekDays[6].getMonth() + 1}
                    </div>
                    <button onClick={nextWeek} className="p-1 hover:bg-white/80 text-slate-600 rounded"><ChevronRight size={16} /></button>
                    <button onClick={() => setReferenceDate(new Date(new Date().setHours(12, 0, 0, 0)))} className="ml-2 px-3 py-1 bg-white/60 border border-white/80 text-[11px] font-bold text-slate-600 uppercase rounded hover:bg-white/70 hover:text-slate-900 drop-shadow-none transition shadow-sm">Hoje</button>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-semibold text-slate-500 uppercase tracking-widest hidden sm:flex">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-400 border border-blue-600"></div> Agendado</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-400 border border-amber-600"></div> Recepção</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-400 border border-purple-600"></div> Cons.</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-400 border border-emerald-600"></div> Fim</span>
                    <span className="flex items-center gap-1 opacity-50"><div className="w-2 h-2 bg-slate-700 border border-slate-800"></div> Bloqueio</span>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-white/70 relative" ref={scrollRef}>
                <div className="min-w-[2400px] flex flex-col relative pb-20">

                    <div className="flex sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm backdrop-blur-md">
                        <div className="w-16 shrink-0 border-r border-slate-200 bg-slate-50 sticky left-0 z-20"></div>
                        {weekDays.map((dayObj, i) => {
                            const isToday = paramDateStr(dayObj) === hojePuro;
                            return (
                                <div key={i} className={`flex-1 min-w-0 border-r border-slate-200 h-12 flex flex-col items-center justify-center relative ${isToday ? 'bg-blue-50/70' : 'bg-slate-50'} hover:bg-slate-100/50 transition-colors`}>
                                    <span className={`text-xs font-black uppercase tracking-wider ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>
                                        {DIAS_NOME[i]} {dayObj.getDate().toString().padStart(2, '0')}/{String(dayObj.getMonth() + 1).padStart(2, '0')}
                                    </span>
                                    {isToday && <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600 rounded-b"></div>}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex relative bg-white mt-10 shadow-sm border border-slate-200 rounded-sm mx-1" style={{ height: `${(END_HOUR - START_HOUR + 1) * ROW_HEIGHT}px` }}>
                        {loadingData && (
                            <div className="absolute inset-0 z-50 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                                <Loader2 size={30} className="animate-spin text-blue-500" />
                            </div>
                        )}

                        <div className="w-16 shrink-0 border-r border-slate-200 bg-slate-50 sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                            {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, idx) => {
                                const h = START_HOUR + idx;
                                const steps = 60 / gradeConfig.intervalo;
                                const stepPx = ROW_HEIGHT / steps;

                                return (
                                    <div key={idx} className="w-full flex flex-col border-b border-slate-200" style={{ height: `${ROW_HEIGHT}px` }}>
                                        {Array.from({ length: steps }).map((_, stepIdx) => {
                                            const min = stepIdx * gradeConfig.intervalo;
                                            return (
                                                <div key={stepIdx} className="w-full flex justify-center items-start pt-1 text-[10px] font-semibold text-slate-500 border-r border-slate-200" style={{ height: `${stepPx}px` }}>
                                                    <div className={`${stepIdx === 0 ? 'text-[11px] font-bold text-slate-500' : 'opacity-60 text-[8.5px]'} px-1 leading-none uppercase`}>
                                                        {String(h).padStart(2, '0')}:{String(min).padStart(2, '0')}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>

                        {weekDays.map((dayObj, i) => {
                            const dataLocalStr = paramDateStr(dayObj);
                            const isToday = dataLocalStr === hojePuro;

                            return (
                                <div
                                    key={dataLocalStr}
                                    className={`flex-1 min-w-0 border-r border-slate-200 relative cursor-pointer ${isToday ? 'bg-blue-50/20' : 'bg-white'} hover:bg-slate-50/40 transition-colors`}
                                    onClick={(e) => handleAreaClick(e, dataLocalStr)}
                                >
                                    <div className="absolute inset-0 z-0 pointer-events-none day-column">
                                        {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, idx) => {
                                            const steps = 60 / gradeConfig.intervalo;
                                            const stepPx = ROW_HEIGHT / steps;
                                            return (
                                                <div key={idx} className="w-full border-b border-slate-300 grid-line flex flex-col" style={{ height: `${ROW_HEIGHT}px` }}>
                                                    {Array.from({ length: steps }).map((_, stepIdx) => (
                                                        <div key={stepIdx} className={`w-full ${stepIdx < steps - 1 ? 'border-b border-dashed border-slate-200' : ''}`} style={{ height: `${stepPx}px` }}></div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {mapConsultas.grades[dataLocalStr]?.map(grade => {
                                        const color = getDoctorColorSet(grade.medico);
                                        return (
                                            <div
                                                key={grade.id}
                                                className={`absolute left-[2px] right-[2px] rounded-b-sm ${color.bg} border-l-[4px] ${color.borderL} border ${color.border} border-t-0 p-1.5 overflow-visible group flex flex-col pointer-events-none`}
                                                style={{ top: `${grade.top}px`, height: `${grade.height}px`, zIndex: 10 }}
                                            >
                                                <div className={`absolute left-[-4px] right-[-1px] pointer-events-auto flex flex-col shadow-sm border ${color.border} border-l-[4px] ${color.borderL} rounded-t-lg z-20`} style={{ transform: 'translateY(-100%)', top: '0px', backgroundColor: 'white' }}>
                                                    <div className={`${color.headerBg} px-2 py-0.5 flex justify-between items-center border-b ${color.border} rounded-t-lg backdrop-blur-sm`}>
                                                        <div className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${color.text}`}>
                                                            <CalendarCheck size={10} className={color.icon} />
                                                            {grade.medico}
                                                        </div>
                                                        <button onClick={(eb) => { eb.stopPropagation(); handleDeleteGrade(grade.id); }} className={`p-0.5 text-slate-500 hover:text-rose-500 rounded pointer-events-auto transition-colors focus:outline-none`} title="Apagar Bloco de Horário"><X size={12} /></button>
                                                    </div>
                                                    {grade.observacoes && grade.observacoes.replace(/\[DUR:\d+\]/, '').trim() && (
                                                        <div className={`px-2 py-1 text-[10px] font-bold uppercase flex-1 leading-tight ${color.text} opacity-80`}>
                                                            {grade.observacoes.replace(/\[DUR:\d+\]/, '').trim()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {mapConsultas.bloqueios[dataLocalStr]?.map((bloq, idx) => (
                                        <div
                                            key={bloq.id}
                                            className="absolute left-[2px] right-[2px] rounded border border-white/80 border-dashed z-20 p-1.5 overflow-hidden flex flex-col items-center justify-center pointer-events-none"
                                            style={{
                                                top: `${bloq.top}px`,
                                                height: `${bloq.height}px`,
                                                backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.02), rgba(0,0,0,0.02) 10px, transparent 10px, transparent 20px)'
                                            }}
                                        >
                                            <div className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-1 bg-white/60 px-2 py-0.5 rounded shadow-sm border border-white/60">
                                                <AlertCircle size={10} /> BLOQUEADO
                                            </div>
                                            {bloq.observacoes && bloq.observacoes.replace(/\[DUR:\d+\]/, '').trim() && (
                                                <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase text-center bg-white/60 px-1.5 py-0.5 rounded max-w-full truncate border border-white/40">
                                                    {bloq.observacoes.replace(/\[DUR:\d+\]/, '').trim()}
                                                </div>
                                            )}
                                            <button onClick={(eb) => { eb.stopPropagation(); handleDeleteGrade(bloq.id, true); }} className="absolute top-1 right-1 p-1 text-slate-500 hover:text-red-500 hover:bg-red-50 pointer-events-auto bg-white/60 rounded shadow-sm border border-white/60 transition-colors z-50" title="Desfazer Bloqueio"><X size={12} strokeWidth={3} className="opacity-70" /></button>
                                        </div>
                                    ))}

                                    {mapConsultas.subreservas[dataLocalStr]?.map((subr) => (
                                        <div
                                            key={subr.id}
                                            className="absolute left-[4px] right-[4px] rounded border-2 border-cyan-400 border-dashed z-[25] p-1 overflow-hidden flex flex-col items-center justify-center pointer-events-none bg-cyan-50/70"
                                            style={{
                                                top: `${subr.top}px`,
                                                height: `${subr.height}px`
                                            }}
                                        >
                                            <div className="text-[11px] font-black uppercase text-cyan-800 flex items-center gap-1 bg-white/90 px-2 py-0.5 rounded shadow-sm border border-cyan-200">
                                                <CalendarClock size={10} /> {subr.paciente_nome.replace('[SUB-RESERVA: ', '').replace(']', '').replace('[SUB-RESERVA]', 'Sub-Reserva')}
                                            </div>
                                            {subr.observacoes && subr.observacoes.replace(/\[DUR:\d+\]/, '').trim() && (
                                                <div className="text-[10px] font-bold text-cyan-700 mt-1 uppercase text-center bg-white/80 px-1.5 py-0.5 rounded max-w-full truncate border border-cyan-100">
                                                    {subr.observacoes.replace(/\[DUR:\d+\]/, '').trim()}
                                                </div>
                                            )}
                                            <button onClick={(eb) => { eb.stopPropagation(); handleDeleteGrade(subr.id, false, true); }} className="absolute top-1 right-1 p-1 text-slate-500 hover:text-cyan-600 hover:bg-cyan-100 pointer-events-auto bg-white/60 rounded shadow-sm border border-cyan-200 transition-colors z-[60]" title="Excluir Sub-reserva"><X size={12} strokeWidth={3} className="opacity-70" /></button>
                                        </div>
                                    ))}

                                    {mapConsultas.agendamentos[dataLocalStr]?.map(agend => {
                                        const st = STATUS_COLORS[agend.status] || STATUS_COLORS['Agendado'];
                                        return (
                                            <div
                                                key={agend.id}
                                                onClick={(e) => { e.stopPropagation(); setQuickPatient({ x: e.clientX, y: e.clientY, agend }); }}
                                                className={`absolute left-[6px] right-[6px] rounded shadow-sm border ${st.bg} border-white/60 border-l-[3px] ${st.border} z-30 px-1.5 py-1 cursor-pointer hover:shadow-md transition-shadow hover:scale-[1.01] flex flex-col justify-start overflow-hidden`}
                                                style={{ top: `${agend.top}px`, height: `${agend.height}px` }}
                                            >
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    <div className={`text-[11px] font-bold leading-none flex items-center gap-1 mt-0.5 ${agend.status === 'Cancelado' || agend.status === 'Faltou' || agend.status === 'Desistiu' ? 'opacity-60 text-slate-700' : 'text-slate-900 drop-shadow-none'}`}>
                                                        <span className="bg-white/70 text-slate-700 px-1 py-[1px] rounded text-[10px] font-black tracking-normal shrink-0 border border-white/40">{agend.rawTime}</span>
                                                        <div className="flex gap-0.5 shrink-0 ml-0.5">
                                                            {agend.confirmado && <ThumbsUp size={12} className="text-blue-500" title="Confirmado" />}
                                                            {agend.status === 'Aguardando' && <UserCheck size={12} className="text-amber-500" title="Na Recepção" />}
                                                            {agend.status === 'Atendido' && <CheckCircle2 size={12} className="text-emerald-500" title="Atendido" />}
                                                            {agend.status === 'Faltou' && <UserX size={12} className="text-rose-600" title="Faltou" />}
                                                            {agend.status === 'Desistiu' && <Ban size={12} className="text-slate-500" title="Desistiu" />}
                                                            {agend.status === 'Cancelado' && <XCircle size={12} className="text-rose-500" title="Cancelado" />}
                                                        </div>
                                                        <span className={`truncate flex-1 min-w-0 ml-0.5 ${agend.status === 'Cancelado' || agend.status === 'Desistiu' ? 'line-through' : ''}`} title={agend.paciente_nome}>
                                                            {agend.paciente_nome}
                                                        </span>
                                                        <span className="opacity-70 shrink-0 font-semibold tracking-normal text-[10px] whitespace-nowrap">
                                                            {agend.paciente_telefone || 'S/ Fone'}
                                                        </span>
                                                    </div>
                                                    {agend.height >= 25 && (
                                                        <div className={`text-[10px] font-bold ${agend.status === 'Agendado' ? 'text-blue-600/90' : 'text-slate-600'} mt-[3px] truncate flex items-center gap-1 uppercase leading-tight tracking-normal`}>
                                                            {agend.unidade || 'S/ UNIDADE'} {agend.medico && `• ${agend.medico.split(' ').slice(0, 2).join(' ')}`}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {isToday && getLinhaTempoPx() !== null && (
                                        <div className="absolute left-0 right-0 z-40 pointer-events-none" style={{ top: `${getLinhaTempoPx()}px` }}>
                                            <div className="h-[2px] w-full bg-red-500 relative">
                                                <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm"></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {actionMenu && (
                <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setActionMenu(null)}></div>
                    <div
                        className="fixed z-[9999] bg-white/60 rounded-lg shadow-xl border border-white/60 w-56 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                        style={{ top: Math.min(actionMenu.y, window.innerHeight - 250), left: Math.min(actionMenu.x, window.innerWidth - 224) }}
                    >
                        <div className="bg-white/60 border-b border-white/60 px-3 py-2 flex justify-between items-start">
                            <div>
                                <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Data e Horário Referência</div>
                                <div className="text-xs font-bold text-blue-900 mt-0.5">{actionMenu.dataStr.split('-').reverse().join('/')} às {actionMenu.horario}</div>
                                {actionMenu.preMedico && <div className="text-[10px] font-bold text-blue-600 mt-0.5 uppercase bg-blue-100 px-1 inline-block rounded">Bloco: {actionMenu.preMedico}</div>}
                            </div>
                            <button onClick={() => setActionMenu(null)} className="text-slate-500 hover:bg-white/80 rounded p-0.5"><X size={14} /></button>
                        </div>

                        {!actionMenu.isBlocked ? (
                            <button
                                onClick={() => { abrirNovoAgendamento(actionMenu.dataStr, actionMenu.horario, actionMenu.preMedico); setActionMenu(null); }}
                                className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-blue-500/20 hover:text-blue-700 text-left border-b border-white/40 transition-colors"
                            >
                                <UserPlus size={14} className="text-blue-500" /> Agendar Paciente
                            </button>
                        ) : (
                            <div className="px-3 py-2.5 text-xs font-bold text-rose-400 bg-rose-500/20 flex items-center gap-2 border-b border-rose-100">
                                <AlertCircle size={14} className="text-rose-500" /> Horário Bloqueado
                            </div>
                        )}

                        <button
                            onClick={() => { abrirGradeFixaModal('Grade', actionMenu); setActionMenu(null); }}
                            className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-emerald-500/20 hover:text-emerald-700 text-left border-b border-white/40 transition-colors"
                        >
                            <CalendarCheck size={14} /> Reservar Bloco Médico
                        </button>

                        <button
                            onClick={() => { abrirGradeFixaModal('SubReserva', actionMenu); setActionMenu(null); }}
                            className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-cyan-50 hover:text-cyan-700 text-left border-b border-white/40 transition-colors"
                        >
                            <CalendarClock size={14} className="text-cyan-500" /> Criar Sub-Reserva
                        </button>

                        <button
                            onClick={() => { abrirGradeFixaModal('Bloqueio', actionMenu); setActionMenu(null); }}
                            className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-rose-500/20 hover:text-rose-700 text-left transition-colors"
                        >
                            <AlertCircle size={14} /> Bloquear Horário
                        </button>
                    </div>
                </>
            )}

            {quickPatient && (
                <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setQuickPatient(null)}></div>
                    <div
                        className="fixed z-[9999] bg-white/60 rounded-lg shadow-xl border border-white/60 w-56 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                        style={{ top: Math.min(quickPatient.y, window.innerHeight - 420), left: Math.min(quickPatient.x, window.innerWidth - 224) }}
                    >
                        <div className="bg-white/60 border-b border-white/60 px-3 py-2 flex justify-between items-start">
                            <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                    <div className={`text-[11px] font-black uppercase flex-1 truncate ${STATUS_COLORS[quickPatient.agend.status]?.text || 'text-slate-500'}`} title={quickPatient.agend.paciente_nome}>{quickPatient.agend.paciente_nome}</div>
                                    <button onClick={() => {
                                        setFormData({
                                            id: quickPatient.agend.id,
                                            paciente_id: quickPatient.agend.paciente_id,
                                            paciente_nome: quickPatient.agend.paciente_nome,
                                            paciente_cpf: quickPatient.agend.paciente_cpf,
                                            paciente_telefone: quickPatient.agend.paciente_telefone,
                                            paciente_nascimento: quickPatient.agend.paciente_nascimento || '',
                                            medico: quickPatient.agend.medico ? quickPatient.agend.medico.toUpperCase().trim() : '',
                                            especialidade: quickPatient.agend.especialidade ? quickPatient.agend.especialidade.toUpperCase().trim() : '',
                                            tipo_atendimento: quickPatient.agend.tipo_atendimento,
                                            convenio: quickPatient.agend.convenio,
                                            unidade: quickPatient.agend.unidade,
                                            data_agendamento: quickPatient.agend.data_agendamento,
                                            horario: quickPatient.agend.horario,
                                            observacoes: quickPatient.agend.observacoes,
                                            link_anexo: quickPatient.agend.link_anexo || ''
                                        });
                                        setBuscaPaciente(quickPatient.agend.paciente_nome);
                                        setSelectedFile(null);
                                        setIsModalOpen(true);
                                        setQuickPatient(null);
                                    }} className="text-slate-500 hover:text-amber-500 shrink-0 transition-colors" title="Editar Agendamento"><Pencil size={10} strokeWidth={3} /></button>
                                    <button onClick={() => { handleUpdateStatus(quickPatient.agend.id, 'Agendado', false); setQuickPatient(null); }} className="text-slate-500 shrink-0 hover:text-blue-600 transition-colors" title="Limpar todos os status (Voltar p/ Agendado)"><RefreshCw size={10} strokeWidth={3} /></button>
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate" title={`${quickPatient.agend.paciente_cidade || 'Sem Cidade'} • ${quickPatient.agend.medico?.split(' ')[0]}`}>{quickPatient.agend.paciente_cidade || 'Sem Cidade'} • {quickPatient.agend.medico?.split(' ')[0]}</div>
                            </div>
                            <button onClick={() => setQuickPatient(null)} className="text-slate-500 hover:bg-white/80 rounded p-0.5 shrink-0"><X size={14} /></button>
                        </div>

                        {!quickPatient.agend.confirmado ? (
                            <button onClick={() => { handleUpdateStatus(quickPatient.agend.id, null, true); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-blue-500/20 hover:text-blue-700 text-left border-b border-white/40 transition-colors">
                                <ThumbsUp size={14} className="text-blue-500" /> Confirmar Presença
                            </button>
                        ) : (
                            <button onClick={() => { handleUpdateStatus(quickPatient.agend.id, null, false); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white/70 text-left border-b border-white/40 transition-colors">
                                <ThumbsDown size={14} className="text-slate-500" /> Desfazer Confirmação
                            </button>
                        )}

                        <button onClick={async () => {
                            const agendId = quickPatient.agend.id;
                            const pacId = quickPatient.agend.paciente_id;
                            setQuickPatient(null);

                            if (pacId) {
                                toast.loading("Carregando prontuário...", { id: 'chekinToast' });
                                const { data } = await supabase.from('pacientes').select('*').eq('id', pacId).single();
                                toast.dismiss('chekinToast');
                                if (data) {
                                    setCheckinData({ agendId, paciente: data });
                                    return;
                                }
                            }

                            handleUpdateStatus(agendId, 'Aguardando');
                        }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-amber-500/20 hover:text-amber-700 text-left border-b border-white/40 transition-colors">
                            <UserCheck size={14} className="text-amber-500" /> Fazer Check-in (Recepção)
                        </button>

                        <button onClick={() => { handleUpdateStatus(quickPatient.agend.id, 'Faltou'); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-rose-500/20 hover:text-rose-700 text-left border-b border-white/40 transition-colors">
                            <UserX size={14} className="text-rose-500" /> Marcar Faltou
                        </button>

                        <button onClick={() => { handleUpdateStatus(quickPatient.agend.id, 'Desistiu'); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white/70 hover:text-slate-600 text-left border-b border-white/40 transition-colors">
                            <Ban size={14} className="text-slate-500" /> Marcar Desistiu
                        </button>

                        <button onClick={() => { handleUpdateStatus(quickPatient.agend.id, 'Em Atendimento'); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 text-left border-b border-white/40 transition-colors">
                            <Stethoscope size={14} className="text-purple-500" /> Chamar Consultório
                        </button>

                        <button onClick={() => { handleUpdateStatus(quickPatient.agend.id, 'Atendido'); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-500/20 hover:text-emerald-700 text-left border-b border-white/40 transition-colors">
                            <CheckCircle2 size={14} className="text-emerald-500" /> Finalizar Atendimento
                        </button>

                        <button onClick={() => { setReschedulingMode(quickPatient.agend); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-amber-500/20 hover:text-amber-700 text-left border-b border-white/40 transition-colors">
                            <CalendarClock size={14} className="text-amber-500" /> Mover / Reagendar
                        </button>

                        {quickPatient.agend.link_anexo && quickPatient.agend.link_anexo.split(',').filter(l => l.trim()).map((link, idx, arr) => (
                            <a key={idx} href={link.trim()} onClick={aoClicarNoArquivo(link.trim(), 'anexos')} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white/70 hover:text-slate-800 text-left border-b border-white/40 transition-colors cursor-pointer">
                                <Paperclip size={14} className="text-slate-500" /> Visualizar Anexo {arr.length > 1 ? idx + 1 : ''}
                            </a>
                        ))}

                        <button onClick={() => { if (window.confirm('Excluir este agendamento definitivamente?')) handleDeleteAgendamento(quickPatient.agend.id); setQuickPatient(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-500/20 text-left transition-colors">
                            <XCircle size={14} /> Excluir Registro
                        </button>
                    </div>
                </>
            )}

            {reschedulingMode && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] bg-white/40 border border-slate-700 text-slate-800 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5">
                    <div className="flex items-center gap-2">
                        <CalendarClock size={18} className="text-amber-400" />
                        <span className="text-sm font-medium">Selecione o novo horário na Agenda para <strong className="text-amber-400 font-bold uppercase">{reschedulingMode.paciente_nome}</strong></span>
                    </div>
                    <div className="h-6 w-px bg-slate-700"></div>
                    <button onClick={() => setReschedulingMode(null)} className="text-[11px] font-black text-slate-500 hover:text-slate-800 uppercase px-2 hover:bg-white/50 rounded py-1 transition-colors">Cancelar</button>
                </div>
            )}

            {isGradeModalOpen && (
                <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white/60 rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className={`px-5 py-3 border-b flex justify-between items-center ${gradeForm.tipo === 'Grade' ? 'bg-emerald-500/20' : (gradeForm.tipo === 'SubReserva' ? 'bg-cyan-50' : 'bg-rose-500/20')}`}>
                            <h3 className={`text-sm font-black uppercase flex items-center gap-1.5 ${gradeForm.tipo === 'Grade' ? 'text-emerald-800' : (gradeForm.tipo === 'SubReserva' ? 'text-cyan-800' : 'text-rose-800')}`}>
                                {gradeForm.tipo === 'Grade' ? <CalendarCheck size={16} /> : (gradeForm.tipo === 'SubReserva' ? <CalendarClock size={16} /> : <AlertCircle size={16} />)}
                                {gradeForm.tipo === 'Grade' ? 'Definir Bloco Médico' : (gradeForm.tipo === 'SubReserva' ? 'Criar Sub-Reserva' : 'Bloquear Agenda')}
                            </h3>
                            <button type="button" onClick={() => setIsGradeModalOpen(false)} className="text-slate-400 hover:text-slate-700 transition"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveGrade} className="p-5 flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div><label className={labelStyle}>Data</label><input required type="date" value={gradeForm.data} onChange={e => setGradeForm({ ...gradeForm, data: e.target.value })} className={inputStyle} readOnly /></div>
                                <div><label className={labelStyle}>Início (H)</label><input required type="time" value={gradeForm.inicio} onChange={e => setGradeForm({ ...gradeForm, inicio: e.target.value })} className={inputStyle} /></div>
                                <div><label className={labelStyle}>Término (H)</label><input required type="time" value={gradeForm.fim} onChange={e => setGradeForm({ ...gradeForm, fim: e.target.value })} className={inputStyle} /></div>
                            </div>
                            {gradeForm.tipo === 'SubReserva' && (
                                <div><label className={labelStyle}>Título</label>
                                    <input required type="text" value={gradeForm.titulo} onChange={e => setGradeForm({ ...gradeForm, titulo: e.target.value })} className={inputStyle} placeholder="Ex: PREFEITURA DE BURI" />
                                </div>
                            )}

                            <div><label className={labelStyle}>Observações / Instruções</label>
                                <textarea
                                    value={gradeForm.observacoes}
                                    onChange={e => setGradeForm({ ...gradeForm, observacoes: e.target.value })}
                                    className={`${inputStyle} h-20 py-2 resize-none`}
                                    placeholder={gradeForm.tipo === 'Grade' ? "Ex: 15 consultas e 5 retornos..." : "Ex: Limpeza, folga coletiva..."}
                                ></textarea>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer bg-white/60 p-2 rounded border border-white/60 mt-2 hover:bg-white/70 transition-colors">
                                <input type="checkbox" checked={gradeForm.replicar} onChange={e => setGradeForm({ ...gradeForm, replicar: e.target.checked })} className="w-4 h-4 accent-blue-600 rounded" />
                                <span className="text-xs font-bold text-slate-700">Replicar blocos para este mês</span>
                            </label>

                            <button type="submit" disabled={saving} className={`w-full h-10 text-slate-800 font-bold text-xs uppercase rounded flex justify-center items-center gap-2 transition shadow-sm ${gradeForm.tipo === 'Grade' ? 'bg-emerald-600 hover:bg-emerald-700' : (gradeForm.tipo === 'SubReserva' ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-rose-600 hover:bg-rose-700')}`}>
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {gradeForm.tipo === 'Grade' ? 'Salvar Bloco' : (gradeForm.tipo === 'SubReserva' ? 'Salvar Sub-Reserva' : 'Salvar Bloqueio')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL CONFIG */}
            {isConfigModalOpen && (
                <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white/60 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-3 border-b flex justify-between items-center bg-white/60">
                            <h3 className="text-sm font-bold uppercase text-slate-700"><Settings size={14} className="inline mr-1" /> Configuração da Tela</h3>
                            <button onClick={() => setIsConfigModalOpen(false)} className="text-slate-500 hover:text-slate-700"><X size={16} /></button>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); setIsConfigModalOpen(false); toast.success("Configuração Salva"); }} className="p-5 space-y-4">
                            <div className="bg-amber-500/20 p-2 text-[11px] font-bold text-amber-800 border border-amber-200 rounded">
                                Estas configurações são salvas apenas neste dispositivo (PC atual) para permitir que diferentes recepções configurem a agenda como preferirem.
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div><label className={labelStyle}>Snap (Min)</label><select value={gradeConfig.intervalo} onChange={e => setGradeConfig({ ...gradeConfig, intervalo: e.target.value })} className={inputStyle}><option value="10">10 min</option><option value="15">15 min</option><option value="20">20 min</option><option value="30">30 min</option></select></div>
                                <div>
                                    <label className={labelStyle}>Início (Hora)</label>
                                    <input type="number" min="0" max="23" value={gradeConfig.inicio} onChange={e => setGradeConfig({ ...gradeConfig, inicio: e.target.value })} className={inputStyle} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Fim (Hora)</label>
                                    <input type="number" min="1" max="24" value={gradeConfig.fim} onChange={e => setGradeConfig({ ...gradeConfig, fim: e.target.value })} className={inputStyle} />
                                </div>
                            </div>

                            <button type="submit" className="w-full h-9 bg-blue-600 text-white font-bold text-xs rounded hover:bg-blue-700 transition">Salvar Alterações</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL AGENDAMENTO */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white/60 rounded-lg shadow-xl w-full max-w-xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-white/60 bg-blue-500/20/50 flex justify-between items-center">
                            <h3 className="font-bold text-[13px] text-blue-900 uppercase">
                                Inserir Agendamento • {formData.data_agendamento.split('-').reverse().join('/')} às {formData.horario}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-700"><X size={16} /></button>
                        </div>
                        <form onSubmit={handleSaveAgendamento} className="p-5">
                            <div className="relative mb-4 z-50">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                <input autoFocus required type="text" value={buscaPaciente || formData.paciente_nome} onChange={e => { setBuscaPaciente(cleanText(e.target.value)); setFormData({ ...formData, paciente_nome: cleanText(e.target.value), paciente_id: null }); }} className={`${inputStyle} pl-8 shadow-sm`} placeholder="BUSCAR OU NOME DO PACIENTE" />
                                {!formData.paciente_id && buscaPaciente.length >= 3 && (
                                    <div className="absolute w-full mt-1 bg-white/60 border rounded shadow-lg max-h-40 overflow-auto">
                                        {resultadosPacientes.map(p => <div key={p.id} onClick={() => selecionarPaciente(p)} className="p-2 border-b text-xs hover:bg-blue-500/20 cursor-pointer uppercase font-semibold">{p.nome} <span className="text-[10px] text-slate-500 ml-2">{p.cpf}</span></div>)}
                                        {resultadosPacientes.length === 0 && !buscandoPacientes && (
                                            <div
                                                onClick={() => {
                                                    setNovoPacienteForm({ ...novoPacienteForm, nome: buscaPaciente });
                                                    setIsNovoPacienteModalOpen(true);
                                                }}
                                                className="p-3 text-xs font-bold text-blue-600 bg-blue-500/20 hover:bg-blue-100 cursor-pointer text-center"
                                            >
                                                + "{buscaPaciente}" não encontrado. Clique para cadastrar.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-3 mb-3 relative z-10">
                                <div><label className={labelStyle}>CPF</label><input type="text" value={formData.paciente_cpf} onChange={e => setFormData({ ...formData, paciente_cpf: maskCPF(e.target.value) })} className={inputStyle} /></div>
                                <div><label className={labelStyle}>Fone</label><input type="text" value={formData.paciente_telefone} onChange={e => setFormData({ ...formData, paciente_telefone: maskTelefone(e.target.value) })} className={inputStyle} /></div>
                                <div><label className={labelStyle}>Data Nasc.</label><input type="date" value={formData.paciente_nascimento || ''} onChange={e => setFormData({ ...formData, paciente_nascimento: e.target.value })} className={inputStyle} /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
                                <div><label className={labelStyle}>Médico</label>
                                    <select required value={formData.medico} onChange={e => {
                                        const docName = e.target.value;
                                        const docObj = medicosObjetos.find(d => typeof d === 'object' && d.nome === docName);
                                        const spec = (docObj && docObj.especialidade) ? docObj.especialidade : formData.especialidade;
                                        setFormData({ ...formData, medico: docName, especialidade: spec });
                                    }} className={inputStyle}>
                                        <option value="">Selecione...</option>{medicosDisponiveis.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div><label className={labelStyle}>Local</label>
                                    <select value={formData.unidade} onChange={e => setFormData({ ...formData, unidade: e.target.value })} className={inputStyle} required>
                                        <option value="">Selecione...</option>
                                        {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div><label className={labelStyle}>Tipo</label>
                                    <select value={formData.tipo_atendimento} onChange={e => setFormData({ ...formData, tipo_atendimento: e.target.value })} className={inputStyle}><option>Consulta</option><option>Retorno</option><option>Exame</option></select>
                                </div>
                                <div><label className={labelStyle}>Convênio</label>
                                    <select value={formData.convenio} onChange={e => setFormData({ ...formData, convenio: e.target.value })} className={inputStyle}><option>SUS</option><option>PARTICULAR</option></select>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className={labelStyle}>Observações da Consulta / Anotações</label>
                                <textarea value={formData.observacoes || ''} onChange={e => setFormData({ ...formData, observacoes: e.target.value })} className={`${inputStyle} h-14 py-2 block resize-none w-full`} placeholder="Ex: Paciente prioritário..."></textarea>
                            </div>
                            <div className="mb-4">
                                <label className={labelStyle}>Anexar Arquivo do Computador (PDF, Imagens)</label>
                                <input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} className={`${inputStyle} file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-500/20 file:text-blue-700 hover:file:bg-blue-100 p-[3px]`} />
                                {formData.link_anexo && !selectedFile && (
                                    <div className="text-[11px] text-emerald-600 mt-1 font-bold">✓ Já possui anexo(s) salvo(s) (você pode carregar mais arquivos para esse agendamento).</div>
                                )}
                            </div>



                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 h-8 bg-white/70 text-slate-600 font-bold text-xs rounded hover:bg-white/80">Canc</button>
                                <button type="submit" disabled={saving} className="px-6 h-8 bg-blue-600 text-white font-bold text-xs rounded hover:bg-blue-700 flex items-center gap-2">{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {saving ? (selectedFile ? "Enviando Arquivo..." : "Salvando...") : "Salvar"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}



            {/* MODAL REAGENDAR */}
            {isReagendarModalOpen && consultaToReagendar && (
                <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white/60 rounded-lg shadow-xl w-full max-w-sm">
                        <div className="bg-blue-600 p-3 flex justify-between rounded-t-lg"><h3 className="text-slate-800 text-xs font-bold uppercase">Reagendar</h3><button onClick={() => setIsReagendarModalOpen(false)} className="text-slate-800"><X size={16} /></button></div>
                        <form onSubmit={handleReagendar} className="p-4 space-y-3">
                            <div className="mb-2"><div className="text-[11px] text-slate-500 font-bold uppercase">Paciente</div><div className="text-xs font-bold">{consultaToReagendar.paciente_nome}</div></div>
                            <div><label className={labelStyle}>Data</label><input required type="date" value={formData.data_agendamento} onChange={e => setFormData({ ...formData, data_agendamento: e.target.value })} className={inputStyle} /></div>
                            <div><label className={labelStyle}>Hora</label><input required type="time" value={formData.horario} onChange={e => setFormData({ ...formData, horario: e.target.value })} className={inputStyle} /></div>
                            <button type="submit" className="w-full h-8 bg-blue-600 text-white font-bold text-xs uppercase rounded">Salvar Reagendamento</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL CADASTRO RÁPIDO NOVO PACIENTE */}
            {isNovoPacienteModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-[10000] flex items-center justify-center p-4">
                    <div className="bg-white/60 rounded-lg shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b flex justify-between items-center bg-blue-500/20/50">
                            <h3 className="text-sm font-bold text-blue-900 uppercase">Novo Paciente (Rápido)</h3>
                            <button onClick={() => setIsNovoPacienteModalOpen(false)} className="text-slate-500 hover:text-slate-700"><X size={16} /></button>
                        </div>
                        <form onSubmit={handleSaveNovoPaciente} className="p-4 space-y-3">
                            <div><label className={labelStyle}>Nome Completo *</label>
                                <input required type="text" value={novoPacienteForm.nome} onChange={e => setNovoPacienteForm({ ...novoPacienteForm, nome: cleanText(e.target.value) })} className={inputStyle} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelStyle}>CPF</label>
                                    <input type="text" placeholder="000.000.000-00" value={novoPacienteForm.cpf} onChange={e => setNovoPacienteForm({ ...novoPacienteForm, cpf: maskCPF(e.target.value) })} className={inputStyle} />
                                </div>
                                <div><label className={labelStyle}>Nascimento</label>
                                    <input type="date" value={novoPacienteForm.dataNascimento} onChange={e => setNovoPacienteForm({ ...novoPacienteForm, dataNascimento: e.target.value })} className={inputStyle} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelStyle}>Telefone</label>
                                    <input type="text" placeholder="(11) 99999-9999" value={novoPacienteForm.telefone} onChange={e => setNovoPacienteForm({ ...novoPacienteForm, telefone: maskTelefone(e.target.value) })} className={inputStyle} />
                                </div>
                                <div><label className={labelStyle}>Cidade</label>
                                    <select value={novoPacienteForm.municipio} onChange={e => setNovoPacienteForm({ ...novoPacienteForm, municipio: e.target.value })} className={inputStyle}>
                                        <option value="">Selecione...</option>
                                        {cidadesDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button type="submit" disabled={novoPacienteSaving} className="w-full mt-2 h-9 flex justify-center items-center gap-2 bg-emerald-600 text-white font-bold text-xs uppercase rounded hover:bg-emerald-700 transition">
                                {novoPacienteSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar e Usar
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {/* INVISIBLE OVERLAY TO CLOSE ACTION MENU */}
            {actionMenu && <div className="fixed inset-0 z-[9998]" onClick={() => setActionMenu(null)}></div>}

            <PacienteFormModal
                isOpen={!!checkinData}
                paciente={checkinData?.paciente}
                onClose={() => setCheckinData(null)}
                customSaveText="Confirmar e Fazer Check-in"
                onSuccess={() => {
                    if (checkinData?.agendId) {
                        handleUpdateStatus(checkinData.agendId, 'Aguardando');
                    }
                    setCheckinData(null);
                }}
            />

            <ImportAgendaModal 
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={() => { fetchConsultas(); }}
                medicosDisponiveis={medicosDisponiveis}
            />
        </div>
    );
};

export default Agenda;
