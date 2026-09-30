import React, { useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { SERVICOS } from '../../config/servicos';

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
    return (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
            <div className={`bg-white rounded-2xl shadow-2xl w-full ${largura} flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-black/[.06] max-h-[90vh]`}>
                <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
                    <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        {Icone && <Icone size={16} className="text-[#0071e3]" />} {titulo}
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">{children}</div>
                {rodape && <div className="p-4 border-t border-black/[.06] flex items-center justify-end gap-2 shrink-0 bg-white">{rodape}</div>}
            </div>
        </div>
    );
};
