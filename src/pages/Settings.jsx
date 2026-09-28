import React, { useState, useEffect, useMemo } from 'react';
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
import ProcedureManager from './ProcedureManager';
import UserManagement from './UserManagement';
import ConfiguracoesApaTab from '../components/apa/ConfiguracoesApaTab';
import { usePermission } from '../contexts/PermissionContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { maskCPF } from '../utils/masks';
import * as XLSX from 'xlsx';
import { printReport } from '../utils/printReport';
import { extrairDadosDoPlantao } from '../utils/logEscalaParser';
import { useAuth } from '../contexts/AuthContext';

// --- BASE SUS TAB COMPONENT ---
const BaseSUSTab = () => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState('Aguardando arquivo do SIGTAP...');

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setStatus('Lendo arquivo...');
        const reader = new FileReader();

        // ISO-8859-1 garante que os acentos do governo venham corretos
        reader.readAsText(file, 'ISO-8859-1');

        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const lines = text.split('\n');
                const parsedData = [];

                // Processa linha por linha do TXT
                lines.forEach(line => {
                    if (line.length > 20) {
                        const codigo = line.substring(0, 10).trim();
                        const nome = line.substring(10, 260).trim();

                        if (codigo && nome) {
                            parsedData.push({ codigo, nome });
                        }
                    }
                });

                if (parsedData.length === 0) {
                    return toast.error("Nenhum procedimento encontrado. Verifique se é o arquivo tb_procedimento.txt");
                }

                uploadDataInBatches(parsedData);

            } catch (error) {
                console.error(error);
                toast.error("Erro ao ler o arquivo TXT.");
            }
        };
    };

    const uploadDataInBatches = async (data) => {
        setLoading(true);
        setTotal(data.length);
        let currentBatchIndex = 0;
        const batchSize = 450;
        const totalBatches = Math.ceil(data.length / batchSize);

        try {
            for (let i = 0; i < data.length; i += batchSize) {
                const chunk = data.slice(i, i + batchSize);
                const sigtapRecords = chunk.map(item => {
                    if (item.codigo && item.nome) {
                        return {
                            id: String(item.codigo),
                            codigo: String(item.codigo),
                            nome: item.nome.toUpperCase()
                        };
                    }
                    return null;
                }).filter(Boolean);

                if (sigtapRecords.length > 0) {
                    const { error } = await supabase.from('sigtap').upsert(sigtapRecords, { onConflict: 'id' });
                    if (error) throw error;
                    await logAction('ATUALIZAÇÃO SIGTAP', `Atualizou ${sigtapRecords.length} procedimentos (Lote ${currentBatchIndex}).`);
                }

                currentBatchIndex++;
                setProgress(Math.min((i + batchSize), data.length));
                setStatus(`Processando lote ${currentBatchIndex} de ${totalBatches}...`);

                await new Promise(resolve => setTimeout(resolve, 50));
            }

            setStatus('Importação Concluída!');
            toast.success(`${data.length} procedimentos atualizados com sucesso!`);
        } catch (error) {
            console.error(error);
            setStatus('Erro na importação.');
            toast.error("Falha na conexão com o banco.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto py-12">
            <div className="bg-white/60 backdrop-blur-lg p-10 rounded-[2.5rem] shadow-sm border border-white/60 text-center space-y-8">

                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-white shadow-lg shadow-blue-200">
                    <FileText size={36} />
                </div>

                <div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-widest">Importador SIGTAP</h2>
                    <p className="text-sm font-bold text-slate-500 mt-2 uppercase tracking-wide">
                        Aceita o arquivo oficial <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">tb_procedimento.txt</span>
                    </p>
                </div>

                {!loading && progress === 0 && (
                    <label className="block w-full cursor-pointer group">
                        <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
                        <div className="w-full py-8 border-2 border-dashed border-white/80 rounded-2xl bg-white/60 group-hover:bg-blue-50 group-hover:border-blue-300 transition-all flex flex-col items-center gap-2">
                            <UploadCloud size={28} className="text-slate-500 group-hover:text-blue-500 transition-colors" />
                            <span className="text-xs font-black text-slate-500 group-hover:text-blue-600 uppercase tracking-widest transition-colors">
                                Arraste o arquivo TXT ou clique aqui
                            </span>
                        </div>
                    </label>
                )}

                {loading && (
                    <div className="space-y-6">
                        <div className="w-full bg-white/70 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${(progress / total) * 100}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between text-[11px] font-black text-slate-500 uppercase tracking-widest">
                            <span>{progress} processados</span>
                            <span>{total} total</span>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-blue-600 animate-pulse">
                            <Loader2 className="animate-spin" size={16} />
                            <span className="text-xs font-black uppercase">{status}</span>
                        </div>
                    </div>
                )}

                {!loading && progress > 0 && progress === total && (
                    <div className="bg-emerald-50 text-emerald-600 p-6 rounded-2xl border border-emerald-100 flex flex-col items-center gap-2 font-black">
                        <CheckCircle size={32} />
                        <span className="uppercase text-sm tracking-widest">Importação Finalizada!</span>
                        <span className="text-[11px] opacity-70 font-bold">Base SUS atualizada com sucesso.</span>
                    </div>
                )}

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start gap-3 text-left shadow-sm">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 font-bold leading-relaxed">
                        ATENÇÃO: Este processo pode levar alguns minutos pois o arquivo do governo é grande. Não saia desta aba até a barra completar.
                    </p>
                </div>
            </div>
        </div>
    );
};

// O antigo PermissoesEscalaTab foi removido: era um segundo editor de permissões,
// sem link no menu havia tempos, que gravava chaves camelCase (verEscalaTodos,
// editarEscala…) na MESMA linha settings.id='permissions' usada pela Matriz de
// Permissões — nenhuma delas lida por lugar nenhum do sistema. Permissão de
// escala agora se ajusta na Matriz (Configurações › Usuários), pelo catálogo em
// src/config/permissions.js.

// --- IDENTIDADE VISUAL COMPONENT ---
const IdentidadeVisualTab = ({ data, setData }) => {
    const [nomeInstituicao, setNomeInstituicao] = useState(data.nomeInstituicao || 'Sistema de Saúde');
    const [corPrincipal, setCorPrincipal] = useState(data.corPrincipal || '#2563eb');
    const [logoUrl, setLogoUrl] = useState(data.logoUrl || '/logo.png');
    const [faviconUrl, setFaviconUrl] = useState(data.faviconUrl || '');
    const [executanteNome, setExecutanteNome] = useState(data.executanteNome || '');
    const [executanteCnes, setExecutanteCnes] = useState(data.executanteCnes || '');
    const [orgaoEmissor, setOrgaoEmissor] = useState(data.orgaoEmissor || '');
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
            executanteNome,
            executanteCnes,
            orgaoEmissor,
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
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome da Instituição/Prefeitura</label>
                    <input value={nomeInstituicao} onChange={e => setNomeInstituicao(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome do Estabelecimento Executante (AIH)</label>
                        <input value={executanteNome} onChange={e => setExecutanteNome(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700 uppercase" placeholder="Nome na AIH" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">CNES do Estabelecimento Executante (AIH)</label>
                        <input value={executanteCnes} onChange={e => setExecutanteCnes(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" placeholder="0000000" maxLength="7" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Cód. Órgão Emissor (AIH)</label>
                    <input value={orgaoEmissor} onChange={e => setOrgaoEmissor(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" placeholder="Ex: M350000001" />
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

// --- HUB PRINCIPAL CONFIG COMPONENT ---
const HubSettingsTab = ({ data, setData }) => {
    const [a1Name, setA1Name] = useState(data.hubAssistant1Name || 'Assistente 1');
    const [a1Whats, setA1Whats] = useState(data.hubAssistant1Whatsapp || '');
    const [a1Photo, setA1Photo] = useState(data.hubAssistant1Photo || '');
    const [a2Name, setA2Name] = useState(data.hubAssistant2Name || 'Assistente 2');
    const [a2Whats, setA2Whats] = useState(data.hubAssistant2Whatsapp || '');
    const [a2Photo, setA2Photo] = useState(data.hubAssistant2Photo || '');
    const [instagramLink, setInstagramLink] = useState(data.hubInstagramLink || '');
    const [carousel, setCarousel] = useState(data.hubCarouselImages || []);
    const [uploading, setUploading] = useState(false);
    const { reloadTheme } = useWhiteLabel();

    const handleSave = async () => {
        const updatedData = {
            ...data,
            hubAssistant1Name: a1Name, hubAssistant1Whatsapp: a1Whats, hubAssistant1Photo: a1Photo,
            hubAssistant2Name: a2Name, hubAssistant2Whatsapp: a2Whats, hubAssistant2Photo: a2Photo,
            hubInstagramLink: instagramLink,
            hubCarouselImages: carousel
        };
        try {
            const { error } = await supabase.from('settings').upsert({ id: 'general', data: updatedData });
            if (error) throw error;
            await logAction('HUB INICIAL', `Configurações do Hub Inicial alteradas.`);
            setData(updatedData);
            toast.success("Configurações do Hub salvas!");
            reloadTheme();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar.");
        }
    };

    const handlePhotoUpload = async (e, setter) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const compressedFile = await compressImage(file);
            const fileExt = compressedFile.name.split('.').pop() || 'png';
            const fileName = `assistant-${Date.now()}.${fileExt}`;
            const { error } = await supabase.storage.from('logos').upload(fileName, compressedFile);
            if (error) throw error;
            const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
            setter(publicUrlData.publicUrl);
            toast.success("Foto enviada!");
        } catch (error) {
            console.error(error);
            toast.error("Erro no upload.");
        } finally {
            setUploading(false);
        }
    };

    const handleCarouselUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        setUploading(true);
        try {
            const newUrls = [];
            for (let file of files) {
                const compressedFile = await compressImage(file);
                const fileExt = compressedFile.name.split('.').pop() || 'png';
                const fileName = `carousel-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { error } = await supabase.storage.from('logos').upload(fileName, compressedFile);
                if (error) throw error;
                const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
                newUrls.push(publicUrlData.publicUrl);
            }
            setCarousel([...carousel, ...newUrls]);
            toast.success("Imagens enviadas!");
        } catch (error) {
            console.error(error);
            toast.error("Erro no upload do carrossel.");
        } finally {
            setUploading(false);
        }
    };

    const removeCarouselImage = (index) => {
        const newCarousel = [...carousel];
        newCarousel.splice(index, 1);
        setCarousel(newCarousel);
    };

    return (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl border border-white/60 shadow-sm p-8 animate-in fade-in max-w-2xl mx-auto space-y-8">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> Suporte Rápido & Mídia
            </h2>
            <p className="text-xs font-bold text-slate-500 -mt-4">Conteúdo do widget "Suporte Rápido" (assistentes, redes sociais e galeria).</p>
            
            <div className="space-y-6">
                {/* Assistant 1 */}
                <div className="bg-white/60 p-4 rounded-xl border border-white/40 space-y-4">
                    <h3 className="font-bold text-slate-700 uppercase text-sm">Assistente 1</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome</label>
                            <input value={a1Name} onChange={e => setA1Name(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Link WhatsApp (https://wa.me/...)</label>
                            <input value={a1Whats} onChange={e => setA1Whats(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" placeholder="ex: https://wa.me/5511..." />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Foto do Assistente</label>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/80 flex items-center justify-center overflow-hidden bg-white/60">
                                {a1Photo ? <img src={a1Photo} alt="A1" className="w-full h-full object-cover"/> : <User size={20} className="text-slate-600"/>}
                            </div>
                            <label className="px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl hover:bg-white/60 text-xs font-bold rounded-lg cursor-pointer">
                                {uploading ? 'Enviando...' : 'Alterar Foto'}
                                <input type="file" accept="image/*" onChange={e => handlePhotoUpload(e, setA1Photo)} className="hidden" disabled={uploading}/>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Assistant 2 */}
                <div className="bg-white/60 p-4 rounded-xl border border-white/40 space-y-4">
                    <h3 className="font-bold text-slate-700 uppercase text-sm">Assistente 2</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome</label>
                            <input value={a2Name} onChange={e => setA2Name(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Link WhatsApp</label>
                            <input value={a2Whats} onChange={e => setA2Whats(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" placeholder="ex: https://wa.me/5511..." />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Foto do Assistente</label>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/80 flex items-center justify-center overflow-hidden bg-white/60">
                                {a2Photo ? <img src={a2Photo} alt="A2" className="w-full h-full object-cover"/> : <User size={20} className="text-slate-600"/>}
                            </div>
                            <label className="px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl hover:bg-white/60 text-xs font-bold rounded-lg cursor-pointer">
                                {uploading ? 'Enviando...' : 'Alterar Foto'}
                                <input type="file" accept="image/*" onChange={e => handlePhotoUpload(e, setA2Photo)} className="hidden" disabled={uploading}/>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Redes Sociais */}
                <div className="bg-white/60 p-4 rounded-xl border border-white/40 space-y-4">
                    <h3 className="font-bold text-slate-700 uppercase text-sm">Redes Sociais</h3>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Link do Instagram</label>
                        <input value={instagramLink} onChange={e => setInstagramLink(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" placeholder="ex: https://instagram.com/suaempresa" />
                    </div>
                </div>

                {/* Carousel */}
                <div className="bg-white/60 p-4 rounded-xl border border-white/40 space-y-4">
                    <h3 className="font-bold text-slate-700 uppercase text-sm">Galeria de Imagens (Carrossel)</h3>
                    <label className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-2">
                        {uploading ? <Loader2 size={14} className="animate-spin"/> : <UploadCloud size={14} />}
                        Adicionar Imagens
                        <input type="file" accept="image/*" multiple onChange={handleCarouselUpload} className="hidden" disabled={uploading}/>
                    </label>
                    <div className="flex gap-2 flex-wrap mt-4">
                        {carousel.map((img, idx) => (
                            <div key={idx} className="relative group w-24 h-16 rounded-lg overflow-hidden border border-white/60 shadow-sm">
                                <img src={img} className="w-full h-full object-cover" />
                                <button onClick={() => removeCarouselImage(idx)} className="absolute inset-0 bg-black/50 text-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                                    X
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-6 border-t border-white/60 flex justify-end">
                    <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2">
                        <Check size={16} /> Salvar Hub
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- UNIDADES MANAGER COMPONENT ---
const UnidadesManager = () => {
    const [unidades, setUnidades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newUnidade, setNewUnidade] = useState('');
    const [newCnes, setNewCnes] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [editCnes, setEditCnes] = useState('');
    // Identidade institucional impressa no cabeçalho dos documentos (ex.: a folha
    // anexa de Requisição de Transfusão). Cada unidade tem a sua — o deploy
    // atende vários hospitais, então não dá para ter uma identidade só.
    const [editIdentidade, setEditIdentidade] = useState({ razao_social: '', endereco: '', cidade: '', cnpj: '', contato: '', logo_url: '' });
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => {
        fetchUnidades();
    }, []);

    const fetchUnidades = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('unidades').select('*').order('nome');
        if (!error) setUnidades(data || []);
        setLoading(false);
    };

    const handleAdd = async () => {
        if (!newUnidade.trim()) return;
        const { error } = await supabase.from('unidades').insert([{ nome: newUnidade, cnes: newCnes, tipo: 'Padrão' }]);
        if (!error) {
            await logAction('CRIAÇÃO DE UNIDADE', `Unidade adicionada: ${newUnidade} (CNES: ${newCnes})`);
            toast.success('Unidade adicionada!');
            setNewUnidade('');
            setNewCnes('');
            fetchUnidades();
        } else {
            toast.error('Erro ao adicionar unidade.');
        }
    };

    const handleLogoUpload = async (e, unidadeId) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop() || 'png';
            const fileName = `unidade-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, file);
            if (uploadError) throw uploadError;
            const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
            const url = publicUrlData.publicUrl;
            setEditIdentidade(prev => ({ ...prev, logo_url: url }));
            // Grava na hora: a logo já está no storage, não faz sentido depender
            // de alguém lembrar de apertar o ✓ depois.
            const { error: saveError } = await supabase.from('unidades').update({ logo_url: url }).eq('id', unidadeId);
            if (saveError) throw saveError;
            setUnidades(prev => prev.map(u => u.id === unidadeId ? { ...u, logo_url: url } : u));
            toast.success('Logo enviada e salva!');
        } catch (error) {
            console.error(error);
            toast.error('Erro no upload da logo.');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleRemoverLogo = async (unidadeId) => {
        setEditIdentidade(prev => ({ ...prev, logo_url: '' }));
        const { error } = await supabase.from('unidades').update({ logo_url: null }).eq('id', unidadeId);
        if (error) return toast.error('Erro ao remover a logo.');
        setUnidades(prev => prev.map(u => u.id === unidadeId ? { ...u, logo_url: null } : u));
        toast.success('Logo removida.');
    };

    const abrirEdicao = (u) => {
        setEditingId(u.id);
        setEditValue(u.nome);
        setEditCnes(u.cnes || '');
        setEditIdentidade({
            razao_social: u.razao_social || '', endereco: u.endereco || '',
            cidade: u.cidade || '', cnpj: u.cnpj || '', contato: u.contato || '', logo_url: u.logo_url || ''
        });
    };

    const handleEdit = async (id) => {
        if (!editValue.trim()) return;
        const { error } = await supabase.from('unidades').update({ nome: editValue, cnes: editCnes, ...editIdentidade }).eq('id', id);
        if (!error) {
            await logAction('EDIÇÃO DE UNIDADE', `Unidade alterada para: ${editValue} (CNES: ${editCnes})`);
            toast.success('Unidade atualizada!');
            setEditingId(null);
            fetchUnidades();
        } else {
            toast.error('Erro ao atualizar unidade.');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Remover esta unidade?")) return;
        const unidade = unidades.find(u => u.id === id);
        const { error } = await supabase.from('unidades').delete().eq('id', id);
        if (!error) {
            if (unidade) {
                await logAction('EXCLUSÃO DE UNIDADE', `A unidade ${unidade.nome} foi removida das configurações.`);
            }
            toast.success('Unidade removida!');
            fetchUnidades();
        } else {
            toast.error('Erro ao remover unidade.');
        }
    };

    return (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl border border-white/60 shadow-sm p-8 animate-in fade-in max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> Unidades de Atendimento
            </h2>
            <div className="flex gap-2">
                <input value={newUnidade} onChange={e => setNewUnidade(e.target.value)} placeholder="Nova Unidade..." className="flex-1 h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700 uppercase" />
                <input value={newCnes} onChange={e => setNewCnes(e.target.value)} placeholder="CNES..." maxLength="7" className="w-24 h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" />
                <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase px-4 rounded-xl shadow-lg transition-all active:scale-95">Adicionar</button>
            </div>
            {loading ? <div className="p-4 text-center"><Loader2 className="animate-spin text-blue-500 mx-auto" /></div> : (
                <ul className="space-y-2">
                    {unidades.map(u => (
                        <li key={u.id} className={`flex justify-between bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl p-2 rounded-xl ${editingId === u.id ? 'items-start' : 'items-center'}`}>
                            {editingId === u.id ? (
                                <div className="flex flex-col gap-3 w-full">
                                    <div className="flex gap-2">
                                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="flex-1 px-2 py-2 rounded-lg border border-blue-400 outline-none text-sm font-bold text-slate-700 uppercase" />
                                        <input value={editCnes} onChange={e => setEditCnes(e.target.value)} placeholder="CNES" maxLength="7" className="w-24 px-2 py-2 rounded-lg border border-blue-400 outline-none text-sm font-bold text-slate-700" />
                                        <button onClick={() => handleEdit(u.id)} className="text-emerald-600 font-bold px-3"><Check size={16} /></button>
                                        <button onClick={() => setEditingId(null)} className="text-rose-600 font-bold px-3"><X size={16} /></button>
                                    </div>

                                    {/* Identidade impressa no cabeçalho dos documentos desta unidade */}
                                    <div className="border-t border-slate-200 pt-3 space-y-2">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Identidade para documentos</p>
                                        <input value={editIdentidade.razao_social} onChange={e => setEditIdentidade({ ...editIdentidade, razao_social: e.target.value })} placeholder="Razão social (ex: Hospital Central de...)" className="w-full px-2 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-400 text-xs font-semibold text-slate-700" />
                                        <input value={editIdentidade.endereco} onChange={e => setEditIdentidade({ ...editIdentidade, endereco: e.target.value })} placeholder="Endereço completo com CEP" className="w-full px-2 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-400 text-xs font-semibold text-slate-700" />
                                        <div className="flex gap-2">
                                            <input value={editIdentidade.cidade} onChange={e => setEditIdentidade({ ...editIdentidade, cidade: e.target.value })} placeholder="Cidade (usada no fecho: 'São Paulo, 01 de setembro de 2026')" className="flex-1 px-2 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-400 text-xs font-semibold text-slate-700" />
                                            <input value={editIdentidade.cnpj} onChange={e => setEditIdentidade({ ...editIdentidade, cnpj: e.target.value })} placeholder="CNPJ" className="w-56 px-2 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-400 text-xs font-semibold text-slate-700" />
                                        </div>
                                        <input value={editIdentidade.contato} onChange={e => setEditIdentidade({ ...editIdentidade, contato: e.target.value })} placeholder="Contato do timbre (ex: Telefone: (11) 0000-0000 - E-mail: contato@hospital.com.br)" className="w-full px-2 py-2 rounded-lg border border-slate-300 outline-none focus:border-blue-400 text-xs font-semibold text-slate-700" />
                                        <div className="flex items-center gap-3">
                                            {editIdentidade.logo_url
                                                ? <img src={editIdentidade.logo_url} alt="Logo da unidade" className="h-10 w-auto object-contain rounded bg-white border border-slate-200 p-1" />
                                                : <div className="h-10 w-20 rounded bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400 uppercase">Sem logo</div>}
                                            <label className="cursor-pointer text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors">
                                                {uploadingLogo ? 'Enviando...' : 'Enviar logo'}
                                                <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={(e) => handleLogoUpload(e, u.id)} />
                                            </label>
                                            {editIdentidade.logo_url && <button onClick={() => handleRemoverLogo(u.id)} className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-700">Remover</button>}
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-semibold">Vazio não quebra nada: o documento sai só com o nome da unidade.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-3 ml-2">
                                        {u.logo_url && <img src={u.logo_url} alt="" className="h-8 w-auto object-contain" onError={(e) => e.target.style.display = 'none'} />}
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 uppercase leading-tight">{u.nome}</span>
                                            <span className="text-[11px] font-bold text-slate-500 uppercase mt-0.5">
                                                CNES: {u.cnes || 'N/A'}
                                                {!u.razao_social && <span className="ml-2 text-amber-600">· sem identidade p/ documentos</span>}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => abrirEdicao(u)} className="p-1.5 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"><Edit2 size={14} /></button>
                                        <button onClick={() => handleDelete(u.id)} className="p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md"><Trash2 size={14} /></button>
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                    {unidades.length === 0 && <p className="text-xs text-slate-500 font-bold uppercase text-center py-4">Nenhuma unidade cadastrada.</p>}
                </ul>
            )}
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

// --- MOTIVOS SUSPENSAO MANAGER COMPONENT ---
const MotivosSuspensaoManager = () => {
    const [motivos, setMotivos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [novoMotivo, setNovoMotivo] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState('');

    useEffect(() => {
        fetchMotivos();
    }, []);

    const fetchMotivos = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('motivos_suspensao').select('*').order('descricao');
        if (!error) setMotivos(data || []);
        setLoading(false);
    };

    const handleAdd = async () => {
        if (!novoMotivo.trim()) return;
        const { error } = await supabase.from('motivos_suspensao').insert([{ descricao: novoMotivo, ativo: true }]);
        if (!error) {
            await logAction('CRIAÇÃO DE MOTIVO DE SUSPENSÃO', `Novo motivo: ${novoMotivo}`);
            toast.success('Motivo adicionado!');
            setNovoMotivo('');
            fetchMotivos();
        } else {
            toast.error('Erro ao adicionar motivo.');
        }
    };

    const handleEdit = async (id) => {
        if (!editValue.trim()) return;
        const { error } = await supabase.from('motivos_suspensao').update({ descricao: editValue }).eq('id', id);
        if (!error) {
            await logAction('EDIÇÃO DE MOTIVO DE SUSPENSÃO', `Motivo alterado para: ${editValue}`);
            toast.success('Motivo atualizado!');
            setEditingId(null);
            fetchMotivos();
        } else {
            toast.error('Erro ao atualizar motivo.');
        }
    };

    const handleToggleAtivo = async (id, isAtivo) => {
        const { error } = await supabase.from('motivos_suspensao').update({ ativo: !isAtivo }).eq('id', id);
        if (!error) {
            await logAction('STATUS DE MOTIVO DE SUSPENSÃO', `Status do motivo alterado para: ${!isAtivo ? 'Ativo' : 'Inativo'}`);
            toast.success(isAtivo ? 'Desativado!' : 'Ativado!');
            fetchMotivos();
        } else {
            toast.error('Erro ao alterar status.');
        }
    };

    const handleDelete = async (id) => {
         if (!window.confirm("Remover este motivo permanentemente? Se ele já foi usado, o sistema pode impedir. Nesses casos, prefira apenas DESATIVAR.")) return;
         const motivo = motivos.find(m => m.id === id);
         const { error } = await supabase.from('motivos_suspensao').delete().eq('id', id);
         if (!error) {
             if (motivo) {
                 await logAction('EXCLUSÃO DE MOTIVO DE SUSPENSÃO', `O motivo "${motivo.motivo}" foi removido das configurações.`);
             }
             toast.success('Removido com sucesso!');
             fetchMotivos();
         } else {
             toast.error('Erro ao remover (pode estar em uso por alguma cirurgia).');
         }
    };

    return (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl border border-white/60 shadow-sm p-8 animate-in fade-in max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div> Motivos de Suspensão
            </h2>
            <div className="flex gap-2">
                <input value={novoMotivo} onChange={e => setNovoMotivo(e.target.value)} placeholder="Novo Motivo (Ex: Falta de Jejum)..." className="flex-1 h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-orange-500 text-sm font-bold text-slate-700 uppercase" />
                <button onClick={handleAdd} className="bg-orange-600 hover:bg-orange-700 text-slate-800 font-black text-xs uppercase px-4 rounded-xl shadow-lg transition-all active:scale-95">Adicionar</button>
            </div>
            {loading ? <div className="p-4 text-center"><Loader2 className="animate-spin text-orange-500 mx-auto" /></div> : (
                <ul className="space-y-2">
                    {motivos.map(u => (
                        <li key={u.id} className={`flex justify-between items-center bg-white/60 border ${u.ativo ? 'border-white/60' : 'border-rose-200 bg-rose-50/20'} p-2 rounded-xl`}>
                            {editingId === u.id ? (
                                <div className="flex gap-2 w-full">
                                    <input value={editValue} onChange={e => setEditValue(e.target.value)} className="flex-1 px-2 py-2 rounded-lg border border-orange-400 outline-none text-sm font-bold text-slate-700 uppercase" />
                                    <button onClick={() => handleEdit(u.id)} className="text-emerald-600 font-bold px-3"><Check size={16} /></button>
                                    <button onClick={() => setEditingId(null)} className="text-rose-600 font-bold px-3"><X size={16} /></button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col ml-2">
                                        <span className={`text-sm font-bold uppercase leading-tight ${u.ativo ? 'text-slate-700' : 'text-slate-500 line-through'}`}>{u.descricao}</span>
                                        <span className={`text-[11px] font-bold uppercase mt-0.5 ${u.ativo ? 'text-emerald-500' : 'text-rose-500'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <button onClick={() => handleToggleAtivo(u.id, u.ativo)} title={u.ativo ? 'Desativar este motivo' : 'Reativar este motivo'} className={`p-1 text-[11px] font-bold uppercase border rounded-md mr-1 ${u.ativo ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>{u.ativo ? 'Desativar' : 'Ativar'}</button>
                                        <button onClick={() => { setEditingId(u.id); setEditValue(u.descricao); }} className="p-1.5 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"><Edit2 size={14} /></button>
                                        <button onClick={() => handleDelete(u.id)} className="p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md"><Trash2 size={14} /></button>
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                    {motivos.length === 0 && <p className="text-xs text-slate-500 font-bold uppercase text-center py-4">Nenhum motivo cadastrado.</p>}
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


// --- ORIENTACOES E REGRAS DE INTERNAÇÃO MANAGER COMPONENT ---
const OrientacoesManager = () => {
    const [orientacoes, setOrientacoes] = useState({});
    const [regras, setRegras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [editingKey, setEditingKey] = useState(null);
    const [editTitleValue, setEditTitleValue] = useState('');

    // Estados da nova regra
    const [newRegraTipo, setNewRegraTipo] = useState('mesmo');
    const [newRegraHorario, setNewRegraHorario] = useState('07:00');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Busca os Textos e converte o formato antigo para o novo caso necessário
            const { data: oriData } = await supabase.from('settings').select('data').eq('id', 'orientacoes').maybeSingle();
            if (oriData && oriData.data) {
                const migrado = {};
                Object.keys(oriData.data).forEach(k => {
                    migrado[k] = typeof oriData.data[k] === 'string' 
                        ? { texto: oriData.data[k], regraInternacao: 'dia_anterior' } 
                        : oriData.data[k];
                });
                setOrientacoes(migrado);
            }

            // Busca as Regras de Horário (ou aplica o padrão se não existir)
            const { data: regData } = await supabase.from('settings').select('data').eq('id', 'regras_internacao').maybeSingle();
            if (regData && regData.data?.lista) {
                setRegras(regData.data.lista);
            } else {
                setRegras([
                    { id: 'dia_anterior', label: 'Internar no DIA ANTERIOR às 19:00', tipo: 'anterior', horario: '19:00' },
                    { id: 'mesmo_dia_07h', label: 'Internar no MESMO DIA às 07:00', tipo: 'mesmo', horario: '07:00' },
                    { id: 'mesmo_dia_11h', label: 'Internar no MESMO DIA às 11:00', tipo: 'mesmo', horario: '11:00' }
                ]);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // --- Ações de Regras de Horário ---
    const handleAddRegra = async () => {
        if (!newRegraHorario) return toast.error('Informe o horário!');
        const id = `${newRegraTipo}_${newRegraHorario.replace(':', '')}`;
        if (regras.some(r => r.id === id)) return toast.error('Esta regra já existe.');

        const label = newRegraTipo === 'anterior' 
            ? `Internar no DIA ANTERIOR às ${newRegraHorario}`
            : `Internar no MESMO DIA às ${newRegraHorario}`;

        const updated = [...regras, { id, label, tipo: newRegraTipo, horario: newRegraHorario }];
        setRegras(updated);
        try {
            await supabase.from('settings').upsert({ id: 'regras_internacao', data: { lista: updated } });
            await logAction('REGRA DE INTERNAÇÃO', `Horário de internação adicionado: ${newRegraHorario}`);
            toast.success('Horário adicionado!');
        } catch (error) { toast.error('Erro ao salvar regra.'); }
    };

    const handleRemoveRegra = async (idToRemove) => {
        if (!window.confirm("Remover este horário? As especialidades que o utilizam voltarão para o padrão.")) return;
        const updated = regras.filter(r => r.id !== idToRemove);
        setRegras(updated);
        try {
            await supabase.from('settings').upsert({ id: 'regras_internacao', data: { lista: updated } });
            await logAction('REGRA DE INTERNAÇÃO', `Horário de internação removido.`);
            toast.success('Horário removido!');
        } catch (error) { toast.error('Erro ao remover regra.'); }
    };

    // --- Ações de Especialidades ---
    const handleSave = async (silent = false) => {
        if (!silent) setSaving(true);
        try {
            await supabase.from('settings').upsert({ id: 'orientacoes', data: orientacoes });
            await logAction('ORIENTAÇÕES/REGRAS', 'Ajustes gerais nas orientações e regras salvos.');
            if (!silent) toast.success('Ajustes salvos com sucesso!');
        } catch (error) { if (!silent) toast.error('Erro ao salvar.'); } finally { if (!silent) setSaving(false); }
    };

    const handleAddType = async () => {
        const key = newKey.trim();
        if (!key) return;
        if (orientacoes[key]) return toast.error('Esse tipo já existe.');
        const updated = { ...orientacoes, [key]: { texto: 'Insira o texto...', regraInternacao: 'dia_anterior' } };
        setOrientacoes(updated); setNewKey('');
        try { await supabase.from('settings').upsert({ id: 'orientacoes', data: updated }); await logAction('ORIENTAÇÕES DE ESPECIALIDADE', `Especialidade "${key}" adicionada.`); toast.success('Especialidade adicionada!'); } catch (error) {}
    };

    const handleRemoveType = async (keyToRemove) => {
        if (!window.confirm(`Excluir as orientações de "${keyToRemove}"?`)) return;
        const updated = { ...orientacoes }; delete updated[keyToRemove]; setOrientacoes(updated);
        try { await supabase.from('settings').upsert({ id: 'orientacoes', data: updated }); await logAction('ORIENTAÇÕES DE ESPECIALIDADE', `Especialidade "${keyToRemove}" excluída.`); toast.success('Excluído!'); } catch (error) {}
    };

    const handleRenameType = async (oldKey) => {
        const newKey = editTitleValue.trim();
        if (!newKey || newKey === oldKey) return setEditingKey(null);
        if (orientacoes[newKey]) return toast.error('Nome já existe.');
        const updated = { ...orientacoes }; updated[newKey] = updated[oldKey]; delete updated[oldKey];
        setOrientacoes(updated); setEditingKey(null);
        try { await supabase.from('settings').upsert({ id: 'orientacoes', data: updated }); await logAction('ORIENTAÇÕES DE ESPECIALIDADE', `Especialidade "${oldKey}" renomeada para "${newKey}".`); toast.success('Renomeado!'); } catch (error) {}
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;

    return (
        <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/60 shadow-sm p-6 animate-in fade-in duration-300 space-y-8">
            
            <div className="border-b border-white/60 pb-4">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={20} className="text-blue-600" /> Fluxo de Internação e Orientações
                </h2>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                    Gerencie os horários e textos que sairão no PDF do paciente
                </p>
            </div>

            {/* BLOCO 1: REGRAS DE HORÁRIO */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-700 uppercase flex items-center gap-2 tracking-widest pl-1">
                    <Clock size={14} className="text-blue-500"/> 1. Horários de Internação
                </h3>
                
                <div className="flex flex-col sm:flex-row gap-2 bg-slate-50/80 p-3 rounded-xl border border-white/60 shadow-sm items-center">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nova Regra:</span>
                    <select value={newRegraTipo} onChange={e => setNewRegraTipo(e.target.value)} className="h-9 px-3 rounded-lg border border-white/60 outline-none focus:border-blue-500 text-xs font-bold text-slate-700 bg-white/60">
                        <option value="anterior">Internar no Dia Anterior</option>
                        <option value="mesmo">Internar no Mesmo Dia</option>
                    </select>
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">às</span>
                    <input type="time" value={newRegraHorario} onChange={e => setNewRegraHorario(e.target.value)} className="h-9 px-3 rounded-lg border border-white/60 outline-none focus:border-blue-500 text-xs font-bold text-slate-700 bg-white/60" />
                    <button onClick={handleAddRegra} className="bg-blue-600 text-white px-4 h-9 rounded-lg font-black text-[11px] uppercase hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm sm:ml-auto w-full sm:w-auto justify-center">
                        <Plus size={14} /> Adicionar
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 px-1">
                    {regras.map(r => (
                        <div key={r.id} className="flex items-center gap-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 shadow-sm group">
                            {r.label}
                            <button onClick={() => handleRemoveRegra(r.id)} className="text-slate-600 hover:text-rose-500 transition-colors" title="Remover Regra"><X size={14}/></button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-px w-full bg-slate-200/60"></div>

            {/* BLOCO 2: ESPECIALIDADES */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-700 uppercase flex items-center gap-2 tracking-widest pl-1">
                    <FileText size={14} className="text-emerald-500"/> 2. Textos por Especialidade
                </h3>

                <div className="flex gap-2 bg-white/60 p-3 rounded-xl border border-white/60 shadow-sm">
                    <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Nova Especialidade (Ex: Ortopedia)" className="flex-1 h-9 px-3 rounded-lg border border-white/60 outline-none focus:border-blue-500 text-sm font-bold text-slate-700" onKeyDown={e => e.key === 'Enter' && handleAddType()} />
                    <button onClick={handleAddType} disabled={!newKey.trim()} className="bg-slate-800 text-white px-4 h-9 rounded-lg font-black text-[11px] uppercase hover:bg-slate-900 transition-all flex items-center gap-1 shadow-sm disabled:opacity-50">
                        <Plus size={14} /> Criar
                    </button>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2 pt-2">
                    {Object.entries(orientacoes).map(([key, config]) => {
                        const currentConfig = typeof config === 'string' ? { texto: config, regraInternacao: 'dia_anterior' } : config;
                        return (
                            <div key={key} className="bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl overflow-hidden shadow-sm group">
                                <div className="flex justify-between items-center px-4 py-2.5 bg-white/60 border-b border-white/60">
                                    {editingKey === key ? (
                                        <div className="flex items-center gap-2 animate-in fade-in">
                                            <input value={editTitleValue} onChange={(e) => setEditTitleValue(e.target.value)} className="h-7 px-2 border border-blue-400 rounded text-xs font-black text-slate-700 uppercase outline-none focus:border-blue-600 shadow-sm" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleRenameType(key); if (e.key === 'Escape') setEditingKey(null); }} />
                                            <button onClick={() => handleRenameType(key)} className="text-emerald-600 hover:bg-emerald-100 p-1 rounded transition-colors"><Check size={14}/></button>
                                            <button onClick={() => setEditingKey(null)} className="text-rose-600 hover:bg-rose-100 p-1 rounded transition-colors"><X size={14}/></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group/title">
                                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{key}</h3>
                                            <button onClick={() => { setEditingKey(key); setEditTitleValue(key); }} className="text-slate-600 hover:text-blue-600 opacity-0 group-hover/title:opacity-100 transition-all"><Edit2 size={12} /></button>
                                        </div>
                                    )}
                                    <button onClick={() => handleRemoveType(key)} className="text-slate-500 hover:text-rose-600 bg-white/60 hover:bg-rose-50 p-1.5 rounded-lg border border-white/60 hover:border-rose-200 transition-all shadow-sm"><Trash2 size={14} /></button>
                                </div>
                                <div className="p-4 flex flex-col gap-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {/* Bloco 1: Regra de Internação */}
                                        <div className="flex flex-col gap-1.5 bg-blue-50/50 p-3 rounded-xl border border-blue-100 shadow-sm">
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={14} className="text-blue-500" />
                                                <span className="text-[11px] font-black uppercase tracking-widest text-blue-800">1. Horário da Internação:</span>
                                            </div>
                                            <select 
                                                value={currentConfig.regraInternacao || 'dia_anterior'}
                                                onChange={(e) => setOrientacoes({ ...orientacoes, [key]: { ...currentConfig, regraInternacao: e.target.value } })}
                                                className="w-full h-9 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs font-black text-slate-700 outline-none focus:border-blue-500 uppercase tracking-wide cursor-pointer"
                                            >
                                                {regras.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                            </select>
                                        </div>

                                        {/* Bloco 2: Horário Estático da Cirurgia no PDF */}
                                        <div className="flex flex-col gap-1.5 bg-purple-50/50 p-3 rounded-xl border border-purple-100 shadow-sm">
                                            <div className="flex items-center gap-1.5">
                                                <Activity size={14} className="text-purple-500" />
                                                <span className="text-[11px] font-black uppercase tracking-widest text-purple-800">2. Horário da Cirurgia (No PDF):</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="time"
                                                    value={currentConfig.horarioCirurgiaPdf || ''}
                                                    onChange={(e) => setOrientacoes({ ...orientacoes, [key]: { ...currentConfig, horarioCirurgiaPdf: e.target.value } })}
                                                    className="flex-1 h-9 px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-xs font-black text-slate-700 outline-none focus:border-purple-500 transition-all cursor-pointer"
                                                />
                                                <button onClick={() => setOrientacoes({ ...orientacoes, [key]: { ...currentConfig, horarioCirurgiaPdf: '' } })} className="px-3 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-[10px] font-bold text-slate-500 hover:text-rose-500 hover:border-rose-200 uppercase transition-colors shadow-sm" title="Limpar e usar horário do Mapa">
                                                    Usar do Mapa
                                                </button>
                                            </div>
                                            <p className="text-[8.5px] font-bold text-purple-600/70 uppercase leading-tight mt-0.5 ml-1">Deixe em branco para usar o horário exato da agenda.</p>
                                        </div>
                                    </div>
                                    <textarea
                                        value={currentConfig.texto}
                                        onChange={(e) => setOrientacoes({ ...orientacoes, [key]: { ...currentConfig, texto: e.target.value } })}
                                        className="w-full min-h-[140px] p-4 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-y leading-relaxed"
                                        placeholder={`Escreva as orientações para ${key}...`}
                                    />
                                    <div className="flex justify-end mt-1">
                                        <button onClick={() => handleSave(false)} disabled={saving} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-5 py-2 rounded-lg font-black text-[11px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm disabled:opacity-50">
                                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar Ajustes
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const medicamentosComuns = [
    // ANALGÉSICOS, ANTITÉRMICOS E ANTI-INFLAMATÓRIOS
    { nome: 'DIPIRONA 500mg', posologia: 'Tomar 1 comp. via oral de 6/6h se dor ou febre', tipo: 'simples' },
    { nome: 'DIPIRONA 1g', posologia: 'Tomar 1 comp. via oral de 6/6h se dor ou febre forte', tipo: 'simples' },
    { nome: 'DIPIRONA GOTAS 500mg/mL', posologia: 'Tomar 1 gota por kg de peso via oral de 6/6h se febre', tipo: 'simples' },
    { nome: 'NOVALGINA 1g', posologia: 'Tomar 1 comp. via oral de 6/6h se dor ou febre', tipo: 'simples' },
    { nome: 'PARACETAMOL 750mg', posologia: 'Tomar 1 comp. via oral de 6/6h se dor ou febre', tipo: 'simples' },
    { nome: 'PARACETAMOL GOTAS 200mg/mL', posologia: 'Tomar 1 gota por kg de peso via oral de 6/6h se febre', tipo: 'simples' },
    { nome: 'IBUPROFENO 600mg', posologia: 'Tomar 1 comp. via oral de 8/8h após as refeições', tipo: 'simples' },
    { nome: 'IBUPROFENO GOTAS 50mg/mL', posologia: 'Tomar 1 gota por kg via oral de 8/8h se febre', tipo: 'simples' },
    { nome: 'NIMESULIDA 100mg', posologia: 'Tomar 1 comp. via oral de 12/12h por 5 dias', tipo: 'simples' },
    { nome: 'DICLOFENACO DE SÓDIO 50mg', posologia: 'Tomar 1 comp. via oral de 8/8h por 5 dias', tipo: 'simples' },
    { nome: 'CETOPROFENO 100mg', posologia: 'Tomar 1 comp. via oral de 12/12h por 5 dias', tipo: 'simples' },
    { nome: 'NAPROXENO 500mg', posologia: 'Tomar 1 comp. via oral de 12/12h por 5 dias', tipo: 'simples' },
    { nome: 'CELECOXIBE 200mg', posologia: 'Tomar 1 caps. via oral 1x ao dia por 7 dias', tipo: 'simples' },
    { nome: 'TROMETAMOL CETOROLACO 10mg', posologia: 'Tomar 1 comp. sublingual de 8/8h se dor forte (máx 5 dias)', tipo: 'simples' },

    // CORTICÓIDES
    { nome: 'PREDNISONA 20mg', posologia: 'Tomar 1 comp. via oral 1x ao dia pela manhã por 5 dias', tipo: 'simples' },
    { nome: 'PREDNISONA 5mg', posologia: 'Tomar 1 comp. via oral 1x ao dia pela manhã', tipo: 'simples' },
    { nome: 'PREDNISOLONA XAROPE 3mg/mL', posologia: 'Tomar conforme peso via oral de manhã por 5 dias', tipo: 'simples' },
    { nome: 'DEXAMETASONA 4mg', posologia: 'Tomar 1 comp. via oral de 8/8h por 5 dias', tipo: 'simples' },
    { nome: 'DEFLAZACORTE 30mg', posologia: 'Tomar 1 comp. via oral 1x ao dia por 5 dias', tipo: 'simples' },

    // ANTIBIÓTICOS (Devem reter receita, mas geralmente colocamos no comum e a farmácia retém a 2a via se for gerada manualmente, mas podemos classificar como controle para forçar 2 vias)
    { nome: 'AMOXICILINA 500mg', posologia: 'Tomar 1 caps. via oral de 8/8h por 7 dias', tipo: 'controle' },
    { nome: 'AMOXICILINA 875mg + CLAVULANATO', posologia: 'Tomar 1 comp. via oral de 12/12h por 7 dias', tipo: 'controle' },
    { nome: 'AZITROMICINA 500mg', posologia: 'Tomar 1 comp. via oral 1x ao dia por 5 dias', tipo: 'controle' },
    { nome: 'CEFALEXINA 500mg', posologia: 'Tomar 1 caps. via oral de 6/6h por 7 dias', tipo: 'controle' },
    { nome: 'CIPROFLOXACINO 500mg', posologia: 'Tomar 1 comp. via oral de 12/12h por 7 dias', tipo: 'controle' },
    { nome: 'LEVOFLOXACINO 500mg', posologia: 'Tomar 1 comp. via oral 1x ao dia por 7 dias', tipo: 'controle' },
    { nome: 'SULFAMETOXAZOL + TRIMETOPRIMA 800/160mg', posologia: 'Tomar 1 comp. via oral de 12/12h por 7 dias', tipo: 'controle' },
    { nome: 'NITROFURANTOÍNA 100mg', posologia: 'Tomar 1 caps. via oral de 6/6h por 7 dias', tipo: 'controle' },
    { nome: 'CEFTRIAXONA 1g (IM)', posologia: 'Aplicar 1 ampola intramuscular 1x ao dia por 3 dias', tipo: 'controle' },
    { nome: 'METRONIDAZOL 400mg', posologia: 'Tomar 1 comp. via oral de 8/8h por 7 dias', tipo: 'controle' },

    // GASTROINTESTINAL E ANTIEMÉTICOS
    { nome: 'OMEPRAZOL 20mg', posologia: 'Tomar 1 caps. via oral em jejum', tipo: 'simples' },
    { nome: 'PANTOPRAZOL 40mg', posologia: 'Tomar 1 comp. via oral em jejum', tipo: 'simples' },
    { nome: 'ESOMEPRAZOL 40mg', posologia: 'Tomar 1 comp. via oral em jejum', tipo: 'simples' },
    { nome: 'DOMPERIDONA 10mg', posologia: 'Tomar 1 comp. via oral 30 min antes das refeições', tipo: 'simples' },
    { nome: 'METOCLOPRAMIDA 10mg (PLASIL)', posologia: 'Tomar 1 comp. via oral de 8/8h se enjoo', tipo: 'simples' },
    { nome: 'ONDANSETRONA 4mg', posologia: 'Tomar 1 comp. sublingual de 8/8h se enjoo/vômito', tipo: 'simples' },
    { nome: 'BROMETO DE PINAVÉRIO 100mg', posologia: 'Tomar 1 comp. via oral de 12/12h', tipo: 'simples' },
    { nome: 'BESCOPAN COMPOSTO', posologia: 'Tomar 1 comp. via oral de 8/8h se cólica', tipo: 'simples' },
    { nome: 'DIMETICONA (SIMETICONA) 40mg', posologia: 'Tomar 1 comp. via oral de 8/8h se gases', tipo: 'simples' },
    { nome: 'BISACODIL 5mg', posologia: 'Tomar 1 drágea via oral à noite', tipo: 'simples' },

    // ANTI-HIPERTENSIVOS E CARDIOLOGIA
    { nome: 'LOSARTANA POTÁSSICA 50mg', posologia: 'Tomar 1 comp. via oral 1x ao dia de manhã', tipo: 'simples' },
    { nome: 'ENALAPRIL 20mg', posologia: 'Tomar 1 comp. via oral de 12/12h', tipo: 'simples' },
    { nome: 'CAPTOPRIL 25mg', posologia: 'Tomar 1 comp. sublingual em caso de pico hipertensivo', tipo: 'simples' },
    { nome: 'HIDROCLOROTIAZIDA 25mg', posologia: 'Tomar 1 comp. via oral pela manhã', tipo: 'simples' },
    { nome: 'ANLODIPINO 5mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'simples' },
    { nome: 'ATENOLOL 50mg', posologia: 'Tomar 1 comp. via oral 1x ao dia de manhã', tipo: 'simples' },
    { nome: 'CARVEDILOL 12,5mg', posologia: 'Tomar 1 comp. via oral de 12/12h', tipo: 'simples' },
    { nome: 'BISOPROLOL 5mg', posologia: 'Tomar 1 comp. via oral 1x ao dia de manhã', tipo: 'simples' },
    { nome: 'ESPIRONOLACTONA 25mg', posologia: 'Tomar 1 comp. via oral 1x ao dia de manhã', tipo: 'simples' },
    { nome: 'FUROSEMIDA 40mg', posologia: 'Tomar 1 comp. via oral 1x ao dia pela manhã', tipo: 'simples' },
    { nome: 'AAS 100mg', posologia: 'Tomar 1 comp. via oral após o almoço', tipo: 'simples' },
    { nome: 'CLOPIDOGREL 75mg', posologia: 'Tomar 1 comp. via oral 1x ao dia', tipo: 'simples' },
    { nome: 'RIVAROXABANA 20mg', posologia: 'Tomar 1 comp. via oral com a refeição principal', tipo: 'simples' },
    { nome: 'SINVASTATINA 20mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'simples' },
    { nome: 'ROSUVASTATINA 10mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'simples' },
    { nome: 'ATORVASTATINA 20mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'simples' },

    // DIABETES
    { nome: 'METFORMINA 850mg', posologia: 'Tomar 1 comp. via oral após as refeições (almoço e jantar)', tipo: 'simples' },
    { nome: 'METFORMINA XR 500mg', posologia: 'Tomar 1 comp. via oral à noite, após o jantar', tipo: 'simples' },
    { nome: 'GLIBENCLAMIDA 5mg', posologia: 'Tomar 1 comp. via oral 30 min antes do almoço', tipo: 'simples' },
    { nome: 'GLICLAZIDA MR 30mg', posologia: 'Tomar 1 comp. via oral no café da manhã', tipo: 'simples' },
    { nome: 'DAPAGLIFLOZINA 10mg', posologia: 'Tomar 1 comp. via oral 1x ao dia pela manhã', tipo: 'simples' },
    { nome: 'EMPAGLIFLOZINA 25mg', posologia: 'Tomar 1 comp. via oral 1x ao dia pela manhã', tipo: 'simples' },

    // ANTIALÉRGICOS E RESPIRATÓRIOS
    { nome: 'LORATADINA 10mg', posologia: 'Tomar 1 comp. via oral 1x ao dia', tipo: 'simples' },
    { nome: 'DESLORATADINA 5mg', posologia: 'Tomar 1 comp. via oral 1x ao dia', tipo: 'simples' },
    { nome: 'FEXOFENADINA 120mg', posologia: 'Tomar 1 comp. via oral 1x ao dia', tipo: 'simples' },
    { nome: 'DEXCLORFENIRAMINA 2mg', posologia: 'Tomar 1 comp. via oral de 8/8h', tipo: 'simples' },
    { nome: 'DEXCLORFENIRAMINA XAROPE', posologia: 'Tomar 1 medida via oral de 8/8h', tipo: 'simples' },
    { nome: 'ACETILCISTEÍNA 600mg ENV', posologia: 'Dissolver 1 envelope em água e tomar à noite por 5 dias', tipo: 'simples' },
    { nome: 'AMBROXOL XAROPE ADULTO', posologia: 'Tomar 5mL via oral de 8/8h por 5 dias', tipo: 'simples' },
    { nome: 'SALBUTAMOL SPRAY (AEROLIN)', posologia: 'Fazer 2 jatos via inalatória de 6/6h se falta de ar', tipo: 'simples' },
    { nome: 'FORMOTEROL + BUDESONIDA 12/400mcg', posologia: 'Inalar 1 cápsula de 12/12h após bochecho com água', tipo: 'simples' },
    { nome: 'SPLAY NASAL (SORO FISIOLÓGICO)', posologia: 'Aplicar 2 jatos em cada narina de 8/8h', tipo: 'simples' },
    { nome: 'BUDESONIDA SPRAY NASAL 50mcg', posologia: 'Aplicar 1 jato em cada narina 2x ao dia', tipo: 'simples' },

    // PSIQUIATRIA E NEUROLOGIA (CONTROLE ESPECIAL)
    { nome: 'CLONAZEPAM 2mg (RIVOTRIL)', posologia: 'Tomar 1 comp. via oral à noite ao deitar', tipo: 'controle' },
    { nome: 'CLONAZEPAM GOTAS 2,5mg/mL', posologia: 'Tomar 5 gotas via oral à noite ao deitar', tipo: 'controle' },
    { nome: 'ALPRAZOLAM 1mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'controle' },
    { nome: 'DIAZEPAM 10mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'controle' },
    { nome: 'BROMAZEPAM 3mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'controle' },
    { nome: 'ZOLPIDEM 10mg', posologia: 'Tomar 1 comp. via oral imediatamente ao deitar', tipo: 'controle' },
    { nome: 'ZOLPIDEM CR 12,5mg', posologia: 'Tomar 1 comp. via oral imediatamente ao deitar', tipo: 'controle' },
    { nome: 'FLUOXETINA 20mg', posologia: 'Tomar 1 caps. via oral de manhã', tipo: 'controle' },
    { nome: 'SERTRALINA 50mg', posologia: 'Tomar 1 comp. via oral de manhã', tipo: 'controle' },
    { nome: 'ESCITALOPRAM 10mg', posologia: 'Tomar 1 comp. via oral de manhã', tipo: 'controle' },
    { nome: 'CITALOPRAM 20mg', posologia: 'Tomar 1 comp. via oral de manhã', tipo: 'controle' },
    { nome: 'DESVENLAFAXINA 50mg', posologia: 'Tomar 1 comp. via oral de manhã', tipo: 'controle' },
    { nome: 'VENLAFAXINA 75mg', posologia: 'Tomar 1 caps. via oral de manhã', tipo: 'controle' },
    { nome: 'AMITRIPTILINA 25mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'controle' },
    { nome: 'NORTRIPTILINA 25mg', posologia: 'Tomar 1 caps. via oral à noite', tipo: 'controle' },
    { nome: 'DULOXETINA 30mg', posologia: 'Tomar 1 caps. via oral de manhã', tipo: 'controle' },
    { nome: 'PREGABALINA 75mg', posologia: 'Tomar 1 caps. via oral à noite', tipo: 'controle' },
    { nome: 'GABAPENTINA 300mg', posologia: 'Tomar 1 caps. via oral à noite', tipo: 'controle' },
    { nome: 'CARBAMAZEPINA 200mg', posologia: 'Tomar 1 comp. via oral de 12/12h', tipo: 'controle' },
    { nome: 'QUETIAPINA 25mg', posologia: 'Tomar 1 comp. via oral à noite ao deitar', tipo: 'controle' },
    { nome: 'RISPERIDONA 1mg', posologia: 'Tomar 1 comp. via oral à noite', tipo: 'controle' },
    { nome: 'TRAMADOL 50mg', posologia: 'Tomar 1 caps. via oral de 8/8h se dor forte', tipo: 'controle' },
    { nome: 'CODEÍNA 30mg + PARACETAMOL 500mg', posologia: 'Tomar 1 comp. via oral de 8/8h se dor', tipo: 'controle' },
    { nome: 'PACO (PARACETAMOL + CODEÍNA)', posologia: 'Tomar 1 comp. via oral de 8/8h se dor', tipo: 'controle' },

    // VITAMINAS E SUPLEMENTOS
    { nome: 'COLECALCIFEROL (VIT D) 50.000 UI', posologia: 'Tomar 1 caps. via oral por semana durante 8 semanas', tipo: 'simples' },
    { nome: 'COLECALCIFEROL (VIT D) 7.000 UI', posologia: 'Tomar 1 caps. via oral 1x ao dia', tipo: 'simples' },
    { nome: 'SULFATO FERROSO 40mg', posologia: 'Tomar 1 comp. via oral 1 hora antes do almoço com suco cítrico', tipo: 'simples' },
    { nome: 'ÁCIDO FÓLICO 5mg', posologia: 'Tomar 1 comp. via oral 1x ao dia', tipo: 'simples' },
    { nome: 'CITRATO DE CÁLCIO + VIT D', posologia: 'Tomar 1 comp. via oral de 12/12h junto às refeições', tipo: 'simples' },
    { nome: 'COMPLEXO B', posologia: 'Tomar 1 drágea via oral 1x ao dia', tipo: 'simples' },
    { nome: 'VITAMINA C 1g', posologia: 'Dissolver 1 comp. efervescente em água e tomar 1x ao dia', tipo: 'simples' },

    // OUTROS (HORMONIOS, ANTIPARASITÁRIOS, GINECO, URO)
    { nome: 'LEVOTIROXINA 50mcg', posologia: 'Tomar 1 comp. via oral em jejum (aguardar 30 min para comer)', tipo: 'simples' },
    { nome: 'ALBENDAZOL 400mg', posologia: 'Tomar 1 comp. via oral em dose única mastigado', tipo: 'simples' },
    { nome: 'IVERMECTINA 6mg', posologia: 'Tomar os comprimidos (conforme peso) via oral em dose única', tipo: 'simples' },
    { nome: 'SECNIDAZOL 1000mg', posologia: 'Tomar 2 comp. via oral em dose única junto com a refeição', tipo: 'simples' },
    { nome: 'FLUCONAZOL 150mg', posologia: 'Tomar 1 caps. via oral em dose única', tipo: 'simples' },
    { nome: 'MICONAZOL CREME VAGINAL', posologia: 'Aplicar 1 aplicador cheio via vaginal à noite por 14 dias', tipo: 'simples' },
    { nome: 'TANSULOSINA 0,4mg', posologia: 'Tomar 1 caps. via oral 1x ao dia após o jantar', tipo: 'simples' },
    { nome: 'FINASTERIDA 5mg', posologia: 'Tomar 1 comp. via oral 1x ao dia', tipo: 'simples' },
    { nome: 'SILDENAFILA 50mg', posologia: 'Tomar 1 comp. via oral 1 hora antes da relação', tipo: 'simples' },
    { nome: 'TADALAFILA 5mg', posologia: 'Tomar 1 comp. via oral 1x ao dia (uso contínuo)', tipo: 'simples' },
    { nome: 'ESPIRONOLACTONA 50mg', posologia: 'Tomar 1 comp. via oral 1x ao dia de manhã', tipo: 'simples' },

    // USO TÓPICO / DERMATOLÓGICO / OFTÁLMICO
    { nome: 'CETOCONAZOL CREME', posologia: 'Aplicar na área afetada 2x ao dia', tipo: 'simples' },
    { nome: 'DEXAMETASONA CREME', posologia: 'Aplicar fina camada na lesão 2x ao dia', tipo: 'simples' },
    { nome: 'NEOMICINA + BACITRACINA POMADA', posologia: 'Aplicar na lesão após limpeza 3x ao dia', tipo: 'simples' },
    { nome: 'MUPIROCINA POMADA 2%', posologia: 'Aplicar na lesão 3x ao dia por 7 dias', tipo: 'simples' },
    { nome: 'PERMETRINA LOÇÃO 5%', posologia: 'Aplicar no corpo todo à noite, deixar por 12h e lavar. Repetir em 7 dias.', tipo: 'simples' },
    { nome: 'TOBRAMICINA COLÍRIO', posologia: 'Pingar 1 gota no olho afetado de 6/6h por 7 dias', tipo: 'simples' },
    { nome: 'CARMELOSE SÓDICA COLÍRIO', posologia: 'Pingar 1 gota em cada olho de 6/6h ou se ressecamento', tipo: 'simples' }
];

// --- CONFIGURAÇÕES MÉDICAS COMPONENT ---
const ConfiguracoesMedicasTab = () => {
    const [config, setConfig] = useState({
        cabecalho: 'HOSPITAL MUNICIPAL / SANTA CASA',
        rodape: 'Av. Brasil, 100 - Centro\nTel: (00) 0000-0000',
        medicamentos_padrao: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Form para novo medicamento
    const [novoMed, setNovoMed] = useState('');
    const [novaPosologia, setNovaPosologia] = useState('');
    const [tipo, setTipo] = useState('simples');

    useEffect(() => {
        const loadMedicas = async () => {
            const { data, error } = await supabase.from('settings').select('data').eq('id', 'medicas').maybeSingle();
            if (!error && data && data.data) {
                setConfig(prev => ({ ...prev, ...data.data }));
            }
            setLoading(false);
        };
        loadMedicas();
    }, []);

    const handleSave = async (updatedConfig) => {
        setSaving(true);
        try {
            const { error } = await supabase.from('settings').upsert({ id: 'medicas', data: updatedConfig || config });
            if (error) throw error;
            toast.success('Configurações salvas com sucesso!');
        } catch (err) {
            toast.error('Erro ao salvar as configurações.');
        } finally {
            setSaving(false);
        }
    };

    const addMedicamento = () => {
        if (!novoMed.trim()) return toast.error('Digite o nome do medicamento.');
        const novo = { id: Date.now().toString(), nome: novoMed, posologia: novaPosologia, tipo };
        const updated = { ...config, medicamentos_padrao: [...(config.medicamentos_padrao || []), novo] };
        setConfig(updated);
        handleSave(updated);
        setNovoMed('');
        setNovaPosologia('');
    };

    const removeMedicamento = (id) => {
        if (!window.confirm("Remover este medicamento padrão?")) return;
        const updated = { ...config, medicamentos_padrao: config.medicamentos_padrao.filter(m => m.id !== id) };
        setConfig(updated);
        handleSave(updated);
    };

    const preCarregarMedicamentos = () => {
        if (!window.confirm("Isso vai adicionar dezenas de medicamentos do protocolo geral à sua lista. Deseja continuar?")) return;
        
        const novos = medicamentosComuns.map(m => ({
            id: Math.random().toString(36).substring(7) + Date.now().toString(36),
            nome: m.nome,
            posologia: m.posologia,
            tipo: m.tipo
        }));

        const listaAtual = config.medicamentos_padrao || [];
        const aAdicionar = novos.filter(n => !listaAtual.some(a => a.nome === n.nome));

        const updated = { ...config, medicamentos_padrao: [...listaAtual, ...aAdicionar] };
        setConfig(updated);
        handleSave(updated);
        toast.success(`${aAdicionar.length} medicamentos pré-carregados!`);
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin text-blue-600 mx-auto" size={32} /></div>;

    return (
        <div className="bg-white/60 backdrop-blur-lg rounded-2xl border border-white/60 shadow-sm p-8 animate-in fade-in max-w-4xl mx-auto space-y-8">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div> Configurações do Receituário
            </h2>

            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Título do Cabeçalho</label>
                        <input value={config.cabecalho || ''} onChange={e => setConfig({ ...config, cabecalho: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 bg-white/50" placeholder="Ex: CLÍNICA MÉDICA SÃO PAULO" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Rodapé (Endereço / Telefone)</label>
                        <textarea value={config.rodape || ''} onChange={e => setConfig({ ...config, rodape: e.target.value })} className="w-full h-20 p-3 rounded-xl border border-white/60 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 bg-white/50 resize-none" placeholder="Endereço que vai no rodapé..." />
                    </div>
                </div>
                <div className="flex justify-end">
                    <button onClick={() => handleSave(config)} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase px-6 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar Textos
                    </button>
                </div>
            </div>

            <hr className="border-white/60 my-8" />

            <div className="flex justify-between items-center mt-8 mb-4">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Banco de Medicamentos
                </h2>
                <button onClick={preCarregarMedicamentos} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 border border-emerald-200">
                    <Activity size={14}/> Auto-Preencher Cód. Completo (+90)
                </button>
            </div>

            <div className="bg-white/40 p-4 rounded-xl border border-white/50 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</label>
                        <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-emerald-500 text-xs font-bold text-slate-700 bg-white/70 uppercase">
                            <option value="simples">Receita Simples</option>
                            <option value="controle">Controle Especial</option>
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome</label>
                        <input value={novoMed} onChange={e => setNovoMed(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-emerald-500 text-sm font-bold text-slate-700 uppercase" placeholder="Dipirona 500mg..." />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Posologia Padrão</label>
                        <input value={novaPosologia} onChange={e => setNovaPosologia(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-white/60 outline-none focus:border-emerald-500 text-sm font-bold text-slate-700" placeholder="Tomar 1 comp. de 8/8h" />
                    </div>
                    <div className="md:col-span-1">
                        <button onClick={addMedicamento} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase h-10 rounded-xl shadow-md transition-all active:scale-95 flex justify-center items-center gap-2">
                            <Plus size={16} /> Adicionar
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-2 mt-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                {(!config.medicamentos_padrao || config.medicamentos_padrao.length === 0) && (
                    <p className="text-center text-xs font-bold text-slate-400 uppercase py-6">Nenhum medicamento cadastrado.</p>
                )}
                {config.medicamentos_padrao?.map(med => (
                    <div key={med.id} className="flex justify-between items-center bg-white/70 backdrop-blur-xl border border-white shadow-sm p-3 rounded-xl group">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-700 uppercase leading-tight">{med.nome}</span>
                                {med.tipo === 'controle' && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-600">Controle</span>}
                            </div>
                            <span className="text-xs font-bold text-slate-500 mt-0.5">{med.posologia || 'Sem posologia padrão'}</span>
                        </div>
                        <button onClick={() => removeMedicamento(med.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
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
    const [activeSection, setActiveSection] = useState((tabFromUrl === 'medicos' ? 'especialidades' : tabFromUrl) || 'especialidades');
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
        if (tabFromUrl) setActiveSection(tabFromUrl === 'medicos' ? 'especialidades' : tabFromUrl);
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

    // 500+ linhas na tela: o parser roda uma vez por carga, não a cada render.
    const logsNaTela = useMemo(
        () => logs.map((log) => ({ log, plantao: extrairDadosDoPlantao(log) })),
        [logs]
    );

    const linhasDeLog = (registros) => registros.map((log) => {
        const d = log.timestamp ? new Date(log.timestamp) : null;
        // Data do plantão e médico saem do texto do log (ver logEscalaParser).
        const plantao = extrairDadosDoPlantao(log);
        return {
            data: d ? d.toLocaleDateString('pt-BR') : '',
            hora: d ? d.toLocaleTimeString('pt-BR') : '',
            usuario: nomeDoLog(log),
            email: log.userEmail || '',
            acao: log.action || '',
            dataPlantao: plantao.dataPlantao,
            medico: plantao.medico,
            medicoAnterior: plantao.medicoAnterior,
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
                        { header: 'Plantão' }, { header: 'Médico' }, { header: 'Detalhes' }, { header: 'IP' },
                    ],
                    rows: linhas.map((l) => [
                        `${l.data} ${l.hora}`, l.usuario, l.acao, l.dataPlantao || '—',
                        l.medicoAnterior ? `${l.medico} (antes: ${l.medicoAnterior})` : (l.medico || '—'),
                        l.detalhes, l.ip,
                    ]),
                    totalLabel: 'Total de Registros Exportados',
                });
            } else {
                const planilha = linhas.map((l) => ({
                    'Data': l.data, 'Hora': l.hora, 'Usuário': l.usuario, 'E-mail': l.email,
                    'Ação': l.acao, 'Data do Plantão': l.dataPlantao, 'Médico': l.medico,
                    'Médico Anterior': l.medicoAnterior, 'Detalhes': l.detalhes, 'IP': l.ip,
                }));
                const ws = XLSX.utils.json_to_sheet(planilha);
                ws['!cols'] = [
                    { wch: 11 }, { wch: 10 }, { wch: 26 }, { wch: 26 }, { wch: 26 },
                    { wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 80 }, { wch: 16 },
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
        convenios: [], status: [], locais: [], cidades: [], anestesias: [], especialidades: [],
        clinicas: ['Cirúrgica', 'Ambulatorial'],
        caraterInternacao: ['01 - ELETIVA', '02 - URGÊNCIA', '03 - EMERGÊNCIA'],
        nomeInstituicao: 'MedCode Assessoria', corPrincipal: '#2563eb', logoUrl: '/logo.png'
    });

    const [newItem, setNewItem] = useState({
        convenios: '', status: '', locais: '', cidades: '', anestesias: '', especialidades: '', clinicas: '', caraterInternacao: ''
    });

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
            { id: 'unidades', label: 'Unidades (Hospitais)', show: hasPermission('Acesso Total (Admin)') },
            { id: 'especialidades', label: 'Especialidades', show: hasPermission('Acessar Configurações') },
            { id: 'convenios', label: 'Convênios', show: hasPermission('Acessar Configurações') },
            { id: 'locais', label: 'Salas Cirúrgicas', show: hasPermission('Acessar Configurações') },
            { id: 'cidades', label: 'Cidades', show: hasPermission('Acessar Configurações') },
            { id: 'anestesias', label: 'Anestesias', show: hasPermission('Acessar Configurações') },
            { id: 'status', label: 'Status da Fila', show: hasPermission('Acessar Configurações') },
            { id: 'motivos_suspensao', label: 'Suspensões', show: hasPermission('Acessar Configurações') },
            { id: 'prioridades', label: 'Prioridades', show: hasPermission('Acessar Configurações') },
            { id: 'clinicas', label: 'Clínicas AIH', show: hasPermission('Acessar Configurações') },
            { id: 'caraterInternacao', label: 'Caráter AIH', show: hasPermission('Acessar Configurações') },
            { id: 'categorias_agenda', label: 'Equipes', show: hasPermission('Acessar Configurações') }
        ],
        'cadastros_medicos': [
            { id: 'medicas', label: 'Configurações Médicas', show: hasPermission('Acessar Configurações') }
        ]
    };

    // Organiza as abas de cadastros gerais em blocos rotulados (em vez de uma
    // única fileira que rola na horizontal).
    const tabBlocks = [
        { label: 'Estrutura', desc: 'Unidades, salas e cidades', icon: Building, color: 'text-blue-600', bg: 'bg-blue-50', ids: ['unidades', 'locais', 'cidades'] },
        { label: 'Cadastros', desc: 'Especialidades, convênios e equipes', icon: Stethoscope, color: 'text-indigo-600', bg: 'bg-indigo-50', ids: ['especialidades', 'convenios', 'anestesias', 'categorias_agenda'] },
        { label: 'Fila', desc: 'Status, prioridades e suspensões', icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', ids: ['status', 'prioridades', 'motivos_suspensao'] },
        { label: 'Faturamento (AIH)', desc: 'Clínicas e caráter', icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', ids: ['clinicas', 'caraterInternacao'] },
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
                        
                        {activeSection === 'importacao' && (
                            <div className="bg-white/60 rounded-3xl border border-white/40 shadow-sm p-10 flex flex-col items-center justify-center min-h-[400px] group cursor-pointer hover:border-blue-400 hover:shadow-md transition-all text-center" onClick={() => navigate('/importar-dados')}>
                                <div className="p-5 bg-blue-50 text-blue-600 rounded-full group-hover:scale-110 transition-transform mb-6"><FileSpreadsheet size={48} /></div>
                                <h3 className="font-black text-2xl text-slate-800 uppercase tracking-wider">Importação em Lote (CSV)</h3>
                                <p className="text-slate-500 font-medium mt-2 max-w-md">Importe sua lista de pacientes e cirurgias antigas de uma só vez utilizando nossa planilha padrão.</p>
                            </div>
                        )}


                        {activeSection === 'especialidades' && <RenderSection title="Especialidades" category="especialidades" placeholder="Nova especialidade..." inputValue={newItem.especialidades} items={data.especialidades} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'convenios' && <RenderSection title="Convênios" category="convenios" placeholder="Novo convênio..." inputValue={newItem.convenios} items={data.convenios} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'status' && <RenderSection title="Status da Fila" category="status" placeholder="Ex: Aguardando..." inputValue={newItem.status} items={data.status} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'locais' && <RenderSection title="Salas Cirúrgicas" category="locais" placeholder="Nova sala..." inputValue={newItem.locais} items={data.locais} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'categorias_agenda' && <AgendaCategoriasManager />}
                        {activeSection === 'cidades' && <RenderSection title="Cidades" category="cidades" placeholder="Nova cidade..." inputValue={newItem.cidades} items={data.cidades} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'anestesias' && <RenderSection title="Anestesias" category="anestesias" placeholder="Tipo de anestesia..." inputValue={newItem.anestesias} items={data.anestesias} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'prioridades' && <RenderSection title="Prioridades" category="prioridades" placeholder="Classificação..." inputValue={newItem.prioridades} items={data.prioridades} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'clinicas' && <RenderSection title="Clínicas AIH" category="clinicas" placeholder="Ex: Cirúrgica..." inputValue={newItem.clinicas} items={data.clinicas} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        {activeSection === 'caraterInternacao' && <RenderSection title="Caráter AIH" category="caraterInternacao" placeholder="Ex: 01 - ELETIVA..." inputValue={newItem.caraterInternacao} items={data.caraterInternacao} onInputChange={handleInputChange} onAdd={handleAdd} onRemove={handleRemove} onEdit={handleEdit} />}
                        
                        {activeSection === 'orientacoes' && <OrientacoesManager />}
                        {activeSection === 'tempos' && <ProcedureManager />}
                        {activeSection === 'basesus' && <BaseSUSTab />}
                        
                        {activeSection === 'usuarios' && (hasPermission('Acesso Total (Admin)') || hasPermission('Acessar Usuarios')) && <UserManagement isEmbedded={true} />}
                        {activeSection === 'identidade' && hasPermission('Acesso Total (Admin)') && <IdentidadeVisualTab data={data} setData={setData} />}
                        {activeSection === 'hub' && hasPermission('Acesso Total (Admin)') && (
                            <HubSettingsTab data={data} setData={setData} />
                        )}
                        {activeSection === 'unidades' && hasPermission('Acesso Total (Admin)') && <UnidadesManager />}
                        
                        {activeSection === 'motivos_suspensao' && <MotivosSuspensaoManager />}
                        
                        {activeSection === 'medicas' && hasPermission('Acessar Configurações') && <ConfiguracoesMedicasTab />}
                        {activeSection === 'regras_medicamentos' && (hasPermission('Acessar Configurações') || hasPermission('Gerenciar Regras APA/FA')) && <ConfiguracoesApaTab />}
                        
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
                                                <th className="py-2 px-3 whitespace-nowrap">Plantão</th>
                                                <th className="py-2 px-3 whitespace-nowrap">Médico</th>
                                                <th className="py-2 px-3">Detalhes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100/70">
                                            {loadingLogs ? (
                                                <tr><td colSpan="6" className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={24} /></td></tr>
                                            ) : logsNaTela.length > 0 ? (
                                                logsNaTela.map(({ log, plantao }) => {
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
                                                            <td className="px-3 py-1.5 whitespace-nowrap text-[11px] font-black text-slate-700 tabular-nums">
                                                                {plantao.dataPlantao || <span className="text-slate-300">—</span>}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-[11px] font-bold text-slate-700">
                                                                {plantao.medico ? (
                                                                    <div className="max-w-[170px]">
                                                                        <div className="truncate" title={plantao.medico}>{plantao.medico}</div>
                                                                        {plantao.medicoAnterior && (
                                                                            <div className="text-[10px] font-black text-rose-500 truncate" title={plantao.medicoAnterior}>
                                                                                saiu: {plantao.medicoAnterior}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : <span className="text-slate-300">—</span>}
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
                                                <tr><td colSpan="6" className="py-12 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Nenhum log encontrado.</td></tr>
                                            )}
                                            {carregandoMaisLogs && (
                                                <tr><td colSpan="6" className="py-4 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={18} /></td></tr>
                                            )}
                                            {/* A rolagem já puxa sozinha, mas o botão é o controle explícito:
                                                o usuário vê quanto falta e não fica dependendo do gesto. */}
                                            {!loadingLogs && !carregandoMaisLogs && logs.length > 0 && logs.length < totalLogs && (
                                                <tr><td colSpan="6" className="py-3 text-center">
                                                    <button
                                                        onClick={carregarMaisLogs}
                                                        className="bg-white/90 border border-slate-200 text-slate-600 h-8 px-5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-blue-600 transition shadow-sm"
                                                    >
                                                        Carregar mais {Math.min(LOGS_PAGINA_TELA, totalLogs - logs.length).toLocaleString('pt-BR')} — faltam {(totalLogs - logs.length).toLocaleString('pt-BR')}
                                                    </button>
                                                </td></tr>
                                            )}
                                            {!loadingLogs && !carregandoMaisLogs && logs.length > 0 && logs.length >= totalLogs && (
                                                <tr><td colSpan="6" className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
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