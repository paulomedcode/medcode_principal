import React, { useState, useEffect, useRef } from 'react';
import { SlidersHorizontal, MoreHorizontal, X, Loader2 } from 'lucide-react';
import { cup } from './cupertino';

/*
 * Peças compartilhadas das telas de lista do financeiro (Contas a Pagar/Receber
 * e Movimentações).
 *
 * O problema que elas resolvem: as duas telas tinham uma fileira de 7–9 filtros
 * de mesmo peso, vários truncando o próprio nome porque o rótulo morava DENTRO
 * do controle ("Centro de custo: to…"). Recolher isso num popover só é seguro
 * se o que está ativo continuar à vista — daí o par FilterPopover + FilterChips:
 * o popover guarda os controles, os chips denunciam o que está filtrando.
 */

// Fecha no clique fora e no Esc. Usado pelo popover e pelo menu.
const useFecharFora = (open, setOpen, ref) => {
    useEffect(() => {
        if (!open) return;
        const fora = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', fora);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
    }, [open, setOpen, ref]);
};

// Rótulo dos campos de dentro do popover — sempre ACIMA do controle.
export const filtroRotulo = `${cup.label} block mb-1`;

/*
 * Botão "Filtros" + painel. `count` acende o botão e mostra quantos filtros
 * avançados estão ativos; os campos vêm como children.
 */
export function FilterPopover({ count = 0, onClear, hasAny, children, width = 320 }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useFecharFora(open, setOpen, ref);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className={`h-9 px-3 rounded-lg border text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors ${count > 0
                    ? 'border-[#0071e3]/30 bg-[#0071e3]/[.07] text-[#0071e3]'
                    : 'border-black/[.085] bg-white text-[#1d1d1f] hover:bg-black/[.03]'}`}
            >
                <SlidersHorizontal size={13} />
                Filtros{count > 0 ? ` · ${count}` : ''}
            </button>

            {open && (
                <div style={{ width }}
                    className="absolute left-0 top-full mt-1.5 z-[13000] bg-white border border-black/[.085] rounded-xl shadow-2xl p-4 space-y-3">
                    {children}
                    {hasAny && (
                        <div className="pt-1 border-t border-black/[.06]">
                            <button onClick={() => { onClear?.(); setOpen(false); }}
                                className="w-full h-9 rounded-lg text-[11.5px] font-medium text-[#86868b] hover:text-[#d70015] hover:bg-black/[.03] transition-colors">
                                Limpar todos os filtros
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/*
 * Chips do que está filtrando agora. Cada um sai no ✕ — é o que impede o
 * popover de esconder um filtro e deixar a pessoa achando que a lista está
 * completa. `chips`: [{ key, label, clear }].
 */
export function FilterChips({ chips = [] }) {
    return chips.map(c => (
        <span key={c.key}
            className="inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-lg bg-[#0071e3]/[.07] border border-[#0071e3]/20 text-[11.5px] font-medium text-[#0071e3] max-w-[220px]">
            <span className="truncate">{c.label}</span>
            <button onClick={c.clear} title="Remover filtro" className="hover:opacity-60 transition-opacity shrink-0">
                <X size={12} />
            </button>
        </span>
    ));
}

/*
 * Menu "⋯" das ações ocasionais (imprimir, exportar, importar), para o topo
 * ficar com uma única ação primária.
 * `items`: [{ icon, label, onClick }] ou [{ icon, label, file: true, accept, onChange, busy }].
 */
export function MoreMenu({ items = [], title = 'Mais ações' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useFecharFora(open, setOpen, ref);

    const linha = 'w-full flex items-center gap-2 px-3 py-2 text-[11.5px] font-medium text-[#1d1d1f] hover:bg-black/[.04] transition-colors text-left';

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)} title={title} className={`${cup.btn} !px-2.5`}>
                <MoreHorizontal size={15} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1.5 z-[13000] w-[190px] bg-white border border-black/[.085] rounded-xl shadow-2xl overflow-hidden py-1">
                    {items.filter(Boolean).map((it, i) => {
                        const Icone = it.icon;
                        if (it.file) {
                            return (
                                <label key={i} title={it.title}
                                    className={`${linha} cursor-pointer ${it.busy ? 'opacity-60 pointer-events-none' : ''}`}>
                                    {it.busy ? <Loader2 size={14} className="animate-spin text-[#86868b]" /> : <Icone size={14} className="text-[#86868b]" />}
                                    {it.label}
                                    <input type="file" accept={it.accept} className="hidden"
                                        onChange={(e) => { setOpen(false); it.onChange(e); }} />
                                </label>
                            );
                        }
                        return (
                            <button key={i} title={it.title} className={linha}
                                onClick={() => { setOpen(false); it.onClick(); }}>
                                <Icone size={14} className="text-[#86868b]" /> {it.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
