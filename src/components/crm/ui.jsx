import React, { useEffect, useState } from 'react';
import { X, Loader2, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SERVICOS } from '../../config/servicos';
import Gaveta from '../ui/Gaveta';
import useTravaRolagem from '../../hooks/useTravaRolagem';

// Peças visuais do CRM/Vendas/Projetos — mesmo estilo das telas do financeiro.

// Visual (out/2026): mais denso e sóbrio — sem caixa-alta nos botões, bordas
// finas, sombra quase nenhuma, títulos em caixa normal.
export const inputCls = 'w-full h-9 px-3 bg-white border border-black/[.09] rounded-lg text-[12.5px] font-normal text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400';
export const textareaCls = 'w-full px-3 py-2 bg-white border border-black/[.09] rounded-lg text-[12.5px] font-normal text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none';
export const btnPrimario = 'h-8 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium text-[12.5px] flex items-center gap-1.5 transition-colors disabled:opacity-60';
export const btnSecundario = 'h-8 px-3.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg';
export const PAGINA = 'px-4 sm:px-6 py-5 min-h-[calc(100dvh-64px)] bg-[#f7f7f8] font-sans text-slate-900';
export const CARD = 'bg-white border border-black/[.07] rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)]';
/** Título de página: caixa normal, sem gritar. */
export const TITULO = 'text-[17px] font-semibold text-slate-900 tracking-tight flex items-center gap-2';

export const Campo = ({ label, children, className = '' }) => (
    <div className={className}>
        <label className="text-[11px] font-medium text-slate-500 ml-0.5 mb-1 block">{label}</label>
        {children}
    </div>
);

export const Etiqueta = ({ className = '', children, title }) => (
    <span title={title} className={`inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[10.5px] font-medium border whitespace-nowrap ${className}`}>
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
                        className={`px-2.5 h-8 rounded-lg text-[12px] font-medium border transition-all ${ativo ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-black/[.09] text-slate-600 hover:text-slate-900'}`}>
                        <span className="inline-flex items-center gap-1.5">{React.createElement(s.icone, { size: 13 })} {s.label}</span>
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
export const CHIPS = 'flex items-center gap-0.5 bg-slate-200/50 rounded-lg p-0.5 flex-nowrap overflow-x-auto no-scrollbar max-w-full md:flex-wrap md:overflow-visible';

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
                className={`md:hidden h-9 px-3 shrink-0 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${ativos ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-black/[.09] text-slate-600'}`}>
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
    <div className="py-10 text-center text-[12.5px] font-normal text-slate-400">{children}</div>
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
                    <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                        {Icone && <Icone size={16} className="text-slate-400" />} {titulo}
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">{children}</div>
                {rodape && <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4 border-t border-black/[.06] flex items-center justify-end gap-2 shrink-0 bg-white">{rodape}</div>}
            </div>
        </div>
    );
};

/*
 * Ícones dos serviços de um item (oportunidade ou projeto), no lugar dos
 * emojis: um quadradinho por serviço, encostados quando são vários.
 * `icones` vem de resumoServicos(item).icones.
 */
const TAM_ICONE = { sm: [20, 12], md: [26, 14], lg: [36, 18] };
export const IconesServicos = ({ icones = [], tamanho = 'md' }) => {
    const [lado, ico] = TAM_ICONE[tamanho];
    const mostrar = icones.slice(0, 3);
    return (
        <span className="inline-flex shrink-0" aria-hidden>
            {mostrar.map((Icone, i) => (
                <span key={i} className="grid place-items-center rounded-md bg-slate-100 text-slate-600 ring-2 ring-white"
                    style={{ width: lado, height: lado, marginLeft: i ? -Math.round(lado * 0.3) : 0 }}>
                    {React.createElement(Icone, { size: ico, strokeWidth: 2 })}
                </span>
            ))}
            {icones.length > 3 && (
                <span className="grid place-items-center rounded-md bg-slate-200 text-slate-600 ring-2 ring-white text-[10px] font-semibold"
                    style={{ width: lado, height: lado, marginLeft: -Math.round(lado * 0.3) }}>+{icones.length - 3}</span>
            )}
        </span>
    );
};

/*
 * Seta de voltar dos títulos: volta para onde a pessoa estava. Quem abriu o
 * endereço direto (sem histórico dentro do app) vai para `padrao`.
 * O React Router guarda a posição no histórico em history.state.idx.
 */
export const BotaoVoltar = ({ padrao = '/home' }) => {
    const navigate = useNavigate();
    const voltar = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(padrao));
    return (
        <button type="button" onClick={voltar} title="Voltar"
            className="w-8 h-8 -ml-1.5 grid place-items-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-black/[.05] transition-colors shrink-0">
            <ArrowLeft size={17} />
        </button>
    );
};
