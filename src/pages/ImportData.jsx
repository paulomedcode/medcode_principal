import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import Papa from 'papaparse';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, ArrowLeft, Save, HelpCircle, FileType, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';

const ImportData = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const fileInputRef = useRef(null);

    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);

    // --- UTILS ---
    const normalizeHeader = (header) => {
        if (!header) return '';
        return header.toString().trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos
    };

    const parseBrDate = (dateString) => {
        if (!dateString) return '';
        const cleanDate = dateString.toString().trim();
        if (!cleanDate) return '';

        // Formato DD/MM/AAAA
        if (cleanDate.includes('/')) {
            const parts = cleanDate.split('/');
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                const year = parts[2];
                // Garante ano com 4 dígitos se possível (embora o input seja AAAA)
                if (day && month && year && year.length === 4) {
                    return `${year}-${month}-${day}`;
                }
            }
        }
        // Se já vier como YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
            return cleanDate;
        }
        return '';
    };

    const mapRowToSchema = (row) => {
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
            normalizedRow[normalizeHeader(key)] = row[key];
        });

        const getValue = (primaryKey, synonyms = []) => {
            const keysToCheck = [primaryKey, ...synonyms].map(k => normalizeHeader(k));
            for (const term of keysToCheck) {
                const foundKey = Object.keys(normalizedRow).find(key => key === term || key.includes(term));
                if (foundKey && normalizedRow[foundKey]) return normalizedRow[foundKey].toString().trim();
            }
            return '';
        };

        // 1. Pega do CSV (Inglês no código, mas lê as colunas em Português do seu Excel)
        const patientName = getValue('nome completo', ['nome', 'paciente']);
        const patientCNS = getValue('cns', ['cartao sus']);
        const patientBirthDate = parseBrDate(getValue('nascimento', ['data nasc', 'dn']));
        const patientPhone = getValue('telefone 1', ['telefone', 'cel']);
        const patientCity = getValue('cidade', ['municipio']);
        const procedureName = getValue('procedimento', ['cirurgia']);
        const medicalTeam = getValue('equipe medica', ['medico', 'cirurgiao']);
        const specialtyName = getValue('especialidade');
        const anesthesiaType = getValue('anestesia');
        const insuranceName = getValue('convenio') || 'SUS';
        const priority = getValue('prioridade', ['classificacao']) || 'Eletiva';
        const consultationDate = parseBrDate(getValue('atendimento', ['data atendimento', 'dataatendimento']));
        const surgeryDate = parseBrDate(getValue('agendamento', ['data agendamento', 'data cirurgia', 'dataagendado']));
        const authDate = parseBrDate(getValue('autorizacao', ['data autorizacao', 'dataautorizacao']));
        const surgeryTime = getValue('horario', ['hora']);
        const statusRaw = getValue('status', ['situacao']);
        const room = getValue('sala', ['local']);
        const externalExamUrl = getValue('documentacao', ['link', 'drive', 'url', 'anexo', 'arquivo', 'doc']);
        const notes = getValue('observações', ['observacoes', 'obs']);

        if (!patientName) return null;

        // Arruma o Status
        let status = statusRaw ? statusRaw.toString().trim().toUpperCase() : 'AGUARDANDO';
        if (status === 'EXECUTADO') status = 'REALIZADO';

        // 2. Manda pro Supabase (Com os nomes EXATOS das colunas da sua tabela)
        return {
            nomePaciente: patientName,
            cns: patientCNS.replace(/\D/g, ''),
            nascimento: patientBirthDate,
            telefone1: patientPhone,
            municipio: patientCity,
            procedimento: procedureName || 'A DEFINIR',
            cirurgiao: medicalTeam,
            especialidade: specialtyName,
            anestesia: anesthesiaType,
            convenio: insuranceName,
            prioridade: priority,
            dataAtendimento: consultationDate,
            dataAgendado: surgeryDate,
            dataAutorizacao: authDate,
            horario: surgeryTime,
            sala: room,
            status: status,
            observacoes: notes,
            arquivoUrl: externalExamUrl,
            createdAt: new Date().toISOString()
        };
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;
        processFile(selectedFile);
    };

    const processFile = (fileToParse) => {
        setFile(fileToParse);
        setLoading(true);
        setPreviewData([]);
        setAllData([]);

        Papa.parse(fileToParse, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8", // Padrão Excel PT-BR. Se falhar, o navegador costuma lidar bem.
            complete: (results) => {
                if (results.data.length === 0) {
                    toast.error("O arquivo parece vazio ou inválido.");
                    setLoading(false);
                    return;
                }

                console.log("Headers detectados:", results.meta.fields);

                // Mapeia e filtra linhas válidas
                const processed = results.data
                    .map(mapRowToSchema)
                    .filter(item => item !== null);

                if (processed.length === 0) {
                    toast.error("Não foi possível identificar as colunas. Verifique se o CSV tem cabeçalhos como 'Nome', 'Procedimento', 'Nascimento'.");
                    setLoading(false);
                    return;
                }

                setAllData(processed);
                setPreviewData(processed.slice(0, 5));
                setLoading(false);
                toast.success(`${processed.length} registros válidos identificados!`);
            },
            error: (error) => {
                console.error("Erro PapaParse:", error);
                toast.error("Erro ao ler o arquivo CSV.");
                setLoading(false);
            }
        });
    };

    const handleImport = async () => {
        if (allData.length === 0) return;

        if (!window.confirm(`Confirma a importação de ${allData.length} registros para a fila de cirurgias?`)) return;

        setImporting(true);
        setTotal(allData.length);
        setProgress(0);

        const batchSize = 450;
        let importedCount = 0;

        try {
            for (let i = 0; i < allData.length; i += batchSize) {
                const chunk = allData.slice(i, i + batchSize);
                const { error } = await supabase.from('surgeries').insert(chunk);
                if (error) throw error;

                importedCount += chunk.length;
                setProgress(importedCount);

                // Pequena pausa para UI respirar
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            toast.success("Importação concluída com sucesso!");

            // Reset
            setFile(null);
            setAllData([]);
            setPreviewData([]);

            // Redirect
            setTimeout(() => navigate('/fila'), 1500);

        } catch (error) {
            console.error("Erro Firebase Batch:", error);
            toast.error("Erro ao salvar dados no sistema.");
        } finally {
            setImporting(false);
        }
    };

    // Trigger do input invisível
    const triggerFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.type.includes('csv') || droppedFile.name.endsWith('.csv'))) {
            processFile(droppedFile);
        } else {
            toast.error("Por favor, solte um arquivo .csv válido.");
        }
    };

    return (
        <div className="min-h-full bg-white/60 p-6 md:p-12 font-sans animate-in fade-in duration-500">
            <div className="max-w-4xl mx-auto">

                {/* Header Navigation */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/settings')}
                        className="p-2 hover:bg-white/80 rounded-full transition-colors text-slate-500"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <UploadCloud size={28} className="text-blue-600" />
                            Importar Dados
                        </h1>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                            Carregue pacientes e cirurgias via CSV (Excel/Sheets)
                        </p>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="space-y-6">

                    {/* DROPZONE AREA */}
                    {!loading && !importing && allData.length === 0 && (
                        <div
                            onClick={triggerFileInput}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            className="bg-white/60 rounded-3xl shadow-sm border-2 border-dashed border-white/80 p-16 text-center hover:border-blue-400 hover:bg-blue-500/20/30 transition-all cursor-pointer group relative select-none"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="hidden"
                            />

                            <div className="flex flex-col items-center gap-6 group-hover:scale-105 transition-transform duration-300">
                                <div className="p-6 bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none rounded-full shadow-inner ring-4 ring-white">
                                    <FileText size={48} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-slate-700 uppercase tracking-wider">
                                        Clique para selecionar o CSV
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium">
                                        ou arraste o arquivo para esta área
                                    </p>
                                </div>
                                <div className="bg-white/70 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide border border-white/60">
                                    <HelpCircle size={14} className="text-blue-500" />
                                    Colunas esperadas: Nome, Procedimento, CNS, Nascimento, Link
                                </div>
                            </div>
                        </div>
                    )}

                    {/* LOADING STATE */}
                    {(loading || importing) && (
                        <div className="bg-white/60 rounded-3xl shadow-sm border border-white/40 p-16 text-center flex flex-col items-center justify-center gap-6">
                            <div className="relative">
                                <div className="w-20 h-20 border-4 border-white/40 rounded-full"></div>
                                <div className="w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 drop-shadow-none uppercase animate-pulse">
                                    {importing ? `Importando... ${progress}/${total}` : 'Processando Arquivo...'}
                                </h3>
                                <p className="text-slate-500 font-bold text-xs uppercase mt-2 tracking-widest">
                                    Isso pode levar alguns segundos
                                </p>
                            </div>
                            {importing && (
                                <div className="w-64 h-3 bg-white/70 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-600 transition-all duration-300 ease-out"
                                        style={{ width: `${(progress / total) * 100}%` }}
                                    ></div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PREVIEW TABLE */}
                    {allData.length > 0 && !importing && (
                        <div className="bg-white/60 rounded-3xl shadow-xl shadow-slate-200/50 border border-white/40 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            {/* Card Header */}
                            <div className="p-6 border-b border-white/40 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/60">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl shadow-sm backdrop-blur-md">
                                        <CheckCircle size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-slate-900 drop-shadow-none uppercase text-lg leading-tight">Sucesso na Leitura!</h3>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                            {allData.length} registros prontos para importar
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3 w-full md:w-auto">
                                    <button
                                        onClick={() => { setFile(null); setAllData([]); setPreviewData([]); }}
                                        className="flex-1 md:flex-none px-6 py-3 text-xs font-black uppercase text-rose-500 hover:bg-rose-500/20 rounded-xl transition-colors border border-transparent hover:border-rose-100"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleImport}
                                        className="flex-1 md:flex-none px-8 py-3 bg-blue-600 text-white text-xs font-black uppercase rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Save size={16} /> Confirmar Importação
                                    </button>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white/60 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Paciente / CNS</th>
                                            <th className="px-6 py-4">Nascimento</th>
                                            <th className="px-6 py-4">Procedimento</th>
                                            <th className="px-6 py-4">Link Detectado?</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {previewData.map((row, index) => (
                                            <tr key={index} className="hover:bg-blue-500/20/30 transition-colors group">
                                                <td className="px-6 py-4 align-top">
                                                    <div className="font-bold text-slate-700 group-hover:text-blue-700 transition-colors uppercase text-xs">{row.nomePaciente}</div>
                                                    <div className="text-[11px] text-slate-500 font-bold mt-1 bg-white/70 px-1.5 py-0.5 rounded inline-block">CNS: {row.cns || '---'}</div>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-slate-500 text-xs">
                                                    {row.nascimento || '---'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-600 text-xs uppercase line-clamp-2">{row.procedimento}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {row.arquivoUrl ? (
                                                        <div className="flex items-center gap-2 text-emerald-600 font-black text-[11px] uppercase bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-100 w-fit">
                                                            <CheckCircle size={14} /> Link OK
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-600 text-[11px] uppercase font-bold">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            {allData.length > 5 && (
                                <div className="p-4 bg-white/60 text-center border-t border-white/40 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                    ... e mais {allData.length - previewData.length} registros não exibidos
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportData;
