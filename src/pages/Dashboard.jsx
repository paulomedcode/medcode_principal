import React, { useState, useEffect, useMemo } from 'react';

import { supabase } from '../services/supabase';

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
    Calendar, Printer, Filter, CheckCircle2, Clock, AlertCircle, XCircle, Search, ChevronDown, ChevronUp,
    LayoutDashboard, RotateCcw, BarChart3, PieChart as PieChartIcon, Activity, Table2, Trash2, LineChart as LineChartIcon,
    Hexagon, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PacienteFormModal } from '../components/PacienteFormModal';
import { usePermission } from '../contexts/PermissionContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { useNavigate } from 'react-router-dom';

// --- CONFIGURAÇÕES PADRÃO (FALLBACK) ---
const DEFAULT_STATUS = ["Aguardando", "Agendado", "Realizado", "Cancelado", "Pendente", "Em Análise"];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];

// Cor estável por status (quando não há cor fixa na paleta) — garante bolinha colorida pra todo status
const DOT_COLORS = ['#0ea5e9', '#14b8a6', '#f97316', '#a855f7', '#ec4899', '#84cc16', '#f43f5e', '#6366f1', '#eab308', '#06b6d4', '#d946ef', '#22c55e'];
const colorFromLabel = (label) => {
    const s = String(label || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return DOT_COLORS[h % DOT_COLORS.length];
};

const Dashboard = () => {
    // --- ESTADOS COM INICIALIZAÇÃO SEGURA ---
    const [surgeries, setSurgeries] = useState([]);
    const [procedures, setProcedures] = useState([]);
    const [loading, setLoading] = useState(true);
    const { theme } = useWhiteLabel();
    const [settings, setSettings] = useState({ status: [], convenios: [], prioridades: [], especialidades: [] });
    const [medicos, setMedicos] = useState([]);
    // Estado para o Autocomplete de Procedimentos
    const [procSearch, setProcSearch] = useState('');
    const [showProcList, setShowProcList] = useState(false);

    // Estado para o Modal de Paciente
    const [isPacienteModalOpen, setIsPacienteModalOpen] = useState(false);
    const [selectedPaciente, setSelectedPaciente] = useState(null);
    const [loadingPacienteModal, setLoadingPacienteModal] = useState(false);

    // Configurações de Visualização
    const [chartDimension, setChartDimension] = useState('status');
    const [chartType, setChartType] = useState('pie');
    const [showChart, setShowChart] = useState(false); // Análise Visual oculta por padrão
    const navigate = useNavigate();

    // Autenticação e Permissões
    const { hasPermission } = usePermission();

    // Gestão de Datas
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [activeFilter, setActiveFilter] = useState('todos');

    // Filtros Avançados
    const [advancedFilters, setAdvancedFilters] = useState({
        paciente: '', cirurgiao: '', especialidade: '', cidade: '', procedimento: '', convenio: '', status: '',
        opme: false, aihPendente: false, autorizacaoPendente: false, apaPendente: false
    });
    const [smartFilterType, setSmartFilterType] = useState('Todos');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const hexToRgba = (hex, opacity) => {
        let r = 0, g = 0, b = 0;
        if (!hex) return `rgba(0,0,0,0.1)`;
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            return hex;
        }
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    // --- CARREGAMENTO DE DADOS ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Configurações
                const { data: settingsData } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
                if (settingsData && settingsData.data) {
                    setSettings(settingsData.data);
                }

                // 2. Procedimentos (SIGTAP) - Limitando a carga no Dashboard para evitar lentidão
                // Idealmente o Dashboard não deveria baixar 5000 procedimentos do SUS na montagem.
                // Mas mantendo a lógica com select no Supabase.
                const { data: procList } = await supabase.from('sigtap').select('nome, codigo');
                if (procList && Array.isArray(procList)) {
                    procList.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                    setProcedures(procList);
                }

                // 3. Médicos
                const { data: medicosData } = await supabase.from('users').select('*').in('role', ['Médico', 'Médico Coordenador']).eq('status', 'Ativo').order('name', { ascending: true });
                if (medicosData) {
                    setMedicos(medicosData);
                }
            } catch (error) {
                console.error("Erro ao carregar dados iniciais:", error);
                // Não trava o dashboard, segue com defaults
            }
        };
        fetchData();

        // 3. Cirurgias
        const loadSurgeries = async () => {
            try {
                const { data, error } = await supabase.from('surgeries').select('*').limit(5000).neq('status', 'Excluido');
                if (error) throw error;
                setSurgeries(data || []);
            } catch (error) {
                console.error("Erro ao buscar cirurgias:", error);
            } finally {
                setLoading(false);
            }
        };
        loadSurgeries();
    }, []);

    // --- FILTRAGEM SEGURA ---
    const filteredData = useMemo(() => {
        if (!surgeries || !Array.isArray(surgeries)) return [];

        return surgeries.filter(s => {
            if (!s) return false;
            const date = s.dataAgendado || s.dataAtendimento;
            if (dateRange.start || dateRange.end) {
                if (!date) return false;
                if (dateRange.start && date < dateRange.start) return false;
                if (dateRange.end && date > dateRange.end) return false;
            }

            if (advancedFilters.cirurgiao && String(s.cirurgiao || '').toUpperCase() !== String(advancedFilters.cirurgiao || '').toUpperCase()) return false;
            
            if (advancedFilters.especialidade && advancedFilters.especialidade !== 'Todas' && advancedFilters.especialidade !== 'Todos') {
                const sEspec = String(s.especialidade || '').trim().toUpperCase();
                const fEspec = String(advancedFilters.especialidade).trim().toUpperCase();
                if (sEspec !== fEspec) return false;
            }

            if (advancedFilters.paciente) {
                const pName = (s.nomePaciente || s.paciente || '').toLowerCase();
                if (!pName.includes(advancedFilters.paciente.toLowerCase())) return false;
            }

            if (advancedFilters.status) {
                const sStatus = (s.status || 'Agendado').trim().toLowerCase();
                const fStatus = advancedFilters.status.trim().toLowerCase();
                if (sStatus !== fStatus) return false;
            }

            if (advancedFilters.convenio && s.convenio !== advancedFilters.convenio) return false;

            if (advancedFilters.cidade && advancedFilters.cidade !== 'Todas' && advancedFilters.cidade !== 'Todos') {
                const sCity = String(s.municipio || '').trim().toUpperCase();
                const fCity = String(advancedFilters.cidade).trim().toUpperCase();
                if (sCity !== fCity) return false;
            }

            if (advancedFilters.procedimento) {
                const proc = (s.procedimento || '').trim().toLowerCase();
                const filterProc = advancedFilters.procedimento.trim().toLowerCase();
                if (proc !== filterProc) return false;
            }

            // Flags
            const obs = (s.observacoes || '').toLowerCase();
            if (advancedFilters.opme && !s.opme) return false;
            if (advancedFilters.aihPendente && (s.aih && String(s.aih).trim() !== '')) return false;
            if (advancedFilters.autorizacaoPendente && s.autorizada) return false;
            if (advancedFilters.apaPendente) {
                const isApaPending = s.apaPending === true || obs.includes('apa');
                if (!isApaPending) return false;
            }

            return true;
        }).sort((a, b) => (a.dataAgendado || '').localeCompare(b.dataAgendado || ''));
    }, [surgeries, dateRange, advancedFilters]);

    // --- CORES DOS CARDS (PALETA) ---
    const STATUS_PALETTE = {
        'Total Geral': '#111827', // gray-900
        'Aguardando': '#6b7280', // gray-500
        'Mensagem Enviada': '#eab308', // yellow-500
        'Com Pendência': '#f97316', // orange-500
        'Aguardando Autorização': '#7f1d1d', // red-900
        'Agendado': '#2563eb', // blue-600
        'Realizado': '#16a34a', // green-600
        'Cancelado': '#ef4444', // red-500
        'Suspenso': '#9333ea', // purple-600
        'Suspenso (Reagendar)': '#9333ea' // purple-600
    };
    const FALLBACK_COLOR = '#9ca3af'; // gray-400

    // --- KPIs DINÂMICOS COM FALLBACK ---
    const dynamicKPIs = useMemo(() => {
        const kpiList = [{ label: 'Total Geral', count: filteredData.length, color: STATUS_PALETTE['Total Geral'] || '#111827' }];

        // Usa settings.status se existir e for array, senão usa DEFAULT_STATUS
        const sourceStatuses = (settings?.status && Array.isArray(settings.status) && settings.status.length > 0)
            ? settings.status
            : DEFAULT_STATUS;

        let totalMatched = 0;

        sourceStatuses.forEach((st) => {
            // Conta case-insensitive e ignorando espaços (ex.: "Aguardando" vs "AGUARDANDO ")
            const count = filteredData.filter(s => String(s.status || '').trim().toUpperCase() === String(st).trim().toUpperCase()).length;
            totalMatched += count;

            // Resolve a cor (paleta fixa ou cor estável gerada pelo nome do status)
            let color = STATUS_PALETTE[st] || STATUS_PALETTE[Object.keys(STATUS_PALETTE).find(k => k.toLowerCase() === st.toLowerCase())] || colorFromLabel(st);

            kpiList.push({
                label: st,
                count: count,
                color: color
            });
        });

        // Fallback: Aqueles que não deram match em nenhum status oficial
        const othersCount = filteredData.length - totalMatched;

        // Sempre adiciona o card de segurança para garantir integridade visual e total bater 100%
        kpiList.push({
            label: 'Outros / Não Mapeados',
            count: othersCount,
            color: FALLBACK_COLOR
        });

        return kpiList;
    }, [filteredData, settings.status]);

    // --- DADOS PARA GRÁFICOS ---
    const chartData = useMemo(() => {
        const aggregate = {};

        filteredData.forEach(s => {
            let key = 'N/I';

            switch (chartDimension) {
                case 'status':
                    key = s.status || 'Agendado';
                    break;
                case 'cirurgiao':
                    key = s.cirurgiao ? s.cirurgiao.split(' ')[0] + ' ' + (s.cirurgiao.split(' ')[1] || '') : 'Sem Médico';
                    break;
                case 'especialidade':
                    key = s.especialidade ? s.especialidade.toUpperCase() : 'Sem Especialidade';
                    break;
                case 'prioridade':
                    key = (s.prioridade || 'Eletiva').toUpperCase();
                    break;
                case 'convenio':
                    key = (s.convenio || 'SUS').toUpperCase();
                    break;
                case 'procedimento':
                    key = (s.procedimento || 'Não Informado').toUpperCase();
                    if (key && key.length > 20) key = key.substring(0, 20) + '...';
                    break;
                default:
                    key = s.status || 'Agendado';
            }

            aggregate[key] = (aggregate[key] || 0) + 1;
        });

        return Object.entries(aggregate)
            .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 15);

    }, [filteredData, chartDimension]);

    // --- HELPERS ---
    const formatDate = (d) => {
        if (!d) return '-';
        try {
            const [y, m, day] = d.split('-');
            return `${day}/${m}/${y}`;
        } catch (e) { return d; }
    };

    const getSigtapCode = (procName) => {
        if (!procName || !procedures || !Array.isArray(procedures)) return '-';
        const found = procedures.find(p => p.nome && String(p.nome).trim().toLowerCase() === String(procName).trim().toLowerCase());
        return found ? found.codigo : '-';
    };

    const uniqueCities = useMemo(() => {
        if (!surgeries) return [];
        return [...new Set(surgeries.map(s => s.cidade).filter(Boolean))].sort();
    }, [surgeries]);

    // --- HANDLERS UI ---
    const resetFilters = () => {
        setDateRange({ start: '', end: '' });
        setActiveFilter('todos');

        setAdvancedFilters({
            paciente: '', cirurgiao: '', especialidade: '', cidade: '', procedimento: '', convenio: '', status: '',
            opme: false, aihPendente: false, autorizacaoPendente: false, apaPendente: false
        });
        setSmartFilterType('Todos');
        setProcSearch(''); // Limpa o input de busca também
        toast.success("Filtros limpos!");
    };

    const handleOpenPaciente = (surgery) => {
        // Abre a cirurgia direto na Fila Cirúrgica (a Fila lê location.state.editCirurgiaId)
        if (!surgery?.id) {
            toast.error("Cirurgia sem identificador — não foi possível abrir na Fila.");
            return;
        }
        navigate('/fila', { state: { editCirurgiaId: surgery.id } });
    };

    const setPreset = (type) => {
        const today = new Date();
        let start = '', end = '';

        if (type === 'anterior') {
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
        } else if (type === 'atual') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (type === 'seguinte') {
            start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        }

        setActiveFilter(type);
        if (type === 'todos') {
            setDateRange({ start: '', end: '' });
        } else {
            setDateRange({
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0]
            });
        }
    };

    const imprimirRelatorio = () => {
        let periodText = (!dateRange.start && !dateRange.end)
            ? 'Todos os Períodos'
            : `${formatDate(dateRange.start)} a ${formatDate(dateRange.end)}`;

        const usuarioNome = 'Usuário do Sistema';
        const hoje = new Date();
        const dataFormatada = hoje.toLocaleDateString('pt-BR');
        const horaFormatada = hoje.toLocaleTimeString('pt-BR');

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Relatório Analítico de Agendamentos Cirúrgicos</title>
                <style>
                    @page { size: landscape; margin: 1cm; }
                    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 0; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
                    .header h2 { margin: 5px 0 10px; font-size: 14px; font-weight: normal; }
                    .info { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 11px; }
                    th { background-color: #f0f0f0; font-weight: bold; text-transform: uppercase; }
                    .text-center { text-align: center; }
                    .footer { text-align: center; font-size: 10px; border-top: 1px solid #000; padding-top: 5px; margin-top: 20px; }
                    .total-row { font-weight: bold; background-color: #f9f9f9; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <div class="header">
                    ${theme.logoUrl ? `<img src="${theme.logoUrl}" alt="Logo" style="height:40px; width:auto; margin-bottom:10px;"/>` : ''}
                    <h1>${theme.nomeInstituicao}</h1>
                    <h2>Relatório Analítico de Agendamentos Cirúrgicos</h2>
                </div>
                <div class="info">
                    <span><strong>Período Filtrado:</strong> ${periodText}</span>
                    <span><strong>Gerado por:</strong> ${usuarioNome} em ${dataFormatada} às ${horaFormatada}</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th class="text-center">Status</th>
                            <th>Data</th>
                            <th>Horário</th>
                            <th>Paciente</th>
                            <th>Procedimento</th>
                            <th>Cód. SIGTAP</th>
                            <th>Cirurgião</th>
                            <th>Especialidade</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredData.map(s => `
                            <tr>
                                <td class="text-center">${s.status || 'Agendado'}</td>
                                <td>${s.dataAgendado ? formatDate(s.dataAgendado) : '-'}</td>
                                <td>${s.horario || '-'}</td>
                                <td>${(s.nomePaciente || s.paciente || '-').toUpperCase()}</td>
                                <td>${(s.procedimento || '-').toUpperCase()}</td>
                                <td>${getSigtapCode(s.procedimento)}</td>
                                <td>${(s.cirurgiao || '-').toUpperCase()}</td>
                                <td>${(s.especialidade || '-').toUpperCase()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="8" style="text-align: right;">Total de Registros Encontrados: ${filteredData.length}</td>
                        </tr>
                    </tfoot>
                </table>
                <div class="footer">
                    ${theme.nomeInstituicao} • Relatório gerado pelo sistema
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            // Dá um intervalo mínimo apenas para o navegador renderizar
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        } else {
            toast.error("Por favor, permita pop-ups para imprimir o relatório.");
        }
    };

    if (loading) {
        return (
            <div className="min-h-full flex items-center justify-center bg-white/60">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={40} className="text-blue-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Carregando Dashboard...</p>
                </div>
            </div>
        );
    }

    const TooltipStyle = { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };



    const renderChart = () => {
        if (!chartData || chartData.length === 0) return <div className="h-full flex items-center justify-center text-slate-500 font-bold uppercase text-xs">Sem dados para visualizar</div>;



        switch (chartType) {
            case 'pie':
                return (
                    <div className="w-full h-full min-h-[160px] relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                            <PieChart>
                                <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />)}
                                </Pie>
                                <RechartsTooltip contentStyle={TooltipStyle} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'area':
                return (
                    <div className="w-full h-full min-h-[160px] relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={0} textAnchor="middle" height={30} margin={{ bottom: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <RechartsTooltip contentStyle={TooltipStyle} />
                                <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'line':
                return (
                    <div className="w-full h-full min-h-[160px] relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={40} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <RechartsTooltip contentStyle={TooltipStyle} />
                                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'radar':
                return (
                    <div className="w-full h-full min-h-[160px] relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={chartData}>
                                <PolarGrid />
                                <PolarAngleAxis dataKey="name" tick={{ fontSize: 9 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 'auto']} />
                                <Radar name="Valor" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                                <RechartsTooltip contentStyle={TooltipStyle} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'bar_horizontal':
                return (
                    <div className="w-full h-full min-h-[160px] relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 9, fontWeight: 700, fill: '#475569' }} />
                                <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={TooltipStyle} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'bar_vertical':
            default:
                return (
                    <div className="w-full h-full min-h-[160px] relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={0} textAnchor="middle" height={40} margin={{ bottom: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={TooltipStyle} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={20}>
                                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                );
        }
    };

    const mainKeywords = ['total geral', 'agendad', 'aguardand', 'suspens', 'realizad', 'executad', 'cancelad'];
    const mainKPIs = dynamicKPIs.filter(kpi => mainKeywords.some(kw => kpi.label.toLowerCase().includes(kw)));
    const secondaryKPIs = dynamicKPIs.filter(kpi => !mainKeywords.some(kw => kpi.label.toLowerCase().includes(kw)));

    return (
        <div className="min-h-full bg-white/60 p-4 pl-6 sm:px-6 font-sans text-slate-800">

            {/* Header Tela */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4">
                <div>
                    <h1 className="text-2xl font-black tracking-normal text-slate-800 flex items-center gap-2">
                        <LayoutDashboard className="text-blue-600" /> Relatórios e Dashboard
                    </h1>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">{theme.nomeInstituicao}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white/60 backdrop-blur-lg border border-white/400 shadow-sm p-2 rounded-xl filters-section">
                    
                    <div className="flex bg-white/60 backdrop-blur-md p-1 rounded-lg border border-white/400 shadow-sm">
                        <button onClick={() => setPreset('todos')} className={`px-3 py-1.5 text-xs uppercase tracking-wide transition-all ${activeFilter === 'todos' ? 'bg-blue-600 text-white font-bold shadow-md rounded-md' : 'bg-transparent text-slate-900 drop-shadow-none hover:bg-white/60 rounded-md font-bold'}`}>Todos</button>
                        <button onClick={() => setPreset('anterior')} className={`px-3 py-1.5 text-xs uppercase tracking-wide transition-all ${activeFilter === 'anterior' ? 'bg-blue-600 text-white font-bold shadow-md rounded-md' : 'bg-transparent text-slate-900 drop-shadow-none hover:bg-white/60 rounded-md font-bold'}`}>Mês Ant.</button>
                        <button onClick={() => setPreset('atual')} className={`px-3 py-1.5 text-xs uppercase tracking-wide transition-all ${activeFilter === 'atual' ? 'bg-blue-600 text-white font-bold shadow-md rounded-md' : 'bg-transparent text-slate-900 drop-shadow-none hover:bg-white/60 rounded-md font-bold'}`}>Mês Atual</button>
                    </div>

                    <div className="flex items-center gap-2 px-3 bg-white/60 border border-white/80 rounded-lg p-2 shadow-sm">
                        <Calendar size={16} className="text-slate-600" />
                        <input type="date" value={dateRange.start} onChange={(e) => { setDateRange({ ...dateRange, start: e.target.value }); setActiveFilter('manual'); }} className="bg-transparent text-xs font-extrabold text-slate-900 drop-shadow-none outline-none hover:text-blue-700 cursor-pointer uppercase w-28" />
                        <span className="text-slate-500 font-extrabold text-xs uppercase">até</span>
                        <input type="date" value={dateRange.end} onChange={(e) => { setDateRange({ ...dateRange, end: e.target.value }); setActiveFilter('manual'); }} className="bg-transparent text-xs font-extrabold text-slate-900 drop-shadow-none outline-none hover:text-blue-700 cursor-pointer uppercase w-28" />
                    </div>
                    
                    <div className="h-6 w-px bg-slate-300 mx-1 hidden xl:block"></div>

                    <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase flex items-center gap-2 transition-all shadow-sm border ${showAdvancedFilters ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white/60 text-slate-900 drop-shadow-none border-white/80 hover:bg-white/5'}`}>
                        <Filter size={16} /> Filtros {Object.values(advancedFilters).some(v => v === true || v === 'Todas' || (typeof v === 'string' && v.length > 0)) && !showAdvancedFilters && <span className="w-2 h-2 rounded-full bg-rose-500/20"></span>}
                    </button>
                    
                    <button onClick={resetFilters} className="px-3 py-2 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 text-slate-600 hover:text-rose-600 transition-all border border-transparent hover:border-rose-200 hover:bg-rose-500/20" title="Limpar Tudo"><RotateCcw size={16} /> Limpar</button>
                    
                    {hasPermission('Acessar Relatórios') && (
                        <button onClick={imprimirRelatorio} className="ml-2 bg-white/40 text-slate-800 p-2 px-3 rounded-xl hover:bg-white/50 transition-colors shadow-md shadow-slate-300 flex items-center gap-1.5 font-bold text-xs uppercase" title="Imprimir Relatório"><Printer size={16} /> Imprimir</button>
                    )}
                </div>
            </div>

            {/* FILTROS RIBBON AVANÇADOS */}
            {showAdvancedFilters && (
                <div className="bg-white/90 backdrop-blur-xl px-5 py-4 rounded-xl shadow-lg border border-white/60 mb-5 z-50 animate-in slide-in-from-top-2 relative">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                        <h3 className="text-xs font-extrabold text-slate-900 drop-shadow-none uppercase tracking-wider flex items-center gap-2"><Search size={16} className="text-blue-600"/> Busca Avançada</h3>
                        
                        <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-white/70 rounded-xl border border-white/60 shadow-inner">
                            {['opme', 'aihPendente', 'autorizacaoPendente', 'apaPendente'].map((key) => {
                                let label = key === 'opme' ? 'OPME' : key === 'aihPendente' ? 'AIH Pendente' : key === 'autorizacaoPendente' ? 'Autorização Pend.' : 'APA Pendente';
                                return (
                                    <label key={key} className="flex items-center gap-2 text-xs font-extrabold uppercase text-slate-700 cursor-pointer select-none hover:text-blue-700">
                                        <input type="checkbox" className="rounded text-blue-600 w-4 h-4 border-white/80 shadow-sm" checked={advancedFilters[key]} onChange={(e) => setAdvancedFilters({ ...advancedFilters, [key]: e.target.checked })} /> {label}
                                    </label>
                                )
                            })}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {/* Paciente */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                            <input type="text" className="w-full h-10 pl-9 pr-3 rounded-lg border border-white/80 text-xs bg-white/60 text-slate-800 focus:ring-2 focus:ring-blue-500/50 outline-none uppercase font-bold shadow-sm placeholder:normal-case placeholder:font-normal placeholder:text-slate-500 transition-colors" placeholder="Paciente..." value={advancedFilters.paciente} onChange={(e) => setAdvancedFilters({ ...advancedFilters, paciente: e.target.value })} />
                        </div>

                        {/* Procedimento (SIGTAP) */}
                        <div className="relative group z-50">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600" size={14} />
                            <input type="text" className="w-full h-10 pl-9 pr-8 rounded-lg border border-white/80 text-xs bg-white/60 font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-500 shadow-sm" placeholder="Procedimento..." value={procSearch} onChange={(e) => { setProcSearch(e.target.value); setShowProcList(true); if (advancedFilters.procedimento) setAdvancedFilters(prev => ({ ...prev, procedimento: '' })); }} onFocus={() => setShowProcList(true)} />
                            {procSearch && (
                                <button onClick={() => { setAdvancedFilters(prev => ({ ...prev, procedimento: '' })); setProcSearch(''); setShowProcList(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-rose-500 p-1">
                                    <XCircle size={14} />
                                </button>
                            )}
                            {showProcList && (
                                <>
                                    <div className="fixed top-16 inset-x-0 bottom-0 z-40" onClick={() => setShowProcList(false)}></div>
                                    <ul className="absolute z-[100] w-[250px] bg-white/95 backdrop-blur-xl border border-white/60 rounded-lg shadow-xl max-h-64 overflow-y-auto custom-scrollbar mt-1 animate-in fade-in zoom-in-95 duration-200">
                                        <li className="px-4 py-2 hover:bg-white/60 text-[11px] font-bold text-slate-500 cursor-pointer border-b border-white/40" onClick={() => { setAdvancedFilters(prev => ({ ...prev, procedimento: '' })); setProcSearch(''); setShowProcList(false); }}>
                                            <span className="opacity-50">LIMPAR FILTRO / TODOS</span>
                                        </li>
                                        {procedures.filter(p => !procSearch || (p.nome && p.nome.toLowerCase().includes(procSearch.toLowerCase()))).slice(0, 50).map((p, i) => (
                                            <li key={p.id || p.codigo || i} className="px-4 py-2 hover:bg-blue-500/20 cursor-pointer border-b border-slate-50 last:border-0" onClick={() => { setAdvancedFilters(prev => ({ ...prev, procedimento: p.nome })); setProcSearch(p.nome); setShowProcList(false); }}>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-extrabold text-slate-500">{p.codigo}</span>
                                                    <span className="text-xs font-bold text-slate-900 drop-shadow-none uppercase leading-tight">{p.nome}</span>
                                                </div>
                                            </li>
                                        ))}
                                        {procedures.filter(p => !procSearch || (p.nome && p.nome.toLowerCase().includes(procSearch.toLowerCase()))).length === 0 && (
                                            <li className="px-4 py-3 text-center text-xs text-slate-500 italic">Nenhum encontrado.</li>
                                        )}
                                    </ul>
                                </>
                            )}
                        </div>

                        <div className="">
                            <select className="w-full h-10 px-3 rounded-lg border border-white/80 text-xs uppercase bg-white/60 font-bold text-slate-900 drop-shadow-none shadow-sm outline-none transition-colors" value={advancedFilters.cirurgiao} onChange={(e) => setAdvancedFilters({ ...advancedFilters, cirurgiao: e.target.value })}><option value="">Cirurgião...</option>{medicos.map((m) => <option key={m.id} value={String(m.name).toUpperCase()}>{m.name}</option>)}</select>
                        </div>

                        {/* Especialidade */}
                        <div className="">
                            <select className="w-full h-10 px-3 rounded-lg border border-white/80 text-xs uppercase bg-white/60 font-bold text-slate-900 drop-shadow-none shadow-sm outline-none transition-colors" value={advancedFilters.especialidade} onChange={(e) => setAdvancedFilters({ ...advancedFilters, especialidade: e.target.value })}><option value="">Especialidade...</option>{settings?.especialidades?.map(e => <option key={e} value={e}>{e}</option>)}</select>
                        </div>

                        {/* Cidade */}
                        <div className="">
                            <select className="w-full h-10 px-3 rounded-lg border border-white/80 text-xs uppercase bg-white/60 font-bold text-slate-900 drop-shadow-none shadow-sm outline-none transition-colors" value={advancedFilters.cidade} onChange={(e) => setAdvancedFilters({ ...advancedFilters, cidade: e.target.value })}><option value="">Cidade...</option>
                                {settings?.cidades?.length > 0 ? settings.cidades.map(c => <option key={c} value={c}>{c}</option>) : <option value="" disabled>Nenhuma</option>}
                            </select>
                        </div>

                        {/* Convênio */}
                        <div className="">
                            <select className="w-full h-10 px-3 rounded-lg border border-white/80 text-xs uppercase bg-white/60 font-bold text-slate-900 drop-shadow-none shadow-sm outline-none transition-colors" value={advancedFilters.convenio} onChange={(e) => setAdvancedFilters({ ...advancedFilters, convenio: e.target.value })}><option value="">Convênio...</option>{settings?.convenios?.map(c => <option key={c} value={c}>{c}</option>)}</select>
                        </div>

                        {/* Status */}
                        <div className="">
                            <select className="w-full h-10 px-3 rounded-lg border border-white/80 text-xs uppercase bg-white/60 font-bold text-slate-900 drop-shadow-none shadow-sm outline-none transition-colors" value={advancedFilters.status} onChange={(e) => setAdvancedFilters({ ...advancedFilters, status: e.target.value })}><option value="">Status...</option>{(settings?.status?.length > 0 ? settings.status : DEFAULT_STATUS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN KPIs (Heróis) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                {mainKPIs.map((kpi, index) => (
                    <div key={index} className="rounded-2xl p-5 shadow-sm border border-transparent hover:shadow-md transition-all relative overflow-hidden group" style={{ backgroundColor: hexToRgba(kpi.color, 0.08) }}>
                        <div className="relative z-10 flex flex-col justify-between h-full gap-3">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-extrabold uppercase tracking-widest truncate max-w-[80%]" style={{ color: kpi.color === '#111827' ? '#1e293b' : kpi.color }} title={kpi.label}>{kpi.label}</p>
                                {index === 0 ? <Activity size={22} style={{ color: kpi.color }} /> : <CheckCircle2 size={22} style={{ color: kpi.color }} opacity={kpi.color === '#111827' ? 1 : 0.8}/>}
                            </div>
                            <p className="text-4xl lg:text-5xl leading-none font-black tracking-normal" style={{ color: kpi.color }}>{kpi.count}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-5 mb-5">
                {/* Lado Esquerdo: KPIs Secundários e Gráfico (estreito) */}
                <div className="w-full lg:w-[25%] flex flex-col gap-4">
                    {secondaryKPIs.length > 0 && (
                        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm backdrop-blur-md border border-white/60 p-5">
                            <h3 className="text-xs uppercase font-extrabold text-slate-900 drop-shadow-none mb-4 flex items-center gap-2"><PieChartIcon size={16} className="text-slate-500" /> Outros Status</h3>
                            <div className="flex flex-col gap-2">
                                {secondaryKPIs.map(kpi => (
                                    <div key={kpi.label} className="bg-white/60 rounded-xl p-3 flex items-center justify-between border border-white/40 hover:border-white/60 transition-colors shadow-sm">
                                        <div className="flex items-center gap-2 truncate">
                                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: kpi.color }}></div>
                                            <span className="text-xs font-bold text-slate-700 uppercase truncate">{kpi.label}</span>
                                        </div>
                                        <span className="text-base font-black text-slate-800">{kpi.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Botão para mostrar/ocultar a Análise Visual */}
                    <button onClick={() => setShowChart(v => !v)} className="w-full bg-white/80 hover:bg-white border border-white/60 rounded-2xl shadow-sm p-3.5 flex items-center justify-between text-xs uppercase font-extrabold text-slate-700 transition-colors">
                        <span className="flex items-center gap-2"><BarChart3 size={16} className="text-blue-600" /> Análise Visual</span>
                        {showChart ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </button>

                    {showChart && (
                        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm backdrop-blur-md border border-white/60 p-5 flex flex-col justify-center animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs uppercase font-extrabold text-slate-900 drop-shadow-none flex items-center gap-2"><BarChart3 size={16} className="text-blue-600" /> Análise Visual</h3>
                                <select value={chartDimension} onChange={(e) => setChartDimension(e.target.value)} className="bg-white/60 border border-white/80 text-[11px] font-extrabold uppercase rounded-lg text-slate-700 p-1.5 w-28 outline-none shadow-sm focus:ring-2 focus:ring-blue-500/50">
                                    <option value="status">Status</option>
                                    <option value="cirurgiao">Cirurgião</option>
                                    <option value="convenio">Convênio</option>
                                    <option value="especialidade">Especialidade</option>
                                    <option value="procedimento">Procedimento</option>
                                </select>
                            </div>

                            <div className="h-44 md:h-52 w-full mt-2">
                                {renderChart()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Lado Direito: Tabela de Detalhamento (2/3) */}
                <div className="flex-1 bg-white/80 backdrop-blur-lg rounded-2xl border border-white/60 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-16rem)] lg:min-h-[500px]">
                    <div className="px-5 py-4 border-b border-white/60 flex justify-between items-center bg-white/60">
                        <h3 className="text-xs font-extrabold uppercase text-slate-900 drop-shadow-none flex items-center gap-2"><Table2 size={16} /> Detalhamento ({filteredData.length})</h3>
                    </div>
                    <div className="overflow-x-auto flex-1 custom-scrollbar">
                        <table className="w-full text-left border-collapse relative">
                            <thead className="sticky top-0 bg-white/95 backdrop-blur z-20 shadow-sm">
                                <tr className="border-b-2 border-white/80 text-[11px] font-extrabold text-slate-900 drop-shadow-none uppercase tracking-widest">
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3">Data</th>
                                    <th className="px-4 py-3">Horário</th>
                                    <th className="px-4 py-3">Paciente</th>
                                    <th className="px-4 py-3">Procedimento</th>
                                    <th className="px-4 py-3">Cód. SIGTAP</th>
                                    <th className="px-4 py-3">Cirurgião</th>
                                    <th className="px-4 py-3">Especialidade</th>
                                </tr>
                            </thead>
                        <tbody className="text-[11px] text-slate-600 divide-y divide-slate-100">
                            {filteredData.map((surgery) => (
                                <tr key={surgery.id} className="hover:bg-white/60 transition-colors">
                                    <td className="px-4 py-2.5 text-center">
                                        <span className={`inline-block px-2.5 py-1 rounded-[4px] font-black text-[10px] uppercase tracking-wider border ${String(surgery.status || '').toUpperCase() === 'REALIZADO' ? 'bg-emerald-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.4)] border-none border-emerald-200' :
                                            String(surgery.status || '').toUpperCase() === 'CANCELADO' ? 'bg-rose-500 text-white shadow-[0_4px_15px_rgba(244,63,94,0.4)] border-none border-rose-200' :
                                                'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none border-blue-200'
                                            }`}>{surgery.status || 'Agendado'}</span>
                                    </td>
                                    <td className="px-4 py-2.5 font-bold text-slate-800 whitespace-nowrap">{surgery.dataAgendado ? formatDate(surgery.dataAgendado) : '-'}</td>
                                    <td className="px-4 py-2.5 font-medium text-slate-500">{surgery.horario || '-'}</td>
                                    <td className="px-4 py-2.5">
                                        <div
                                            className="font-bold truncate max-w-[150px] cursor-pointer text-slate-800 hover:text-blue-600 flex items-center gap-2 transition-colors"
                                            title="Abrir na Fila Cirúrgica"
                                            onClick={() => handleOpenPaciente(surgery)}
                                        >
                                            <span className="truncate border-b border-transparent hover:border-blue-600">
                                                {(surgery.nomePaciente || surgery.paciente || '-').toUpperCase()}
                                            </span>
                                            {loadingPacienteModal && selectedPaciente?.id === surgery.pacienteId && <Loader2 size={12} className="animate-spin text-blue-500" />}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-bold text-slate-700 truncate max-w-[200px]" title={surgery.procedimento}>{(surgery.procedimento || '-').toUpperCase()}</td>
                                    <td className="px-4 py-2.5 font-mono font-bold text-slate-600 text-[11px]">{getSigtapCode(surgery.procedimento)}</td>
                                    <td className="px-4 py-2.5 font-bold text-slate-700 truncate max-w-[150px]">{(surgery.cirurgiao || '-').toUpperCase()}</td>
                                    <td className="px-4 py-2.5 font-bold text-slate-700 truncate max-w-[100px]">{(surgery.especialidade || '-').toUpperCase()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </div>
            </div>

            <PacienteFormModal
                isOpen={isPacienteModalOpen}
                onClose={() => {
                    setIsPacienteModalOpen(false);
                    setSelectedPaciente(null);
                }}
                paciente={selectedPaciente}
            />

        </div >
    );
};

export default Dashboard;