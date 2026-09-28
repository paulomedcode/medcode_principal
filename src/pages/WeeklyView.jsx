import React, { useState, useEffect, useRef } from 'react';

import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';

import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight,
    Loader2, Clock, CalendarDays, RotateCcw, Printer,
    ThumbsUp, PauseCircle, CheckCircle2, Edit3, X, FileText, CalendarClock, CalendarX, Paperclip, MessageSquare, UserMinus, XCircle, Phone, Search, ClipboardList, HeartPulse } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
import { useNavigate } from 'react-router-dom';
import PrintableDailyMap from '../components/PrintableDailyMap';
import PrintableWeeklyMap from '../components/PrintableWeeklyMap';
import { PreOpDocument } from '../components/PreOpDocument';
import { getHospitalIdentity } from '../config/hospitalIdentity';
import toast from 'react-hot-toast';
import SurgeryQueue, { EditSurgeryModal } from '../pages/SurgeryQueue';
import { usePermission } from '../contexts/PermissionContext';
import { FixedScheduleModal } from '../components/FixedScheduleModal';

// --- CONFIGURAÇÃO ---
const START_HOUR = 0;   // mantém 0–23 por urgência
const END_HOUR = 23;

const ROOM_COL_WIDTH = 245;
const DEFAULT_SCROLL_HOUR = 6.5;

// alturas do header interno (para scroll certinho)
const DAY_HEADER_H = 40;  // h-10
const ROOM_HEADER_H = 24; // h-6

// Função auxiliar para burlar o limite de 1000 linhas da API do Supabase
const fetchPaginatedSurgeries = async () => {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('surgeries')
            .select('*')
            .neq('status', 'Cancelado')
            .order('id', { ascending: true })
            .range(from, from + step - 1);
            
        if (error || !data) {
            console.error("Erro na paginação de cirurgias:", error);
            return { data: null, error };
        }
        allData = [...allData, ...data];
        if (data.length < step) hasMore = false;
        else from += step;
    }
    return { data: allData, error: null };
};

// Converte o marcador [DURACAO:n] das observações de BLOQUEIO em um campo numérico .duracao (padrão 60)
const processSurgeries = (list) => (list || []).map(s => (
    s.status === 'BLOQUEIO' && s.observacoes && String(s.observacoes).includes('[DURACAO:')
        ? { ...s, duracao: Number(String(s.observacoes).match(/\[DURACAO:(\d+)\]/)?.[1] || 60) }
        : s
));

const WeeklyView = () => {
    const { hasPermission } = usePermission();
    const [surgeries, setSurgeries] = useState([]);
    const [allSurgeriesMap, setAllSurgeriesMap] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [hiddenRooms, setHiddenRooms] = useState(() => {
        try { return JSON.parse(localStorage.getItem('medcode_hidden_rooms') || '[]'); } catch { return []; }
    });
    useEffect(() => { localStorage.setItem('medcode_hidden_rooms', JSON.stringify(hiddenRooms)); }, [hiddenRooms]);
    const visibleRooms = rooms.filter(r => !hiddenRooms.includes(r));

    const [loading, setLoading] = useState(true);
    const [orientacoes, setOrientacoes] = useState({});
    const [regrasInternacao, setRegrasInternacao] = useState([]);
    const [inlinePrintState, setInlinePrintState] = useState({ surgeryId: null, selectedType: 'Geral' });

    // ✅ tempos padronizados (coleção "tempos")
    const [temposByCode, setTemposByCode] = useState(new Map()); // code -> minutes
    const [temposByName, setTemposByName] = useState(new Map()); // normalized name -> minutes

    const [currentWeekStart, setCurrentWeekStart] = useState(new Date(new Date().setHours(12, 0, 0, 0)));
    const [view, setView] = useState('week'); // 'week' | 'day'
    
    // Novo Estado de Densidade Visual
    const [density, setDensity] = useState('confortavel');
    // Em telas estreitas (celular) reduz o "zoom" geral do mapa (linhas e colunas menores)
    const [isNarrow, setIsNarrow] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    const ROW_HEIGHT = isNarrow ? 96 : (density === 'compacto' ? 120 : density === 'detalhado' ? 220 : 160);
    const ROOM_COL_WIDTH_RESPONSIVE = isNarrow ? 150 : ROOM_COL_WIDTH;
    const PIXELS_PER_MINUTE = ROW_HEIGHT / 60;


    const [editingSurgery, setEditingSurgery] = useState(null);
    const [activePopover, setActivePopover] = useState(null);
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [rescheduleForm, setRescheduleForm] = useState({ dataAgendado: '', horario: '', sala: '' });
    const [docSurgeryToPrint, setDocSurgeryToPrint] = useState(null);
    // Modal que pergunta o horário de internação ao imprimir (só em deploys
    // com perguntarInternacaoAoImprimir). Guarda o payload do PDF até a escolha.
    const [internacaoPrompt, setInternacaoPrompt] = useState(null);
    const hospitalIdentity = getHospitalIdentity();
    const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [pacientes, setPacientes] = useState([]);
    const [settings, setSettings] = useState({});
    
    // Novas features do Quick Actions
    const [motivosSuspensao, setMotivosSuspensao] = useState([]);
    const [isSuspending, setIsSuspending] = useState(false);
    const [motivoSuspensaoId, setMotivoSuspensaoId] = useState('');
    const [isObservacoesOpen, setIsObservacoesOpen] = useState(false);
    const [novaObs, setNovaObs] = useState('');
    
    // Feature do Buscador do Mapa
    const [mapSearchTerm, setMapSearchTerm] = useState('');
    const [mapSearchResults, setMapSearchResults] = useState([]);
    const [isMapSearchOpen, setIsMapSearchOpen] = useState(false);

    const [isFixedScheduleOpen, setIsFixedScheduleOpen] = useState(false);

    useEffect(() => {
        if (!mapSearchTerm || mapSearchTerm.trim().length === 0) {
            setMapSearchResults([]);
            return;
        }
        const lower = mapSearchTerm.toLowerCase();
        const digits = mapSearchTerm.replace(/\D/g, '');
        const results = surgeries.filter(s => {
            const matchName = (s.nomePaciente || s.paciente || '').toLowerCase().includes(lower);
            const matchCode = digits.length > 0 && (s.cpf || '').replace(/\D/g, '').includes(digits);
            const matchPhone = digits.length > 0 && ((s.telefone1 || '').replace(/\D/g, '').includes(digits) || (s.telefone || '').replace(/\D/g, '').includes(digits));
            return matchName || matchPhone || matchCode;
        }).slice(0, 5);
        setMapSearchResults(results);
    }, [mapSearchTerm, surgeries]);

    const handleSelectMapSearch = (surgery) => {
        if (!surgery.dataAgendado) return;
        const d = new Date(surgery.dataAgendado + 'T12:00:00');
        setCurrentWeekStart(d);
        if (view === 'day') setView('week');
        setActivePopover(surgery.id);
        setIsMapSearchOpen(false);
        setMapSearchTerm('');
    };

    const mapRef = useRef(null);
    const dateInputRef = useRef(null);
    const scrollRef = useRef(null);

    const navigate = useNavigate();

    const roomColors = [
        'bg-slate-50/50', 'bg-slate-50/50', 'bg-slate-50/50',
        'bg-slate-50/50', 'bg-slate-50/50', 'bg-slate-50/50',
    ];

    useEffect(() => {
        let unsubSurgeries = null;
        let unsubTempos = null;

        const loadData = async () => {
            try {
                // salas e configs
                const { data: settingsData } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
                if (settingsData && settingsData.data) {
                    setSettings(settingsData.data);
                    if (settingsData.data.locais?.length > 0) {
                        setRooms(settingsData.data.locais);
                    } else {
                        setRooms(['1', '2', '3', '4', 'EDA', 'TOMO']);
                    }
                } else {
                    setRooms(['1', '2', '3', '4', 'EDA', 'TOMO']);
                }

                // Buscar orientações dinâmicas
                const { data: orientacoesData } = await supabase.from('settings').select('data').eq('id', 'orientacoes').maybeSingle();
                if (orientacoesData && orientacoesData.data) {
                    // Migra formato texto-legado -> objeto (mesma lógica do Settings).
                    // Sem isso, uma orientação salva como string força regraInternacao
                    // para 'dia_anterior', fazendo o PDF sair sempre com 19:00.
                    const migrado = {};
                    Object.keys(orientacoesData.data).forEach((k) => {
                        const v = orientacoesData.data[k];
                        migrado[k] = typeof v === 'string' ? { texto: v, regraInternacao: 'dia_anterior' } : v;
                    });
                    setOrientacoes(migrado);
                }

                // Buscar regras de internação para o PDF
                const { data: regrasData } = await supabase.from('settings').select('data').eq('id', 'regras_internacao').maybeSingle();
                if (regrasData && regrasData.data?.lista) {
                    setRegrasInternacao(regrasData.data.lista);
                } else {
                    setRegrasInternacao([
                        { id: 'dia_anterior', tipo: 'anterior', horario: '19:00' },
                        { id: 'mesmo_dia_07h', tipo: 'mesmo', horario: '07:00' },
                        { id: 'mesmo_dia_11h', tipo: 'mesmo', horario: '11:00' }
                    ]);
                }

                // pacientes
                const loadPacientes = async () => {
                    const { data } = await supabase.from('pacientes').select('*');
                    if (data) setPacientes(data);
                };
                loadPacientes();

                // motivos suspensao
                const loadMotivos = async () => {
                    const { data } = await supabase.from('motivos_suspensao').select('*').eq('ativo', true).order('descricao');
                    if (data) setMotivosSuspensao(data);
                };
                loadMotivos();

                // cirurgias
                const loadSurgeries = async () => {
                    try {
                        const { data, error } = await fetchPaginatedSurgeries();
                        if (error) throw error;
                        const processed = processSurgeries(data);
                        setAllSurgeriesMap(processed); // Salva TODAS as cirurgias brutas aqui
                        setSurgeries(processed.filter(s => s.dataAgendado)); // O mapa usa só as agendadas
                    } catch (error) {
                        console.error('Erro ao buscar cirurgias:', error);
                    } finally {
                        setLoading(false);
                    }
                };
                loadSurgeries();

                // ✅ tempos (coleção "sigtap")
                const loadSigtap = async () => {
                    try {
                        const { data: sigtapData, error } = await supabase.from('sigtap').select('codigo, nome');

                        if (error) throw error;
                        if (sigtapData) {
                            const byCode = new Map();
                            const byName = new Map();

                            sigtapData.forEach((t) => {
                                const code = t.codigo ?? null;
                                const name = t.nome ?? null;
                                const minutesRaw = 60; // Padrão se não houver coluna de tempo
                                const minutes = parseDurationMinutes(minutesRaw);

                                if (minutes && minutes > 0) {
                                    if (code) byCode.set(String(code).trim(), minutes);
                                    if (name) byName.set(normalizeKey(String(name)), minutes);
                                }
                            });

                            setTemposByCode(byCode);
                            setTemposByName(byName);
                        }
                    } catch (error) {
                        console.warn('Erro silencioso ao carregar sigtap no Mapa:', error);
                    }
                };
                loadSigtap();

            } catch (error) {
                console.error(error);
                setLoading(false);
            }
        };

        loadData();
        goToday();

        return () => {
            if (unsubSurgeries) unsubSurgeries();
            if (unsubTempos) unsubTempos();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const goToday = () => {
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        setCurrentWeekStart(today);
        setView('week'); // Força visualização Semana por padrão
    };

    const handleSurgeryClick = (surgery) => {
        setEditingSurgery(surgery);
    };

    const handleUpdate = async (id, data) => {
        try {
            await supabase.from('surgeries').update(data).eq('id', id);

            // LOG NÍVEL FBI ULTRA: Faz a comparação (Diff) do Antes e Depois
            const target = allSurgeriesMap.find(s => s.id === id) || {};
            const patName = target.nomePaciente || target.paciente || data.nomePaciente || data.paciente || 'Desconhecido';

            const alteracoesReais = [];

            Object.keys(data).forEach(key => {
                // Ignora campos de controle
                if (key === 'id' || key === 'created_at') return;

                // Normaliza os valores (trata null, undefined e string vazia como a mesma coisa para não dar falso positivo)
                const oldVal = (target[key] === null || target[key] === undefined || target[key] === '') ? 'Vazio' : target[key];
                const newVal = (data[key] === null || data[key] === undefined || data[key] === '') ? 'Vazio' : data[key];

                // Se o valor realmente mudou, registra o De/Para
                if (String(oldVal) !== String(newVal)) {
                    alteracoesReais.push(`${key.toUpperCase()}: de [${oldVal}] para [${newVal}]`);
                }
            });

            const alteracoesStr = alteracoesReais.length > 0
                ? `Mudanças: ${alteracoesReais.join(' | ')}`
                : 'Salvo sem alterações reais';

            await logAction('Edição pelo Mapa', `Paciente: ${patName} -> ${alteracoesStr}`);

            toast.success("Cirurgia atualizada com sucesso no mapa!");
            setEditingSurgery(null);

            // Reload apenas da lista para refletir mapa imediatamente sem refresh
            const { data: novasCirurgias } = await fetchPaginatedSurgeries();
            if (novasCirurgias) {
                const processed = processSurgeries(novasCirurgias);
                setAllSurgeriesMap(processed);
                setSurgeries(processed.filter(s => s.dataAgendado));
            }
        } catch (error) {
            console.error(error);
            toast.error("Falha ao salvar a cirurgia pelo mapa.");
        }
    };

    const handleScheduleFromQueue = async (surgeryFromQueue) => {
        if (!selectedSlot) return;

        if (surgeryFromQueue.isBlock) {
            const toastId = toast.loading('Aplicando bloqueio...');
            try {
                const duration = surgeryFromQueue.duration || 60;
                const payload = {
                    nomePaciente: '[BLOQUEIO DE AGENDA]',
                    cns: '',
                    nascimento: '',
                    telefone1: '',
                    telefone2: '',
                    municipio: '',
                    cirurgiao: '',
                    especialidade: '',
                    procedimento: surgeryFromQueue.reason || 'MANUTENÇÃO',
                    anestesia: '',
                    convenio: 'SUS',
                    prioridade: 'ELETIVA',
                    sala: selectedSlot.sala,
                    dataAtendimento: '',
                    dataAutorizacao: '',
                    dataAgendado: selectedSlot.data,
                    horario: selectedSlot.horario,
                    aih: false,
                    autorizada: false,
                    apa: false,
                    opme: false,
                    status: 'BLOQUEIO',
                    observacoes: `[DURACAO:${duration}]`,
                    createdAt: new Date().toISOString()
                };
                await supabase.from('surgeries').insert([payload]);
                await logAction('Bloqueio de Agenda', `Sala ${selectedSlot.sala} no dia ${selectedSlot.data} às ${selectedSlot.horario}. Motivo: ${payload.procedimento}`);
                toast.success('Horário bloqueado com sucesso!', { id: toastId });

                setIsQueueModalOpen(false);
                setSelectedSlot(null);

                const { data: novasCirurgias } = await fetchPaginatedSurgeries();
                if (novasCirurgias) {
                    const processed = processSurgeries(novasCirurgias);
                    setAllSurgeriesMap(processed);
                    setSurgeries(processed.filter(s => s.dataAgendado));
                }
            } catch (error) {
                console.error(error);
                toast.error('Erro ao bloquear horário', { id: toastId });
            }
            return;
        }

        const toastId = toast.loading('Agendando cirurgia da fila...');
        try {
            const payload = {
                dataAgendado: selectedSlot.data,
                horario: selectedSlot.horario,
                sala: selectedSlot.sala,
                status: 'Agendado'
            };

            await supabase.from('surgeries').update(payload).eq('id', surgeryFromQueue.id);
            const patName = surgeryFromQueue.nomePaciente || surgeryFromQueue.paciente || 'Desconhecido';
            await logAction('Agendamento via Mapa', `Paciente: ${patName} | Agendado para Sala ${selectedSlot.sala} no dia ${selectedSlot.data} às ${selectedSlot.horario}`);
            toast.success('Agendado com sucesso!', { id: toastId });

            setIsQueueModalOpen(false);
            setSelectedSlot(null);

            // Recarrega as cirurgias no mapa silenciosamente
            const { data } = await fetchPaginatedSurgeries();
            if (data) {
                const processed = processSurgeries(data);
                setAllSurgeriesMap(processed);
                setSurgeries(processed.filter(s => s.dataAgendado));
            }

        } catch (error) {
            console.error(error);
            toast.error('Erro ao agendar da fila.', { id: toastId });
        }
    };

    const handleQuickAction = async (e, surgery, actionType) => {
        e.stopPropagation();
        let payload = {};

        if (actionType === 'edit') {
            setActivePopover(null);
            setEditingSurgery(surgery);
            return;
        } else if (actionType === 'document') {
            // INTELIGÊNCIA ONE-CLICK: Acha a regra automaticamente
            const esp = String(surgery.especialidade || '').toUpperCase();
            const proc = String(surgery.procedimento || '').toUpperCase();

            let matchedKey = 'Geral';
            const keys = Object.keys(orientacoes);

            // Busca automática (Ex: "Cirurgia Vascular" acha a regra "Vascular")
            for (let key of keys) {
                const cleanKey = key.toUpperCase();
                if (cleanKey === 'GERAL') continue; // Deixa o Geral como fallback

                if (cleanKey.length > 2 && (
                    (esp && esp.includes(cleanKey)) ||
                    (esp && cleanKey.includes(esp)) ||
                    (proc && proc.includes(cleanKey))
                )) {
                    matchedKey = key;
                    break;
                }
            }

            // Puxa as configurações da regra encontrada
            let selectedConfig = orientacoes[matchedKey] || orientacoes['Geral'];
            if (typeof selectedConfig === 'string') selectedConfig = { texto: selectedConfig, regraInternacao: 'dia_anterior' };
            else if (!selectedConfig) selectedConfig = { texto: '', regraInternacao: 'dia_anterior' };

            // Payload do PDF sem a regra de internação (definida abaixo).
            const basePayload = {
                ...surgery,
                textoOrientacao: selectedConfig.texto,
                tipoOrientacao: matchedKey,
                horarioEstaticoPdf: selectedConfig.horarioCirurgiaPdf // <--- BLINDADO AQUI
            };

            setActivePopover(null); // Fecha o balãozinho

            if (hospitalIdentity.perguntarInternacaoAoImprimir) {
                // Em vez de usar a regra da especialidade, pergunta o horário
                // (05:00 / 11:00) num modal antes de gerar o PDF.
                setInternacaoPrompt(basePayload);
            } else {
                const resolvedRule = regrasInternacao.find(r => r.id === selectedConfig.regraInternacao) || { tipo: 'anterior', horario: '19:00' };
                setDocSurgeryToPrint({ ...basePayload, regraInternacaoObj: resolvedRule });
            }
            return;
        } else if (actionType === 'confirm') {
            payload = { paciente_confirmado: !surgery.paciente_confirmado };
        } else if (actionType === 'suspend') {
            if (!motivoSuspensaoId) {
                toast.error("Selecione um motivo para a suspensão.");
                return;
            }
            const motivoText = motivosSuspensao.find(m => m.id === motivoSuspensaoId)?.descricao || 'Motivo não informado';
            const currentObs = surgery.observacoes || surgery.obs || '';
            const obsFormatada = `[⚠️ SUSPENSA em ${new Date().toLocaleDateString('pt-BR')} - Motivo: ${motivoText}]`;
            const obsAtualizada = currentObs ? `${currentObs}\n\n${obsFormatada}` : obsFormatada;
            
            payload = { status: 'Suspensa Reagendar', motivo_suspensao_id: motivoSuspensaoId, observacoes: obsAtualizada };
        } else if (actionType === 'naointernou') {
            const currentObs = surgery.observacoes || surgery.obs || '';
            const obsFormatada = `[⚠️ NÃO INTERNOU em ${new Date().toLocaleDateString('pt-BR')}]`;
            const obsAtualizada = currentObs ? `${currentObs}\n\n${obsFormatada}` : obsFormatada;
            payload = { status: 'Aguardando', observacoes: obsAtualizada };
        } else if (actionType === 'realize') {
            payload = { status: 'Realizado' };
        } else if (actionType === 'reset') {
            payload = { status: 'Agendado' };
        } else if (actionType === 'add_obs') {
            if (!novaObs.trim()) return;
            const dataAtual = new Date().toLocaleString('pt-BR');
            const obsFormatada = `[${dataAtual}]: ${novaObs}`;
            const currentObs = surgery.observacoes || surgery.obs;
            const obsAtualizada = currentObs ? `${currentObs}\n\n${obsFormatada}` : obsFormatada;
            payload = { observacoes: obsAtualizada };
        }

        const loadingToast = toast.loading('Atualizando...');
        try {
            await supabase.from('surgeries').update(payload).eq('id', surgery.id);
            // Atualiza o estado local imediatamente para refletir na tela
            setSurgeries(prev => prev.map(s => s.id === surgery.id ? { ...s, ...payload } : s));

            // NOVO LOG RICO AQUI:
            const patName = surgery.nomePaciente || surgery.paciente || 'Desconhecido';
            const acaoRealizada = actionType === 'confirm' ? `Confirmação de Presença: ${payload.paciente_confirmado}` :
                actionType === 'suspend' ? 'Status alterado para: Suspensa' :
                    actionType === 'realize' ? 'Status alterado para: Realizado' :
                        actionType === 'reset' ? 'Status revertido para: Agendado' : 'Atualização pelo Mapa';

            await logAction('Ação pelo Mapa Semanal', `Paciente: ${patName} | ${acaoRealizada}`);

            toast.success('Atualizado com sucesso!', { id: loadingToast });
        } catch (error) {
            console.error(error);
            toast.error('Erro ao atualizar.', { id: loadingToast });
        }
        if (actionType !== 'add_obs') {
            setActivePopover(null);
            setIsSuspending(false);
            setIsObservacoesOpen(false);
            setNovaObs('');
            setMotivoSuspensaoId('');
        } else {
            setNovaObs(''); // apenas limpa o input
        }
    };

    // Confirma o horário de internação escolhido no modal e gera o PDF.
    const handleConfirmInternacao = (horario) => {
        if (!internacaoPrompt) return;
        setDocSurgeryToPrint({ ...internacaoPrompt, regraInternacaoObj: { tipo: 'mesmo', horario } });
        setInternacaoPrompt(null);
    };

    useEffect(() => {
        const generatePatientPDF = async () => {
            if (!docSurgeryToPrint) return;

            const toastId = toast.loading('Gerando documento do paciente...');
            try {
                // Pequeno delay para o React renderizar o componente oculto
                await new Promise(resolve => setTimeout(resolve, 200));

                const input = document.getElementById('preop-print-area');
                if (!input) throw new Error("Área de impressão não encontrada");

                const imgData = await toJpeg(input, { quality: 1.0, pixelRatio: 2, backgroundColor: '#ffffff' });
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (input.offsetHeight * pdfWidth) / input.offsetWidth;

                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                const safeName = (docSurgeryToPrint.nomePaciente || 'Paciente').replace(/[^a-z0-9]/gi, '_');
                pdf.save(`Orientações_${safeName}.pdf`);

                toast.success('Documento gerado com sucesso!', { id: toastId });
            } catch (error) {
                console.error(error);
                toast.error('Erro ao gerar documento.', { id: toastId });
            } finally {
                setDocSurgeryToPrint(null); // Limpa para permitir nova impressão
            }
        };

        generatePatientPDF();
    }, [docSurgeryToPrint]);

    const handleDateSelect = (e) => {
        if (!e.target.value) return;
        const selectedDate = new Date(e.target.value + 'T12:00:00');
        // Mantém a visualização atual, apenas muda a data
        setCurrentWeekStart(selectedDate);
    };

    const calculateAge = (dob) => {
        if (!dob) return '';
        const birth = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age >= 0 ? `${age}a` : '';
    };

    // -----------------------
    // ✅ Normalização / Tempos
    // -----------------------
    function normalizeKey(str) {
        return (str || '')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/[^A-Z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Aceita: 120 | "120" | "120 min" | "2h" | "2h30" | "02:00" | "2:30"
    function parseDurationMinutes(value) {
        if (value === null || value === undefined) return null;

        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.round(value);
        }

        const raw = String(value).trim().toLowerCase();
        if (!raw) return null;

        // HH:MM ou H:MM
        const hhmm = raw.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
        if (hhmm) {
            const h = Number(hhmm[1]);
            const m = Number(hhmm[2]);
            const total = h * 60 + m;
            return total > 0 ? total : null;
        }

        // 2h / 2h30 / 2h 30m
        const hMatch = raw.match(/(\d{1,2})\s*h/);
        const mMatch = raw.match(/(\d{1,3})\s*m/);
        if (hMatch || mMatch) {
            const h = hMatch ? Number(hMatch[1]) : 0;
            const m = mMatch ? Number(mMatch[1]) : 0;
            const total = h * 60 + m;
            return total > 0 ? total : null;
        }

        // "120", "120min", etc.
        const digits = raw.match(/(\d{1,3})/);
        if (digits) {
            const n = Number(digits[1]);
            return Number.isFinite(n) && n > 0 ? n : null;
        }

        return null;
    }

    const addMinutesToTime = (hhmm, minutesToAdd) => {
        if (!hhmm) return '';
        const [h, m] = hhmm.split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
        const total = h * 60 + m + minutesToAdd;
        const hh = Math.floor((total % (24 * 60)) / 60);
        const mm = total % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    const shortenText = (text, max = 44) => {
        const t = String(text || '').trim();
        if (!t) return '';
        if (t.length <= max) return t;
        return `${t.slice(0, max - 1)}…`;
    };

    // ✅ resolve nome do procedimento (robusto)
    const getProcedureName = (surgery) => {
        const value =
            surgery?.procedimento ??
            surgery?.procedimentoNome ??
            surgery?.nomeProcedimento ??
            surgery?.descricaoProcedimento ??
            surgery?.descricao ??
            surgery?.procedimentoSigtap ??
            '';

        return String(value || '').trim();
    };

    // ✅ resolve código SUS (robusto)
    const getProcedureCode = (surgery) => {
        const code =
            surgery?.codigoSus ??
            surgery?.codigoSUS ??
            surgery?.codigo_sus ??
            surgery?.codigoProcedimento ??
            surgery?.codProcedimento ??
            surgery?.procedimentoCodigo ??
            surgery?.sus ??
            null;

        return code ? String(code).trim() : null;
    };

    // ✅ pega duração: prioridade = (1) cirurgia -> (2) tempos por código -> (3) tempos por nome -> (4) 60
    const getDurationMinutesForSurgery = (surgery) => {
        const rawFromSurgery =
            surgery?.duracao ??
            surgery?.duracaoMinutos ??
            surgery?.tempo ??
            surgery?.tempoMin ??
            surgery?.tempoPrevisto ??
            null;

        const direct = parseDurationMinutes(rawFromSurgery);
        if (direct && direct > 0) return direct;

        const code = getProcedureCode(surgery);
        if (code && temposByCode.has(code)) return temposByCode.get(code);

        const name = getProcedureName(surgery);
        const key = normalizeKey(name);
        if (key && temposByName.has(key)) return temposByName.get(key);

        return 60;
    };

    const getBlockStyle = (horario, durationMinutes) => {
        if (!horario) return null;

        const [hour, min] = horario.split(':').map(Number);
        if (!Number.isFinite(hour) || !Number.isFinite(min)) return null;

        const startMinutes = (hour - START_HOUR) * 60 + min;
        const top = startMinutes * PIXELS_PER_MINUTE;
        const height = durationMinutes * PIXELS_PER_MINUTE;

        return { top: `${top}px`, height: `${height}px`, zIndex: 10 };
    };

    // -----------------------
    // ✅ Cores por prioridade
    // -----------------------
    const getPriorityStyles = (prioridadeRaw) => {
        const p = String(prioridadeRaw || '').trim().toUpperCase();

        if (p === 'EMERGÊNCIA' || p === 'EMERGENCIA') {
            return {
                badge: 'bg-rose-50/70 text-rose-600 border-rose-200/50 font-bold',
                card: 'border-white/60 border-l-[4px] border-l-rose-500 hover:border-rose-300',
                shadow: 'shadow-sm'
            };
        }

        if (p === 'URGÊNCIA' || p === 'URGENCIA') {
            return {
                badge: 'bg-amber-50/70 text-amber-600 border-amber-200/50 font-bold',
                card: 'border-white/60 border-l-[4px] border-l-amber-500 hover:border-amber-300',
                shadow: 'shadow-sm'
            };
        }

        if (p === 'PRIORIDADE') {
            return {
                badge: 'bg-indigo-50/70 text-indigo-500 border-indigo-200/50 font-bold',
                card: 'border-white/60 border-l-[4px] border-l-indigo-500 hover:border-indigo-300',
                shadow: 'shadow-sm'
            };
        }

        if (p === 'BLOQUEIO') {
            return {
                badge: 'bg-white/60 text-slate-500 border-white/60 font-bold',
                card: 'border-white/80 border-[2px] border-dashed bg-white/5',
                shadow: 'shadow-none'
            };
        }

        return {
            badge: 'bg-blue-50/70 text-blue-500 border-blue-200/50 font-bold',
            card: 'border-white/60 border-l-[4px] border-l-blue-400 hover:border-blue-300',
            shadow: 'shadow-sm hover:shadow-md'
        };
    };

    // -----------------------
    // ✅ Scroll automático 07:00
    // -----------------------
    const scrollToHour = (hour) => {
        const el = scrollRef.current;
        if (!el) return;

        const minutesFromStart = (hour - START_HOUR) * 60;
        const y = (DAY_HEADER_H + ROOM_HEADER_H) + (minutesFromStart * PIXELS_PER_MINUTE);
        el.scrollTop = Math.max(0, y - 16);
    };

    useEffect(() => {
        if (!loading) {
            setTimeout(() => {
                scrollToHour(DEFAULT_SCROLL_HOUR);
                
                // Rola horizontalmente para o dia de hoje, se estiver na visão semanal
                if (view === 'week') {
                    const todayRef = new Date();
                    todayRef.setHours(12, 0, 0, 0);
                    const todayStr = todayRef.toISOString().split('T')[0];
                    const dayCol = document.getElementById(`day-column-${todayStr}`);
                    const scrollContainer = scrollRef.current;
                    
                    if (dayCol && scrollContainer) {
                        const containerRect = scrollContainer.getBoundingClientRect();
                        const dayColRect = dayCol.getBoundingClientRect();
                        // Subtrai 80px (largura do eixo de horas fixo na esquerda) para não sobrepor
                        const scrollLeftPos = scrollContainer.scrollLeft + (dayColRect.left - containerRect.left) - 80;
                        scrollContainer.scrollLeft = Math.max(0, scrollLeftPos);
                    }
                }
            }, 50); // Atraso leve para garantir renderização do DOM
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, currentWeekStart, view]);

    const timeSlots = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

    const weekDays = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => {
        const d = new Date(currentWeekStart);
        d.setHours(12, 0, 0, 0);
        if (view === 'week') {
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff + i);
        }
        return d.toISOString().split('T')[0];
    });

    const formatDateHeader = (dateStr, full = false) => {
        const date = new Date(dateStr + 'T12:00:00');
        if (full) {
            const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
            const diaDaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][date.getDay()];
            const isFeira = !['Sábado', 'Domingo'].includes(diaDaSemana);
            const diaSemanaTexto = `${diaDaSemana}${isFeira ? '-feira' : ''}`;
            const dia = date.getDate();
            const mesNome = meses[date.getMonth()];
            const ano = date.getFullYear();
            return `${diaSemanaTexto} ${dia} de ${mesNome} de ${ano}`;
        }
        const dia = String(date.getDate()).padStart(2, '0');
        const mes = String(date.getMonth() + 1).padStart(2, '0');
        const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        return `${dia}/${mes} (${semana[date.getDay()]})`;
    };

    const handlePrevious = () => {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() - (view === 'week' ? 7 : 1));
        setCurrentWeekStart(d);
    };

    const handleNext = () => {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() + (view === 'week' ? 7 : 1));
        setCurrentWeekStart(d);
    };

    const handleGeneratePDF = async () => {
        const toastId = toast.loading("Gerando Mapa Cirúrgico...");

        try {
            await new Promise(resolve => setTimeout(resolve, 100));

            const orientation = 'p'; // Sempre retrato
            const pdf = new jsPDF(orientation, 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            if (view === 'week') {
                for (let i = 1; i <= 2; i++) {
                    const input = document.getElementById(`print-area-page-${i}`);
                    if (!input) continue;
                    
                    const imgData = await toJpeg(input, {
                        quality: 1.0,
                        pixelRatio: 2,
                        backgroundColor: '#ffffff',
                    });

                    if (i > 1) pdf.addPage();

                    const imgProps = pdf.getImageProperties(imgData);
                    const imgRatio = imgProps.width / imgProps.height;
                    const pdfRatio = pdfWidth / pdfHeight;

                    let finalWidth = pdfWidth;
                    let finalHeight = pdfHeight;
                    if (imgRatio > pdfRatio) {
                        finalHeight = pdfWidth / imgRatio;
                    } else {
                        finalWidth = pdfHeight * imgRatio;
                    }
                    const x = (pdfWidth - finalWidth) / 2;
                    const y = (pdfHeight - finalHeight) / 2;
                    pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
                }

                const fileDate = `${weekDays[0].split('-').reverse().join('-')}_a_${weekDays[weekDays.length-1].split('-').reverse().join('-')}`;
                pdf.save(`Mapa_Semanal_${fileDate}.pdf`);
                toast.success("PDF gerado com sucesso!", { id: toastId });

            } else {
                const input = document.getElementById('print-area');
                if (!input) throw new Error("Área de impressão não encontrada");
                
                const imgData = await toJpeg(input, {
                    quality: 1.0,
                    pixelRatio: 2,
                    backgroundColor: '#ffffff',
                });

                const imgProps = pdf.getImageProperties(imgData);
                const imgRatio = imgProps.width / imgProps.height;
                const pdfRatio = pdfWidth / pdfHeight;

                let finalWidth = pdfWidth;
                let finalHeight = pdfHeight;
                if (imgRatio > pdfRatio) {
                    finalHeight = pdfWidth / imgRatio;
                } else {
                    finalWidth = pdfHeight * imgRatio;
                }
                const x = (pdfWidth - finalWidth) / 2;
                const y = (pdfHeight - finalHeight) / 2;
                pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);

                const fileDate = weekDays[0].split('-').reverse().join('-');
                pdf.save(`Mapa_Cirurgico_${fileDate}.pdf`);
                toast.success("PDF gerado com sucesso!", { id: toastId });
            }

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            toast.error("Erro ao gerar PDF", { id: toastId });
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center bg-white/60">
                <Loader2 className="animate-spin text-blue-600" size={48} />
            </div>
        );
    }

    return (
        <div className="px-4 pr-6 py-6 min-h-full bg-white/60 font-sans flex flex-col h-full overflow-hidden">

            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 pb-4 border-b border-white/40 flex-none flex-wrap z-10 relative">
                <div className="flex items-center gap-3">
                    <CalendarDays size={28} className="text-blue-600" />
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 drop-shadow-none tracking-normal">Agenda Cirúrgica</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Mapa Semanal</span>
                            <span className="text-[11px] font-bold text-blue-500 uppercase">
                                • {formatDateHeader(weekDays[0])} {view === 'week' && `até ${formatDateHeader(weekDays[weekDays.length - 1])}`}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {hasPermission('Visualizar Fila') && (
                        <button
                            onClick={() => { setSelectedSlot(null); setIsQueueModalOpen(true); }}
                            className="flex items-center gap-2 border px-4 py-2 rounded-lg font-black text-[11px] uppercase tracking-widest transition-all bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 shadow-sm"
                        >
                            <ClipboardList size={14} /> Fila
                        </button>
                    )}

                    {hasPermission('Visualizar Fila') && (
                        <button
                            onClick={() => setIsFixedScheduleOpen(true)}
                            className="flex items-center gap-2 border px-4 py-2 rounded-lg font-black text-[11px] uppercase tracking-widest transition-all bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-sm"
                        >
                            <CalendarDays size={14} /> Grade Fixa
                        </button>
                    )}

                    <div className="flex bg-white/70 rounded-lg p-1 mr-2">
                        <button
                            onClick={() => setView('day')}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wider transition-all ${view === 'day' ? 'bg-white/90 text-blue-700 shadow-sm border border-white/400 backdrop-blur-sm' : 'text-slate-500 hover:text-slate-600'}`}
                        >
                            Dia
                        </button>
                        <button
                            onClick={() => setView('week')}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wider transition-all ${view === 'week' ? 'bg-white/90 text-blue-700 shadow-sm border border-white/400 backdrop-blur-sm' : 'text-slate-500 hover:text-slate-600'}`}
                        >
                            Semana
                        </button>
                        <div className="w-[1px] bg-white/80 mx-1 my-1 rounded-full"></div>
                        <select
                            value={density}
                            onChange={(e) => setDensity(e.target.value)}
                            className="bg-transparent border-none text-[11px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-700 focus:outline-none cursor-pointer pl-2 pr-1 appearance-none text-center"
                            title="Densidade Visual"
                        >
                            <option value="compacto">Compacto</option>
                            <option value="confortavel">Confortável</option>
                            <option value="detalhado">Detalhado</option>
                        </select>
                    </div>

                    <div className="relative z-50 mr-2">
                        <div className="flex items-center bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg px-2 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all w-56 lg:w-64 h-9">
                            <Search size={14} className="text-slate-500 shrink-0" />
                            <input
                                type="text"
                                placeholder="Localizar Agendado..."
                                value={mapSearchTerm}
                                onChange={e => { setMapSearchTerm(e.target.value); setIsMapSearchOpen(true); }}
                                onFocus={() => setIsMapSearchOpen(true)}
                                className="w-full bg-transparent border-none text-[11px] font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-0 ml-1 uppercase"
                            />
                            {mapSearchTerm && (
                                <button onClick={() => { setMapSearchTerm(''); setMapSearchResults([]); }} className="text-slate-500 hover:text-slate-600 outline-none shrink-0">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        
                        {isMapSearchOpen && mapSearchTerm.length > 0 && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white/60 rounded-xl shadow-xl border border-white/60 overflow-hidden text-left flex flex-col max-h-[300px]">
                                {mapSearchResults.length === 0 ? (
                                    <div className="p-4 text-center text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                        Nenhum paciente agendado.
                                    </div>
                                ) : (
                                    <div className="overflow-y-auto custom-scrollbar">
                                        {mapSearchResults.map(s => (
                                            <button 
                                                key={s.id} 
                                                onClick={() => handleSelectMapSearch(s)}
                                                className="w-full text-left p-3 border-b border-white/40 hover:bg-white/60 transition-colors group flex flex-col gap-1"
                                            >
                                                <span className="text-xs font-black text-slate-900 drop-shadow-none uppercase line-clamp-1 group-hover:text-blue-600">{s.nomePaciente || s.paciente}</span>
                                                <div className="flex justify-between items-center text-[11px] uppercase font-bold text-slate-500">
                                                    <span className="flex items-center gap-1 text-blue-500"><CalendarDays size={10}/> {s.dataAgendado ? s.dataAgendado.split('-').reverse().join('/') : ''}</span>
                                                    <span className="flex items-center gap-1"><Clock size={10}/> {s.horario || '--:--'}</span>
                                                    <span className="truncate max-w-[60px] text-right">{s.sala}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGeneratePDF}
                        title={view === 'week' ? "Gerar Mapa Semanal" : "Gerar Mapa Diário"}
                        className="flex items-center gap-2 border px-4 py-2 rounded-lg font-black text-[11px] uppercase tracking-widest transition-all bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
                    >
                        <Printer size={14} /> {view === 'week' ? 'Mapa Semanal' : 'Gerar Mapa'}
                    </button>

                    <button
                        onClick={() => { goToday(); setTimeout(() => scrollToHour(DEFAULT_SCROLL_HOUR), 0); }}
                        className="flex items-center gap-2 bg-white/70 text-slate-600 px-4 py-2 rounded-lg font-black text-[11px] uppercase tracking-widest hover:bg-white/80 transition-all"
                    >
                        <RotateCcw size={14} /> Hoje
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => dateInputRef.current.showPicker()}
                            className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold text-[11px] uppercase tracking-widest border border-blue-100 hover:bg-blue-100 transition-all"
                        >
                            <CalendarDays size={16} /> Ir para data
                        </button>
                        <input ref={dateInputRef} type="date" onChange={handleDateSelect} className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0" />
                    </div>

                    <div className="flex items-center gap-1 bg-white/60 p-1 rounded-xl border border-white/40 ml-2">
                        <button
                            onClick={handlePrevious}
                            className="p-2 hover:bg-white/60 rounded-lg text-slate-500"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={handleNext}
                            className="p-2 hover:bg-white/60 rounded-lg text-slate-500"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-white/60 backdrop-blur-lg rounded-[2.5rem] shadow-sm border border-white/400 overflow-hidden relative flex flex-col" ref={mapRef} onClick={() => setIsMapSearchOpen(false)}>
                <div ref={scrollRef} className="overflow-auto custom-scrollbar flex-1 relative">
                    <div id="calendar-print-area" className="flex min-w-max">

                        <div className="sticky left-0 z-30 bg-white/80 backdrop-blur-xl border-r-2 border-slate-300/50 w-20 shrink-0 shadow-lg">
                            <div className="h-10 border-b border-white/60 bg-white/80 backdrop-blur-md flex items-center justify-center sticky top-0 z-40">
                                <Clock size={16} className="text-slate-500" />
                            </div>

                            <div className="h-6 border-b border-white/60 bg-white/80 backdrop-blur-md sticky top-10 z-40" />

                            {timeSlots.map(hour => (
                                <div
                                    key={hour}
                                    className="border-b border-slate-200/80 flex items-start justify-center pt-2 bg-white/40"
                                    style={{ height: `${ROW_HEIGHT}px` }}
                                >
                                    <span className="text-[12px] font-black text-slate-600">{String(hour).padStart(2, '0')}:00</span>
                                </div>
                            ))}
                        </div>

                        {weekDays.map((dayDate, dayIndex) => {
                            const daySurgeries = surgeries.filter(s => s.dataAgendado && String(s.dataAgendado).startsWith(dayDate));
                            const todayRef = new Date();
                            todayRef.setHours(12, 0, 0, 0);
                            const isToday = dayDate === todayRef.toISOString().split('T')[0];

                            const bgDay = dayIndex % 2 === 0 ? 'bg-white/5' : 'bg-slate-50/80';
                            const hasActivePopoverThisDay = daySurgeries.some(s => s.id === activePopover);

                            return (
                                <div key={dayDate} id={`day-column-${dayDate}`} className={`flex flex-col border-r-[3px] border-white/80 last:border-r-0 shadow-sm relative ${hasActivePopoverThisDay ? 'z-50' : 'z-0'} ${bgDay}`}>
                                    <div className={`h-10 flex items-center justify-center border-b border-slate-200 font-black text-[11px] uppercase tracking-widest sticky top-0 z-20 shadow-sm ${isToday ? 'bg-blue-50/90 backdrop-blur-md text-blue-700 border-b-2 border-b-blue-500' : 'bg-slate-100/90 backdrop-blur-md text-slate-600'}`}>
                                        {formatDateHeader(dayDate, true)}
                                    </div>

                                    <div className="flex relative">
                                        {visibleRooms.map((room, index) => {
                                            const colorClass = roomColors[index % roomColors.length];
                                            const hasActivePopoverThisRoom = daySurgeries.some(s => {
                                                const cleanRoom = String(room || '').toUpperCase().trim();
                                                const cleanSala = String(s.sala || '').toUpperCase().trim();
                                                const cleanLocal = String(s.local || '').toUpperCase().trim();
                                                return s.id === activePopover && (cleanSala === cleanRoom || cleanLocal === cleanRoom);
                                            });

                                            return (
                                                <div
                                                    key={`${dayDate}-${room}`}
                                                    className={`border-r border-slate-200 relative shrink-0 ${colorClass} ${hasActivePopoverThisRoom ? 'z-50' : ''}`}
                                                    style={{ width: `${ROOM_COL_WIDTH_RESPONSIVE}px` }}
                                                >
                                                    <div className={`h-6 ${colorClass} backdrop-blur-md border-b border-slate-200 flex items-center justify-center text-[11px] font-black text-slate-600 uppercase sticky top-10 z-10`}>
                                                        {room}
                                                    </div>

                                                    {timeSlots.map(hour => {
                                                        const formattedHour = `${hour.toString().padStart(2, '0')}:00`;
                                                        return (
                                                            <div
                                                                key={hour}
                                                                className="border-b border-slate-200 relative hover:bg-blue-50/50 cursor-pointer transition-colors"
                                                                style={{ height: `${ROW_HEIGHT}px` }}
                                                                onClick={() => {
                                                                    if (!hasPermission('Criar Agendamentos')) return;
                                                                    const slotInfo = { data: dayDate, sala: room, horario: formattedHour };
                                                                    setSelectedSlot(slotInfo);
                                                                    setIsQueueModalOpen(true);
                                                                }}
                                                            />
                                                        );
                                                    })}

                                                    <div className="absolute top-6 left-0 right-0 bottom-0 pointer-events-none">
                                                        {daySurgeries
                                                            .filter(s => {
                                                                const cleanRoom = String(room || '').toUpperCase().trim();
                                                                const cleanSala = String(s.sala || '').toUpperCase().trim();
                                                                const cleanLocal = String(s.local || '').toUpperCase().trim();
                                                                return cleanSala === cleanRoom || cleanLocal === cleanRoom;
                                                            })
                                                            .map(surgery => {
                                                                const durationMin = getDurationMinutesForSurgery(surgery);
                                                                const [hStr, mStr] = (surgery.horario || '00:00').split(':');
                                                                const h = parseInt(hStr) || 0;
                                                                const m = parseInt(mStr) || 0;

                                                                if (h < START_HOUR || h > END_HOUR) return null;

                                                                const startMinutes = (h - START_HOUR) * 60 + m;
                                                                const topPx = startMinutes * PIXELS_PER_MINUTE;
                                                                const heightPx = durationMin * PIXELS_PER_MINUTE;

                                                                const cleanRoom = String(room || '').toUpperCase().trim();
                                                                const sameTimeSurgeries = daySurgeries.filter(s => 
                                                                    (String(s.sala || '').toUpperCase().trim() === cleanRoom || String(s.local || '').toUpperCase().trim() === cleanRoom) 
                                                                    && s.horario === surgery.horario
                                                                );
                                                                const overlapIndex = sameTimeSurgeries.findIndex(s => s.id === surgery.id);
                                                                const hasConflict = sameTimeSurgeries.length > 1;

                                                                const style = {
                                                                    top: `${topPx + (overlapIndex * 15)}px`,
                                                                    height: `${heightPx}px`,
                                                                    left: `${1 + (overlapIndex * 3)}%`,
                                                                    width: `${98 - (overlapIndex * 3)}%`,
                                                                    position: 'absolute',
                                                                    zIndex: 10 + overlapIndex
                                                                };

                                                                const prioridade = (surgery.prioridade || 'ELETIVA').toUpperCase();
                                                                const pStyle = getPriorityStyles(prioridade);

                                                                const procedureName = getProcedureName(surgery);
                                                                const procedimento = procedureName.toUpperCase() || '---';

                                                                const surgeonClean = (surgery.cirurgiao || '').replace(/^dr\.?\s+/i, '').trim();
                                                                const surgeonUpper = surgeonClean.toUpperCase();
                                                                const surgeonShort = surgeonUpper ? surgeonUpper.split(' ').slice(0, 2).join(' ') : '---';

                                                                const pacienteRaw = (surgery.nomePaciente || surgery.paciente || '').toUpperCase();
                                                                const paciente = pacienteRaw;

                                                                const idade = calculateAge(surgery.nascimento || surgery.dataNascimento);
                                                                const anestesia = String(surgery.anestesia || '---').toUpperCase();
                                                                const convenio = String(surgery.convenio || 'SUS').toUpperCase();
                                                                const cidade = String(surgery.municipio || '').toUpperCase().trim();

                                                                const endTime = addMinutesToTime(surgery.horario, durationMin);

                                                                const statusUpper = String(surgery.status || '').toUpperCase();
                                                                const isNaoInternou = statusUpper === 'AGUARDANDO' && surgery.observacoes?.includes('[⚠️ NÃO INTERNOU');
                                                                const isSuspensa = statusUpper === 'SUSPENSA REAGENDAR' || statusUpper === 'SUSPENSA';
                                                                const isRealizado = statusUpper === 'REALIZADO' || statusUpper === 'CONCLUÍDA' || statusUpper === 'CONCLUÍDO';

                                                                let cardBgClass = 'bg-white/95 backdrop-blur-md';
                                                                let cardOpacityClass = 'opacity-100';
                                                                let cardBorderClass = `${pStyle.card} border-y border-r border-t border-b`;

                                                                if (isRealizado) {
                                                                    cardBgClass = 'bg-emerald-50/90 backdrop-blur-md';
                                                                    cardOpacityClass = 'opacity-80 hover:opacity-100 transition-opacity';
                                                                    cardBorderClass = "border-white/60 border-l-[4px] border-l-emerald-500 hover:border-emerald-300 border-y border-r";
                                                                } else if (isSuspensa) {
                                                                    cardBgClass = 'bg-orange-50/90 backdrop-blur-md';
                                                                    cardOpacityClass = 'opacity-80 hover:opacity-100 transition-opacity';
                                                                    cardBorderClass = "border-white/60 border-l-[4px] border-l-orange-500 hover:border-orange-300 border-y border-r";
                                                                } else if (isNaoInternou) {
                                                                    cardBgClass = 'bg-rose-50/90 backdrop-blur-md';
                                                                    cardOpacityClass = 'opacity-80 hover:opacity-100 transition-opacity';
                                                                    cardBorderClass = "border-white/60 border-l-[4px] border-l-rose-500 hover:border-rose-300 border-y border-r";
                                                                } else if (statusUpper === 'BLOQUEIO') {
                                                                    cardBgClass = 'bg-rose-50/90 backdrop-blur-md text-rose-900';
                                                                    cardOpacityClass = 'opacity-100';
                                                                    cardBorderClass = "border-2 border-rose-300 border-dashed font-bold";
                                                                }

                                                                if (hasConflict) {
                                                                    cardBorderClass = "border-2 border-red-500 scale-[1.01]";
                                                                }

                                                                return (
                                                                    <div
                                                                        key={surgery.id}
                                                                        style={{...style, zIndex: activePopover === surgery.id ? 9999 : style.zIndex}}
                                                                        onClick={(e) => { e.stopPropagation(); setActivePopover(surgery.id === activePopover ? null : surgery.id); setIsRescheduling(false); }}
                                                                        className={`absolute rounded-lg ${cardBorderClass} ${pStyle.shadow} ${cardBgClass} ${cardOpacityClass} pointer-events-auto hover:z-50 transition-all cursor-pointer shadow-sm flex flex-col overflow-visible ${activePopover === surgery.id ? '!z-[9999] !opacity-100' : ''}`}
                                                                    >
                                                                        <div className="px-2 py-1.5 h-full flex flex-col leading-none relative overflow-y-auto custom-scrollbar">
                                                                            {statusUpper === 'BLOQUEIO' ? (
                                                                                <div className="flex flex-col items-center justify-center h-full text-center p-1 w-full relative">
                                                                                    <div className="font-extrabold text-[11px] text-rose-900 tracking-normal mb-2 bg-rose-100/80 px-2.5 py-1 rounded-md border border-rose-200">
                                                                                        {surgery.horario} - {endTime}
                                                                                    </div>
                                                                                    <div className="text-[11px] font-black text-rose-950 uppercase leading-tight line-clamp-3">
                                                                                        {procedimento}
                                                                                    </div>
                                                                                    <div className="text-[9px] font-bold text-rose-600 mt-2 uppercase tracking-widest bg-rose-100/80 px-2 py-0.5 rounded-full inline-block border border-rose-200/50">
                                                                                        🔒 Bloqueado
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    {/* Bloco 1 - Topo (Horário + Badge) */}
                                                                                    <div className="flex items-center justify-between gap-1 mb-1 flex-wrap">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <span className="font-extrabold text-[11px] text-slate-900 drop-shadow-none tracking-normal">{surgery.horario} - {endTime}</span>
                                                                                            <div className="flex items-center gap-0.5 ml-1">
                                                                                                {surgery.paciente_confirmado && <div className="text-blue-500 bg-blue-50 p-0.5 rounded-full border border-blue-200" title="Confirmado"><ThumbsUp size={11} strokeWidth={2.5}/></div>}
                                                                                                {isRealizado && <div className="text-emerald-500 bg-emerald-50 p-0.5 rounded-full border border-emerald-200" title="Realizada"><CheckCircle2 size={11} strokeWidth={2.5}/></div>}
                                                                                                {isSuspensa && <div className="text-orange-500 bg-orange-50 p-0.5 rounded-full border border-orange-200" title="Suspensa"><PauseCircle size={11} strokeWidth={2.5}/></div>}
                                                                                                {isNaoInternou && <div className="text-rose-500 bg-rose-50 p-0.5 rounded-full border border-rose-200 shadow-sm" title="Não Internou"><XCircle size={11} strokeWidth={2.5}/></div>}
                                                                                            </div>
                                                                                            {hasConflict && (
                                                                                                <span className="text-[9px] font-black text-white bg-red-500 px-1.5 py-0.5 rounded shadow-sm animate-pulse ml-1">
                                                                                                    ⚠️ CONFLITO
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className={`px-1.5 py-0.5 rounded-[4px] text-[9px] uppercase tracking-wide border whitespace-nowrap ${pStyle.badge}`}>
                                                                                            {prioridade}
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Bloco 2 - Procedimento Completo */}
                                                                                    <div className="flex items-start mb-1 shrink-0">
                                                                                        <div className="text-xs font-black text-slate-800 uppercase leading-[1.15] whitespace-normal break-words w-full" title={procedimento}>
                                                                                            {procedimento}
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Bloco 3 - Paciente Completo */}
                                                                                    <div className="flex items-start shrink-0 mb-1 mt-auto">
                                                                                        <div className="text-[11px] font-bold text-slate-700 uppercase leading-tight whitespace-normal break-words" title={pacienteRaw}>
                                                                                            {paciente} {idade && <span className="text-slate-500 font-medium ml-0.5">({idade})</span>}
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Bloco 4 - Médico e Telefone */}
                                                                                    <div className="flex flex-col gap-0.5 shrink-0 mt-auto mb-1">
                                                                                        <div className="text-[8.5px] font-medium text-slate-500 uppercase truncate">
                                                                                            Dr. {surgeonShort}
                                                                                        </div>
                                                                                        {(surgery.telefone1 || surgery.telefone) && (
                                                                                            <div className="text-[7.5px] font-normal text-slate-500 flex items-center gap-1">
                                                                                                <Phone size={7} className="text-slate-600 shrink-0"/> <span className="truncate">{surgery.telefone1 || surgery.telefone}</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>

                                                                                    {/* Rodapé - Chips */}
                                                                                    {durationMin >= 45 && (
                                                                                        <div className="mt-auto pt-1.5 border-t border-white/40 flex items-center gap-1.5 overflow-hidden shrink-0">
                                                                                            <span className="px-1.5 py-[3px] bg-slate-100/80 text-slate-500 rounded text-[7.5px] font-bold uppercase tracking-wide shrink-0 border border-white/60 max-w-[45px] truncate leading-none">
                                                                                                {convenio}
                                                                                            </span>
                                                                                            {cidade && (
                                                                                                <span className="px-1.5 py-[3px] bg-slate-100/80 text-slate-500 rounded text-[7.5px] font-bold uppercase tracking-wide truncate border border-white/60 leading-none" title={cidade}>
                                                                                                    {cidade}
                                                                                                </span>
                                                                                            )}
                                                                                            {anestesia !== '---' && (
                                                                                                <span className="px-1.5 py-[3px] bg-slate-100/80 text-slate-500 rounded text-[7.5px] font-bold uppercase tracking-wide shrink-0 border border-white/60 leading-none" title={anestesia}>
                                                                                                    {anestesia}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>

                                                                        {activePopover === surgery.id && (
                                                                            <>
                                                                                <div
                                                                                    className="fixed top-16 inset-x-0 bottom-0 z-[9998]"
                                                                                    onClick={(e) => { e.stopPropagation(); setActivePopover(null); setIsRescheduling(false); setIsSuspending(false); setIsObservacoesOpen(false); setNovaObs(''); setMotivoSuspensaoId(''); }}
                                                                                />
                                                                                <div className="absolute top-0 left-0 mt-2 ml-2 bg-white/95 backdrop-blur-xl shadow-2xl border border-white/60 rounded-2xl p-2 z-[9999] flex flex-col gap-1.5 w-[360px] animate-in fade-in zoom-in-95 origin-top-left overflow-visible" onClick={(e) => e.stopPropagation()}>
                                                                                    <div className="flex justify-between items-center pb-1.5 border-b border-white/40 mb-0.5">
                                                                                        <span className="text-[10px] font-black text-slate-500 flex flex-col uppercase tracking-widest pl-1">
                                                                                            {isRescheduling ? 'Rápido Reagendamento' : isSuspending ? 'Motivo da Suspensão' : 'Menu de Ações'}
                                                                                            {!isRescheduling && !isSuspending && <span className="text-[7px] font-bold tracking-normal text-slate-600 normal-case mt-0.5">{surgery.nomePaciente || surgery.paciente}</span>}
                                                                                        </span>
                                                                                        <button onClick={() => { setActivePopover(null); setIsRescheduling(false); setIsSuspending(false); setIsObservacoesOpen(false); }} className="text-slate-500 hover:text-rose-500 bg-white/60 hover:bg-rose-50 p-1 rounded-full transition-colors"><X size={12} /></button>
                                                                                    </div>

                                                                                    {isSuspending ? (
                                                                                        <div className="flex flex-col gap-3 p-2 animate-in fade-in slide-in-from-right-4" onClick={e => e.stopPropagation()}>
                                                                                            <label className="text-[11px] font-black text-rose-700 uppercase tracking-widest block">Qual o motivo da Suspensão? <span className="text-red-500">*</span></label>
                                                                                            <select 
                                                                                                value={motivoSuspensaoId} 
                                                                                                onChange={(e) => setMotivoSuspensaoId(e.target.value)}
                                                                                                className="w-full h-10 px-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-slate-700 outline-none uppercase"
                                                                                            >
                                                                                                <option value="">Selecione o motivo...</option>
                                                                                                {motivosSuspensao.map(m => (
                                                                                                    <option key={m.id} value={m.id}>{m.descricao}</option>
                                                                                                ))}
                                                                                            </select>
                                                                                            <div className="flex items-center justify-between gap-2 mt-2">
                                                                                                <button onClick={(e) => { e.stopPropagation(); setIsSuspending(false); }} className="flex-1 px-2 py-2 bg-white/70 text-slate-600 text-[11px] font-bold uppercase rounded-lg hover:bg-white/80 transition-colors border border-white/60">Cancelar</button>
                                                                                                <button onClick={(e) => handleQuickAction(e, surgery, 'suspend')} className="flex-1 px-2 py-2 bg-rose-500 text-white text-[11px] font-bold uppercase rounded-lg hover:bg-rose-600 transition-colors shadow-sm">Suspender</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : isObservacoesOpen ? (
                                                                                        <div className="flex flex-col gap-3 p-2 animate-in fade-in slide-in-from-right-4" onClick={e => e.stopPropagation()}>
                                                                                            {(surgery.observacoes || surgery.obs) && (
                                                                                                <div className="p-2.5 bg-yellow-50/80 border border-yellow-200/60 rounded-lg text-[11px] font-medium text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                                                                                                    {surgery.observacoes || surgery.obs}
                                                                                                </div>
                                                                                            )}
                                                                                            <div className="flex flex-col gap-2">
                                                                                                <label className="text-[11px] font-black text-teal-700 uppercase tracking-widest block">Nova Anotação</label>
                                                                                                <textarea 
                                                                                                    value={novaObs}
                                                                                                    onChange={(e) => setNovaObs(e.target.value)}
                                                                                                    placeholder="Digite aqui..."
                                                                                                    className="w-full h-20 p-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs outline-none resize-none font-medium"
                                                                                                />
                                                                                            </div>
                                                                                            <div className="flex items-center justify-between gap-2 mt-1">
                                                                                                <button onClick={(e) => { e.stopPropagation(); setIsObservacoesOpen(false); }} className="flex-1 px-2 py-2 bg-white/70 text-slate-600 text-[11px] font-bold uppercase rounded-lg hover:bg-white/80 transition-colors border border-white/60">Voltar</button>
                                                                                                <button onClick={(e) => handleQuickAction(e, surgery, 'add_obs')} disabled={!novaObs.trim()} className="flex-1 px-2 py-2 bg-teal-600 text-white text-[11px] font-bold uppercase rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm">Salvar Nota</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : isRescheduling ? (
                                                                                        <div className="flex flex-col gap-2 p-2 animate-in fade-in slide-in-from-right-4" onClick={e => e.stopPropagation()}>
                                                                                            <div className="flex flex-col gap-1">
                                                                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Data</label>
                                                                                                <input type="date" value={rescheduleForm.dataAgendado} onChange={e => setRescheduleForm({...rescheduleForm, dataAgendado: e.target.value})} className="w-full text-xs p-1.5 border border-white/60 rounded-md bg-white/60 text-slate-900 drop-shadow-none" />
                                                                                            </div>
                                                                                            <div className="flex flex-col gap-1">
                                                                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Horário</label>
                                                                                                <input type="time" value={rescheduleForm.horario} onChange={e => setRescheduleForm({...rescheduleForm, horario: e.target.value})} className="w-full text-xs p-1.5 border border-white/60 rounded-md bg-white/60 text-slate-900 drop-shadow-none" />
                                                                                            </div>
                                                                                            <div className="flex flex-col gap-1">
                                                                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Sala</label>
                                                                                                <select value={rescheduleForm.sala} onChange={e => setRescheduleForm({...rescheduleForm, sala: e.target.value})} className="w-full text-xs p-1.5 border border-white/60 rounded-md bg-white/60 text-slate-900 drop-shadow-none">
                                                                                                    <option value="">Selecione...</option>
                                                                                                    {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                                                                                                </select>
                                                                                            </div>
                                                                                            <div className="flex items-center justify-between gap-2 mt-2">
                                                                                                <button onClick={(e) => { e.stopPropagation(); setIsRescheduling(false); }} className="flex-1 px-2 py-1.5 bg-white/70 text-slate-600 text-[11px] font-bold uppercase rounded-md hover:bg-white/80 transition-colors border border-white/60">Voltar</button>
                                                                                                <button onClick={(e) => { e.stopPropagation(); handleUpdate(surgery.id, rescheduleForm); setIsRescheduling(false); setActivePopover(null); }} className="flex-1 px-2 py-1.5 bg-indigo-500 text-white text-[11px] font-bold uppercase rounded-md hover:bg-indigo-600 transition-colors shadow-sm">Reagendar</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : statusUpper === 'BLOQUEIO' ? (
                                                                                        <div className="p-4 w-full flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in-95 bg-slate-100/50 rounded-xl mx-auto">
                                                                                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest text-center mt-2">🔒 Horário Bloqueado</span>
                                                                                            <p className="text-xs font-bold text-slate-900 drop-shadow-none text-center uppercase border-l-2 border-slate-400 pl-2 text-left w-full my-1">{procedimento}</p>
                                                                                            
                                                                                            {hasPermission('Acao: Bloquear Agenda') ? (
                                                                                                <button 
                                                                                                    onClick={async (e) => {
                                                                                                        e.stopPropagation();
                                                                                                        const toastId = toast.loading('Liberando agenda...');
                                                                                                        try {
                                                                                                            await supabase.from('surgeries').delete().eq('id', surgery.id);
                                                                                                            await logAction('Agenda Liberada', `Bloqueio (${procedimento}) removido na Sala ${surgery.sala} dia ${surgery.dataAgendado} às ${surgery.horario}`);
                                                                                                            toast.success('Bloqueio removido!', { id: toastId });
                                                                                                            setActivePopover(null);
                                                                                                            const { data: novasCirurgias } = await fetchPaginatedSurgeries();
                                                                                                            if (novasCirurgias) {
                                                                                                                const processed = processSurgeries(novasCirurgias);
                                                                                                                setAllSurgeriesMap(processed);
                                                                                                                setSurgeries(processed.filter(s => s.dataAgendado));
                                                                                                            }
                                                                                                        } catch (error) {
                                                                                                            toast.error('Erro ao remover', { id: toastId });
                                                                                                        }
                                                                                                    }} 
                                                                                                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-[11px] uppercase rounded-lg shadow-md transition-colors w-full mt-2"
                                                                                                >
                                                                                                    Liberar Horário
                                                                                                </button>
                                                                                            ) : (
                                                                                                <div className="text-[10px] font-bold text-slate-500 uppercase text-center mt-2 border border-white/60 rounded-lg py-2">Sem permissão para liberar</div>
                                                                                            )}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="p-2 w-full flex flex-col gap-3 animate-in fade-in zoom-in-95">
                                                                                            {/* SEÇÃO 1: Status */}
                                                                                            {(hasPermission('Acao: Confirmar') || hasPermission('Acao: Realizada') || hasPermission('Acao: Suspensa') || hasPermission('Acao: Nao Internou')) && (
                                                                                                <div className="bg-white/60 p-2 rounded-xl border border-slate-100/60">
                                                                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Evolução do Status</div>
                                                                                                    <div className="grid grid-cols-4 gap-2">
                                                                                                        {hasPermission('Acao: Confirmar') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => handleQuickAction(e, surgery, 'confirm')}>
                                                                                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all border shadow-sm duration-300 ${surgery.paciente_confirmado ? 'bg-blue-600 text-white border-blue-700 shadow-blue-200' : 'bg-white/60 text-blue-500 border-blue-100 hover:bg-blue-600 hover:text-white group-hover:scale-105'}`}><ThumbsUp size={16} /></div>
                                                                                                                <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-blue-600">{surgery.paciente_confirmado ? "Desmarcar" : "Confirmar"}</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {hasPermission('Acao: Realizada') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => handleQuickAction(e, surgery, 'realize')}>
                                                                                                                <div className="h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-emerald-500 border border-emerald-100 shadow-sm hover:bg-emerald-500 hover:text-white group-hover:scale-105"><CheckCircle2 size={16} /></div>
                                                                                                                <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-emerald-600">Realizada</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {hasPermission('Acao: Suspensa') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => { e.stopPropagation(); setIsSuspending(true); }}>
                                                                                                                <div className="h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-orange-500 border border-orange-100 shadow-sm hover:bg-orange-500 hover:text-slate-800 group-hover:scale-105"><PauseCircle size={16} /></div>
                                                                                                                <span className="text-[9px] font-bold tracking-normal text-center whitespace-nowrap group-hover:text-orange-600">Suspensa</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {hasPermission('Acao: Nao Internou') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => handleQuickAction(e, surgery, 'naointernou')}>
                                                                                                                <div className="h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-amber-600 border border-amber-200 shadow-sm hover:bg-amber-500 hover:text-slate-800 group-hover:scale-105"><UserMinus size={16} /></div>
                                                                                                                <span className="text-[7.5px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-amber-600 leading-tight mt-0.5">Não<br/>Internou</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}

                                                                                            {/* SEÇÃO 2: Ações de Agenda */}
                                                                                            {hasPermission('Acao: Retrabalho') && (
                                                                                                <div className="bg-white/60 p-2 rounded-xl border border-slate-100/60">
                                                                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Retrabalho / Agenda</div>
                                                                                                    <div className="grid grid-cols-4 gap-2">
                                                                                                        <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => { e.stopPropagation(); setRescheduleForm({ dataAgendado: surgery.dataAgendado || '', horario: surgery.horario || '', sala: surgery.sala || '' }); setIsRescheduling(true); }}>
                                                                                                            <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-indigo-500 border border-indigo-100 shadow-sm hover:bg-indigo-600 hover:text-white group-hover:scale-105"><CalendarClock size={15} /></div>
                                                                                                            <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-indigo-600">Reagendar</span>
                                                                                                        </div>
                                                                                                        <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => handleQuickAction(e, surgery, 'reset')}>
                                                                                                            <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-slate-500 border border-white/60 shadow-sm hover:bg-slate-500 hover:text-white group-hover:scale-105"><RotateCcw size={15} /></div>
                                                                                                            <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-slate-600">Resetar</span>
                                                                                                        </div>
                                                                                                        <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => { e.stopPropagation(); handleUpdate(surgery.id, { dataAgendado: null, horario: null, sala: null, status: 'AGUARDANDO' }); setActivePopover(null); }}>
                                                                                                            <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-rose-500 border border-rose-100 shadow-sm hover:bg-rose-600 hover:text-white group-hover:scale-105"><CalendarX size={15} /></div>
                                                                                                            <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-rose-600">Desmarcar</span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}

                                                                                            {/* SEÇÃO 3: Prontuário */}
                                                                                            {(hasPermission('Acao: Anotar') || hasPermission('Acao: Editar Tudo') || hasPermission('Acao: Imprimir') || hasPermission('Acao: Anexos')) && (
                                                                                                <div className="bg-white/60 p-2 rounded-xl border border-slate-100/60 mb-1">
                                                                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Documentos / Edição</div>
                                                                                                    <div className="grid grid-cols-4 gap-2">
                                                                                                        {hasPermission('Acao: Anotar') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => { e.stopPropagation(); setIsObservacoesOpen(true); }}>
                                                                                                                <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-teal-600 border border-teal-200 shadow-sm hover:bg-teal-600 hover:text-white group-hover:scale-105"><MessageSquare size={15} /></div>
                                                                                                                <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-teal-600">Anotar</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {hasPermission('Acao: Editar Tudo') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => handleQuickAction(e, surgery, 'edit')}>
                                                                                                                <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-slate-600 border border-white/60 shadow-sm hover:bg-slate-800 hover:text-white group-hover:scale-105"><Edit3 size={15} /></div>
                                                                                                                <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-slate-900 drop-shadow-none">Editar Tudo</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {hasPermission('Acao: Imprimir') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => handleQuickAction(e, surgery, 'document')}>
                                                                                                                <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-violet-600 border border-violet-200 shadow-sm hover:bg-violet-600 hover:text-white group-hover:scale-105"><FileText size={15} /></div>
                                                                                                                <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-violet-600">Imprimir</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {hasPermission('Acao: Anexos') && (
                                                                                                            <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={(e) => handleQuickAction(e, surgery, 'edit')}>
                                                                                                                <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-slate-500 border border-white/60 shadow-sm hover:bg-slate-700 hover:text-white group-hover:scale-105"><Paperclip size={15} /></div>
                                                                                                                <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-slate-700">Anexos</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {/* A ficha nasce já vinculada a esta cirurgia, com a APA
                                                                                                            do paciente procurada automaticamente. */}
                                                                                                        {(hasPermission('Criar/Editar FA') || hasPermission('Acesso Total (Admin)')) && (
                                                                                                            <div
                                                                                                                className="flex flex-col items-center gap-1 cursor-pointer group"
                                                                                                                onClick={(e) => { e.stopPropagation(); navigate('/ficha-anestesica', { state: { surgery } }); }}
                                                                                                            >
                                                                                                                <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/60 text-rose-600 border border-rose-200 shadow-sm hover:bg-rose-600 hover:text-white group-hover:scale-105"><HeartPulse size={15} /></div>
                                                                                                                <span className="text-[9px] font-black tracking-normal text-center whitespace-nowrap group-hover:text-rose-600">Ficha Anest.</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                    </div>
                </div>
            </div>

            <div
                id="print-area-container"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: '-9999px',
                    zIndex: -1000,
                    backgroundColor: 'white',
                    pointerEvents: 'none',
                    overflow: 'hidden'
                }}
            >
                {view === 'week' ? (
                    <>
                        <div id="print-area-page-1" style={{ width: '794px', height: '1123px', backgroundColor: 'white' }}>
                            <PrintableWeeklyMap
                                surgeries={surgeries}
                                weekDays={weekDays.slice(0, 3)}
                                temposByCode={temposByCode}
                                temposByName={temposByName}
                                pageNumber={1}
                            />
                        </div>
                        <div id="print-area-page-2" style={{ width: '794px', height: '1123px', backgroundColor: 'white' }}>
                            <PrintableWeeklyMap
                                surgeries={surgeries}
                                weekDays={weekDays.slice(3, 6)}
                                temposByCode={temposByCode}
                                temposByName={temposByName}
                                pageNumber={2}
                            />
                        </div>
                    </>
                ) : (
                    <div id="print-area" style={{ width: '794px', height: '1123px', backgroundColor: 'white' }}>
                        <PrintableDailyMap
                            surgeries={surgeries}
                            rooms={visibleRooms}
                            currentDate={weekDays[0]}
                            temposByCode={temposByCode}
                            temposByName={temposByName}
                        />
                    </div>
                )}
            </div>

            {editingSurgery && (
                <EditSurgeryModal
                    surgery={editingSurgery}
                    settings={settings}
                    pacientes={pacientes}
                    allSurgeries={allSurgeriesMap}
                    onClose={() => setEditingSurgery(null)}
                    onSave={handleUpdate}
                />
            )}

            {isQueueModalOpen && (
                <SurgeryQueue
                    isModal={true}
                    slotInfo={selectedSlot}
                    onCloseModal={() => { setIsQueueModalOpen(false); setSelectedSlot(null); }}
                    onSelectForScheduling={handleScheduleFromQueue}
                    defaultTab={selectedSlot ? 'Aguardando Agendamento' : 'Todas'}
                />
            )}

            {internacaoPrompt && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setInternacaoPrompt(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl border border-white/60 w-full max-w-sm p-6 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Clock size={18} className="text-blue-600" />
                                <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">Horário da Internação</h3>
                            </div>
                            <button onClick={() => setInternacaoPrompt(null)} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={18} /></button>
                        </div>
                        <p className="text-[12px] font-semibold text-slate-500 mb-5">
                            Paciente: <span className="text-slate-700">{internacaoPrompt.nomePaciente || internacaoPrompt.paciente || '—'}</span>. Em que horário o paciente deve internar?
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {['05:00', '11:00'].map((h) => (
                                <button
                                    key={h}
                                    onClick={() => handleConfirmInternacao(h)}
                                    className="flex flex-col items-center justify-center gap-1 py-4 rounded-xl border-2 border-blue-100 bg-blue-50/60 hover:bg-blue-600 hover:border-blue-600 hover:text-white text-blue-700 transition-all shadow-sm group"
                                >
                                    <span className="text-2xl font-black tracking-tight">{h}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 group-hover:opacity-100">Mesmo dia</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div
                style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1000, pointerEvents: 'none' }}
            >
                <div id="preop-print-area">
                    {docSurgeryToPrint && <PreOpDocument surgery={docSurgeryToPrint} />}
                </div>
            </div>
            <FixedScheduleModal 
                isOpen={isFixedScheduleOpen} 
                onClose={() => setIsFixedScheduleOpen(false)} 
                rooms={visibleRooms}
                allRooms={rooms}
                hiddenRooms={hiddenRooms}
                setHiddenRooms={setHiddenRooms}
            />

        </div>
    );
};

export default WeeklyView;
