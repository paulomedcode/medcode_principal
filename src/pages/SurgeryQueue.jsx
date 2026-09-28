import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabase';
import { useUnit } from '../contexts/UnitContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import UnitPrompt from '../components/UnitPrompt';

import { logAction } from '../utils/logger';
import { aoClicarNoArquivo } from '../services/arquivos';
import { prepararArquivo, nomeSeguro, TIPOS_DOCUMENTO_AMPLO } from '../utils/arquivoUpload';

import {
    Search, Loader2, FileText, Edit, X, Save, Plus,
    CheckCircle2, Phone, Calendar, FilterX, Clock,
    User, ClipboardCheck, Stethoscope, ClipboardList,
    ShieldCheck, MessageSquare, MapPin,
    Activity, Paperclip, ArrowUp, ArrowDown,
    Trash2, Syringe, ExternalLink, RefreshCw, Printer, FileSpreadsheet, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePermission } from '../contexts/PermissionContext';
import { PacienteFormModal } from '../components/PacienteFormModal';
import ImportSurgeriesModal from '../components/ImportSurgeriesModal';
import * as XLSX from 'xlsx';
import { maskCPF, maskTelefone, maskCEP, maskCNS } from '../utils/masks';
import { SigtapAutocomplete } from '../components/SigtapAutocomplete';
import { gerarPdfAih } from '../utils/geradorPdfAih';
import ApaPrintTemplate from '../components/ApaPrintTemplate';

// Retorna a grafia canônica de um status conforme cadastrado em settings.status
// (evita divergência de maiúsc/minúsc, ex.: "Aguardando" vs "AGUARDANDO")
const canonStatus = (settings, name, fallback) =>
    (settings?.status || []).find(s => String(s).toLowerCase() === String(name).toLowerCase()) || fallback;

// --- CONFIGURAÇÕES VISUAIS ---
const STATUS_COLORS = {
    'Aguardando': 'bg-white/60 text-slate-500 border-white/60',
    'Agendado': 'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none border-blue-100',
    'Realizado': 'bg-emerald-500/20 text-emerald-600 border-emerald-100',
    'Cancelado': 'bg-rose-500/20 text-rose-500 border-rose-100',
    'Aguardando Autorização': 'bg-amber-500/20 text-amber-600 border-amber-100',
    'Mensagem Enviada': 'bg-sky-50 text-sky-600 border-sky-100'
};

const PRIORITY_COLORS = {
    'Emergência': 'bg-rose-600 text-white border-rose-700',
    'Urgência': 'bg-rose-600 text-white border-rose-700',
    'Prioritário': 'bg-orange-500 text-slate-800 border-orange-600',
    'Eletiva': 'bg-blue-600 text-white border-blue-700',
    'Prioridade': 'bg-amber-500/20 text-slate-800 border-amber-600'
};

const getStatusStyle = (status) => {
    if (!status) return 'bg-white/60 text-slate-600 border-white/60';
    const s = String(status).toLowerCase();
    if (s.includes('realizado')) return 'bg-emerald-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.4)] border-none border-emerald-300';
    if (s.includes('agendado')) return 'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none border-blue-200';
    if (s.includes('cancelado') || s.includes('suspenso')) return 'bg-rose-500/20 text-rose-600 border-rose-200';
    if (s.includes('autorização') || s.includes('autorizacao')) return 'bg-amber-500/20 text-amber-600 border-amber-200';
    return 'bg-white/60 text-slate-600 border-white/60';
};

const calculateAge = (dob) => {
    if (!dob) return '--';
    const diff = Date.now() - new Date(dob).getTime();
    const age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
    return isNaN(age) ? '--' : `${age}`;
};

// Os campos aih/apa/autorizada/opme são colunas de TEXTO. A string "false" é
// "truthy" no JS, então um campo salvo como "false" reaparecia marcado ao recarregar.
// flagOn interpreta o valor como booleano de verdade (só liga com true/"true"/1).
const flagOn = (v) => v === true || v === 'true' || v === 't' || v === 1 || v === '1';

// --- MODAL DE EDIÇÃO COM MULTI-UPLOAD E SIGTAP ---
export const EditSurgeryModal = ({ surgery, settings, pacientes = [], allSurgeries = [], onClose, onSave }) => {
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Editar Agendamentos');
    const [formData, setFormData] = useState({ ...surgery });
    const navigate = useNavigate();

    const [aihVirtual, setAihVirtual] = useState(null);
    const [apaVirtual, setApaVirtual] = useState(null);
    const [apaParaImprimir, setApaParaImprimir] = useState(null);

    const [isObsOpen, setIsObsOpen] = useState(false);
    const [motivosSuspensao, setMotivosSuspensao] = useState([]);
    const [novaObs, setNovaObs] = useState('');
    const [medicos, setMedicos] = useState([]);

    useEffect(() => {
        const fetchMotivos = async () => {
            const { data } = await supabase.from('motivos_suspensao').select('*').eq('ativo', true).order('descricao');
            if (data) setMotivosSuspensao(data);
        };
        fetchMotivos();
    }, []);

    // Carrega os cirurgiões a partir dos usuários médicos cadastrados (mesma fonte do Novo Cadastro)
    useEffect(() => {
        const fetchMedicos = async () => {
            const { data } = await supabase.from('users').select('id, name').in('role', ['Médico', 'Médico Coordenador']).eq('status', 'Ativo').order('name', { ascending: true });
            if (data) setMedicos(data);
        };
        fetchMedicos();
    }, []);

    // Efeito para buscar os objetos reais no banco quando a modal abre
    useEffect(() => {
        const fetchVirtualDocs = async () => {
            try {
                if (formData.aih && formData.cns) {
                    const { data } = await supabase.from('aihs').select('*').eq('cns', formData.cns).order('createdAt', { ascending: false }).limit(1);
                    if (data && data.length > 0) setAihVirtual(data[0]);
                }
                if (formData.apa) {
                    let queryObj = supabase.from('apas').select('*').order('dataRegistro', { ascending: false }).limit(1);
                    if (formData.pacienteId) queryObj = queryObj.eq('pacienteId', formData.pacienteId);
                    else if (formData.cpf) queryObj = queryObj.eq('cpf', formData.cpf);
                    else return;

                    const { data } = await queryObj;
                    if (data && data.length > 0) setApaVirtual(data[0]);
                }
            } catch (err) {
                console.error("Erro ao buscar docs virtuais:", err);
            }
        };
        fetchVirtualDocs();
    }, [formData.aih, formData.apa, formData.cns, formData.cpf, formData.pacienteId]);

    const handleVisualizarPdfApa = (apaObj) => {
        setApaParaImprimir(apaObj);
        setTimeout(() => {
            const tituloOriginal = document.title;
            const nomePct = apaObj?.nome || 'Paciente';
            const dataDoc = (apaObj?.dataCriacao || new Date().toLocaleDateString('pt-BR')).replace(/\//g, '-');
            document.title = `APA - ${nomePct} - ${dataDoc}`;
            window.print();
            document.title = tituloOriginal;
            setApaParaImprimir(null);
        }, 500);
    };

    // Estados de Bloqueio
    const isPacienteBloqueado = !surgery.id; // true se for um novo agendamento
    const [showModalNovoPaciente, setShowModalNovoPaciente] = useState(false);
    // Destrava se for edição OU se já tiver selecionado/digitado um nome válido
    const isLocked = isPacienteBloqueado && !formData.nomePaciente;
    const disableInputs = isLocked || !podeEditar;

    // Estados Pacientes Autocomplete
    const [searchPaciente, setSearchPaciente] = useState(surgery.nomePaciente || surgery.paciente || '');
    const [showPacientes, setShowPacientes] = useState(false);

    // --- LÓGICA DE BUSCA SIMPLIFICADA E FORÇA BRUTA ---
    // 1. Junta os pacientes oficiais com os pacientes que vieram da importação da fila
    const rawList = [
        ...pacientes,
        ...(allSurgeries || []).map(s => ({
            id: s.pacienteId || null,
            nome: s.nomePaciente || s.paciente || '',
            cpf: s.cpf || '',
            cns: s.cns || '',
            nascimento: s.nascimento || s.dataNascimento || '',
            telefone: s.telefone1 || s.telefone || '',
            municipio: s.municipio || s.cidade || ''
        }))
    ];

    // 2. Filtra pelo termo digitado e remove nomes repetidos
    const filteredPacientes = rawList.filter(p => {
        if (!searchPaciente || searchPaciente.length < 2) return false;
        const term = searchPaciente.toLowerCase();
        return (p.nome?.toLowerCase() || '').includes(term) || (p.cpf || '').includes(term);
    }).reduce((unique, item) => {
        // Evita mostrar a mesma pessoa várias vezes se ela tiver 3 cirurgias na fila
        if (item.nome && !unique.some(u => u.nome?.toLowerCase() === item.nome?.toLowerCase())) {
            unique.push(item);
        }
        return unique;
    }, []).slice(0, 10);
    // Auto-preenchimento para registros legados que vieram sem CPF
    useEffect(() => {
        if (formData.pacienteId && pacientes.length > 0) {
            const dadosPaciente = pacientes.find(p => p.id === formData.pacienteId);
            if (dadosPaciente && !formData.cpf) {
                setFormData(prev => ({
                    ...prev,
                    cpf: dadosPaciente.cpf || ''
                }));
            }
        }
    }, [formData.pacienteId, pacientes]);

    const handleSelectPaciente = async (p) => {
        setFormData(prev => ({
            ...prev,
            pacienteId: p.id,
            nomePaciente: p.nome,
            cpf: p.cpf || prev.cpf || '',
            cns: p.cns || prev.cns || '',
            nascimento: p.dataNascimento || p.nascimento || prev.nascimento || prev.dataNascimento || '',
            telefone1: p.telefone || prev.telefone1 || prev.telefone || ''
        }));
        setSearchPaciente(p.nome);
        setShowPacientes(false);

        // Carrega os documentos AIH/APA vinculados (apenas para visualização).
        // NÃO marca automaticamente os campos AIH / APA / Autorizada — esses botões
        // só devem acender quando o usuário clicar. Para importar as flags do SUS/APA
        // existe o botão manual "Sincronizar AIH/APA".
        await syncIntegrations(p.cns, p.id, p.cpf);
    };

    // Estados de Arquivo
    const [newFiles, setNewFiles] = useState([]); // Novos arquivos para subir
    const [uploading, setUploading] = useState(false); // Loading do upload
    const fileInputRef = useRef(null);

    // Normaliza arquivos existentes (Legacy vs Novo)
    // Se tiver 'arquivos' (array), usa ele. Se tiver só 'arquivoUrl' (string), transforma em array.
    const documentosCompletos = [];
    if (aihVirtual) {
        documentosCompletos.push({ id: 'virtual-aih', name: 'Guia AIH (Sistema)', isVirtual: true, type: 'AIH', obj: aihVirtual });
    }
    if (apaVirtual) {
        documentosCompletos.push({ id: 'virtual-apa', name: 'Guia APA (Sistema)', isVirtual: true, type: 'APA', obj: apaVirtual });
    }
    // `arquivoUrl` legado guardava a URL pública; hoje guarda o caminho no
    // bucket. Os dois passam por aqui e são resolvidos na hora de abrir.
    const existingFiles = formData.arquivos || (formData.arquivoUrl ? [{ name: 'Documento Principal', path: formData.arquivoUrl }] : []);
    documentosCompletos.push(...existingFiles);

    const [isSyncing, setIsSyncing] = useState(false);

    // Função central que vai ao Firebase buscar AIH e APA
    const syncIntegrations = async (cns, pacienteId, cpf) => {
        if (!cns && !pacienteId && !cpf) return {};
        let updates = {};
        try {
            // 1. Verificar AIH (Pelo CNS)
            if (cns) {
                const { data: snapAih, error: errAih } = await supabase.from('aihs').select('*').eq('cns', cns);
                if (snapAih && snapAih.length > 0) {
                    updates.aih = true;
                    setAihVirtual(snapAih[0]);
                    const aihs = snapAih;
                    const authAih = aihs.find(a => a.status === 'autorizada');
                    if (authAih) {
                        updates.autorizada = true;
                        updates.dataAutorizacao = authAih.dataAutorizacao ? authAih.dataAutorizacao.split('T')[0] : '';
                    } else {
                        updates.autorizada = false;
                    }
                }
            }
            // 2. Verificar APA (Pelo ID ou CPF)
            if (pacienteId) {
                const { data: snapApa, error: errApa } = await supabase.from('apas').select('*').eq('pacienteId', pacienteId);
                if (snapApa && snapApa.length > 0) {
                    updates.apa = true;
                    setApaVirtual(snapApa[0]);
                }
            } else if (cpf) {
                const { data: snapApaCpf, error: errApaCpf } = await supabase.from('apas').select('*').eq('cpf', cpf);
                if (snapApaCpf && snapApaCpf.length > 0) {
                    updates.apa = true;
                    setApaVirtual(snapApaCpf[0]);
                }
            }
            return updates;
        } catch (error) {
            console.error("Erro ao sincronizar integrações:", error);
            return {};
        }
    };

    // Função acionada pelo botão manual
    const handleManualSync = async () => {
        setIsSyncing(true);
        const updates = await syncIntegrations(formData.cns, formData.pacienteId, formData.cpf);
        setIsSyncing(false);
        if (Object.keys(updates).length > 0) {
            setFormData(prev => ({ ...prev, ...updates }));
            toast.success('Integração com SUS e APA atualizada!', { icon: '🪄' });
        } else {
            toast('Nenhuma AIH ou APA encontrada no histórico.', { icon: 'ℹ️' });
        }
    };

    const handleChange = (e) => {
        let { name, value, type, checked } = e.target;

        if (name === 'cpf') value = maskCPF(value);
        if (name === 'telefone1' || name === 'telefone2' || name === 'telefone') value = maskTelefone(value);
        if (name === 'cns') value = maskCNS(value);

        setFormData(prev => {
            const newData = { ...prev, [name]: type === 'checkbox' ? checked : value };

            // Lógica Reativa de Agendamento
            if (name === 'dataAgendado') {
                const finalStatuses = ['REALIZADO', 'CANCELADO', 'SUSPENSO', 'ALTA'];
                const isFinal = prev.status && finalStatuses.some(statusFinal => String(prev.status).toUpperCase().includes(statusFinal));

                if (!isFinal) {
                    if (value) {
                        if (String(prev.status || '').toUpperCase() === 'AGUARDANDO') newData.status = canonStatus(settings, 'agendado', 'Agendado');
                    } else {
                        newData.status = canonStatus(settings, 'aguardando', 'Aguardando');
                        newData.horario = '';
                        newData.sala = '';
                    }
                }
            }
            return newData;
        });
    };

    // Adiciona arquivos à lista de espera para upload
    const handleNewFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setNewFiles(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const removeNewFile = (index) => {
        setNewFiles(prev => prev.filter((_, i) => i !== index));
    };

    // Remove arquivo já salvo do state (permitindo apagar no próximo save)
    const handleRemoveExistingFile = (fileToRemove) => {
        if (!window.confirm(`Remover anexo "${fileToRemove.name || 'Documento Principal'}"?`)) return;

        setFormData(prev => {
            const newData = { ...prev };

            // Anexo novo é identificado pelo caminho no bucket; o antigo, pela
            // URL pública que ficou gravada. Comparar pelos dois faz a remoção
            // funcionar nos dois casos.
            const mesmo = (f) =>
                (fileToRemove.path && f.path === fileToRemove.path) ||
                (fileToRemove.url && f.url === fileToRemove.url);
            const chaveDe = (f) => f?.path || f?.url || '';

            // Limpeza URL isolada legado
            if (newData.arquivoUrl && chaveDe(fileToRemove) === newData.arquivoUrl) {
                newData.arquivoUrl = '';
            }

            // Limpeza do array moderno
            if (newData.arquivos && Array.isArray(newData.arquivos)) {
                newData.arquivos = newData.arquivos.filter(f => !mesmo(f));

                // Mantedor de redundancia legado (pro próximo save)
                if (newData.arquivos.length === 0) {
                    newData.arquivoUrl = '';
                } else if (!newData.arquivoUrl) {
                    newData.arquivoUrl = chaveDe(newData.arquivos[0]);
                }
            }

            return newData;
        });
    };

    // Lógica Inteligente de Salvamento
    const handleInternalSave = async (e) => {
        e.preventDefault();

        // Validação Rigorosa (Apenas campos solicitados)
        const rq = (val) => val && String(val).trim() !== '';
        const isPacienteValido = rq(formData.nomePaciente || formData.paciente) &&
            rq(formData.dataNascimento || formData.nascimento) &&
            rq(formData.telefone1 || formData.telefone);

        const isAgendamentoValido = rq(formData.procedimento) &&
            rq(formData.cirurgiao) &&
            rq(formData.especialidade) &&
            rq(formData.anestesia) &&
            rq(formData.convenio) &&
            rq(formData.status);

        if (!isPacienteValido || !isAgendamentoValido) {
            toast.error('Por favor, preencha todos os campos obrigatórios (*).');
            return;
        }

        if (formData.dataAgendado && (!rq(formData.horario) || !rq(formData.sala))) {
            toast.error('Ao definir uma Data de Agendamento, os campos Horário e Sala tornam-se obrigatórios.');
            return;
        }

        // if (isPacienteBloqueado && !formData.pacienteId) {
        //     toast.error('Selecione ou cadastre o paciente primeiro na busca acima.');
        //     return;
        // }

        setUploading(true);

        try {
            // Cadastro automático do paciente: se for um registro novo e o paciente não veio da base,
            // cria o cadastro na tabela 'pacientes' aqui mesmo (sem abrir outra tela).
            if (!surgery.id && !formData.pacienteId) {
                try {
                    const nomeNovo = (formData.nomePaciente || formData.paciente || '').trim();
                    const cpfNovo = (formData.cpf || '').trim();
                    // Evita duplicar: reaproveita paciente já existente com mesmo CPF ou mesmo nome
                    const jaExiste = (pacientes || []).find(p =>
                        (cpfNovo && String(p.cpf || '').trim() === cpfNovo) ||
                        String(p.nome || '').trim().toLowerCase() === nomeNovo.toLowerCase()
                    );
                    if (!jaExiste && nomeNovo) {
                        const novoPaciente = {
                            nome: nomeNovo,
                            cpf: formData.cpf || '',
                            cns: formData.cns || '',
                            dataNascimento: formData.nascimento || formData.dataNascimento || '',
                            telefone: formData.telefone1 || formData.telefone || '',
                            municipio: formData.municipio || formData.cidade || '',
                            createdAt: new Date().toISOString()
                        };
                        const { error: pacErr } = await supabase.from('pacientes').insert([novoPaciente]);
                        if (!pacErr) {
                            await logAction('Criação de Paciente', `Paciente cadastrado automaticamente ao inserir na fila: ${nomeNovo}`);
                            toast.success('Paciente cadastrado automaticamente.', { icon: '🆕' });
                        } else {
                            console.error('Falha ao cadastrar paciente automaticamente:', pacErr);
                        }
                    }
                } catch (errPac) {
                    console.error('Erro no cadastro automático do paciente:', errPac);
                }
            }

            let finalFilesList = [...existingFiles]; // Começa com os que já existem

            // Se houver novos arquivos, faz o upload deles agora
            if (newFiles.length > 0) {
                try {
                    // Bucket privado: guarda o CAMINHO, não a URL. Quem abre pede
                    // uma URL assinada na hora do clique (services/arquivos.js).
                    const uploadPromises = newFiles.map(async (file) => {
                        const pronto = await prepararArquivo(file, { maxMB: 15, tipos: TIPOS_DOCUMENTO_AMPLO });
                        const filePath = `cirurgias/${Date.now()}_${nomeSeguro(file.name)}`;
                        const { error } = await supabase.storage.from('documentos').upload(filePath, pronto);
                        if (error) throw error;
                        return { name: file.name, path: filePath };
                    });

                    const uploadedFilesData = await Promise.all(uploadPromises);
                    finalFilesList = [...finalFilesList, ...uploadedFilesData]; // Junta tudo
                } catch (uploadError) {
                    console.error("Erro no upload:", uploadError);
                    // prepararArquivo lança com a frase pronta (tipo ou tamanho);
                    // erro de rede/Storage cai na mensagem genérica.
                    toast.error(uploadError?.message?.includes('limite') || uploadError?.message?.includes('tipo aceito')
                        ? uploadError.message
                        : "Erro ao enviar anexo(s). Prosseguindo com o salvamento principal...");
                }
            }

            // --------------------------------------------------------
            // MAPEAMENTO REVERSO ESTRITO (De -> Para)
            // Apenas colunas que EXISTEM no banco de dados serão enviadas
            // --------------------------------------------------------
            const safePrimitiveData = {
                nomePaciente: formData.nomePaciente || formData.paciente || null,
                cpf: formData.cpf || null,
                cns: formData.cns || null,
                nascimento: formData.nascimento || formData.dataNascimento || null,
                telefone1: formData.telefone1 || formData.telefone || null,
                telefone2: formData.telefone2 || null,
                municipio: formData.municipio || formData.cidade || null,
                procedimento: formData.procedimento || null,
                cirurgiao: formData.cirurgiao || null,
                especialidade: formData.especialidade || null,
                anestesia: formData.anestesia || null,
                convenio: formData.convenio || null,
                prioridade: formData.prioridade || null,
                sala: formData.sala || null,
                dataAtendimento: formData.dataAtendimento || null,
                dataAutorizacao: formData.dataAutorizacao || null,
                dataAgendado: formData.dataAgendado || null,
                horario: formData.horario || null,
                aih: !!formData.aih,
                autorizada: !!formData.autorizada,
                apa: !!formData.apa,
                opme: !!formData.opme,
                status: formData.status || null,
                observacoes: formData.observacoes || formData.obs || null,
                arquivoUrl: finalFilesList.length > 0
                    ? (finalFilesList[0].path || finalFilesList[0].url)
                    : (formData.arquivoUrl || null),
                arquivos: finalFilesList.length > 0 ? finalFilesList : null
            };

            // LIMPEZA CORRIGIDA: Permite o envio de 'null' para conseguir "apagar" dados no banco (ex: remover data/horário)
            Object.keys(safePrimitiveData).forEach(key => {
                if (safePrimitiveData[key] === '') {
                    safePrimitiveData[key] = null; // Garante que string vazia vira null no banco
                }
                if (safePrimitiveData[key] === undefined) {
                    delete safePrimitiveData[key]; // Só deleta da requisição se for undefined
                }
            });

            await onSave(surgery.id, safePrimitiveData); // Salva no Firestore

        } catch (error) {
            console.error("Erro no salvamento final:", error);
            toast.error("Erro crítico ao salvar prontuário.");
        } finally {
            // Garante que o botão não fique preso em "Enviando" se o save falhar
            // sem fechar o modal (o pai trata o erro e não re-lança).
            setUploading(false);
        }
    };

    const handlePrintVirtual = async (fileType) => {
        const loadingId = toast.loading(`Abrindo ${fileType}...`);
        try {
            const cnsBusca = formData.cns || '';
            const idBusca = formData.pacienteId || '';
            const cpfBusca = formData.cpf || '';
            const nomeBusca = formData.nomePaciente || formData.paciente || '';

            if (fileType === 'AIH') {
                let targetObj = aihVirtual;
                if (!targetObj) {
                    let query = supabase.from('aihs').select('*').order('createdAt', { ascending: false }).limit(1);

                    // Busca em Cascata corrigida com as colunas EXATAS da tabela aihs
                    if (cnsBusca) {
                        query = query.eq('cns', cnsBusca);
                    } else if (idBusca) {
                        query = query.eq('pacienteId', idBusca);
                    } else if (cpfBusca) {
                        query = query.eq('pacienteCpf', cpfBusca); // CORRIGIDO
                    } else if (nomeBusca) {
                        query = query.eq('pacienteNome', nomeBusca); // CORRIGIDO
                    } else {
                        throw new Error('Sem dados suficientes para buscar AIH');
                    }

                    const { data, error } = await query;
                    if (error) throw error;

                    if (data && data.length > 0) {
                        targetObj = data[0];
                        setAihVirtual(data[0]);
                    }
                }

                if (targetObj) {
                    toast.dismiss(loadingId);
                    gerarPdfAih(targetObj);
                } else {
                    throw new Error('AIH não encontrada');
                }

            } else if (fileType === 'APA') {
                let targetObj = apaVirtual;
                if (!targetObj) {
                    let query = supabase.from('apas').select('*').order('dataRegistro', { ascending: false }).limit(1);

                    if (idBusca) {
                        query = query.eq('pacienteId', idBusca);
                    } else if (cpfBusca) {
                        query = query.eq('cpf', cpfBusca);
                    } else if (nomeBusca) {
                        query = query.eq('nome', nomeBusca);
                    } else {
                        throw new Error('Sem dados suficientes para buscar APA');
                    }

                    const { data, error } = await query;
                    if (error) throw error;

                    if (data && data.length > 0) {
                        targetObj = data[0];
                        setApaVirtual(data[0]);
                    }
                }

                if (targetObj) {
                    toast.dismiss(loadingId);
                    handleVisualizarPdfApa(targetObj);
                } else {
                    throw new Error('APA não encontrada');
                }
            }
        } catch (error) {
            console.error(`Erro ao buscar ${fileType}:`, error);
            toast.error(`Laudo não encontrado. Verifique se a guia foi gerada na aba do paciente.`, { id: loadingId });
        }
    };

    const inputStyle = "w-full h-10 px-3 bg-white/40 backdrop-blur-2xl border border-white/60 shadow-inner rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:bg-white/80 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400 uppercase disabled:opacity-50 disabled:cursor-not-allowed drop-shadow-sm";
    const labelStyle = "text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] ml-1 mb-1.5 block flex items-center gap-1";
    const sectionStyle = "bg-white/30 backdrop-blur-3xl p-5 rounded-2xl shadow-xl border border-white/60 relative overflow-hidden";

    return (
        <>
            {/* Fundo Escuro Isolado */}
            <div className="fixed top-16 inset-x-0 bottom-0 bg-white/40 backdrop-blur-sm backdrop-blur-sm z-[9998] print:hidden" onClick={onClose} />

            {/* Container Invisível aos Cliques */}
            <div className="fixed top-16 inset-x-0 bottom-0 z-[9999] flex items-center justify-center p-4 font-sans text-slate-800 pointer-events-none print:hidden">

                {/* A Caixa Branca (Restaura cliques) */}
                <div className="bg-gradient-to-br from-slate-50/95 to-slate-100/90 backdrop-blur-3xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] w-full max-w-6xl overflow-hidden max-h-[95vh] flex flex-col border border-white pointer-events-auto ring-1 ring-black/5">

                    <div className="px-6 py-5 border-b border-white/400 flex justify-between items-center bg-white/40 sticky top-0 z-10 backdrop-blur-2xl">
                        <div>
                            <h3 className="font-black text-xl text-slate-800 uppercase tracking-widest flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                                {surgery.id ? 'Edição de Prontuário' : 'INSERIR NA FILA'}
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 ml-5">Base unificada de procedimentos</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-rose-500/20 bg-white/60 rounded-full text-slate-600 hover:text-rose-600 shadow-sm border border-white transition-all"><X size={18} strokeWidth={3} /></button>
                    </div>

                    <form onSubmit={handleInternalSave} className="p-5 overflow-y-auto space-y-4 bg-transparent custom-scrollbar">

                        {/* 1. DADOS PESSOAIS */}
                        <div className={sectionStyle}>
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                            <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><User size={16} /> Dados Pessoais</h3>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                <div className="md:col-span-2 relative">
                                    <label className={labelStyle}>Nome Completo <span className="text-red-500 ml-1 text-xs">*</span></label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                        <input value={searchPaciente} onChange={e => { setSearchPaciente(e.target.value); setShowPacientes(true); setFormData({ ...formData, nomePaciente: e.target.value }); }} onFocus={() => setShowPacientes(true)} onBlur={() => setTimeout(() => setShowPacientes(false), 150)} placeholder="Buscar por Nome ou CPF..." className={`${inputStyle} pl-9`} disabled={!podeEditar} required />
                                    </div>
                                    {showPacientes && searchPaciente && (
                                        <div className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-xl border border-white/60 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                                            {filteredPacientes.length > 0 ? filteredPacientes.map(p => (
                                                <div key={p.id} onClick={() => handleSelectPaciente(p)} className="p-3 hover:bg-white/60 cursor-pointer border-b border-white/40 last:border-0 transition-colors">
                                                    <div className="text-xs font-bold uppercase text-slate-900 drop-shadow-none">{p.nome}</div>
                                                    <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">CPF: {p.cpf || '---'}</div>
                                                </div>
                                            )) : (
                                                <div className="p-3 bg-white/60 flex flex-col items-center text-center gap-1.5 border-t border-white/40">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase">Nenhum paciente encontrado.</span>
                                                    <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1 leading-snug"><CheckCircle2 size={13} className="shrink-0" /> Pode continuar preenchendo — o cadastro deste paciente será criado automaticamente ao salvar.</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div><label className={labelStyle}>CPF</label><input name="cpf" value={formData.cpf || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} placeholder="000.000.000-00" maxLength="14" /></div>
                                <div><label className={labelStyle}>CNS</label><input name="cns" value={formData.cns || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} maxLength="18" /></div>
                                <div><label className={labelStyle}>Nascimento <span className="text-red-500 ml-1 text-xs">*</span></label><input type="date" name="nascimento" value={formData.nascimento || formData.dataNascimento || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} required /></div>
                                <div><label className={labelStyle}>Telefone <span className="text-red-500 ml-1 text-xs">*</span></label><input name="telefone1" value={formData.telefone1 || formData.telefone || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} maxLength="15" required /></div>
                                <div><label className={labelStyle}>Tel. 2</label><input name="telefone2" value={formData.telefone2 || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} maxLength="15" /></div>
                                <div className="md:col-span-2">
                                    <label className={labelStyle}>Cidade</label>
                                    <select name="municipio" value={String(formData.municipio || formData.cidade || '').toUpperCase()} onChange={handleChange} disabled={disableInputs} className={inputStyle}>
                                        <option value="">SELECIONE...</option>
                                        {settings?.cidades?.length > 0 ? (
                                            settings.cidades.map(c => <option key={c} value={String(c).toUpperCase()}>{c}</option>)
                                        ) : (
                                            <option value="" disabled>Nenhuma cidade cadastrada</option>
                                        )}
                                    </select>
                                </div>
                                <div><label className={`${labelStyle} justify-center`}>Idade</label><div className={`bg-white/40 shadow-inner text-slate-500 border border-white/60 rounded-xl h-10 flex items-center justify-center font-bold text-xs uppercase tracking-widest ${isLocked ? 'opacity-50' : ''}`}>{calculateAge(formData.dataNascimento || formData.nascimento)} anos</div></div>
                            </div>
                        </div>

                        {/* 2. PROCEDIMENTO (SIGTAP) */}
                        <div className={`${sectionStyle} relative z-[60]`}>
                            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                            <h3 className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><Stethoscope size={16} /> Procedimento</h3>
                            <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="md:col-span-8 relative">
                                    <label className={labelStyle}>Descrição da Cirurgia (SIGTAP) <span className="text-red-500 ml-1 text-xs">*</span></label>
                                    <SigtapAutocomplete
                                        value={formData.procedimento}
                                        onSelect={(selecionado) => setFormData({ ...formData, procedimento: selecionado.nome })}
                                        className={`${inputStyle} pl-10`}
                                        disabled={disableInputs}
                                    />
                                </div>
                                <div className="md:col-span-4"><label className={labelStyle}>Cirurgião <span className="text-red-500 ml-1 text-xs">*</span></label><select name="cirurgiao" value={String(formData.cirurgiao || '').toUpperCase()} onChange={handleChange} disabled={disableInputs} className={inputStyle} required><option value="">SELECIONE...</option>{[...new Set([...medicos.map(m => m.name), ...(settings.cirurgioes || []).map(c => typeof c === 'string' ? c : c.nome)].filter(Boolean).map(n => String(n).toUpperCase()))].sort().map((nome, idx) => <option key={idx} value={nome}>{nome}</option>)}</select></div>
                                <div className="md:col-span-4"><label className={labelStyle}>Especialidade <span className="text-red-500 ml-1 text-xs">*</span></label><select name="especialidade" value={String(formData.especialidade || '').toUpperCase()} onChange={handleChange} disabled={disableInputs} className={inputStyle} required><option value="">SELECIONE...</option>{settings.especialidades?.map((esp, idx) => <option key={idx} value={String(esp).toUpperCase()}>{esp}</option>)}</select></div>
                                <div className="md:col-span-4"><label className={labelStyle}>Tipo de Anestesia <span className="text-red-500 ml-1 text-xs">*</span></label><select name="anestesia" value={String(formData.anestesia || '').toUpperCase()} onChange={handleChange} disabled={disableInputs} className={inputStyle} required><option value="">SELECIONE...</option>{settings.anestesias?.map((a, idx) => <option key={idx} value={String(a).toUpperCase()}>{a}</option>)}</select></div>
                                <div className="md:col-span-4"><label className={labelStyle}>Convênio <span className="text-red-500 ml-1 text-xs">*</span></label><select name="convenio" value={String(formData.convenio || '').toUpperCase()} onChange={handleChange} disabled={disableInputs} className={inputStyle} required><option value="">SELECIONE...</option>{settings.convenios?.map((c, idx) => <option key={idx} value={String(c).toUpperCase()}>{c}</option>)}</select></div>
                                <div className="md:col-span-4"><label className={labelStyle}>Prioridade</label><select name="prioridade" value={String(formData.prioridade || '').toUpperCase()} onChange={handleChange} disabled={disableInputs} className={inputStyle}><option value="">SELECIONE...</option>{settings.prioridades?.map((p, idx) => <option key={idx} value={String(p).toUpperCase()}>{p}</option>)}</select></div>
                            </div>
                        </div>

                        {/* 3. ADMINISTRATIVO SUS */}
                        <div className={`${sectionStyle} relative z-[40]`}>
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                            <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                                <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <ShieldCheck size={16} /> Controle Administrativo
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleManualSync}
                                    disabled={isSyncing || isLocked}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-lg border-none hover:from-indigo-600 hover:to-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                    title="Vasculhar sistema por AIHs e APAs deste paciente"
                                >
                                    <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                                    {isSyncing ? 'Buscando...' : 'Sincronizar AIH / APA'}
                                </button>
                            </div>
                            <div className={`grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div><label className={labelStyle}>Atendimento</label><input type="date" name="dataAtendimento" value={formData.dataAtendimento || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} /></div>
                                <div><label className={labelStyle}>Autorização</label><input type="date" name="dataAutorizacao" value={formData.dataAutorizacao || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} /></div>
                                <div><label className={labelStyle}>Agendamento</label><input type="date" name="dataAgendado" value={formData.dataAgendado || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} /></div>
                                <div><label className={labelStyle}>Horário {formData.dataAgendado && <span className="text-red-500 ml-1 text-xs">*</span>}</label><input type="time" name="horario" value={formData.horario || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} required={!!formData.dataAgendado} /></div>
                                <div><label className={labelStyle}>Sala {formData.dataAgendado && <span className="text-red-500 ml-1 text-xs">*</span>}</label><select name="sala" value={String(formData.sala || '').toUpperCase()} onChange={handleChange} disabled={disableInputs} className={inputStyle} required={!!formData.dataAgendado}><option value="">Selecione...</option>{settings.locais?.map(l => <option key={l} value={String(l).toUpperCase()}>{l}</option>)}</select></div>
                            </div>
                            <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                {['aih', 'autorizada', 'apa', 'opme'].map(field => (
                                    <button key={field} type="button" disabled={disableInputs} onClick={podeEditar ? () => setFormData({ ...formData, [field]: !flagOn(formData[field]) }) : undefined} className={`py-2 px-4 rounded-xl border-2 flex items-center justify-between transition-all shadow-sm ${flagOn(formData[field]) ? 'bg-indigo-50/80 border-indigo-500 text-indigo-700' : 'bg-white/40 border-white/60 text-slate-500'} ${!podeEditar ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-indigo-300'}`}><span className="text-[11px] font-black tracking-widest uppercase">{field.toUpperCase()}</span><CheckCircle2 size={16} className={flagOn(formData[field]) ? 'opacity-100 text-indigo-500' : 'opacity-30'} /></button>
                                ))}
                            </div>
                        </div>

                        {/* 4. STATUS E DOCUMENTOS (ATUALIZADO) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className={`${sectionStyle} flex flex-col justify-between ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="absolute top-0 left-0 w-1 h-full bg-rose-400"></div>
                                <h3 className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={16} /> Status e Notas</h3>
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className={labelStyle}>Status <span className="text-red-500 ml-1 text-xs">*</span></label>
                                        </div>
                                        <select name="status" value={formData.status?.toUpperCase() || ''} onChange={handleChange} disabled={disableInputs} className={inputStyle} required>
                                            <option value="">Selecione...</option>
                                            {settings.status?.map(s => <option key={s} value={s.toUpperCase()}>{s.toUpperCase()}</option>)}
                                            {!settings.status?.map(s => s.toUpperCase()).includes('NÃO INTERNOU') && <option value="NÃO INTERNOU">NÃO INTERNOU</option>}
                                        </select>
                                        
                                        {formData.status?.toUpperCase() === 'SUSPENSA' && (
                                            <div className="mt-4 p-4 bg-rose-500/20 border border-rose-200 rounded-xl animate-in fade-in slide-in-from-top-2">
                                                <label className="text-[11px] font-black text-rose-700 uppercase tracking-widest mb-2 block">Motivo da Suspensão <span className="text-red-500">*</span></label>
                                                <select 
                                                    value={formData.motivo_suspensao_id || ''} 
                                                    onChange={(e) => setFormData({...formData, motivo_suspensao_id: e.target.value})}
                                                    disabled={disableInputs}
                                                    className="w-full h-10 px-3 bg-white/60 border border-rose-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/30 uppercase"
                                                >
                                                    <option value="">SELECIONE O MOTIVO...</option>
                                                    {motivosSuspensao.map(m => (
                                                        <option key={m.id} value={m.id}>{m.descricao}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    <div className="my-6">
                                        <div 
                                            onClick={() => !disableInputs && setIsObsOpen(!isObsOpen)}
                                            className={`flex items-center justify-between p-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl transition-colors ${disableInputs ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:bg-white/70'}`}
                                        >
                                            <span className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                                📝 Observações e Evolução
                                            </span>
                                            <span className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">{isObsOpen ? 'Ocultar ▲' : 'Expandir ▼'}</span>
                                        </div>
                                        
                                        {isObsOpen && (
                                            <div className="p-4 border border-t-0 border-white/60 rounded-b-xl bg-white/60 space-y-4 animate-in fade-in slide-in-from-top-2">
                                                {(formData.observacoes || formData.obs) && (
                                                    <div className="p-3 bg-yellow-50/50 border border-yellow-100 rounded-lg text-xs font-medium text-slate-700 whitespace-pre-wrap">
                                                        {formData.observacoes || formData.obs}
                                                    </div>
                                                )}
                                                
                                                <div className="flex flex-col gap-2">
                                                    <textarea 
                                                        value={novaObs}
                                                        onChange={(e) => setNovaObs(e.target.value)}
                                                        disabled={disableInputs}
                                                        placeholder="Digite uma nova observação aqui..."
                                                        className="w-full h-20 p-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500/30 resize-none font-medium"
                                                    />
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            const dataAtual = new Date().toLocaleString('pt-BR');
                                                            const obsFormatada = `[${dataAtual}]: ${novaObs}`;
                                                            const currentObs = formData.observacoes || formData.obs;
                                                            const obsAtualizada = currentObs ? `${currentObs}\n\n${obsFormatada}` : obsFormatada;
                                                            setFormData({...formData, observacoes: obsAtualizada, obs: obsAtualizada});
                                                            setNovaObs('');
                                                        }}
                                                        disabled={!novaObs.trim() || disableInputs}
                                                        className="self-end h-8 px-4 bg-white/50 text-slate-800 text-[11px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
                                                    >
                                                        Adicionar à Ficha
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className={`${sectionStyle} flex flex-col justify-between ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="absolute top-0 left-0 w-1 h-full bg-slate-400"></div>
                                <div><h3 className="text-[11px] font-black uppercase tracking-widest mb-4 text-slate-600 flex items-center gap-2"><Paperclip size={16} /> Central de Documentos</h3></div>

                                {/* LISTA DE ARQUIVOS E GUIAS VIRTUAIS */}
                                <div className="space-y-2 mb-4 max-h-32 overflow-y-auto custom-scrollbar bg-white/60 p-2 rounded-2xl border border-white/400">
                                    {documentosCompletos.length > 0 ? documentosCompletos.map((file, idx) => (
                                        <div key={idx} className={`flex justify-between items-center p-2 rounded-xl shadow-sm backdrop-blur-md ${file.isVirtual ? 'bg-sky-50/70 border border-sky-200' : 'bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl'}`}>
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className={`p-1.5 rounded-lg ${file.isVirtual ? 'bg-sky-100' : 'bg-blue-500/20/50'}`}><FileText size={14} className={file.isVirtual ? 'text-sky-600' : 'text-blue-600'} /></div>
                                                <span className={`text-[10px] font-bold truncate max-w-[150px] ${file.isVirtual ? 'text-sky-800' : 'text-slate-700'}`}>{file.name || 'Documento Anexo'}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {file.isVirtual ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePrintVirtual(file.type)}
                                                        className="text-blue-500 hover:text-white p-1 hover:bg-blue-500/20 rounded-lg transition-colors"
                                                        title={`Visualizar / Imprimir ${file.type}`}
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                ) : (
                                                    <>
                                                        <a href={file.url} onClick={aoClicarNoArquivo(file.path || file.url, 'documentos')} className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-100/50 rounded-lg transition-colors cursor-pointer" title="Abrir Documento"><ExternalLink size={14} /></a>
                                                        {podeEditar && (
                                                            <button type="button" onClick={() => handleRemoveExistingFile(file)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg transition-colors" title="Remover Documento">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center py-4 text-[11px] text-slate-500 italic">Nenhum documento ou guia vinculada.</div>
                                    )}
                                </div>

                                {/* ÁREA DE NOVOS UPLOADS */}
                                {podeEditar && (
                                    <>
                                        <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleNewFileSelect} />

                                        {/* Botão de Adicionar */}
                                        <div onClick={() => fileInputRef.current.click()} className="p-4 border-2 border-dashed border-white/60 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-white/60 hover:border-blue-300 transition-all group backdrop-blur-md">
                                            <Paperclip size={18} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
                                            <span className="text-[10px] font-black uppercase text-slate-500 group-hover:text-blue-600 transition-colors">Anexar Mais Arquivos</span>
                                        </div>
                                    </>
                                )}

                                {/* Lista de Novos Arquivos (Pré-save) */}
                                {newFiles.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-[9px] font-black text-emerald-500 uppercase ml-1">Para enviar:</p>
                                        {newFiles.map((file, idx) => (
                                            <div key={idx} className="flex justify-between items-center bg-emerald-500/20 p-2 rounded-lg border border-emerald-100">
                                                <span className="text-[10px] font-bold text-emerald-700 truncate">{file.name}</span>
                                                <button type="button" onClick={() => removeNewFile(idx)} className="text-emerald-300 hover:text-rose-500"><X size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-white/50 backdrop-blur-3xl -mx-5 -mb-5 p-5 border-t border-white/60">
                            <button type="button" onClick={onClose} className="h-10 px-6 text-slate-500 font-bold text-[11px] uppercase hover:text-slate-700 bg-white/60 hover:bg-white/90 rounded-xl transition-all shadow-sm">{podeEditar ? 'Cancelar' : 'Fechar'}</button>
                            {podeEditar && (
                                <button type="submit" disabled={uploading} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white h-10 px-8 rounded-xl font-black text-[11px] tracking-widest uppercase shadow-lg shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-500/50 transition-all flex items-center gap-2 border border-blue-400/50">
                                    {uploading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} strokeWidth={2.5} />}
                                    {uploading ? 'Enviando...' : 'Salvar Prontuário'}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>

            <PacienteFormModal
                isOpen={showModalNovoPaciente}
                onClose={() => setShowModalNovoPaciente(false)}
                onSuccess={(novoPaciente) => {
                    setFormData(prev => ({
                        ...prev,
                        pacienteId: novoPaciente.id,
                        nomePaciente: novoPaciente.nome,
                        cpf: novoPaciente.cpf,
                        cns: novoPaciente.cns,
                        nascimento: novoPaciente.dataNascimento || novoPaciente.nascimento,
                        telefone1: novoPaciente.telefone,
                        municipio: novoPaciente.municipio
                    }));
                    setSearchPaciente(novoPaciente.nome);
                    setShowModalNovoPaciente(false);
                }}
            />

            {apaParaImprimir && createPortal(
                <div className="print-master-container">
                    <ApaPrintTemplate data={apaParaImprimir} />
                </div>,
                document.body
            )}
        </>
    );
};

// --- COMPONENTE PRINCIPAL (MANTIDO ESTRUTURA ORIGINAL) ---
const SurgeryQueue = ({ isModal = false, onCloseModal, onSelectForScheduling, slotInfo, defaultTab = 'Todas' }) => {
    const { hasPermission } = usePermission();
    const { unidadeAtual } = useUnit();
    const podeEditar = hasPermission('Editar Agendamentos');
    // activeTab removido, usando filters.status
    const [searchTerm, setSearchTerm] = useState('');
    const [surgeries, setSurgeries] = useState([]);
    const [pacientes, setPacientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({});
    const [filters, setFilters] = useState({
        status: '', prioridade: '', cirurgiao: '', especialidade: '', convenio: '', procedimento: '',
        atendInicio: '', atendFim: '', autorizInicio: '', autorizFim: '', agendInicio: '', agendFim: '',
        aih: false, autorizada: false, apa: false, opme: false
    });
    const [sortConfig, setSortConfig] = useState({ field: 'createdAt', direction: 'desc' });
    const [editingSurgery, setEditingSurgery] = useState(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [medicos, setMedicos] = useState([]);

    const location = useLocation();
    const navigate = useNavigate();

    const fetchSurgeries = async () => {
        setLoading(true);
        try {
            // Filtro por unidade:
            // - Com unidade selecionada: traz as cirurgias dela + as sem unidade (null/legado/vazio).
            // - Sem unidade selecionada (ex.: modal de consulta rápida): em vez de esconder tudo,
            //   traz as cirurgias ainda não vinculadas a nenhuma unidade (evita "salvou mas não aparece").
            const filtroUnidade = unidadeAtual
                ? `unidade.eq."${unidadeAtual}",unidade.is.null,unidade.eq.""`
                : `unidade.is.null,unidade.eq.""`;
            const { data, error } = await supabase
                .from('surgeries')
                .select('*')
                .or(filtroUnidade)
                .order('createdAt', { ascending: false })
                .limit(8000);
            
            if (error) {
                // Se a coluna ainda não existir no bd, vai dar erro. Precisamos avisar ou ignorar a query de unidade provisoriamente
                if (error.code === '42703' || error.message?.includes('does not exist')) {
                    toast.error("Por favor, crie a coluna 'unidade' na tabela surgeries!");
                    // Fallback to fetch everyone temporarily to not block the user
                    const fallback = await supabase.from('surgeries').select('*').order('createdAt', { ascending: false }).limit(8000);
                    setSurgeries(fallback.data || []);
                } else {
                    throw error;
                }
            } else {
                setSurgeries(data || []);
            }
        } catch (error) {
            console.error("Erro ao buscar fila no Supabase:", error);
            toast.error("Erro ao carregar Fila Cirúrgica.");
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch automatically
    useEffect(() => {
        fetchSurgeries();
    }, [unidadeAtual]);

    useEffect(() => {
        const fetchSettings = async () => {
            const { data } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
            if (data && data.data) setSettings(data.data);
        };
        fetchSettings();

        const fetchPacientes = async () => {
            const { data } = await supabase.from('pacientes').select('*').order('nome', { ascending: true });
            if (data) setPacientes(data);
        };
        fetchPacientes();

        const fetchMedicos = async () => {
            const { data } = await supabase.from('users').select('*').in('role', ['Médico', 'Médico Coordenador']).eq('status', 'Ativo').order('name', { ascending: true });
            if (data) setMedicos(data);
        };
        fetchMedicos();

        const subscription = supabase
            .channel('custom-surgeries-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'surgeries' },
                (payload) => {
                    console.log('Mudança detectada na Fila:', payload);
                    if (payload.eventType === 'INSERT') {
                        if (payload.new && payload.new.unidade !== unidadeAtual) return;
                        setSurgeries(prev => {
                            if (prev.some(s => s.id === payload.new.id)) return prev;
                            return [payload.new, ...prev];
                        });
                    } else if (payload.eventType === 'UPDATE') {
                        setSurgeries(prev => prev.map(s => s.id === payload.new.id ? payload.new : s));
                    } else if (payload.eventType === 'DELETE') {
                        setSurgeries(prev => prev.filter(s => s.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
        // unidadeAtual nas deps: recria o canal realtime ao trocar de unidade,
        // evitando filtrar INSERTs pela unidade antiga (closure stale).
    }, [unidadeAtual]);

    useEffect(() => {
        // Verifica se há editId (antigo) ou editCirurgiaId (novo padrão)
        const targetId = location.state?.editCirurgiaId || location.state?.editId;

        if (targetId && surgeries.length > 0) {
            const targetSurgery = surgeries.find(s => s.id === targetId);
            if (targetSurgery) {
                setEditingSurgery(targetSurgery);
                // Limpeza crítica do state para impedir reabertura infinita no refresh
                navigate(location.pathname, { replace: true, state: {} });
            }
        }
    }, [location.state, surgeries, navigate, location.pathname]);

    const handleUpdate = async (id, data) => {
        try {
            const dataToSave = { ...data };

            // Normaliza os flags de texto: salva true de verdade ou null (nunca "false",
            // que voltaria a aparecer marcado por ser string não-vazia).
            ['aih', 'apa', 'autorizada', 'opme'].forEach(f => {
                if (f in dataToSave) dataToSave[f] = flagOn(dataToSave[f]) ? true : null;
            });

            if (id) {
                // Tenta atualizar
                let { error } = await supabase.from('surgeries').update(dataToSave).eq('id', id);
                
                // Fallback resiliente: se a coluna 'arquivoUrl' ou 'arquivos' não existir no BD
                if (error && error.code === 'PGRST204' && (error.message.includes('arquivoUrl') || error.message.includes('arquivos'))) {
                    console.warn("Retentando atualização sem campos de arquivos (Colunas ausentes)...");
                    delete dataToSave.arquivoUrl;
                    delete dataToSave.arquivos;
                    const fallback = await supabase.from('surgeries').update(dataToSave).eq('id', id);
                    if (fallback.error) throw fallback.error;
                } else if (error) {
                    throw error;
                }

                // Busca o nome do paciente cruzando com o estado atual para o Log
                const target = surgeries.find(s => s.id === id) || { paciente: 'Desconhecido' };
                const patName = target.nomePaciente || target.paciente || dataToSave.nomePaciente || dataToSave.paciente || 'Desconhecido';

                // Cria um resumo das alterações para o Log
                const alteracoes = Object.entries(dataToSave).map(([key, val]) => `${key}: ${val === null ? 'Vazio' : val}`).join(' | ');
                await logAction('Edição de Prontuário', `Paciente: ${patName} -> Alterações: [ ${alteracoes} ]`);

                setSurgeries(prev => prev.map(s => s.id === id ? { ...s, ...dataToSave } : s));
                toast.success('Prontuário atualizado com sucesso!');
            } else {
                // Se for Inserção de Novo Paciente
                let payloadData = { ...dataToSave, unidade: unidadeAtual };
                // Regra: toda cirurgia nova entra como "Aguardando" (salvo se já tiver data de agendamento)
                if (!payloadData.dataAgendado) {
                    payloadData.status = canonStatus(settings, 'aguardando', 'Aguardando');
                }
                let { error } = await supabase.from('surgeries').insert([payloadData]);

                // Fallback resiliente
                if (error && error.code === 'PGRST204' && (error.message.includes('arquivoUrl') || error.message.includes('arquivos'))) {
                    console.warn("Retentando inserção sem campos de arquivos (Colunas ausentes)...");
                    delete payloadData.arquivoUrl;
                    delete payloadData.arquivos;
                    const fallback = await supabase.from('surgeries').insert([payloadData]);
                    if (fallback.error) throw fallback.error;
                } else if (error) {
                    throw error;
                }

                const patName = payloadData.nomePaciente || payloadData.paciente || 'Desconhecido';
                await logAction('Novo Paciente na Fila', `Paciente: ${patName} foi inserido no sistema.`);

                toast.success('Novo prontuário criado!');
                // Auto reload para puxar o ID
                setTimeout(() => window.location.reload(), 1500);
            }
            setEditingSurgery(null);
        } catch (error) {
            console.error(error);
            toast.error(`Erro ao salvar: ${error.message || ''}`);
        }
    };

    const handleQuickUpdate = async (surgery, field, newValue) => {
        let updateData = { [field]: newValue };

        // Se preencheu data, avança para Agendado (respeitando o case do settings)
        if (field === 'dataAgendado') {
            const finalStatuses = ['REALIZADO', 'CANCELADO', 'SUSPENSO', 'ALTA'];
            const isFinal = surgery.status && finalStatuses.some(statusFinal => String(surgery.status).toUpperCase().includes(statusFinal));

            if (!isFinal) {
                const statusAgendado = settings.status?.find(s => s.toLowerCase() === 'agendado') || 'Agendado';
                const statusAguardando = settings.status?.find(s => s.toLowerCase() === 'aguardando') || 'Aguardando';
                updateData.status = newValue ? statusAgendado : statusAguardando;
            }
        }

        // Optimistic Update: Atualiza estado local ANTES da chamada
        setSurgeries(prev => prev.map(s => s.id === surgery.id ? { ...s, ...updateData } : s));

        try {
            const { error } = await supabase.from('surgeries').update(updateData).eq('id', surgery.id);
            if (error) throw error;

            // LOG RICO E DETALHADO
            const patName = surgery.nomePaciente || surgery.paciente || 'Desconhecido';
            let detalheAcao = '';

            if (field === 'status') detalheAcao = `Mudou Status para: ${newValue}`;
            else if (field === 'dataAgendado') detalheAcao = `Reagendou data para: ${newValue || 'Sem Data'}`;
            else if (field === 'observacoes') detalheAcao = `Atualizou Observações para: ${newValue || 'Vazio'}`;
            else detalheAcao = `Alterou [${field}] para [${newValue}]`;

            await logAction('Atualização Rápida', `Paciente: ${patName} | ${detalheAcao}`);

            toast.success('Atualizado com sucesso!', { icon: '⚡', duration: 800 });
        } catch (e) {
            console.error(e);
            toast.error("Erro ao atualizar o banco de dados.");
            fetchSurgeries(); // Fallback de sincronização
        }
    };

    const handleDelete = async (surgery) => {
        if (window.confirm("ATENÇÃO: Deseja realmente excluir este registro?")) {
            // Optimistic Update: Remove localmente ANTES da chamada
            setSurgeries(prev => prev.filter(s => s.id !== surgery.id));

            try {
                const { error } = await supabase.from('surgeries').delete().eq('id', surgery.id);
                if (error) throw error;

                const patName = surgery.nomePaciente || surgery.paciente || 'Desconhecido';
                await logAction('EXCLUSÃO DE REGISTRO', `Paciente: ${patName} foi EXCLUÍDO do sistema.`);
                toast.success("Cirurgia excluída.");
            } catch (error) {
                console.error(error);
                toast.error("Erro ao excluir.");
                fetchSurgeries(); // Fallback de sincronização
            }
        }
    };

    const toggleSort = (field) => {
        setSortConfig(prev => ({
            field,
            direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const uniqueProcedures = [...new Set(surgeries.map(s => s.procedimento).filter(Boolean))].sort();

    const filteredData = surgeries.filter(item => {
        const search = searchTerm.toLowerCase();
        const pName = String(item.nomePaciente || item.paciente || "").toLowerCase();
        const cnsNum = String(item.cns || "");
        const cpfNum = String(item.cpf || "");
        const telefoneStr = String(item.telefone1 || item.telefone || "");
        const matchSearch = pName.includes(search) || cnsNum.includes(search) || cpfNum.includes(search) || telefoneStr.includes(search);
        const matchAtend = (!filters.atendInicio || (item.dataAtendimento && item.dataAtendimento >= filters.atendInicio)) && (!filters.atendFim || (item.dataAtendimento && item.dataAtendimento <= filters.atendFim));
        const matchAutoriz = (!filters.autorizInicio || (item.dataAutorizacao && item.dataAutorizacao >= filters.autorizInicio)) && (!filters.autorizFim || (item.dataAutorizacao && item.dataAutorizacao <= filters.autorizFim));
        const matchAgend = (!filters.agendInicio || (item.dataAgendado && item.dataAgendado >= filters.agendInicio)) && (!filters.agendFim || (item.dataAgendado && item.dataAgendado <= filters.agendFim));

        return matchSearch && matchAtend && matchAutoriz && matchAgend &&
            (!filters.status || String(item.status || '').toUpperCase() === filters.status) &&
            (!filters.prioridade || item.prioridade === filters.prioridade) &&
            (!filters.cirurgiao || String(item.cirurgiao || '').toUpperCase() === filters.cirurgiao) &&
            (!filters.especialidade || String(item.especialidade || '').toUpperCase() === filters.especialidade) &&
            (!filters.convenio || item.convenio === filters.convenio) &&
            (!filters.procedimento || item.procedimento === filters.procedimento) &&
            (!filters.aih || item.aih === true) &&
            (!filters.autorizada || item.autorizada === true) &&
            (!filters.apa || item.apa === true) &&
            (!filters.opme || item.opme === true);
    })
        .sort((a, b) => {
            const valA = String(a[sortConfig.field] || "").toLowerCase();
            const valB = String(b[sortConfig.field] || "").toLowerCase();
            if (sortConfig.direction === 'asc') return valA.localeCompare(valB);
            return valB.localeCompare(valA);
        });

    const handleExport = () => {
        try {
            const flag = (v) => (v === true || String(v).toLowerCase() === 'true' || norm(v) === 'sim') ? 'SIM' : 'NAO';
            const norm = (v) => String(v ?? '').trim();
            const rows = (filteredData || []).map(s => ({
                nomePaciente: norm(s.nomePaciente),
                cpf: norm(s.cpf),
                cns: norm(s.cns),
                nascimento: norm(s.nascimento),
                telefone1: norm(s.telefone1),
                telefone2: norm(s.telefone2),
                municipio: norm(s.municipio),
                procedimento: norm(s.procedimento),
                cirurgiao: norm(s.cirurgiao),
                especialidade: norm(s.especialidade),
                anestesia: norm(s.anestesia),
                convenio: norm(s.convenio),
                prioridade: norm(s.prioridade),
                sala: norm(s.sala),
                status: norm(s.status),
                dataAtendimento: norm(s.dataAtendimento),
                dataAutorizacao: norm(s.dataAutorizacao),
                dataAgendado: norm(s.dataAgendado),
                horario: norm(s.horario),
                aih: flag(s.aih),
                autorizada: flag(s.autorizada),
                apa: flag(s.apa),
                opme: flag(s.opme),
                observacoes: norm(s.observacoes),
            }));
            if (!rows.length) { toast.error('Nada para exportar com os filtros atuais.'); return; }
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Fila Cirúrgica');
            const hoje = new Date().toISOString().slice(0, 10);
            const uni = String(unidadeAtual || 'fila').replace(/[^\w]+/g, '_').toLowerCase();
            XLSX.writeFile(wb, `fila_cirurgica_${uni}_${hoje}.xlsx`);
            toast.success(`${rows.length} registro(s) exportado(s).`);
            logAction('Exportação da Fila', `${rows.length} registro(s) exportado(s) para planilha.`);
        } catch (e) {
            console.error(e);
            toast.error('Erro ao exportar a planilha.');
        }
    };

    const resetFilters = () => {
        setSearchTerm('');
        setFilters({
            status: '', prioridade: '', cirurgiao: '', especialidade: '', convenio: '', procedimento: '',
            atendInicio: '', atendFim: '', autorizInicio: '', autorizFim: '', agendInicio: '', agendFim: '',
            aih: false, autorizada: false, apa: false, opme: false
        });
    };

    const QueueContent = (
        <div className={`px-4 lg:px-6 space-y-3 pt-4 pb-16 font-sans text-slate-800 bg-slate-50/20 ${isModal ? 'min-h-0' : 'min-h-full'}`}>
            {!isModal && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-white/40">
                    <div className="flex items-center gap-3">
                        <ClipboardList size={28} className="text-blue-600" />
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 drop-shadow-none tracking-normal">Fila Cirúrgica</h1>
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Gestão de Espera</div>
                        </div>
                    </div>
                </div>
            )}

            {/* UPPER SPACE FREED */}

            <div className="bg-white/60 backdrop-blur-2xl p-3 rounded-2xl shadow-lg shadow-slate-200/50 border border-white space-y-3">
                <div className="flex flex-wrap md:flex-nowrap gap-2 items-center">
                    <div className="relative w-full md:flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input type="text" placeholder="Pesquisar paciente ou procedimento..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-10 pl-9 pr-4 bg-white/80 border border-white shadow-sm rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-bold text-[11px] uppercase text-slate-700 placeholder:normal-case placeholder:text-slate-400 transition-all" />
                    </div>
                    
                    <select value={filters.status?.toUpperCase() || ''} onChange={e => setFilters({ ...filters, status: e.target.value })} className="h-10 px-3 bg-white/80 border border-white shadow-sm rounded-xl text-[10px] text-slate-700 font-black uppercase outline-none focus:border-blue-400 w-full md:w-40 shrink-0">
                        <option value="">Status: Todos</option>
                        {settings.status?.map(s => <option key={s} value={s.toUpperCase()}>{s.toUpperCase()}</option>)}
                    </select>

                    <select value={filters.cirurgiao} onChange={e => setFilters({ ...filters, cirurgiao: e.target.value })} className="h-10 px-3 bg-white/80 border border-white shadow-sm rounded-xl text-[10px] text-slate-700 font-black uppercase outline-none focus:border-blue-400 w-full md:w-56 shrink-0">
                        <option value="">Cirurgião: Todos</option>
                        {medicos.map((m) => <option key={m.id} value={String(m.name).toUpperCase()}>{m.name}</option>)}
                    </select>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0 justify-end">
                        <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className={`h-10 px-4 rounded-xl transition-all flex items-center gap-2 font-black text-[10px] uppercase border shadow-sm ${showAdvancedFilters ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-white border-white text-slate-600 hover:bg-slate-50'}`}>
                            <FilterX size={14} /> Filtros
                        </button>
                        <button onClick={resetFilters} className="h-10 px-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all flex items-center gap-1.5 font-black text-[10px] uppercase border border-white bg-white shadow-sm"><X size={14} /> Limpar</button>

                        <button onClick={handleExport} className="h-10 px-4 rounded-xl transition-all flex items-center gap-2 font-black text-[10px] uppercase border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm">
                            <Download size={14} /> Exportar
                        </button>

                        {hasPermission('Criar Agendamentos') && (
                            <button onClick={() => setShowImport(true)} className="h-10 px-4 rounded-xl transition-all flex items-center gap-2 font-black text-[10px] uppercase border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm">
                                <FileSpreadsheet size={14} /> Importar
                            </button>
                        )}

                        {hasPermission('Criar Agendamentos') && (
                            <button onClick={() => setEditingSurgery({
                                nomePaciente: '',
                                status: canonStatus(settings, 'aguardando', 'Aguardando'),
                                prioridade: 'ELETIVA',
                                convenio: settings.convenios?.[0] || 'SUS',
                                municipio: settings.cidades?.[0] || ''
                            })} className="h-10 px-5 bg-blue-600 text-white hover:bg-blue-700 border-none rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-2 shadow-[0_4px_15px_rgba(59,130,246,0.3)]">
                                <Plus size={14} /> Novo Paciente
                            </button>
                        )}
                    </div>
                </div>
                
                {showAdvancedFilters && (
                    <div className="animate-in fade-in slide-in-from-top-2 pt-3 border-t border-slate-200/60 space-y-3">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            <select value={filters.procedimento} onChange={e => setFilters({ ...filters, procedimento: e.target.value })} className="h-9 px-3 bg-white/70 border border-white shadow-sm rounded-lg text-[10px] text-slate-700 font-black uppercase outline-none focus:border-blue-400"><option value="">Cirurgia: Todas</option>{uniqueProcedures.map(p => <option key={p} value={p}>{p}</option>)}</select>
                            <select value={filters.especialidade} onChange={e => setFilters({ ...filters, especialidade: e.target.value })} className="h-9 px-3 bg-white/70 border border-white shadow-sm rounded-lg text-[10px] text-slate-700 font-black uppercase outline-none focus:border-blue-400"><option value="">Especialidade: Todas</option>{settings.especialidades?.map(e => <option key={e} value={String(e).toUpperCase()}>{e}</option>)}</select>
                            <select value={filters.convenio} onChange={e => setFilters({ ...filters, convenio: e.target.value })} className="h-9 px-3 bg-white/70 border border-white shadow-sm rounded-lg text-[10px] text-slate-700 font-black uppercase outline-none focus:border-blue-400"><option value="">Convênio: Todos</option>{settings.convenios?.map(c => <option key={c} value={c}>{c}</option>)}</select>
                            <select value={filters.prioridade} onChange={e => setFilters({ ...filters, prioridade: e.target.value })} className="h-9 px-3 bg-white/70 border border-white shadow-sm rounded-lg text-[10px] text-slate-700 font-black uppercase outline-none focus:border-blue-400"><option value="">Classificação: Todas</option>{settings.prioridades?.map(p => <option key={p} value={p}>{p}</option>)}</select>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {['atend', 'autoriz', 'agend'].map((type) => (
                                <div key={type} className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-slate-500 uppercase pl-1">{type === 'atend' ? 'Atendimento' : type === 'autoriz' ? 'Autorização' : 'Agendamento'}</span>
                                    <div className="flex items-center bg-white/60 rounded-lg p-1 gap-1 border border-white/60 shadow-sm h-8">
                                        <input type="date" value={filters[`${type}Inicio`]} onChange={e => setFilters({ ...filters, [`${type}Inicio`]: e.target.value })} className="bg-transparent text-[10px] font-black text-slate-700 outline-none flex-1 text-center w-full" />
                                        <span className="text-slate-400">➜</span>
                                        <input type="date" value={filters[`${type}Fim`]} onChange={e => setFilters({ ...filters, [`${type}Fim`]: e.target.value })} className="bg-transparent text-[10px] font-black text-slate-700 outline-none flex-1 text-center w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                            {['aih', 'autorizada', 'apa', 'opme'].map(f => (
                                <label key={f} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[9px] font-black uppercase cursor-pointer transition-all shadow-sm ${filters[f] ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/60 border-white/60 text-slate-500 hover:bg-slate-50'}`}><input type="checkbox" className="hidden" checked={filters[f]} onChange={e => setFilters({ ...filters, [f]: e.target.checked })} /> {f}</label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white/60 backdrop-blur-lg rounded-2xl shadow-sm backdrop-blur-md border border-white/60 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] divide-y divide-slate-100">
                        <thead className="bg-slate-50/80">
                            <tr className="text-left text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/60">
                                <th className="py-3 px-4 w-[22%] cursor-pointer hover:text-blue-600 transition-colors" onClick={() => toggleSort('nomePaciente')}>Dados do Paciente {sortConfig.field === 'nomePaciente' && (sortConfig.direction === 'asc' ? <ArrowUp size={11} className="inline ml-1" /> : <ArrowDown size={11} className="inline ml-1" />)}</th>
                                <th className="py-3 px-4 w-[22%]">Procedimento / Cirurgião</th>
                                <th className="py-3 px-4 w-[28%] cursor-pointer hover:text-blue-600 transition-colors" onClick={() => toggleSort('dataAutorizacao')}>Datas e Observações {sortConfig.field === 'dataAutorizacao' && (sortConfig.direction === 'asc' ? <ArrowUp size={11} className="inline ml-1" /> : <ArrowDown size={11} className="inline ml-1" />)}</th>
                                <th className="py-3 px-4 w-[18%]">Status / Agendamento</th>
                                <th className="py-3 px-4 w-[10%] text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="5" className="py-24 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={40} /></td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map(item => {
                                    const statusUpper = String(item.status || '').toUpperCase();
                                    const isFinalized = statusUpper.includes('REALIZADO') || statusUpper.includes('CANCELADO') || statusUpper.includes('DESISTIU') || statusUpper.includes('ALTA') || statusUpper.includes('NÃO INTERNOU');
                                    const needsReschedule = statusUpper.includes('SUSPENS') || statusUpper.includes('REAGENDAR');
                                    const isUnavailable = isFinalized || (item.dataAgendado && !needsReschedule);

                                    return (
                                    <tr key={item.id} className="hover:bg-blue-500/20/20 transition-all group border-b last:border-none">
                                        <td className="px-4 py-3 align-top">
                                            <div className="text-[12px] font-black text-slate-800 uppercase tracking-widest leading-tight" title={item.nomePaciente || item.paciente}>{item.nomePaciente || item.paciente}</div>
                                            <div className="text-[10px] font-bold text-slate-500 mt-1.5 space-y-1">
                                                <div className="flex items-center gap-1.5 font-black text-blue-500"><ClipboardCheck size={11} className="text-blue-400" /> {item.cns?.replace(/[^\d]/g, '') || '--- CNS NÃO INF. ---'}</div>
                                                <div className="flex items-center gap-1.5 text-slate-700 font-bold"><Calendar size={11} className="text-slate-600" /> {calculateAge(item.dataNascimento || item.nascimento)} (DN: {(item.dataNascimento || item.nascimento)?.split('-').reverse().join('/') || '--'})</div>
                                                <div className="flex items-center gap-1.5 font-black uppercase text-[10px] text-slate-500"><Phone size={11} className="text-emerald-400" /> {item.telefone1 || item.telefone}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-start gap-2">
                                                <Stethoscope size={14} className="text-blue-500 shrink-0 mt-0.5" />
                                                <div className="space-y-1 w-full">
                                                    <div className="text-[11px] font-black text-slate-900 drop-shadow-none uppercase leading-snug line-clamp-2" title={item.procedimento || 'NÃO INFORMADO'}>{item.procedimento || 'NÃO INFORMADO'}</div>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">DR(A). {item.cirurgiao || '---'} {item.especialidade ? `(${item.especialidade})` : ''}</div>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        <span className="text-[9px] font-black text-blue-500 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-100 uppercase">A: {item.anestesia || 'Não Inf.'}</span>
                                                        <span className="text-[9px] font-black text-blue-500 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-100 uppercase">{item.convenio || 'SUS'}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${PRIORITY_COLORS[item.prioridade] || 'bg-white/70 text-slate-500'}`}>{item.prioridade}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top w-full xl:w-[28%] max-w-[300px]">
                                            <div className="flex flex-col gap-2 w-full">
                                                <div className="flex flex-wrap gap-1">
                                                    {['aih', 'autorizada', 'apa', 'opme'].map(tag => (
                                                        <button key={tag} disabled={!podeEditar} onClick={podeEditar ? () => handleQuickUpdate(item, tag, !item[tag]) : undefined} className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border transition-all ${podeEditar ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-not-allowed'} ${item[tag] ? 'bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm' : 'bg-white/60 text-slate-600 border-white/60 shadow-sm'}`}>{tag}</button>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col md:flex-row gap-2 w-full">
                                                    <div className="flex justify-between items-center bg-white/60 px-2 py-1 rounded-lg border border-white/60 shadow-sm flex-1"><span className="text-[9px] font-black text-slate-500 uppercase shrink-0">Atend:</span><span className="text-[11px] font-black text-slate-700">{item.dataAtendimento?.split('-').reverse().join('/') || '---'}</span></div>
                                                    <div className="flex justify-between items-center bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-100 shadow-sm flex-1">
                                                        <span className="text-[9px] font-black text-emerald-500 uppercase shrink-0 mr-1">Autoriz:</span>
                                                        <input
                                                            type="date"
                                                            disabled={!podeEditar}
                                                            key={`aut-${item.id}-${item.dataAutorizacao}`}
                                                            defaultValue={item.dataAutorizacao || ''}
                                                            onBlur={(e) => {
                                                                if (e.target.value !== (item.dataAutorizacao || '')) handleQuickUpdate(item, 'dataAutorizacao', e.target.value);
                                                            }}
                                                            className={`bg-transparent text-[10px] font-black text-emerald-700 outline-none w-[80px] text-right ${podeEditar ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <select disabled={!podeEditar} value={item.status?.toUpperCase() || ''} onChange={(e) => handleQuickUpdate(item, 'status', e.target.value)} className={`px-2 py-1.5 text-[10px] font-black rounded-lg border uppercase outline-none mb-2 w-full max-w-[150px] truncate shadow-sm ${podeEditar ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${getStatusStyle(item.status)}`}>
                                                {settings.status?.map(opt => <option key={opt} value={opt.toUpperCase()}>{opt.toUpperCase()}</option>)}
                                                {item.status && !settings.status?.some(s => s.toUpperCase() === String(item.status).toUpperCase()) && (
                                                    <option value={String(item.status).toUpperCase()}>{String(item.status).toUpperCase()}</option>
                                                )}
                                            </select>

                                            {item.status === 'Aguardando Autorização' ? (
                                                <div className="bg-rose-500/20 px-2 py-2 rounded-xl border border-dashed border-rose-200 text-center w-full max-w-[150px]">
                                                    <ShieldCheck size={14} className="text-rose-400 mx-auto opacity-50 mb-1" />
                                                    <div className="text-[9px] font-black text-rose-600 uppercase">Sem Cobertura</div>
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5 bg-white/60 p-2 rounded-xl border border-white/60 shadow-sm w-full max-w-[150px]">
                                                    <div className="flex items-center gap-1.5 text-blue-600 font-extrabold">
                                                        <Calendar size={11} className="text-blue-400" />
                                                        <input
                                                            type="date"
                                                            disabled={!podeEditar}
                                                            key={`agd-${item.id}-${item.dataAgendado}`}
                                                            defaultValue={item.dataAgendado || ''}
                                                            onBlur={(e) => {
                                                                if (e.target.value !== (item.dataAgendado || '')) handleQuickUpdate(item, 'dataAgendado', e.target.value);
                                                            }}
                                                            className={`bg-transparent text-[10px] font-black outline-none flex-1 w-full ${podeEditar ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-blue-500 font-extrabold border-t border-white/40 pt-1.5">
                                                        <Clock size={11} className="text-blue-300" />
                                                        <input
                                                            type="time"
                                                            disabled={!podeEditar}
                                                            key={`hor-${item.id}-${item.horario}`}
                                                            defaultValue={item.horario || ''}
                                                            onBlur={(e) => {
                                                                if (e.target.value !== (item.horario || '')) handleQuickUpdate(item, 'horario', e.target.value);
                                                            }}
                                                            className={`bg-transparent text-[10px] font-black outline-none flex-1 w-full ${podeEditar ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-slate-500 font-bold border-t border-white/40 pt-1.5">
                                                        <MapPin size={11} className="text-slate-600" />
                                                        <select disabled={!podeEditar} value={String(item.sala || '').toUpperCase()} onChange={(e) => handleQuickUpdate(item, 'sala', e.target.value)} className={`bg-transparent text-[10px] uppercase font-black outline-none flex-1 truncate max-w-[90px] ${podeEditar ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}>
                                                            <option value="">NÃO DEF</option>
                                                            {settings.locais?.map(l => <option key={l} value={String(l).toUpperCase()}>{l.toUpperCase()}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-2 bg-amber-500/20/60 p-2 rounded-xl border border-amber-200/60 hover:bg-amber-500/20/90 transition-all shadow-sm w-full max-w-[150px]">
                                                <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 uppercase mb-1"><MessageSquare size={10} /> Notas:</div>
                                                <textarea
                                                    key={`obs-${item.id}-${item.obs || item.observacoes}`}
                                                    disabled={!podeEditar}
                                                    defaultValue={item.obs || item.observacoes || ''}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== (item.obs || item.observacoes || '')) handleQuickUpdate(item, 'observacoes', e.target.value);
                                                    }}
                                                    placeholder="Sua nota..."
                                                    className={`bg-transparent text-[10px] font-bold text-amber-900 italic leading-snug w-full outline-none resize-none border-none overflow-hidden ${podeEditar ? '' : 'cursor-not-allowed opacity-80'}`}
                                                    rows="3"
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center align-top">
                                            <div className="flex flex-col gap-2 items-center w-full">
                                                {(item.arquivos?.length > 0 || item.arquivoUrl || item.externalExamUrl) && (
                                                    <a
                                                        href={item.externalExamUrl || item.arquivoUrl || item.arquivos?.[0]?.url}
                                                        onClick={aoClicarNoArquivo(
                                                            item.externalExamUrl || item.arquivos?.[0]?.path || item.arquivoUrl || item.arquivos?.[0]?.url,
                                                            'documentos'
                                                        )}
                                                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none hover:bg-blue-100 border border-blue-200 rounded text-[9px] font-black uppercase tracking-wide no-underline shadow-sm"
                                                    >
                                                        <Paperclip size={10} /> DOCs
                                                    </a>
                                                )}
                                                <div className="flex gap-2 w-full justify-center">
                                                    {hasPermission('Editar Agendamentos') && (
                                                        <button onClick={() => setEditingSurgery(item)} className="p-2 bg-white/60 backdrop-blur-md text-slate-700 hover:text-blue-600 rounded-lg shadow-sm border border-white/60 transition-all hover:scale-110 active:scale-95" title="Editar"><Edit size={16} /></button>
                                                    )}
                                                    {hasPermission('Excluir Agendamentos') && (
                                                        <button onClick={() => handleDelete(item)} className="p-2 bg-white/60 backdrop-blur-md text-slate-700 hover:text-rose-600 rounded-lg shadow-sm border border-white/60 transition-all hover:scale-110 active:scale-95 group/delete" title="Excluir"><Trash2 size={16} /></button>
                                                    )}
                                                </div>
                                                {isModal && slotInfo && (
                                                    <button 
                                                        disabled={isUnavailable}
                                                        onClick={() => onSelectForScheduling(item)} 
                                                        className={`mt-1 w-full py-2 px-2 font-black text-[10px] uppercase rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 ${
                                                            isUnavailable 
                                                            ? 'bg-white/80 text-slate-500 cursor-not-allowed' 
                                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                                        }`}
                                                    >
                                                        <Calendar size={12} /> {isUnavailable ? 'Já Agendado' : 'Agendar'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan="5" className="py-40 text-center text-slate-600 font-black uppercase text-sm tracking-widest bg-slate-50/10 px-10 leading-relaxed italic">Nenhum registro encontrado no sistema.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {editingSurgery && <EditSurgeryModal surgery={editingSurgery} settings={settings} pacientes={pacientes} allSurgeries={surgeries} onClose={() => setEditingSurgery(null)} onSave={handleUpdate} />}
            <ImportSurgeriesModal
                open={showImport}
                onClose={() => setShowImport(false)}
                settings={settings}
                medicos={medicos}
                existingSurgeries={surgeries}
                unidadeAtual={unidadeAtual}
                onImported={fetchSurgeries}
            />
        </div>
    );

    if (isModal) {
        return createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in print:hidden" onClick={onCloseModal}>
                <div className="w-full h-full max-h-[96vh] max-w-[96vw] bg-white/70 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-white/40" onClick={e => e.stopPropagation()}>
                    {slotInfo ? (
                        <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between text-white shadow-md relative z-20 shrink-0">
                            <div>
                                <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
                                    <Calendar size={20} className="text-blue-400" /> Selecione um Paciente para Agendar
                                </h2>
                                <p className="text-slate-300 text-[11px] font-bold uppercase mt-0.5 tracking-wider">
                                    Destino: <span className="text-blue-400">Sala {slotInfo.sala}</span> • {slotInfo.data?.split('-').reverse().join('/')} às {slotInfo.horario}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {hasPermission('Acao: Bloquear Agenda') && (
                                    <button 
                                        onClick={() => onSelectForScheduling({ isBlock: true, reason: 'MANUTENÇÃO', duration: 60 })} 
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm"
                                    >
                                        🔒 Bloquear Horário
                                    </button>
                                )}
                                <button onClick={onCloseModal} className="p-2 bg-slate-700 hover:bg-rose-500/20 rounded-xl transition-colors shadow-sm"><X size={20} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/60 px-6 py-4 flex items-center justify-between border-b border-white/60 shadow-sm relative z-20 shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 drop-shadow-none uppercase tracking-widest flex items-center gap-2">
                                    <ClipboardList size={20} className="text-blue-600" /> Fila Cirúrgica Interativa
                                </h2>
                                <p className="text-slate-500 text-[11px] font-bold uppercase mt-0.5 tracking-wider">
                                    Consulta e Gestão Rápida
                                </p>
                            </div>
                            <button onClick={onCloseModal} className="p-2 bg-slate-100/80 text-slate-500 hover:text-white hover:bg-rose-500/20 rounded-xl transition-colors border border-white/60 shadow-sm"><X size={20} /></button>
                        </div>
                    )}
                    
                    <div className="flex-1 overflow-y-auto w-full custom-scrollbar relative bg-slate-50/20">
                        {QueueContent}
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    if (!unidadeAtual) return <UnitPrompt />;

    return QueueContent;
};

export default SurgeryQueue;