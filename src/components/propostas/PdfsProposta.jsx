import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, FileDown, Eye, Download, Trash2, Sparkles, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../ui/ConfirmDialog';
import { listarPdfs, gerarPdfDoOrcamento, urlDoPdf, excluirPdf } from '../../services/propostas';

const fmtDataHora = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Tela cheia com um documento (PDF por URL ou HTML da pré-visualização). */
export function VisualizadorProposta({ titulo, url, html, onClose, acoes = null }) {
    return (
        <div className="fixed inset-0 z-[12000] flex flex-col bg-[#2a2438]">
            <div className="h-12 shrink-0 px-4 flex items-center gap-3 bg-[#1c1333] text-white">
                <FileText size={16} className="text-violet-300" />
                <span className="text-sm font-semibold truncate flex-1">{titulo}</span>
                {acoes}
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" title="Fechar"><X size={18} /></button>
            </div>
            {url
                ? <iframe title={titulo} src={url} className="flex-1 w-full border-0 bg-[#2a2438]" />
                : <iframe title={titulo} srcDoc={html} className="flex-1 w-full border-0 bg-[#2a2438]" />}
        </div>
    );
}

/**
 * PDFs gerados de um orçamento: gerar nova versão, ver dentro do sistema,
 * baixar e excluir. `gerarAoAbrir` gera uma versão assim que abre.
 */
export default function PdfsProposta({ quote, podeGerar, gerarAoAbrir = false, onClose }) {
    const [pdfs, setPdfs] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [vendo, setVendo] = useState(null); // { pdf, url }
    const [excluir, setExcluir] = useState(null);
    const cliente = quote.finance_parties?.nome_fantasia || quote.finance_parties?.name || '';
    const jaGerou = useRef(false);

    const carregar = useCallback(() => listarPdfs(quote.id).then(setPdfs).catch((e) => { console.error(e); setPdfs([]); }), [quote.id]);

    const ver = async (pdf) => {
        try { setVendo({ pdf, url: await urlDoPdf(pdf) }); }
        catch (e) { console.error(e); toast.error('Não foi possível abrir o PDF.'); }
    };

    const baixar = async (pdf) => {
        try { window.location.href = await urlDoPdf(pdf, { baixar: true, cliente }); }
        catch (e) { console.error(e); toast.error('Não foi possível baixar o PDF.'); }
    };

    const gerar = useCallback(async () => {
        setGerando(true);
        try {
            const novo = await gerarPdfDoOrcamento(quote.id);
            toast.success(`PDF v${novo.versao} gerado!`);
            await carregar();
            ver(novo);
        } catch (e) { console.error(e); toast.error(e.message || 'Erro ao gerar o PDF.'); }
        finally { setGerando(false); }
    }, [quote.id, carregar]);

    useEffect(() => {
        carregar();
        if (gerarAoAbrir && podeGerar && !jaGerou.current) { jaGerou.current = true; gerar(); }
    }, [carregar, gerar, gerarAoAbrir, podeGerar]);

    const confirmarExclusao = async () => {
        const pdf = excluir; setExcluir(null);
        try { await excluirPdf(pdf); toast.success('PDF excluído.'); carregar(); }
        catch (e) { console.error(e); toast.error('Não foi possível excluir.'); }
    };

    return (<>
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden border border-black/[.06] max-h-[85vh] flex flex-col">
                <div className="p-4 border-b border-black/[.06] flex items-center gap-3">
                    <FileDown size={16} className="text-[#0071e3]" />
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-800">Proposta em PDF · {quote.numero}</h3>
                        <p className="text-[11px] text-slate-400 font-semibold truncate">{cliente}{quote.title ? ` · ${quote.title}` : ''}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {pdfs === null ? (
                        <div className="py-10 flex justify-center"><Loader2 size={22} className="animate-spin text-[#0071e3]" /></div>
                    ) : pdfs.length === 0 && !gerando ? (
                        <p className="py-10 text-center text-[11px] font-bold text-slate-400 uppercase">Nenhum PDF gerado ainda</p>
                    ) : (
                        <ul className="divide-y divide-black/[.055]">
                            {gerando && (
                                <li className="px-4 py-3 flex items-center gap-3 text-xs text-slate-500 font-semibold">
                                    <Loader2 size={15} className="animate-spin text-[#0071e3]" /> Gerando o PDF…
                                </li>
                            )}
                            {pdfs.map((pdf, i) => (
                                <li key={pdf.id} className="px-4 py-2.5 flex items-center gap-3 text-xs group">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${i === 0 ? 'bg-violet-50 text-violet-700 border-violet-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>v{pdf.versao}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-slate-700">{fmtDataHora(pdf.created_at)}</div>
                                        <div className="text-[10.5px] text-slate-400 font-semibold truncate">{fmt(pdf.total)}{pdf.users?.name ? ` · ${pdf.users.name}` : ''}</div>
                                    </div>
                                    <button onClick={() => ver(pdf)} title="Visualizar" className="p-1.5 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg"><Eye size={15} /></button>
                                    <button onClick={() => baixar(pdf)} title="Baixar" className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><Download size={15} /></button>
                                    {podeGerar && <button onClick={() => setExcluir(pdf)} title="Excluir" className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {podeGerar && (
                    <div className="p-4 border-t border-black/[.06] flex items-center justify-between gap-3">
                        <p className="text-[10.5px] text-slate-400 font-semibold">Gera com o orçamento como está salvo agora. As versões anteriores ficam guardadas.</p>
                        <button onClick={gerar} disabled={gerando}
                            className="h-9 px-4 shrink-0 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 text-white rounded-lg font-semibold text-[11px] uppercase shadow-sm flex items-center gap-1.5">
                            {gerando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {pdfs?.length ? 'Gerar nova versão' : 'Gerar PDF'}
                        </button>
                    </div>
                )}
            </div>
        </div>

        {vendo && (
            <VisualizadorProposta titulo={`Proposta ${vendo.pdf.numero} · v${vendo.pdf.versao}${cliente ? ` · ${cliente}` : ''}`} url={vendo.url} onClose={() => setVendo(null)}
                acoes={<button onClick={() => baixar(vendo.pdf)} className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5"><Download size={14} /> Baixar</button>} />
        )}

        <ConfirmDialog open={!!excluir} title="Excluir PDF" message={`Excluir a versão v${excluir?.versao} desta proposta?`} confirmLabel="Excluir"
            onConfirm={confirmarExclusao} onCancel={() => setExcluir(null)} />
    </>);
}
