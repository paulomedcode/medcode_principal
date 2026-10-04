import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Target, Plus, Search, Settings2, Trophy, XCircle, Edit2, Trash2, RotateCcw, FileText, FileDown, CalendarClock, X, Building2, FolderKanban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    listarEtapas, listarOportunidades, listarEmpresas, moverOportunidade, excluirOportunidade, reabrirOportunidade,
    salvarEtapa, excluirEtapa, listarProjetos,
} from '../../services/crm';
import { financeService } from '../../services/financeService';
import { SERVICOS, resumoServicos, temServico, fmtBRL, fmtData } from '../../config/servicos';
import { usePermission } from '../../contexts/PermissionContext';
import { OportunidadeModal, GanharModal, PerderModal } from '../../components/crm/OportunidadeModal';
import Atividades from '../../components/crm/Atividades';
import { QuoteModal } from '../finance/Quotes';
import PdfsProposta from '../../components/propostas/PdfsProposta';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { PAGINA, CARD, FiltrosCelular, Etiqueta, Carregando, Janela, inputCls, btnPrimario, btnSecundario } from '../../components/crm/ui';
import { useUsuarios } from '../../components/crm/dados';

const hoje = () => { const d = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const iniciais = (nome) => String(nome || '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export default function Funil() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Editar Vendas');
    const podeConfigurar = hasPermission('Configurar Funil');
    const usuarios = useUsuarios();

    const [etapas, setEtapas] = useState([]);
    const [ops, setOps] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [busca, setBusca] = useState('');
    const [fServico, setFServico] = useState('');
    const [fResp, setFResp] = useState('');
    const [arrastando, setArrastando] = useState(null);
    const [sobre, setSobre] = useState(null);
    const [etapaCel, setEtapaCel] = useState(null);     // celular: etapa mostrada

    const [editar, setEditar] = useState(undefined);   // undefined fechado, null nova, obj edição
    const [aberta, setAberta] = useState(null);         // painel lateral
    const [ganhar, setGanhar] = useState(null);
    const [perder, setPerder] = useState(null);
    const [configurar, setConfigurar] = useState(false);
    const [excluir, setExcluir] = useState(null);

    const carregar = useCallback(async () => {
        try {
            const [e, o, emp] = await Promise.all([listarEtapas(), listarOportunidades(), listarEmpresas()]);
            setEtapas(e); setOps(o); setEmpresas(emp);
            return o;
        } catch (err) {
            console.error(err);
            toast.error('Erro ao carregar o funil.');
            return [];
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    // ?abrir=<id> vindo da tela do cliente
    const abrirParam = searchParams.get('abrir');
    useEffect(() => {
        if (!abrirParam || ops.length === 0) return;
        const op = ops.find((o) => o.id === abrirParam);
        if (op) setAberta(op);
        setSearchParams({}, { replace: true });
    }, [abrirParam, ops, setSearchParams]);

    // ?nova=<party_id> vindo da Prospecção: nova oportunidade já com a empresa.
    const novaParam = searchParams.get('nova');
    const [novaParaEmpresa, setNovaParaEmpresa] = useState(null);
    useEffect(() => {
        if (!novaParam || carregando) return;
        setNovaParaEmpresa(novaParam);
        setEditar(null);
        setSearchParams({}, { replace: true });
    }, [novaParam, carregando, setSearchParams]);

    const etapaGanho = etapas.find((e) => e.tipo === 'GANHO');
    const etapaPerdido = etapas.find((e) => e.tipo === 'PERDIDO');
    const primeiraAberta = etapas.find((e) => e.tipo === 'ABERTA');

    const filtradas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return ops.filter((o) => {
            if (fServico && !temServico(o, fServico)) return false;
            if (fResp && o.responsavel_id !== fResp) return false;
            if (q && !`${o.titulo} ${o.empresa?.name || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [ops, busca, fServico, fResp]);

    // Colunas de ganho/perda só mostram o que fechou nos últimos 30 dias:
    // o quadro é para o que está em jogo, não para o arquivo.
    const recente = diasAtras(30);
    const porEtapa = useMemo(() => {
        const m = {};
        etapas.forEach((e) => { m[e.id] = []; });
        filtradas.forEach((o) => {
            const et = etapas.find((e) => e.id === o.etapa_id);
            if (!et) return;
            if (et.tipo === 'GANHO' && (o.ganho_em || o.updated_at) < recente) return;
            if (et.tipo === 'PERDIDO' && (o.perdido_em || o.updated_at) < recente) return;
            m[et.id].push(o);
        });
        Object.values(m).forEach((l) => l.sort((a, b) => (a.posicao - b.posicao) || (a.created_at < b.created_at ? 1 : -1)));
        return m;
    }, [filtradas, etapas, recente]);

    const soltar = async (etapa, op = arrastando) => {
        setArrastando(null); setSobre(null);
        if (!op || !podeEditar || op.etapa_id === etapa.id) return;
        if (etapa.tipo === 'GANHO') { if (op.ganho_em) return toast.error('Essa oportunidade já foi ganha.'); return setGanhar(op); }
        if (etapa.tipo === 'PERDIDO') return setPerder(op);
        if (op.ganho_em) return toast.error('Oportunidade ganha não volta para o funil — o projeto já existe.');
        const destino = porEtapa[etapa.id] || [];
        const posicao = destino.length ? Math.max(...destino.map((o) => Number(o.posicao) || 0)) + 1 : 0;
        setOps((l) => l.map((o) => (o.id === op.id ? { ...o, etapa_id: etapa.id, posicao, perdido_em: null } : o)));
        setAberta((x) => (x?.id === op.id ? { ...x, etapa_id: etapa.id, posicao, perdido_em: null } : x));
        try {
            if (op.perdido_em) await reabrirOportunidade(op, etapa.id);
            await moverOportunidade(op.id, etapa.id, posicao);
        } catch (e) {
            console.error(e);
            toast.error('Não foi possível mover.');
            carregar();
        }
    };

    // Cartão da oportunidade — o mesmo no quadro (computador) e na lista por etapa (celular).
    const renderCartao = (o, etapa) => {
        const fechada = etapa.tipo !== 'ABERTA';
        const s = resumoServicos(o);
        const atrasada = !fechada && o.previsao_fechamento && o.previsao_fechamento < hoje();
        return (
            <div key={o.id}
                draggable={podeEditar}
                onDragStart={(e) => { setArrastando(o); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setArrastando(null); setSobre(null); }}
                onClick={() => setAberta(o)}
                className={`bg-white rounded-xl border border-black/[.06] shadow-sm p-2.5 cursor-pointer hover:shadow-md hover:border-[#0071e3]/30 transition-all ${arrastando?.id === o.id ? 'opacity-40' : ''}`}>
                <div className="flex items-start gap-1.5">
                    <span className="text-sm leading-none mt-0.5">{s.emoji}</span>
                    <p className="text-[12px] font-bold text-slate-800 leading-snug flex-1 line-clamp-2">{o.titulo}</p>
                </div>
                <p className="text-[10.5px] font-semibold text-slate-500 mt-1 truncate flex items-center gap-1"><Building2 size={10} />{o.empresa?.name}</p>
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-[12px] font-bold text-slate-800 tabular-nums">{fmtBRL(o.valor)}</span>
                    {Number(o.valor_recorrente) > 0 && <span className="text-[10px] font-bold text-violet-600">+{fmtBRL(o.valor_recorrente)}/mês</span>}
                    <span className="ml-auto flex items-center gap-1">
                        {o.previsao_fechamento && !fechada && (
                            <span className={`text-[9.5px] font-bold ${atrasada ? 'text-rose-600' : 'text-slate-400'}`} title="Previsão de fechamento">{fmtData(o.previsao_fechamento).slice(0, 5)}</span>
                        )}
                        {o.responsavel?.name && (
                            <span title={o.responsavel.name} className="w-5 h-5 rounded-full bg-slate-100 text-[8.5px] font-bold text-slate-500 flex items-center justify-center">{iniciais(o.responsavel.name)}</span>
                        )}
                    </span>
                </div>
                {etapa.tipo === 'PERDIDO' && o.motivo_perda && <p className="text-[10px] font-semibold text-rose-500 mt-1 truncate">{o.motivo_perda}</p>}
            </div>
        );
    };

    const aposMudar = async (manterAberta = true) => {
        const lista = await carregar();
        if (manterAberta && aberta) setAberta(lista.find((o) => o.id === aberta.id) || null);
    };

    return (
        <div className={PAGINA}>
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                    <Target size={17} className="text-slate-400" /> Funil de vendas
                </h1>
                <div className="relative flex-1 md:flex-none min-w-[140px]">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…"
                        className="h-9 md:h-8 pl-8 pr-3 w-full md:w-44 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none focus:border-[#0071e3]" />
                </div>
                <FiltrosCelular ativos={(fServico ? 1 : 0) + (fResp ? 1 : 0)}>
                    <select value={fServico} onChange={(e) => setFServico(e.target.value)} className="h-8 px-2 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none cursor-pointer">
                        <option value="">Todos os serviços</option>
                        {SERVICOS.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                    </select>
                    <select value={fResp} onChange={(e) => setFResp(e.target.value)} className="h-8 px-2 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none cursor-pointer">
                        <option value="">Todos os responsáveis</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </FiltrosCelular>
                <div className="md:ml-auto flex items-center gap-2">
                    <button onClick={() => navigate('/vendas/propostas')} title="Propostas" className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-[12.5px] font-medium text-slate-600 hover:text-[#0071e3] flex items-center gap-1.5"><FileText size={13} /> <span className="hidden md:inline">Propostas</span></button>
                    {podeConfigurar && <button onClick={() => setConfigurar(true)} title="Etapas do funil" className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-slate-500 hover:text-[#0071e3]"><Settings2 size={15} /></button>}
                    {podeEditar && <button onClick={() => setEditar(null)} className={`${btnPrimario} hidden md:flex`}><Plus size={15} /> Nova oportunidade</button>}
                </div>
            </div>

            {carregando ? <Carregando /> : (<>
                {/* Celular: uma etapa por vez, escolhida nas abas. Mudar de etapa
                    é pelo "Mover para…" da oportunidade (arrastar não serve no dedo). */}
                {(() => {
                    const atual = etapas.find((e) => e.id === etapaCel) || primeiraAberta || etapas[0];
                    if (!atual) return null;
                    const lista = porEtapa[atual.id] || [];
                    const total = lista.reduce((acc, o) => acc + Number(o.valor || 0), 0);
                    return (
                        <div className="md:hidden">
                            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
                                {etapas.map((e) => {
                                    const on = e.id === atual.id;
                                    return (
                                        <button key={e.id} onClick={() => setEtapaCel(e.id)}
                                            className={`shrink-0 h-9 pl-2.5 pr-3 rounded-full text-[12px] font-bold flex items-center gap-1.5 border ${on ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-black/[.085] text-slate-600'}`}>
                                            <span className="w-2 h-2 rounded-full" style={{ background: e.cor }} />
                                            {e.nome}
                                            <span className={`text-[11px] ${on ? 'text-white/70' : 'text-slate-400'}`}>{(porEtapa[e.id] || []).length}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11.5px] font-semibold text-slate-500 tabular-nums mb-2">
                                {fmtBRL(total)}{atual.tipo === 'ABERTA' ? ` · ${atual.probabilidade}% de chance` : ' · últimos 30 dias'}
                            </p>
                            <div className="space-y-2">
                                {lista.length === 0 && <p className="py-8 text-center text-[12px] font-semibold text-slate-400">Nada nesta etapa.</p>}
                                {lista.map((o) => renderCartao(o, atual))}
                            </div>
                        </div>
                    );
                })()}
                <div className="hidden md:flex gap-3 overflow-x-auto pb-4 items-start">
                    {etapas.map((etapa) => {
                        const lista = porEtapa[etapa.id] || [];
                        const total = lista.reduce((s, o) => s + Number(o.valor || 0), 0);
                        const fechada = etapa.tipo !== 'ABERTA';
                        return (
                            <div key={etapa.id}
                                onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSobre(etapa.id); } }}
                                onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
                                onDrop={(e) => { e.preventDefault(); soltar(etapa); }}
                                className={`shrink-0 ${fechada ? 'w-60' : 'w-72'} rounded-2xl p-2 transition-colors ${sobre === etapa.id ? 'bg-[#0071e3]/10 ring-2 ring-[#0071e3]/30' : 'bg-slate-200/40'}`}>
                                <div className="px-1.5 pt-1 pb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full" style={{ background: etapa.cor }} />
                                        <span className="text-[12.5px] font-semibold text-slate-800 truncate">{etapa.nome}</span>
                                        <span className="text-[10px] font-bold text-slate-400 ml-auto">{lista.length}</span>
                                    </div>
                                    <p className="text-[10.5px] font-semibold text-slate-500 tabular-nums mt-0.5">
                                        {fmtBRL(total)}{!fechada && <span className="text-slate-400"> · {etapa.probabilidade}%</span>}
                                        {fechada && <span className="text-slate-400"> · 30 dias</span>}
                                    </p>
                                </div>
                                <div className="space-y-2 min-h-[40px]">
                                    {lista.map((o) => renderCartao(o, etapa))}
                                    {etapa.id === primeiraAberta?.id && podeEditar && (
                                        <button onClick={() => setEditar(null)} className="w-full py-2 text-[10.5px] font-bold text-slate-400 hover:text-[#0071e3] hover:bg-white/60 rounded-xl flex items-center justify-center gap-1"><Plus size={12} /> Adicionar</button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>)}

            {aberta && (
                <PainelOportunidade
                    op={aberta} etapas={etapas} podeEditar={podeEditar}
                    onMover={(etapa) => soltar(etapa, aberta)}
                    onClose={() => setAberta(null)}
                    onEditar={() => setEditar(aberta)}
                    onGanhar={() => setGanhar(aberta)}
                    onPerder={() => setPerder(aberta)}
                    onReabrir={async () => {
                        try { await reabrirOportunidade(aberta, primeiraAberta.id); toast.success('Oportunidade de volta ao funil.'); aposMudar(); }
                        catch (e) { console.error(e); toast.error('Não foi possível reabrir.'); }
                    }}
                    onExcluir={() => setExcluir(aberta)}
                />
            )}

            {editar !== undefined && (
                <OportunidadeModal oportunidade={editar} etapas={etapas} empresas={empresas}
                    partyIdFixo={editar === null ? novaParaEmpresa || undefined : undefined}
                    onClose={() => { setEditar(undefined); setNovaParaEmpresa(null); }}
                    onEmpresaCriada={(row) => setEmpresas((l) => [...l, row].sort((a, b) => a.name.localeCompare(b.name)))}
                    onSaved={() => { setEditar(undefined); setNovaParaEmpresa(null); aposMudar(); }} />
            )}
            {ganhar && (
                <GanharModal oportunidade={ganhar} onClose={() => setGanhar(null)}
                    onGanha={(projeto) => { setGanhar(null); setAberta(null); carregar(); navigate(`/projetos/${projeto.id}`); }} />
            )}
            {perder && etapaPerdido && (
                <PerderModal oportunidade={perder} etapaPerdidoId={etapaPerdido.id} onClose={() => setPerder(null)}
                    onPerdida={() => { setPerder(null); aposMudar(); }} />
            )}
            {configurar && <ConfigurarEtapas etapas={etapas} ops={ops} onClose={() => setConfigurar(false)} onMudou={carregar} />}
            <ConfirmDialog open={!!excluir} title="Excluir oportunidade"
                message={`Excluir "${excluir?.titulo}"? O histórico dela sai junto. Propostas ficam, sem o vínculo.`}
                confirmLabel="Excluir"
                onConfirm={async () => {
                    try { await excluirOportunidade(excluir); toast.success('Oportunidade excluída.'); setAberta(null); carregar(); }
                    catch (e) { console.error(e); toast.error('Não foi possível excluir.'); }
                    finally { setExcluir(null); }
                }}
                onCancel={() => setExcluir(null)} />
            {etapaGanho == null && !carregando && etapas.length > 0 && (
                <p className="text-[11px] font-semibold text-amber-600">O funil não tem etapa de GANHO — configure as etapas.</p>
            )}
        </div>
    );
}

/** Painel lateral com a oportunidade: dados, propostas, ações e histórico. */
function PainelOportunidade({ op, etapas, podeEditar, onMover, onClose, onEditar, onGanhar, onPerder, onReabrir, onExcluir }) {
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const [propostas, setPropostas] = useState([]);
    const [servicos, setServicos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [novaProposta, setNovaProposta] = useState(false);
    const [pdfsDe, setPdfsDe] = useState(null); // { quote, gerar }
    const [projeto, setProjeto] = useState(null);
    const etapa = etapas.find((e) => e.id === op.etapa_id);
    const s = resumoServicos(op);
    const verPropostas = hasPermission('Acessar Vendas') || hasPermission('Acessar Financeiro');

    const carregarPropostas = useCallback(() => {
        if (!verPropostas) return;
        financeService.getQuotes({ oportunidadeId: op.id }).then(setPropostas).catch(() => setPropostas([]));
    }, [op.id, verPropostas]);

    useEffect(() => { carregarPropostas(); }, [carregarPropostas]);
    useEffect(() => {
        if (!op.ganho_em) return;
        listarProjetos({ partyId: op.party_id }).then((l) => setProjeto(l.find((p) => p.oportunidade_id === op.id) || null)).catch(() => {});
    }, [op.id, op.ganho_em, op.party_id]);

    const abrirNovaProposta = async () => {
        try {
            const [sv, pt] = await Promise.all([financeService.getServices(), financeService.getParties()]);
            setServicos((sv || []).filter((x) => x.is_active !== false));
            setEmpresas((pt || []).filter((p) => p.kind !== 'FORNECEDOR'));
            setNovaProposta(true);
        } catch (e) { console.error(e); toast.error('Não foi possível abrir a proposta.'); }
    };

    const STATUS_PROPOSTA = { PENDENTE: 'bg-amber-50 text-amber-700 border-amber-100', APROVADO: 'bg-emerald-50 text-emerald-700 border-emerald-100', RECUSADO: 'bg-rose-50 text-rose-700 border-rose-100' };

    return (
        <div className="fixed inset-0 z-[10500] flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
            <div className="relative w-full max-w-lg h-full bg-[#f5f5f7] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
                <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-black/[.06] p-4 flex items-start gap-3">
                    <span className="text-2xl">{s.emoji}</span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[15px] font-bold text-slate-800 leading-snug">{op.titulo}</h2>
                        <button onClick={() => navigate(`/clientes/${op.party_id}`)} className="text-[11.5px] font-semibold text-[#0071e3] hover:underline">{op.empresa?.name}</button>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 rounded-lg"><X size={16} /></button>
                </div>

                <div className="p-4 space-y-4">
                    <div className={`${CARD} p-4 grid grid-cols-2 gap-3 text-[11px]`}>
                        <div><p className="font-normal text-slate-400 text-[11px]">Etapa</p>
                            {etapa && <Etiqueta className="bg-white border-slate-200 text-slate-600 mt-0.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: etapa.cor }} />{etapa.nome}</Etiqueta>}</div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Serviços</p><p className="font-semibold text-slate-700">{s.label}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Valor</p><p className="font-bold text-slate-800 text-sm tabular-nums">{fmtBRL(op.valor)}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Mensalidade</p><p className="font-bold text-violet-700 text-sm tabular-nums">{Number(op.valor_recorrente) > 0 ? fmtBRL(op.valor_recorrente) : '—'}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Previsão</p><p className="font-semibold text-slate-700">{fmtData(op.previsao_fechamento)}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Responsável</p><p className="font-semibold text-slate-700">{op.responsavel?.name || '—'}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Contato</p><p className="font-semibold text-slate-700">{op.contato?.nome || '—'}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Origem</p><p className="font-semibold text-slate-700">{op.origem || '—'}</p></div>
                        {op.motivo_perda && <div className="col-span-2"><p className="font-normal text-rose-400 text-[11px]">Motivo da perda</p><p className="font-semibold text-rose-700">{op.motivo_perda}</p></div>}
                        {op.notas && <p className="col-span-2 text-[11.5px] text-slate-600 whitespace-pre-wrap border-t border-black/[.05] pt-2">{op.notas}</p>}
                    </div>

                    {podeEditar && (
                        <div className="flex flex-wrap gap-2">
                            {!op.ganho_em && !op.perdido_em && <>
                                <button onClick={onGanhar} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-[12.5px] flex items-center gap-1.5"><Trophy size={14} /> Ganhar</button>
                                <button onClick={onPerder} className="h-9 px-4 bg-white border border-black/[.085] text-rose-600 rounded-lg font-medium text-[12.5px] flex items-center gap-1.5 hover:bg-rose-50"><XCircle size={14} /> Perder</button>
                            </>}
                            {op.perdido_em && <button onClick={onReabrir} className="h-9 px-4 bg-white border border-black/[.085] text-slate-600 rounded-lg font-medium text-[12.5px] flex items-center gap-1.5"><RotateCcw size={14} /> Reabrir</button>}
                            <button onClick={onEditar} className="h-9 px-3 bg-white border border-black/[.085] text-slate-600 rounded-lg font-medium text-[12.5px] flex items-center gap-1.5 hover:text-[#0071e3]"><Edit2 size={13} /> Editar</button>
                            {!op.ganho_em && <button onClick={onExcluir} className="h-9 px-3 bg-white border border-black/[.085] text-slate-400 rounded-lg hover:text-rose-600 ml-auto"><Trash2 size={14} /></button>}
                        </div>
                    )}

                    {/* Celular: mudar de etapa sem arrastar */}
                    {podeEditar && !op.ganho_em && (
                        <label className="md:hidden flex items-center gap-2">
                            <span className="text-[12px] font-medium text-slate-500 shrink-0">Mover para</span>
                            <select value={op.etapa_id} onChange={(e) => { const et = etapas.find((x) => x.id === e.target.value); if (et) onMover(et); }}
                                className={`${inputCls} h-11 text-sm cursor-pointer`}>
                                {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.tipo === 'GANHO' ? ' (ganhar)' : e.tipo === 'PERDIDO' ? ' (perder)' : ''}</option>)}
                            </select>
                        </label>
                    )}

                    {op.ganho_em && projeto?.oportunidade_id === op.id && (
                        <button onClick={() => navigate(`/projetos/${projeto.id}`)} className={`${CARD} w-full p-3 flex items-center gap-2 text-left hover:border-[#0071e3]/40`}>
                            <FolderKanban size={16} className="text-amber-500" />
                            <span className="text-[12px] font-bold text-slate-700 flex-1">Projeto: {projeto.nome}</span>
                            <span className="text-[12px] font-medium text-slate-500 hover:text-slate-900">Abrir</span>
                        </button>
                    )}

                    {verPropostas && (
                        <div className={`${CARD} p-4`}>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight flex items-center gap-1.5"><FileText size={13} /> Propostas</h3>
                                {podeEditar && <button onClick={abrirNovaProposta} className="text-[12px] font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1"><Plus size={12} /> Nova proposta</button>}
                            </div>
                            {propostas.length === 0 ? <p className="text-[11px] font-semibold text-slate-400">Nenhuma proposta ainda.</p> : (
                                <ul className="divide-y divide-black/[.05]">
                                    {propostas.map((q) => (
                                        <li key={q.id} className="py-2 flex items-center gap-2 text-[11.5px]">
                                            <span className="font-semibold text-slate-700 flex-1 truncate">{q.title || 'Proposta'}{q.numero && <span className="text-slate-400 font-semibold"> · {q.numero}</span>}</span>
                                            <span className="text-slate-400 font-semibold">{fmtData(q.valid_until)}</span>
                                            <span className="font-bold text-slate-800 tabular-nums">{fmtBRL(q.total_amount)}</span>
                                            <Etiqueta className={STATUS_PROPOSTA[q.status] || STATUS_PROPOSTA.PENDENTE}>{q.status}</Etiqueta>
                                            <button onClick={() => setPdfsDe({ quote: q })} title="Proposta em PDF" className="p-1 text-violet-500 hover:text-violet-700 hover:bg-violet-50 rounded-md"><FileDown size={14} /></button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <Atividades vinculo={{ party_id: op.party_id, oportunidade_id: op.id }} filtro={{ oportunidadeId: op.id }} titulo="Histórico da negociação" />
                </div>
            </div>

            {novaProposta && (
                <QuoteModal quote={null} services={servicos} parties={empresas} oportunidade={op}
                    onClose={() => setNovaProposta(false)}
                    onSaved={async (salvo) => {
                        setNovaProposta(false);
                        carregarPropostas();
                        if (salvo?.gerarPdf) setPdfsDe({ quote: await financeService.getQuoteDetails(salvo.id), gerar: true });
                    }} />
            )}
            {pdfsDe && <PdfsProposta quote={pdfsDe.quote} podeGerar={podeEditar} gerarAoAbrir={!!pdfsDe.gerar} onClose={() => setPdfsDe(null)} />}
        </div>
    );
}

/** Etapas do funil: nome, chance, cor e ordem. GANHO e PERDIDO são fixas no tipo. */
function ConfigurarEtapas({ etapas, ops, onClose, onMudou }) {
    const [lista, setLista] = useState(etapas.map((e) => ({ ...e })));
    const [salvando, setSalvando] = useState(false);
    const set = (i, patch) => setLista((l) => l.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
    const mover = (i, d) => setLista((l) => {
        const j = i + d; if (j < 0 || j >= l.length) return l;
        const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c;
    });

    const salvar = async () => {
        setSalvando(true);
        try {
            for (let i = 0; i < lista.length; i++) {
                const e = lista[i];
                if (!e.nome.trim()) continue;
                await salvarEtapa({ ...e, nome: e.nome.trim(), ordem: i + 1, probabilidade: Math.max(0, Math.min(100, Number(e.probabilidade) || 0)) });
            }
            toast.success('Etapas salvas.');
            await onMudou();
            onClose();
        } catch (err) { console.error(err); toast.error('Não foi possível salvar as etapas.'); }
        finally { setSalvando(false); }
    };

    const remover = async (i) => {
        const e = lista[i];
        if (e.tipo !== 'ABERTA') return toast.error('As etapas de ganho e perda não podem ser removidas.');
        if (e.id && ops.some((o) => o.etapa_id === e.id)) return toast.error('Mova as oportunidades desta etapa antes de removê-la.');
        if (e.id) { try { await excluirEtapa(e.id); } catch (err) { console.error(err); return toast.error('Não foi possível remover.'); } }
        setLista((l) => l.filter((_, idx) => idx !== i));
    };

    return (
        <Janela titulo="Etapas do funil" icone={Settings2} onClose={onClose} largura="max-w-lg"
            rodape={<>
                <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} className={btnPrimario}>Salvar</button>
            </>}>
            <div className="space-y-2">
                {lista.map((e, i) => (
                    <div key={e.id || i} className="flex items-center gap-2 bg-white border border-black/[.06] rounded-xl p-2">
                        <div className="flex flex-col">
                            <button onClick={() => mover(i, -1)} className="text-slate-300 hover:text-slate-600 text-[10px] leading-none">▲</button>
                            <button onClick={() => mover(i, 1)} className="text-slate-300 hover:text-slate-600 text-[10px] leading-none">▼</button>
                        </div>
                        <input type="color" value={e.cor} onChange={(ev) => set(i, { cor: ev.target.value })} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
                        <input value={e.nome} onChange={(ev) => set(i, { nome: ev.target.value })} className={`${inputCls} flex-1`} />
                        <div className="flex items-center gap-1 w-20">
                            <input type="number" min={0} max={100} value={e.probabilidade} disabled={e.tipo !== 'ABERTA'}
                                onChange={(ev) => set(i, { probabilidade: ev.target.value })} className={`${inputCls} text-right px-2`} />
                            <span className="text-[10px] font-bold text-slate-400">%</span>
                        </div>
                        {e.tipo !== 'ABERTA'
                            ? <Etiqueta className={e.tipo === 'GANHO' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}>{e.tipo === 'GANHO' ? 'Ganho' : 'Perda'}</Etiqueta>
                            : <button onClick={() => remover(i)} className="p-1.5 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>}
                    </div>
                ))}
            </div>
            <button onClick={() => {
                const idx = lista.findIndex((e) => e.tipo !== 'ABERTA');
                const nova = { nome: 'Nova etapa', probabilidade: 50, tipo: 'ABERTA', cor: '#6366f1' };
                setLista((l) => (idx < 0 ? [...l, nova] : [...l.slice(0, idx), nova, ...l.slice(idx)]));
            }} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1"><Plus size={12} /> Adicionar etapa</button>
            <p className="text-[10.5px] font-semibold text-slate-400 flex items-center gap-1"><CalendarClock size={12} /> A chance (%) alimenta a previsão ponderada do funil.</p>
        </Janela>
    );
}
