import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    Search, Plus, Building2, Target, FolderKanban, ClipboardList, DollarSign, CalendarClock, Check,
    AlertTriangle, ChevronRight, Loader2, Repeat, Sparkles, Flag,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../contexts/PermissionContext';
import { supabase } from '../services/supabase';
import { tarefasAtribuidas } from '../services/notificacoes';
import { concluirLembrete } from '../services/concluirLembrete';
import {
    proximosPassos, concluirProximoPasso, listarProjetos, listarEtapas, listarOportunidades, listarEmpresas,
    progressoDasEntregas, atividadesRecentes,
} from '../services/crm';
import { resumoServicos, statusProjeto, tipoAtividade, fmtBRL, fmtData } from '../config/servicos';
import { todayISO } from '../utils/date';
import EmpresaModal from '../components/crm/EmpresaModal';
import ProjetoModal from '../components/crm/ProjetoModal';
import { OportunidadeModal } from '../components/crm/OportunidadeModal';

/*
 * TELA INICIAL — "Central do dia".
 *
 * Numa agência a pessoa abre o sistema para saber o que fazer agora, não para
 * escolher um menu (a navegação entre módulos mora na barra superior). Então
 * a tela é o trabalho: o que está atrasado, o que vence hoje e na semana
 * (tarefas das entregas, retornos combinados com clientes, recebimentos,
 * prazos de projeto), os projetos em andamento com o progresso das entregas,
 * o funil e o que a equipe registrou por último. Cada bloco respeita as
 * permissões: quem não abre o módulo não vê o bloco.
 */

const addDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d + n); const p = (x) => String(x).padStart(2, '0'); return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`; };
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const dataExtenso = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const tempoAtras = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return `há ${Math.max(1, min)} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ontem' : `há ${d} dias`;
};

const VIDRO = 'bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_8px_30px_rgba(15,23,42,0.06)] rounded-3xl';

const TIPO_ITEM = {
    tarefa: { icone: ClipboardList, cor: 'bg-fuchsia-50 text-fuchsia-600', rotulo: 'Entrega' },
    retorno: { icone: CalendarClock, cor: 'bg-amber-50 text-amber-600', rotulo: 'Retorno' },
    receber: { icone: DollarSign, cor: 'bg-emerald-50 text-emerald-600', rotulo: 'Receber' },
    prazo: { icone: Flag, cor: 'bg-rose-50 text-rose-600', rotulo: 'Prazo' },
};

const Chip = ({ rotulo, valor, detalhe, tom = 'text-slate-900', alerta, onClick }) => (
    <button onClick={onClick} className={`${VIDRO} !rounded-2xl px-4 py-3 text-left flex-1 min-w-[160px] hover:bg-white/90 transition-colors`}>
        <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest">{rotulo}</p>
        <p className={`text-xl font-bold tabular-nums tracking-tight ${tom}`}>{valor}</p>
        {detalhe && <p className={`text-[10.5px] font-semibold ${alerta ? 'text-rose-500' : 'text-slate-400'}`}>{detalhe}</p>}
    </button>
);

const Titulo = ({ icone: Icone, children, acao }) => (
    <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">{Icone && <Icone size={13} />}{children}</h2>
        {acao}
    </div>
);

export default function HomeHub() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const pode = {
        clientes: hasPermission('Acessar Clientes'),
        vendas: hasPermission('Acessar Vendas'),
        editarVendas: hasPermission('Editar Vendas'),
        projetos: hasPermission('Acessar Projetos'),
        editarProjetos: hasPermission('Editar Projetos'),
        financeiro: hasPermission('Acessar Financeiro'),
        compromissos: hasPermission('Acessar Compromissos'),
        editarClientes: hasPermission('Editar Clientes') || hasPermission('Editar Vendas') || hasPermission('Editar Financeiro'),
    };
    const veCrm = pode.clientes || pode.vendas || pode.projetos;

    const [d, setD] = useState(null);
    const [aba, setAba] = useState('hoje');
    const [concluindo, setConcluindo] = useState(null);
    const [novoAberto, setNovoAberto] = useState(false);
    const [criar, setCriar] = useState(null); // 'lead' | 'oportunidade' | 'projeto'
    const novoRef = useRef(null);

    const carregar = useCallback(async () => {
        const hoje = todayISO();
        const vazio = Promise.resolve([]);
        const seguro = (p) => p.catch((e) => { console.warn(e); return []; });
        const [tarefas, passos, projetos, etapas, ops, receber, recorr, feed] = await Promise.all([
            pode.compromissos && currentUser?.id ? seguro(tarefasAtribuidas(currentUser.id)) : vazio,
            veCrm && currentUser?.id ? seguro(proximosPassos({ autorId: currentUser.id })) : vazio,
            veCrm ? seguro(listarProjetos()) : vazio,
            pode.vendas ? seguro(listarEtapas()) : vazio,
            pode.vendas ? seguro(listarOportunidades()) : vazio,
            pode.financeiro ? seguro(supabase.from('finance_transactions')
                .select('id, description, amount, paid_amount, due_date, status, party_id, finance_parties(name)')
                .eq('type', 'ENTRADA').is('transfer_group_id', null).neq('status', 'PAGO')
                .lte('due_date', addDias(hoje, 7)).order('due_date').then((r) => r.data || [])) : vazio,
            pode.financeiro ? seguro(supabase.from('finance_recurrences').select('amount, frequency, end_date')
                .eq('is_active', true).eq('type', 'ENTRADA').then((r) => r.data || [])) : vazio,
            veCrm ? seguro(atividadesRecentes(8)) : vazio,
        ]);
        const ativos = projetos.filter((p) => ['PLANEJAMENTO', 'EM_ANDAMENTO', 'EM_REVISAO', 'PAUSADO'].includes(p.status));
        const progresso = await progressoDasEntregas(ativos.map((p) => p.workspace_page_id)).catch(() => ({}));
        setD({ hoje, tarefas, passos, projetos, ativos, etapas, ops, receber, recorr, feed, progresso });
    }, [currentUser?.id, veCrm, pode.compromissos, pode.vendas, pode.financeiro]);

    useEffect(() => { carregar(); }, [carregar]);

    useEffect(() => {
        const fora = (e) => { if (novoRef.current && !novoRef.current.contains(e.target)) setNovoAberto(false); };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, []);

    // ---- "Meu dia": tudo que tem data, numa lista só ----
    const itens = useMemo(() => {
        if (!d) return [];
        const projetoDoQuadro = new Map(d.projetos.filter((p) => p.workspace_page_id).map((p) => [p.workspace_page_id, p]));
        const lista = [
            ...d.tarefas.filter((t) => t.dataISO).map((t) => {
                const proj = projetoDoQuadro.get(t.databaseId);
                return {
                    id: t.id, tipo: 'tarefa', titulo: t.titulo, data: t.dataISO, hora: t.hora,
                    contexto: proj ? `${proj.nome} · ${proj.empresa?.name || ''}` : 'Compromissos',
                    abrir: `/compromissos?abrir=${t.rowId}`, concluir: { tipo: 'tarefa', rowId: t.rowId },
                };
            }),
            ...d.passos.map((a) => ({
                id: `crm:${a.id}`, tipo: 'retorno', titulo: a.proximo_passo || a.titulo, data: a.proximo_passo_em,
                contexto: a.empresa?.name || 'Cliente',
                abrir: a.projeto_id ? `/projetos/${a.projeto_id}` : a.oportunidade_id ? `/vendas?abrir=${a.oportunidade_id}` : `/clientes/${a.party_id}`,
                concluir: { tipo: 'retorno', id: a.id },
            })),
            ...d.receber.map((t) => ({
                id: `fin:${t.id}`, tipo: 'receber', titulo: `Receber ${fmtBRL(Number(t.amount) - Number(t.paid_amount || 0))}`,
                data: t.due_date, contexto: `${t.finance_parties?.name || ''}${t.finance_parties?.name ? ' · ' : ''}${t.description}`,
                abrir: '/finance/contas-receber',
            })),
            ...d.ativos.filter((p) => p.prazo && (!p.responsavel_id || p.responsavel_id === currentUser?.id)).map((p) => ({
                id: `prazo:${p.id}`, tipo: 'prazo', titulo: `Entrega: ${p.nome}`, data: p.prazo,
                contexto: `${p.empresa?.name || ''} · ${statusProjeto(p.status).label}`, abrir: `/projetos/${p.id}`,
            })),
        ];
        return lista.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    }, [d, currentUser?.id]);

    const grupos = useMemo(() => {
        if (!d) return { atrasado: [], hoje: [], semana: [] };
        const fimSemana = addDias(d.hoje, 7);
        return {
            atrasado: itens.filter((i) => i.data < d.hoje),
            hoje: itens.filter((i) => i.data === d.hoje),
            semana: itens.filter((i) => i.data > d.hoje && i.data <= fimSemana),
        };
    }, [itens, d]);

    // Abre na aba que tem o que fazer: atrasado > hoje > semana.
    const abaInicial = useRef(false);
    useEffect(() => {
        if (!d || abaInicial.current) return;
        abaInicial.current = true;
        setAba(grupos.atrasado.length ? 'atrasado' : grupos.hoje.length ? 'hoje' : 'semana');
    }, [d, grupos]);

    const concluir = async (item) => {
        setConcluindo(item.id);
        try {
            if (item.concluir.tipo === 'retorno') await concluirProximoPasso(item.concluir.id);
            else {
                const r = await concluirLembrete(item.concluir.rowId, currentUser);
                if (!r.ok) { toast.error(r.motivo); return; }
            }
            setD((x) => ({
                ...x,
                passos: x.passos.filter((a) => `crm:${a.id}` !== item.id),
                tarefas: x.tarefas.filter((t) => t.id !== item.id),
            }));
            toast.success('Feito!');
        } catch (e) {
            console.error(e);
            toast.error('Não deu para concluir.');
        } finally {
            setConcluindo(null);
        }
    };

    // ---- números do topo ----
    const kpi = useMemo(() => {
        if (!d) return null;
        const etapa = (o) => d.etapas.find((e) => e.id === o.etapa_id);
        const abertas = d.ops.filter((o) => etapa(o)?.tipo === 'ABERTA');
        const saldo = (t) => Number(t.amount) - Number(t.paid_amount || 0);
        const mensal = (r) => (r.frequency === 'ANUAL' ? r.amount / 12 : r.frequency === 'SEMANAL' ? r.amount * 52 / 12 : Number(r.amount));
        return {
            receber: d.receber.reduce((s, t) => s + saldo(t), 0),
            vencido: d.receber.filter((t) => t.due_date < d.hoje).reduce((s, t) => s + saldo(t), 0),
            negociacao: abertas.reduce((s, o) => s + Number(o.valor || 0), 0),
            qtdAbertas: abertas.length,
            atrasados: d.ativos.filter((p) => p.prazo && p.prazo < d.hoje).length,
            mrr: d.recorr.filter((r) => !r.end_date || r.end_date >= d.hoje).reduce((s, r) => s + mensal(r), 0),
            funil: d.etapas.filter((e) => e.tipo === 'ABERTA').map((e) => {
                const l = abertas.filter((o) => o.etapa_id === e.id);
                return { ...e, qtd: l.length, valor: l.reduce((s, o) => s + Number(o.valor || 0), 0) };
            }),
        };
    }, [d]);

    const primeiroNome = (currentUser?.name || 'Olá').split(' ')[0];
    const nomeFmt = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();

    const opcoesNovo = [
        pode.editarClientes && { id: 'lead', rotulo: 'Lead / Cliente', icone: Building2 },
        pode.editarVendas && { id: 'oportunidade', rotulo: 'Oportunidade', icone: Target },
        pode.editarProjetos && { id: 'projeto', rotulo: 'Projeto', icone: FolderKanban },
        pode.compromissos && { id: 'tarefa', rotulo: 'Tarefa', icone: ClipboardList },
        hasPermission('Editar Financeiro') && { id: 'lancamento', rotulo: 'Lançamento', icone: DollarSign },
    ].filter(Boolean);

    const escolherNovo = (id) => {
        setNovoAberto(false);
        if (id === 'tarefa') return navigate('/compromissos');
        if (id === 'lancamento') return navigate('/finance/transacoes');
        setCriar(id);
    };

    const lista = grupos[aba] || [];

    return (
        <div className="h-full w-full overflow-y-auto font-sans px-4 pb-8 pt-[84px] md:px-8 md:pt-[96px]">
            <div className="max-w-[1500px] mx-auto space-y-5">

                {/* Cabeçalho */}
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-0">
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{dataExtenso()}</p>
                        <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">{saudacao()}, {nomeFmt}</h1>
                        {d && (
                            <p className="text-[13px] font-semibold text-slate-500 mt-1">
                                {grupos.atrasado.length + grupos.hoje.length === 0
                                    ? 'Nada atrasado nem vencendo hoje.'
                                    : `${grupos.hoje.length} para hoje${grupos.atrasado.length ? ` · ${grupos.atrasado.length} atrasado(s)` : ''}.`}
                            </p>
                        )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => window.dispatchEvent(new CustomEvent('medcode:busca'))}
                            className="h-11 pl-3 pr-2 w-64 max-w-[50vw] bg-white/80 backdrop-blur border border-white rounded-2xl shadow-sm flex items-center gap-2 text-[13px] font-semibold text-slate-400 hover:text-slate-600">
                            <Search size={16} /> <span className="flex-1 text-left">Buscar…</span>
                            <kbd className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Ctrl K</kbd>
                        </button>
                        {opcoesNovo.length > 0 && (
                            <div className="relative" ref={novoRef}>
                                <button onClick={() => setNovoAberto((o) => !o)}
                                    className="h-11 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-600/25 flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide">
                                    <Plus size={16} /> Novo
                                </button>
                                {novoAberto && (
                                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 p-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                                        {opcoesNovo.map((o) => (
                                            <button key={o.id} onClick={() => escolherNovo(o.id)}
                                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12.5px] font-bold text-slate-700 hover:bg-slate-50">
                                                <o.icone size={15} className="text-slate-400" /> {o.rotulo}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {!d ? (
                    <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
                ) : (<>

                    {/* Números */}
                    {kpi && (pode.financeiro || pode.vendas || veCrm) && (
                        <div className="flex flex-wrap gap-3">
                            {pode.financeiro && <Chip rotulo="A receber · 7 dias" valor={fmtBRL(kpi.receber)} detalhe={kpi.vencido > 0 ? `${fmtBRL(kpi.vencido)} vencido` : 'nada vencido'} alerta={kpi.vencido > 0} onClick={() => navigate('/finance/contas-receber')} />}
                            {pode.vendas && <Chip rotulo="Em negociação" valor={fmtBRL(kpi.negociacao)} detalhe={`${kpi.qtdAbertas} oportunidade(s)`} onClick={() => navigate('/vendas')} />}
                            {veCrm && <Chip rotulo="Projetos em curso" valor={d.ativos.length} detalhe={kpi.atrasados ? `${kpi.atrasados} atrasado(s)` : 'nenhum atrasado'} alerta={kpi.atrasados > 0} onClick={() => navigate('/projetos')} />}
                            {pode.financeiro && <Chip rotulo="Receita recorrente" valor={fmtBRL(kpi.mrr)} detalhe="por mês" tom="text-violet-700" onClick={() => navigate('/painel')} />}
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                        {/* Meu dia */}
                        <section className={`${VIDRO} p-5 xl:col-span-2 min-h-[380px] flex flex-col`}>
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                <h2 className="text-lg font-black text-slate-800 mr-2">Meu dia</h2>
                                {[
                                    ['atrasado', 'Atrasados', 'bg-rose-600'],
                                    ['hoje', 'Hoje', 'bg-indigo-600'],
                                    ['semana', 'Próximos 7 dias', 'bg-slate-700'],
                                ].map(([id, rotulo, cor]) => (
                                    <button key={id} onClick={() => setAba(id)}
                                        className={`h-8 px-3 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${aba === id ? `${cor} text-white shadow-sm` : 'bg-white/70 text-slate-500 hover:text-slate-800'}`}>
                                        {rotulo}
                                        <span className={`min-w-[18px] px-1 rounded-full text-[10px] ${aba === id ? 'bg-white/25' : 'bg-slate-100'}`}>{grupos[id].length}</span>
                                    </button>
                                ))}
                            </div>

                            {lista.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
                                    <Sparkles size={26} className="text-indigo-300" />
                                    <p className="text-[13px] font-bold text-slate-500">
                                        {aba === 'atrasado' ? 'Nada atrasado. 👏' : aba === 'hoje' ? 'Dia livre por aqui.' : 'Semana tranquila.'}
                                    </p>
                                    <p className="text-[11.5px] font-semibold text-slate-400 max-w-sm">
                                        Aqui aparecem as tarefas das entregas atribuídas a você, os retornos combinados com clientes, os recebimentos e os prazos dos seus projetos.
                                    </p>
                                </div>
                            ) : (
                                <ul className="space-y-1.5">
                                    {lista.map((item) => {
                                        const t = TIPO_ITEM[item.tipo];
                                        const atrasado = item.data < d.hoje;
                                        return (
                                            <li key={item.id} className="group flex items-center gap-3 p-2.5 rounded-2xl bg-white/60 hover:bg-white transition-colors">
                                                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.cor}`}><t.icone size={16} /></span>
                                                <button onClick={() => navigate(item.abrir)} className="min-w-0 flex-1 text-left">
                                                    <p className="text-[13px] font-bold text-slate-800 truncate">{item.titulo}</p>
                                                    <p className="text-[11px] font-semibold text-slate-400 truncate">{t.rotulo} · {item.contexto}</p>
                                                </button>
                                                <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${atrasado ? 'text-rose-600' : 'text-slate-500'}`}>
                                                    {item.data === d.hoje ? (item.hora || 'Hoje') : fmtData(item.data).slice(0, 5)}
                                                </span>
                                                {item.concluir ? (
                                                    <button onClick={() => concluir(item)} disabled={concluindo === item.id} title="Marcar como feito"
                                                        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-100 shrink-0">
                                                        {concluindo === item.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} strokeWidth={3} />}
                                                    </button>
                                                ) : (
                                                    <ChevronRight size={16} className="text-slate-300 shrink-0 mx-2" />
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>

                        {/* Coluna direita */}
                        <div className="space-y-5">
                            {veCrm && (
                                <section className={`${VIDRO} p-5`}>
                                    <Titulo icone={FolderKanban} acao={<button onClick={() => navigate('/projetos')} className="text-[10px] font-bold text-indigo-600 uppercase">Todos</button>}>Projetos em andamento</Titulo>
                                    {d.ativos.length === 0 ? (
                                        <p className="text-[12px] font-semibold text-slate-400">Nenhum projeto em andamento. Eles nascem quando uma oportunidade é ganha.</p>
                                    ) : (
                                        <ul className="space-y-3">
                                            {[...d.ativos].sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999')).slice(0, 6).map((p) => {
                                                const pr = d.progresso[p.workspace_page_id];
                                                const pct = pr?.total ? Math.round((pr.feitas / pr.total) * 100) : null;
                                                const atrasado = p.prazo && p.prazo < d.hoje;
                                                return (
                                                    <li key={p.id} onClick={() => navigate(`/projetos/${p.id}`)} className="cursor-pointer group">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-base">{resumoServicos(p).emoji}</span>
                                                            <span className="text-[12.5px] font-bold text-slate-800 truncate flex-1 group-hover:text-indigo-600">{p.nome}</span>
                                                            <span className={`text-[10.5px] font-bold whitespace-nowrap ${atrasado ? 'text-rose-600' : 'text-slate-400'}`}>
                                                                {atrasado && <AlertTriangle size={10} className="inline mr-0.5 -mt-0.5" />}{p.prazo ? fmtData(p.prazo).slice(0, 5) : 'sem prazo'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${pct ?? 0}%` }} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums w-16 text-right">{pct == null ? statusProjeto(p.status).label : `${pr.feitas}/${pr.total}`}</span>
                                                        </div>
                                                        <p className="text-[10.5px] font-semibold text-slate-400 mt-0.5 truncate">{p.empresa?.name}{Number(p.valor_recorrente) > 0 && <><Repeat size={9} className="inline mx-1 -mt-0.5 text-violet-400" />{fmtBRL(p.valor_recorrente)}/mês</>}</p>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </section>
                            )}

                            {pode.vendas && kpi && (
                                <section className={`${VIDRO} p-5`}>
                                    <Titulo icone={Target} acao={<button onClick={() => navigate('/vendas')} className="text-[10px] font-bold text-indigo-600 uppercase">Abrir funil</button>}>Funil</Titulo>
                                    <div className="flex gap-1.5">
                                        {kpi.funil.map((e) => (
                                            <button key={e.id} onClick={() => navigate('/vendas')} title={`${e.nome}: ${e.qtd} · ${fmtBRL(e.valor)}`}
                                                className="flex-1 min-w-0 rounded-xl bg-white/70 hover:bg-white p-2 text-left border-t-[3px]" style={{ borderTopColor: e.cor }}>
                                                <p className="text-lg font-black text-slate-800 leading-none">{e.qtd}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase truncate mt-1">{e.nome}</p>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {veCrm && (
                                <section className={`${VIDRO} p-5`}>
                                    <Titulo icone={Sparkles}>Atividade recente</Titulo>
                                    {d.feed.length === 0 ? (
                                        <p className="text-[12px] font-semibold text-slate-400">Os registros de contato com clientes aparecem aqui.</p>
                                    ) : (
                                        <ul className="space-y-2.5">
                                            {d.feed.map((a) => (
                                                <li key={a.id} onClick={() => navigate(a.projeto_id ? `/projetos/${a.projeto_id}` : a.oportunidade_id ? `/vendas?abrir=${a.oportunidade_id}` : `/clientes/${a.party_id}`)}
                                                    className="flex items-start gap-2 cursor-pointer group">
                                                    <span className="text-sm leading-5">{tipoAtividade(a.tipo).emoji}</span>
                                                    <div className="min-w-0">
                                                        <p className="text-[12px] font-semibold text-slate-700 leading-snug group-hover:text-indigo-600">{a.titulo}</p>
                                                        <p className="text-[10.5px] font-semibold text-slate-400">{a.empresa?.name}{a.autor?.name ? ` · ${a.autor.name.split(' ')[0]}` : ''} · {tempoAtras(a.data)}</p>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            )}
                        </div>
                    </div>
                </>)}
            </div>

            {criar === 'lead' && <EmpresaModal onClose={() => setCriar(null)} onSaved={(row) => { setCriar(null); navigate(`/clientes/${row.id}`); }} />}
            {criar === 'projeto' && <ProjetoModal onClose={() => setCriar(null)} onSaved={(row) => { setCriar(null); navigate(`/projetos/${row.id}`); }} />}
            {criar === 'oportunidade' && <NovaOportunidade onClose={() => setCriar(null)} onSaved={() => { setCriar(null); navigate('/vendas'); }} />}
        </div>
    );
}

/** A OportunidadeModal precisa das etapas e empresas — carrega aqui antes de abrir. */
function NovaOportunidade({ onClose, onSaved }) {
    const [dados, setDados] = useState(null);
    useEffect(() => {
        Promise.all([listarEtapas(), listarEmpresas()]).then(([etapas, empresas]) => setDados({ etapas, empresas }))
            .catch((e) => { console.error(e); toast.error('Não foi possível abrir.'); onClose(); });
    }, [onClose]);
    if (!dados) return null;
    return <OportunidadeModal etapas={dados.etapas} empresas={dados.empresas} onClose={onClose} onSaved={onSaved}
        onEmpresaCriada={(row) => setDados((x) => ({ ...x, empresas: [...x.empresas, row] }))} />;
}
