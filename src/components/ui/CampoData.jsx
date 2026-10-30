import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/*
 * Campo de data do sistema, no lugar do <input type="date"> do navegador.
 *
 * - Clicar no campo seleciona a data inteira: Delete/Backspace apaga tudo.
 * - Dá para digitar (só os números: 05112026 vira 05/11/2026).
 * - O calendário abre com setas para o mês anterior/seguinte (e o ano, nas
 *   setas duplas), e tem "Hoje" e "Limpar".
 *
 * Funciona como o input: `value` em 'AAAA-MM-DD' (ou '') e `onChange` recebe
 * { target: { value } }, então trocar <input type="date" por <CampoData não
 * muda o resto do código.
 */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const p2 = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${p2(m + 1)}-${p2(d)}`;
const hojeISO = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
const paraTexto = (v) => { if (!v) return ''; const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

// "05112026" / "5/11/2026" → "05/11/2026" enquanto digita.
function mascara(t) {
    const d = t.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
function paraISO(texto) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
    if (!m) return null;
    const [, d, mes, y] = m.map(Number);
    const dt = new Date(y, mes - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mes - 1 && dt.getDate() === d ? iso(y, mes - 1, d) : null;
}

export default function CampoData({
    value, onChange, min, max, disabled, required, className = '', title, placeholder = 'dd/mm/aaaa', autoFocus, onClick,
}) {
    const valor = value ? String(value).slice(0, 10) : '';
    const [texto, setTexto] = useState(paraTexto(valor));
    const [aberto, setAberto] = useState(false);
    const [mes, setMes] = useState(() => { const b = valor || hojeISO(); return { y: Number(b.slice(0, 4)), m: Number(b.slice(5, 7)) - 1 }; });
    const [pos, setPos] = useState(null);
    const campo = useRef(null);
    const caixa = useRef(null);

    // Valor mudou (por fora, como o botão "Amanhã", ou pelo que foi digitado):
    // reflete no texto. Digitação pela metade não muda o valor, então não some.
    const [valorVisto, setValorVisto] = useState(valor);
    if (valorVisto !== valor) {
        setValorVisto(valor);
        setTexto(paraTexto(valor));
    }

    const emitir = (v) => { if (v !== valor) onChange?.({ target: { value: v } }); };

    const abrir = () => {
        if (disabled) return;
        const b = valor || hojeISO();
        setMes({ y: Number(b.slice(0, 4)), m: Number(b.slice(5, 7)) - 1 });
        setAberto(true);
    };
    const fechar = () => setAberto(false);

    // Posição do calendário: embaixo do campo (ou em cima, se não couber).
    useLayoutEffect(() => {
        if (!aberto) return undefined;
        const calcular = () => {
            const r = campo.current?.getBoundingClientRect();
            if (!r) return;
            const alto = 318;
            const largura = 264;
            const cima = r.bottom + alto + 8 > window.innerHeight && r.top > alto + 8;
            setPos({
                top: cima ? r.top - alto - 4 : r.bottom + 4,
                left: Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)),
            });
        };
        calcular();
        window.addEventListener('resize', calcular);
        window.addEventListener('scroll', calcular, true);
        return () => { window.removeEventListener('resize', calcular); window.removeEventListener('scroll', calcular, true); };
    }, [aberto]);

    // Clique fora fecha.
    useEffect(() => {
        if (!aberto) return undefined;
        const fora = (e) => {
            if (campo.current?.contains(e.target) || caixa.current?.contains(e.target)) return;
            fechar();
        };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, [aberto]);

    const escolher = (v) => {
        setTexto(paraTexto(v));
        emitir(v);
        fechar();
    };

    const andar = (n) => setMes(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

    const aoDigitar = (e) => {
        const t = mascara(e.target.value);
        setTexto(t);
        if (!t) emitir('');
        else {
            const v = paraISO(t);
            if (v) { emitir(v); setMes({ y: Number(v.slice(0, 4)), m: Number(v.slice(5, 7)) - 1 }); }
        }
    };

    const aoTeclar = (e) => {
        if (e.key === 'Escape' && aberto) {
            // Fecha só o calendário, não a janela em volta.
            e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); fechar();
        } else if (e.key === 'Enter') {
            e.preventDefault(); aberto ? fechar() : abrir();
        } else if (e.key === 'ArrowDown' && !aberto) {
            e.preventDefault(); abrir();
        }
    };

    // Dias do mês visível, começando no domingo.
    const primeiro = new Date(mes.y, mes.m, 1).getDay();
    const total = new Date(mes.y, mes.m + 1, 0).getDate();
    const celulas = [...Array(primeiro).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
    const hoje = hojeISO();
    const fora = (v) => (min && v < min) || (max && v > max);

    return (
        <>
            <div ref={campo} className={`relative ${/(^|\s)w-full/.test(className) && !className.includes('!w-') ? 'w-full' : 'inline-block align-middle'}`} onClick={onClick}>
                <input
                    type="text" inputMode="numeric" value={texto} placeholder={placeholder} title={title}
                    disabled={disabled} required={required} autoFocus={autoFocus} autoComplete="off"
                    onFocus={(e) => e.target.select()}
                    onMouseUp={(e) => e.preventDefault()}   // mantém tudo selecionado depois do clique
                    onClick={abrir}
                    onBlur={() => setTexto(paraTexto(valor))}
                    onChange={aoDigitar} onKeyDown={aoTeclar}
                    className={`${className} pr-8 tabular-nums`}
                />
                <button type="button" tabIndex={-1} disabled={disabled} onClick={(e) => { e.stopPropagation(); aberto ? fechar() : abrir(); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40" aria-label="Abrir calendário">
                    <Calendar size={14} />
                </button>
            </div>

            {aberto && pos && createPortal(
                <div ref={caixa} style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}
                    className="fixed z-[12000] w-[264px] bg-white border border-black/[.08] rounded-xl shadow-xl p-2.5 select-none">
                    <div className="flex items-center gap-0.5 mb-1.5">
                        <BotaoSeta onClick={() => andar(-12)} rotulo="Ano anterior"><ChevronsLeft size={15} /></BotaoSeta>
                        <BotaoSeta onClick={() => andar(-1)} rotulo="Mês anterior"><ChevronLeft size={15} /></BotaoSeta>
                        <span className="flex-1 text-center text-[12.5px] font-semibold text-slate-800">{MESES[mes.m]} de {mes.y}</span>
                        <BotaoSeta onClick={() => andar(1)} rotulo="Próximo mês"><ChevronRight size={15} /></BotaoSeta>
                        <BotaoSeta onClick={() => andar(12)} rotulo="Próximo ano"><ChevronsRight size={15} /></BotaoSeta>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[10.5px] font-medium text-slate-400 mb-0.5">
                        {SEMANA.map((s, i) => <span key={i} className="h-6 leading-6">{s}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                        {celulas.map((d, i) => {
                            if (!d) return <span key={i} />;
                            const v = iso(mes.y, mes.m, d);
                            const sel = v === valor;
                            const ehHoje = v === hoje;
                            return (
                                <button key={i} type="button" disabled={fora(v)} onClick={() => escolher(v)}
                                    className={`h-8 rounded-lg text-[12px] tabular-nums transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${sel
                                        ? 'bg-slate-900 text-white font-semibold'
                                        : ehHoje ? 'text-indigo-600 font-semibold ring-1 ring-inset ring-indigo-300 hover:bg-slate-100' : 'text-slate-700 hover:bg-slate-100'}`}>
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/[.06]">
                        <button type="button" onClick={() => escolher('')}
                            className="h-7 px-2 rounded-md text-[12px] font-medium text-slate-500 hover:text-rose-600 hover:bg-slate-100">Limpar</button>
                        <button type="button" disabled={fora(hoje)} onClick={() => escolher(hoje)}
                            className="h-7 px-2 rounded-md text-[12px] font-medium text-indigo-600 hover:bg-slate-100 disabled:opacity-40">Hoje</button>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}

const BotaoSeta = ({ onClick, rotulo, children }) => (
    <button type="button" onClick={onClick} title={rotulo} aria-label={rotulo}
        className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        {children}
    </button>
);
