import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Loader2, CalendarDays, Video } from 'lucide-react';
import { toISODate } from '../../utils/date';

/*
 * AGENDA DA TELA INICIAL — semana ou mês.
 *
 * Feita para LER o que está marcado, não só ver que existe algo: na semana
 * cada dia é uma coluna com o nome inteiro de cada item (quebra em linhas, não
 * corta com reticências); no mês as células mostram o começo de cada item e o
 * dia escolhido aparece por extenso logo abaixo da grade.
 *
 * O modo (semana/mês) fica lembrado no navegador.
 */

const CHAVE_MODO = 'inicio-agenda-modo';
const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const deISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const somar = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return toISODate(d); };
// Segunda-feira da semana de `iso`.
const inicioSemana = (iso) => { const d = deISO(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toISODate(d); };
const nomeMes = (iso) => deISO(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const diaExtenso = (iso) => deISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const ordenar = (a, b) => (a.hora || '99').localeCompare(b.hora || '99') || a.titulo.localeCompare(b.titulo);

function Item({ item, compacto = false, tipos, hoje, onAbrir, onConcluir, concluindo }) {
    const t = tipos[item.tipo];
    const atrasado = !item.feito && !item.semAtraso && item.data < hoje;
    const podeConcluir = item.concluir && !item.feito;
    return (
        <div className={`group rounded-lg border-l-[3px] ${t.borda} ${item.feito ? 'opacity-55' : ''} bg-slate-50 hover:bg-slate-100 transition-colors ${compacto ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}>
            {/* Linha de cima: hora e tipo à esquerda, ✓ à direita — o nome fica com a largura toda */}
            <div className="flex items-center gap-1 min-h-[20px]">
                {item.hora && <span className={`text-[11.5px] tabular-nums font-semibold ${atrasado ? 'text-rose-600' : 'text-slate-600'}`}>{item.hora}</span>}
                <span className="text-[10.5px] text-slate-400 truncate">{t.rotulo}</span>
                {item.meet && (
                    <a href={item.meet} target="_blank" rel="noopener noreferrer" title="Entrar no Meet"
                        className={`${podeConcluir ? '' : 'ml-auto'} flex items-center gap-0.5 text-[10.5px] font-medium text-sky-600 hover:underline shrink-0`}>
                        <Video size={12} /> Meet
                    </a>
                )}
                {podeConcluir && (
                    <button onClick={() => onConcluir(item)} disabled={concluindo === item.id}
                        title={item.concluir.tipo === 'toque' ? 'Abrir a mensagem pronta' : 'Marcar como feito'}
                        className="ml-auto -my-0.5 -mr-1 w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0">
                        {concluindo === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                    </button>
                )}
            </div>
            <button onClick={() => onAbrir(item)} className="block w-full text-left">
                <p className={`text-[12.5px] leading-snug font-medium hover:text-indigo-600 ${atrasado ? 'text-rose-600' : 'text-slate-800'} ${item.feito ? 'line-through' : ''}`} style={{ overflowWrap: 'break-word' }}>
                    {item.titulo}
                </p>
                {item.contexto && <p className={`text-[11px] text-slate-400 leading-snug mt-0.5 ${compacto ? 'truncate' : ''}`} title={item.contexto}>{item.contexto}</p>}
            </button>
        </div>
    );
}

export default function AgendaInicio({ itens, hoje, tipos, onAbrir, onConcluir, concluindo, extra = null }) {
    const [modo, setModoRaw] = useState(() => { try { return localStorage.getItem(CHAVE_MODO) === 'mes' ? 'mes' : 'semana'; } catch { return 'semana'; } });
    const setModo = (m) => { setModoRaw(m); try { localStorage.setItem(CHAVE_MODO, m); } catch { /* ignore */ } };
    const [ancora, setAncora] = useState(hoje);
    const [diaSel, setDiaSel] = useState(hoje);

    const porDia = useMemo(() => {
        const m = new Map();
        itens.forEach((i) => { if (!m.has(i.data)) m.set(i.data, []); m.get(i.data).push(i); });
        m.forEach((l) => l.sort(ordenar));
        return m;
    }, [itens]);

    // Dias exibidos
    const dias = useMemo(() => {
        if (modo === 'semana') {
            const ini = inicioSemana(ancora);
            return Array.from({ length: 7 }, (_, k) => somar(ini, k));
        }
        const primeiro = `${ancora.slice(0, 7)}-01`;
        const ini = inicioSemana(primeiro);
        const ultimo = toISODate(new Date(deISO(primeiro).getFullYear(), deISO(primeiro).getMonth() + 1, 0));
        const fim = somar(inicioSemana(ultimo), 6);
        const out = [];
        for (let d = ini; d <= fim; d = somar(d, 1)) out.push(d);
        return out;
    }, [modo, ancora]);

    const navegar = (n) => {
        if (modo === 'semana') setAncora((a) => somar(a, 7 * n));
        else setAncora((a) => { const d = deISO(a); return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1)); });
    };
    const irHoje = () => { setAncora(hoje); setDiaSel(hoje); };

    const titulo = modo === 'mes'
        ? nomeMes(ancora)
        : (() => {
            const a = deISO(dias[0]); const b = deISO(dias[6]);
            const fmt = (d, comMes) => d.toLocaleDateString('pt-BR', comMes ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
            return a.getMonth() === b.getMonth() ? `${fmt(a)} – ${fmt(b, true)}` : `${fmt(a, true)} – ${fmt(b, true)}`;
        })();
    const mesAncora = ancora.slice(0, 7);

    const doDiaSel = porDia.get(diaSel) || [];
    const acoes = { tipos, hoje, onAbrir, onConcluir, concluindo };

    return (
        <div>
            {/* Barra */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight first-letter:uppercase mr-1">{titulo}</h2>
                <div className="flex items-center">
                    <button onClick={() => navegar(-1)} title="Anterior" className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100"><ChevronLeft size={16} /></button>
                    <button onClick={() => navegar(1)} title="Próximo" className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100"><ChevronRight size={16} /></button>
                </div>
                <button onClick={irHoje} className="h-7 px-2.5 rounded-md text-[12px] font-medium text-slate-600 border border-black/[.08] hover:bg-slate-50">Hoje</button>
                <div className="ml-auto flex items-center gap-3">
                {extra}
                <div className="flex gap-0.5 bg-slate-900/[.05] rounded-lg p-0.5">
                    {[['semana', 'Semana'], ['mes', 'Mês']].map(([id, rot]) => (
                        <button key={id} onClick={() => setModo(id)}
                            className={`h-7 px-3 rounded-md text-[12.5px] font-medium transition-all ${modo === id ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-800'}`}>
                            {rot}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            {/* Legenda */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                {Object.entries(tipos).filter(([id]) => id !== 'google' || itens.some((i) => i.tipo === 'google')).map(([id, t]) => (
                    <span key={id} className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className={`w-2 h-2 rounded-full ${t.ponto}`} />{t.rotulo}</span>
                ))}
            </div>

            {modo === 'semana' ? (
                <div className="grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-1.5">
                    {dias.map((dia) => {
                        const lista = porDia.get(dia) || [];
                        const ehHoje = dia === hoje;
                        const d = deISO(dia);
                        return (
                            <div key={dia} className={`rounded-xl p-1.5 md:min-h-[260px] ${ehHoje ? 'bg-indigo-50/60 ring-1 ring-indigo-200' : 'bg-slate-50/40'} ${lista.length === 0 && !ehHoje ? 'hidden md:block' : ''}`}>
                                <div className="flex md:flex-col items-baseline md:items-start gap-2 md:gap-0 px-1 pb-1.5">
                                    <span className={`text-[11px] font-medium ${ehHoje ? 'text-indigo-600' : 'text-slate-400'}`}>{DIAS_SEMANA[(d.getDay() + 6) % 7]}</span>
                                    <span className={`text-[17px] font-semibold tabular-nums leading-tight ${ehHoje ? 'text-indigo-600' : dia < hoje ? 'text-slate-400' : 'text-slate-800'}`}>{d.getDate()}</span>
                                </div>
                                <div className="space-y-1">
                                    {lista.map((item) => <Item key={item.id} item={item} compacto {...acoes} />)}
                                    {lista.length === 0 && <p className="text-[11px] text-slate-300 px-1 md:hidden">Livre</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-7 gap-px bg-black/[.06] rounded-xl overflow-hidden border border-black/[.06]">
                        {DIAS_SEMANA.map((n) => <div key={n} className="bg-white text-[11px] font-medium text-slate-400 px-2 py-1.5">{n}</div>)}
                        {dias.map((dia) => {
                            const lista = porDia.get(dia) || [];
                            const ehHoje = dia === hoje;
                            const sel = dia === diaSel;
                            const foraMes = dia.slice(0, 7) !== mesAncora;
                            return (
                                <button key={dia} onClick={() => setDiaSel(dia)}
                                    className={`text-left bg-white min-h-[58px] md:min-h-[96px] p-1 md:p-1.5 flex flex-col gap-0.5 hover:bg-slate-50 transition-colors ${sel ? 'ring-2 ring-inset ring-indigo-400' : ''}`}>
                                    <span className={`text-[12px] font-semibold tabular-nums w-6 h-6 rounded-full flex items-center justify-center ${ehHoje ? 'bg-indigo-600 text-white' : foraMes ? 'text-slate-300' : 'text-slate-700'}`}>{deISO(dia).getDate()}</span>
                                    {/* Celular: só pontinhos; tela grande: começo do nome */}
                                    <span className="flex flex-wrap gap-0.5 md:hidden px-0.5">
                                        {lista.slice(0, 6).map((i) => <span key={i.id} className={`w-1.5 h-1.5 rounded-full ${tipos[i.tipo].ponto}`} />)}
                                    </span>
                                    <span className="hidden md:flex flex-col gap-0.5 min-w-0">
                                        {lista.slice(0, 3).map((i) => (
                                            <span key={i.id} className={`text-[11px] leading-tight line-clamp-2 break-words rounded px-1 py-0.5 border-l-2 ${tipos[i.tipo].borda} ${i.feito ? 'line-through text-slate-400' : !i.semAtraso && i.data < hoje ? 'text-rose-600' : 'text-slate-700'} bg-slate-50`}>
                                                {i.hora && <span className="tabular-nums text-slate-500 mr-0.5">{i.hora}</span>}{i.titulo}
                                            </span>
                                        ))}
                                        {lista.length > 3 && <span className="text-[10.5px] font-medium text-slate-500 px-1">+{lista.length - 3} mais</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* O dia escolhido, por extenso */}
                    <div className="mt-4">
                        <p className="text-[13px] font-semibold text-slate-800 first-letter:uppercase mb-2 flex items-center gap-1.5">
                            <CalendarDays size={14} className="text-slate-400" />{diaExtenso(diaSel)}
                            {diaSel === hoje && <span className="text-[11px] font-medium text-indigo-600">· hoje</span>}
                        </p>
                        {doDiaSel.length === 0
                            ? <p className="text-[12px] text-slate-400">Nada marcado neste dia.</p>
                            : <div className="grid gap-1.5 sm:grid-cols-2">{doDiaSel.map((item) => <Item key={item.id} item={item} {...acoes} />)}</div>}
                    </div>
                </>
            )}
        </div>
    );
}
