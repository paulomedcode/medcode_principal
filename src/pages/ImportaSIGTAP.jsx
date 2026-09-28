import React, { useState } from 'react';

import { UploadCloud, CheckCircle, FileText, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const SigtapUploader = () => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState('Aguardando arquivo do SIGTAP...');

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setStatus('Lendo arquivo...');
        const reader = new FileReader();

        // O segredo: 'ISO-8859-1' garante que os acentos do governo venham corretos
        reader.readAsText(file, 'ISO-8859-1');

        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const lines = text.split('\n');
                const parsedData = [];

                // Processa linha por linha do TXT
                lines.forEach(line => {
                    // O layout padrão SIGTAP tem código com 10 dígitos nas primeiras posições
                    if (line.length > 20) {
                        const codigo = line.substring(0, 10).trim();
                        const nome = line.substring(10, 260).trim(); // O nome vai da posição 10 até 260

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
                const upsertChunk = chunk
                    .filter(item => item.codigo && item.nome)
                    .map(item => ({
                        codigo: String(item.codigo),
                        nome: item.nome.toUpperCase()
                    }));

                if (upsertChunk.length > 0) {
                    const { error } = await supabase.from('sigtap').upsert(upsertChunk, { onConflict: 'codigo' });
                    if (error) throw error;
                }

                currentBatchIndex++;
                setProgress(Math.min((i + batchSize), data.length));
                setStatus(`Processando lote ${currentBatchIndex} de ${totalBatches}...`);

                // Pausa técnica para o Firebase respirar
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
        <div className="min-h-full bg-white/60 flex flex-col items-center justify-center p-4 font-sans">
            <div className="bg-white/60 p-10 rounded-[2.5rem] shadow-xl max-w-lg w-full text-center space-y-8 border border-white/40">

                <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-white shadow-lg shadow-blue-200">
                    <FileText size={36} />
                </div>

                <div>
                    <h1 className="text-2xl font-black text-slate-900 drop-shadow-none uppercase tracking-widest">Importador SIGTAP</h1>
                    <p className="text-sm font-bold text-slate-500 mt-2 uppercase tracking-wide">
                        Aceita o arquivo oficial <span className="text-blue-600 bg-blue-500/20 px-2 py-0.5 rounded">tb_procedimento.txt</span>
                    </p>
                </div>

                {!loading && progress === 0 && (
                    <label className="block w-full cursor-pointer group">
                        <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
                        <div className="w-full py-8 border-2 border-dashed border-white/60 rounded-3xl group-hover:bg-blue-500/20 group-hover:border-blue-300 transition-all flex flex-col items-center gap-2">
                            <UploadCloud size={32} className="text-slate-600 group-hover:text-blue-500 transition-colors" />
                            <span className="text-xs font-black text-slate-500 group-hover:text-blue-600 uppercase tracking-widest transition-colors">
                                Clique para selecionar o arquivo TXT
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
                    <div className="bg-emerald-500/20 text-emerald-600 p-6 rounded-3xl border border-emerald-100 flex flex-col items-center gap-2 font-black animate-in zoom-in duration-300">
                        <CheckCircle size={32} />
                        <span className="uppercase text-sm tracking-widest">Importação Finalizada!</span>
                        <span className="text-[11px] opacity-70 font-bold">Pode fechar esta tela agora.</span>
                    </div>
                )}

                <div className="bg-amber-500/20 p-4 rounded-xl border border-amber-100 flex items-start gap-3 text-left">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 font-bold leading-relaxed">
                        ATENÇÃO: Este processo pode levar alguns minutos pois o arquivo do governo é grande. Não feche a janela até a barra completar.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SigtapUploader;