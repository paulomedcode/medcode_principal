import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X, ChevronLeft, ChevronRight, PhoneOutgoing, Target, CalendarClock, StickyNote, Trash2, Building2, Loader2, Copy, Send, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { STATUS_MANUAIS, statusProspeccao, tempoDesde } from '../../config/prospeccao';
import { listarEventos, registrarEvento, excluirEvento, salvarLead } from '../../services/prospeccao';
import { useAuth } from '../../contexts/AuthContext';
import { useUsuarios } from '../crm/dados';
import { Campo, inputCls, textareaCls, Etiqueta } from '../crm/ui';
import useTravaRolagem from '../../hooks/useTravaRolagem';
import { Estrelas, Contatos, NotaGoogle } from './pecas';
import VirarOportunidade from './VirarOportunidade';

const hojeMais = (dias) => {
    const d = new Date(); d.setDate(d.getDate() + dias);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fmtDataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Rascunho local de um campo que volta ao valor do banco quando ele muda por fora. */
const useRascunho = (valor) => {
    const [v, setV] = useState(valor);
    const [anterior, setAnterior] = useState(valor);
    if (valor !== anterior) { setAnterior(valor); setV(valor); }
    return [v, setV];
};
const digitando = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

/** Campo de texto que grava ao sair (só se mudou). */
const CampoTexto = ({ label, valor, onSalvar, disabled, tipo = 'text', className = '' }) => {
    const [v, setV] = useRascunho(valor ?? '');
    return (
        <Campo label={label} className={className}>
            <input type={tipo} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}
                onBlur={() => { if ((valor ?? '') !== v) onSalvar(v); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className={inputCls} />
        </Campo>
    );
};

const ROTULO_EVENTO = { CONTATO: 'Tentativa de contato', NOTA: 'Nota' };

/**
 * Ficha do lead: painel à direita (tela cheia no celular). Feita para triagem
 * em sequência: setas (ou ← →) passam para o próximo da lista filtrada e as
 * teclas 1–5 trocam o status. Quando o lead responde, "Virar oportunidade"
 * leva para o Vendas — e a ficha passa a mostrar em que etapa ele está lá.
 */
export default function FichaLead({ lead, posicao, total, onAnterior, onProximo, onClose, onAlterado, onExcluir, onTentativa,
    podeEditar, podeExcluir, podeVender, noVendas }) {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const usuarios = useUsuarios();
    const [eventos, setEventos] = useState([]);
    const [nota, setNota] = useState('');
    const [salvandoNota, setSalvandoNota] = useState(false);
    const [virando, setVirando] = useState(false);
    const convertido = lead.status === 'CONVERTIDO';
    useTravaRolagem();

    const carregarEventos = useCallback(async () => {
        try { setEventos(await listarEventos(lead.id)); } catch (e) { console.error(e); }
    }, [lead.id]);
    // Recarrega quando a linha volta do banco (updated_at muda): o histórico de
    // status é gravado pelo banco, então só existe depois da resposta.
    useEffect(() => { carregarEventos(); }, [carregarEventos, lead.updated_at]);

    const salvar = useCallback(async (dados) => {
        const antes = lead;
        onAlterado({ ...lead, ...dados });
        try { onAlterado(await salvarLead({ id: lead.id, ...dados })); }
        catch (e) {
            console.error(e); onAlterado(antes);
            toast.error(e.code === '42501' ? 'Sem permissão para alterar.' : 'Não salvou. Tente de novo.');
        }
    }, [lead, onAlterado]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (digitando(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'ArrowRight' || e.key === 'j') { e.preventDefault(); onProximo?.(); }
            else if (e.key === 'ArrowLeft' || e.key === 'k') { e.preventDefault(); onAnterior?.(); }
            else if (podeEditar && !convertido) {
                const st = STATUS_MANUAIS.find((s) => s.tecla === e.key);
                if (st && st.id !== lead.status) salvar({ status: st.id });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, onProximo, onAnterior, podeEditar, convertido, lead.status, salvar]);

    const adicionarNota = async () => {
        if (!nota.trim()) return;
        setSalvandoNota(true);
        try {
            await registrarEvento({ lead_id: lead.id, tipo: 'NOTA', texto: nota.trim() }, currentUser?.id);
            setNota(''); carregarEventos();
        } catch (e) { console.error(e); toast.error('Não salvou a nota.'); }
        finally { setSalvandoNota(false); }
    };

    const apagarEvento = async (ev) => {
        try { await excluirEvento(ev.id); setEventos((l) => l.filter((x) => x.id !== ev.id)); }
        catch (e) { console.error(e); toast.error('Não apagou.'); }
    };

    const st = statusProspeccao(lead.status);
    const atrasado = lead.proximo_contato_em && lead.proximo_contato_em < hojeMais(0);
    const extras = Object.entries(lead.extras || {});

    return (
        <div className="fixed inset-0 z-[11000] flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-in fade-in" onClick={onClose} />
            <aside className="relative bg-[#f5f5f7] w-full md:max-w-[560px] h-dvh flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
                {/* Cabeçalho */}
                <div className="bg-white border-b border-black/[.06] px-4 pt-3 pb-3 shrink-0">
                    <div className="flex items-center gap-1 mb-2">
                        <button onClick={onAnterior} disabled={!onAnterior} title="Anterior (←)" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
                        <span className="text-[11px] font-bold text-slate-400 tabular-nums">{posicao} de {total}</span>
                        <button onClick={onProximo} disabled={!onProximo} title="Próximo (→)" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button>
                        <span className="hidden md:inline text-[10px] font-semibold text-slate-300 ml-2">← → navegam · 1–5 trocam o status</span>
                        <button onClick={onClose} className="ml-auto p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
                    </div>
                    <CampoNome lead={lead} podeEditar={podeEditar} onSalvar={(nome) => nome.trim() && salvar({ nome: nome.trim() })} />
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[12px] font-semibold text-slate-500">
                        <Etiqueta className={st.etiqueta}>{st.label}</Etiqueta>
                        {[lead.categoria, [lead.cidade, lead.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                        <NotaGoogle lead={lead} />
                        <Estrelas valor={lead.prioridade} onChange={podeEditar ? (p) => salvar({ prioridade: p }) : undefined} tamanho={15} />
                    </div>
                    <div className="mt-3"><Contatos lead={lead} grande onContato={podeEditar ? onTentativa : undefined} /></div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Status — ou, depois de convertido, onde ele está no Vendas */}
                    {convertido ? (
                        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-3">
                            <Target size={20} className="text-emerald-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-emerald-800">Virou oportunidade</p>
                                <p className="text-[11.5px] font-semibold text-emerald-700/80 truncate">
                                    {noVendas ? <>{noVendas.titulo} · <b>{noVendas.etapa?.nome}</b></> : 'Acompanhe pelo Vendas'}
                                </p>
                            </div>
                            <button onClick={() => navigate(noVendas ? `/vendas?abrir=${noVendas.id}` : '/vendas')}
                                className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 shrink-0">
                                Abrir no Vendas <ArrowRight size={13} />
                            </button>
                        </section>
                    ) : (
                        <section>
                            <p className="text-[11.5px] font-medium text-slate-500 mb-1.5 ml-1">Status</p>
                            <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5">
                                {STATUS_MANUAIS.map((s) => {
                                    const on = s.id === lead.status;
                                    return (
                                        <button key={s.id} disabled={!podeEditar} onClick={() => !on && salvar({ status: s.id })}
                                            className={`h-9 px-2 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all disabled:cursor-default ${on ? 'text-white shadow-sm' : 'bg-white border-black/[.085] text-slate-600 hover:border-slate-300'}`}
                                            style={on ? { background: s.cor, borderColor: s.cor } : undefined}>
                                            <span className={`hidden md:inline text-[9px] tabular-nums ${on ? 'text-white/70' : 'text-slate-300'}`}>{s.tecla}</span>
                                            {!on && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.cor }} />}
                                            <span className="truncate">{s.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {podeVender && (
                                <button onClick={() => setVirando(true)}
                                    className={`mt-2 w-full h-11 rounded-xl text-[12px] font-bold flex items-center justify-center gap-2 transition-all ${lead.status === 'RESPONDEU' ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' : 'bg-white border border-black/[.085] text-slate-600 hover:border-emerald-400'}`}>
                                    <Target size={15} /> Virar oportunidade no Vendas
                                </button>
                            )}
                        </section>
                    )}

                    {/* Contato e retorno */}
                    <section className="bg-white border border-black/[.085] rounded-2xl p-3 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-slate-800">{lead.tentativas || 0} tentativa(s)</p>
                                <p className="text-[11px] font-semibold text-slate-400">
                                    {lead.ultimo_contato_em ? `Último contato ${tempoDesde(lead.ultimo_contato_em)} (${fmtDataHora(lead.ultimo_contato_em)})` : 'Nunca contatado'}
                                </p>
                            </div>
                            {podeEditar && (
                                <button onClick={() => onTentativa(null)} className="h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1.5">
                                    <PhoneOutgoing size={14} /> + Tentativa
                                </button>
                            )}
                        </div>
                        <div>
                            <p className="text-[11.5px] font-medium text-slate-500 mb-1 ml-1 flex items-center gap-1">
                                <CalendarClock size={12} /> Retornar em
                                {atrasado && <span className="text-rose-500 normal-case">· atrasado</span>}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <input type="date" value={lead.proximo_contato_em || ''} disabled={!podeEditar}
                                    onChange={(e) => salvar({ proximo_contato_em: e.target.value || null })}
                                    className={`${inputCls} !w-40 ${atrasado ? '!border-rose-300 !text-rose-600' : ''}`} />
                                {podeEditar && [[1, 'Amanhã'], [3, '3 dias'], [7, '1 semana'], [30, '1 mês']].map(([d, r]) => (
                                    <button key={d} onClick={() => salvar({ proximo_contato_em: hojeMais(d) })}
                                        className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600">{r}</button>
                                ))}
                                {podeEditar && lead.proximo_contato_em && (
                                    <button onClick={() => salvar({ proximo_contato_em: null })} className="h-8 px-2 text-[11px] font-bold text-slate-400 hover:text-rose-500">limpar</button>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Nota rápida + histórico */}
                    <section className="bg-white border border-black/[.085] rounded-2xl p-3">
                        {podeEditar && (
                            <div className="flex gap-2 mb-3">
                                <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} className={textareaCls}
                                    placeholder="O que rolou? (ex.: falei com a recepção, pediram para mandar por e-mail)"
                                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) adicionarNota(); }} />
                                <button onClick={adicionarNota} disabled={!nota.trim() || salvandoNota} title="Salvar nota (⌘ Enter)"
                                    className="w-10 shrink-0 rounded-lg bg-slate-900 text-white flex items-center justify-center disabled:opacity-40">
                                    {salvandoNota ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                                </button>
                            </div>
                        )}
                        <p className="text-[11.5px] font-medium text-slate-500 mb-1.5 ml-1">Histórico</p>
                        {eventos.length === 0 ? (
                            <p className="text-[11px] font-semibold text-slate-400 ml-1">Nada registrado ainda.</p>
                        ) : (
                            <ul className="space-y-2">
                                {eventos.map((ev) => (
                                    <li key={ev.id} className="group flex gap-2 text-[12px]">
                                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                                            style={{ background: ev.tipo === 'STATUS' ? statusProspeccao(ev.para).cor : ev.tipo === 'NOTA' ? '#0071e3' : ev.tipo === 'SISTEMA' ? '#10b981' : '#64748b' }} />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-700 whitespace-pre-wrap break-words">
                                                {ev.tipo === 'STATUS'
                                                    ? <>{statusProspeccao(ev.de).label} → <b>{statusProspeccao(ev.para).label}</b></>
                                                    : ev.tipo === 'NOTA' ? ev.texto : (ev.texto || ROTULO_EVENTO[ev.tipo])}
                                            </p>
                                            <p className="text-[10.5px] font-semibold text-slate-400">{fmtDataHora(ev.created_at)}{ev.autor?.name && ` · ${ev.autor.name}`}</p>
                                        </div>
                                        {['NOTA', 'CONTATO'].includes(ev.tipo) && (ev.autor_id === currentUser?.id || podeExcluir) && (
                                            <button onClick={() => apagarEvento(ev)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Dados */}
                    <section className="bg-white border border-black/[.085] rounded-2xl p-3">
                        <p className="text-[11.5px] font-medium text-slate-500 mb-2 ml-1">Dados</p>
                        <div className="grid grid-cols-2 gap-2.5">
                            <CampoTexto label="Telefone / WhatsApp" valor={lead.telefone} disabled={!podeEditar} onSalvar={(v) => salvar({ telefone: v })} />
                            <CampoTexto label="E-mail" valor={lead.email} disabled={!podeEditar} onSalvar={(v) => salvar({ email: v })} />
                            <CampoTexto label="Site" valor={lead.site} disabled={!podeEditar} onSalvar={(v) => salvar({ site: v })} />
                            <CampoTexto label="Instagram" valor={lead.instagram} disabled={!podeEditar} onSalvar={(v) => salvar({ instagram: v })} />
                            <CampoTexto label="Categoria" valor={lead.categoria} disabled={!podeEditar} onSalvar={(v) => salvar({ categoria: v })} />
                            <CampoTexto label="Origem" valor={lead.origem} disabled={!podeEditar} onSalvar={(v) => salvar({ origem: v })} />
                            <CampoTexto label="Endereço" valor={lead.endereco} disabled={!podeEditar} onSalvar={(v) => salvar({ endereco: v })} className="col-span-2" />
                            <CampoTexto label="Cidade" valor={lead.cidade} disabled={!podeEditar} onSalvar={(v) => salvar({ cidade: v })} />
                            <CampoTexto label="UF" valor={lead.uf} disabled={!podeEditar} onSalvar={(v) => salvar({ uf: v.toUpperCase().slice(0, 2) })} />
                            <CampoTexto label="Link do Google Maps" valor={lead.maps_url} disabled={!podeEditar} onSalvar={(v) => salvar({ maps_url: v })} className="col-span-2" />
                            <Campo label="Responsável" className="col-span-2">
                                <select value={lead.responsavel_id || ''} disabled={!podeEditar} className={inputCls}
                                    onChange={(e) => salvar({ responsavel_id: e.target.value || null })}>
                                    <option value="">— ninguém —</option>
                                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </Campo>
                            <ObsLead lead={lead} disabled={!podeEditar} onSalvar={(v) => salvar({ notas: v })} />
                        </div>
                    </section>

                    {extras.length > 0 && (
                        <section className="bg-white border border-black/[.085] rounded-2xl p-3">
                            <p className="text-[11.5px] font-medium text-slate-500 mb-2 ml-1">Outros dados da planilha</p>
                            <dl className="space-y-1.5">
                                {extras.map(([k, v]) => (
                                    <div key={k} className="grid grid-cols-[120px_1fr] gap-2 text-[11.5px]">
                                        <dt className="font-bold text-slate-400 truncate" title={k}>{k}</dt>
                                        <dd className="font-semibold text-slate-700 break-words">
                                            {/^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer" className="text-[#0071e3] hover:underline">{v}</a> : v}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )}
                </div>

                {/* Rodapé */}
                <div className="bg-white border-t border-black/[.06] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-2 shrink-0">
                    {lead.party_id && (
                        <button onClick={() => navigate(`/clientes/${lead.party_id}`)} className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center gap-1.5">
                            <Building2 size={14} /> Ficha da empresa
                        </button>
                    )}
                    {lead.telefone && (
                        <button onClick={() => { navigator.clipboard?.writeText(lead.telefone); toast.success('Telefone copiado.'); }}
                            className="h-9 px-3 rounded-lg text-slate-500 hover:bg-slate-100 text-[11px] font-bold flex items-center gap-1.5">
                            <Copy size={14} /> Copiar fone
                        </button>
                    )}
                    {podeExcluir && (
                        <button onClick={() => onExcluir(lead)} className="ml-auto h-9 px-3 rounded-lg text-rose-500 hover:bg-rose-50 text-[11px] font-bold flex items-center gap-1.5">
                            <Trash2 size={14} /> Excluir
                        </button>
                    )}
                </div>
            </aside>

            {virando && (
                <VirarOportunidade lead={lead} onClose={() => setVirando(false)}
                    onFeito={(row) => { setVirando(false); onAlterado(row); }} />
            )}
        </div>
    );
}

const CampoNome = ({ lead, podeEditar, onSalvar }) => {
    const [v, setV] = useRascunho(lead.nome);
    return (
        <input value={v} disabled={!podeEditar} onChange={(e) => setV(e.target.value)}
            onBlur={() => v !== lead.nome && onSalvar(v)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-full text-lg font-bold text-slate-900 bg-transparent outline-none rounded-md px-1 -mx-1 focus:bg-slate-50 disabled:text-slate-900" />
    );
};

const ObsLead = ({ lead, disabled, onSalvar }) => {
    const [v, setV] = useRascunho(lead.notas || '');
    return (
        <Campo label={<span className="inline-flex items-center gap-1"><StickyNote size={11} /> Observações fixas</span>} className="col-span-2">
            <textarea rows={3} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}
                onBlur={() => v !== (lead.notas || '') && onSalvar(v)} className={textareaCls}
                placeholder="Quem decide, horário bom para ligar, o que já usam…" />
        </Campo>
    );
};
