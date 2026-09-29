import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';
import imageCompression from 'browser-image-compression';

const compressImage = async (file) => {
    const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true
    };
    try {
        return await imageCompression(file, options);
    } catch (error) {
        console.error("Erro na compressão:", error);
        return file;
    }
};

import { Plus, Trash2, Edit2, Check, X, UploadCloud, FileText, Loader2, AlertTriangle, CheckCircle, FileSpreadsheet, ChevronRight, Search, Clock, User, Activity, Palette, Users, Building, Syringe, MapPin, Stethoscope, ShieldCheck, LayoutGrid, CalendarDays, ArrowLeft, Printer, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import UserManagement from './UserManagement';
import { usePermission } from '../contexts/PermissionContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import * as XLSX from 'xlsx';
import { printReport } from '../utils/printReport';
import { useAuth } from '../contexts/AuthContext';

// --- IDENTIDADE VISUAL COMPONENT ---
const IdentidadeVisualTab = ({ data, setData }) => {
    const [nomeInstituicao, setNomeInstituicao] = useState(data.nomeInstituicao || 'Sistema de Saúde');
    const [corPrincipal, setCorPrincipal] = useState(data.corPrincipal || '#2563eb');
    const [logoUrl, setLogoUrl] = useState(data.logoUrl || '/logo.png');
    const [faviconUrl, setFaviconUrl] = useState(data.faviconUrl || '');
    const [marqueeText, setMarqueeText] = useState(data.marqueeText || 'Bem-vindo ao sistema da MedCode Assessoria.');
    const [uploading, setUploading] = useState(false);
    const [uploadingFavicon, setUploadingFavicon] = useState(false);
    const { reloadTheme } = useWhiteLabel();

    const handleSave = async () => {
        const updatedData = {
            ...data,
            nomeInstituicao,
            corPrincipal,
            logoUrl,
            faviconUrl,
            marqueeText
        };
        try {
            const { error } = await supabase.from('settings').upsert({ id: 'general', data: updatedData });
            if (error) throw error;
            await logAction('IDENTIDADE VISUAL', `Configurações de Identidade Visual alteradas.`);
            setData(updatedData);
            toast.success("Identidade Visual salva!");
            reloadTheme();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar Identidade Visual.");
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const compressedFile = await compressImage(file);
            const fileExt = compressedFile.name.split('.').pop() || 'png';
            const fileName = `logo-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, compressedFile);
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
            setLogoUrl(publicUrlData.publicUrl);
            toast.success("Logo enviada! Salve para aplicar.");
        } catch (error) {
            console.error(error);
            toast.error("Erro no upload do logo.");
        } finally {
            setUploading(false);
        }
    };

    const handleFaviconUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingFavicon(true);
        try {
            const compressedFile = await compressImage(file);
            const fileExt = compressedFile.name.split('.').pop() || 'png';
            const fileName = `favicon-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, compressedFile);
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
            setFaviconUrl(publicUrlData.publicUrl);
            toast.success("Favicon enviado! Salve para aplicar.");
        } catch (error) {
            console.error(error);
            toast.error("Erro no upload do favicon.");
        } finally {
            setUploadingFavicon(false);
        }
    };

    return (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl border border-white/60 shadow-sm p-8 animate-in fade-in max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> Identidade Visual
            </h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome da Empresa</label>
                    <input value={nomeInstituicao} onChange={e => setNomeInstituicao(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Texto Flutuante (Letreiro Hub)</label>
                    <textarea value={marqueeText} onChange={e => setMarqueeText(e.target.value)} className="w-full h-20 p-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700 resize-none" placeholder="Texto que desliza na tela inicial..." />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Cor Principal (CSS Hex)</label>
                    <div className="flex gap-4 items-center">
                        <input type="color" value={corPrincipal} onChange={e => setCorPrincipal(e.target.value)} className="w-12 h-10 cursor-pointer rounded-lg border-none" />
                        <input value={corPrincipal} onChange={e => setCorPrincipal(e.target.value)} className="flex-1 h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 font-mono text-sm font-bold text-slate-700" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Logótipo</label>
                    <div className="flex items-center gap-4">
                        <div className="w-24 h-24 bg-white/60 border-2 border-dashed border-white/80 rounded-2xl flex items-center justify-center p-2 relative overflow-hidden shadow-inner">
                            {logoUrl ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" /> : <span className="text-[11px] uppercase font-bold text-slate-500">Sem Logo</span>}
                        </div>
                        <label className="px-5 py-2.5 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl hover:bg-white/60 hover:border-white hover:bg-white/90 text-slate-700 font-black uppercase tracking-wider text-xs rounded-xl cursor-pointer transition-all shadow-sm flex items-center gap-2 active:scale-95">
                            {uploading ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <UploadCloud size={16} className="text-blue-600" />}
                            {uploading ? 'A Enviar...' : 'Alterar Logótipo'}
                            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
                        </label>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ícone da Aba do Navegador (Favicon)</label>
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white/60 border-2 border-dashed border-white/80 rounded-2xl flex items-center justify-center p-2 relative overflow-hidden shadow-inner">
                            {faviconUrl ? <img src={faviconUrl} alt="Favicon" className="max-w-full max-h-full object-contain" /> : <span className="text-[11px] uppercase font-bold text-slate-500">Padrão</span>}
                        </div>
                        <label className="px-5 py-2.5 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl hover:bg-white/60 hover:border-white hover:bg-white/90 text-slate-700 font-black uppercase tracking-wider text-xs rounded-xl cursor-pointer transition-all shadow-sm flex items-center gap-2 active:scale-95">
                            {uploadingFavicon ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <UploadCloud size={16} className="text-blue-600" />}
                            {uploadingFavicon ? 'A Enviar...' : 'Alterar Favicon'}
                            <input type="file" accept="image/*" onChange={handleFaviconUpload} className="hidden" disabled={uploadingFavicon} />
                        </label>
                    </div>
                </div>
                <div className="pt-6 border-t border-white/60 flex justify-end">
                    <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2">
                        <Check size={16} /> Gravar Identidade Visual
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- AGENDA CATEGORIAS MANAGER COMPONENT ---
const AgendaCategoriasManager = () => {
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newNome, setNewNome] = useState('');
    const [newCor, setNewCor] = useState('bg-blue-500');
    const [editingId, setEditingId] = useState(null);
    const [editNome, setEditNome] = useState('');
    const [editCor, setEditCor] = useState('');

    const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500', 'bg-slate-500'];

    useEffect(() => { fetchCategorias(); }, []);

    const fetchCategorias = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('agenda_categorias').select('*').order('nome');
        if (!error) setCategorias(data || []);
        setLoading(false);
    };

    const handleAdd = async () => {
        if (!newNome.trim()) return;
        const { error } = await supabase.from('agenda_categorias').insert([{ nome: newNome, cor: newCor }]);
        if (!error) {
            await logAction('CRIAÇÃO DE CATEGORIA', `Categoria da agenda adicionada: ${newNome}`);
            toast.success('Categoria adicionada!');
            setNewNome('');
            fetchCategorias();
        } else { toast.error('Erro ao adicionar categoria.'); }
    };

    const handleEdit = async (id) => {
        if (!editNome.trim()) return;
        const { error } = await supabase.from('agenda_categorias').update({ nome: editNome, cor: editCor }).eq('id', id);
        if (!error) {
            await logAction('EDIÇÃO DE CATEGORIA', `Categoria da agenda atualizada: ${editNome}`);
            toast.success('Categoria atualizada!');
            setEditingId(null);
            fetchCategorias();
        } else { toast.error('Erro ao atualizar categoria.'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Remover esta categoria?")) return;
        const { error } = await supabase.from('agenda_categorias').delete().eq('id', id);
        if (!error) {
            toast.success('Categoria removida!');
            fetchCategorias();
        } else { toast.error('Não é possível remover se houver eventos ou usuários vinculados.'); }
    };

    return (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl border border-white/60 shadow-sm p-8 animate-in fade-in max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> Categorias / Equipes da Agenda
            </h2>
            <div className="flex gap-2 items-center bg-white/40 p-2 rounded-xl">
                <input value={newNome} onChange={e => setNewNome(e.target.value)} placeholder="Nova Equipe/Categoria..." className="flex-1 h-10 px-3 rounded-lg border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" />
                <select value={newCor} onChange={e => setNewCor(e.target.value)} className="h-10 px-2 rounded-lg border border-white/60 outline-none font-bold text-sm text-slate-700">
                    {colors.map(c => <option key={c} value={c}>{c.replace('bg-', '').replace('-500', '').toUpperCase()}</option>)}
                </select>
                <div className={`w-8 h-8 rounded-full shadow-sm ${newCor}`}></div>
                <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase px-4 h-10 rounded-lg shadow-lg transition-all active:scale-95">Adicionar</button>
            </div>
            {loading ? <div className="p-4 text-center"><Loader2 className="animate-spin text-blue-500 mx-auto" /></div> : (
                <ul className="space-y-2">
                    {categorias.map(c => (
                        <li key={c.id} className="flex justify-between items-center bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl p-2 rounded-xl">
                            {editingId === c.id ? (
                                <div className="flex gap-2 w-full items-center">
                                    <input value={editNome} onChange={e => setEditNome(e.target.value)} className="flex-1 px-2 py-2 rounded-lg border border-blue-400 outline-none text-sm font-bold text-slate-700" />
                                    <select value={editCor} onChange={e => setEditCor(e.target.value)} className="py-2 px-1 rounded-lg border border-blue-400 outline-none font-bold text-sm text-slate-700">
                                        {colors.map(col => <option key={col} value={col}>{col.replace('bg-', '').replace('-500', '').toUpperCase()}</option>)}
                                    </select>
                                    <div className={`w-6 h-6 rounded-full shadow-sm ${editCor}`}></div>
                                    <button onClick={() => handleEdit(c.id)} className="text-emerald-600 font-bold px-3"><Check size={16} /></button>
                                    <button onClick={() => setEditingId(null)} className="text-rose-600 font-bold px-3"><X size={16} /></button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-3 ml-2">
                                        <div className={`w-4 h-4 rounded-full shadow-sm ${c.cor || 'bg-slate-500'}`}></div>
                                        <span className="text-sm font-bold text-slate-700 leading-tight">{c.nome}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEditingId(c.id); setEditNome(c.nome); setEditCor(c.cor || 'bg-blue-500'); }} className="p-1.5 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"><Edit2 size={14} /></button>
                                        <button onClick={() => handleDelete(c.id)} className="p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md"><Trash2 size={14} /></button>
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                    {categorias.length === 0 && <p className="text-xs text-slate-500 font-bold uppercase text-center py-4">Nenhuma categoria cadastrada.</p>}
                </ul>
            )}
        </div>
    );
};

// --- EDITABLE LIST COMPONENT ---
const RenderSection = ({ title, category, placeholder, inputValue, items, onInputChange, onAdd, onRemove, onEdit }) => {
    const [editingIndex, setEditingIndex] = useState(null);
    const [editValue, setEditValue] = useState('');

    const startEdit = (index, currentValue) => {
        setEditingIndex(index);
        setEditValue(currentValue);
    };

    const saveEdit = async (index) => {
        if (editValue.trim() && editValue !== items[index]) {
            await onEdit(category, index, editValue);
        }
        setEditingIndex(null);
        setEditValue('');
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditValue('');
    };

    return (
        <div className="flex flex-col bg-white/60 backdrop-blur-md rounded-xl border border-white/60 shadow-sm overflow-hidden h-fit">
            {/* Header / Inserção Compacta */}
            <div className="p-4 border-b border-white/60 bg-white/60 flex flex-col gap-3 rounded-t-xl">
                <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> {title}
                </h3>
                <div className="flex gap-2">
                    <input
                        value={inputValue || ''}
                        onChange={(e) => onInputChange(category, e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 h-9 px-2.5 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-[13px] font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-500"
                        onKeyDown={(e) => e.key === 'Enter' && onAdd(category)}
                    />
                    <button
                        onClick={() => onAdd(category)}
                        disabled={!inputValue}
                        className="bg-blue-600 text-white px-2.5 h-9 rounded-lg hover:bg-blue-700 transition-all flex justify-center items-center shadow-md shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Adicionar"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* Lista com Tags */}
            <div className="p-4 pb-5 min-h[100px]">
                {(!items || items.length === 0) ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 gap-1 py-4 opacity-70">
                        <AlertTriangle size={18} />
                        <span className="text-xs uppercase font-bold tracking-widest mt-1">Lista Vazia</span>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {items.map((item, index) => (
                            editingIndex === index ? (
                                <div key={index} className="flex items-center gap-1 bg-white/60 border border-blue-400 text-blue-800 text-xs font-bold px-1.5 py-1 rounded-md shadow-sm animate-in zoom-in-95">
                                    <input
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="h-5 px-1 bg-transparent w-24 outline-none text-xs"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveEdit(index);
                                            if (e.key === 'Escape') cancelEdit();
                                        }}
                                    />
                                    <button onClick={() => saveEdit(index)} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded-sm"><Check size={12} /></button>
                                    <button onClick={cancelEdit} className="p-0.5 text-rose-600 hover:bg-rose-100 rounded-sm"><X size={12} /></button>
                                </div>
                            ) : (
                                <span
                                    key={index}
                                    className="bg-white/80 border-2 border-white shadow-sm text-slate-700 text-xs font-black uppercase px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm group hover:border-blue-300 hover:bg-blue-50 transition-all"
                                >
                                    <span className="cursor-pointer" onClick={() => startEdit(index, item)}>{item}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemove(category, item); }}
                                        className="text-slate-500 hover:text-rose-500 hover:bg-rose-100 rounded p-0.5 transition-colors"
                                        title="Remover"
                                    >
                                        <X size={12} strokeWidth={3} />
                                    </button>
                                </span>
                            )
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


// --- LOGS: filtros e exportação -------------------------------------------
// O PostgREST devolve no máximo 1000 linhas por requisição; a exportação pagina
// até LOGS_EXPORT_MAX para não travar o navegador com a tabela inteira.
const LOGS_PAGE_SIZE = 1000;
const LOGS_EXPORT_MAX = 20000;
// A tabela carrega por rolagem: 500 por vez, em vez de um teto fixo. Trazer os
// ~3 mil registros de 30 dias de uma vez pesa no DOM, não na rede — por isso o
// total vem do count do banco e as linhas entram conforme o usuário desce.
const LOGS_PAGINA_TELA = 500;
const LOGS_DIAS_PADRAO = 30;

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Abre já nos últimos 30 dias: era o recorte que o usuário tinha que montar na mão.
const filtrosPadraoDeLog = () => {
    const de = new Date();
    de.setDate(de.getDate() - (LOGS_DIAS_PADRAO - 1));
    return { ...LOGS_FILTROS_VAZIOS, from: isoLocal(de) };
};

const LOGS_FILTROS_VAZIOS = { search: '', from: '', to: '', user: '', action: '', actionIn: [] };

// Aplica os filtros da tela na query. A identidade do usuário é o e-mail
// (o userName às vezes é o nome, às vezes o próprio e-mail — ver logger.js).
const applyLogsFilters = (qb, f) => {
    if (f.from) qb = qb.gte('timestamp', new Date(`${f.from}T00:00:00`).toISOString());
    if (f.to) qb = qb.lte('timestamp', new Date(`${f.to}T23:59:59.999`).toISOString());
    if (f.user) qb = qb.eq('userEmail', f.user);
    // A mesma ação aparece com grafias diferentes ("Criação de Paciente" x
    // "CRIAÇÃO DE PACIENTE"); o seletor agrupa as variantes e filtra por todas.
    if (f.actionIn?.length) qb = qb.in('action', f.actionIn);
    else if (f.action) qb = qb.eq('action', f.action);
    if (f.search) {
        // Sanitiza para evitar injeção na expressão de filtro do PostgREST (vírgulas,
        // aspas, parênteses e curingas poderiam reescrever a query / referenciar outras colunas).
        const safe = String(f.search).replace(/[",()*:\\]/g, ' ').trim();
        if (safe) qb = qb.or(`action.ilike.%${safe}%,details.ilike.%${safe}%,userName.ilike.%${safe}%`);
    }
    return qb;
};

const temFiltroDeLog = (f) => Boolean(f.search || f.from || f.to || f.user || f.action);

const dataBR = (iso) => {
    if (!iso) return '';
    const [a, m, d] = String(iso).split('-');
    return d ? `${d}/${m}/${a}` : String(iso);
};

// Texto do período/filtros que sai no cabeçalho do PDF e no log da exportação.
const descreveFiltrosDeLog = (f, nomeUsuario) => {
    const partes = [];
    if (f.from && f.to) partes.push(`${dataBR(f.from)} a ${dataBR(f.to)}`);
    else if (f.from) partes.push(`A partir de ${dataBR(f.from)}`);
    else if (f.to) partes.push(`Até ${dataBR(f.to)}`);
    else partes.push('Todos os períodos');
    if (f.user) partes.push(`Usuário: ${nomeUsuario || f.user}`);
    if (f.action) partes.push(`Ação: ${f.action}`);
    if (f.search) partes.push(`Busca: "${f.search}"`);
    return partes.join(' • ');
};

const nomeDoLog = (log) => log?.userObj?.name || log?.userName || log?.userEmail || 'Desconhecido';

const Settings = () => {
    const { hasPermission } = usePermission();
    const { theme } = useWhiteLabel();
    const { currentUser } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabFromUrl = searchParams.get('tab');

    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(tabFromUrl || 'segmentos');
    // Bloco (card) aberto no Painel de Controle. null = mostra a grade de cards.
    // Sempre inicia na grade para o usuário escolher o bloco (Estrutura,
    // Cadastros, Fila, Faturamento) antes de ver as opções.
    const [activeBlock, setActiveBlock] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    // Rascunho dos filtros (o que está digitado na barra) x filtros aplicados
    // (os que geraram a lista na tela e que a exportação usa).
    const [logsFiltros, setLogsFiltros] = useState(filtrosPadraoDeLog);
    const [logsFiltrosAplicados, setLogsFiltrosAplicados] = useState(filtrosPadraoDeLog);
    const [totalLogs, setTotalLogs] = useState(0);
    const [carregandoMaisLogs, setCarregandoMaisLogs] = useState(false);
    const [logExpandido, setLogExpandido] = useState(null);
    const [logsOpcoes, setLogsOpcoes] = useState({ usuarios: [], acoes: [] });
    const [exportandoLogs, setExportandoLogs] = useState(false);

    useEffect(() => {
        if (tabFromUrl) setActiveSection(tabFromUrl);
    }, [tabFromUrl]);

    // Uma única consulta traz a página E o total do filtro (count exact), então o
    // cabeçalho pode dizer "500 de 2.961" sem carregar as 2.961 linhas.
    const loadLogs = async (filtros = filtrosPadraoDeLog(), { append = false, jaCarregados = 0 } = {}) => {
        if (append) setCarregandoMaisLogs(true);
        else { setLoadingLogs(true); setLogsFiltrosAplicados(filtros); setLogExpandido(null); }

        const inicio = append ? jaCarregados : 0;
        let qb = supabase.from('logs').select('*', { count: 'exact' }).order('timestamp', { ascending: false })
            .range(inicio, inicio + LOGS_PAGINA_TELA - 1);
        qb = applyLogsFilters(qb, filtros);

        const { data: logsData, error, count } = await qb;
        if (error) {
            toast.error('Não foi possível carregar os logs.');
        } else {
            setTotalLogs(count ?? 0);
            if (append) setLogs((atuais) => [...atuais, ...(logsData || [])]);
            else setLogs(logsData || []);
        }
        setLoadingLogs(false);
        setCarregandoMaisLogs(false);
    };

    // Chamado pela rolagem da tabela: puxa a próxima fatia enquanto houver.
    const carregarMaisLogs = () => {
        if (loadingLogs || carregandoMaisLogs || logs.length >= totalLogs) return;
        loadLogs(logsFiltrosAplicados, { append: true, jaCarregados: logs.length });
    };

    // Monta as listas dos seletores "Usuário" e "Ação" varrendo os logs
    // existentes (o PostgREST não faz DISTINCT, então a varredura é paginada).
    const carregarOpcoesDeLogs = async () => {
        try {
            const porEmail = new Map();
            const acoes = new Map();
            for (let pagina = 0; pagina * LOGS_PAGE_SIZE < LOGS_EXPORT_MAX; pagina++) {
                const inicio = pagina * LOGS_PAGE_SIZE;
                const { data, error } = await supabase
                    .from('logs')
                    .select('userName, userEmail, action')
                    .order('timestamp', { ascending: false })
                    .range(inicio, inicio + LOGS_PAGE_SIZE - 1);
                if (error) return;
                (data || []).forEach((l) => {
                    if (l.action) {
                        const chave = l.action.toUpperCase();
                        const variantes = acoes.get(chave) || [];
                        if (!variantes.includes(l.action)) variantes.push(l.action);
                        acoes.set(chave, variantes);
                    }
                    const email = l.userEmail || l.userName;
                    if (!email) return;
                    const atual = porEmail.get(email);
                    const nome = l.userName || '';
                    // Prefere o nome de verdade ao e-mail repetido no userName.
                    const melhor = nome && !nome.includes('@') ? nome : (atual?.nome || nome || email);
                    porEmail.set(email, { email, nome: (atual?.nome && !atual.nome.includes('@')) ? atual.nome : melhor });
                });
                if (!data || data.length < LOGS_PAGE_SIZE) break;
            }
            setLogsOpcoes({
                usuarios: [...porEmail.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
                acoes: [...acoes.entries()]
                    .map(([chave, variantes]) => ({ chave, variantes }))
                    .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR')),
            });
        } catch (e) {
            console.warn('Falha ao montar filtros de log', e);
        }
    };

    useEffect(() => {
        if (activeSection === 'logs') {
            loadLogs(logsFiltrosAplicados);
            if (logsOpcoes.usuarios.length === 0) carregarOpcoesDeLogs();
        }
    }, [activeSection]);

    const nomeDoUsuarioFiltrado = (email) =>
        logsOpcoes.usuarios.find((u) => u.email === email)?.nome || email;

    // Aplica os filtros da tela em atalhos de período (hoje / últimos dias / mês).
    const atalhoDePeriodo = (tipo) => {
        const hoje = new Date();
        const iso = isoLocal;
        let from = '';
        let to = iso(hoje);
        if (tipo === 'hoje') from = iso(hoje);
        if (tipo === '7dias') { const d = new Date(hoje); d.setDate(d.getDate() - 6); from = iso(d); }
        if (tipo === '30dias') { const d = new Date(hoje); d.setDate(d.getDate() - 29); from = iso(d); }
        if (tipo === 'mes') from = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
        if (tipo === 'tudo') { from = ''; to = ''; }
        const novos = { ...logsFiltros, from, to };
        setLogsFiltros(novos);
        loadLogs(novos);
    };

    // Busca TODOS os registros que batem com os filtros aplicados (paginado),
    // não apenas os que couberam na tela.
    const buscarLogsParaExportar = async () => {
        const todos = [];
        for (let pagina = 0; pagina * LOGS_PAGE_SIZE < LOGS_EXPORT_MAX; pagina++) {
            const inicio = pagina * LOGS_PAGE_SIZE;
            let qb = supabase.from('logs').select('*').order('timestamp', { ascending: false })
                .range(inicio, inicio + LOGS_PAGE_SIZE - 1);
            qb = applyLogsFilters(qb, logsFiltrosAplicados);
            const { data, error } = await qb;
            if (error) throw error;
            todos.push(...(data || []));
            if (!data || data.length < LOGS_PAGE_SIZE) break;
        }
        return todos;
    };


    const linhasDeLog = (registros) => registros.map((log) => {
        const d = log.timestamp ? new Date(log.timestamp) : null;
        return {
            data: d ? d.toLocaleDateString('pt-BR') : '',
            hora: d ? d.toLocaleTimeString('pt-BR') : '',
            usuario: nomeDoLog(log),
            email: log.userEmail || '',
            acao: log.action || '',
            detalhes: log.details || (log.data ? JSON.stringify(log.data) : ''),
            ip: log.ip_address || '',
        };
    });

    const exportarLogs = async (formato) => {
        if (exportandoLogs) return;
        setExportandoLogs(true);
        const aviso = toast.loading('Preparando exportação dos logs...');
        try {
            const registros = await buscarLogsParaExportar();
            if (registros.length === 0) {
                toast.error('Nenhum registro para exportar com os filtros atuais.', { id: aviso });
                return;
            }
            const linhas = linhasDeLog(registros);
            const periodo = descreveFiltrosDeLog(logsFiltrosAplicados, nomeDoUsuarioFiltrado(logsFiltrosAplicados.user));
            const carimbo = new Date().toISOString().slice(0, 10);

            if (formato === 'pdf') {
                printReport({
                    theme,
                    title: 'Registros do Sistema (Logs)',
                    periodText: periodo,
                    userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema',
                    orientation: 'landscape',
                    columns: [
                        { header: 'Data / Hora' }, { header: 'Usuário' }, { header: 'Ação' },
                        { header: 'Detalhes' }, { header: 'IP' },
                    ],
                    rows: linhas.map((l) => [
                        `${l.data} ${l.hora}`, l.usuario, l.acao, l.detalhes, l.ip,
                    ]),
                    totalLabel: 'Total de Registros Exportados',
                });
            } else {
                const planilha = linhas.map((l) => ({
                    'Data': l.data, 'Hora': l.hora, 'Usuário': l.usuario, 'E-mail': l.email,
                    'Ação': l.acao, 'Detalhes': l.detalhes, 'IP': l.ip,
                }));
                const ws = XLSX.utils.json_to_sheet(planilha);
                ws['!cols'] = [
                    { wch: 11 }, { wch: 10 }, { wch: 26 }, { wch: 26 }, { wch: 26 },
                    { wch: 80 }, { wch: 16 },
                ];
                if (formato === 'csv') {
                    // CSV abre direto no Google Planilhas e no Excel (BOM garante os acentos).
                    const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(ws, { FS: ';' });
                    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `logs_${carimbo}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Logs');
                    XLSX.writeFile(wb, `logs_${carimbo}.xlsx`);
                }
            }

            toast.success(`${registros.length} registro(s) exportado(s).`, { id: aviso });
            logAction('EXPORTAÇÃO DE LOGS', `Formato: ${formato.toUpperCase()} | ${registros.length} registro(s) | ${periodo}`);
        } catch (e) {
            console.error('Erro ao exportar logs', e);
            toast.error('Falha ao exportar os logs.', { id: aviso });
        } finally {
            setExportandoLogs(false);
        }
    };

    const [data, setData] = useState({
        segmentos: [], origens_lead: [],
        nomeInstituicao: 'MedCode Assessoria', corPrincipal: '#2563eb', logoUrl: '/logo.png'
    });

    const [newItem, setNewItem] = useState({ segmentos: '', origens_lead: '' });

    const navigate = useNavigate();

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const { data: generalRow, error } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
                if (error && error.code !== 'PGRST116') throw error;
                if (generalRow && generalRow.data) setData(generalRow.data);
            } catch (error) {
                console.error("Erro config:", error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleInputChange = (category, value) => setNewItem(prev => ({ ...prev, [category]: value }));

    const handleAdd = async (category, customValue = null) => {
        const itemToAdd = customValue || newItem[category];
        if (!itemToAdd) return;
        const updatedData = { ...data, [category]: [...(data[category] || []), itemToAdd] };
        try {
            const { error } = await supabase.from('settings').upsert({ id: 'general', data: updatedData });
            if (error) throw error;
            setData(updatedData);
            
            // LOG NÍVEL FBI
            const nomeItem = typeof itemToAdd === 'object' ? itemToAdd.nome || JSON.stringify(itemToAdd) : itemToAdd;
            await logAction('Configurações do Sistema', `Adicionou em [${category.toUpperCase()}]: ${nomeItem}`);

            if (!customValue) setNewItem(prev => ({ ...prev, [category]: '' }));
            toast.success("Adicionado!");
        } catch (error) { toast.error("Erro ao salvar."); }
    };

    const handleEdit = async (category, index, newValue) => {
        const updatedItems = [...data[category]];
        const oldItem = updatedItems[index]; // Guarda o valor antigo para o Diff
        updatedItems[index] = newValue;
        const updatedData = { ...data, [category]: updatedItems };
        try {
            const { error } = await supabase.from('settings').upsert({ id: 'general', data: updatedData });
            if (error) throw error;
            setData(updatedData);
            
            // LOG NÍVEL FBI (Diff)
            const oldStr = typeof oldItem === 'object' ? oldItem.nome || JSON.stringify(oldItem) : oldItem;
            const newStr = typeof newValue === 'object' ? newValue.nome || JSON.stringify(newValue) : newValue;
            await logAction('Configurações do Sistema', `Editou [${category.toUpperCase()}]: de [${oldStr}] para [${newStr}]`);

            toast.success("Atualizado!");
        } catch (error) { toast.error("Erro ao atualizar."); }
    };

    const handleRemove = async (category, itemToRemove) => {
        if (!window.confirm("Remover este item?")) return;
        const updatedData = {
            ...data,
            [category]: data[category].filter(i => {
                if (typeof i === 'string' && typeof itemToRemove === 'string') return i !== itemToRemove;
                if (typeof i === 'object' && typeof itemToRemove === 'object') return i.id !== itemToRemove.id;
                return true;
            })
        };
        try {
            const { error } = await supabase.from('settings').upsert({ id: 'general', data: updatedData });
            if (error) throw error;
            setData(updatedData);
            
            // LOG NÍVEL FBI
            const itemStr = typeof itemToRemove === 'object' ? itemToRemove.nome || JSON.stringify(itemToRemove) : itemToRemove;
            await logAction('Configurações do Sistema', `Removeu de [${category.toUpperCase()}]: ${itemStr}`);

            toast.success("Removido!");
        } catch (error) { toast.error("Erro ao remover."); }
    };

    const tabGroups = {
        'cadastros_gerais': [
            { id: 'segmentos', label: 'Segmentos', show: hasPermission('Acessar Configurações') },
            { id: 'origens_lead', label: 'Origens de lead', show: hasPermission('Acessar Configurações') },
            { id: 'categorias_agenda', label: 'Equipes', show: hasPermission('Acessar Configurações') }
        ]
    };

    // Abas de cadastros em blocos rotulados (em vez de uma fileira que rola).
    const tabBlocks = [
        { label: 'Comercial', desc: 'Segmentos de mercado e origens dos leads', icon: Building, color: 'text-blue-600', bg: 'bg-blue-50', ids: ['segmentos', 'origens_lead'] },
        { label: 'Equipe', desc: 'Equipes internas (agenda e compromissos)', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', ids: ['categorias_agenda'] },
    ];

    const getActiveGroup = (section) => {
        for (const [groupName, tabs] of Object.entries(tabGroups)) {
            if (tabs.some(t => t.id === section)) {
                return tabs.filter(t => t.show);
            }
        }
        return [];
    };

    const activeTabs = getActiveGroup(activeSection);

    if (loading) return <div className="flex items-center justify-center min-h-full"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="min-h-full bg-transparent py-8 px-4 sm:px-8 font-sans">
            <div className="max-w-[1400px] mx-auto">
                <div className="mb-6 flex items-center gap-3">
                    <button
                        onClick={() => navigate('/configuracoes')}
                        title="Voltar para Configurações"
                        className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-white/60 hover:text-slate-800 transition-colors border border-transparent hover:border-white/60 shrink-0"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-normal">Painel de Controle</h1>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Gerencie todos os aspectos do seu sistema</p>
                    </div>
                </div>

                {/* NÍVEL 1: grade de cards (um por bloco) */}
                {activeTabs.length > 1 && activeBlock === null && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2 animate-in fade-in duration-300">
                        {tabBlocks.map(block => {
                            const blockTabs = block.ids
                                .map(id => activeTabs.find(t => t.id === id))
                                .filter(Boolean);
                            if (blockTabs.length === 0) return null;
                            const Icon = block.icon;
                            return (
                                <button
                                    key={block.label}
                                    onClick={() => {
                                        setActiveBlock(block.label);
                                        setActiveSection(blockTabs[0].id);
                                        navigate({ search: `?tab=${blockTabs[0].id}` }, { replace: true });
                                    }}
                                    className="group text-left aspect-square flex flex-col justify-between bg-white/70 backdrop-blur-xl border border-white rounded-3xl shadow-lg shadow-slate-300/30 p-6 hover:-translate-y-1 hover:shadow-xl transition-all duration-200"
                                >
                                    <div className={`w-14 h-14 rounded-2xl ${block.bg} ${block.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                        <Icon size={28} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-800 leading-tight">{block.label}</h3>
                                        <p className="text-xs font-semibold text-slate-400 mt-1 leading-snug">{block.desc}</p>
                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-3 flex items-center gap-1">
                                            {blockTabs.length} {blockTabs.length === 1 ? 'opção' : 'opções'}
                                            <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* NÍVEL 2: bloco aberto — botão voltar + opções */}
                {activeTabs.length > 1 && activeBlock !== null && (
                    <div className="mb-6 animate-in fade-in slide-in-from-left-2 duration-300">
                        <button
                            onClick={() => setActiveBlock(null)}
                            className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-white/70 border border-transparent hover:border-white/60 transition-colors"
                        >
                            <ArrowLeft size={15} /> Voltar aos cards
                        </button>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{activeBlock}</p>
                        <div className="inline-flex flex-wrap items-center gap-1 bg-white/70 rounded-xl p-1 shadow-sm border border-white/60">
                            {(tabBlocks.find(b => b.label === activeBlock)?.ids || [])
                                .map(id => activeTabs.find(t => t.id === id))
                                .filter(Boolean)
                                .map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => { setActiveSection(tab.id); navigate({ search: `?tab=${tab.id}` }, { replace: true }); }}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${activeSection === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                        </div>
                    </div>
                )}

                {/* ÁREA DE CONTEÚDO: oculta enquanto a grade de cards está visível */}
                <div className={`flex flex-col gap-8 max-w-full mx-auto ${activeTabs.length > 1 && activeBlock === null ? 'hidden' : 'items-stretch'}`}>

                    {/* ÁREA DE CONTEÚDO. Dentro de um bloco (nível 2) o conteúdo já
                        tem seu próprio card, então dispensamos o painel de vidro
                        externo para não criar "card dentro de card". As seções
                        avulsas (logs, usuários...) mantêm o painel. */}
                    <div className={`w-full animate-in fade-in slide-in-from-bottom-4 duration-500 ${activeBlock !== null ? '' : 'bg-white/60 backdrop-blur-2xl border border-white rounded-[2.5rem] shadow-xl shadow-slate-300/40 p-6 md:p-10 min-h-[700px]'}`}>
                        
                        {activeSection === 'segmentos' && <RenderSection title="Segmentos" category="segmentos" placeholder="Ex: Clínicas, Varejo, Advocacia..." inputValue={newItem.segmentos} items={data.segmentos} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'origens_lead' && <RenderSection title="Origens de lead" category="origens_lead" placeholder="Ex: Instagram, Indicação, Google..." inputValue={newItem.origens_lead} items={data.origens_lead} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'categorias_agenda' && <AgendaCategoriasManager />}

                        {activeSection === 'usuarios' && (hasPermission('Acesso Total (Admin)') || hasPermission('Acessar Usuarios')) && <UserManagement isEmbedded={true} />}
                        {activeSection === 'identidade' && hasPermission('Acesso Total (Admin)') && <IdentidadeVisualTab data={data} setData={setData} />}
                        
                        {activeSection === 'logs' && hasPermission('Acesso Total (Admin)') && (
                            <div className="bg-white/60 rounded-2xl border border-white/40 shadow-sm overflow-hidden flex flex-col h-full max-h-[750px]">
                                <div className="px-6 py-4 border-b border-white/40 bg-transparent flex flex-col gap-3">
                                    <div className="flex justify-between items-center flex-wrap gap-3">
                                        <div>
                                            <h3 className="text-base font-black uppercase text-slate-800 flex items-center gap-2">
                                                <Activity size={18} className="text-blue-600"/> Registros do Sistema
                                                <span className="text-slate-400 font-bold">
                                                    ({logs.length.toLocaleString('pt-BR')}{logs.length < totalLogs ? ` de ${totalLogs.toLocaleString('pt-BR')}` : ''})
                                                </span>
                                            </h3>
                                            <p className="text-[11px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                                                {descreveFiltrosDeLog(logsFiltrosAplicados, nomeDoUsuarioFiltrado(logsFiltrosAplicados.user))}
                                            </p>
                                            {logs.length < totalLogs && (
                                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider mt-1">
                                                    Role a lista ou use o botão no fim • a exportação leva os {totalLogs.toLocaleString('pt-BR')} do filtro
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1"><Download size={13}/> Exportar</span>
                                            <button
                                                onClick={() => exportarLogs('pdf')}
                                                disabled={exportandoLogs}
                                                title="Exportar em PDF (abre a impressão)"
                                                className="bg-white/80 border border-white/60 text-slate-700 h-9 px-3 rounded-lg text-[11px] font-black uppercase hover:bg-white transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                            >
                                                {exportandoLogs ? <Loader2 size={14} className="animate-spin"/> : <Printer size={14} className="text-rose-600"/>} PDF
                                            </button>
                                            <button
                                                onClick={() => exportarLogs('xlsx')}
                                                disabled={exportandoLogs}
                                                title="Exportar planilha Excel (.xlsx) — abre no Google Planilhas"
                                                className="bg-white/80 border border-white/60 text-slate-700 h-9 px-3 rounded-lg text-[11px] font-black uppercase hover:bg-white transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                            >
                                                {exportandoLogs ? <Loader2 size={14} className="animate-spin"/> : <FileSpreadsheet size={14} className="text-emerald-600"/>} Excel
                                            </button>
                                            <button
                                                onClick={() => exportarLogs('csv')}
                                                disabled={exportandoLogs}
                                                title="Exportar CSV — importa direto no Google Planilhas"
                                                className="bg-white/80 border border-white/60 text-slate-700 h-9 px-3 rounded-lg text-[11px] font-black uppercase hover:bg-white transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                            >
                                                {exportandoLogs ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14} className="text-blue-600"/>} CSV
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-end gap-2">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Busca</label>
                                            <input
                                                value={logsFiltros.search}
                                                onChange={(e) => setLogsFiltros({ ...logsFiltros, search: e.target.value })}
                                                onKeyDown={(e) => e.key === 'Enter' && loadLogs(logsFiltros)}
                                                placeholder="Usuário, ação ou detalhe..."
                                                className="h-9 px-3 min-w-[210px] rounded-lg border border-white/60 bg-white/80 text-[13px] font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">De</label>
                                            <input
                                                type="date"
                                                value={logsFiltros.from}
                                                onChange={(e) => setLogsFiltros({ ...logsFiltros, from: e.target.value })}
                                                className="h-9 px-3 rounded-lg border border-white/60 bg-white/80 text-[13px] font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Até</label>
                                            <input
                                                type="date"
                                                value={logsFiltros.to}
                                                onChange={(e) => setLogsFiltros({ ...logsFiltros, to: e.target.value })}
                                                className="h-9 px-3 rounded-lg border border-white/60 bg-white/80 text-[13px] font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Usuário</label>
                                            <select
                                                value={logsFiltros.user}
                                                onChange={(e) => setLogsFiltros({ ...logsFiltros, user: e.target.value })}
                                                className="h-9 px-2 min-w-[180px] rounded-lg border border-white/60 bg-white/80 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
                                            >
                                                <option value="">Todos os usuários</option>
                                                {logsOpcoes.usuarios.map((u) => (
                                                    <option key={u.email} value={u.email}>{u.nome}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Ação</label>
                                            <select
                                                value={logsFiltros.action}
                                                onChange={(e) => {
                                                    const chave = e.target.value;
                                                    const opcao = logsOpcoes.acoes.find((a) => a.chave === chave);
                                                    setLogsFiltros({ ...logsFiltros, action: chave, actionIn: opcao?.variantes || [] });
                                                }}
                                                className="h-9 px-2 min-w-[190px] rounded-lg border border-white/60 bg-white/80 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
                                            >
                                                <option value="">Todas as ações</option>
                                                {logsOpcoes.acoes.map((a) => (
                                                    <option key={a.chave} value={a.chave}>{a.chave}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            onClick={() => loadLogs(logsFiltros)}
                                            className="bg-blue-600 text-white h-9 px-4 rounded-lg text-xs font-black uppercase hover:bg-blue-700 transition flex items-center gap-1.5 shadow-sm"
                                        >
                                            <Search size={14} /> Pesquisar
                                        </button>
                                        {temFiltroDeLog(logsFiltros) && (
                                            <button
                                                onClick={() => { const p = filtrosPadraoDeLog(); setLogsFiltros(p); loadLogs(p); }}
                                                className="bg-slate-200 text-slate-700 h-9 px-3 rounded-lg text-[11px] font-black uppercase hover:bg-slate-300 transition flex items-center shadow-sm"
                                                title="Voltar aos últimos 30 dias"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                        <div className="flex items-center gap-1 ml-auto">
                                            {[
                                                { id: 'hoje', label: 'Hoje' },
                                                { id: '7dias', label: '7 dias' },
                                                { id: '30dias', label: '30 dias' },
                                                { id: 'mes', label: 'Este mês' },
                                                { id: 'tudo', label: 'Tudo' },
                                            ].map((atalho) => (
                                                <button
                                                    key={atalho.id}
                                                    onClick={() => atalhoDePeriodo(atalho.id)}
                                                    className="h-9 px-3 rounded-lg border border-white/60 bg-white/60 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white transition shadow-sm"
                                                >
                                                    {atalho.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div
                                    className="overflow-auto flex-1 custom-scrollbar"
                                    onScroll={(e) => {
                                        const el = e.currentTarget;
                                        // Puxa a próxima fatia antes de bater no fim, pra rolagem não travar.
                                        if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) carregarMaisLogs();
                                    }}
                                >
                                    <table className="min-w-full">
                                        <thead className="bg-white/80 backdrop-blur sticky top-0 z-10 shadow-sm">
                                            <tr className="text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                <th className="py-2 px-3 whitespace-nowrap">Data / Hora</th>
                                                <th className="py-2 px-3 whitespace-nowrap">Usuário</th>
                                                <th className="py-2 px-3 whitespace-nowrap">Ação</th>
                                                <th className="py-2 px-3">Detalhes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100/70">
                                            {loadingLogs ? (
                                                <tr><td colSpan="4" className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={24} /></td></tr>
                                            ) : logs.length > 0 ? (
                                                logs.map((log) => {
                                                    const acao = log.action?.toLowerCase() || '';
                                                    const bgColor = acao.includes('delete') || acao.includes('exclu') || acao.includes('removido') ? 'bg-rose-50/40' :
                                                        acao.includes('edit') || acao.includes('atualiz') ? 'bg-amber-50/40' :
                                                        acao.includes('login') ? 'bg-emerald-50/40' : '';
                                                    const detalhes = log.details || (log.data ? JSON.stringify(log.data) : '');
                                                    const aberto = logExpandido === log.id;
                                                    const d = log.timestamp ? new Date(log.timestamp) : null;
                                                    return (
                                                        <tr
                                                            key={log.id}
                                                            onClick={() => setLogExpandido(aberto ? null : log.id)}
                                                            className={`hover:bg-blue-50/50 transition-colors cursor-pointer align-top ${bgColor}`}
                                                            title="Clique para abrir/fechar o detalhe completo"
                                                        >
                                                            <td className="px-3 py-1.5 whitespace-nowrap text-[11px] font-bold text-slate-600 tabular-nums">
                                                                {d ? d.toLocaleDateString('pt-BR') : 'N/A'}
                                                                <span className="text-slate-400 ml-1.5">{d ? d.toLocaleTimeString('pt-BR') : ''}</span>
                                                            </td>
                                                            <td className="px-3 py-1.5" title={nomeDoLog(log)}>
                                                                <div className="text-[11px] font-black uppercase text-blue-600 max-w-[150px] truncate">{nomeDoLog(log)}</div>
                                                            </td>
                                                            <td className="px-3 py-1.5 whitespace-nowrap text-[10px] font-black uppercase text-slate-500 tracking-wide">
                                                                {log.action || 'Ação'}
                                                            </td>
                                                            {/* Detalhe cortado em 2 linhas: é o que fazia cada log ocupar
                                                                meia tela. O clique na linha abre o texto inteiro. */}
                                                            <td className="px-3 py-1.5 border-l border-slate-100 min-w-[320px]">
                                                                <div className={`text-[11px] text-slate-600 leading-snug ${aberto ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                                                                    {detalhes}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr><td colSpan="4" className="py-12 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Nenhum log encontrado.</td></tr>
                                            )}
                                            {carregandoMaisLogs && (
                                                <tr><td colSpan="4" className="py-4 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={18} /></td></tr>
                                            )}
                                            {/* A rolagem já puxa sozinha, mas o botão é o controle explícito:
                                                o usuário vê quanto falta e não fica dependendo do gesto. */}
                                            {!loadingLogs && !carregandoMaisLogs && logs.length > 0 && logs.length < totalLogs && (
                                                <tr><td colSpan="4" className="py-3 text-center">
                                                    <button
                                                        onClick={carregarMaisLogs}
                                                        className="bg-white/90 border border-slate-200 text-slate-600 h-8 px-5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-blue-600 transition shadow-sm"
                                                    >
                                                        Carregar mais {Math.min(LOGS_PAGINA_TELA, totalLogs - logs.length).toLocaleString('pt-BR')} — faltam {(totalLogs - logs.length).toLocaleString('pt-BR')}
                                                    </button>
                                                </td></tr>
                                            )}
                                            {!loadingLogs && !carregandoMaisLogs && logs.length > 0 && logs.length >= totalLogs && (
                                                <tr><td colSpan="4" className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                    Fim da lista — {totalLogs.toLocaleString('pt-BR')} registro(s) no filtro
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


export default Settings;