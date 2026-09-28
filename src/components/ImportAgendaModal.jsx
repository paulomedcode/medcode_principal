import React, { useState, useRef } from 'react';
import { supabase } from '../services/supabase';
import { extractTextFromPdf, parseCelk, parseAmeInterconsulta, parsePrintAgenda } from '../utils/agendaParsers';
import { logAction } from '../utils/logger';
import toast from 'react-hot-toast';
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useUnit } from '../contexts/UnitContext';

export const ImportAgendaModal = ({ isOpen, onClose, onSuccess, medicosDisponiveis = [] }) => {
    const { unidadeAtual } = useUnit();
    const [modelo, setModelo] = useState('celk');
    const [file, setFile] = useState(null);
    const [rawText, setRawText] = useState('');
    const [modoEntrada, setModoEntrada] = useState('pdf'); // 'pdf' ou 'texto'
    const [medicoPrint, setMedicoPrint] = useState('');
    
    const [consultasPreview, setConsultasPreview] = useState([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);

    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const resetState = () => {
        setFile(null);
        setRawText('');
        setConsultasPreview([]);
        setIsParsing(false);
        setIsImporting(false);
        setImportProgress(0);
        setMedicoPrint('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const processTextAndPreview = (text) => {
        let results = [];
        if (modelo === 'celk') {
            results = parseCelk(text);
        } else if (modelo === 'ame') {
            results = parseAmeInterconsulta(text);
        } else if (modelo === 'print-agenda') {
            results = parsePrintAgenda(text, medicoPrint);
        }
        
        if (results.length > 0) {
            setConsultasPreview(results);
            toast.success(`${results.length} consultas encontradas no documento!`);
        } else {
            setConsultasPreview([]);
            toast.error("Nenhuma consulta encontrada ou modelo incompatível.");
        }
    };

    const handleFileChange = async (e) => {
        if (modelo === 'print-agenda' && !medicoPrint) {
            toast.error("Selecione o Médico Atendente antes de anexar o arquivo.");
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        if (selectedFile.type !== 'application/pdf') {
            toast.error("Por favor, selecione um arquivo PDF válido.");
            return;
        }

        setFile(selectedFile);
        setIsParsing(true);
        
        try {
            const pdfText = await extractTextFromPdf(selectedFile);
            
            if (!pdfText || pdfText.trim() === '') {
                toast.error("O arquivo PDF está vazio ou é apenas uma IMAGEM. O sistema não lê fotos dentro de PDFs.", { duration: 6000 });
                toast.error("Por favor, copie o texto da imagem e cole na aba 'Colar Texto Manual'.", { duration: 7000 });
                setIsParsing(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            setRawText(pdfText); // Opcional: mostrar na aba de texto o que foi extraído
            processTextAndPreview(pdfText);
        } catch (error) {
            console.error("Erro ao ler PDF:", error);
            toast.error("Falha ao ler o PDF. Tente colar o texto na aba 'Colar Texto'.");
        } finally {
            setIsParsing(false);
        }
    };

    const handleTextProcess = () => {
        if (modelo === 'print-agenda' && !medicoPrint) {
            toast.error("Selecione o Médico Atendente antes de processar.");
            return;
        }

        if (!rawText.trim()) {
            toast.error("Cole o texto antes de processar.");
            return;
        }
        processTextAndPreview(rawText);
    };

    const handleConfirmImport = async () => {
        if (consultasPreview.length === 0) return;

        // Blindagem: nunca gravar consultas sem data ou sem horário.
        // Sem data, a consulta fica invisível na agenda (o filtro de semana ignora NULL).
        const semData = consultasPreview.filter(c => !c.data_agendamento || !c.horario);
        if (semData.length > 0) {
            toast.error(
                `${semData.length} de ${consultasPreview.length} consultas estão sem data/horário e não podem ser importadas. ` +
                `Verifique o documento — a data não foi reconhecida.`
            );
            return;
        }

        setIsImporting(true);
        setImportProgress(0);
        
        let successCount = 0;
        let errors = 0;

        try {
            for (let i = 0; i < consultasPreview.length; i++) {
                const item = consultasPreview[i];
                let pacienteId = null;

                // 1. Procurar se o paciente já existe
                const { data: pctSearch, error: pctSearchErr } = await supabase
                    .from('pacientes')
                    .select('id, telefone, dataNascimento, cpf, sexo')
                    .ilike('nome', item.paciente_nome)
                    .maybeSingle();

                let telefoneToUse = item.paciente_telefone || null;
                let nascToUse = item.paciente_nascimento || null;
                let cpfToUse = null;
                let sexoToUse = null;

                // Tentar adivinhar o sexo pelo nome se não tiver
                const guessSexo = (nomeStr) => {
                    if (!nomeStr) return null;
                    const pNome = nomeStr.trim().split(' ')[0].toUpperCase();
                    if (pNome.endsWith('A') || pNome.endsWith('Y') || pNome.endsWith('I') || pNome === 'CLELIA' || pNome === 'RUTE' || pNome === 'SIRLEI') return 'Feminino';
                    if (pNome.endsWith('O') || pNome.endsWith('E') || pNome.endsWith('S') || pNome === 'ANDRE') return 'Masculino';
                    return null; // Deixa em branco se não tiver certeza
                };

                if (pctSearch && pctSearch.id) {
                    pacienteId = pctSearch.id;
                    telefoneToUse = pctSearch.telefone || telefoneToUse;
                    nascToUse = pctSearch.dataNascimento || nascToUse;
                    cpfToUse = pctSearch.cpf;
                    sexoToUse = pctSearch.sexo || guessSexo(item.paciente_nome);

                    // Se o paciente existia mas faltava telefone, nascimento ou sexo, vamos atualizar!
                    if (!pctSearch.telefone && item.paciente_telefone || !pctSearch.dataNascimento && item.paciente_nascimento || !pctSearch.sexo && sexoToUse) {
                        await supabase.from('pacientes').update({
                            telefone: telefoneToUse,
                            dataNascimento: nascToUse,
                            sexo: sexoToUse
                        }).eq('id', pacienteId);
                    }
                } else {
                    // Criar novo paciente
                    sexoToUse = guessSexo(item.paciente_nome);
                    const novoPaciente = {
                        nome: item.paciente_nome,
                        dataNascimento: nascToUse,
                        telefone: telefoneToUse,
                        sexo: sexoToUse,
                        createdAt: new Date().toISOString()
                    };
                    const { data: pctInsert, error: pctInsErr } = await supabase
                        .from('pacientes')
                        .insert([novoPaciente])
                        .select()
                        .maybeSingle();
                        
                    if (!pctInsErr && pctInsert) {
                        pacienteId = pctInsert.id;
                        await logAction('CRIAÇÃO AUTOMÁTICA PACIENTE', `Paciente ${item.paciente_nome} criado via Importação de Agenda.`);
                    } else {
                        console.error("Erro ao criar paciente:", pctInsErr);
                        errors++;
                        continue; // Pula a consulta se não conseguiu atrelar a um paciente
                    }
                }

                // 2. Verificar se a consulta já existe para esse paciente na mesma data e hora
                const { data: agendaSearch } = await supabase
                    .from('consultas')
                    .select('id')
                    .eq('paciente_id', pacienteId)
                    .eq('data_agendamento', item.data_agendamento)
                    .eq('horario', item.horario)
                    .maybeSingle();

                if (!agendaSearch) {
                    // 1.5 Tentar fazer match do médico e da unidade para baterem com as listas do sistema
                    let medicoFormatado = item.medico;
                    if (item.medico) {
                        const cleanPdf = item.medico.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/^DR\.?\s*/, '').trim();
                        const matched = medicosDisponiveis.find(m => {
                            const cleanM = m.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/^DR\.?\s*/, '').trim();
                            return cleanM === cleanPdf || cleanPdf.includes(cleanM) || cleanM.includes(cleanPdf);
                        });
                        if (matched) medicoFormatado = matched;
                    }

                    const unidadeFormatada = unidadeAtual;

                    // Criar a consulta
                    const novaConsulta = {
                        paciente_id: pacienteId,
                        paciente_nome: item.paciente_nome,
                        paciente_telefone: telefoneToUse,
                        paciente_nascimento: nascToUse,
                        paciente_cpf: cpfToUse,
                        medico: medicoFormatado,
                        data_agendamento: item.data_agendamento,
                        horario: item.horario,
                        status: 'Agendado',
                        tipo_atendimento: 'Consulta',
                        unidade: unidadeFormatada,
                        especialidade: item.tipo === 'Urgencia' || item.tipo === 'Urgência' ? 'Urgência' : 'Geral'
                    };

                    const { error: agdError } = await supabase.from('consultas').insert([novaConsulta]);
                    if (!agdError) {
                        successCount++;
                    } else {
                        errors++;
                    }
                }

                setImportProgress(Math.round(((i + 1) / consultasPreview.length) * 100));
            }

            if (successCount > 0) {
                toast.success(`${successCount} consultas importadas com sucesso!`);
                await logAction('IMPORTAÇÃO DE AGENDA', `Foram importadas ${successCount} consultas via PDF (${modelo}).`);
                if (onSuccess) onSuccess();
                handleClose();
            } else if (errors > 0) {
                toast.error(`Falha ao importar as consultas.`);
            } else {
                toast.error(`Todas as consultas do documento já estavam agendadas no sistema (Duplicadas).`);
            }

        } catch (error) {
            console.error(error);
            toast.error("Ocorreu um erro inesperado durante a importação.");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[99998] animate-in fade-in" onClick={!isImporting ? handleClose : null} />
            
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 font-sans pointer-events-none">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto">
                    
                    {/* Header */}
                    <div className="px-6 py-4 flex justify-between items-center bg-slate-50 border-b border-slate-200 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <UploadCloud size={18} />
                            </div>
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">
                                Importar Agenda
                            </h2>
                        </div>
                        <button onClick={handleClose} disabled={isImporting} className="text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                        
                        {/* Seletor de Modelo */}
                        {consultasPreview.length === 0 && (
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="text-[11px] font-bold text-slate-600 uppercase mb-2 block tracking-wide">
                                    Selecione o Modelo do Relatório
                                </label>
                                <select 
                                    value={modelo} 
                                    onChange={(e) => setModelo(e.target.value)}
                                    className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    disabled={isImporting}
                                >
                                    <option value="celk">CELK (PDF de Agendamento)</option>
                                    <option value="ame">AME (PDF Interconsulta)</option>
                                    <option value="print-agenda">Print de Tela da Agenda</option>
                                </select>
                            </div>
                        )}

                        {consultasPreview.length === 0 && modelo === 'print-agenda' && (
                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
                                <label className="text-[11px] font-bold text-orange-800 uppercase mb-2 block tracking-wide">
                                    Selecione o Médico Atendente
                                </label>
                                <select 
                                    value={medicoPrint} 
                                    onChange={(e) => setMedicoPrint(e.target.value)}
                                    className="w-full h-10 px-3 py-2 bg-white border border-orange-300 rounded-lg text-sm font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                                    disabled={isImporting}
                                >
                                    <option value="">Selecione o Médico...</option>
                                    {medicosDisponiveis.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Área de Input (Upload ou Texto) */}
                        {consultasPreview.length === 0 ? (
                            <div className="space-y-4">
                                <div className="flex border-b border-slate-200">
                                    <button 
                                        className={`px-4 py-2 text-xs font-bold uppercase transition-colors ${modoEntrada === 'pdf' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setModoEntrada('pdf')}
                                    >
                                        Anexar PDF
                                    </button>
                                    <button 
                                        className={`px-4 py-2 text-xs font-bold uppercase transition-colors ${modoEntrada === 'texto' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setModoEntrada('texto')}
                                    >
                                        Colar Texto
                                    </button>
                                </div>

                                {modoEntrada === 'pdf' ? (
                                    <div 
                                        className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <input 
                                            type="file" 
                                            accept="application/pdf" 
                                            className="hidden" 
                                            ref={fileInputRef} 
                                            onChange={handleFileChange} 
                                        />
                                        {isParsing ? (
                                            <div className="flex flex-col items-center text-blue-600">
                                                <Loader2 size={32} className="animate-spin mb-3" />
                                                <p className="text-sm font-bold uppercase tracking-wider">Analisando Documento...</p>
                                            </div>
                                        ) : (
                                            <>
                                                <FileText size={40} className="text-slate-400 mb-3" />
                                                <p className="text-sm font-bold text-slate-700">Clique para anexar o PDF</p>
                                                <p className="text-xs text-slate-500 mt-1">O sistema fará a leitura automática</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <textarea 
                                            className="w-full h-40 p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                            placeholder="Cole aqui todo o texto do relatório de agendamentos..."
                                            value={rawText}
                                            onChange={(e) => setRawText(e.target.value)}
                                        ></textarea>
                                        <button 
                                            onClick={handleTextProcess}
                                            className="w-full h-10 bg-slate-800 text-white font-bold text-xs uppercase rounded-lg hover:bg-slate-900 transition-colors"
                                        >
                                            Processar Texto Colado
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Preview List */
                            <div className="flex flex-col h-full space-y-4">
                                <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-200">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={20} className="text-emerald-600" />
                                        <span className="text-sm font-bold">{consultasPreview.length} Consultas Identificadas</span>
                                    </div>
                                    <button 
                                        onClick={() => setConsultasPreview([])}
                                        disabled={isImporting}
                                        className="text-[10px] font-bold uppercase underline text-emerald-700 hover:text-emerald-900"
                                    >
                                        Limpar e tentar outro
                                    </button>
                                </div>

                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[300px] overflow-y-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                                            <tr>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</th>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Horário</th>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paciente</th>
                                                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nascimento</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {consultasPreview.map((c, i) => {
                                                const semData = !c.data_agendamento || !c.horario;
                                                return (
                                                <tr key={i} className={semData ? "bg-red-50" : "hover:bg-slate-50/50"}>
                                                    <td className={`px-4 py-2 text-xs font-semibold ${c.data_agendamento ? 'text-slate-700' : 'text-red-600 font-bold'}`}>
                                                        {c.data_agendamento ? c.data_agendamento.split('-').reverse().join('/') : 'SEM DATA'}
                                                    </td>
                                                    <td className="px-4 py-2 text-xs font-bold text-slate-900">{c.horario}</td>
                                                    <td className="px-4 py-2">
                                                        <div className="text-xs font-bold text-slate-900">{c.paciente_nome}</div>
                                                        <div className="text-[10px] text-slate-500">{c.paciente_telefone}</div>
                                                    </td>
                                                    <td className="px-4 py-2 text-xs text-slate-600">
                                                        {c.paciente_nascimento ? c.paciente_nascimento.split('-').reverse().join('/') : '-'}
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-3 text-blue-800 text-xs">
                                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Atenção:</strong> Ao confirmar, o sistema procurará pacientes pelo Nome exato. Se não encontrar, criará pacientes novos automaticamente usando o Nome, Telefone e Data de Nascimento identificados na lista.
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
                        <div className="flex-1">
                            {isImporting && (
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-600 transition-all duration-300"
                                            style={{ width: `${importProgress}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500">{importProgress}%</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                            <button 
                                type="button" 
                                onClick={handleClose} 
                                disabled={isImporting}
                                className="h-10 px-6 text-slate-500 font-bold text-xs uppercase hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="button"
                                disabled={consultasPreview.length === 0 || isImporting}
                                onClick={handleConfirmImport}
                                className="h-10 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase rounded-lg shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                            >
                                {isImporting ? (
                                    <><Loader2 size={16} className="animate-spin" /> Importando...</>
                                ) : (
                                    <>Confirmar e Importar</>
                                )}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
};
