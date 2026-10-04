import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Send, Trash2, CalendarClock, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { listarAtividades, registrarAtividade, excluirAtividade, concluirProximoPasso } from '../../services/crm';
import { TIPOS_ATIVIDADE, tipoAtividade, fmtData } from '../../config/servicos';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../contexts/PermissionContext';
import { inputCls, textareaCls, CARD } from './ui';

const dataHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const hojeISO = () => { const d = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/**
 * Histórico + registro rápido. Recebe o vínculo (empresa, oportunidade e/ou
 * projeto) e filtra por UM deles (`filtro`): na tela da empresa aparece tudo
 * dela, inclusive o que foi registrado dentro das oportunidades e projetos.
 */
export default function Atividades({ vinculo, filtro, titulo = 'Histórico', onRegistrada }) {
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const [itens, setItens] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [form, setForm] = useState({ tipo: 'NOTA', titulo: '', descricao: '', proximo_passo: '', proximo_passo_em: '' });
    const [comProximo, setComProximo] = useState(false);

    const carregar = useCallback(async () => {
        try { setItens(await listarAtividades(filtro)); }
        catch (e) { console.error(e); toast.error('Erro ao carregar o histórico.'); }
        finally { setCarregando(false); }
    }, [JSON.stringify(filtro)]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { carregar(); }, [carregar]);

    const registrar = async (e) => {
        e.preventDefault();
        const titulo = form.titulo.trim();
        if (!titulo) return toast.error('Escreva o que aconteceu.');
        setSalvando(true);
        try {
            await registrarAtividade({
                ...vinculo, tipo: form.tipo, titulo, descricao: form.descricao.trim() || null,
                proximo_passo: comProximo ? (form.proximo_passo.trim() || null) : null,
                proximo_passo_em: comProximo ? (form.proximo_passo_em || null) : null,
            }, currentUser?.id);
            setForm({ tipo: form.tipo, titulo: '', descricao: '', proximo_passo: '', proximo_passo_em: '' });
            setComProximo(false);
            await carregar();
            onRegistrada?.();
        } catch (err) {
            console.error(err);
            toast.error('Não foi possível registrar.');
        } finally {
            setSalvando(false);
        }
    };

    const apagar = async (a) => {
        if (!window.confirm('Apagar este registro do histórico?')) return;
        try { await excluirAtividade(a.id); setItens((l) => l.filter((x) => x.id !== a.id)); }
        catch (e) { console.error(e); toast.error('Não foi possível apagar.'); }
    };

    const concluir = async (a) => {
        try {
            await concluirProximoPasso(a.id);
            setItens((l) => l.map((x) => (x.id === a.id ? { ...x, proximo_passo_concluido_em: new Date().toISOString() } : x)));
        } catch (e) { console.error(e); toast.error('Não foi possível concluir.'); }
    };

    const podeApagar = (a) => a.tipo !== 'SISTEMA' && (a.autor_id === currentUser?.id || hasPermission('Editar Clientes'));

    return (
        <div className={`${CARD} p-4 flex flex-col gap-3`}>
            <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight">{titulo}</h3>

            <form onSubmit={registrar} className="space-y-2 bg-slate-50/70 border border-black/[.05] rounded-xl p-3">
                <div className="flex flex-wrap gap-1">
                    {TIPOS_ATIVIDADE.filter((t) => t.id !== 'SISTEMA').map((t) => (
                        <button type="button" key={t.id} onClick={() => setForm((f) => ({ ...f, tipo: t.id }))}
                            className={`px-2.5 h-7 rounded-lg text-[12px] font-medium transition-all ${form.tipo === t.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-black/[.06] hover:text-slate-800'}`}>
                            {t.emoji} {t.label}
                        </button>
                    ))}
                </div>
                <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} className={inputCls}
                    placeholder="O que aconteceu? Ex: Reunião de apresentação da proposta" />
                <textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} className={`${textareaCls} h-14`}
                    placeholder="Detalhes (opcional)" />
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={comProximo} onChange={(e) => setComProximo(e.target.checked)} className="rounded" />
                    Combinar próximo passo
                </label>
                {comProximo && (
                    <div className="grid grid-cols-3 gap-2">
                        <input value={form.proximo_passo} onChange={(e) => setForm((f) => ({ ...f, proximo_passo: e.target.value }))} className={`${inputCls} col-span-2`}
                            placeholder="Ex: Enviar proposta revisada" />
                        <input type="date" min={hojeISO()} value={form.proximo_passo_em} onChange={(e) => setForm((f) => ({ ...f, proximo_passo_em: e.target.value }))} className={inputCls} />
                    </div>
                )}
                <div className="flex justify-end">
                    <button type="submit" disabled={salvando}
                        className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium text-[12px] shadow-sm flex items-center gap-1.5 disabled:opacity-60">
                        {salvando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Registrar
                    </button>
                </div>
            </form>

            {carregando ? (
                <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
            ) : itens.length === 0 ? (
                <p className="text-[11px] font-semibold text-slate-400 text-center py-4">Nenhum registro ainda.</p>
            ) : (
                <ol className="relative border-l border-slate-200 ml-2 space-y-3">
                    {itens.map((a) => {
                        const t = tipoAtividade(a.tipo);
                        return (
                            <li key={a.id} className="ml-4 group">
                                <span className="absolute -left-[9px] mt-0.5 w-[18px] h-[18px] rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px]">{t.emoji}</span>
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[12px] font-bold text-slate-800 leading-snug">{a.titulo}</p>
                                        {a.descricao && <p className="text-[11.5px] text-slate-600 whitespace-pre-wrap mt-0.5">{a.descricao}</p>}
                                        {a.proximo_passo_em && (a.proximo_passo_concluido_em ? (
                                            <p className="text-[11px] font-semibold text-emerald-700 mt-1 flex items-center gap-1 line-through decoration-emerald-400/60">
                                                <Check size={12} /> {a.proximo_passo || 'Próximo passo'} · {fmtData(a.proximo_passo_em)}
                                            </p>
                                        ) : (
                                            <p className="text-[11px] font-semibold text-amber-700 mt-1 flex items-center gap-1.5">
                                                <CalendarClock size={12} /> {a.proximo_passo || 'Próximo passo'} · {fmtData(a.proximo_passo_em)}
                                                <button onClick={() => concluir(a)} className="ml-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-medium hover:bg-emerald-100">Feito</button>
                                            </p>
                                        ))}
                                        <p className="text-[10px] font-medium text-slate-400 mt-1">
                                            {t.label} · {dataHora(a.data)}{a.autor?.name ? ` · ${a.autor.name}` : ''}
                                            {!filtro?.oportunidadeId && a.oportunidade?.titulo ? ` · ${a.oportunidade.titulo}` : ''}
                                            {!filtro?.projetoId && a.projeto?.nome ? ` · projeto ${a.projeto.nome}` : ''}
                                        </p>
                                    </div>
                                    {podeApagar(a) && (
                                        <button onClick={() => apagar(a)} title="Apagar"
                                            className="p-1 text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
