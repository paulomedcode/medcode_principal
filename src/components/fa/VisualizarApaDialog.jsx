import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Printer, FileText } from 'lucide-react';
import { supabase } from '../../services/supabase';
import ApaPrintTemplate from '../ApaPrintTemplate';

/**
 * A APA de origem, inteira, sem sair da ficha.
 *
 * Existe para que o cabeçalho da FA possa ser curto: o que o anestesista precisa
 * em sala fica na ficha, e o resto da avaliação — via aérea prevista, exames,
 * comorbidades, plano — está aqui, do mesmo jeito que sai impresso, a um toque.
 *
 * Imprimir daqui imprime a APA. Parece óbvio, mas não era: a impressão do
 * sistema esconde a tela inteira e imprime o que está no `print-master-container`
 * — que, aberto pela ficha, era a própria ficha. Por isso a APA entra no mesmo
 * contêiner enquanto este diálogo está aberto, e a ficha sai dele.
 */
export default function VisualizarApaDialog({ apaId, onFechar }) {
    const [apa, setApa] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);

    useEffect(() => {
        let ativo = true;
        supabase.from('apas').select('*').eq('id', apaId).maybeSingle().then(({ data, error }) => {
            if (!ativo) return;
            setApa(data || null);
            setErro(error ? error.message : (data ? null : 'A avaliação não foi encontrada.'));
            setCarregando(false);
        });
        return () => { ativo = false; };
    }, [apaId]);

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1010] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
                        <FileText size={16} className="text-emerald-600" />
                        Avaliação pré-anestésica
                    </h3>
                    <div className="flex items-center gap-2">
                        {apa && (
                            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded-lg">
                                <Printer size={13} /> Imprimir
                            </button>
                        )}
                        <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                    </div>
                </div>

                <div className="p-4 max-h-[75vh] overflow-y-auto bg-slate-100">
                    {carregando && (
                        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-blue-600" size={28} /></div>
                    )}

                    {!carregando && erro && (
                        <p className="py-12 text-center text-xs font-bold text-slate-500">{erro}</p>
                    )}

                    {!carregando && apa && (
                        <div className="overflow-x-auto">
                            <div className="bg-white shadow-lg mx-auto" style={{ width: '210mm', minHeight: '297mm', padding: '15mm' }}>
                                <ApaPrintTemplate data={apa} />
                            </div>
                        </div>
                    )}

                    {apa && createPortal(
                        <div className="print-master-container">
                            <ApaPrintTemplate data={apa} />
                        </div>,
                        document.body
                    )}
                </div>
            </div>
        </div>
    );
}
