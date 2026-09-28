import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../contexts/PermissionContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { logAction } from '../utils/logger';
import { dataCompletaDoPlantao } from '../utils/logEscalaParser';
import { cup, Dot } from '../components/finance/cupertino';
import { 
    ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
    SlidersHorizontal, X, Grid, Building2, Settings, Copy, 
    DollarSign, Heart, ClipboardList, FileText, CalendarDays,
    Search, UserPlus, FileSpreadsheet, LayoutGrid, Users, 
    ShieldCheck, Clock, Sun, Moon, CircleDollarSign, Building,
    Check, Palette, User, Trash2, ChevronUp, ChevronDown, Edit2, Download, Activity, DatabaseBackup, UploadCloud, Loader2, Lock,
    AlertTriangle, MapPin, ChevronsUpDown, RotateCcw, FileSignature, Flag, Minimize2, Maximize2, Banknote
} from 'lucide-react';
import { printHospitalEscalaPdf, printMedicoEscalaPdf } from '../utils/pdfHospitalGenerator';
import CurrencyInput from '../components/finance/CurrencyInput';
import '../styles/escalaCompacta.css';
import SearchableSelect from '../components/finance/SearchableSelect';
import RepassesModal from '../components/escala/RepassesModal';
import PlantaoAVistaModal from '../components/escala/PlantaoAVistaModal';
import { findScheduleConflicts } from '../utils/escalaConflitos';
import { isPlaceholderDoctor, asUncoveredIfPlaceholder, setUncovered, UNCOVERED_LABEL } from '../utils/escalaDescoberto';
import { sendFolhaForSignature, fetchFolhaAssinaturas, cancelFolhaSignature, cancelFolhaEnvio, computeFolhaHash } from '../utils/folhaAssinaturas';
import { calcRepasseItem, getAssignmentTotal } from '../utils/escalaValores';
import { buildFolhaHtml, printFolhaPages } from '../utils/folhaPdf';

// Item do "Mais Opções" (lançamentos extras do dia): repasse em % do valor a
// receber ou digitado manualmente.
const NEW_EXTRA_ITEM = { descricao: '', receber: 0, repMode: 'pct', repPct: '', repValor: 0 };
// Valor do plantão e descrição do "Outros": em src/utils/escalaValores.js,
// compartilhados com a assinatura da folha e com a tela Meus Repasses.





const MOCK_FIXED_WEEKS = Array.from({ length: 5 }).map((_, i) => ({
    id: `fw${i + 1}`,
    title: `Semana ${i + 1}`,
    badge: `Fixa S${i + 1}`,
    days: [
        { date: 'Padrão', dayName: 'Segunda', isWeekend: false }, 
        { date: 'Padrão', dayName: 'Terça', isWeekend: false }, 
        { date: 'Padrão', dayName: 'Quarta', isWeekend: false },
        { date: 'Padrão', dayName: 'Quinta', isWeekend: false }, 
        { date: 'Padrão', dayName: 'Sexta', isWeekend: false }, 
        { date: 'Padrão', dayName: 'Sábado', isWeekend: true }, 
        { date: 'Padrão', dayName: 'Domingo', isWeekend: true }
    ]
}));

// Helper para abreviar os setores no celular
const getMobileSectorName = (sector) => {
    if (!sector) return '';
    const s = sector.toUpperCase();
    if (s.includes('DIURNO 2')) return 'D2';
    if (s.includes('DIURNO')) return 'D';
    if (s.includes('NOTURNO')) return 'N';
    if (s.includes('ANESTESISTA EXTRA 1')) return 'EX-1';
    if (s.includes('ANESTESISTA EXTRA 2')) return 'EX-2';
    if (s.includes('EXTRA')) return 'EX';
    if (s.includes('MANHÃ') || s.includes('MANHA')) return 'M';
    if (s.includes('TARDE')) return 'T';
    if (s.includes('AMBULATÓRIO') || s.includes('AMBULATORIO')) return 'AMB';
    return sector.substring(0, 3);
};

// Helper para gerar iniciais do médico (ex: Marcos Andre = MA)
const getInitials = (name) => {
    if (!name) return 'M';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'M';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Formata o nome para ficar menor e legível
const formatDoctorName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().toLowerCase().split(' ').filter(Boolean);
    if (parts.length === 0) return '';
    
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const firstName = parts[0];
    
    // Heurística básica para sexo feminino no Brasil (termina em 'a' ou nomes comuns sem 'a' no final)
    const femaleNames = new Set(['aline', 'gisele', 'simone', 'kelly', 'evelyn', 'carmen', 'iris', 'lais', 'ester', 'ruth', 'raquel', 'mirian', 'sueli', 'marli', 'roseli', 'cleide']);
    const isFemale = firstName.endsWith('a') || femaleNames.has(firstName);
    const title = isFemale ? 'Dra.' : 'Dr.';
    
    if (parts.length === 1) return `${title} ${capitalize(parts[0])}`;

    // Pega o primeiro sobrenome "real", ignorando preposições (de, do, da, dos, das, e) — só para exibição
    const prepositions = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);
    const lastName = parts.slice(1).find(p => !prepositions.has(p));

    if (!lastName) return `${title} ${capitalize(parts[0])}`;
    return `${title} ${capitalize(parts[0])} ${capitalize(lastName)}`;
};

// O papel da folha (CSS, tabelas, carimbo de assinatura) mora em
// src/utils/folhaPdf.js — a mesma função gera a folha aqui e no Meus Repasses.

const Escala = () => {
    const { currentUser } = useAuth();
    const { hasPermission, permissionsMatrix } = usePermission();
    const { theme } = useWhiteLabel();
    const isEscalaAdmin = hasPermission('Admin Escala');
    const canViewAll = isEscalaAdmin || hasPermission('Visualizar Toda Escala');
    // Observação do plantão = o campo "Subtítulo / Especialidade", que aparece
    // embaixo do nome na grade. Era invisível para quem não administra a escala
    // (o médico via só o plantão). Agora existe uma chave própria de leitura,
    // concedível por cargo ou individualmente, sem levar junto o financeiro.
    const canViewObs = isEscalaAdmin || hasPermission('Operacional Escala') || hasPermission('Ver Observações Escala');
    // Só quem tem esta permissão ESPECÍFICA pode editar/excluir plantões já marcados
    // como Verificado. Diferente das demais permissões, aqui NÃO vale o bypass de
    // "Acesso Total (Admin)": verificado é um estado congelado e definitivo, então nem
    // administradores destravam sem a caixinha "Editar/Excluir Plantões Verificados"
    // explicitamente ligada (ou concedida individualmente via permissoes_extras).
    // Sem ela, o plantão verificado fica somente-leitura e não pode ser removido nem
    // alterado. Root de Desenvolvedor continua com acesso total.
    const canEditVerified = (() => {
        if (!currentUser) return false;
        const role = String(currentUser.role || '').toLowerCase();
        if (role === 'desenvolvedor' || role === 'developer') return true;
        if (currentUser.permissoes_extras && currentUser.permissoes_extras['Editar Verificados Escala']) return true;
        const rolePermissions = permissionsMatrix[currentUser.role || 'Visualizador'] || {};
        return !!rolePermissions['Editar Verificados Escala'];
    })();

    // Duplicidade de plantão (mesmo médico em dois lugares no mesmo horário) é
    // BLOQUEADA para todo mundo. Só quem tem esta permissão específica consegue
    // gravar mesmo assim — e ainda precisa escrever o motivo, que vai para o log
    // e fica gravado no próprio plantão (appearance.conflictOverride).
    // Mesmo padrão estrito de canEditVerified: sem bypass de "Acesso Total".
    // Desenvolvedor é o único que enxerga o Cofre (restauração de backup da escala
    // inteira). Checagem estrita pelo cargo: "Acesso Total (Admin)" NÃO abre isso.
    const isDeveloper = ['desenvolvedor', 'developer'].includes(String(currentUser?.role || '').toLowerCase());

    const canForceConflict = (() => {
        if (!currentUser) return false;
        const role = String(currentUser.role || '').toLowerCase();
        if (role === 'desenvolvedor' || role === 'developer') return true;
        if (currentUser.permissoes_extras && currentUser.permissoes_extras['Forçar Conflito Escala']) return true;
        const rolePermissions = permissionsMatrix[currentUser.role || 'Visualizador'] || {};
        return !!rolePermissions['Forçar Conflito Escala'];
    })();

    const [doctors, setDoctors] = useState([]);
    const [hospitais, setHospitais] = useState([]);
    const [confirmReplicateWeek, setConfirmReplicateWeek] = useState(null);
    const [confirmRemove, setConfirmRemove] = useState(null);
    // Confirmação ao marcar um plantão como Verificado (ação definitiva).
    const [confirmVerify, setConfirmVerify] = useState(false);
    const [assignments, setAssignments] = useState({});
    const [activeSlot, setActiveSlot] = useState(null);
    const [searchDoc, setSearchDoc] = useState('');
    
    const [viewMode, setViewMode] = useState('all'); // 'all' ou 'my_scale'
    /*
     * Visão otimizada: a grade larga a 1.424px não cabe num iPad, e ler a semana
     * pela metade não serve para nada. Ligada, a tabela solta a largura mínima e
     * os sete dias dividem a tela que houver — vale para iPad, celular e monitor
     * pequeno sem precisar de regra por aparelho.
     *
     * Fica guardado no aparelho: quem trabalha no iPad ligaria isso toda vez que
     * abrisse a Escala. O padrão continua sendo a visão normal.
     */
    const [compacto, setCompacto] = useState(() => {
        try { return localStorage.getItem('escala_visao_otimizada') === '1'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem('escala_visao_otimizada', compacto ? '1' : '0'); } catch { /* modo privado */ }
    }, [compacto]);

    // Realce de pendências: a escala inteira fica em cinza e só os plantões
    // vermelhos, sinalizados ou sem cobertura mantêm a cor. É um realce, não um
    // filtro — combina com 'Todas' e com 'Minhas'.
    const [pendingOnly, setPendingOnly] = useState(false);
    const [visualizationMode, setVisualizationMode] = useState('mensal'); // 'mensal' ou 'fixa'
    const [selectedDoctor, setSelectedDoctor] = useState('');

    useEffect(() => {
        if (currentUser && !canViewAll) {
            setViewMode('my_scale');
            setSelectedDoctor(currentUser.name || '');
        } else if (currentUser && canViewAll && !selectedDoctor) {
            setViewMode('all');
        }
    }, [currentUser, canViewAll]);
    const [selectedHospital, setSelectedHospital] = useState(null);
    const [isHospitalExpanded, setIsHospitalExpanded] = useState(false);
    const [hideDropdown, setHideDropdown] = useState(null);

    // Lista de nomes de médicos (única e ordenada) para o filtro da escala
    const doctorOptions = useMemo(() => {
        const names = (doctors || [])
            .map(d => (typeof d === 'string' ? d : (d.name || d.nome || '')))
            .filter(Boolean);
        return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [doctors]);

    // Estado para o rascunho do modal do plantão
    const [draftAssignment, setDraftAssignment] = useState({
        doctorName: '',
        subtitle: '',
        period: 'Diurno',
        time: '07-19h',
        outros: false,
        ruleId: undefined,
        appearance: { bold: false, color: 'default', flagged: false, verified: false },
        financial: { baseValue: '', extraValue: '0', observations: '', locked: false, extraItems: [] }
    });

    // Cores do preview do modal: vermelho (ou vaga descoberta) vence o sinalizado.
    const previewRed = draftAssignment.appearance?.color === 'red' || !!draftAssignment.appearance?.uncovered;
    const previewFlagged = !previewRed && !!draftAssignment.appearance?.flagged;

    // Bloqueio de duplicidade: conflitos do rascunho aberto no modal e o pop-up
    // que barra o salvamento. `conflictBlock` guarda a lista de conflitos e os
    // dados já prontos para gravar, caso a exceção seja autorizada.
    const [conflictBlock, setConflictBlock] = useState(null);
    const [conflictReason, setConflictReason] = useState('');
    const [checkingConflict, setCheckingConflict] = useState(false);

    // Estados para o Modal de Gerenciamento de Meses
    const [isMonthModalOpen, setIsMonthModalOpen] = useState(false);
    const [keepWeekdays, setKeepWeekdays] = useState(true);
    const [newMonthVal, setNewMonthVal] = useState('');

    // Estados para o Modal de Hospitais
    const [isHospitalsModalOpen, setIsHospitalsModalOpen] = useState(false);
    const [editingHospitalId, setEditingHospitalId] = useState(null);
    const [tempHospital, setTempHospital] = useState(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    const getNormalizedPeriod = (p) => {
        const s = (p || '').toLowerCase();
        if (s.includes('noturno')) return 'Noturno';
        if (s.includes('manhã') || s.includes('manha')) return 'Manhã';
        if (s.includes('tarde')) return 'Tarde';
        if (s.includes('diurno') || s.includes('extra') || s.includes('anestesista')) return 'Diurno';
        return 'Diurno'; // Default fallback
    };

    const getDefaultTimeForPeriod = (period) => {
        const norm = getNormalizedPeriod(period);
        switch(norm.toLowerCase()) {
            case 'diurno': return '07-19h';
            case 'noturno': return '19-07h';
            case 'manhã': return '07-13h';
            case 'tarde': return '13-19h';
            default: return '';
        }
    };

    // ── Fase 2 — regra financeira selecionável por plantão ─────────────────────
    // Deriva período/categoria da regra: usa os campos estruturados quando existem
    // (definidos na tela de config), senão cai no fallback pelo nome (compat total
    // com as regras já cadastradas em settings.escala -> financialRules).
    const getRulePeriod = (rule) => rule.period || getNormalizedPeriod(rule.name);
    const isTopRule = (rule) => rule.category ? rule.category === 'Top' : /\btop\b/i.test(rule.name);

    // Regras aplicáveis a um plantão = as do próprio turno (hospital+setor) + as Gerais
    // do mesmo período. (getRulesForTurno é definido no bloco Fase 3.)
    const getApplicableRules = (hospitalName, sectorName, period) => {
        const { own, inherited } = getRulesForTurno(hospitalName, sectorName, period);
        return [...own, ...inherited];
    };

    // A regra "padrão" do turno = a que casa pelo nome exato do período (comportamento
    // legado, ciente de Top), senão a 1ª aplicável. É a que entra TRAVADA ao escolher
    // médico/período; o dropdown permite trocar por uma variante.
    const getDefaultRule = (rules, period, isTop) => {
        if (!rules.length) return null;
        const norm = getNormalizedPeriod(period);
        if (isTop) {
            return rules.find(r => r.name.toLowerCase() === `${norm} top`.toLowerCase())
                || rules.find(r => isTopRule(r))
                || rules.find(r => r.name.toLowerCase() === norm.toLowerCase())
                || rules[0];
        }
        return rules.find(r => r.name.toLowerCase() === norm.toLowerCase() && !isTopRule(r))
            || rules.find(r => !isTopRule(r))
            || rules[0];
    };

    // Estado para o Modal de Histórico
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Estado para o Modal de Backups (Máquina do Tempo)
    const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
    const [backupLogs, setBackupLogs] = useState([]);
    const [isLoadingBackups, setIsLoadingBackups] = useState(false);

    // Lixeira de meses (soft-delete): meses excluídos ficam recuperáveis por alguns dias no Cofre
    const TRASH_RETENTION_DAYS = 7;
    const [monthToDelete, setMonthToDelete] = useState(null); // confirmação de exclusão
    const [trashMonths, setTrashMonths] = useState([]);
    const [isLoadingTrash, setIsLoadingTrash] = useState(false);
    const [isProcessingMonth, setIsProcessingMonth] = useState(false);

    // Estado para o Modal Financeiro
    const [isFinanceiroModalOpen, setIsFinanceiroModalOpen] = useState(false);
    const [isFolhaPontoModalOpen, setIsFolhaPontoModalOpen] = useState(false);
    // Plantão aberto no pop-up de pagamento (null = fechado).
    const [avistaSlot, setAvistaSlot] = useState(null);
    const [folhaPontoFilter, setFolhaPontoFilter] = useState('all');
    const [folhaUnverifiedOpen, setFolhaUnverifiedOpen] = useState(true);

    useEffect(() => {
        if (isHistoryModalOpen) {
            fetchHistory();
        }
    }, [isHistoryModalOpen]);

    useEffect(() => {
        if (isBackupModalOpen) {
            fetchBackups();
            fetchTrashMonths();
        }
    }, [isBackupModalOpen]);

    const fetchBackups = async () => {
        setIsLoadingBackups(true);
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('*')
                .like('id', 'escala_backup_%')
                .order('id', { ascending: false });

            if (error) throw error;
            setBackupLogs(data || []);
        } catch (error) {
            console.error("Erro ao buscar backups:", error);
            toast.error("Falha ao carregar os backups.");
        } finally {
            setIsLoadingBackups(false);
        }
    };

    const handleRestoreBackup = async (backupRecord) => {
        const confirmRestore = window.confirm(`CUIDADO! Isso irá sobrescrever a escala atual pelo backup feito em ${new Date(backupRecord.data.timestamp).toLocaleString('pt-BR')}. Você perderá qualquer alteração feita DEPOIS desse horário. Deseja continuar?`);
        if (!confirmRestore) return;
        
        try {
            const loadingToast = toast.loading('Restaurando backup...');
            const restoredData = backupRecord.data.snapshot;
            
            const { error } = await supabase.from('settings').upsert({
                id: 'escala',
                data: restoredData
            });
            
            if (error) throw error;
            
            // Recarrega no state local
            setAssignments(restoredData.assignments || {});
            if (restoredData.hospitais) setHospitais(restoredData.hospitais);
            if (restoredData.financialRules) setFinancialRules(restoredData.financialRules);
            
            toast.success("Escala restaurada com sucesso!", { id: loadingToast });
            setIsBackupModalOpen(false);
            
            // Registra a ação de restore
            logAction('escala_backup_restored', `O administrador restaurou a escala para a versão do dia ${new Date(backupRecord.data.timestamp).toLocaleString('pt-BR')}.`);
            
        } catch (error) {
            console.error("Erro ao restaurar backup:", error);
            toast.error("Falha ao restaurar o backup.");
        }
    };

    const fetchHistory = async () => {
        setIsLoadingHistory(true);
        const { data, error } = await supabase
            .from('logs')
            .select('*')
            .ilike('action', 'escala_%')
            .order('timestamp', { ascending: false });
        if (!error && data) {
            setHistoryLogs(data);
        }
        setIsLoadingHistory(false);
    };

    // Estados para Regras Financeiras
    const [isFinancialRulesModalOpen, setIsFinancialRulesModalOpen] = useState(false);
    const [financialRules, setFinancialRules] = useState([]);
    const [editingRuleId, setEditingRuleId] = useState(null);
    const [tempRule, setTempRule] = useState(null);

    // Fase 3 — Configuração da Escala (catálogo Unidade → Turno → Opções de pagamento).
    const [configHospital, setConfigHospital] = useState(''); // '' = Geral (todos os hospitais)
    const [addingPeriod, setAddingPeriod] = useState(null);    // turno que está recebendo nova opção (chave = sectorName ou período no Geral)
    const [ruleDraft, setRuleDraft] = useState({ name: '', value: '', category: 'Padrão' });
    const [addingTurno, setAddingTurno] = useState(null);      // hospital que está recebendo novo turno
    const [turnoDraft, setTurnoDraft] = useState({ name: '', period: 'Diurno' });
    // Horário padrão por escopo+período (legado): { 'geral'|nomeHospital: { Diurno:'07-19h', ... } }
    const [periodTimes, setPeriodTimes] = useState({});
    // Metadados por turno: { nomeHospital: { nomeSetor: { period, time } } }. Turno = linha da grade.
    const [sectorMeta, setSectorMeta] = useState({});
    
    // Mock inicial de meses baseado no mês corrente
    const [existingMonths, setExistingMonths] = useState(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return [{ id: `${year}-${month}`, label: `${monthNames[d.getMonth()]} de ${year}` }];
    });
    const [activeMonth, setActiveMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // Assinatura eletrônica (Nível 1) das folhas do mês ativo — status por médico/hospital.
    const [folhaAssinaturas, setFolhaAssinaturas] = useState([]);
    const [sendingSignatureKey, setSendingSignatureKey] = useState(null);
    // Envio em lote em andamento — trava os botões para não disparar dois.
    const [enviandoLote, setEnviandoLote] = useState(false);

    /*
     * As assinaturas alimentam os dois modais (Folha de Ponto e Repasses) — e,
     * desde set/2026, também a GRADE: um plantão que já entrou numa folha
     * assinada não pode mais ser mexido, e isso precisa valer no clique de
     * remover, não só lá dentro do modal da folha. Por isso a busca acontece na
     * troca de mês, e não só quando um modal abre.
     */
    useEffect(() => {
        if (!activeMonth) return;
        fetchFolhaAssinaturas(activeMonth).then(setFolhaAssinaturas).catch(err => console.error('Erro ao buscar assinaturas da folha', err));
    }, [isFolhaPontoModalOpen, isFinanceiroModalOpen, activeMonth]);

    /*
     * Plantões que já fazem parte de uma folha ASSINADA → a assinatura daquele
     * médico.
     *
     * Existe por um estrago real: a folha de um médico
     * ficou assinada apontando para um plantão que foi excluído da escala
     * depois. O PDF dela sai com o carimbo "assinado eletronicamente" e NENHUMA
     * linha — um documento assinado sem conteúdo, que é exatamente o que uma
     * assinatura existe para impedir.
     */
    const assinaturaPorSlot = useMemo(() => {
        const mapa = {};
        folhaAssinaturas
            .filter(f => f.status === 'assinado')
            .forEach(f => (f.assignment_ids || []).forEach(id => { mapa[id] = f; }));
        return mapa;
    }, [folhaAssinaturas]);

    const findFolhaAssinatura = (doctorName, hospitalName) =>
        folhaAssinaturas.find(r => r.doctor_name === doctorName && r.hospital_name === hospitalName);

    const handleSendForSignature = async (doc, hospitalName) => {
        const key = `${hospitalName}-${doc.name}`;
        setSendingSignatureKey(key);
        try {
            const docRecord = (doctors || []).find(d => (d.name || d.nome) === doc.name);
            await sendFolhaForSignature({
                doctorId: docRecord?.id || null,
                doctorName: doc.name,
                hospitalName,
                monthVal: activeMonth,
                shifts: doc.shifts,
                requestedBy: currentUser?.id || null,
            });
            setFolhaAssinaturas(await fetchFolhaAssinaturas(activeMonth));
            toast.success('Folha enviada para assinatura!');
        } catch (e) {
            console.error('Erro ao enviar para assinatura', e);
            toast.error('Erro ao enviar para assinatura.');
        } finally {
            setSendingSignatureKey(null);
        }
    };

    // Desfaz um envio que o médico ainda não assinou (mandou pra pessoa errada,
    // mês errado, ou um plantão apareceu depois). Some da lista de pendências
    // dele e a folha volta a "não enviada". Só vale enquanto está pendente:
    // depois de assinada o caminho é handleCancelSignature, que preserva o
    // registro em vez de apagar.
    const handleCancelEnvio = async (doc, hospitalName) => {
        const record = findFolhaAssinatura(doc.name, hospitalName);
        if (!record || record.status !== 'pendente') return;
        if (!window.confirm(`Cancelar o envio da folha de ${formatDoctorName(doc.name)}? Ela sai das pendências do médico e volta para "não enviada".`)) return;

        const key = `${hospitalName}-${doc.name}`;
        setSendingSignatureKey(key);
        try {
            await cancelFolhaEnvio({ record });
            logAction('folha_envio_cancelado', `Envio da folha de ${doc.name} (${hospitalName}, ${activeMonth}) foi cancelado antes da assinatura.`);
            setFolhaAssinaturas(await fetchFolhaAssinaturas(activeMonth));
            toast.success('Envio cancelado.');
        } catch (e) {
            if (e.code === 'NAO_PENDENTE') {
                toast.error(e.message, { duration: 6000 });
                setFolhaAssinaturas(await fetchFolhaAssinaturas(activeMonth));
            } else {
                console.error('Erro ao cancelar envio', e);
                toast.error('Erro ao cancelar o envio.');
            }
        } finally {
            setSendingSignatureKey(null);
        }
    };

    /*
     * ENVIO EM LOTE para assinatura.
     *
     * Fechar o mês era clicar folha por folha — 51 vezes em agosto. O lote faz o
     * mesmo trabalho com uma decisão consciente por folha:
     *
     *   • NÃO ENVIADA        → envia;
     *   • PENDENTE desatualizada → reenvia. É o caso que mais dava dor de cabeça:
     *     o plantão mudou depois do envio, o médico assina, e o hash não bate
     *     mais na hora de mandar ao financeiro. Reenviar atualiza o documento
     *     antes de ele assinar;
     *   • PENDENTE em dia    → pula (já está com ele);
     *   • ASSINADA           → PULA SEMPRE. O envio é um upsert: passar por cima
     *     de uma folha assinada apagaria a assinatura, o traço e o IP. Nunca.
     *
     * A lista de assinaturas é RELIDA do banco antes de começar: entre abrir a
     * tela e clicar, um médico pode ter assinado — e essa é justamente a folha
     * que não pode ser tocada.
     */
    const enviarFolhasEmLote = async (hospitais, rotulo) => {
        if (enviandoLote) return;

        const candidatos = [];
        hospitais.forEach(h => h.doctors.forEach(doc => candidatos.push({ doc, hospitalName: h.name })));
        if (candidatos.length === 0) return;

        setEnviandoLote(true);
        const carregando = toast.loading('Conferindo as folhas...');
        try {
            const atuais = await fetchFolhaAssinaturas(activeMonth);
            const achar = (doctorName, hospitalName) =>
                atuais.find(r => r.doctor_name === doctorName && r.hospital_name === hospitalName);

            const enviar = [];
            let assinadas = 0, emDia = 0;

            for (const { doc, hospitalName } of candidatos) {
                const rec = achar(doc.name, hospitalName);
                if (rec?.status === 'assinado') { assinadas++; continue; }
                if (rec?.status === 'pendente') {
                    // Só reenvia se o conteúdo mudou desde o envio.
                    const { hash } = await computeFolhaHash({
                        doctorName: doc.name, hospitalName, monthVal: activeMonth, shifts: doc.shifts,
                    });
                    if (hash === rec.content_hash) { emDia++; continue; }
                }
                enviar.push({ doc, hospitalName, reenvio: rec?.status === 'pendente' });
            }

            toast.dismiss(carregando);

            if (enviar.length === 0) {
                toast(assinadas > 0 || emDia > 0
                    ? `Nada a enviar em ${rotulo}: ${emDia} já aguardando assinatura e ${assinadas} já assinada(s).`
                    : `Nenhuma folha para enviar em ${rotulo}.`, { icon: '👍', duration: 6000 });
                return;
            }

            const reenvios = enviar.filter(e => e.reenvio).length;
            const confirmacao =
                `Enviar ${enviar.length} folha(s) de ${rotulo} para assinatura?` +
                (reenvios > 0 ? `\n\n${reenvios} já estavam com o médico e mudaram desde o envio — serão atualizadas.` : '') +
                (assinadas > 0 ? `\n${assinadas} já assinada(s) não serão tocadas.` : '') +
                (emDia > 0 ? `\n${emDia} já aguardando e sem alteração ficam como estão.` : '');
            if (!window.confirm(confirmacao)) return;

            const progresso = toast.loading(`Enviando 0 de ${enviar.length}...`);
            let ok = 0;
            const falhas = [];
            for (const { doc, hospitalName } of enviar) {
                try {
                    const docRecord = (doctors || []).find(d => (d.name || d.nome) === doc.name);
                    await sendFolhaForSignature({
                        doctorId: docRecord?.id || null,
                        doctorName: doc.name,
                        hospitalName,
                        monthVal: activeMonth,
                        shifts: doc.shifts,
                        requestedBy: currentUser?.id || null,
                    });
                    ok++;
                } catch (e) {
                    console.error('Erro ao enviar folha em lote', doc.name, hospitalName, e);
                    falhas.push(`${formatDoctorName(doc.name)} (${hospitalName})`);
                }
                toast.loading(`Enviando ${ok + falhas.length} de ${enviar.length}...`, { id: progresso });
            }

            setFolhaAssinaturas(await fetchFolhaAssinaturas(activeMonth));
            toast.dismiss(progresso);

            if (falhas.length === 0) {
                toast.success(`${ok} folha(s) enviada(s) para assinatura.`, { duration: 6000 });
            } else {
                toast.error(`${ok} enviada(s), ${falhas.length} falharam: ${falhas.slice(0, 3).join(', ')}${falhas.length > 3 ? '…' : ''}`, { duration: 10000 });
            }
            logAction('folha_envio_lote', `Envio em lote (${rotulo}, ${activeMonth}): ${ok} enviada(s)${reenvios > 0 ? `, sendo ${reenvios} reenvio(s) por alteração` : ''}${assinadas > 0 ? `; ${assinadas} assinada(s) preservada(s)` : ''}${falhas.length > 0 ? `; ${falhas.length} falha(s): ${falhas.join(' | ')}` : ''}.`);
        } catch (e) {
            toast.dismiss(carregando);
            console.error('Erro no envio em lote', e);
            toast.error('Erro ao enviar as folhas.');
        } finally {
            setEnviandoLote(false);
        }
    };

    // Cancela uma folha já assinada (ex.: plantão/valor corrigido depois da
    // assinatura). Não apaga o histórico, só marca 'invalidado' — o botão de
    // enviar volta a aparecer pra gerar uma pendência nova pro médico.
    const handleCancelSignature = async (doc, hospitalName) => {
        const record = findFolhaAssinatura(doc.name, hospitalName);
        if (!record) return;

        // Folha já lançada no financeiro: o cancelamento aqui NÃO mexe na conta
        // a pagar (de propósito — dinheiro não se apaga por efeito colateral).
        // O aviso é explícito para ninguém achar que corrigir aqui corrige lá.
        if (record.transaction_id) {
            const ok = window.confirm(
                `ATENÇÃO: esta folha de ${formatDoctorName(doc.name)} JÁ FOI LANÇADA NO FINANCEIRO como conta a pagar.\n\n` +
                `Cancelar a assinatura aqui NÃO altera nem apaga esse lançamento. ` +
                `Se o valor mudar, você precisa atualizar a conta a pagar manualmente no Financeiro.\n\n` +
                `Deseja cancelar a assinatura mesmo assim?`
            );
            if (!ok) return;
        } else if (!window.confirm(`Cancelar a assinatura de ${formatDoctorName(doc.name)} nesta folha? Ela volta a ficar pendente e o médico vai precisar assinar de novo.`)) {
            return;
        }
        const key = `${hospitalName}-${doc.name}`;
        setSendingSignatureKey(key);
        try {
            await cancelFolhaSignature({ record, cancelledBy: currentUser?.id || null });
            logAction('folha_assinatura_cancelada', `Assinatura de ${doc.name} (${hospitalName}, ${activeMonth}) foi cancelada.${record.transaction_id ? ' ATENÇÃO: a folha já estava lançada no financeiro — o lançamento NÃO foi alterado.' : ''}`);
            setFolhaAssinaturas(await fetchFolhaAssinaturas(activeMonth));
            toast.success('Assinatura cancelada.');
        } catch (e) {
            console.error('Erro ao cancelar assinatura', e);
            toast.error('Erro ao cancelar assinatura.');
        } finally {
            setSendingSignatureKey(null);
        }
    };

    // Calendário do mês ativo: weekId -> dayIndex -> { date, inMonth }.
    // Usado para restringir a folha/verificação estritamente ao mês selecionado,
    // descartando plantões que caíram em dias de transbordo (fora do mês) mas
    // herdaram o prefixo do mês na duplicação da Escala Fixa.
    const activeMonthCalendar = useMemo(() => {
        const map = {};
        if (!activeMonth) return map;
        const [yStr, mStr] = activeMonth.split('-');
        const year = parseInt(yStr, 10);
        const month = parseInt(mStr, 10);
        let cd = new Date(year, month - 1, 1);
        const fdow = cd.getDay() === 0 ? 6 : cd.getDay() - 1;
        cd.setDate(cd.getDate() - fdow);
        for (let i = 0; i < 6; i++) {
            const weekId = `w${i + 1}`;
            const days = {};
            let hasValid = false;
            for (let j = 0; j < 7; j++) {
                const inMonth = cd.getMonth() === month - 1;
                if (inMonth) hasValid = true;
                days[j] = { date: `${String(cd.getDate()).padStart(2, '0')}/${String(cd.getMonth() + 1).padStart(2, '0')}`, inMonth };
                cd.setDate(cd.getDate() + 1);
            }
            if (hasValid) map[weekId] = days;
        }
        return map;
    }, [activeMonth]);

    // Um plantão pertence ao mês só se seu dia (weekId+dayIndex do slot) cai dentro do mês.
    const isSlotInActiveMonth = (slotId) => {
        const parts = slotId.split('-');
        if (parts.length < 6) return true; // formato inesperado: não descarta
        const cell = activeMonthCalendar[parts[2]]?.[parseInt(parts[5], 10)];
        return cell ? cell.inMonth : false;
    };

    // Variáveis Computadas do Financeiro
    const currentMonthVerifiedAssignments = Object.entries(assignments)
        .filter(([slotId, data]) => slotId.startsWith(activeMonth + '-') && isSlotInActiveMonth(slotId) && data.appearance?.verified && !data.appearance?.uncovered)
        .map(([slotId, data]) => ({ slotId, ...data }));
        
    // Os agregados por hospital/médico e os exports do antigo modal financeiro
    // saíram daqui: viraram o componente RepassesModal, que lê a mesma folha de
    // ponto e cruza com as contas a pagar do financeiro.

    // Gera dinamicamente as semanas baseadas no activeMonth
    const activeWeeks = useMemo(() => {
        if (visualizationMode === 'fixa') return MOCK_FIXED_WEEKS;
        if (!activeMonth) return [];
        
        const [yearStr, monthStr] = activeMonth.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        
        const weeks = [];
        let currentDate = new Date(year, month - 1, 1);
        
        // Volta para a segunda-feira da primeira semana do mês
        const firstDayOfWeek = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
        currentDate.setDate(currentDate.getDate() - firstDayOfWeek);
        
        // 6 semanas para garantir que cobre todos os dias (ex: mês começando no sábado)
        for (let i = 0; i < 6; i++) {
            const weekDays = [];
            let hasValidDays = false;
            
            for (let j = 0; j < 7; j++) {
                const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                const isValid = currentDate.getMonth() === month - 1;
                
                if (isValid) hasValidDays = true;
                
                weekDays.push({
                    date: `${currentDate.getDate().toString().padStart(2, '0')}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`,
                    dayName: dayNames[currentDate.getDay()],
                    isWeekend: currentDate.getDay() === 0 || currentDate.getDay() === 6,
                    isOutOfMonth: !isValid,
                    originalIndex: j
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // Só adiciona a semana se houver dias válidos
            if (hasValidDays) {
                const validDays = weekDays.filter(d => !d.isOutOfMonth);
                const startStr = validDays[0].date;
                const endStr = validDays[validDays.length - 1].date;
                weeks.push({
                    id: `w${i + 1}`,
                    title: `${startStr} a ${endStr}`,
                    badge: `Semana ${weeks.length + 1}`,
                    days: weekDays
                });
            }
        }
        return weeks;
    }, [activeMonth, visualizationMode]);

    const createOrGoToMonth = (monthVal) => {
        if (!monthVal) return;
        const [yearStr, monthStr] = monthVal.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const label = `${monthNames[month - 1]} de ${yearStr}`;
        
        if (!existingMonths.find(m => m.id === monthVal)) {
            const updatedMonths = [...existingMonths, { id: monthVal, label }];
            setExistingMonths(updatedMonths);
            logAction('escala_mes_criado', `Novo mês gerado na escala: ${label}`);
            
            let validOccurrences = null;
            if (keepWeekdays) {
                validOccurrences = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
                let currentDate = new Date(year, month - 1, 1);
                const firstDayOfWeek = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
                currentDate.setDate(currentDate.getDate() - firstDayOfWeek);
                
                for (let i = 0; i < 6; i++) {
                    let hasValidDays = false;
                    const weekDays = [];
                    for (let j = 0; j < 7; j++) {
                        const isValid = currentDate.getMonth() === month - 1;
                        if (isValid) hasValidDays = true;
                        weekDays.push({ isValid, originalIndex: j });
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                    if (hasValidDays) {
                        const weekId = `w${i + 1}`;
                        for (let j = 0; j < 7; j++) {
                            if (weekDays[j].isValid) {
                                validOccurrences[j].push(weekId);
                            }
                        }
                    }
                }
            }

            // Calendário real do mês-alvo: monthWeekDates[weekId][dayIndex] = 'DD/MM'
            // (espelha a geração de activeWeeks) para gravar a data correta já na duplicação,
            // em vez de herdar o placeholder 'Padrão' da Escala Fixa.
            const monthWeekDates = {};
            {
                let cd = new Date(year, month - 1, 1);
                const fdow = cd.getDay() === 0 ? 6 : cd.getDay() - 1;
                cd.setDate(cd.getDate() - fdow);
                for (let i = 0; i < 6; i++) {
                    const weekId = `w${i + 1}`;
                    const days = {};
                    let hasValid = false;
                    for (let j = 0; j < 7; j++) {
                        if (cd.getMonth() === month - 1) hasValid = true;
                        days[j] = `${cd.getDate().toString().padStart(2, '0')}/${(cd.getMonth() + 1).toString().padStart(2, '0')}`;
                        cd.setDate(cd.getDate() + 1);
                    }
                    if (hasValid) monthWeekDates[weekId] = days;
                }
            }
            const resolveNewDate = (weekId, dayIndex, fallback) => (
                monthWeekDates[weekId]?.[dayIndex] || ((fallback && fallback !== 'Padrão') ? fallback : '')
            );

            // Replicar Escala Fixa para o Novo Mês
            const newAssignments = { ...assignments };
            const rowsToUpsert = [];
            Object.entries(assignments).forEach(([key, value]) => {
                if (key.startsWith('FIXED-')) {
                    if (keepWeekdays && validOccurrences) {
                        const parts = key.split('-'); // FIXED-fw1-hId-sIdx-dayIndex
                        if (parts.length === 5) {
                            const fwWeek = parseInt(parts[1].replace('fw', ''), 10);
                            const hospitalId = parts[2];
                            const sectorIdx = parts[3];
                            const dayIndex = parseInt(parts[4], 10);
                            
                            const targetWeekIds = validOccurrences[dayIndex];
                            if (targetWeekIds && targetWeekIds[fwWeek - 1]) {
                                const targetWeekId = targetWeekIds[fwWeek - 1];
                                const newKey = `${monthVal}-${targetWeekId}-${hospitalId}-${sectorIdx}-${dayIndex}`;
                                const computedDate = resolveNewDate(targetWeekId, dayIndex, value.date);
                                newAssignments[newKey] = { ...value, date: computedDate };
                                rowsToUpsert.push({
                                    assignment_id: newKey,
                                    month_val: monthVal,
                                    doctor_name: value.doctorName || '',
                                    hospital_name: value.hospitalName || '',
                                    sector_name: value.sectorName || '',
                                    date: computedDate,
                                    financial_base: value.financial?.baseValue ? parseFloat(value.financial.baseValue) : 0,
                                    financial_extra: value.financial?.extraValue ? parseFloat(value.financial.extraValue) : 0,
                                    financial_obs: value.financial?.observations || '',
                                    rule_id: value.ruleId || null,
                                    base_locked: value.financial?.locked || false,
                                    subtitle: value.subtitle || '',
                                    period: value.period || null,
                                    time: value.time || null,
                                    appearance: value.appearance || {}
                                });
                            }
                        }
                    } else {
                        const newKey = key.replace('FIXED-', `${monthVal}-`).replace('-fw', '-w');
                        const fp = key.split('-'); // FIXED-fwN-hId-sIdx-dayIndex
                        const computedDate = fp.length === 5
                            ? resolveNewDate(fp[1].replace('fw', 'w'), parseInt(fp[4], 10), value.date)
                            : ((value.date && value.date !== 'Padrão') ? value.date : '');
                        newAssignments[newKey] = { ...value, date: computedDate };
                        rowsToUpsert.push({
                            assignment_id: newKey,
                            month_val: monthVal,
                            doctor_name: value.doctorName || '',
                            hospital_name: value.hospitalName || '',
                            sector_name: value.sectorName || '',
                            date: computedDate,
                            financial_base: value.financial?.baseValue ? parseFloat(value.financial.baseValue) : 0,
                            financial_extra: value.financial?.extraValue ? parseFloat(value.financial.extraValue) : 0,
                            financial_obs: value.financial?.observations || '',
                            rule_id: value.ruleId || null,
                            base_locked: value.financial?.locked || false,
                            subtitle: value.subtitle || '',
                            period: value.period || null,
                            time: value.time || null,
                            appearance: value.appearance || {}
                        });
                    }
                }
            });
            // Última peneira antes de gravar: a Escala Fixa pode conter duplicidades
            // antigas (o bloqueio só vale para o que é criado de agora em diante), e
            // nada impede que duas linhas da Fixa caiam no mesmo dia real do mês novo.
            // O que gerar conflito de horário é DESCARTADO — o mês nasce limpo.
            const poolMes = { ...assignments };
            const aprovadas = [];
            const descartadas = [];
            rowsToUpsert.forEach(row => {
                const conflitos = findScheduleConflicts(poolMes, {
                    slotId: row.assignment_id,
                    doctorName: row.doctor_name,
                    hospitalName: row.hospital_name,
                    sectorName: row.sector_name,
                    date: row.date,
                    period: row.period || undefined,
                    time: row.time || undefined
                });
                if (conflitos.length > 0) {
                    descartadas.push(`${formatDoctorName(row.doctor_name)} ${row.date} — ${row.hospital_name} x ${conflitos[0].hospitalName}`);
                    delete newAssignments[row.assignment_id];
                    return;
                }
                poolMes[row.assignment_id] = newAssignments[row.assignment_id];
                aprovadas.push(row);
            });

            setAssignments(newAssignments);
            if (aprovadas.length > 0) {
                supabase.from('escala_plantoes').upsert(aprovadas).then();
            }
            if (descartadas.length > 0) {
                toast.error(`${descartadas.length} plantão(ões) da Escala Fixa não foram gerados: o médico ficaria em dois lugares no mesmo horário.`, { duration: 8000 });
                logAction('escala_mes_criado', `Ao gerar ${label}, ${descartadas.length} plantões foram descartados por conflito de horário: ${descartadas.join(' | ')}`);
            }
            saveEscalaUpdate({ months: updatedMonths });
        }
        setActiveMonth(monthVal);
    };

    const handleCreateOrGoMonth = () => {
        createOrGoToMonth(newMonthVal);
        setIsMonthModalOpen(false);
        setNewMonthVal('');
    };

    const goToCurrentMonth = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const targetMonth = `${year}-${month}`;
        
        if (activeMonth !== targetMonth) {
            createOrGoToMonth(targetMonth);
        } else {
            // Se já estiver no mês atual, faz o scroll manualmente
            const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}`;
            const currentWeek = activeWeeks.find(w => w.days.some(d => d.date === todayStr));
            if (currentWeek) {
                const element = document.getElementById(`week-${currentWeek.id}`);
                if (element && element.parentNode) {
                    element.parentNode.scrollTo({ top: element.offsetTop - 20, behavior: 'smooth' });
                }
            }
        }
    };

    // Passo 1: abre a confirmação (não exclui direto)
    const requestDeleteMonth = (month, e) => {
        if (e) e.stopPropagation();
        setMonthToDelete(month);
    };

    // Passo 2: confirmado — antes de excluir, guarda uma cópia na lixeira (Cofre)
    // recuperável por TRASH_RETENTION_DAYS dias, depois remove os plantões do banco.
    const confirmDeleteMonth = async () => {
        const month = monthToDelete;
        if (!month) return;
        const id = month.id;
        setIsProcessingMonth(true);
        const loadingToast = toast.loading('Movendo mês para a lixeira...');
        try {
            /*
             * Mês com folha assinada não vai para a lixeira.
             *
             * Excluir o mês apaga TODOS os plantões dele de uma vez — inclusive
             * os que compõem folhas que médicos já assinaram. Cada uma dessas
             * folhas viraria um documento assinado sem lastro nenhum (o estrago
             * que já aconteceu uma vez, com um plantão só). A cópia na lixeira
             * não resolve: enquanto o mês estiver excluído, as folhas assinadas
             * apontam para o vazio.
             */
            const { data: assinadas, error: assErr } = await supabase
                .from('folha_assinaturas')
                .select('doctor_name, hospital_name')
                .eq('month_val', id)
                .eq('status', 'assinado');
            if (assErr) throw assErr;
            if (assinadas && assinadas.length > 0) {
                const quem = [...new Set(assinadas.map(a => `${formatDoctorName(a.doctor_name)} (${a.hospital_name})`))];
                toast.error(
                    `Este mês tem ${assinadas.length} folha(s) de ponto já ASSINADA(S): ${quem.slice(0, 3).join(', ')}${quem.length > 3 ? ` e mais ${quem.length - 3}` : ''}. ` +
                    'Cancele as assinaturas na Folha de Ponto antes de excluir o mês.',
                    { id: loadingToast, duration: 10000 }
                );
                setIsProcessingMonth(false);
                setMonthToDelete(null);
                return;
            }

            // Snapshot dos plantões do mês (fonte de verdade: tabela relacional)
            const { data: rows, error: rowsErr } = await supabase
                .from('escala_plantoes')
                .select('*')
                .eq('month_val', id);
            if (rowsErr) throw rowsErr;

            // Grava a cópia na lixeira (registro em settings, mesmo "cofre" dos backups)
            const ts = Date.now();
            const { error: trashErr } = await supabase.from('settings').upsert({
                id: `escala_lixeira_${id}__${ts}`,
                data: {
                    type: 'mes_excluido',
                    monthId: id,
                    monthLabel: month.label || id,
                    deletedAt: new Date().toISOString(),
                    deletedBy: currentUser?.name || currentUser?.email || 'Sistema',
                    month,
                    plantoes: rows || []
                }
            });
            if (trashErr) throw trashErr;

            // Remove o mês da lista e limpa os plantões locais + banco
            const updated = existingMonths.filter(m => m.id !== id);
            setExistingMonths(updated);

            const newAssignments = { ...assignments };
            Object.keys(newAssignments).forEach(key => {
                if (key.startsWith(id + '-')) delete newAssignments[key];
            });
            setAssignments(newAssignments);

            const { error: delErr } = await supabase.from('escala_plantoes').delete().eq('month_val', id);
            if (delErr) throw delErr;

            await saveEscalaUpdate({ months: updated });
            logAction('escala_mes_removido', `Mês movido para a lixeira: ${id} (${(rows || []).length} plantões). Recuperável por ${TRASH_RETENTION_DAYS} dias no Cofre.`);

            if (activeMonth === id) {
                setActiveMonth(updated.length > 0 ? updated[0].id : '');
            }

            toast.success(`Mês movido para a lixeira. Recuperável por ${TRASH_RETENTION_DAYS} dias no Cofre.`, { id: loadingToast });
            setMonthToDelete(null);
        } catch (error) {
            console.error('Erro ao excluir o mês:', error);
            toast.error('Falha ao excluir o mês. Nada foi removido.', { id: loadingToast });
        } finally {
            setIsProcessingMonth(false);
        }
    };

    // Carrega a lixeira de meses e, de passagem, expurga o que passou da validade
    const fetchTrashMonths = async () => {
        setIsLoadingTrash(true);
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('*')
                .like('id', 'escala_lixeira_%')
                .order('id', { ascending: false });
            if (error) throw error;

            const now = Date.now();
            const validos = [];
            const expirados = [];
            (data || []).forEach(rec => {
                const deletedAt = rec.data?.deletedAt ? new Date(rec.data.deletedAt).getTime() : 0;
                const ageDays = (now - deletedAt) / (1000 * 60 * 60 * 24);
                if (ageDays > TRASH_RETENTION_DAYS) expirados.push(rec.id);
                else validos.push(rec);
            });

            if (expirados.length > 0) {
                await supabase.from('settings').delete().in('id', expirados);
            }
            setTrashMonths(validos);
        } catch (error) {
            console.error('Erro ao carregar a lixeira de meses:', error);
        } finally {
            setIsLoadingTrash(false);
        }
    };

    // Restaura um mês da lixeira: reinsere os plantões e devolve o mês à lista
    const handleRestoreMonth = async (record) => {
        const d = record.data || {};
        const loadingToast = toast.loading('Restaurando mês...');
        try {
            // Reinsere os plantões (sem as colunas geradas pelo banco)
            const rows = (d.plantoes || []).map(({ created_at, updated_at, ...rest }) => rest);
            if (rows.length > 0) {
                const { error } = await supabase.from('escala_plantoes').upsert(rows);
                if (error) throw error;
            }

            // Devolve o mês à lista (se ainda não estiver lá)
            let updatedMonths = existingMonths;
            if (d.month && !existingMonths.some(m => m.id === d.monthId)) {
                updatedMonths = [...existingMonths, d.month].sort((a, b) => a.id.localeCompare(b.id));
                setExistingMonths(updatedMonths);
                await saveEscalaUpdate({ months: updatedMonths });
            }

            // Atualiza os plantões no state local
            const restored = { ...assignments };
            rows.forEach(p => {
                restored[p.assignment_id] = {
                    doctorName: p.doctor_name,
                    hospitalName: p.hospital_name,
                    sectorName: p.sector_name,
                    date: p.date,
                    ruleId: p.rule_id || undefined,
                    outros: p.folha_outros || false,
                    financial: {
                        baseValue: p.financial_base,
                        extraValue: p.financial_extra,
                        observations: p.financial_obs,
                        locked: p.base_locked || false,
                        extraItems: p.extra_items || []
                    },
                    subtitle: p.subtitle,
                    avista: p.paid_cash_at
                        ? { data: p.paid_cash_at, valor: Number(p.paid_cash_amount) || 0, transactionId: p.paid_cash_tx }
                        : null,
                    appearance: p.appearance || { bold: false, color: 'default', flagged: false, verified: false }
                };
            });
            setAssignments(restored);

            // Remove o registro da lixeira
            await supabase.from('settings').delete().eq('id', record.id);
            setTrashMonths(prev => prev.filter(r => r.id !== record.id));

            logAction('escala_mes_restaurado', `Mês ${d.monthId} restaurado da lixeira (${rows.length} plantões).`);
            toast.success('Mês restaurado com sucesso!', { id: loadingToast });
            setActiveMonth(d.monthId);
        } catch (error) {
            console.error('Erro ao restaurar o mês:', error);
            toast.error('Falha ao restaurar o mês.', { id: loadingToast });
        }
    };

    const handleNavigateMonth = (direction) => {
        if (!activeMonth || existingMonths.length === 0) return;
        
        // Ordena os meses para garantir a navegação cronológica correta
        const sortedMonths = [...existingMonths].sort((a, b) => a.id.localeCompare(b.id));
        const currentIndex = sortedMonths.findIndex(m => m.id === activeMonth);
        
        if (direction === 'prev' && currentIndex > 0) {
            setActiveMonth(sortedMonths[currentIndex - 1].id);
        } else if (direction === 'next' && currentIndex < sortedMonths.length - 1) {
            setActiveMonth(sortedMonths[currentIndex + 1].id);
        }
    };
    


    useEffect(() => {
        fetchConfig();
    }, []);

    // ADICIONADO: Supabase Realtime para a Escala
    useEffect(() => {
        const channel = supabase.channel('escala-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'escala_plantoes' },
                (payload) => {
                    setAssignments((prevAssignments) => {
                        const newAssignments = { ...prevAssignments };
                        
                        if (payload.eventType === 'DELETE') {
                            const oldRecord = payload.old;
                            if (oldRecord && oldRecord.assignment_id) {
                                delete newAssignments[oldRecord.assignment_id];
                            }
                        } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            const newRecord = payload.new;
                            if (newRecord && newRecord.assignment_id) {
                                newAssignments[newRecord.assignment_id] = {
                                    doctorName: newRecord.doctor_name,
                                    hospitalName: newRecord.hospital_name,
                                    sectorName: newRecord.sector_name,
                                    date: newRecord.date,
                                    financial: {
                                        baseValue: newRecord.financial_base,
                                        extraValue: newRecord.financial_extra,
                                        observations: newRecord.financial_obs,
                                        locked: newRecord.base_locked || false,
                                        extraItems: newRecord.extra_items || []
                                    },
                                    ruleId: newRecord.rule_id || undefined,
                                    outros: newRecord.folha_outros || false,
                                    subtitle: newRecord.subtitle,
                                    period: newRecord.period || undefined,
                                    time: newRecord.time || undefined,
                                    appearance: newRecord.appearance || { bold: false, color: 'default', flagged: false, verified: false }
                                };
                            }
                        }
                        
                        return newAssignments;
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchConfig = async () => {
        try {
            // Buscando médicos (Usuários da base)
            const { data: usersData, error: usersError } = await supabase
                .from('users')
                .select('id, name, email, role, status, categoria_medica, crm, rqe, cpf, telefone, sexo')
                .in('role', ['Médico', 'Médico Coordenador'])
                .eq('status', 'Ativo')
                .order('name', { ascending: true });
                
            if (!usersError && usersData) {
                // O antigo "Dr. Descoberto!!!" não é plantonista: vaga sem cobertura
                // agora é um estado do plantão, não um médico escalado.
                setDoctors(usersData.filter(u => !isPlaceholderDoctor(u.name)));
            }
            // Buscando configurações da escala (hospitais e regras)
            const { data: escData } = await supabase.from('settings').select('data').eq('id', 'escala').maybeSingle();
            if (escData?.data?.hospitais && escData.data.hospitais.length > 0) {
                setHospitais(escData.data.hospitais);
            } else {
                setHospitais([]);
            }
            if (escData?.data?.financialRules) {
                setFinancialRules(escData.data.financialRules);
            }
            if (escData?.data?.periodTimes) {
                setPeriodTimes(escData.data.periodTimes);
            }
            if (escData?.data?.sectorMeta) {
                setSectorMeta(escData.data.sectorMeta);
            }
            if (escData?.data?.months && escData.data.months.length > 0) {
                setExistingMonths(escData.data.months);
            }

            // BUSCAR PLANTÕES DA NOVA TABELA RELACIONAL (COM PAGINAÇÃO PARA BURLAR O LIMITE DE 1000 LINHAS DA API)
            let allPlantoes = [];
            let fromRange = 0;
            const step = 1000;
            let hasMore = true;
            
            while (hasMore) {
                const { data: pageData, error: pageError } = await supabase
                    .from('escala_plantoes')
                    .select('*')
                    .range(fromRange, fromRange + step - 1);
                    
                if (pageError || !pageData) {
                    console.error("Erro na paginação dos plantões:", pageError);
                    break;
                }
                
                allPlantoes = [...allPlantoes, ...pageData];
                
                if (pageData.length < step) {
                    hasMore = false;
                } else {
                    fromRange += step;
                }
            }

            if (allPlantoes.length > 0) {
                const loadedAssignments = {};
                allPlantoes.forEach(p => {
                    loadedAssignments[p.assignment_id] = asUncoveredIfPlaceholder({
                        doctorName: p.doctor_name,
                        hospitalName: p.hospital_name,
                        sectorName: p.sector_name,
                        date: p.date,
                        ruleId: p.rule_id || undefined,
                        outros: p.folha_outros || false,
                        financial: {
                            baseValue: p.financial_base,
                            extraValue: p.financial_extra,
                            observations: p.financial_obs,
                            locked: p.base_locked || false,
                            extraItems: p.extra_items || []
                        },
                        subtitle: p.subtitle,
                        period: p.period || undefined,
                        time: p.time || undefined,
                        // Carimbo do pagamento já feito (o dinheiro em si é um
                        // lançamento no financeiro; aqui fica só o que a folha
                        // e o médico precisam ler).
                        avista: p.paid_cash_at
                            ? { data: p.paid_cash_at, valor: Number(p.paid_cash_amount) || 0, transactionId: p.paid_cash_tx }
                            : null,
                        appearance: p.appearance || { bold: false, color: 'default', flagged: false, verified: false }
                    });
                });
                setAssignments(loadedAssignments);
                toast.success(`Escala carregada: ${allPlantoes.length} plantões sincronizados.`);
            }
        } catch (error) {
            console.error("Erro ao buscar configs:", error);
        }
    };

    const folhaPontoData = useMemo(() => {
        const hospMap = {};
        let totalDocs = new Set();
        let totalShifts = 0;
        
        currentMonthVerifiedAssignments.forEach(a => {
            // 'Padrão' é a data-placeholder herdada da Escala Fixa ao criar o mês;
            // tratamos como vazio para resolver a data real pelo slot (semana + dia).
            let displayDate = (a.date && a.date !== 'Padrão') ? a.date : '';
            let displayHospital = a.hospitalName || '';
            if (!displayDate || !displayHospital) {
                const parts = a.slotId.split('-');
                if (parts.length >= 6) {
                    if (!displayHospital) {
                        const h = hospitais.find(h => h.id.toString() === parts[3]);
                        if (h) displayHospital = h.name;
                    }
                    if (!displayDate) {
                        const w = activeWeeks.find(w => w.id === parts[2]);
                        if (w && w.days[parseInt(parts[5])] && w.days[parseInt(parts[5])].date !== 'Padrão') {
                            displayDate = w.days[parseInt(parts[5])].date;
                        }
                    }
                }
            }
            
            const hName = displayHospital || 'Desconhecido';
            if (!hospMap[hName]) {
                hospMap[hName] = { name: hName, totalVal: 0, avistaVal: 0, doctors: {} };
            }
            
            const val = getAssignmentTotal(a);
            // O que já foi pago continua somando no total da folha (o
            // médico fez o plantão), mas é acompanhado à parte: é ele que sai
            // do repasse do fim do mês.
            const avistaVal = Number(a.avista?.valor) || 0;
            hospMap[hName].totalVal += val;
            hospMap[hName].avistaVal = (hospMap[hName].avistaVal || 0) + avistaVal;
            
            const dName = a.doctorName || 'Desconhecido';
            if (!hospMap[hName].doctors[dName]) {
                hospMap[hName].doctors[dName] = { name: dName, totalVal: 0, avistaVal: 0, shifts: [] };
            }
            hospMap[hName].doctors[dName].totalVal += val;
            hospMap[hName].doctors[dName].avistaVal += avistaVal;
            hospMap[hName].doctors[dName].shifts.push({ ...a, displayDate, val });
            
            totalDocs.add(`${hName}-${dName}`);
            totalShifts++;
        });

        const hospArray = Object.values(hospMap).map(h => ({
            ...h,
            doctors: Object.values(h.doctors).sort((a,b) => a.name.localeCompare(b.name))
        })).sort((a,b) => a.name.localeCompare(b.name));
        
        return { hospArray, totalDocs: totalDocs.size, totalShifts };
    }, [currentMonthVerifiedAssignments, hospitais, activeWeeks]);

    // Plantões alocados no mês ativo que ainda NÃO foram marcados como Verificado.
    // Servem para alertar o gestor de que existem folhas pendentes de conferência.
    const folhaUnverifiedData = useMemo(() => {
        const list = Object.entries(assignments)
            .filter(([slotId, data]) => slotId.startsWith(activeMonth + '-') && isSlotInActiveMonth(slotId) && data.doctorName && !data.appearance?.verified)
            .map(([slotId, data]) => {
                // 'Padrão' é a data-placeholder herdada da Escala Fixa; resolve a data real pelo slot.
                let displayDate = (data.date && data.date !== 'Padrão') ? data.date : '';
                let displayHospital = data.hospitalName || '';
                const parts = slotId.split('-');
                if ((!displayDate || !displayHospital) && parts.length >= 6) {
                    if (!displayHospital) {
                        const h = hospitais.find(h => h.id.toString() === parts[3]);
                        if (h) displayHospital = h.name;
                    }
                    if (!displayDate) {
                        const w = activeWeeks.find(w => w.id === parts[2]);
                        if (w && w.days[parseInt(parts[5])] && w.days[parseInt(parts[5])].date !== 'Padrão') displayDate = w.days[parseInt(parts[5])].date;
                    }
                }
                return {
                    slotId,
                    doctorName: data.doctorName,
                    hospital: displayHospital || 'Desconhecido',
                    date: displayDate || '—',
                    time: data.time || '',
                    period: data.period || '',
                    sectorName: data.sectorName || ''
                };
            })
            .sort((a, b) => {
                const [da, ma] = (a.date === '—' ? '99/99' : a.date).split('/').map(Number);
                const [db, mb] = (b.date === '—' ? '99/99' : b.date).split('/').map(Number);
                return (ma - mb) || (da - db) || a.hospital.localeCompare(b.hospital);
            });
        const byHospital = {};
        list.forEach(item => { byHospital[item.hospital] = (byHospital[item.hospital] || 0) + 1; });
        return { list, count: list.length, byHospital };
    }, [assignments, activeMonth, hospitais, activeWeeks]);

    /*
     * Folha de ponto em PDF. O papel é montado por buildFolhaHtml (util); aqui
     * só se resolve o que depende desta tela: CRM do cadastro, logo do hospital
     * e a marca da Identidade Visual.
     */
    const folhaHtmlDe = (doctorName, hospitalName, shifts, withValue, signature = null) => buildFolhaHtml({
        doctorName,
        hospitalName,
        // CRM puxado do cadastro do médico (Usuários).
        crm: (doctors || []).find(d => (d.name || d.nome) === doctorName)?.crm || '',
        /*
         * Folha ASSINADA reimprime o que foi assinado, não a escala de hoje.
         *
         * Se o mês mudou depois da assinatura, imprimir a escala atual produziria
         * um documento diferente com o mesmo carimbo — que é a definição de
         * documento adulterado, mesmo sem ninguém ter agido de má-fé. O snapshot
         * é o original; a escala atual só entra quando ele não existe (folhas
         * assinadas antes desta versão) ou quando a folha ainda não foi assinada.
         */
        shifts: (signature?.status === 'assinado' && Array.isArray(signature.signed_snapshot?.shifts) && signature.signed_snapshot.shifts.length > 0)
            ? signature.signed_snapshot.shifts
            : shifts,
        withValue,
        signature,
        hospitalLogoUrl: (hospitais || []).find(h => h.name === hospitalName)?.logoUrl || '',
        brandLogoUrl: theme?.faviconUrl || theme?.logoUrl || '',
    });

    const printFolhaPdf = (doctorName, hospitalName, shifts, withValue, signature = null) => {
        printFolhaPages({
            title: `Folha de Ponto - ${doctorName}`,
            pagesHtml: folhaHtmlDe(doctorName, hospitalName, shifts, withValue, signature),
        });
    };

    const printHospitalFolhasPdf = (hospital, withValue) => {
        const pagesHtml = hospital.doctors
            .map(doc => folhaHtmlDe(doc.name, hospital.name, doc.shifts, withValue, findFolhaAssinatura(doc.name, hospital.name)))
            .join('');
        if (!pagesHtml) return;
        printFolhaPages({ title: `Folhas de Ponto - ${hospital.name}`, pagesHtml });
    };

    const printAllFolhasPdf = (withValue) => {
        const pagesHtml = folhaPontoData.hospArray
            .flatMap(hospital => hospital.doctors
                .map(doc => folhaHtmlDe(doc.name, hospital.name, doc.shifts, withValue, findFolhaAssinatura(doc.name, hospital.name))))
            .join('');
        if (!pagesHtml) return;
        printFolhaPages({ title: 'Todas Folhas de Ponto', pagesHtml });
    };

    // Auto-scroll para a semana atual
    useEffect(() => {
        if (visualizationMode !== 'mensal' || !activeWeeks || activeWeeks.length === 0) return;
        
        const today = new Date();
        const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const timer = setTimeout(() => {
            const currentWeek = activeWeeks.find(w => w.days.some(d => d.date === todayStr));
            if (currentWeek) {
                const element = document.getElementById(`week-${currentWeek.id}`);
                if (element) {
                    // Compensa o header do site (ajustado para ~100px)
                    const yOffset = -20; 
                    const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
                    element.parentNode.scrollTo({ top: element.offsetTop - 20, behavior: 'smooth' });
                }
            }
        }, 300); // 300ms garante que as semanas já foram desenhadas no DOM
        return () => clearTimeout(timer);
    }, [activeWeeks, visualizationMode]);

    // Funções do Modal de Regras Financeiras
    const saveFinancialRulesToDB = async (updatedRules) => {
        try {
            const { data: existingData } = await supabase.from('settings').select('data').eq('id', 'escala').maybeSingle();
            const currentData = existingData?.data || {};
            
            const { error } = await supabase.from('settings').upsert({
                id: 'escala',
                data: { ...currentData, financialRules: updatedRules }
            });
            if (error) throw error;
            logAction('escala_regras_financeiras_atualizadas', `Regras financeiras da escala foram atualizadas.`);
        } catch (error) {
            console.error("Erro ao salvar regras financeiras:", error);
            toast.error("Falha ao salvar as regras financeiras! Verifique sua conexão e permissões.");
        }
    };

    const handleDeleteFinancialRule = (id) => {
        const updatedRules = financialRules.filter(r => r.id !== id);
        setFinancialRules(updatedRules);
        saveFinancialRulesToDB(updatedRules);
    };

    const handleEditRule = (rule) => {
        setEditingRuleId(rule.id);
        setTempRule({ ...rule });
    };

    const handleSaveEditRule = () => {
        if (!tempRule || !tempRule.name || !tempRule.value) return;
        const updatedRules = financialRules.map(r => r.id === tempRule.id ? tempRule : r);
        setFinancialRules(updatedRules);
        saveFinancialRulesToDB(updatedRules);
        setEditingRuleId(null);
        setTempRule(null);
    };

    const handleCancelEditRule = () => {
        setEditingRuleId(null);
        setTempRule(null);
    };

    // ── Fase 3 — catálogo Unidade → Turno → Opções de pagamento ────────────────
    // Turno = linha da grade (setor do hospital). Opções de pagamento são POR TURNO.
    const PERIODOS_PADRAO = ['Diurno', 'Noturno', 'Manhã', 'Tarde'];

    // Metadados de um turno (período + horário). Fallback: deriva do nome; horário
    // cai no legado periodTimes e depois no default do período.
    const getTurnoMeta = (hospitalName, sectorName) => {
        const meta = sectorMeta?.[hospitalName || 'geral']?.[sectorName] || {};
        const period = meta.period || getNormalizedPeriod(sectorName);
        const time = meta.time
            || periodTimes?.[hospitalName || 'geral']?.[period]
            || getDefaultTimeForPeriod(period);
        return { period, time };
    };

    // Turnos de um escopo. Geral = os 4 períodos (turno == período). Hospital = seus setores.
    const getTurnosForScope = (hospitalName) => {
        if (!hospitalName) return PERIODOS_PADRAO.map(p => ({ name: p, period: p }));
        const h = hospitais.find(x => x.name === hospitalName);
        return (h?.sectors || []).map(s => ({ name: s, period: getTurnoMeta(hospitalName, s).period }));
    };

    // Horário configurado de um turno.
    const getConfiguredTime = (hospitalName, sectorName) => getTurnoMeta(hospitalName, sectorName).time;

    // Regras que se aplicam a um turno.
    //   own      = regras do próprio hospital nesse turno (por setor; ou legado sem setor, casando período)
    //   inherited= regras Gerais (sem hospital) do mesmo período
    const getRulesForTurno = (hospitalName, sectorName, period) => {
        const norm = getNormalizedPeriod(period);
        const rules = financialRules || [];
        if (!hospitalName) {
            return { own: rules.filter(r => !r.hospital && getRulePeriod(r) === norm), inherited: [] };
        }
        const own = rules.filter(r => r.hospital === hospitalName
            && ((r.sector || '') === sectorName || (!r.sector && getRulePeriod(r) === norm)));
        const inherited = rules.filter(r => !r.hospital && getRulePeriod(r) === norm);
        return { own, inherited };
    };

    // Persistência de sectorMeta (metadados de turno). saveEscalaUpdate é definido abaixo.
    const handleSetTurnoMeta = (hospitalName, sectorName, patch) => {
        const key = hospitalName || 'geral';
        const cur = sectorMeta?.[key]?.[sectorName] || {};
        const updated = { ...sectorMeta, [key]: { ...(sectorMeta[key] || {}), [sectorName]: { ...cur, ...patch } } };
        setSectorMeta(updated);
        saveEscalaUpdate({ sectorMeta: updated });
    };
    const handleSetTurnoTime = (hospitalName, sectorName, time) => handleSetTurnoMeta(hospitalName, sectorName, { time });
    const handleSetTurnoPeriod = (hospitalName, sectorName, period) => handleSetTurnoMeta(hospitalName, sectorName, { period: getNormalizedPeriod(period) });

    // Adiciona um turno (setor) a um hospital + grava período/horário nos metadados.
    const handleAddTurno = async (hospitalName) => {
        const name = (turnoDraft.name || '').trim();
        if (!name || !hospitalName) return;
        const h = hospitais.find(x => x.name === hospitalName);
        if (!h) return;
        if ((h.sectors || []).includes(name)) { toast.error('Já existe um turno com esse nome nesta unidade.'); return; }
        const updated = hospitais.map(x => x.id === h.id ? { ...x, sectors: [...(x.sectors || []), name] } : x);
        // Aguarda o save dos hospitais antes de gravar o sectorMeta: os dois fazem
        // read-modify-write do mesmo settings.escala e, em paralelo, um clobbera o outro.
        await saveHospitaisToDB(updated);
        handleSetTurnoMeta(hospitalName, name, { period: getNormalizedPeriod(turnoDraft.period), time: getDefaultTimeForPeriod(turnoDraft.period) });
        setTurnoDraft({ name: '', period: 'Diurno' });
        setAddingTurno(null);
    };

    // Remove um turno da unidade (não apaga plantões já gravados; só some da grade).
    const handleRemoveTurno = async (hospitalName, sectorName) => {
        const h = hospitais.find(x => x.name === hospitalName);
        if (!h) return;
        if (!window.confirm(`Remover o turno "${sectorName}" de ${hospitalName}? As opções de pagamento dele também serão apagadas.`)) return;
        const updated = hospitais.map(x => x.id === h.id ? { ...x, sectors: (x.sectors || []).filter(s => s !== sectorName) } : x);
        // Sequencial de propósito: são três read-modify-write no mesmo settings.escala.
        await saveHospitaisToDB(updated);
        const remainingRules = (financialRules || []).filter(r => !(r.hospital === hospitalName && (r.sector || '') === sectorName));
        if (remainingRules.length !== (financialRules || []).length) { setFinancialRules(remainingRules); await saveFinancialRulesToDB(remainingRules); }
        const key = hospitalName || 'geral';
        if (sectorMeta?.[key]?.[sectorName]) {
            const copy = { ...sectorMeta, [key]: { ...(sectorMeta[key] || {}) } };
            delete copy[key][sectorName];
            setSectorMeta(copy);
            saveEscalaUpdate({ sectorMeta: copy });
        }
    };

    const handleAddRuleOption = (hospitalName, sectorName, period) => {
        if (!ruleDraft.name || !ruleDraft.value) return;
        const newRuleItem = {
            id: Date.now().toString(),
            name: ruleDraft.name,
            hospital: hospitalName || '',
            sector: hospitalName ? (sectorName || '') : '',
            value: ruleDraft.value,
            period: getNormalizedPeriod(period),
            category: ruleDraft.category || 'Padrão'
        };
        const updatedRules = [...financialRules, newRuleItem];
        setFinancialRules(updatedRules);
        saveFinancialRulesToDB(updatedRules);
        setRuleDraft({ name: '', value: '', category: 'Padrão' });
        setAddingPeriod(null);
    };

    // Funções do Modal de Hospitais
    const saveHospitaisToDB = async (updatedHospitais) => {
        try {
            const { data: existingData } = await supabase.from('settings').select('data').eq('id', 'escala').maybeSingle();
            const currentData = existingData?.data || {};
            
            const { error } = await supabase.from('settings').upsert({
                id: 'escala',
                data: {
                    ...currentData,
                    hospitais: updatedHospitais
                }
            });
            if (error) throw error;
            setHospitais(updatedHospitais);
            logAction('escala_hospitais_atualizados', `Configuração de hospitais da escala foi atualizada.`);
        } catch (error) {
            console.error("Erro ao salvar hospitais:", error);
            toast.error("Falha ao salvar os hospitais! Verifique sua conexão e permissões.");
        }
    };

    // ── Duplicidade de plantão ────────────────────────────────────────────────
    // Um anestesista não pode ocupar dois plantões que se sobrepõem no tempo —
    // nem em hospitais diferentes, nem em duas linhas do mesmo hospital. A conta
    // é feita por INTERVALO (utils/escalaConflitos), não por período igual: por
    // isso Manhã e Tarde colidem com o Diurno, e o Noturno cruza a meia-noite sem
    // acusar falso positivo com o Diurno do dia seguinte.

    // O plantão que está sendo montado no modal, no formato do detector.
    const draftCandidate = useMemo(() => ({
        slotId: activeSlot?.id,
        doctorName: draftAssignment.doctorName,
        hospitalName: activeSlot?.hospitalName,
        sectorName: activeSlot?.sectorName,
        date: activeSlot?.date,
        period: draftAssignment.period,
        time: draftAssignment.time
    }), [activeSlot, draftAssignment.doctorName, draftAssignment.period, draftAssignment.time]);

    // Aviso ao vivo dentro do modal: aparece assim que o médico é escolhido e
    // acompanha mudanças de período/horário, antes mesmo de tentar salvar.
    const draftConflicts = useMemo(() => {
        if (!activeSlot || !draftAssignment.doctorName) return [];
        const pool = { ...assignments };
        delete pool[activeSlot.id];
        return findScheduleConflicts(pool, draftCandidate);
    }, [activeSlot, assignments, draftAssignment.doctorName, draftCandidate]);

    // Relê do banco os plantões deste médico. O estado local já carrega todos os
    // meses, mas outra pessoa pode ter escalado agora, em outra sessão — sem isso
    // duas telas abertas conseguiriam criar a mesma duplicidade ao mesmo tempo.
    const fetchDoctorShiftsFromDB = async (doctorName) => {
        try {
            const { data, error } = await supabase
                .from('escala_plantoes')
                .select('assignment_id, doctor_name, hospital_name, sector_name, date, period, time')
                .eq('doctor_name', doctorName);
            if (error || !data) return [];
            return data.map(r => ({
                slotId: r.assignment_id,
                doctorName: r.doctor_name,
                hospitalName: r.hospital_name,
                sectorName: r.sector_name,
                date: r.date,
                period: r.period || undefined,
                time: r.time || undefined
            }));
        } catch (e) {
            // Falha de rede não pode travar o salvamento: a validação local já rodou.
            console.error('Falha ao reconferir conflitos no banco:', e);
            return [];
        }
    };

    /**
     * Grava o plantão que está aberto no modal.
     *
     * Extraído do onClick do botão "Salvar Plantão" para poder ser chamado por
     * dois caminhos: o salvamento normal e o "escalar mesmo assim" do pop-up de
     * duplicidade — que passa `conflictOverride` com quem autorizou e por quê.
     */
    const persistAssignment = (conflictOverride = null) => {
        // Com o pagamento dado, o plantão não muda — nem valor, nem
        // horário, nem médico. O readOnly do modal já barra na tela; esta é a
        // trava de dentro, para nenhum caminho novo passar por cima dela.
        if (activeSlot && assignments[activeSlot.id]?.avista) {
            toast.error('Este plantão já foi pago. Desfaça o pagamento para poder alterá-lo.', { duration: 6000 });
            return;
        }
        // Mesma razão: alterar valor ou horário de um plantão já assinado faz o
        // documento assinado deixar de corresponder ao que existe.
        if (activeSlot && assinaturaPorSlot[activeSlot.id]) {
            toast.error(`Este plantão faz parte de uma folha já ASSINADA. Cancele a assinatura na Folha de Ponto para poder alterá-lo.`, { duration: 8000 });
            return;
        }

        const vagaDescoberta = !!draftAssignment.appearance?.uncovered;
        if (!activeSlot || activeSlot.readOnly) return;
        if (!draftAssignment.doctorName && !vagaDescoberta) return;
        let finalSlotId = activeSlot.id;
        let finalSectorName = activeSlot.sectorName;

        // Lógica para mover de linha (setor) se o período mudar
        const isFixed = activeSlot.id.startsWith('FIXED-');
        const parts = activeSlot.id.split('-');
        const hId = isFixed ? parts[2] : parts[3];
        const oldSIdxStr = isFixed ? parts[3] : parts[4];

        const hospital = hospitais.find(h => h.id.toString() === hId);

        if (hospital) {
            const targetNorm = getNormalizedPeriod(draftAssignment.period);
            const oldSIdx = parseInt(oldSIdxStr);
            const currentSectorName = hospital.sectors[oldSIdx];
            if (getNormalizedPeriod(getTurnoMeta(hospital.name, currentSectorName).period) !== targetNorm) {
                const buildSlotId = (sIdx) => {
                    const p = [...parts];
                    p[isFixed ? 3 : 4] = sIdx.toString();
                    return p.join('-');
                };
                const isFree = (sIdx) => !assignments[buildSlotId(sIdx)]?.doctorName;
                // Só move para uma linha LIVRE do período de destino; senão tenta uma
                // linha "Extra" livre; senão fica onde está — nunca sobrescreve outro plantão.
                const rows = hospital.sectors.map((s, i) => ({ s, i })).filter(({ i }) => i !== oldSIdx);
                const samePeriod = rows.filter(({ s }) => getNormalizedPeriod(getTurnoMeta(hospital.name, s).period) === targetNorm);
                const extras = rows.filter(({ s }) => s.toLowerCase().includes('extra'));
                const target = samePeriod.find(({ i }) => isFree(i)) || extras.find(({ i }) => isFree(i));
                if (target) {
                    finalSlotId = buildSlotId(target.i);
                    finalSectorName = hospital.sectors[target.i];
                    toast.success(`Plantão movido para a linha "${finalSectorName}".`);
                } else if (samePeriod.length > 0 || extras.length > 0) {
                    const busy = samePeriod[0] || extras[0];
                    const busyDoctor = assignments[buildSlotId(busy.i)]?.doctorName;
                    toast.error(`A linha "${busy.s}" já tem ${busyDoctor ? formatDoctorName(busyDoctor) : 'outro médico'}. O plantão ficou na linha "${currentSectorName}" para não sobrescrever ninguém.`);
                }
            }
        }

        const finalAssignment = {
            ...draftAssignment,
            hospitalName: activeSlot.hospitalName,
            sectorName: finalSectorName,
            date: activeSlot.date,
            // Exceção de duplicidade autorizada fica registrada no próprio plantão
            // (appearance é JSONB livre, não precisa de coluna nova).
            appearance: conflictOverride
                ? { ...(draftAssignment.appearance || {}), conflictOverride }
                : draftAssignment.appearance
        };

        const updatedAssignments = { ...assignments };
        if (finalSlotId !== activeSlot.id) {
            delete updatedAssignments[activeSlot.id];
            // Remove o plantão antigo do banco (já que ele mudou de primary key)
            supabase.from('escala_plantoes').delete().eq('assignment_id', activeSlot.id).then();
        }
        updatedAssignments[finalSlotId] = finalAssignment;

        setAssignments(updatedAssignments);
        saveSingleAssignmentToDB(finalSlotId, finalAssignment);
        const details = [];
        if (draftAssignment.subtitle) details.push(`Legenda: "${draftAssignment.subtitle}"`);
        if (draftAssignment.appearance?.bold) details.push('Negrito');
        if (draftAssignment.appearance?.color === 'red') details.push('Cor Vermelha');
        if (draftAssignment.appearance?.verified) details.push('Verificado');
        if (draftAssignment.appearance?.flagged) details.push('Sinalizado');

        // O log precisa dizer QUAL DIA da escala mudou (com ano) e QUEM saiu/entrou:
        // sem isso, auditar "quem tirou o fulano do dia 05/09" vira garimpo.
        const dataDoPlantao = dataCompletaDoPlantao(finalSlotId, activeSlot.date);
        const medicoAnterior = assignments[activeSlot.id]?.doctorName;
        let quemAssumiu = vagaDescoberta ? 'VAGA DESCOBERTA (sem plantonista)' : `Médico: ${draftAssignment.doctorName}`;
        if (medicoAnterior && medicoAnterior !== draftAssignment.doctorName) {
            quemAssumiu += ` (antes: ${medicoAnterior})`;
        }
        // Usa a linha final: quando o plantão muda de período ele troca de linha,
        // e o log tem que apontar onde ele ficou de verdade.
        let logSaveMsg = `Plantão ${finalSectorName} (${dataDoPlantao}) no ${activeSlot.hospitalName} salvo - ${quemAssumiu}`;
        if (details.length > 0) {
            logSaveMsg += ` | Detalhes: ${details.join(', ')}`;
        }
        if (conflictOverride) {
            logSaveMsg += ` | ATENÇÃO: salvo com CONFLITO DE HORÁRIO autorizado por ${conflictOverride.by} — motivo: "${conflictOverride.reason}" (choca com: ${conflictOverride.conflitos})`;
        }
        logAction(conflictOverride ? 'escala_plantao_conflito_forcado' : 'escala_plantao_salvo', logSaveMsg);
        setActiveSlot(null);
    };

    const saveSingleAssignmentToDB = async (slotId, assignment) => {
        try {
            const monthStr = slotId.startsWith('FIXED-') ? 'FIXED' : slotId.substring(0, 7);
            const row = {
                assignment_id: slotId,
                month_val: monthStr,
                doctor_name: assignment.doctorName || '',
                hospital_name: assignment.hospitalName || '',
                sector_name: assignment.sectorName || '',
                date: assignment.date || '',
                financial_base: assignment.financial?.baseValue ? parseFloat(assignment.financial.baseValue) : 0,
                financial_extra: assignment.financial?.extraValue ? parseFloat(assignment.financial.extraValue) : 0,
                financial_obs: assignment.financial?.observations || '',
                rule_id: assignment.ruleId || null,
                folha_outros: !!assignment.outros,
                base_locked: assignment.financial?.locked || false,
                // Guarda só linhas com algum conteúdo (descrição ou valor)
                extra_items: (assignment.financial?.extraItems || []).filter(it =>
                    (it.descricao || '').trim() !== '' || (parseFloat(it.receber) || 0) > 0 || calcRepasseItem(it) > 0
                ),
                subtitle: assignment.subtitle || '',
                period: assignment.period || null,
                time: assignment.time || null,
                appearance: assignment.appearance || {}
            };
            const { error } = await supabase.from('escala_plantoes').upsert(row);
            if (error) throw error;
        } catch (error) {
            console.error("Erro ao salvar plantão:", error);
            toast.error("Falha ao salvar o plantão! Verifique sua conexão e se possui permissão (adm_escala).");
        }
    };

    const saveEscalaUpdate = async (updates) => {
        try {
            const { data: existingData } = await supabase.from('settings').select('data').eq('id', 'escala').maybeSingle();
            const currentData = existingData?.data || {};
            
            const { error } = await supabase.from('settings').upsert({
                id: 'escala',
                data: {
                    ...currentData,
                    ...updates
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error("Erro ao salvar atualizações da escala:", error);
            toast.error("Falha ao atualizar a escala! Verifique permissões.");
        }
    };

    const handleEditHospital = (hospital) => {
        setEditingHospitalId(hospital.id);
        setTempHospital({ ...hospital, sectors: [...hospital.sectors] });
    };

    const handleSaveTempHospital = async () => {
        if (!tempHospital || !tempHospital.name.trim()) return;
        
        let updated;
        if (hospitais.some(h => h.id === tempHospital.id)) {
            updated = hospitais.map(h => h.id === tempHospital.id ? tempHospital : h);
        } else {
            updated = [...hospitais, tempHospital];
        }
        
        await saveHospitaisToDB(updated);
        setEditingHospitalId(null);
        setTempHospital(null);
    };

    const handleHospitalLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop() || 'png';
            const fileName = `hospital-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, file);
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
            setTempHospital({ ...tempHospital, logoUrl: publicUrlData.publicUrl });
            toast.success("Logo enviada com sucesso!");
        } catch (error) {
            console.error(error);
            toast.error("Erro no upload da logo.");
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleAddHospital = () => {
        const newHospital = {
            id: Date.now(),
            name: '',
            color: 'indigo',
            logoUrl: '',
            sectors: ['Geral']
        };
        handleEditHospital(newHospital);
    };

    const handleDeleteHospital = (id, e) => {
        e.stopPropagation();
        if (window.confirm('Certeza que deseja apagar este hospital? Plantões vinculados a ele podem sumir da visualização.')) {
            const updated = hospitais.filter(h => h.id !== id);
            saveHospitaisToDB(updated);
        }
    };

    const handleMoveHospital = (index, direction, e) => {
        e.stopPropagation();
        const newHospitais = [...hospitais];
        if (direction === 'up' && index > 0) {
            const temp = newHospitais[index];
            newHospitais[index] = newHospitais[index - 1];
            newHospitais[index - 1] = temp;
        } else if (direction === 'down' && index < newHospitais.length - 1) {
            const temp = newHospitais[index];
            newHospitais[index] = newHospitais[index + 1];
            newHospitais[index + 1] = temp;
        } else {
            return;
        }
        saveHospitaisToDB(newHospitais);
    };

    const handleAddSectorToTemp = () => {
        setTempHospital({ ...tempHospital, sectors: [...tempHospital.sectors, 'Novo Setor'] });
    };

    const handleRemoveSectorFromTemp = (index) => {
        const newSectors = [...tempHospital.sectors];
        newSectors.splice(index, 1);
        setTempHospital({ ...tempHospital, sectors: newSectors });
    };

    const handleUpdateSectorInTemp = (index, val) => {
        const newSectors = [...tempHospital.sectors];
        newSectors[index] = val;
        setTempHospital({ ...tempHospital, sectors: newSectors });
    };

    const handleMoveSectorTemp = (index, direction) => {
        const newSectors = [...tempHospital.sectors];
        if (direction === 'up' && index > 0) {
            [newSectors[index - 1], newSectors[index]] = [newSectors[index], newSectors[index - 1]];
        } else if (direction === 'down' && index < newSectors.length - 1) {
            [newSectors[index + 1], newSectors[index]] = [newSectors[index], newSectors[index + 1]];
        }
        setTempHospital({ ...tempHospital, sectors: newSectors });
    };

    const handleCancelEditHospital = () => {
        setEditingHospitalId(null);
        setTempHospital(null);
    };

    const hospitalColors = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];

    const getHospitalColorBgClass = (c) => {
        const map = {
            slate: 'bg-slate-500',
            gray: 'bg-gray-500',
            zinc: 'bg-zinc-500',
            neutral: 'bg-neutral-500',
            stone: 'bg-stone-500',
            red: 'bg-red-500',
            orange: 'bg-orange-500',
            amber: 'bg-amber-500',
            yellow: 'bg-yellow-500',
            lime: 'bg-lime-500',
            green: 'bg-green-500',
            emerald: 'bg-emerald-500',
            teal: 'bg-teal-500',
            cyan: 'bg-cyan-500',
            sky: 'bg-sky-500',
            blue: 'bg-blue-500',
            indigo: 'bg-indigo-500',
            violet: 'bg-violet-500',
            purple: 'bg-purple-500',
            fuchsia: 'bg-fuchsia-500',
            pink: 'bg-pink-500',
            rose: 'bg-rose-500',
        };
        return map[c] || map.slate;
    };

    const getHospitalColorRingClass = (c) => {
        const map = {
            slate: 'ring-slate-500/30',
            gray: 'ring-gray-500/30',
            zinc: 'ring-zinc-500/30',
            neutral: 'ring-neutral-500/30',
            stone: 'ring-stone-500/30',
            red: 'ring-red-500/30',
            orange: 'ring-orange-500/30',
            amber: 'ring-amber-500/30',
            yellow: 'ring-yellow-500/30',
            lime: 'ring-lime-500/30',
            green: 'ring-green-500/30',
            emerald: 'ring-emerald-500/30',
            teal: 'ring-teal-500/30',
            cyan: 'ring-cyan-500/30',
            sky: 'ring-sky-500/30',
            blue: 'ring-blue-500/30',
            indigo: 'ring-indigo-500/30',
            violet: 'ring-violet-500/30',
            purple: 'ring-purple-500/30',
            fuchsia: 'ring-fuchsia-500/30',
            pink: 'ring-pink-500/30',
            rose: 'ring-rose-500/30',
        };
        return map[c] || map.slate;
    };

    const handleRemoveAssignment = (slotId, hospital, sector, day, e) => {
        if (e) e.stopPropagation();
        // Plantão verificado só pode ser removido por quem tem a permissão.
        if (assignments[slotId]?.appearance?.verified && !canEditVerified) {
            toast.error('Plantão verificado — você não tem permissão para removê-lo.');
            return;
        }
        // Plantão já pago tem dinheiro amarrado a ele no financeiro.
        // Apagar a linha deixaria o lançamento órfão e o pagamento invisível.
        if (assignments[slotId]?.avista) {
            toast.error('Este plantão já foi pago. Desfaça o pagamento antes de removê-lo.', { duration: 6000 });
            return;
        }
        // Plantão que já está numa folha assinada não sai da escala: a folha
        // vira um documento assinado sem conteúdo.
        if (assinaturaPorSlot[slotId]) {
            toast.error(`Este plantão faz parte da folha de ${formatDoctorName(assinaturaPorSlot[slotId].doctor_name)} já ASSINADA. Cancele a assinatura na Folha de Ponto antes de removê-lo.`, { duration: 8000 });
            return;
        }
        const newAssignments = { ...assignments };
        const removed = newAssignments[slotId];
        delete newAssignments[slotId];
        setAssignments(newAssignments);
        supabase.from('escala_plantoes').delete().eq('assignment_id', slotId).then();
        const quemSaiu = removed?.appearance?.uncovered
            ? 'VAGA DESCOBERTA (sem plantonista)'
            : `Médico: ${removed?.doctorName || ''}`;
        const logMsg = `Plantão ${sector} (${dataCompletaDoPlantao(slotId, day.date)}) no ${hospital.name} removido - ${quemSaiu}`;
        logAction('escala_plantao_removido', logMsg);
    };

    const handleCopyFixedWeekToOthers = (sourceWeekIndex) => {
        const newAssignments = { ...assignments };
        let count = 0;
        const skipped = [];
        const rowsToUpsert = [];
        
        const sourceWeek = activeWeeks[sourceWeekIndex];

        activeWeeks.forEach((targetWeek, targetWeekIndex) => {
            if (targetWeekIndex === sourceWeekIndex) return;

            for (let dIdx = 0; dIdx < 7; dIdx++) {
                hospitais.forEach(hospital => {
                    hospital.sectors.forEach((sector, sIdx) => {
                        const sourceKey = `FIXED-${sourceWeek.id}-${hospital.id}-${sIdx}-${dIdx}`;
                        const targetKey = `FIXED-${targetWeek.id}-${hospital.id}-${sIdx}-${dIdx}`;

                        if (assignments[sourceKey] && !assignments[targetKey]) {
                            const newAssig = { ...assignments[sourceKey] };

                            // A cópia em lote não pode furar a regra de duplicidade: se o
                            // médico já estiver ocupado nesse horário (em qualquer hospital),
                            // a linha é PULADA em vez de criar o plantão duplicado. Confere
                            // contra newAssignments para pegar também o que acabou de ser copiado.
                            const conflitos = findScheduleConflicts(newAssignments, {
                                slotId: targetKey,
                                doctorName: newAssig.doctorName,
                                hospitalName: newAssig.hospitalName,
                                sectorName: newAssig.sectorName || sector,
                                date: newAssig.date,
                                period: newAssig.period,
                                time: newAssig.time
                            });
                            if (conflitos.length > 0) {
                                skipped.push(`${formatDoctorName(newAssig.doctorName)} — ${hospital.name} x ${conflitos[0].hospitalName}`);
                                return;
                            }

                            newAssignments[targetKey] = newAssig;
                            count++;
                            
                            rowsToUpsert.push({
                                assignment_id: targetKey,
                                month_val: 'FIXED',
                                doctor_name: newAssig.doctorName || '',
                                hospital_name: newAssig.hospitalName || '',
                                sector_name: newAssig.sectorName || '',
                                date: newAssig.date || '',
                                financial_base: newAssig.financial?.baseValue ? parseFloat(newAssig.financial.baseValue) : 0,
                                financial_extra: newAssig.financial?.extraValue ? parseFloat(newAssig.financial.extraValue) : 0,
                                financial_obs: newAssig.financial?.observations || '',
                                rule_id: newAssig.ruleId || null,
                                base_locked: newAssig.financial?.locked || false,
                                subtitle: newAssig.subtitle || '',
                                appearance: newAssig.appearance || {}
                            });
                        }
                    });
                });
            }
        });

        if (count > 0) {
            setAssignments(newAssignments);
            supabase.from('escala_plantoes').upsert(rowsToUpsert).then();
            toast.success(`${count} plantões foram copiados para as outras semanas com sucesso!`);
            logAction('ESCALA', `Copiou a Semana ${sourceWeekIndex + 1} da Escala Fixa para as outras semanas (Todos os hospitais) - ${count} plantões copiados.${skipped.length > 0 ? ` ${skipped.length} pulados por conflito de horário: ${skipped.join(' | ')}` : ''}`);
        } else if (skipped.length === 0) {
            toast.error("Nenhum plantão novo para copiar (as outras semanas já possuem estes plantões ou esta semana está vazia).");
        }

        if (skipped.length > 0) {
            toast.error(`${skipped.length} plantão(ões) não foram copiados: o médico já estava escalado no mesmo horário em outro lugar.`, { duration: 7000 });
        }
    };


    const sortedMonthsForNav = [...existingMonths].sort((a, b) => a.id.localeCompare(b.id));
    const currentMonthIndex = sortedMonthsForNav.findIndex(m => m.id === activeMonth);
    const hasPrevMonth = currentMonthIndex > 0;
    const hasNextMonth = currentMonthIndex >= 0 && currentMonthIndex < sortedMonthsForNav.length - 1;

    // Filtros da barra da Escala (hospital / médico) — controlam o botão "Limpar".
    // Para quem não pode ver a escala toda, viewMode fica travado em 'my_scale':
    // isso não conta como filtro, senão o botão apareceria sem ter o que limpar.
    const hasEscalaFilter = selectedHospital !== null || pendingOnly || (canViewAll && viewMode === 'my_scale');
    const clearEscalaFilters = () => {
        setSelectedHospital(null);
        setPendingOnly(false);
        if (canViewAll) setViewMode('all');
    };

    // Valores da Folha de Ponto sensíveis ao filtro de hospital ativo no modal
    const isFolhaFiltered = folhaPontoFilter !== 'all';
    const folhaVisibleHospitals = folhaPontoData.hospArray.filter(h => folhaPontoFilter === 'all' || h.name === folhaPontoFilter);
    const folhaVisibleValue = folhaVisibleHospitals.reduce((s, h) => s + h.totalVal, 0);
    const folhaVisibleShifts = folhaVisibleHospitals.reduce((s, h) => s + h.doctors.reduce((ds, d) => ds + d.shifts.length, 0), 0);
    const folhaVisibleDocs = folhaVisibleHospitals.reduce((s, h) => s + h.doctors.length, 0);
    // Status de assinatura das folhas visíveis (respeita o filtro de hospital).
    /*
     * O que o lote pode tocar num conjunto de hospitais.
     *
     *   naoEnviadas → nunca saíram daqui;
     *   enviaveis   → tudo que não está assinado (as não enviadas mais as que
     *                 estão com o médico e podem ter mudado desde o envio).
     *
     * O botão aparece por `enviaveis` e não por `naoEnviadas` porque o mês
     * fechado costuma estar todo enviado — em agosto são 27 pendentes e nenhuma
     * não enviada, e um botão que some justo aí não serve para nada. O número no
     * rótulo continua sendo o das não enviadas (o que ele promete com certeza);
     * o resumo antes de confirmar conta o resto.
     */
    const contarNaoEnviadas = (hospitais) => hospitais.reduce((total, h) =>
        total + h.doctors.filter(doc => !findFolhaAssinatura(doc.name, h.name)).length, 0);

    const contarEnviaveis = (hospitais) => hospitais.reduce((total, h) =>
        total + h.doctors.filter(doc => findFolhaAssinatura(doc.name, h.name)?.status !== 'assinado').length, 0);

    const folhaSignatureStats = (() => {
        let assinadas = 0, pendentes = 0, total = 0;
        folhaVisibleHospitals.forEach(h => {
            h.doctors.forEach(doc => {
                total++;
                const rec = findFolhaAssinatura(doc.name, h.name);
                if (rec?.status === 'assinado') assinadas++;
                else if (rec?.status === 'pendente') pendentes++;
            });
        });
        return { assinadas, pendentes, naoEnviadas: total - assinadas - pendentes };
    })();

    return (
        <div className="flex flex-col h-full bg-transparent p-3 md:p-5 overflow-hidden font-sans relative">
            <div className="flex flex-col mb-2 md:mb-4 shrink-0 gap-2 md:gap-4 relative z-[50]">
                {/* Tier 1: Title & Month Nav */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3">
                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-normal leading-none mb-0.5 md:mb-1">Escala Médica</h1>
                        <p className="text-xs font-medium text-slate-500 hidden md:block">Gestão e alocação de plantões nas unidades.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {visualizationMode === 'mensal' ? (
                            <>
                                <button 
                                    onClick={goToCurrentMonth}
                                    className="flex items-center px-3 py-1.5 bg-white/60 hover:bg-white/60 text-slate-700 text-xs font-bold rounded-lg shadow-sm border border-white/60 transition-all focus:outline-none"
                                >
                                    Hoje
                                </button>
                                <div className="flex items-center bg-white/60 rounded-lg shadow-sm border border-white/60 p-0.5 animate-in fade-in zoom-in-95 duration-200">
                                <button 
                                    onClick={() => handleNavigateMonth('prev')} 
                                    disabled={!hasPrevMonth}
                                    className="p-1.5 text-slate-500 hover:text-slate-900 drop-shadow-none hover:bg-white/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-md transition-colors"
                                >
                                    <ChevronLeft size={14} strokeWidth={2.5} />
                                </button>
                                <div className="px-3 py-1 flex items-center gap-1.5">
                                    <CalendarIcon size={14} className="text-indigo-600" />
                                    <span className="text-xs font-bold text-slate-900 drop-shadow-none tracking-normal capitalize">
                                        {existingMonths.find(m => m.id === activeMonth)?.label || 'Sem mês ativo'}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => handleNavigateMonth('next')} 
                                    disabled={!hasNextMonth}
                                    className="p-1.5 text-slate-500 hover:text-slate-900 drop-shadow-none hover:bg-white/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-md transition-colors"
                                >
                                    <ChevronRight size={14} strokeWidth={2.5} />
                                </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setVisualizationMode('mensal')} 
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 hover:bg-white/60 text-slate-700 text-xs font-bold rounded-lg shadow-sm border border-white/60 transition-all focus:outline-none"
                                >
                                    <ChevronLeft size={14} /> Voltar
                                </button>
                                <button 
                                    onClick={() => setIsMonthModalOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all animate-in fade-in slide-in-from-right-4 duration-300"
                                >
                                    <Copy size={14} />
                                    Criar Mês com a Escala Fixa
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tier 2: Action Toolbar (fixa junto ao Tier 1 — não some ao rolar a página) */}
                <div className="flex flex-col lg:flex-row lg:items-stretch justify-between bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl p-1.5 shadow-sm backdrop-blur-md gap-2 lg:gap-2 relative">
                    {/* Left Side: View Filters */}
                    <div className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar">
                        <div className="flex flex-col justify-center gap-0.5 bg-white/70 rounded-lg p-0.5 shrink-0">
                            {canViewAll && (
                                <button onClick={() => setViewMode('all')} className={`px-2.5 py-0.5 text-[10px] leading-tight font-bold rounded-md transition-colors whitespace-nowrap ${viewMode === 'all' ? 'bg-white/60 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 drop-shadow-none'}`}>Todas</button>
                            )}
                            <button onClick={() => { if(currentUser) { setViewMode('my_scale'); setSelectedDoctor(currentUser.name); } }} className={`px-2.5 py-0.5 text-[10px] leading-tight font-bold rounded-md transition-colors whitespace-nowrap ${!currentUser ? 'opacity-50 cursor-not-allowed' : (viewMode === 'my_scale' && selectedDoctor === currentUser?.name) ? 'bg-white/60 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 drop-shadow-none'}`}>Minhas</button>
                        </div>

                        <div className="w-px bg-white/80 shrink-0"></div>

                        {/* Realce de pendências: acende só o que está diferente (vermelho,
                            sinalizado ou sem cobertura) e apaga o resto. */}
                        <div className="flex flex-col justify-center bg-white/70 rounded-lg p-0.5 shrink-0">
                            <button
                                onClick={() => setPendingOnly(v => !v)}
                                title={pendingOnly ? 'Mostrar a escala inteira com as cores normais' : 'Destacar só vagas descobertas, plantões em vermelho e sinalizados'}
                                aria-pressed={pendingOnly}
                                className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] leading-tight font-bold rounded-md transition-colors whitespace-nowrap ${pendingOnly ? 'bg-white/60 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 drop-shadow-none'}`}
                            >
                                <Flag size={11} strokeWidth={pendingOnly ? 3 : 2.5} /> Pendências
                            </button>
                        </div>

                        <div className="w-px bg-white/80 shrink-0"></div>

                        <div className="flex flex-col justify-center gap-0.5 bg-white/70 rounded-lg p-0.5 shrink-0">
                            <button onClick={() => setVisualizationMode('mensal')} className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] leading-tight font-bold rounded-md transition-colors whitespace-nowrap ${visualizationMode === 'mensal' ? 'bg-white/60 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 drop-shadow-none'}`}><CalendarIcon size={11}/> Mensal</button>
                            {isEscalaAdmin && (
                                <button onClick={() => setVisualizationMode('fixa')} className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] leading-tight font-bold rounded-md transition-colors whitespace-nowrap ${visualizationMode === 'fixa' ? 'bg-white/60 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 drop-shadow-none'}`}><Settings size={11}/> Fixa</button>
                            )}
                        </div>

                        <div className="w-px bg-white/80 shrink-0"></div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            {/* Combobox com busca digitável (mesmo componente do financeiro):
                                a lista de médicos é longa demais para um <select> nativo. */}
                            <div className="flex flex-col justify-center gap-1 shrink-0">
                                <div className="flex items-center gap-1.5 w-[186px]">
                                    <Building2 size={12} className="text-slate-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <SearchableSelect
                                            size="sm"
                                            allowEmpty
                                            emptyLabel="Todos Hospitais"
                                            searchPlaceholder="Buscar hospital…"
                                            options={hospitais.map(h => ({ value: String(h.id), label: h.name }))}
                                            value={selectedHospital != null ? String(selectedHospital) : ''}
                                            onChange={(v) => setSelectedHospital(v ? parseInt(v) : null)}
                                        />
                                    </div>
                                </div>

                                {canViewAll && (
                                    <div className="flex items-center gap-1.5 w-[186px]">
                                        <User size={12} className="text-slate-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <SearchableSelect
                                                size="sm"
                                                allowEmpty
                                                emptyLabel="Todos os Médicos"
                                                searchPlaceholder="Buscar médico…"
                                                options={doctorOptions.map(n => ({ value: n, label: n }))}
                                                value={viewMode === 'my_scale' ? selectedDoctor : ''}
                                                onChange={(val) => {
                                                    if (!val) {
                                                        setViewMode('all');
                                                    } else {
                                                        setSelectedDoctor(val);
                                                        setViewMode('my_scale');
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {hasEscalaFilter && (
                                <button
                                    onClick={clearEscalaFilters}
                                    title="Limpar filtros"
                                    className="w-7 h-7 rounded-lg bg-white/70 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-colors shrink-0 border border-black/[.06]"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Right Side: Tools & Settings */}
                    <div className="flex items-center gap-1 pt-2 lg:pt-0 border-t border-white/40 lg:border-t-0 lg:border-l lg:border-white/60 lg:pl-2 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setCompacto(v => !v)}
                            aria-pressed={compacto}
                            title={compacto ? 'Voltar à visão normal, com os nomes por extenso' : 'Encolher a grade para a semana inteira caber na tela'}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors shrink-0 border ${compacto ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-slate-600 border-transparent hover:bg-white/70'}`}
                        >
                            {compacto ? <Maximize2 size={14} className="text-indigo-500"/> : <Minimize2 size={14} className="text-slate-400"/>}
                            {compacto ? 'Visão normal' : 'Ver otimizado'}
                        </button>

                        <div className="h-4 w-px bg-white/80 hidden lg:block shrink-0"></div>

                        {(hasPermission('Operacional Escala') || isEscalaAdmin) && (
                            <>
                                <button onClick={() => setIsFinanceiroModalOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 text-xs font-bold rounded-lg transition-colors shrink-0"><CircleDollarSign size={14} className="text-emerald-500"/> Repasses</button>
                                <button onClick={() => setIsFolhaPontoModalOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600 text-xs font-bold rounded-lg transition-colors shrink-0"><FileText size={14} className="text-blue-500"/> Ponto</button>
                            </>
                        )}

                        {isEscalaAdmin && (
                            <>
                                <div className="h-4 w-px bg-white/80 hidden lg:block shrink-0"></div>
                                <button onClick={() => {
                                    const activeMonthLabel = existingMonths.find(m => m.id === activeMonth)?.label || activeMonth;
                                    const medicoFiltrado = viewMode === 'my_scale' && selectedDoctor;

                                    // Médico filtrado: gera o PDF da escala dele em todos os hospitais
                                    // (ou só no hospital selecionado, se o filtro de hospital também estiver ativo).
                                    if (medicoFiltrado) {
                                        const hospitaisAlvo = hospitais.filter(h => selectedHospital === null || h.id === selectedHospital);
                                        printMedicoEscalaPdf(selectedDoctor, hospitaisAlvo, assignments, activeWeeks, activeMonthLabel, activeMonth, doctors, currentUser);
                                        return;
                                    }

                                    // Sem médico filtrado: precisa de um hospital selecionado (comportamento original)
                                    if (!selectedHospital) {
                                        toast.error("Selecione um hospital ou um médico no filtro ao lado para exportar o PDF.");
                                        return;
                                    }
                                    const hospitalObj = hospitais.find(h => h.id === selectedHospital);
                                    printHospitalEscalaPdf(hospitalObj, assignments, activeWeeks, activeMonthLabel, activeMonth, doctors, currentUser);
                                }} className="flex items-center gap-1.5 px-2.5 py-1.5 text-indigo-600 hover:bg-indigo-50 text-xs font-bold rounded-lg transition-colors border border-indigo-100 shrink-0" title={viewMode === 'my_scale' && selectedDoctor ? `Exportar PDF da escala de ${selectedDoctor}` : "Exportar PDF do Hospital Selecionado"}>
                                    <Download size={14} className="text-indigo-500"/>
                                    <span className="hidden xl:inline">{viewMode === 'my_scale' && selectedDoctor ? 'Escala Médico' : 'Escala Hospital'}</span>
                                </button>
                            </>
                        )}

                        {isEscalaAdmin && (
                            <>
                                <div className="h-4 w-px bg-white/80 hidden lg:block shrink-0"></div>
                                <button onClick={() => setIsMonthModalOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:bg-white/70 text-xs font-bold rounded-lg transition-colors shrink-0" title="Gerenciar Meses"><CalendarDays size={14}/><span className="hidden xl:inline">Meses</span></button>
                                <button onClick={() => setIsFinancialRulesModalOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:bg-white/70 text-xs font-bold rounded-lg transition-colors shrink-0" title="Configuração da Escala — unidades, turnos e valores"><DollarSign size={14}/><span className="hidden xl:inline">Regras</span></button>
                                <button onClick={() => setIsHistoryModalOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:bg-white/70 text-xs font-bold rounded-lg transition-colors shrink-0" title="Histórico"><Clock size={14}/><span className="hidden xl:inline">Histórico</span></button>
                            </>
                        )}

                        {/* Cofre (Máquina do Tempo) restaura a escala inteira por cima da atual —
                            é destrutivo demais para admin comum. Só Desenvolvedor, e SEM o bypass
                            de "Acesso Total (Admin)". */}
                        {isDeveloper && (
                            <button onClick={() => setIsBackupModalOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors shrink-0" title="Máquina do Tempo (Backups)"><DatabaseBackup size={14}/><span className="hidden xl:inline">Cofre</span></button>
                        )}
                    </div>
                </div>
            </div>

            {/* Scrollable Container para as Semanas */}
            <div className={`esc-semanas flex-1 overflow-y-auto custom-scrollbar pr-2 pb-12 space-y-8 relative ${compacto ? 'esc-compacta' : ''}`}>

                {/* Indicador de Modo Fixo */}
                {visualizationMode === 'fixa' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                        <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                            <Settings size={20} />
                        </div>
                        <div>
                            <h3 className="text-amber-900 font-bold text-sm">Modo de Escala Fixa</h3>
                            <p className="text-amber-700 text-xs mt-0.5">Esta é a configuração padrão. Use este modelo para replicar para os próximos meses e evitar retrabalho.</p>
                        </div>
                    </div>
                )}

                {activeWeeks.map((week) => (
                    <div id={`week-${week.id}`} key={week.id} className="bg-white/60 rounded-2xl shadow-lg shadow-slate-300/40 backdrop-blur-md border border-white/60 overflow-hidden flex flex-col">
                        
                        {/* Header da Semana */}
                        <div className="esc-semana-head px-6 py-4 border-b border-white/40 flex items-center justify-between bg-slate-50/30">
                            <div className="flex items-center gap-4">
                                <h2 className="esc-semana-titulo text-base font-bold text-slate-900 drop-shadow-none tracking-normal">{week.title}</h2>
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-[11px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
                                    {week.badge}
                                </span>
                            </div>
                            {visualizationMode === 'fixa' && (
                                <button 
                                    onClick={() => setConfirmReplicateWeek(week.index !== undefined ? week.index : parseInt(week.title.replace('Semana ', '')) - 1)}
                                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-100"
                                >
                                    <Copy size={14} className="text-indigo-500" /> Replicar esta Semana para as outras
                                </button>
                            )}
                        </div>

                        {/* Tabela Clean / Enterprise */}
                        <div className="overflow-x-auto flex-1 custom-scrollbar">
                            <table className="esc-grade w-full text-left border-collapse table-fixed min-w-[1200px]">
                                <thead className="bg-white/60">
                                    <tr>
                                        {/* Z-Index 30 para os cabeçalhos ficarem acima de tudo */}
                                        <th className="esc-col-hosp px-1.5 md:px-3 py-1.5 border-b border-white/60 w-[24px] min-w-[24px] max-w-[24px] md:w-40 md:min-w-[160px] md:max-w-[160px] sticky left-0 z-30 bg-white/60 shadow-[1px_0_0_0_rgba(226,232,240,1)] text-center">
                                            <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-tight md:tracking-widest hidden md:inline">Hospital</span>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase [writing-mode:vertical-rl] rotate-180 md:hidden mx-auto h-16 inline-flex justify-center items-center">Hosp</span>
                                        </th>
                                        <th className="esc-col-tipo px-1 md:px-3 py-1.5 border-b border-white/60 w-[36px] min-w-[36px] max-w-[36px] md:w-36 md:min-w-[144px] md:max-w-[144px] sticky left-[24px] md:left-[160px] z-30 bg-white/60 shadow-[1px_0_0_0_rgba(226,232,240,1),_4px_0_12px_-5px_rgba(0,0,0,0.1)] border-r border-white/60 text-center">
                                            <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-tight md:tracking-widest hidden md:inline">Tipo</span>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase md:hidden block">Tipo</span>
                                        </th>
                                        {week.days.map((day, idx) => (
                                            <th key={idx} className={`esc-col-dia px-2 py-1.5 border-b border-white/60 w-[160px] min-w-[160px] border-r border-slate-200/60 last:border-r-0 ${day.isWeekend ? 'bg-white/5' : 'bg-white/5'}`}>
                                                {/* Cabeçalho centralizado */}
                                                {!day.isOutOfMonth ? (
                                                    <>
                                                    {/* Rótulo curto: só aparece na visão otimizada, onde
                                                        "Segunda-feira · 8 de setembro de 2026" não cabe. */}
                                                    <div className="esc-dia-curto hidden flex-col items-center justify-center leading-tight">
                                                        <span className={`text-[10px] font-black uppercase ${day.isWeekend ? 'text-slate-500' : 'text-blue-600'}`}>{day.dayName.substring(0, 3)}</span>
                                                        <span className="text-[9px] font-bold text-slate-500">{day.date}</span>
                                                    </div>
                                                    <div className="esc-dia-longo flex flex-col items-center justify-center gap-0 py-0.5">
                                                        <span className={`text-[10px] font-black uppercase tracking-wider ${day.isWeekend ? 'text-slate-500' : 'text-blue-600 drop-shadow-none'}`}>
                                                            {(() => {
                                                                const isFeira = !['Sábado', 'Domingo'].includes(day.dayName);
                                                                return `${day.dayName}${isFeira ? '-feira' : ''}`;
                                                            })()}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-500 uppercase">
                                                            {(() => {
                                                                const dayNum = day.date.split('/')[0];
                                                                const monthNum = parseInt(day.date.split('/')[1]);
                                                                const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
                                                                const yearStr = activeMonth ? activeMonth.split('-')[0] : new Date().getFullYear();
                                                                return `${dayNum} de ${months[monthNum - 1]} de ${yearStr}`;
                                                            })()}
                                                        </span>
                                                    </div>
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center opacity-30">
                                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{day.dayName}</span>
                                                    </div>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {hospitais
                                        .filter(h => selectedHospital === null || h.id === selectedHospital)
                                        .map(h => {
                                            // Ordem de exibição: mantém a ordem configurada dos setores, mas
                                            // empurra qualquer linha de período Noturno para o fim (sort estável),
                                            // assim os extras diurnos ficam agrupados e o Noturno sempre por último.
                                            // originalIdx é preservado → os slotId continuam corretos.
                                            const orderSectors = (arr) => [...arr].sort((a, b) => {
                                                const an = getTurnoMeta(h.name, a.sector).period === 'Noturno' ? 1 : 0;
                                                const bn = getTurnoMeta(h.name, b.sector).period === 'Noturno' ? 1 : 0;
                                                return an - bn;
                                            });
                                            if (viewMode !== 'my_scale') {
                                                return { ...h, renderSectors: orderSectors(h.sectors.map((s, i) => ({ sector: s, originalIdx: i }))) };
                                            }
                                            // Se for "Minhas", filtra apenas os setores onde o médico tem plantão
                                            const renderSectors = orderSectors(h.sectors.map((s, i) => ({ sector: s, originalIdx: i })).filter(info => {
                                                return week.days.some((day, dIdx) => {
                                                    const slotIdPrefix = visualizationMode === 'fixa' ? 'FIXED' : activeMonth;
                                                    const dayIndex = day.originalIndex !== undefined ? day.originalIndex : dIdx;
                                                    const slotId = `${slotIdPrefix}-${week.id}-${h.id}-${info.originalIdx}-${dayIndex}`;
                                                    const assignedData = assignments[slotId];
                                                    const assignedDoctor = typeof assignedData === 'string' ? assignedData : assignedData?.doctorName;
                                                    return assignedDoctor && selectedDoctor && assignedDoctor === selectedDoctor;
                                                });
                                            }));
                                            return { ...h, renderSectors };
                                        })
                                        .filter(h => h.renderSectors && h.renderSectors.length > 0)
                                        .map((hospital, hIdx) => {
                                        const c = hospital.color || 'slate';
                                        
                                        // Mapeamento explícito para o Tailwind não remover as classes (PurgeCSS)
                                        const colorMap = {
                                            slate: { bg: 'bg-slate-50/60', hover: 'group-hover:bg-slate-100/60', border: 'border-white/60', textDark: 'text-slate-800', indicator: 'bg-slate-500', pillText: 'text-slate-700', iconBg: 'bg-white/70', iconText: 'text-slate-600', pillHover: 'hover:border-slate-400', pillBorder: 'border-slate-200/50' },
                                            gray: { bg: 'bg-gray-50/60', hover: 'group-hover:bg-gray-100/60', border: 'border-gray-200/60', textDark: 'text-gray-900', indicator: 'bg-gray-500', pillText: 'text-gray-700', iconBg: 'bg-gray-100', iconText: 'text-gray-600', pillHover: 'hover:border-gray-400', pillBorder: 'border-gray-200/50' },
                                            zinc: { bg: 'bg-zinc-50/60', hover: 'group-hover:bg-zinc-100/60', border: 'border-zinc-200/60', textDark: 'text-zinc-900', indicator: 'bg-zinc-500', pillText: 'text-zinc-700', iconBg: 'bg-zinc-100', iconText: 'text-zinc-600', pillHover: 'hover:border-zinc-400', pillBorder: 'border-zinc-200/50' },
                                            neutral: { bg: 'bg-neutral-50/60', hover: 'group-hover:bg-neutral-100/60', border: 'border-neutral-200/60', textDark: 'text-neutral-900', indicator: 'bg-neutral-500', pillText: 'text-neutral-700', iconBg: 'bg-neutral-100', iconText: 'text-neutral-600', pillHover: 'hover:border-neutral-400', pillBorder: 'border-neutral-200/50' },
                                            stone: { bg: 'bg-stone-50/60', hover: 'group-hover:bg-stone-100/60', border: 'border-stone-200/60', textDark: 'text-stone-900', indicator: 'bg-stone-500', pillText: 'text-stone-700', iconBg: 'bg-stone-100', iconText: 'text-stone-600', pillHover: 'hover:border-stone-400', pillBorder: 'border-stone-200/50' },
                                            red: { bg: 'bg-red-50/60', hover: 'group-hover:bg-red-100/60', border: 'border-red-200/60', textDark: 'text-red-900', indicator: 'bg-red-500', pillText: 'text-red-700', iconBg: 'bg-red-100', iconText: 'text-red-600', pillHover: 'hover:border-red-400', pillBorder: 'border-red-200/50' },
                                            orange: { bg: 'bg-orange-50/60', hover: 'group-hover:bg-orange-100/60', border: 'border-orange-200/60', textDark: 'text-orange-900', indicator: 'bg-orange-500', pillText: 'text-orange-700', iconBg: 'bg-orange-100', iconText: 'text-orange-600', pillHover: 'hover:border-orange-400', pillBorder: 'border-orange-200/50' },
                                            amber: { bg: 'bg-amber-50/60', hover: 'group-hover:bg-amber-100/60', border: 'border-amber-200/60', textDark: 'text-amber-900', indicator: 'bg-amber-500', pillText: 'text-amber-700', iconBg: 'bg-amber-100', iconText: 'text-amber-600', pillHover: 'hover:border-amber-400', pillBorder: 'border-amber-200/50' },
                                            yellow: { bg: 'bg-yellow-50/60', hover: 'group-hover:bg-yellow-100/60', border: 'border-yellow-200/60', textDark: 'text-yellow-900', indicator: 'bg-yellow-500', pillText: 'text-yellow-700', iconBg: 'bg-yellow-100', iconText: 'text-yellow-600', pillHover: 'hover:border-yellow-400', pillBorder: 'border-yellow-200/50' },
                                            lime: { bg: 'bg-lime-50/60', hover: 'group-hover:bg-lime-100/60', border: 'border-lime-200/60', textDark: 'text-lime-900', indicator: 'bg-lime-500', pillText: 'text-lime-700', iconBg: 'bg-lime-100', iconText: 'text-lime-600', pillHover: 'hover:border-lime-400', pillBorder: 'border-lime-200/50' },
                                            green: { bg: 'bg-green-50/60', hover: 'group-hover:bg-green-100/60', border: 'border-green-200/60', textDark: 'text-green-900', indicator: 'bg-green-500', pillText: 'text-green-700', iconBg: 'bg-green-100', iconText: 'text-green-600', pillHover: 'hover:border-green-400', pillBorder: 'border-green-200/50' },
                                            emerald: { bg: 'bg-emerald-50/60', hover: 'group-hover:bg-emerald-100/60', border: 'border-emerald-200/60', textDark: 'text-emerald-900', indicator: 'bg-emerald-500', pillText: 'text-emerald-700', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', pillHover: 'hover:border-emerald-400', pillBorder: 'border-emerald-200/50' },
                                            teal: { bg: 'bg-teal-50/60', hover: 'group-hover:bg-teal-100/60', border: 'border-teal-200/60', textDark: 'text-teal-900', indicator: 'bg-teal-500', pillText: 'text-teal-700', iconBg: 'bg-teal-100', iconText: 'text-teal-600', pillHover: 'hover:border-teal-400', pillBorder: 'border-teal-200/50' },
                                            cyan: { bg: 'bg-cyan-50/60', hover: 'group-hover:bg-cyan-100/60', border: 'border-cyan-200/60', textDark: 'text-cyan-900', indicator: 'bg-cyan-500', pillText: 'text-cyan-700', iconBg: 'bg-cyan-100', iconText: 'text-cyan-600', pillHover: 'hover:border-cyan-400', pillBorder: 'border-cyan-200/50' },
                                            sky: { bg: 'bg-sky-50/60', hover: 'group-hover:bg-sky-100/60', border: 'border-sky-200/60', textDark: 'text-sky-900', indicator: 'bg-sky-500', pillText: 'text-sky-700', iconBg: 'bg-sky-100', iconText: 'text-sky-600', pillHover: 'hover:border-sky-400', pillBorder: 'border-sky-200/50' },
                                            blue: { bg: 'bg-blue-50/60', hover: 'group-hover:bg-blue-100/60', border: 'border-blue-200/60', textDark: 'text-blue-900', indicator: 'bg-blue-500', pillText: 'text-blue-700', iconBg: 'bg-blue-100', iconText: 'text-blue-600', pillHover: 'hover:border-blue-400', pillBorder: 'border-blue-200/50' },
                                            indigo: { bg: 'bg-indigo-50/60', hover: 'group-hover:bg-indigo-100/60', border: 'border-indigo-200/60', textDark: 'text-indigo-900', indicator: 'bg-indigo-500', pillText: 'text-indigo-700', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', pillHover: 'hover:border-indigo-400', pillBorder: 'border-indigo-200/50' },
                                            violet: { bg: 'bg-violet-50/60', hover: 'group-hover:bg-violet-100/60', border: 'border-violet-200/60', textDark: 'text-violet-900', indicator: 'bg-violet-500', pillText: 'text-violet-700', iconBg: 'bg-violet-100', iconText: 'text-violet-600', pillHover: 'hover:border-violet-400', pillBorder: 'border-violet-200/50' },
                                            purple: { bg: 'bg-purple-50/60', hover: 'group-hover:bg-purple-100/60', border: 'border-purple-200/60', textDark: 'text-purple-900', indicator: 'bg-purple-500', pillText: 'text-purple-700', iconBg: 'bg-purple-100', iconText: 'text-purple-600', pillHover: 'hover:border-purple-400', pillBorder: 'border-purple-200/50' },
                                            fuchsia: { bg: 'bg-fuchsia-50/60', hover: 'group-hover:bg-fuchsia-100/60', border: 'border-fuchsia-200/60', textDark: 'text-fuchsia-900', indicator: 'bg-fuchsia-500', pillText: 'text-fuchsia-700', iconBg: 'bg-fuchsia-100', iconText: 'text-fuchsia-600', pillHover: 'hover:border-fuchsia-400', pillBorder: 'border-fuchsia-200/50' },
                                            pink: { bg: 'bg-pink-50/60', hover: 'group-hover:bg-pink-100/60', border: 'border-pink-200/60', textDark: 'text-pink-900', indicator: 'bg-pink-500', pillText: 'text-pink-700', iconBg: 'bg-pink-100', iconText: 'text-pink-600', pillHover: 'hover:border-pink-400', pillBorder: 'border-pink-200/50' },
                                            rose: { bg: 'bg-rose-50/60', hover: 'group-hover:bg-rose-100/60', border: 'border-rose-200/60', textDark: 'text-rose-900', indicator: 'bg-rose-500', pillText: 'text-rose-700', iconBg: 'bg-rose-100', iconText: 'text-rose-600', pillHover: 'hover:border-rose-400', pillBorder: 'border-rose-200/50' },
                                        };
                                        const theme = colorMap[c] || colorMap['slate'];

                                        return (
                                            <React.Fragment key={hospital.id}>
                                                {hospital.renderSectors.map(({ sector, originalIdx: sIdx }, renderIdx) => {
                                                    const isFirstRow = renderIdx === 0;
                                                    const isLastRow = renderIdx === hospital.renderSectors.length - 1;
                                                    const isNightRow = getNormalizedPeriod(sector) === 'Noturno';
                                                    const hospitalTopBorder = isFirstRow && hIdx !== 0 ? `border-t-2 ${theme.border}` : '';
                                                    const sectorBottomBorder = isLastRow ? `border-b ${theme.border}` : '';
                                                    
                                                    return (
                                                        <tr key={`${hospital.id}-${sIdx}`} className={`group transition-colors ${theme.bg} ${theme.hover}`}>
                                                            
                                                            {/* Coluna Unidade */}
                                                            {isFirstRow && (
                                                                <td rowSpan={hospital.renderSectors.length} className={`esc-col-hosp p-0 md:px-3 md:py-1.5 sticky left-0 z-20 ${theme.bg} transition-colors ${hospitalTopBorder} border-b ${theme.border} shadow-[1px_0_0_0_rgba(226,232,240,1)] relative align-middle`}>
                                                                    {/* Indicador de cor do hospital na borda esquerda */}
                                                                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 md:w-1.5 ${theme.indicator}`} />
                                                                    
                                                                    <div className="flex items-center justify-center h-full w-full py-1">
                                                                        <span className={`esc-hosp-full hidden md:block text-xs font-black ${theme.textDark} tracking-normal text-center uppercase break-words`}>{hospital.name}</span>
                                                                        <span className={`esc-hosp-vert md:hidden text-[10px] leading-[1.1] font-black ${theme.textDark} tracking-widest text-center uppercase whitespace-nowrap [writing-mode:vertical-rl] rotate-180`}>{hospital.name}</span>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            
                                                            {/* Coluna Setor */}
                                                            <td className={`esc-col-tipo relative px-1 md:px-3 py-1.5 sticky left-[24px] md:left-[160px] z-20 ${theme.bg} ${theme.hover} transition-colors border-r ${theme.border} shadow-[1px_0_0_0_rgba(226,232,240,1),_4px_0_12px_-5px_rgba(0,0,0,0.1)] ${hospitalTopBorder} ${sectorBottomBorder} align-middle`}>
                                                                {/* Sombreamento da faixa noturna (começa já na coluna Tipo) */}
                                                                {isNightRow && <div className="absolute inset-0 bg-slate-900/[0.07] pointer-events-none" />}
                                                                <div className={`relative z-10 inline-flex w-full h-full min-h-[30px] items-center justify-center gap-1 px-0.5 md:px-1.5 py-0.5 rounded md:rounded-md text-[9px] leading-tight text-center font-bold uppercase tracking-tight md:tracking-wider md:bg-white/60 border-none md:border ${theme.border} md:shadow-sm ${theme.pillText}`}>
                                                                    <span className="hidden md:inline-flex shrink-0">
                                                                        {isNightRow
                                                                            ? <Moon size={11} className="text-indigo-400" fill="currentColor" strokeWidth={0} />
                                                                            : <Sun size={11} className="text-amber-400" strokeWidth={2.5} />}
                                                                    </span>
                                                                    <span className="esc-setor-full truncate whitespace-normal line-clamp-2 break-words hidden md:block">{sector}</span>
                                                                    <span className="esc-setor-curto md:hidden text-[10px] font-black text-center truncate">{getMobileSectorName(sector)}</span>
                                                                </div>
                                                            </td>

                                                                {week.days.map((day, dIdx) => {
                                                                const slotIdPrefix = visualizationMode === 'fixa' ? 'FIXED' : activeMonth;
                                                                const dayIndex = day.originalIndex !== undefined ? day.originalIndex : dIdx;
                                                                const slotId = `${slotIdPrefix}-${week.id}-${hospital.id}-${sIdx}-${dayIndex}`;
                                                                const assignedData = assignments[slotId];
                                                                const assignedDoctor = typeof assignedData === 'string' ? assignedData : assignedData?.doctorName;
                                                                const appearance = assignedData?.appearance || { bold: false, color: 'default', flagged: false, verified: false };
                                                                // Vaga descoberta: plantão sem médico, sinalizado de propósito.
                                                                const slotUncovered = !!appearance.uncovered;
                                                                // Vermelho (ou vaga descoberta) pinta o card de rosa; sinalizado, de laranja.
                                                                const pillRed = appearance.color === 'red' || slotUncovered;
                                                                const pillFlagged = !pillRed && !!appearance.flagged;
                                                                // No modo Pendências, tudo que está em ordem sai de cena em cinza —
                                                                // o hover devolve a cor para dar uma olhada sem sair do modo.
                                                                const pillDimmed = pendingOnly && !pillRed && !pillFlagged;
                                                                const cellLabel = slotUncovered ? UNCOVERED_LABEL : formatDoctorName(assignedDoctor);

                                                                // Turno do plantão (para ícone sol/lua) e horário (com fallback no padrão do período)
                                                                const isNightShift = getNormalizedPeriod(assignedData?.period || sector) === 'Noturno';
                                                                const displayTime = (assignedDoctor || slotUncovered) ? (assignedData?.time || getDefaultTimeForPeriod(assignedData?.period || sector)) : '';

                                                                // Zebra vertical suave para fins de semana e dias fora do mês + faixa mais escura para o noturno
                                                                const dayBgClass = day.isOutOfMonth
                                                                    ? 'bg-slate-100/50'
                                                                    : day.isWeekend
                                                                        ? (isNightRow ? 'bg-slate-900/[0.12]' : 'bg-slate-900/5')
                                                                        : (isNightRow ? 'bg-slate-900/[0.07]' : '');

                                                                return (
                                                                    <td key={dIdx} className={`esc-col-dia px-1 py-1 border-r border-slate-200/30 last:border-r-0 ${hospitalTopBorder} ${sectorBottomBorder} ${dayBgClass}`}>
                                                                        {day.isOutOfMonth ? (
                                                                            <div className="w-full h-[26px]"></div>
                                                                        ) : (assignedDoctor || slotUncovered) ? (
                                                                            (viewMode === 'all' || assignedDoctor === selectedDoctor) ? (
                                                                                // Design Premium: Pill branca neutra minimalista
                                                                                <div 
                                                                                    onClick={() => {
                                                                                        if (!isEscalaAdmin) return;
                                                                                        setSearchDoc('');
                                                                                        const lockVerified = !!appearance.verified && !canEditVerified;
                                                                                        // O pagamento tranca mais do que a verificação:
                                                                                        // tem dinheiro já baixado amarrado neste plantão, então
                                                                                        // nem quem edita verificados mexe. O caminho é desfazer o
                                                                                        // pagamento (que estorna a baixa) e seguir o rito normal.
                                                                                        const lockAVista = !!assignedData?.avista;
                                                                                        const lockAssinada = !!assinaturaPorSlot[slotId];
                                                                                        setActiveSlot({
                                                                            id: slotId,
                                                                            hospitalName: hospital.name,
                                                                            sectorName: sector,
                                                                            date: day.date,
                                                                            readOnly: lockVerified || lockAVista || lockAssinada,
                                                                            lockAVista,
                                                                            lockAssinada,
                                                                            // Como o plantão já estava assim, um conflito pré-existente não
                                                                            // pode travar a edição de outros campos (legenda, valor, cor).
                                                                            // Só bloqueia se o médico, o período ou o horário mudarem.
                                                                            baseline: {
                                                                                doctorName: assignedDoctor,
                                                                                uncovered: slotUncovered,
                                                                                period: getNormalizedPeriod(assignedData?.period || sector),
                                                                                time: assignedData?.time || getDefaultTimeForPeriod(assignedData?.period || sector)
                                                                            }
                                                                        });
                                                                                        setDraftAssignment({
                                                                                            doctorName: assignedDoctor,
                                                                                            subtitle: assignedData?.subtitle || '',
                                                                                            period: getNormalizedPeriod(assignedData?.period || sector),
                                                                                            time: assignedData?.time || getDefaultTimeForPeriod(assignedData?.period || sector),
                                                                                            ruleId: assignedData?.ruleId || undefined,
                                                                                            outros: assignedData?.outros || false,
                                                                                            appearance: assignedData?.appearance || { bold: false, color: 'default', flagged: false, verified: false },
                                                                                            financial: assignedData?.financial || { baseValue: '', extraValue: '0', observations: '', locked: false, extraItems: [] }
                                                                                        });
                                                                                    }}
                                                                                    className={`esc-card group/assigned w-full h-auto min-h-[26px] py-0.5 rounded-lg border shadow-sm flex flex-col items-center justify-center px-0.5 ${isEscalaAdmin ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} transition-all relative overflow-hidden text-center ${pillDimmed ? 'grayscale opacity-40 hover:opacity-100 hover:grayscale-0 ' : ''}${pillRed ? 'bg-rose-50 border-rose-200' : pillFlagged ? 'bg-amber-50 border-amber-200' : 'bg-white/60 ' + theme.pillBorder}`}
                                                                                >
                                                                                    {/* Ícone de turno: sol (diurno) / lua (noturno) */}
                                                                                    <span className="absolute top-0.5 right-0.5 z-10 opacity-80 pointer-events-none" title={isNightShift ? 'Plantão noturno' : 'Plantão diurno'}>
                                                                                        {isNightShift
                                                                                            ? <Moon size={10} className="text-indigo-400" fill="currentColor" strokeWidth={0} />
                                                                                            : <Sun size={10} className="text-amber-400" strokeWidth={2.5} />}
                                                                                    </span>

                                                                                    <div className="esc-card-linha flex items-center justify-center gap-1 w-full relative z-10 pr-6 pl-1">
                                                                                        <span className={`esc-card-nome text-[10px] whitespace-normal break-words leading-tight ${(appearance.bold || slotUncovered) ? 'font-black' : 'font-bold'} ${pillRed ? 'text-rose-700' : pillFlagged ? 'text-amber-700' : theme.pillText}`} title={slotUncovered ? 'Vaga sem cobertura' : assignedDoctor}>
                                                                                            {cellLabel}
                                                                                        </span>
                                                                                        {appearance.verified && <Check size={10} className="text-emerald-500 shrink-0" strokeWidth={3}/>}
                                                                                        {appearance.flagged && <span className="text-amber-500 shrink-0"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2v20h2v-8h14l-2.5-4.5L20 5H6V2H4z"/></svg></span>}
                                                                                    </div>
                                                                                    
                                                                                    {/* Observação do plantão: visível para quem tem a chave de leitura */}
                                                                                    {canViewObs && assignedData?.subtitle && (
                                                                                        <span title={assignedData.subtitle} className="esc-card-obs text-[9px] font-medium text-slate-500 whitespace-normal break-words leading-tight block mt-0 relative z-10 w-full text-center px-1">{assignedData.subtitle}</span>
                                                                                    )}
                                                                                    {displayTime && (
                                                                                        <span className={`esc-card-hora text-[9px] font-bold ${pillRed ? 'text-rose-500' : pillFlagged ? 'text-amber-600' : theme.iconText} mt-0 relative z-10 w-full text-center`}>{displayTime}</span>
                                                                                    )}
                                                                                    
                                                                                    {isEscalaAdmin && (!appearance.verified || canEditVerified) && (
                                                                                        <div className={`absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l ${pillRed ? 'from-rose-50 via-rose-50/80' : pillFlagged ? 'from-amber-50 via-amber-50/80' : 'from-white via-white/80'} to-transparent opacity-0 group-hover/assigned:opacity-100 transition-opacity flex items-center justify-end pr-1 z-20`}>
                                                                                            <button 
                                                                                                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setConfirmRemove({ slotId, hospital, sector, day, doctorName: slotUncovered ? UNCOVERED_LABEL : assignedDoctor, x: r.left + r.width / 2, y: r.bottom }); }}
                                                                                                className="p-1 rounded-md bg-white/60 text-rose-500 hover:bg-rose-50 shadow-sm border border-white/40 transition-colors"
                                                                                                title="Remover Plantonista"
                                                                                            >
                                                                                                <X size={12} strokeWidth={3} />
                                                                                            </button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                // Se estiver em Minha Escala e não for o médico selecionado, deixa um espaço vazio
                                                                                <div className="w-full h-[26px]"></div>
                                                                            )
                                                                        ) : isEscalaAdmin ? (
                                                                            // Design Premium: Buraco super sutil, só aparece no hover ou se a escala estiver vazia
                                                                            <button 
                                                                                onClick={() => {
                                                                                    setSearchDoc('');
                                                                                    setActiveSlot({ id: slotId, hospitalName: hospital.name, sectorName: sector, date: day.date });
                                                                                    setDraftAssignment({
                                                                                        doctorName: '',
                                                                                        subtitle: '',
                                                                                        period: getNormalizedPeriod(sector),
                                                                                        time: getDefaultTimeForPeriod(sector),
                                                                                        ruleId: undefined,
                                                                                        outros: false,
                                                                                        appearance: { bold: false, color: 'default', flagged: false, verified: false },
                                                                                        financial: { baseValue: '', extraValue: '0', observations: '', locked: false, extraItems: [] }
                                                                                    });
                                                                                }}
                                                                                className="group/btn w-full h-[26px] rounded-lg border border-dashed border-white/60 bg-white/60 hover:border-indigo-300 hover:bg-indigo-50/50 flex items-center justify-center transition-all"
                                                                            >
                                                                                <Plus size={14} className="text-slate-600 group-hover/btn:text-indigo-500 transition-colors opacity-0 group-hover/btn:opacity-100" />
                                                                            </button>
                                                                        ) : (
                                                                            <div className="w-full h-[26px]"></div>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Novo Plantão Avançado */}
            {activeSlot && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-0">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity animate-in fade-in" onClick={() => setActiveSlot(null)}></div>
                    <div className="bg-white rounded-[20px] shadow-[0_24px_70px_-15px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 w-full max-w-2xl flex flex-col max-h-[92vh] relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
                        {/* Header */}
                        <div className="relative px-5 py-4 bg-white border-b border-slate-100 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getNormalizedPeriod(draftAssignment.period) === 'Noturno' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500'}`}>
                                        {getNormalizedPeriod(draftAssignment.period) === 'Noturno'
                                            ? <Moon size={18} fill="currentColor" strokeWidth={0} />
                                            : <Sun size={18} strokeWidth={2.5} />}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-[15px] font-black text-slate-900 leading-tight tracking-tight">{draftAssignment.doctorName ? 'Editar Plantão' : 'Novo Plantão'}</h3>
                                        <div className="flex items-center gap-1.5 mt-1 text-[11px] font-medium text-slate-400 min-w-0">
                                            <span className="truncate">{activeSlot.hospitalName}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0"></span>
                                            <span className="truncate">{activeSlot.sectorName}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0"></span>
                                            <span className="shrink-0">{activeSlot.date}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setActiveSlot(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
                                    <X size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/70">
                            <fieldset disabled={!!activeSlot.readOnly} className="p-4 space-y-3 border-0 m-0 min-w-0 w-full">

                            {activeSlot.readOnly && (
                                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                                    <Lock size={15} className="text-emerald-600 shrink-0" strokeWidth={2.5} />
                                    <p className="text-[12px] font-semibold text-emerald-800 leading-snug">
                                        {activeSlot.lockAssinada
                                            ? 'Este plantão já faz parte de uma folha de ponto ASSINADA pelo médico — somente leitura. Alterar ou excluir aqui faria o documento assinado deixar de bater com a escala. Para mexer, cancele a assinatura na tela Folha de Ponto.'
                                            : activeSlot.lockAVista
                                                ? 'Plantão já pago — somente leitura. Para alterar qualquer coisa aqui, desfaça o pagamento no botão “Já pago” abaixo: a baixa é estornada e o plantão volta a ser editável.'
                                                : 'Plantão verificado — somente leitura. Você não tem permissão para editar plantões verificados.'}
                                    </p>
                                </div>
                            )}

                            {/* Médico (ou vaga descoberta) */}
                            <div className="relative z-50">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5"><User size={12} className="text-slate-400"/> Médico</label>
                                    {/* Sem cobertura é ESTADO do plantão, não um médico chamado
                                        "Descoberto": assim não entra na folha nem esbarra na regra
                                        de duplicidade — dá para ter vários no mesmo horário. */}
                                    <button
                                        type="button"
                                        onClick={() => setDraftAssignment(prev => setUncovered(prev, !prev.appearance?.uncovered))}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors border ${draftAssignment.appearance?.uncovered ? 'bg-rose-600 border-rose-600 text-white shadow-sm shadow-rose-600/25' : 'bg-white border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200'}`}
                                    >
                                        {draftAssignment.appearance?.uncovered ? 'Vaga descoberta ✓' : 'Marcar como descoberta'}
                                    </button>
                                </div>
                                {draftAssignment.appearance?.uncovered ? (
                                    <div className="flex items-center gap-2.5 w-full h-11 px-3 bg-rose-50 border border-rose-200 rounded-xl">
                                        <AlertTriangle size={15} className="text-rose-500 shrink-0" strokeWidth={2.5} />
                                        <span className="text-sm font-black text-rose-700 uppercase truncate">{UNCOVERED_LABEL}</span>
                                        <span className="text-[11px] text-rose-500/80 truncate">— sem plantonista definido</span>
                                    </div>
                                ) : !draftAssignment.doctorName ? (
                                    <div className="relative">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar médico..."
                                            className="w-full h-11 pl-9 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400 placeholder:font-normal shadow-sm"
                                            onChange={(e) => setSearchDoc(e.target.value)}
                                            autoFocus
                                        />
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)] max-h-52 overflow-y-auto p-1.5 z-[60]">
                                            {doctors.filter(d => {
                                                const name = typeof d === 'string' ? d : (d.name || d.nome || '');
                                                return name.toLowerCase().includes(searchDoc.toLowerCase());
                                            }).map((doc, idx) => {
                                                const docName = typeof doc === 'string' ? doc : (doc.name || doc.nome || '');
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            const docData = typeof doc === 'string' ? doctors.find(d => (d.name||d.nome) === docName) : doc;
                                                            const isTop = docData?.categoria_medica === 'Top';

                                                            const rules = getApplicableRules(activeSlot?.hospitalName, activeSlot?.sectorName, draftAssignment.period);
                                                            const rule = getDefaultRule(rules, draftAssignment.period, isTop);

                                                            setDraftAssignment({
                                                                ...draftAssignment,
                                                                doctorName: docName,
                                                                ruleId: rule ? rule.id : undefined,
                                                                financial: {
                                                                    ...draftAssignment.financial,
                                                                    baseValue: (draftAssignment.financial.extraItems || []).length > 0 ? '0' : (rule ? rule.value : draftAssignment.financial.baseValue),
                                                                    locked: !!rule
                                                                }
                                                            });
                                                        }}
                                                        className="w-full text-left px-2.5 py-2 hover:bg-slate-50 rounded-lg text-sm font-bold text-slate-700 uppercase transition-colors flex items-center justify-between gap-2"
                                                    >
                                                        <span className="truncate">{docName}</span> {typeof doc !== 'string' && doc.categoria_medica === 'Top' && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-600 text-[10px] font-black uppercase rounded shrink-0">Top</span>}
                                                    </button>
                                                )
                                            })}
                                            {doctors.filter(d => {
                                                const name = typeof d === 'string' ? d : (d.name || d.nome || '');
                                                return name.toLowerCase().includes(searchDoc.toLowerCase());
                                            }).length === 0 && (
                                                <div className="px-4 py-3 text-sm text-slate-400 text-center">Nenhum médico encontrado.</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between w-full h-11 pl-2 pr-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm">{getInitials(draftAssignment.doctorName)}</div>
                                            <span className="text-sm font-bold text-slate-800 uppercase truncate">{draftAssignment.doctorName}</span>
                                        </div>
                                        <button onClick={() => setDraftAssignment({...draftAssignment, doctorName: ''})} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-slate-100 shrink-0">
                                            <X size={14} strokeWidth={3} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Aviso ao vivo de duplicidade — o mesmo médico não pode ocupar
                                dois plantões que se sobrepõem no horário. */}
                            {draftConflicts.length > 0 && (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-3 animate-in fade-in">
                                    <div className="w-8 h-8 shrink-0 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                                        <AlertTriangle size={16} strokeWidth={2.5} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-black text-rose-700 leading-tight">Conflito de horário</p>
                                        <p className="text-[12px] text-rose-700/90 leading-snug mt-1">
                                            <strong>{formatDoctorName(draftAssignment.doctorName)}</strong> já está escalado neste mesmo horário:
                                        </p>
                                        <ul className="mt-1.5 space-y-1">
                                            {draftConflicts.map(c => (
                                                <li key={c.slotId} className="text-[12px] font-bold text-rose-800 flex items-center gap-1.5 flex-wrap">
                                                    <MapPin size={11} className="shrink-0" />
                                                    <span>{c.hospitalName || 'Hospital'}</span>
                                                    <span className="text-rose-400">·</span>
                                                    <span>{c.sectorName || c.period}</span>
                                                    {c.date && c.date !== 'Padrão' && (<><span className="text-rose-400">·</span><span>{c.date}</span></>)}
                                                    <span className="text-rose-400">·</span>
                                                    <span>{c.time}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Grid: Detalhes | Financeiro */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                                {/* Detalhes do Plantão */}
                                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.12)] space-y-3.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><Clock size={12}/></span>
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Detalhes do Plantão</span>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Subtítulo / Especialidade</label>
                                        <input
                                            type="text"
                                            value={draftAssignment.subtitle}
                                            onChange={(e) => setDraftAssignment({...draftAssignment, subtitle: e.target.value})}
                                            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Período</label>
                                            <div className="relative">
                                                <select
                                                    value={draftAssignment.period}
                                                    onChange={(e) => {
                                                        const newPeriod = e.target.value;
                                                        const newTime = getConfiguredTime(activeSlot?.hospitalName, newPeriod);
                                                        const docData = doctors.find(d => (d.name||d.nome) === draftAssignment.doctorName);
                                                        const isTop = docData?.categoria_medica === 'Top';

                                                        // Escopo pelo hospital do próprio plantão (activeSlot guarda o nome).
                                                        const rules = getApplicableRules(activeSlot?.hospitalName, activeSlot?.sectorName, newPeriod);
                                                        const rule = getDefaultRule(rules, newPeriod, isTop);

                                                        setDraftAssignment({
                                                            ...draftAssignment,
                                                            period: newPeriod,
                                                            time: newTime,
                                                            ruleId: rule ? rule.id : undefined,
                                                            financial: {
                                                                ...draftAssignment.financial,
                                                                baseValue: (draftAssignment.financial.extraItems || []).length > 0 ? '0' : (rule ? rule.value : draftAssignment.financial.baseValue),
                                                                locked: !!rule
                                                            }
                                                        });
                                                    }}
                                                    className="w-full h-10 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all appearance-none cursor-pointer"
                                                >
                                                    <option value="Diurno">Diurno</option>
                                                    <option value="Noturno">Noturno</option>
                                                    <option value="Manhã">Manhã</option>
                                                    <option value="Tarde">Tarde</option>
                                                </select>
                                                <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Horário</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: 07-19h"
                                                value={draftAssignment.time}
                                                onChange={(e) => setDraftAssignment({...draftAssignment, time: e.target.value})}
                                                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Financeiro */}
                                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.12)] space-y-3.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0"><CircleDollarSign size={12}/></span>
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Financeiro</span>
                                    </div>

                                    {/* Regra / Tabela — só aparece quando o turno tem +1 opção de valor
                                        (ex.: Noturno: Sobreaviso, +acionamento…). Turno com regra
                                        única fica travado silenciosamente, sem poluir o modal. */}
                                    {(() => {
                                        const applicable = getApplicableRules(activeSlot?.hospitalName, activeSlot?.sectorName, draftAssignment.period);
                                        if (applicable.length <= 1) return null;
                                        return (
                                            <div>
                                                <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Regra / Tabela</label>
                                                <div className="relative">
                                                    <select
                                                        value={draftAssignment.ruleId || ''}
                                                        onChange={(e) => {
                                                            const rule = applicable.find(r => r.id === e.target.value);
                                                            if (!rule) return;
                                                            setDraftAssignment({
                                                                ...draftAssignment,
                                                                ruleId: rule.id,
                                                                financial: { ...draftAssignment.financial, baseValue: (draftAssignment.financial.extraItems || []).length > 0 ? '0' : rule.value, locked: true }
                                                            });
                                                        }}
                                                        className="w-full h-10 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all appearance-none cursor-pointer"
                                                    >
                                                        {!draftAssignment.ruleId && <option value="">Selecione a regra…</option>}
                                                        {applicable.map(r => (
                                                            <option key={r.id} value={r.id}>
                                                                {r.name} — R$ {parseFloat(r.value || 0).toLocaleString('pt-BR')}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                                                Valor Base
                                                {draftAssignment.financial.locked && <Lock size={10} className="text-emerald-500" strokeWidth={2.5} title="Valor travado pela regra — ajustes vão no Valor Extra" />}
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">R$</span>
                                                <input
                                                    type="number"
                                                    value={draftAssignment.financial.baseValue}
                                                    readOnly={draftAssignment.financial.locked}
                                                    onChange={(e) => setDraftAssignment({...draftAssignment, financial: {...draftAssignment.financial, baseValue: e.target.value}})}
                                                    title={draftAssignment.financial.locked ? 'Valor travado pela regra escolhida. Para ajustar, use o Valor Extra.' : undefined}
                                                    className={`w-full h-10 pl-9 pr-2.5 border rounded-xl text-sm font-bold outline-none transition-all ${draftAssignment.financial.locked ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white'}`}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Valor Extra</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">R$</span>
                                                <input
                                                    type="number"
                                                    value={draftAssignment.financial.extraValue}
                                                    onChange={(e) => setDraftAssignment({...draftAssignment, financial: {...draftAssignment.financial, extraValue: e.target.value}})}
                                                    className="w-full h-10 pl-9 pr-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50/50 rounded-xl px-3.5 py-2.5 flex items-center justify-between border border-emerald-100/80">
                                        <span className="text-[11px] font-bold text-emerald-700/70 uppercase tracking-wider">Total</span>
                                        <span className="text-[15px] font-black text-emerald-700 tracking-tight">
                                            R$ {getAssignmentTotal(draftAssignment).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                        </span>
                                    </div>

                                    {/* Mais Opções — lançamentos extras do mesmo dia (receber x repassar) */}
                                    {(() => {
                                        const items = draftAssignment.financial.extraItems || [];
                                        const setItems = (newItems) => setDraftAssignment({ ...draftAssignment, financial: { ...draftAssignment.financial, extraItems: newItems } });
                                        const sumReceber = items.reduce((s, it) => s + (parseFloat(it.receber) || 0), 0);
                                        const sumRepasse = items.reduce((s, it) => s + calcRepasseItem(it), 0);
                                        return (
                                            <div className="space-y-2.5">
                                                <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                                                    <input
                                                        type="checkbox"
                                                        checked={items.length > 0}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                // Zera o Valor Base: com Mais Opções, quem vale p/ a folha é o "A Repassar".
                                                                // Mais Opções já liga sozinho o formato "Outros" da folha de ponto.
                                                                setDraftAssignment({ ...draftAssignment, outros: true, financial: { ...draftAssignment.financial, extraItems: [{ ...NEW_EXTRA_ITEM }], baseValue: '0' } });
                                                            } else {
                                                                // Desticou: restaura o valor da regra do plantão (se houver) e desliga o "Outros"
                                                                const rule = (financialRules || []).find(r => r.id === draftAssignment.ruleId);
                                                                setDraftAssignment({ ...draftAssignment, outros: false, financial: { ...draftAssignment.financial, extraItems: [], baseValue: rule ? rule.value : draftAssignment.financial.baseValue } });
                                                            }
                                                        }}
                                                        className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                                                    />
                                                    <span className="text-xs font-bold text-slate-600">Mais Opções</span>
                                                    <span className="text-[10px] font-medium text-slate-400">valores extras do dia</span>
                                                </label>

                                                {items.length > 0 && (
                                                    <>
                                                        {items.map((it, idx) => {
                                                            const setItem = (patch) => setItems(items.map((x, i) => i === idx ? { ...x, ...patch } : x));
                                                            const isPct = it.repMode !== 'manual';
                                                            return (
                                                                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <input
                                                                            type="text"
                                                                            placeholder={`Descrição ${idx + 1} (ex: Paciente particular)`}
                                                                            value={it.descricao}
                                                                            onChange={(e) => setItem({ descricao: e.target.value })}
                                                                            className="flex-1 min-w-0 h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300"
                                                                        />
                                                                        <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0" title="Remover linha">
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div>
                                                                            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">A Receber</label>
                                                                            <div className="relative">
                                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-semibold">R$</span>
                                                                                <CurrencyInput
                                                                                    value={it.receber}
                                                                                    onChange={(v) => setItem({ receber: v })}
                                                                                    className="w-full h-9 pl-8 pr-2 bg-white border border-slate-200 rounded-lg text-[13px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div>
                                                                            <div className="flex items-center justify-between mb-1 gap-1">
                                                                                <label className="text-[10px] font-semibold text-slate-500 truncate">A Repassar</label>
                                                                                <div className="flex rounded-md overflow-hidden border border-slate-200 shrink-0" title="Repasse por % do valor a receber ou valor manual">
                                                                                    <button onClick={() => setItem({ repMode: 'pct' })} className={`px-1.5 py-0.5 text-[9px] font-black transition-colors ${isPct ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 hover:text-slate-600'}`}>%</button>
                                                                                    <button onClick={() => setItem({ repMode: 'manual' })} className={`px-1.5 py-0.5 text-[9px] font-black transition-colors ${!isPct ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 hover:text-slate-600'}`}>R$</button>
                                                                                </div>
                                                                            </div>
                                                                            {isPct ? (
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        max="100"
                                                                                        placeholder="0"
                                                                                        value={it.repPct}
                                                                                        onChange={(e) => setItem({ repPct: e.target.value })}
                                                                                        className="w-full h-9 pl-2.5 pr-7 bg-white border border-slate-200 rounded-lg text-[13px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                                                                    />
                                                                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-semibold">%</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="relative">
                                                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-semibold">R$</span>
                                                                                    <CurrencyInput
                                                                                        value={it.repValor}
                                                                                        onChange={(v) => setItem({ repValor: v })}
                                                                                        className="w-full h-9 pl-8 pr-2 bg-white border border-slate-200 rounded-lg text-[13px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                            {isPct && (
                                                                                <div className="text-[10px] font-bold text-slate-400 mt-1 text-right">= R$ {calcRepasseItem(it).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        <button
                                                            onClick={() => setItems([...items, { ...NEW_EXTRA_ITEM }])}
                                                            className="w-full h-9 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-1.5"
                                                        >
                                                            <Plus size={14} strokeWidth={3} /> Adicionar linha
                                                        </button>

                                                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 rounded-xl px-3.5 py-2.5 border border-blue-100/80 space-y-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-bold text-blue-700/70 uppercase tracking-wider">A Receber</span>
                                                                <span className="text-[13px] font-black text-blue-700 tracking-tight">R$ {sumReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-bold text-blue-700/70 uppercase tracking-wider">A Repassar</span>
                                                                <span className="text-[13px] font-black text-blue-700 tracking-tight">R$ {sumRepasse.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Observações / Motivo Extra</label>
                                        <input
                                            type="text"
                                            value={draftAssignment.financial.observations}
                                            onChange={(e) => setDraftAssignment({...draftAssignment, financial: {...draftAssignment.financial, observations: e.target.value}})}
                                            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Aparência */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.12)]">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><Palette size={12}/></span>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Aparência</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => setDraftAssignment({...draftAssignment, appearance: {...draftAssignment.appearance, bold: !draftAssignment.appearance.bold}})}
                                        className={`w-10 h-10 rounded-xl border text-base font-black flex items-center justify-center transition-all ${draftAssignment.appearance.bold ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        B
                                    </button>
                                    <button
                                        onClick={() => setDraftAssignment({...draftAssignment, appearance: {...draftAssignment.appearance, color: draftAssignment.appearance.color === 'red' ? 'default' : 'red'}})}
                                        className={`px-3.5 h-10 rounded-xl border font-bold text-sm flex items-center gap-2 transition-all ${draftAssignment.appearance.color === 'red' ? 'border-rose-200 bg-rose-50 text-rose-600 ring-2 ring-rose-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <span className={`w-2.5 h-2.5 rounded-full ${draftAssignment.appearance.color === 'red' ? 'bg-rose-500' : 'bg-rose-400'}`}></span>
                                        Vermelho
                                    </button>
                                    <button
                                        onClick={() => setDraftAssignment({...draftAssignment, appearance: {...draftAssignment.appearance, flagged: !draftAssignment.appearance.flagged}})}
                                        className={`px-3.5 h-10 rounded-xl border font-bold text-sm flex items-center gap-2 transition-all ${draftAssignment.appearance.flagged ? 'border-amber-200 bg-amber-50 text-amber-600 ring-2 ring-amber-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={draftAssignment.appearance.flagged ? 'text-amber-500' : 'text-amber-400'}><path d="M4 2v20h2v-8h14l-2.5-4.5L20 5H6V2H4z"/></svg>
                                        Sinalizar
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (draftAssignment.appearance.verified) {
                                                // Desmarcar só é permitido a quem tem a permissão (verificação é definitiva).
                                                if (canEditVerified) {
                                                    setDraftAssignment({...draftAssignment, appearance: {...draftAssignment.appearance, verified: false}});
                                                }
                                                return;
                                            }
                                            // Marcar exige confirmação — ação irreversível.
                                            setConfirmVerify(true);
                                        }}
                                        disabled={draftAssignment.appearance.verified && !canEditVerified}
                                        title={draftAssignment.appearance.verified && !canEditVerified ? 'A verificação é definitiva e não pode ser desfeita.' : undefined}
                                        className={`px-3.5 h-10 rounded-xl border font-bold text-sm flex items-center gap-2 transition-all ${draftAssignment.appearance.verified ? 'border-emerald-200 bg-emerald-50 text-emerald-600 ring-2 ring-emerald-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'} ${draftAssignment.appearance.verified && !canEditVerified ? 'cursor-not-allowed opacity-90' : ''}`}
                                    >
                                        {draftAssignment.appearance.verified && !canEditVerified
                                            ? <Lock size={14} strokeWidth={3} className="text-emerald-500"/>
                                            : <Check size={16} strokeWidth={3} className={draftAssignment.appearance.verified ? 'text-emerald-500' : 'text-emerald-400'}/>}
                                        Verificado
                                    </button>
                                </div>
                            </div>

                            </fieldset>
                        </div>

                        {/* Footer com mini-preview */}
                        <div className="px-4 py-3 border-t border-slate-200/80 bg-white flex items-center justify-between gap-3 shrink-0">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-300 shrink-0 hidden sm:block">Preview</span>
                                {/* Mesma regra da grade: vermelho vence, sinalizado pinta de laranja. */}
                                <div className={`min-w-0 flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-xl border ${previewRed ? 'border-rose-200 bg-rose-50' : previewFlagged ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                                    {getNormalizedPeriod(draftAssignment.period) === 'Noturno'
                                        ? <Moon size={11} className="text-blue-500 shrink-0" fill="currentColor" strokeWidth={0} />
                                        : <Sun size={11} className="text-amber-400 shrink-0" strokeWidth={2.5} />}
                                    <span className={`text-xs truncate ${draftAssignment.appearance.bold ? 'font-black' : 'font-bold'} ${previewRed ? 'text-rose-600' : previewFlagged ? 'text-amber-700' : 'text-slate-700'}`}>{draftAssignment.doctorName ? formatDoctorName(draftAssignment.doctorName) : 'Selecione o médico'}</span>
                                    {draftAssignment.time && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${previewRed ? 'bg-rose-100 text-rose-600' : previewFlagged ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>{draftAssignment.time}</span>}
                                    {draftAssignment.appearance.verified && <Check size={12} className="text-emerald-500 shrink-0" strokeWidth={3}/>}
                                    {draftAssignment.appearance.flagged && <span className="text-amber-500 shrink-0"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2v20h2v-8h14l-2.5-4.5L20 5H6V2H4z"/></svg></span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {/* Fora do fieldset de propósito: plantão já pago abre em
                                    somente-leitura, e é exatamente aí que este botão precisa
                                    funcionar — para mostrar o pagamento e permitir desfazê-lo. */}
                                {(hasPermission('Operacional Escala') || isEscalaAdmin)
                                    && !draftAssignment.appearance?.uncovered
                                    && draftAssignment.doctorName
                                    && !activeSlot.id.startsWith('FIXED-')
                                    && !!assignments[activeSlot.id] && (
                                    <button
                                        onClick={() => setAvistaSlot({
                                            assignmentId: activeSlot.id,
                                            doctorName: draftAssignment.doctorName,
                                            hospitalName: activeSlot.hospitalName,
                                            monthVal: activeSlot.id.substring(0, 7),
                                            displayDate: dataCompletaDoPlantao(activeSlot.id, activeSlot.date),
                                            valor: getAssignmentTotal(draftAssignment),
                                            doctorsList: doctors,
                                            avista: assignments[activeSlot.id]?.avista || null,
                                        })}
                                        title={assignments[activeSlot.id]?.avista ? 'Ver ou desfazer o pagamento deste plantão' : 'Registrar que este plantão já foi pago, fora do repasse do mês'}
                                        className={`px-3.5 py-2.5 rounded-xl border font-bold text-sm flex items-center gap-2 transition-all ${assignments[activeSlot.id]?.avista
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <Banknote size={15} className={assignments[activeSlot.id]?.avista ? 'text-emerald-600' : 'text-slate-400'} />
                                        <span className="hidden sm:inline">
                                            {assignments[activeSlot.id]?.avista
                                                ? `Já pago ${String(assignments[activeSlot.id].avista.data).slice(8, 10)}/${String(assignments[activeSlot.id].avista.data).slice(5, 7)}`
                                                : 'Já Pago'}
                                        </span>
                                    </button>
                                )}

                                <button onClick={() => setActiveSlot(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                                    {activeSlot.readOnly ? 'Fechar' : 'Cancelar'}
                                </button>
                                {!activeSlot.readOnly && (
                                <button
                                    onClick={async () => {
                                        if (activeSlot.readOnly) return;

                                        // Vaga descoberta não tem médico, então não há duplicidade
                                        // possível: salva direto, quantas forem necessárias.
                                        if (draftAssignment.appearance?.uncovered) {
                                            persistAssignment();
                                            return;
                                        }

                                        if (!draftAssignment.doctorName) return;

                                        // Guarda final contra duplicidade: além do estado local (que já tem
                                        // TODOS os meses), relê do banco os plantões deste médico, para pegar
                                        // o que outra pessoa acabou de escalar em outra sessão.
                                        setCheckingConflict(true);
                                        const remotos = await fetchDoctorShiftsFromDB(draftAssignment.doctorName);
                                        setCheckingConflict(false);

                                        const pool = { ...assignments };
                                        delete pool[activeSlot.id];
                                        const conflitos = findScheduleConflicts(
                                            pool,
                                            draftCandidate,
                                            remotos.filter(r => r.slotId !== activeSlot.id)
                                        );

                                        if (conflitos.length > 0) {
                                            const b = activeSlot.baseline;
                                            const inalterado = b
                                                && b.doctorName === draftAssignment.doctorName
                                                && b.period === draftAssignment.period
                                                && b.time === draftAssignment.time;

                                            if (inalterado) {
                                                // Conflito que já existia e não foi agravado: a edição é de
                                                // outro campo, então salva e apenas alerta.
                                                toast.error('Atenção: este plantão já estava em conflito de horário e continua assim.', { duration: 6000 });
                                            } else {
                                                setConflictReason('');
                                                setConflictBlock({ conflitos });
                                                return;
                                            }
                                        }

                                        persistAssignment();
                                    }}
                                    disabled={(!draftAssignment.doctorName && !draftAssignment.appearance?.uncovered) || checkingConflict}
                                    className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2 ${draftConflicts.length > 0 ? 'bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/25' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/25'}`}
                                >
                                    {checkingConflict
                                        ? <><Loader2 size={16} className="animate-spin" /> Conferindo…</>
                                        : draftConflicts.length > 0
                                            ? <><AlertTriangle size={16} strokeWidth={3}/> Salvar Plantão</>
                                            : <><Check size={16} strokeWidth={3}/> Salvar Plantão</>}
                                </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Navegar/Criar Mês */}
            {isMonthModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm transition-opacity animate-in fade-in" onClick={() => setIsMonthModalOpen(false)}></div>
                    <div className="bg-white/60 rounded-3xl shadow-2xl backdrop-blur-xl w-full max-w-md flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-white/40">
                        <div className="p-6 border-b border-white/40 flex items-center justify-between bg-white/60 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-16 translate-x-16 blur-2xl"></div>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 flex items-center justify-center text-indigo-600 border border-indigo-100/50 shadow-inner">
                                    <CalendarDays size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 drop-shadow-none tracking-normal leading-none mb-1.5">Gerenciar Meses</h3>
                                    <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest">Navegação e Criação</p>
                                </div>
                            </div>
                            <button onClick={() => setIsMonthModalOpen(false)} className="p-2.5 text-slate-500 hover:text-rose-500 bg-white/60 hover:bg-rose-50 rounded-xl transition-colors relative z-10">
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-8 bg-slate-50/30">
                            
                            {/* Bloco de Novo Mês */}
                            <div className="bg-white/60 border-2 border-indigo-50 rounded-2xl p-5 shadow-sm shadow-indigo-500/5 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                <label className="flex items-center gap-2 text-sm font-black text-slate-900 drop-shadow-none mb-4">
                                    <Plus size={16} className="text-indigo-500" strokeWidth={3} />
                                    Novo Mês / Acessar
                                </label>
                                
                                <div className="space-y-3">
                                    <div className="relative group">
                                        <input 
                                            type="month" 
                                            value={newMonthVal}
                                            onChange={(e) => setNewMonthVal(e.target.value)}
                                            className="w-full h-12 pl-12 pr-4 bg-white/60 border-2 border-white/40 rounded-xl text-sm font-black text-slate-700 outline-none focus:bg-white/60 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all uppercase cursor-pointer hover:border-white hover:bg-white/90"
                                        />
                                        <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-blue-500 transition-colors pointer-events-none" size={20} strokeWidth={2.5} />
                                    </div>
                                    <button 
                                        onClick={handleCreateOrGoMonth}
                                        disabled={!newMonthVal}
                                        className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl transition-all shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.35)] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                                    >
                                        <Check size={18} strokeWidth={3} />
                                        Confirmar Seleção
                                    </button>
                                </div>
                                
                                <div className="mt-4 p-3 bg-white/70 border border-indigo-100 rounded-xl flex items-start gap-3">
                                    <input 
                                        type="checkbox" 
                                        id="keepWeekdays"
                                        checked={keepWeekdays}
                                        onChange={(e) => setKeepWeekdays(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <div>
                                        <label htmlFor="keepWeekdays" className="text-xs font-black text-slate-800 cursor-pointer block mb-0.5">
                                            Manter dias da semana
                                        </label>
                                        <p className="text-[10px] font-bold text-slate-500 leading-tight">
                                            Ao selecionar esta opção, os plantões da 1ª Segunda-feira da escala modelo serão alocados na 1ª Segunda-feira do novo mês, mesmo se esta cair na 2ª semana.
                                        </p>
                                    </div>
                                </div>

                                <p className="text-[11px] font-bold text-slate-500 mt-4 leading-relaxed bg-white/60 p-2.5 rounded-lg border border-white/40">
                                    💡 Se o mês não existir, ele será criado automaticamente copiando o padrão da <span className="text-blue-600 font-black">Escala Fixa</span>.
                                </p>
                            </div>

                            {/* Lista de Meses */}
                            <div className="space-y-4">
                                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 ml-1">
                                    <Clock size={12} strokeWidth={3} />
                                    Histórico de Meses
                                </h4>
                                <div className="space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-2">
                                    {existingMonths.map(month => {
                                        const isActive = month.id === activeMonth;
                                        return (
                                            <div 
                                                key={month.id}
                                                onClick={() => {
                                                    setActiveMonth(month.id);
                                                    setIsMonthModalOpen(false);
                                                }}
                                                className={`flex items-center justify-between border-2 rounded-2xl p-3 cursor-pointer transition-all group ${isActive ? 'bg-indigo-50 border-indigo-500 shadow-sm shadow-indigo-100' : 'bg-white/60 border-white/40 hover:border-indigo-200 hover:bg-indigo-50/50 hover:shadow-sm'}`}
                                            >
                                                <div className="flex items-center gap-3.5">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isActive ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20' : 'bg-white/60 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 border border-white/40 group-hover:border-indigo-200'}`}>
                                                        <CalendarIcon size={18} strokeWidth={2.5} />
                                                    </div>
                                                    <span className={`font-black text-sm capitalize ${isActive ? 'text-indigo-900' : 'text-slate-600 group-hover:text-indigo-800 transition-colors'}`}>
                                                        {month.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isActive && <span className="text-[10px] font-black text-indigo-700 bg-white/60 border border-indigo-200/60 px-2.5 py-1 rounded-lg tracking-widest shadow-sm">ATIVO</span>}
                                                    <button
                                                        onClick={(e) => requestDeleteMonth(month, e)}
                                                        title="Excluir mês (vai para a lixeira)"
                                                        className={`p-2.5 rounded-xl transition-all border ${isActive ? 'text-rose-500 hover:text-white hover:bg-rose-500 border-rose-200 bg-white/60 shadow-sm' : 'text-slate-600 hover:text-white hover:bg-rose-500 opacity-0 group-hover:opacity-100 border-transparent hover:border-rose-500 bg-white/5'}`}
                                                    >
                                                        <Trash2 size={16} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {existingMonths.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-8 text-center bg-white/60 border border-dashed border-white/60 rounded-2xl">
                                            <CalendarIcon size={24} className="text-slate-600 mb-2" />
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nenhum mês criado</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Gerenciamento de Hospitais (padrão Cupertino; z acima da Configuração da Escala) */}
            {isHospitalsModalOpen && (
                <div className="fixed inset-0 z-[10010] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={() => !editingHospitalId && setIsHospitalsModalOpen(false)}></div>
                    <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-black/[.085] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="w-9 h-9 rounded-xl bg-black/[.04] flex items-center justify-center text-[#0071e3] shrink-0"><Building size={17} strokeWidth={2.2} /></span>
                                <div className="min-w-0">
                                    <h3 className={cup.title}>Hospitais</h3>
                                    <p className={`${cup.subtitle} mt-0.5`}>Unidades e setores</p>
                                </div>
                            </div>
                            <button onClick={() => setIsHospitalsModalOpen(false)} className="p-2 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-xl transition-colors"><X size={18} /></button>
                        </div>

                        {/* Conteúdo scrollable */}
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#f5f5f7] p-4">
                            {!editingHospitalId ? (
                                <div className={`${cup.cardFlat} overflow-hidden`}>
                                    <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-black/[.055]">
                                        <span className={cup.label}>Unidades ({hospitais.length})</span>
                                        <button onClick={handleAddHospital} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#0071e3] hover:bg-black/[.03] px-2 h-7 rounded-lg transition-colors">
                                            <Plus size={13} strokeWidth={2.4} /> Adicionar unidade
                                        </button>
                                    </div>
                                    <div className="divide-y divide-black/[.055]">
                                        {hospitais.map((hospital, idx) => (
                                            <div
                                                key={hospital.id}
                                                onClick={() => handleEditHospital(hospital)}
                                                className="group flex items-center gap-3 px-3.5 py-2.5 hover:bg-black/[.02] cursor-pointer transition-colors"
                                            >
                                                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getHospitalColorBgClass(hospital.color)}`}></div>
                                                <span className="text-[13px] font-semibold text-[#1d1d1f] truncate shrink-0">{hospital.name}</span>
                                                <span className="text-[11px] text-[#86868b] shrink-0">{hospital.sectors.length} {hospital.sectors.length === 1 ? 'turno' : 'turnos'}</span>
                                                <span className="hidden sm:block text-[11px] text-[#86868b] truncate flex-1 min-w-0">
                                                    {hospital.sectors.slice(0, 3).join(', ')}{hospital.sectors.length > 3 ? '…' : ''}
                                                </span>
                                                <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <button
                                                        onClick={(e) => handleMoveHospital(idx, 'up', e)}
                                                        disabled={idx === 0}
                                                        className="p-1.5 text-[#86868b] hover:text-[#0071e3] rounded-md hover:bg-black/[.03] disabled:opacity-30 transition-colors"
                                                        title="Mover para cima"
                                                    ><ChevronUp size={14} strokeWidth={2.4} /></button>
                                                    <button
                                                        onClick={(e) => handleMoveHospital(idx, 'down', e)}
                                                        disabled={idx === hospitais.length - 1}
                                                        className="p-1.5 text-[#86868b] hover:text-[#0071e3] rounded-md hover:bg-black/[.03] disabled:opacity-30 transition-colors"
                                                        title="Mover para baixo"
                                                    ><ChevronDown size={14} strokeWidth={2.4} /></button>
                                                    <button
                                                        onClick={(e) => handleDeleteHospital(hospital.id, e)}
                                                        className="p-1.5 text-[#86868b] hover:text-[#d70015] rounded-md hover:bg-black/[.03] transition-colors"
                                                        title="Excluir"
                                                    ><Trash2 size={14} strokeWidth={2.2} /></button>
                                                </div>
                                            </div>
                                        ))}
                                        {hospitais.length === 0 && (
                                            <div className="px-3.5 py-3.5 text-[11.5px] text-[#86868b] text-center">Nenhuma unidade cadastrada.</div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-center gap-2">
                                        <button onClick={handleCancelEditHospital} className="p-1.5 text-[#86868b] hover:text-[#0071e3] rounded-md hover:bg-black/[.03] transition-colors">
                                            <ChevronLeft size={18} strokeWidth={2.4} />
                                        </button>
                                        <h4 className={cup.title}>Editar Unidade</h4>
                                    </div>

                                    <div className={`${cup.cardFlat} overflow-hidden`}>
                                        {/* Nome */}
                                        <div className="px-3.5 py-3 border-b border-black/[.055] space-y-1.5">
                                            <label className={`${cup.label} block`}>Nome da Unidade</label>
                                            <input
                                                type="text"
                                                value={tempHospital.name}
                                                onChange={e => setTempHospital({...tempHospital, name: e.target.value})}
                                                placeholder="Ex: Hospital Central"
                                                className={`w-full ${cup.input}`}
                                            />
                                        </div>

                                        {/* Logo URL */}
                                        <div className="px-3.5 py-3 border-b border-black/[.055] space-y-1.5">
                                            <label className={`${cup.label} block`}>Link da Logo (Impressão PDF)</label>
                                            <div className="flex gap-1.5">
                                                <input
                                                    type="text"
                                                    value={tempHospital.logoUrl || ''}
                                                    onChange={e => setTempHospital({...tempHospital, logoUrl: e.target.value})}
                                                    placeholder="Ex: https://meusite.com/logo.png"
                                                    className={`flex-1 min-w-0 ${cup.input}`}
                                                />
                                                <label className={`${cup.btn} cursor-pointer shrink-0 !text-[#0071e3]`}>
                                                    {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} strokeWidth={2.2} />}
                                                    {uploadingLogo ? 'Enviando…' : 'Carregar imagem'}
                                                    <input type="file" accept="image/*" onChange={handleHospitalLogoUpload} className="hidden" disabled={uploadingLogo} />
                                                </label>
                                            </div>
                                            <p className="text-[10.5px] text-[#86868b]">Cole o link da imagem (PNG ou JPG) ou carregue um arquivo do seu computador.</p>
                                        </div>

                                        {/* Cor */}
                                        <div className="px-3.5 py-3 space-y-2">
                                            <label className={`${cup.label} flex items-center gap-1.5`}>
                                                <Palette size={12} /> Cor de Identificação
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                                {hospitalColors.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setTempHospital({...tempHospital, color: c})}
                                                        className={`w-7 h-7 rounded-full transition-all ${tempHospital.color === c ? `ring-2 ring-offset-2 ${getHospitalColorRingClass(c)} scale-110` : 'hover:scale-105'}`}
                                                    >
                                                        <div className={`w-full h-full rounded-full ${getHospitalColorBgClass(c)}`}></div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Setores */}
                                    <div className={`${cup.cardFlat} overflow-hidden`}>
                                        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-black/[.055]">
                                            <div>
                                                <span className={`${cup.label} block`}>Setores / Turnos</span>
                                                <span className="text-[10.5px] text-[#86868b]">Configure as linhas que aparecerão na grade.</span>
                                            </div>
                                            <button onClick={handleAddSectorToTemp} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#0071e3] hover:bg-black/[.03] px-2 h-7 rounded-lg transition-colors">
                                                <Plus size={13} strokeWidth={2.4} /> Adicionar
                                            </button>
                                        </div>
                                        <div className="divide-y divide-black/[.055] max-h-[300px] overflow-y-auto custom-scrollbar">
                                            {tempHospital.sectors.map((sec, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5 px-3.5 py-2 group hover:bg-black/[.02] transition-colors">
                                                    <input
                                                        type="text"
                                                        value={sec}
                                                        onChange={e => handleUpdateSectorInTemp(idx, e.target.value)}
                                                        className={`flex-1 min-w-0 ${cup.input}`}
                                                        placeholder="Nome do Setor/Turno"
                                                    />
                                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                        <button
                                                            onClick={() => handleMoveSectorTemp(idx, 'up')}
                                                            disabled={idx === 0}
                                                            className="p-1.5 text-[#86868b] hover:text-[#0071e3] rounded-md hover:bg-black/[.03] disabled:opacity-30 transition-colors"
                                                            title="Mover para cima"
                                                        ><ChevronUp size={14} strokeWidth={2.4} /></button>
                                                        <button
                                                            onClick={() => handleMoveSectorTemp(idx, 'down')}
                                                            disabled={idx === tempHospital.sectors.length - 1}
                                                            className="p-1.5 text-[#86868b] hover:text-[#0071e3] rounded-md hover:bg-black/[.03] disabled:opacity-30 transition-colors"
                                                            title="Mover para baixo"
                                                        ><ChevronDown size={14} strokeWidth={2.4} /></button>
                                                        <button
                                                            onClick={() => handleRemoveSectorFromTemp(idx)}
                                                            disabled={tempHospital.sectors.length === 1}
                                                            className="p-1.5 text-[#86868b] hover:text-[#d70015] rounded-md hover:bg-black/[.03] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            title="Remover setor"
                                                        ><Trash2 size={14} strokeWidth={2.2} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-1.5 pt-1">
                                        <button onClick={handleCancelEditHospital} className={cup.btn}>Cancelar</button>
                                        <button
                                            onClick={handleSaveTempHospital}
                                            disabled={!tempHospital.name.trim()}
                                            className={`${cup.btnPrimary} disabled:opacity-40`}
                                        >
                                            <Check size={14} strokeWidth={2.8} /> Salvar alterações
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}


            {/* Configuração da Escala — catálogo Hospital → Período → Opções de pagamento (padrão Cupertino) */}
            {isFinancialRulesModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={() => { setIsFinancialRulesModalOpen(false); setAddingPeriod(null); handleCancelEditRule(); }}></div>
                    <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-black/[.085] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="w-9 h-9 rounded-xl bg-black/[.04] flex items-center justify-center text-[#0071e3] shrink-0"><DollarSign size={17} strokeWidth={2.2} /></span>
                                <div className="min-w-0">
                                    <h3 className={cup.title}>Configuração da Escala</h3>
                                    <p className={`${cup.subtitle} mt-0.5`}>Turnos e opções de pagamento</p>
                                </div>
                            </div>
                            <button onClick={() => { setIsFinancialRulesModalOpen(false); setAddingPeriod(null); handleCancelEditRule(); }} className="p-2 text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] rounded-xl transition-colors"><X size={18} /></button>
                        </div>

                        {/* Seletor de escopo (Geral + hospitais + nova/editar unidade) */}
                        <div className="px-5 py-3 border-b border-black/[.085] shrink-0">
                            <span className={`${cup.label} mb-2 block`}>Unidade</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {[{ id: '__geral__', name: '' }, ...hospitais].map(h => {
                                    const active = configHospital === h.name;
                                    return (
                                        <button
                                            key={h.id}
                                            onClick={() => { setConfigHospital(h.name); setAddingPeriod(null); setAddingTurno(null); handleCancelEditRule(); }}
                                            className={`px-3 h-8 rounded-lg text-[11.5px] font-medium transition-colors ${active ? 'bg-[#0071e3] text-white' : 'border border-black/[.085] text-[#1d1d1f] hover:bg-black/[.03]'}`}
                                        >
                                            {h.name || 'Geral'}
                                        </button>
                                    );
                                })}
                                {configHospital && (
                                    <button
                                        onClick={() => { const cur = hospitais.find(h => h.name === configHospital); if (cur) { handleEditHospital(cur); setIsHospitalsModalOpen(true); } }}
                                        className="h-8 px-2.5 rounded-lg border border-black/[.085] text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.03] transition-colors inline-flex items-center gap-1 text-[11.5px]"
                                        title="Editar nome, cor e logo da unidade"
                                    ><Edit2 size={12} strokeWidth={2.2} /> Editar</button>
                                )}
                                <button
                                    onClick={() => { handleAddHospital(); setIsHospitalsModalOpen(true); }}
                                    className="h-8 px-2.5 rounded-lg border border-dashed border-black/[.15] text-[#0071e3] hover:bg-black/[.03] transition-colors inline-flex items-center gap-1 text-[11.5px] font-medium"
                                    title="Criar nova unidade"
                                ><Plus size={13} strokeWidth={2.4} /> Nova unidade</button>
                            </div>
                        </div>

                        {/* Cards por turno */}
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#f5f5f7] p-4 space-y-3">
                            {getTurnosForScope(configHospital).map(turno => {
                                const sectorName = turno.name;
                                const norm = getNormalizedPeriod(turno.period);
                                const isNight = norm === 'Noturno';
                                const addKey = sectorName;
                                const { own, inherited } = getRulesForTurno(configHospital, sectorName, turno.period);
                                return (
                                    <div key={sectorName} className={`${cup.cardFlat} overflow-hidden`}>
                                        {/* Cabeçalho do turno: nome + período + horário editável */}
                                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-black/[.055] group/turno">
                                            <span className="shrink-0" style={{ color: isNight ? '#5e5ce6' : '#bf7a00' }}>
                                                {isNight ? <Moon size={15} fill="currentColor" strokeWidth={0} /> : <Sun size={15} strokeWidth={2.4} />}
                                            </span>
                                            <span className="text-[13px] font-semibold text-[#1d1d1f] truncate">{sectorName}</span>
                                            {configHospital && (
                                                <select
                                                    value={norm}
                                                    onChange={(e) => handleSetTurnoPeriod(configHospital, sectorName, e.target.value)}
                                                    className="h-7 pl-2 pr-1 rounded-md border border-black/[.085] bg-white text-[11px] font-medium text-[#86868b] outline-none focus:border-[#0071e3] cursor-pointer transition-colors"
                                                    title="Período do turno"
                                                >
                                                    {PERIODOS_PADRAO.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            )}
                                            <div className="flex items-center gap-1">
                                                <Clock size={12} className="text-[#86868b]" />
                                                <input
                                                    type="text"
                                                    value={getConfiguredTime(configHospital, sectorName)}
                                                    onChange={(e) => handleSetTurnoTime(configHospital, sectorName, e.target.value)}
                                                    className="w-[74px] h-7 px-2 rounded-md border border-black/[.085] bg-white text-[11.5px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] transition-colors"
                                                    title="Horário padrão deste turno"
                                                />
                                            </div>
                                            <span className="ml-auto text-[11px] text-[#86868b]">{own.length} {own.length === 1 ? 'opção' : 'opções'}</span>
                                            {configHospital && (
                                                <button onClick={() => handleRemoveTurno(configHospital, sectorName)} className="p-1 text-[#86868b] hover:text-[#d70015] rounded-md hover:bg-black/[.03] opacity-0 group-hover/turno:opacity-100 transition-all" title="Remover turno"><Trash2 size={13} strokeWidth={2.2} /></button>
                                            )}
                                        </div>

                                        {/* Opções de pagamento */}
                                        <div className="divide-y divide-black/[.055]">
                                            {own.length === 0 && addingPeriod !== addKey && (
                                                <div className="px-3.5 py-3.5 text-[11.5px] text-[#86868b] text-center">Nenhuma opção de pagamento neste turno.</div>
                                            )}
                                            {own.map(rule => (
                                                <div key={rule.id} className="px-3.5 py-2.5 group hover:bg-black/[.02] transition-colors">
                                                    {editingRuleId === rule.id ? (
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <input
                                                                type="text"
                                                                value={tempRule.name}
                                                                onChange={e => setTempRule({ ...tempRule, name: e.target.value })}
                                                                placeholder="Ex: Sobreaviso + acionamento"
                                                                className={`flex-1 min-w-[160px] ${cup.input}`}
                                                            />
                                                            <button
                                                                onClick={() => setTempRule({ ...tempRule, category: (tempRule.category === 'Top' ? 'Padrão' : 'Top') })}
                                                                className={`h-9 px-3 rounded-lg text-[10px] font-semibold uppercase tracking-[.06em] border transition-colors ${isTopRule(tempRule) ? 'border-[#bf7a00]/40 text-[#bf7a00] bg-[#bf7a00]/[.06]' : 'border-black/[.085] text-[#86868b] hover:bg-black/[.03]'}`}
                                                                title="Marca esta opção como tabela Top"
                                                            >Top</button>
                                                            <div className="relative w-[104px]">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b] text-[11px]">R$</span>
                                                                <input
                                                                    type="number"
                                                                    value={tempRule.value}
                                                                    onChange={e => setTempRule({ ...tempRule, value: e.target.value })}
                                                                    placeholder="Valor"
                                                                    className={`w-full pl-8 ${cup.input}`}
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <button onClick={handleSaveEditRule} className="w-9 h-9 flex items-center justify-center bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg transition-colors"><Check size={15} strokeWidth={2.8} /></button>
                                                                <button onClick={handleCancelEditRule} className="w-9 h-9 flex items-center justify-center border border-black/[.085] text-[#86868b] rounded-lg hover:bg-black/[.03] transition-colors"><X size={15} strokeWidth={2.8} /></button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[12.5px] text-[#1d1d1f] truncate">{rule.name}</span>
                                                            {isTopRule(rule) && <span className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#bf7a00] border border-[#bf7a00]/30 rounded px-1 py-0.5 shrink-0">Top</span>}
                                                            <span className="ml-auto text-[12.5px] font-semibold text-[#1d1d1f] tabular-nums">R$ {parseFloat(rule.value || 0).toLocaleString('pt-BR')}</span>
                                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={() => handleEditRule(rule)} className="p-1.5 text-[#86868b] hover:text-[#0071e3] rounded-md hover:bg-black/[.03] transition-colors" title="Editar"><Edit2 size={14} strokeWidth={2.2} /></button>
                                                                <button onClick={() => handleDeleteFinancialRule(rule.id)} className="p-1.5 text-[#86868b] hover:text-[#d70015] rounded-md hover:bg-black/[.03] transition-colors" title="Remover"><Trash2 size={14} strokeWidth={2.2} /></button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {/* Regras Gerais herdadas (só neste hospital; edição fica em Geral) */}
                                            {inherited.map(rule => (
                                                <div key={rule.id} className="px-3.5 py-2.5 flex items-center gap-2">
                                                    <span className="text-[12.5px] text-[#86868b] truncate">{rule.name}</span>
                                                    <span className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#86868b] border border-black/[.12] rounded px-1 py-0.5 shrink-0">Geral</span>
                                                    <span className="ml-auto text-[12.5px] font-medium text-[#86868b] tabular-nums">R$ {parseFloat(rule.value || 0).toLocaleString('pt-BR')}</span>
                                                </div>
                                            ))}

                                            {/* Adicionar opção neste turno */}
                                            {addingPeriod === addKey ? (
                                                <div className="px-3.5 py-3 flex flex-wrap items-center gap-1.5 bg-[#0071e3]/[.04]">
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        value={ruleDraft.name}
                                                        onChange={e => setRuleDraft({ ...ruleDraft, name: e.target.value })}
                                                        placeholder="Nome da opção (ex: Sobreaviso + acionamento)"
                                                        className={`flex-1 min-w-[160px] ${cup.input}`}
                                                    />
                                                    <button
                                                        onClick={() => setRuleDraft({ ...ruleDraft, category: (ruleDraft.category === 'Top' ? 'Padrão' : 'Top') })}
                                                        className={`h-9 px-3 rounded-lg text-[10px] font-semibold uppercase tracking-[.06em] border transition-colors ${ruleDraft.category === 'Top' ? 'border-[#bf7a00]/40 text-[#bf7a00] bg-[#bf7a00]/[.06]' : 'border-black/[.085] text-[#86868b] hover:bg-black/[.03]'}`}
                                                        title="Marca esta opção como tabela Top"
                                                    >Top</button>
                                                    <div className="relative w-[104px]">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b] text-[11px]">R$</span>
                                                        <input
                                                            type="number"
                                                            value={ruleDraft.value}
                                                            onChange={e => setRuleDraft({ ...ruleDraft, value: e.target.value })}
                                                            placeholder="Valor"
                                                            className={`w-full pl-8 ${cup.input}`}
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={() => handleAddRuleOption(configHospital, sectorName, turno.period)} disabled={!ruleDraft.name || !ruleDraft.value} className="w-9 h-9 flex items-center justify-center bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg transition-colors disabled:opacity-40"><Check size={15} strokeWidth={2.8} /></button>
                                                        <button onClick={() => { setAddingPeriod(null); setRuleDraft({ name: '', value: '', category: 'Padrão' }); }} className="w-9 h-9 flex items-center justify-center border border-black/[.085] text-[#86868b] rounded-lg hover:bg-black/[.03] transition-colors"><X size={15} strokeWidth={2.8} /></button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => { handleCancelEditRule(); setRuleDraft({ name: '', value: '', category: 'Padrão' }); setAddingPeriod(addKey); }}
                                                    className="w-full px-3.5 py-2.5 flex items-center gap-1.5 text-[11.5px] font-medium text-[#0071e3] hover:bg-black/[.02] transition-colors"
                                                >
                                                    <Plus size={14} strokeWidth={2.4} /> Adicionar opção de pagamento
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Adicionar turno (só em uma unidade específica) */}
                            {configHospital && (
                                addingTurno === configHospital ? (
                                    <div className={`${cup.cardFlat} p-3.5 flex flex-wrap items-center gap-1.5 bg-[#0071e3]/[.04]`}>
                                        <input
                                            type="text"
                                            autoFocus
                                            value={turnoDraft.name}
                                            onChange={e => setTurnoDraft({ ...turnoDraft, name: e.target.value })}
                                            placeholder="Nome do turno (ex: Diurno 2, Ambulatório)"
                                            className={`flex-1 min-w-[180px] ${cup.input}`}
                                        />
                                        <select
                                            value={turnoDraft.period}
                                            onChange={e => setTurnoDraft({ ...turnoDraft, period: e.target.value })}
                                            className={cup.select}
                                            title="Período do turno"
                                        >
                                            {PERIODOS_PADRAO.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => handleAddTurno(configHospital)} disabled={!turnoDraft.name.trim()} className="w-9 h-9 flex items-center justify-center bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg transition-colors disabled:opacity-40"><Check size={15} strokeWidth={2.8} /></button>
                                            <button onClick={() => { setAddingTurno(null); setTurnoDraft({ name: '', period: 'Diurno' }); }} className="w-9 h-9 flex items-center justify-center border border-black/[.085] text-[#86868b] rounded-lg hover:bg-black/[.03] transition-colors"><X size={15} strokeWidth={2.8} /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { setAddingPeriod(null); handleCancelEditRule(); setTurnoDraft({ name: '', period: 'Diurno' }); setAddingTurno(configHospital); }}
                                        className={`${cup.cardFlat} w-full px-3.5 py-2.5 flex items-center justify-center gap-1.5 text-[11.5px] font-medium text-[#0071e3] hover:bg-black/[.02] transition-colors border-dashed`}
                                    >
                                        <Plus size={14} strokeWidth={2.4} /> Adicionar turno
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Histórico */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm transition-opacity animate-in fade-in" onClick={() => setIsHistoryModalOpen(false)}></div>
                    <div className="bg-white/60 rounded-3xl shadow-2xl backdrop-blur-xl w-full max-w-5xl h-[85vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-white/40">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-white/40 flex items-center justify-between shrink-0 bg-white/60">
                            <h2 className="text-lg font-black text-slate-900 drop-shadow-none tracking-normal">Histórico de Mudanças</h2>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-500 hover:text-slate-700 p-1 rounded-lg hover:bg-white/60 transition-colors">
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>
                        
                        {/* Filters */}
                        <div className="p-6 border-b border-white/40 bg-white/60 shrink-0">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Usuário</label>
                                    <input type="text" placeholder="Filtrar por usuário..." className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm outline-none focus:border-indigo-500 shadow-sm" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Ação</label>
                                    <select className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm outline-none focus:border-indigo-500 shadow-sm cursor-pointer">
                                        <option>Todas as ações</option>
                                        <option>Criou</option>
                                        <option>Editou</option>
                                        <option>Excluiu</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Hospital</label>
                                    <select className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm outline-none focus:border-indigo-500 shadow-sm cursor-pointer">
                                        <option>Todos os hospitais</option>
                                        {hospitais.map(h => <option key={h.id}>{h.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Médico</label>
                                    <input type="text" placeholder="Buscar médico..." className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm outline-none focus:border-indigo-500 shadow-sm" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Data Início</label>
                                    <input type="date" className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm text-slate-500 outline-none focus:border-indigo-500 shadow-sm" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 block">Data Fim</label>
                                    <input type="date" className="w-full h-10 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm text-slate-500 outline-none focus:border-indigo-500 shadow-sm" />
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-medium text-slate-500">Mostrando 4 registros</span>
                                <button className="font-bold text-indigo-600 hover:text-indigo-700">Limpar Filtros</button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/30">
                            {isLoadingHistory ? (
                                <div className="text-center py-10 text-slate-500 font-bold text-sm uppercase">Carregando histórico...</div>
                            ) : historyLogs.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 font-bold text-sm uppercase">Nenhum registro encontrado.</div>
                            ) : (
                                historyLogs.map((log) => {
                                    const date = new Date(log.timestamp);
                                    const timeStr = date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                                    
                                    let typeIcon = <Activity size={12} strokeWidth={2.5} />;
                                    let typeLabel = "Ação";
                                    let typeColor = "slate";
                                    
                                    if (log.action.includes('criado') || log.action.includes('salvo')) {
                                        typeIcon = <Plus size={12} strokeWidth={3} />;
                                        typeLabel = "Criou/Salvou";
                                        typeColor = "emerald";
                                    } else if (log.action.includes('removido') || log.action.includes('excluiu')) {
                                        typeIcon = <Trash2 size={12} strokeWidth={2.5} />;
                                        typeLabel = "Removeu";
                                        typeColor = "rose";
                                    } else if (log.action.includes('atualizado')) {
                                        typeIcon = <Edit2 size={12} strokeWidth={2.5} />;
                                        typeLabel = "Editou";
                                        typeColor = "blue";
                                    }

                                    return (
                                        <div key={log.id} className="bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-2xl p-5 shadow-sm hover:border-indigo-200 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={`flex items-center gap-1 text-[11px] font-black uppercase tracking-widest bg-${typeColor}-50 text-${typeColor}-600 px-2 py-1 rounded-md border border-${typeColor}-100`}>
                                                        {typeIcon} {typeLabel}
                                                    </span>
                                                    <span className="text-sm font-bold text-slate-700">{log.userName} <span className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">({log.userEmail})</span></span>
                                                    <span className="text-slate-600">•</span>
                                                    <span className="text-xs font-medium text-slate-500">{timeStr}</span>
                                                </div>
                                            </div>
                                            <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-2">
                                                IP: <span className="font-normal text-slate-500">{log.ip_address}</span>
                                            </div>
                                            <div>
                                                <span className={`text-xs font-bold text-${typeColor}-600 mb-1 block`}>Detalhes:</span>
                                                <div className={`bg-${typeColor}-50/50 border border-${typeColor}-100/50 rounded-lg p-3 text-xs text-slate-600 font-medium space-y-1`}>
                                                    {log.details}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmação de exclusão de mês */}
            {monthToDelete && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm animate-in fade-in" onClick={() => !isProcessingMonth && setMonthToDelete(null)}></div>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-white/40">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                    <Trash2 size={22} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Excluir mês?</h3>
                                    <p className="text-xs font-bold text-slate-500">Esta ação remove os plantões do mês.</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                Você está prestes a excluir <strong className="text-slate-900 capitalize">{monthToDelete.label}</strong> e todos os seus plantões.
                            </p>
                            <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs font-bold text-emerald-700 flex gap-2">
                                <DatabaseBackup size={16} className="shrink-0 mt-0.5" />
                                <span>Uma cópia ficará guardada na <strong>Lixeira (Cofre)</strong> e poderá ser restaurada por {TRASH_RETENTION_DAYS} dias.</span>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-6">
                                <button
                                    onClick={() => setMonthToDelete(null)}
                                    disabled={isProcessingMonth}
                                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmDeleteMonth}
                                    disabled={isProcessingMonth}
                                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-md shadow-rose-600/20 flex items-center gap-2 disabled:opacity-60"
                                >
                                    {isProcessingMonth ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                    {isProcessingMonth ? 'Excluindo...' : 'Excluir mês'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Backups (Máquina do Tempo) */}
            {isBackupModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm transition-opacity animate-in fade-in" onClick={() => setIsBackupModalOpen(false)}></div>
                    <div className="bg-white/60 rounded-3xl shadow-2xl backdrop-blur-xl w-full max-w-4xl h-[80vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-white/40">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-white/40 flex items-center justify-between shrink-0 bg-white/60">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsBackupModalOpen(false)} className="text-slate-500 hover:text-slate-700 p-1 rounded-lg hover:bg-white/60 transition-colors">
                                    <X size={24} />
                                </button>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 drop-shadow-none tracking-normal flex items-center gap-2">
                                        <DatabaseBackup size={22} className="text-rose-500" />
                                        Máquina do Tempo (Backups)
                                    </h2>
                                    <p className="text-slate-500 text-xs font-bold mt-1">Restaure a escala para um ponto anterior no tempo.</p>
                                </div>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/30">
                            {/* Lixeira de Meses (soft-delete recuperável) */}
                            {(isLoadingTrash || trashMonths.length > 0) && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                                        <Trash2 size={14} className="text-amber-500" />
                                        Lixeira de Meses
                                        <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">(recuperável por {TRASH_RETENTION_DAYS} dias)</span>
                                    </div>
                                    {isLoadingTrash ? (
                                        <div className="text-center py-4 text-slate-500 font-bold text-xs uppercase">Carregando lixeira...</div>
                                    ) : (
                                        trashMonths.map((rec) => {
                                            const d = rec.data || {};
                                            const deletedAt = d.deletedAt ? new Date(d.deletedAt) : null;
                                            const ageDays = deletedAt ? (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24) : 0;
                                            const diasRestantes = Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - ageDays));
                                            const qtd = (d.plantoes || []).length;
                                            return (
                                                <div key={rec.id} className="bg-white/70 backdrop-blur-xl border-2 border-amber-100 shadow-sm rounded-2xl p-4 flex items-center justify-between hover:border-amber-300 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 border border-amber-100">
                                                            <CalendarIcon size={24} />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-black text-slate-800 text-base capitalize">{d.monthLabel || d.monthId}</h3>
                                                            <div className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                                                                <span>Excluído por: <span className="text-slate-700">{d.deletedBy || 'Sistema'}</span></span>
                                                                <span>•</span>
                                                                <span>Plantões: <span className="text-slate-700">{qtd}</span></span>
                                                                <span>•</span>
                                                                <span className="text-amber-600">Expira em {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRestoreMonth(rec)}
                                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md shadow-emerald-600/20 shrink-0"
                                                    >
                                                        Restaurar
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div className="h-px bg-slate-200/70 my-1"></div>
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Clock size={14} className="text-rose-500" /> Pontos de Restauração
                                    </div>
                                </div>
                            )}

                            {isLoadingBackups ? (
                                <div className="text-center py-10 text-slate-500 font-bold text-sm uppercase">Carregando backups...</div>
                            ) : backupLogs.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 font-bold text-sm uppercase">Nenhum backup encontrado.</div>
                            ) : (
                                backupLogs.map((log) => {
                                    const date = new Date(log.data.timestamp);
                                    const dateStr = date.toLocaleDateString('pt-BR');
                                    const timeStr = date.toLocaleTimeString('pt-BR');
                                    const totalShifts = log.data.snapshot?.assignments ? Object.keys(log.data.snapshot.assignments).length : 0;
                                    
                                    return (
                                        <div key={log.id} className="bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-2xl p-5 shadow-sm flex items-center justify-between hover:border-rose-200 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 border border-rose-100">
                                                    <Clock size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-slate-800 text-base">{dateStr} às {timeStr}</h3>
                                                    <div className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-3">
                                                        <span>Salvo por: <span className="text-slate-700">{log.data.savedBy || 'Sistema'}</span></span>
                                                        <span>•</span>
                                                        <span>Plantões: <span className="text-slate-700">{totalShifts}</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleRestoreBackup(log)}
                                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md shadow-rose-600/20"
                                            >
                                                Restaurar
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Plantão já pago — quita um dia fora do fechamento; a folha desconta no repasse */}
            {avistaSlot && (
                <PlantaoAVistaModal
                    plantao={avistaSlot}
                    onClose={() => setAvistaSlot(null)}
                    onDone={(avista) => {
                        // Espelha no estado local o que acabou de ser gravado, para a
                        // folha de ponto e o botão refletirem sem recarregar a escala.
                        setAssignments(prev => ({
                            ...prev,
                            [avistaSlot.assignmentId]: { ...prev[avistaSlot.assignmentId], avista: avista || null },
                        }));
                        setDraftAssignment(d => ({ ...d, avista: avista || null }));
                        setAvistaSlot(null);
                    }}
                />
            )}

            {/* Repasses — folha de ponto x contas a pagar do financeiro */}
            <RepassesModal
                isOpen={isFinanceiroModalOpen}
                onClose={() => setIsFinanceiroModalOpen(false)}
                activeMonth={activeMonth}
                monthLabel={existingMonths.find(m => m.id === activeMonth)?.label || activeMonth}
                folhaPontoData={folhaPontoData}
                folhaAssinaturas={folhaAssinaturas}
                hospitais={hospitais}
                doctors={doctors}
                currentUser={currentUser}
                theme={theme}
                onNavigateMonth={handleNavigateMonth}
                hasPrevMonth={hasPrevMonth}
                hasNextMonth={hasNextMonth}
                onAssinaturasChanged={() => {
                    if (activeMonth) fetchFolhaAssinaturas(activeMonth).then(setFolhaAssinaturas).catch(() => {});
                }}
            />
            {/* Modal de Folhas de Ponto */}
            {isFolhaPontoModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity animate-in fade-in" onClick={() => setIsFolhaPontoModalOpen(false)}></div>
                    <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,.18)] w-full max-w-6xl h-[88vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-black/[.085]">
                        {/* Header */}
                        <div className="px-7 py-4 border-b border-black/[.08] flex items-center justify-between shrink-0 bg-white">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsFolhaPontoModalOpen(false)} className="text-[#86868b] hover:text-[#1d1d1f] p-2 rounded-lg hover:bg-black/[.04] transition-colors">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                                </button>
                                <div className="w-10 h-10 rounded-xl bg-black/[.04] text-[#0071e3] flex items-center justify-center shrink-0">
                                    <ClipboardList size={19} strokeWidth={2} />
                                </div>
                                <div>
                                    <h2 className="text-[17px] font-semibold tracking-[-.01em] text-[#1d1d1f] leading-tight">Folhas de Ponto</h2>
                                    {/* Navegação de mês */}
                                    <div className="flex items-center gap-0.5 mt-1 bg-black/[.04] rounded-lg p-0.5 w-fit">
                                        <button
                                            onClick={() => handleNavigateMonth('prev')}
                                            disabled={!hasPrevMonth}
                                            className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronLeft size={15} strokeWidth={2.5} />
                                        </button>
                                        <span className="px-2 text-[12.5px] font-medium text-[#1d1d1f] capitalize min-w-[130px] text-center tabular-nums">
                                            {existingMonths.find(m => m.id === activeMonth)?.label || 'Mês Atual'}
                                        </span>
                                        <button
                                            onClick={() => handleNavigateMonth('next')}
                                            disabled={!hasNextMonth}
                                            className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronRight size={15} strokeWidth={2.5} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-5">
                                <div className="text-right">
                                    <span className={`${cup.label} flex items-center justify-end gap-1.5`}>
                                        {isFolhaFiltered && <span className="px-1.5 py-0.5 rounded-full bg-black/[.05] text-[#1d1d1f] text-[9px] tracking-normal normal-case font-semibold">{folhaPontoFilter}</span>}
                                        {isFolhaFiltered ? 'Total Filtrado' : 'Total do Mês'}
                                    </span>
                                    <span className="text-[24px] leading-none font-semibold text-[#1d1d1f] tracking-[-.01em] tabular-nums block mt-1">R$ {folhaVisibleValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="h-10 w-px bg-black/[.08]"></div>
                                <div className="flex items-center gap-2">
                                    {/* Envia o que está à vista: sem filtro, o mês todo;
                                        com filtro, só aquele hospital. */}
                                    {contarEnviaveis(folhaVisibleHospitals) > 0 && (
                                        <button
                                            onClick={() => enviarFolhasEmLote(folhaVisibleHospitals, isFolhaFiltered ? folhaPontoFilter : 'todo o mês')}
                                            disabled={enviandoLote}
                                            className={`${cup.btn} !text-[#0071e3] !border-[#0071e3]/30 disabled:opacity-50`}
                                            title="Envia as folhas ainda não enviadas e atualiza as que mudaram depois do envio. Folha já assinada não é tocada."
                                        >
                                            {enviandoLote
                                                ? <Loader2 size={13} className="animate-spin" />
                                                : <FileSignature size={13} />}
                                            {contarNaoEnviadas(folhaVisibleHospitals) > 0
                                                ? `Enviar ${contarNaoEnviadas(folhaVisibleHospitals)} p/ Assinatura`
                                                : 'Enviar p/ Assinatura'}
                                        </button>
                                    )}
                                    <button onClick={() => printAllFolhasPdf(true)} className={cup.btnPrimary}>
                                        <FileText size={13} /> PDF c/ Valor
                                    </button>
                                    <button onClick={() => printAllFolhasPdf(false)} className={cup.btn}>
                                        <FileText size={13} /> PDF s/ Valor
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto px-7 py-6 flex flex-col space-y-4 bg-[#f5f5f7]">

                            {/* Alerta de Plantões Não Verificados */}
                            {folhaUnverifiedData.count > 0 ? (
                                <div className={`shrink-0 ${cup.cardFlat} overflow-hidden`}>
                                    <button
                                        onClick={() => setFolhaUnverifiedOpen(o => !o)}
                                        className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-black/[.02] transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-9 h-9 rounded-lg bg-black/[.04] text-[#bf7a00] flex items-center justify-center shrink-0">
                                                <AlertTriangle size={17} strokeWidth={2} />
                                            </div>
                                            <div>
                                                <h3 className={cup.title}>
                                                    {folhaUnverifiedData.count} {folhaUnverifiedData.count === 1 ? 'plantão não verificado' : 'plantões não verificados'}
                                                </h3>
                                                <p className={`${cup.subtitle} mt-0.5`}>
                                                    Não entram na folha enquanto não forem marcados como <span className="font-medium text-[#1d1d1f]">✓ Verificado</span> na escala.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="hidden sm:flex items-center gap-3 flex-wrap justify-end max-w-[300px]">
                                                {Object.entries(folhaUnverifiedData.byHospital).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([hosp, n]) => (
                                                    <Dot key={hosp} tone="warn">{hosp} · {n}</Dot>
                                                ))}
                                            </div>
                                            <ChevronDown size={16} className={`text-[#86868b] transition-transform ${folhaUnverifiedOpen ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>
                                    {folhaUnverifiedOpen && (
                                        <div className={`border-t ${cup.rowline} max-h-56 overflow-y-auto divide-y ${cup.rowline}`}>
                                            {folhaUnverifiedData.list.map((item) => (
                                                <div key={item.slotId} className={`px-5 py-2.5 flex items-center gap-3 ${cup.hover} transition-colors`}>
                                                    <span className="w-14 shrink-0 text-[12.5px] font-medium text-[#1d1d1f] tabular-nums">{item.date}</span>
                                                    <span className="flex items-center gap-1.5 text-[12.5px] text-[#1d1d1f] flex-1 min-w-0">
                                                        <User size={12} className="text-[#86868b] shrink-0" />
                                                        <span className="truncate">{formatDoctorName(item.doctorName)}</span>
                                                    </span>
                                                    <span className={`flex items-center gap-1.5 ${cup.subtitle} shrink-0`}>
                                                        <MapPin size={11} className="text-[#86868b]" />
                                                        {item.hospital}
                                                    </span>
                                                    {item.time && (
                                                        <span className={`flex items-center gap-1 ${cup.subtitle} shrink-0 w-20 justify-end`}>
                                                            <Clock size={11} /> {item.time}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className={`shrink-0 ${cup.cardFlat} px-5 py-3.5 flex items-center gap-3`}>
                                    <Dot tone="ok">Tudo conferido — nenhum plantão pendente de verificação neste mês.</Dot>
                                </div>
                            )}

                            {/* Barra de indicadores — volume da folha + status de assinatura, num único card compacto */}
                            <div className={`${cup.card} shrink-0 overflow-hidden`}>
                                {/* Cada coluna se dimensiona pelo próprio conteúdo (min-w-fit): o valor
                                    em reais nunca quebra em duas linhas e as contagens curtas não
                                    desperdiçam largura. A sobra é dividida entre todas. */}
                                <div className="flex flex-wrap divide-x divide-black/[.06]">
                                    <div className="flex-1 min-w-fit px-4 py-3">
                                        <span className={`${cup.label} whitespace-nowrap`}>{isFolhaFiltered ? 'Hospital' : 'Hospitais'}</span>
                                        <span className="block text-[19px] leading-none font-semibold text-[#1d1d1f] tracking-[-.01em] mt-1.5 whitespace-nowrap">{folhaVisibleHospitals.length}</span>
                                    </div>
                                    <div className="flex-1 min-w-fit px-4 py-3">
                                        <span className={`${cup.label} whitespace-nowrap`}>Folhas</span>
                                        <span className="block text-[19px] leading-none font-semibold text-[#1d1d1f] tracking-[-.01em] mt-1.5 whitespace-nowrap">{folhaVisibleDocs}</span>
                                    </div>
                                    <div className="flex-1 min-w-fit px-4 py-3">
                                        <span className={`${cup.label} whitespace-nowrap`}>Plantões</span>
                                        <span className="block text-[19px] leading-none font-semibold text-[#1d1d1f] tracking-[-.01em] mt-1.5 whitespace-nowrap">{folhaVisibleShifts}</span>
                                    </div>
                                    <div className="flex-1 min-w-fit px-4 py-3">
                                        <span className={`${cup.label} whitespace-nowrap`}>Valor Total</span>
                                        <span className={`block text-[19px] leading-none font-semibold ${cup.accent} tracking-[-.01em] tabular-nums mt-1.5 whitespace-nowrap`}>R$ {folhaVisibleValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                    </div>
                                    <div className="flex-1 min-w-fit px-4 py-3 bg-[#248a3d]/[.05]">
                                        <span className={`${cup.label} whitespace-nowrap`}>Assinadas</span>
                                        <span className="block text-[19px] leading-none font-semibold text-[#248a3d] tracking-[-.01em] mt-1.5 whitespace-nowrap">{folhaSignatureStats.assinadas}</span>
                                    </div>
                                    <div className="flex-1 min-w-fit px-4 py-3 bg-[#bf7a00]/[.05]">
                                        <span className={`${cup.label} whitespace-nowrap`}>Pendentes</span>
                                        <span className="block text-[19px] leading-none font-semibold text-[#bf7a00] tracking-[-.01em] mt-1.5 whitespace-nowrap">{folhaSignatureStats.pendentes}</span>
                                    </div>
                                    <div className="flex-1 min-w-fit px-4 py-3">
                                        <span className={`${cup.label} whitespace-nowrap`}>Não Enviadas</span>
                                        <span className="block text-[19px] leading-none font-semibold text-[#86868b] tracking-[-.01em] mt-1.5 whitespace-nowrap">{folhaSignatureStats.naoEnviadas}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Filtro de Hospital */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`${cup.label} mr-1`}>Filtrar</span>
                                <button
                                    onClick={() => setFolhaPontoFilter('all')}
                                    className={`px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors ${folhaPontoFilter === 'all' ? 'bg-[#0071e3] text-white' : 'bg-white border border-black/[.085] text-[#1d1d1f] hover:bg-black/[.03]'}`}
                                >
                                    Todos
                                </button>
                                {folhaPontoData.hospArray.map((h, i) => {
                                    const active = folhaPontoFilter === h.name;
                                    const pending = folhaUnverifiedData.byHospital[h.name] || 0;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => setFolhaPontoFilter(h.name)}
                                            className={`px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors flex items-center gap-1.5 ${active ? 'bg-[#0071e3] text-white' : 'bg-white border border-black/[.085] text-[#1d1d1f] hover:bg-black/[.03]'}`}
                                        >
                                            {h.name}
                                            {pending > 0 && <span className={`w-4 h-4 rounded-full text-[9px] font-semibold flex items-center justify-center ${active ? 'bg-white/25 text-white' : 'bg-[#bf7a00]/10 text-[#bf7a00]'}`}>{pending}</span>}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* List */}
                            <div className="space-y-3 pb-6">
                                {folhaVisibleHospitals.length === 0 && (
                                    <div className={`${cup.cardFlat} border-dashed py-14 flex flex-col items-center justify-center text-center`}>
                                        <div className="w-11 h-11 rounded-xl bg-black/[.04] text-[#86868b] flex items-center justify-center mb-3"><ClipboardList size={20} /></div>
                                        <p className={cup.title}>Nenhuma folha gerada</p>
                                        <p className={`${cup.subtitle} mt-1`}>Marque plantões como <span className="font-medium text-[#248a3d]">✓ Verificado</span> na escala para gerá-las aqui.</p>
                                    </div>
                                )}
                                {folhaVisibleHospitals.map((h, i) => {
                                    const pending = folhaUnverifiedData.byHospital[h.name] || 0;
                                    return (
                                    <div key={i} className={`${cup.card} overflow-hidden flex flex-col`}>
                                        <div className={`px-4 py-3.5 border-b ${cup.rowline} flex items-center justify-between gap-3`}>
                                            <div className="flex items-center gap-3.5">
                                                <div className="w-9 h-9 bg-black/[.04] text-[#6e6e73] rounded-lg flex items-center justify-center shrink-0">
                                                    <Building size={16} strokeWidth={2} />
                                                </div>
                                                <div>
                                                    <h3 className={`${cup.title} flex items-center gap-2`}>
                                                        {h.name}
                                                        {pending > 0 && <Dot tone="warn">{pending} pend.</Dot>}
                                                    </h3>
                                                    <p className={cup.subtitle}>{h.doctors.length} médico(s) · <span className="text-[#1d1d1f] tabular-nums">R$ {h.totalVal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {contarEnviaveis([h]) > 0 && (
                                                    <button
                                                        onClick={() => enviarFolhasEmLote([h], h.name)}
                                                        disabled={enviandoLote}
                                                        title={`Enviar para assinatura as folhas de ${h.name} que ainda não foram enviadas, e atualizar as que mudaram desde o envio. Folha já assinada não é tocada.`}
                                                        className="px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-[#0071e3] hover:bg-[#0071e3]/[.08] disabled:opacity-40 transition-colors flex items-center gap-1.5"
                                                    >
                                                        {enviandoLote ? <Loader2 size={11} className="animate-spin" /> : <FileSignature size={11} />}
                                                        {contarNaoEnviadas([h]) > 0 ? `Enviar ${contarNaoEnviadas([h])}` : 'Enviar'}
                                                    </button>
                                                )}
                                                <button onClick={() => printHospitalFolhasPdf(h, true)} className="px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors">PDF C/</button>
                                                <button onClick={() => printHospitalFolhasPdf(h, false)} className="px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors">PDF S/</button>
                                            </div>
                                        </div>

                                        <div className={`divide-y ${cup.rowline}`}>
                                            {h.doctors.map((doc, idx) => (
                                                <div key={idx} className={`px-4 py-3 flex items-center justify-between ${cup.hover} transition-colors group`}>
                                                    <div className="flex items-center gap-3.5">
                                                        <div className="w-8 h-8 rounded-full bg-black/[.04] text-[#6e6e73] flex items-center justify-center text-[11px] font-semibold shrink-0">
                                                            {doc.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-[12.5px] font-medium text-[#1d1d1f]">{formatDoctorName(doc.name)}</h4>
                                                            <p className={cup.subtitle}>
                                                                {doc.shifts.length} plantão(ões) · <span className="text-[#1d1d1f] tabular-nums">R$ {doc.totalVal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                                                {/* Com adiantamento, o total da folha não é o que será
                                                                    lançado como conta a pagar: quem envia precisa ver
                                                                    o líquido aqui, antes de clicar. */}
                                                                {doc.avistaVal > 0 && (
                                                                    <span className="text-[#248a3d]"> · − R$ {doc.avistaVal.toLocaleString('pt-BR', {minimumFractionDigits: 2})} já pago · repasse <span className="tabular-nums font-semibold">R$ {(doc.totalVal - doc.avistaVal).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-0.5">
                                                            <button onClick={() => printFolhaPdf(doc.name, h.name, doc.shifts, true, findFolhaAssinatura(doc.name, h.name))} className="w-7 h-7 rounded-md flex items-center justify-center text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors" title="Visualizar / Imprimir C/ Valor">
                                                                <DollarSign size={14} />
                                                            </button>
                                                            <button onClick={() => printFolhaPdf(doc.name, h.name, doc.shifts, false, findFolhaAssinatura(doc.name, h.name))} className="w-7 h-7 rounded-md flex items-center justify-center text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors" title="Imprimir S/ Valor">
                                                                <FileText size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="w-px h-4 bg-black/[.08]" />
                                                        {(() => {
                                                            const assinatura = findFolhaAssinatura(doc.name, h.name);
                                                            const key = `${h.name}-${doc.name}`;
                                                            if (assinatura?.status === 'assinado') {
                                                                /*
                                                                 * A folha assinada aponta para plantões que ainda
                                                                 * existem? Se algum foi excluído da escala depois da
                                                                 * assinatura, o documento assinado ficou sem lastro —
                                                                 * o PDF sai com carimbo e sem linhas, e o envio ao
                                                                 * financeiro é bloqueado pelo hash. Quem administra
                                                                 * precisa ver isso aqui, não descobrir pelo médico.
                                                                 */
                                                                const idsAtuais = new Set(doc.shifts.map(sh => sh.slotId));
                                                                const sumidos = (assinatura.assignment_ids || []).filter(id => !idsAtuais.has(id)).length;
                                                                return (
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <Dot tone="ok">Assinado</Dot>
                                                                        {sumidos > 0 && (
                                                                            <Dot tone="bad" title={`${sumidos} plantão(ões) desta folha assinada não existem mais na escala. O documento assinado não bate com o mês — cancele a assinatura e reenvie.`}>
                                                                                folha mudou
                                                                            </Dot>
                                                                        )}
                                                                        {assinatura.transaction_id && <Dot tone="accent" title="Já lançada como conta a pagar no Financeiro">no financeiro</Dot>}
                                                                        <button
                                                                            onClick={() => handleCancelSignature(doc, h.name)}
                                                                            disabled={sendingSignatureKey === key}
                                                                            className="w-6 h-6 rounded-md flex items-center justify-center text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] transition-colors disabled:opacity-50"
                                                                            title="Cancelar assinatura"
                                                                        >
                                                                            <RotateCcw size={11} />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            }
                                                            // Pendente (já enviada, aguardando o médico) fica âmbar;
                                                            // ainda não enviada fica neutra.
                                                            const isPending = assinatura?.status === 'pendente';
                                                            if (isPending) {
                                                                return (
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <button
                                                                            onClick={() => handleSendForSignature(doc, h.name)}
                                                                            disabled={sendingSignatureKey === key}
                                                                            className="disabled:opacity-50"
                                                                            title="Aguardando assinatura do médico — clique para reenviar"
                                                                        >
                                                                            <Dot tone="warn">Aguardando</Dot>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleCancelEnvio(doc, h.name)}
                                                                            disabled={sendingSignatureKey === key}
                                                                            className="w-6 h-6 rounded-md flex items-center justify-center text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] transition-colors disabled:opacity-50"
                                                                            title="Cancelar o envio"
                                                                        >
                                                                            <X size={12} />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            }
                                                            return (
                                                                <button
                                                                    onClick={() => handleSendForSignature(doc, h.name)}
                                                                    disabled={sendingSignatureKey === key}
                                                                    className="flex items-center gap-1.5 shrink-0 disabled:opacity-50 group/send"
                                                                    title="Enviar para assinatura"
                                                                >
                                                                    <span className="flex items-center gap-1.5 text-[#86868b] group-hover/send:text-[#0071e3] transition-colors">
                                                                        <FileSignature size={13} />
                                                                        <span className="text-[10.5px] font-medium">Enviar</span>
                                                                    </span>
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmação de Replicação */}
            {confirmReplicateWeek !== null && (
                <div className="fixed inset-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
                    <div className="bg-white/60 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
                            <Copy size={24} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 drop-shadow-none mb-2">Replicar Semana {confirmReplicateWeek + 1}?</h2>
                        <p className="text-slate-600 mb-6 text-sm leading-relaxed">
                            Você está prestes a copiar <strong>todos os plantões</strong> da Semana {confirmReplicateWeek + 1} para as demais semanas (preenchendo os espaços vazios).
                            Esta ação afetará todos os hospitais da Escala Fixa. Deseja continuar?
                        </p>
                        <div className="flex items-center justify-end gap-3">
                            <button 
                                onClick={() => setConfirmReplicateWeek(null)} 
                                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white/70 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => {
                                    handleCopyFixedWeekToOthers(confirmReplicateWeek);
                                    setConfirmReplicateWeek(null);
                                }} 
                                className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Check size={16} /> Confirmar Replicação
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmação de Remoção de Plantonista (popover pequeno, ancorado no botão) */}
            {confirmRemove && (
                <>
                    {/* Captura clique fora para fechar (sem escurecer a tela) */}
                    <div className="fixed inset-0 z-[10000]" onClick={() => setConfirmRemove(null)} />
                    <div
                        className="fixed z-[10001] w-60 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 animate-in fade-in zoom-in-95 duration-150"
                        style={{
                            top: Math.min(confirmRemove.y + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 150),
                            left: Math.min(Math.max(confirmRemove.x, 130), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 130),
                            transform: 'translateX(-50%)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-2 mb-3">
                            <div className="w-7 h-7 shrink-0 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                                <Trash2 size={14} />
                            </div>
                            <p className="text-xs text-slate-600 leading-snug">
                                Remover <strong className="text-slate-800">{formatDoctorName(confirmRemove.doctorName)}</strong> do plantão {confirmRemove.sector} ({confirmRemove.day?.date})?
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => setConfirmRemove(null)}
                                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    handleRemoveAssignment(confirmRemove.slotId, confirmRemove.hospital, confirmRemove.sector, confirmRemove.day);
                                    setConfirmRemove(null);
                                }}
                                className="px-2.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <Trash2 size={13} /> Remover
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Confirmação de Verificação (ação definitiva) */}
            {confirmVerify && (
                <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setConfirmVerify(false)}></div>
                    <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 animate-in zoom-in-95 duration-150">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                <AlertTriangle size={20} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-[15px] font-black text-slate-900 leading-tight">Marcar como Verificado?</h3>
                                <p className="text-[13px] text-slate-600 leading-snug mt-1.5">
                                    Você tem certeza que deseja marcar como <strong className="text-slate-800">Verificado</strong> esse plantão? Essa ação <strong className="text-amber-700">não poderá ser desfeita</strong>.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => setConfirmVerify(false)}
                                className="px-3.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setDraftAssignment(prev => ({ ...prev, appearance: { ...prev.appearance, verified: true } }));
                                    setConfirmVerify(false);
                                }}
                                className="px-3.5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-600/25"
                            >
                                <Check size={15} strokeWidth={3} /> Sim, marcar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bloqueio de duplicidade — o mesmo médico em dois lugares no mesmo horário.
                Não é um "tem certeza?": o salvamento fica barrado. Só quem tem a permissão
                "Forçar Conflito Escala" consegue seguir, e ainda precisa justificar. */}
            {conflictBlock && (
                <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in" onClick={() => setConflictBlock(null)}></div>
                    <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 animate-in zoom-in-95 duration-150">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 shrink-0 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                                <AlertTriangle size={20} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-[15px] font-black text-slate-900 leading-tight">Plantão duplicado — não é possível salvar</h3>
                                <p className="text-[13px] text-slate-600 leading-snug mt-1.5">
                                    <strong className="text-slate-800">{formatDoctorName(draftAssignment.doctorName)}</strong> já está escalado em horário que se sobrepõe a este.
                                    Um médico não pode estar em dois lugares ao mesmo tempo.
                                </p>

                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2">
                                    {conflictBlock.conflitos.map(c => (
                                        <div key={c.slotId} className="text-[12px] font-bold text-rose-800 flex items-center gap-1.5 flex-wrap">
                                            <MapPin size={11} className="shrink-0" />
                                            <span>{c.hospitalName || 'Hospital'}</span>
                                            <span className="text-rose-400">·</span>
                                            <span>{c.sectorName || c.period}</span>
                                            {c.date && c.date !== 'Padrão' && (<><span className="text-rose-400">·</span><span>{c.date}</span></>)}
                                            <span className="text-rose-400">·</span>
                                            <span>{c.time}</span>
                                        </div>
                                    ))}
                                </div>

                                {canForceConflict ? (
                                    <div className="mt-3.5">
                                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                            Motivo da exceção (obrigatório)
                                        </label>
                                        <textarea
                                            value={conflictReason}
                                            onChange={(e) => setConflictReason(e.target.value)}
                                            rows={2}
                                            placeholder="Ex.: troca já acertada, o outro plantão será removido em seguida."
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 focus:bg-white transition-all resize-none"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                                            Fica registrado no log com seu nome e gravado no plantão.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-[12px] text-slate-500 leading-snug mt-3">
                                        Remova um dos plantões para continuar. Se a duplicidade for mesmo necessária,
                                        peça a quem tem a permissão <strong className="text-slate-700">&ldquo;Escalar médico em conflito de horário&rdquo;</strong>.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-4">
                            <button
                                onClick={() => setConflictBlock(null)}
                                className="px-3.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                {canForceConflict ? 'Cancelar' : 'Entendi'}
                            </button>
                            {canForceConflict && (
                                <button
                                    onClick={() => {
                                        const motivo = conflictReason.trim();
                                        if (motivo.length < 10) return;
                                        persistAssignment({
                                            reason: motivo,
                                            by: currentUser?.name || currentUser?.email || 'Desconhecido',
                                            at: new Date().toISOString(),
                                            conflitos: conflictBlock.conflitos
                                                .map(c => `${c.hospitalName} ${c.sectorName} ${c.date} ${c.time}`)
                                                .join('; ')
                                        });
                                        setConflictBlock(null);
                                        setConflictReason('');
                                    }}
                                    disabled={conflictReason.trim().length < 10}
                                    className="px-3.5 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-600/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    <AlertTriangle size={15} strokeWidth={3} /> Escalar mesmo assim
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Escala;
