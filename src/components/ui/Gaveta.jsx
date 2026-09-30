import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Gaveta que sobe de baixo — usada no celular para filtros, o menu "Mais" e o
 * "Novo". Fecha tocando fora, no X ou com Esc.
 */
export default function Gaveta({ aberta, onClose, titulo, children, rodape }) {
    useEffect(() => {
        if (!aberta) return undefined;
        const esc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
    }, [aberta, onClose]);

    if (!aberta) return null;
    return (
        <div className="fixed inset-0 z-[10050] flex flex-col justify-end print:hidden" role="dialog" aria-modal="true">
            <div className="mc-veu absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
            <div className="mc-gaveta relative bg-white rounded-t-3xl shadow-2xl max-h-[88dvh] flex flex-col pb-seguro">
                <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
                    <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-slate-200" />
                    <h2 className="text-[15px] font-black text-slate-800 pt-2">{titulo}</h2>
                    <button onClick={onClose} aria-label="Fechar" className="mt-1 w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto px-4 pb-4">{children}</div>
                {rodape && <div className="shrink-0 border-t border-slate-100 px-4 py-3">{rodape}</div>}
            </div>
        </div>
    );
}
