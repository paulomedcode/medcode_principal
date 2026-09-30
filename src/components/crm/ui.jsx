import React, { useEffect, useState } from 'react';
import { X, Loader2, SlidersHorizontal } from 'lucide-react';
import { SERVICOS } from '../../config/servicos';
import Gaveta from '../ui/Gaveta';
import useTravaRolagem from '../../hooks/useTravaRolagem';

// Peças visuais do CRM/Vendas/Projetos — mesmo estilo das telas do financeiro.

export const inputCls = 'w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-[#0071e3] transition-all shadow-sm disabled:bg-slate-50 disabled:text-slate-400';
export const textareaCls = 'w-full px-3 py-2 bg-white border border-black/[.085] rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-[#0071e3] transition-all shadow-sm resize-none';
export const btnPrimario = 'h-9 px-4 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg font-bold text-[11px] uppercase shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-60';
export const btnSecundario = 'h-9 px-4 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg uppercase';
export const PAGINA = 'px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] bg-[#f5f5f7] font-sans text-slate-900';
export const CARD = 'bg-white border border-black/[.085] rounded-2xl shadow-sm';

export const Campo = ({ label, children, className = '' }) => (
    <div className={className}>
        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">{label}</label>
        {children}
    </div>
);

export const Etiqueta = ({ className = '', children, title }) => (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border whitespace-nowrap ${className}`}>
        {children}
    </span>
);

/** Marca um ou mais serviços. `value` é a lista de ids, na ordem em que foram marcados. */
export const ServicosPicker = ({ value = [], onChange }) => {
    const alternar = (id) => {
        if (value.includes(id)) {
            if (value.length > 1) onChange(value.filter((v) => v !== id));
        } else onChange([...value, id]);
    };
    return (
        <div className="flex flex-wrap gap-1.5">
            {SERVICOS.map((s) => {
                const ativo = value.includes(s.id);
                return (
                    <button key={s.id} type="button" onClick={() => alternar(s.id)} aria-pressed={ativo}
                        title={ativo && value.length === 1 ? 'Escolha outro antes de desmarcar este' : undefined}
                        className={`px-2.5 h-8 rounded-lg text-[11px] font-bold border transition-all ${ativo ? 'bg-[#0071e3] border-[#0071e3] text-white shadow-sm' : 'bg-white border-black/[.085] text-slate-600 hover:text-slate-900'}`}>
                        {s.emoji} {s.label}
                    </button>
                );
            })}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Celular (< md). No computador estas peças se comportam como antes.
// ---------------------------------------------------------------------------

/** Linha de abas/chips: quebra linha no computador, rola de lado no celular. */
export const CHIPS = 'flex items-center gap-1 bg-slate-100/70 rounded-lg p-0.5 flex-nowrap overflow-x-auto no-scrollbar max-w-full md:flex-wrap md:overflow-visible';

/** Faixa de números: rola de lado no celular em vez de empilhar cards. */
export const FAIXA_KPI = 'flex gap-3 mb-3 flex-nowrap overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-5 sm:px-5 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible';

/**
 * Filtros secundários. Computador: ficam na linha, como sempre. Celular: um
 * botão "Filtros" abre uma gaveta com eles (em vez de ocupar meia tela).
 */
export const FiltrosCelular = ({ ativos = 0, children }) => {
    const [aberto, setAberto] = useState(false);
    return (
        <>
            <div className="hidden md:contents">{children}</div>
            <button type="button" onClick={() => setAberto(true)}
                className={`md:hidden h-9 px-3 shrink-0 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${ativos ? 'bg-[#0071e3]/10 border-[#0071e3]/30 text-[#0071e3]' : 'bg-white border-black/[.085] text-slate-600'}`}>
                <SlidersHorizontal size={14} /> Filtros{ativos ? ` (${ativos})` : ''}
            </button>
            <Gaveta aberta={aberto} onClose={() => setAberto(false)} titulo="Filtros"
                rodape={<button type="button" onClick={() => setAberto(false)} className={`${btnPrimario} w-full justify-center h-11`}>Ver resultados</button>}>
                <div className="flex flex-col gap-3 [&_select]:w-full [&_select]:h-11 [&_select]:text-sm [&>*]:w-full">{children}</div>
            </Gaveta>
        </>
    );
};

export const Carregando = () => (
    <div className="flex items-center justify-center py-16"><Loader2 size={28} className="text-[#0071e3] animate-spin" /></div>
);

export const Vazio = ({ children }) => (
    <div className="py-10 text-center text-[11px] font-bold text-slate-400 uppercase">{children}</div>
);

/** Janela sobreposta com cabeçalho, corpo rolável e rodapé. */
export const Janela = ({ titulo, icone: Icone, onClose, children, rodape, largura = 'max-w-2xl' }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    useTravaRolagem();
    // Celular: ocupa a tela toda (sem margens nem rolagem da página por trás).
    return (
        <div className="fixed inset-0 z-[11000] flex items-stretch md:items-center justify-center md:p-4">
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
            <div className={`bg-white md:rounded-2xl shadow-2xl w-full ${largura} flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden md:border border-black/[.06] h-dvh md:h-auto max-h-dvh md:max-h-[90vh]`}>
                <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
                    <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        {Icone && <Icone size={16} className="text-[#0071e3]" />} {titulo}
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">{children}</div>
                {rodape && <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4 border-t border-black/[.06] flex items-center justify-end gap-2 shrink-0 bg-white">{rodape}</div>}
            </div>
        </div>
    );
};
