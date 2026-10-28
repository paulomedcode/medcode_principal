import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    Search, Plus, Building2, Target, ClipboardList, DollarSign, CalendarClock, Check,
    AlertTriangle, Loader2, Flag, UserSearch, CalendarDays,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../contexts/PermissionContext';
import { supabase } from '../services/supabase';
import { tarefasAtribuidas } from '../services/notificacoes';
import { concluirLembrete } from '../services/concluirLembrete';
import {
    proximosPassos, concluirProximoPasso, listarProjetos,
} from '../services/crm';
import { statusProjeto, fmtBRL, fmtData } from '../config/servicos';
import { todayISO } from '../utils/date';
import { statusProspeccao } from '../config/prospeccao';
import { toqueDaVez } from '../config/cadencia';
import { ModalAcompanhamento } from '../components/prospeccao/Acompanhamento';
import { useOpcoesNovo, abrirNovo } from '../components/novo';
import Numeros from './Painel';
import AgendaInicio from '../components/home/AgendaInicio';
import { compromissosDaAgenda } from '../services/agenda';
import { statusGoogle, conectarGoogle, desconectarGoogle, eventosGoogle, sincronizarGoogle } from '../services/google';

/*
 * TELA INICIAL — "Central do dia".
 *
 * Numa agência a pessoa abre o sistema para saber o que fazer agora, não para
 * escolher um menu (a navegação entre módulos mora na barra superior). Então
 * a tela é o trabalho: uma AGENDA (semana ou mês) com tudo que tem data — os
 * compromissos do Planejamento Geral, tarefas das entregas, retornos com
 * clientes e leads, fechamentos previstos, contas a receber e a pagar, prazos
 * de projeto — e, acima dela, o que ficou atrasado de semanas anteriores.
 * Projetos e histórico ficam nos módulos deles, não aqui.
 *
 * Os números da empresa ficam na aba "Números" (src/pages/Painel.jsx), que
 * antes era a tela Painel: assim cada número aparece num lugar só. Cada bloco
 * respeita as permissões: quem não abre o módulo não vê o bloco.
 */

const addDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d + n); const p = (x) => String(x).padStart(2, '0'); return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`; };
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const dataExtenso = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

const VIDRO = 'bg-white border border-black/[.07] shadow-[0_1px_2px_rgba(15,23,42,0.03)] rounded-2xl';

// `borda`/`ponto` pintam o item na agenda; `cor` é o ícone da lista de atrasados.
const TIPO_ITEM = {
    compromisso: { icone: CalendarDays, cor: 'bg-sky-50 text-sky-600', borda: 'border-sky-500', ponto: 'bg-sky-500', rotulo: 'Compromisso' },
    tarefa: { icone: ClipboardList, cor: 'bg-fuchsia-50 text-fuchsia-600', borda: 'border-fuchsia-500', ponto: 'bg-fuchsia-500', rotulo: 'Entrega' },
    retorno: { icone: CalendarClock, cor: 'bg-amber-50 text-amber-600', borda: 'border-amber-500', ponto: 'bg-amber-500', rotulo: 'Retorno' },
    prospeccao: { icone: UserSearch, cor: 'bg-lime-50 text-lime-700', borda: 'border-lime-500', ponto: 'bg-lime-500', rotulo: 'Prospecção' },
    venda: { icone: Target, cor: 'bg-indigo-50 text-indigo-600', borda: 'border-indigo-500', ponto: 'bg-indigo-500', rotulo: 'Fechamento' },
    receber: { icone: DollarSign, cor: 'bg-emerald-50 text-emerald-600', borda: 'border-emerald-500', ponto: 'bg-emerald-500', rotulo: 'Receber' },
    pagar: { icone: DollarSign, cor: 'bg-orange-50 text-orange-600', borda: 'border-orange-500', ponto: 'bg-orange-500', rotulo: 'Pagar' },
    prazo: { icone: Flag, cor: 'bg-rose-50 text-rose-600', borda: 'border-rose-500', ponto: 'bg-rose-500', rotulo: 'Prazo' },
    google: { icone: CalendarDays, cor: 'bg-slate-100 text-slate-600', borda: 'border-slate-400', ponto: 'bg-slate-400', rotulo: 'Google Agenda' },
};

// Até onde a agenda busca recebimentos e retornos da prospecção (o mês dá
// para navegar para frente; o que estiver atrasado vem sempre).
const HORIZONTE_DIAS = 183;

const Titulo = ({ icone: Icone, children, acao }) => (
    <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-slate-800 tracking-tight flex items-center gap-1.5">{Icone && <Icone size={13} />}{children}</h2>
        {acao}
    </div>
);

export default function HomeHub() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
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
        prospeccao: hasPermission('Acessar Prospecção'),
        numeros: hasPermission('Acessar Painel'),
        editarProspeccao: hasPermission('Editar Prospecção'),
        editarClientes: hasPermission('Editar Clientes') || hasPermission('Editar Vendas') || hasPermission('Editar Financeiro'),
    };
    const veCrm = pode.clientes || pode.vendas || pode.projetos;
    // Aba no endereço (/home?aba=numeros) para o link "Números" do menu e da busca.
    const vista = pode.numeros && searchParams.get('aba') === 'numeros' ? 'numeros' : 'dia';
    const trocarVista = (v) => setSearchParams(v === 'numeros' ? { aba: 'numeros' } : {}, { replace: true });

    const [d, setD] = useState(null);
    const [concluindo, setConcluindo] = useState(null);
    const [toqueAberto, setToqueAberto] = useState(null);
    const [novoAberto, setNovoAberto] = useState(false);
    const novoRef = useRef(null);

    const carregar = useCallback(async () => {
        const hoje = todayISO();
        const vazio = Promise.resolve([]);
        const seguro = (p) => p.catch((e) => { console.warn(e); return []; });
        const [tarefas, passos, projetos, receber, prosp, agenda, vendas, pagar] = await Promise.all([
            pode.compromissos && currentUser?.id ? seguro(tarefasAtribuidas(currentUser.id)) : vazio,
            veCrm && currentUser?.id ? seguro(proximosPassos({ autorId: currentUser.id })) : vazio,
            veCrm ? seguro(listarProjetos()) : vazio,
            pode.financeiro ? seguro(supabase.from('finance_transactions')
                .select('id, description, amount, paid_amount, due_date, status, party_id, finance_parties(name)')
                .eq('type', 'ENTRADA').is('transfer_group_id', null).neq('status', 'PAGO')
                .lte('due_date', addDias(hoje, HORIZONTE_DIAS)).order('due_date').then((r) => r.data || [])) : vazio,
            // Retornos combinados na Prospecção (meus ou sem dono).
            pode.prospeccao && currentUser?.id ? seguro(supabase.from('prospeccao_leads')
                .select('id, nome, categoria, cidade, telefone, status, tentativas, ultimo_contato_em, proximo_contato_em, responsavel_id, cadencia_inicio, cadencia_etapa')
                .not('proximo_contato_em', 'is', null).lte('proximo_contato_em', addDias(hoje, HORIZONTE_DIAS))
                .not('status', 'in', '(DESCARTADO,CONVERTIDO)')
                .or(`responsavel_id.is.null,responsavel_id.eq.${currentUser.id}`)
                .order('proximo_contato_em').then((r) => r.data || [])) : vazio,
            // Compromissos do Planejamento Geral (de toda a equipe).
            pode.compromissos ? seguro(compromissosDaAgenda(currentUser)) : vazio,
            // Vendas em aberto com previsão de fechamento (minhas ou sem dono).
            pode.vendas && currentUser?.id ? seguro(supabase.from('crm_oportunidades')
                .select('id, titulo, valor, previsao_fechamento, responsavel_id, empresa:finance_parties(name), etapa:crm_etapas(nome, tipo)')
                .not('previsao_fechamento', 'is', null).lte('previsao_fechamento', addDias(hoje, HORIZONTE_DIAS))
                .or(`responsavel_id.is.null,responsavel_id.eq.${currentUser.id}`)
                .then((r) => (r.data || []).filter((o) => o.etapa?.tipo === 'ABERTA'))) : vazio,
            // Contas a pagar em aberto.
            pode.financeiro ? seguro(supabase.from('finance_transactions')
                .select('id, description, amount, paid_amount, due_date, status, finance_parties(name)')
                .eq('type', 'SAIDA').is('transfer_group_id', null).neq('status', 'PAGO')
                .lte('due_date', addDias(hoje, HORIZONTE_DIAS)).order('due_date').then((r) => r.data || [])) : vazio,
        ]);
        const ativos = projetos.filter((p) => ['PLANEJAMENTO', 'EM_ANDAMENTO', 'EM_REVISAO', 'PAUSADO'].includes(p.status));
        setD({ hoje, tarefas, passos, projetos, ativos, receber, prosp, agenda, vendas, pagar });
    }, [currentUser, veCrm, pode.compromissos, pode.financeiro, pode.prospeccao, pode.vendas]);

    useEffect(() => { carregar(); }, [carregar]);

    // ---- Google Agenda ----
    // { configurado, conectado, email } e os eventos (null = carregando).
    const [google, setGoogle] = useState(null);
    const [eventosG, setEventosG] = useState([]);
    const carregarGoogle = useCallback(async () => {
        try {
            const st = await statusGoogle();
            setGoogle(st);
            if (!st.conectado) { setEventosG([]); return; }
            // Primeiro leva o Planejamento Geral para lá; depois lê tudo de volta.
            await sincronizarGoogle({ agora: true });
            const hoje = todayISO();
            const r = await eventosGoogle(addDias(hoje, -62), addDias(hoje, HORIZONTE_DIAS));
            setEventosG(r.eventos || []);
        } catch (e) {
            console.warn('[google]', e.message);
            if (e.status === 409) { toast.error(e.message); setGoogle((g) => ({ ...g, conectado: false })); }
            else setGoogle((g) => g || { configurado: false, conectado: false });
        }
    }, []);
    useEffect(() => { if (pode.compromissos) carregarGoogle(); }, [carregarGoogle, pode.compromissos]);

    // Volta da tela de permissão do Google: /home?google=ok (ou o motivo).
    useEffect(() => {
        const r = searchParams.get('google');
        if (!r) return;
        const msg = {
            ok: ['success', 'Google Agenda conectado.'],
            cancelado: ['error', 'Conexão com o Google cancelada.'],
            expirou: ['error', 'A conexão demorou demais. Tente de novo.'],
            'sem-permissao': ['error', 'Marque a permissão de agenda na tela do Google.'],
            erro: ['error', 'Não deu para conectar o Google. Tente de novo.'],
        }[r];
        if (msg) toast[msg[0]](msg[1], { id: 'google-retorno' });
        const p = new URLSearchParams(searchParams); p.delete('google');
        setSearchParams(p, { replace: true });
    }, [searchParams, setSearchParams]);

    const desconectar = async () => {
        if (!window.confirm('Desconectar o Google Agenda? Os eventos que já foram para lá continuam no Google.')) return;
        try { await desconectarGoogle(); setGoogle((g) => ({ ...g, conectado: false, email: null })); setEventosG([]); toast.success('Google desconectado.'); }
        catch (e) { toast.error(e.message); }
    };

    useEffect(() => {
        const fora = (e) => { if (novoRef.current && !novoRef.current.contains(e.target)) setNovoAberto(false); };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, []);

    // ---- "Meu dia": tudo que tem data, numa lista só ----
    const itens = useMemo(() => {
        if (!d) return [];
        const projetoDoQuadro = new Map(d.projetos.filter((p) => p.workspace_page_id).map((p) => [p.workspace_page_id, p]));
        const naAgenda = new Set(d.agenda.map((c) => c.rowId));
        const lista = [
            ...d.agenda.map((c) => ({
                id: `ws:${c.rowId}`, tipo: 'compromisso', titulo: c.titulo, data: c.dataISO, hora: c.hora, feito: c.feito,
                contexto: c.agenda, abrir: `/compromissos?abrir=${c.rowId}`, concluir: { tipo: 'tarefa', rowId: c.rowId },
            })),
            // Atribuídas a mim que já estão na agenda não se repetem.
            ...d.tarefas.filter((t) => t.dataISO && !naAgenda.has(t.rowId)).map((t) => {
                const proj = projetoDoQuadro.get(t.databaseId);
                return {
                    id: t.id, tipo: 'tarefa', titulo: t.titulo, data: t.dataISO, hora: t.hora,
                    contexto: proj ? `${proj.nome} · ${proj.empresa?.name || ''}` : 'Compromissos',
                    abrir: `/compromissos?abrir=${t.rowId}`, concluir: { tipo: 'tarefa', rowId: t.rowId },
                };
            }),
            ...d.passos.map((a) => ({
                id: `crm:${a.id}`, tipo: 'retorno', titulo: a.proximo_passo || a.titulo, data: a.proximo_passo_em, meet: a.meet_link,
                hora: a.proximo_passo_hora ? String(a.proximo_passo_hora).slice(0, 5) : null,
                contexto: a.empresa?.name || 'Cliente',
                abrir: a.projeto_id ? `/projetos/${a.projeto_id}` : a.oportunidade_id ? `/vendas?abrir=${a.oportunidade_id}` : `/clientes/${a.party_id}`,
                concluir: { tipo: 'retorno', id: a.id },
            })),
            ...d.prosp.map((l) => {
                const toque = toqueDaVez(l);
                return {
                    id: `prosp:${l.id}`, tipo: 'prospeccao', data: l.proximo_contato_em,
                    titulo: toque ? `${toque.aviso}: ${l.nome}` : `Retornar: ${l.nome}`,
                    contexto: [toque ? `${toque.titulo}, mensagem pronta` : statusProspeccao(l.status).label, l.categoria, l.cidade].filter(Boolean).join(' · '),
                    abrir: `/prospeccao?abrir=${l.id}`,
                    // Com cadência, o ✓ abre o toque com o texto pronto em vez de só limpar a data.
                    concluir: pode.editarProspeccao ? { tipo: toque ? 'toque' : 'prospeccao', id: l.id } : undefined,
                };
            }),
            ...d.receber.map((t) => ({
                id: `fin:${t.id}`, tipo: 'receber', titulo: `Receber ${fmtBRL(Number(t.amount) - Number(t.paid_amount || 0))}`,
                data: t.due_date, contexto: `${t.finance_parties?.name || ''}${t.finance_parties?.name ? ' · ' : ''}${t.description}`,
                abrir: '/finance/contas-receber',
            })),
            ...d.vendas.map((o) => ({
                id: `venda:${o.id}`, tipo: 'venda', titulo: `Fechar: ${o.titulo}`, data: o.previsao_fechamento,
                contexto: [o.empresa?.name, o.etapa?.nome, Number(o.valor) > 0 ? fmtBRL(o.valor) : null].filter(Boolean).join(' · '),
                abrir: `/vendas?abrir=${o.id}`,
            })),
            ...d.pagar.map((t) => ({
                id: `pagar:${t.id}`, tipo: 'pagar', titulo: `Pagar ${fmtBRL(Number(t.amount) - Number(t.paid_amount || 0))}`,
                data: t.due_date, contexto: `${t.finance_parties?.name || ''}${t.finance_parties?.name ? ' · ' : ''}${t.description}`,
                abrir: '/finance/contas-pagar',
            })),
            ...d.ativos.filter((p) => p.prazo && (!p.responsavel_id || p.responsavel_id === currentUser?.id)).map((p) => ({
                id: `prazo:${p.id}`, tipo: 'prazo', titulo: `Entrega: ${p.nome}`, data: p.prazo,
                contexto: `${p.empresa?.name || ''} · ${statusProjeto(p.status).label}`, abrir: `/projetos/${p.id}`,
            })),
        ];
        // Do Google, só o que não nasceu aqui (o que nasceu já está na lista acima).
        eventosG.filter((e) => !e.origem).forEach((e) => lista.push({
            id: `g:${e.id}:${e.data}`, tipo: 'google', titulo: e.titulo, data: e.data, hora: e.hora,
            contexto: [e.hora && e.horaFim ? `até ${e.horaFim}` : null, e.local].filter(Boolean).join(' · '),
            abrir: e.link, meet: e.meet, externo: true,
            // Evento do Google que já passou aconteceu — não é pendência.
            semAtraso: true,
        }));
        return lista.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    }, [d, currentUser?.id, pode.editarProspeccao, eventosG]);

    const grupos = useMemo(() => {
        if (!d) return { atrasado: [], hoje: [] };
        const pendente = itens.filter((i) => !i.feito && !i.semAtraso);
        return {
            atrasado: pendente.filter((i) => i.data < d.hoje),
            hoje: pendente.filter((i) => i.data === d.hoje),
        };
    }, [itens, d]);

    // O lead mudou no painel do toque: some da agenda se o próximo retorno saiu do horizonte.
    const leadAlterado = (row) => {
        const fimSemana = addDias(todayISO(), HORIZONTE_DIAS);
        setD((x) => ({
            ...x,
            prosp: x.prosp
                .map((l) => (l.id === row.id ? { ...l, ...row } : l))
                .filter((l) => l.proximo_contato_em && l.proximo_contato_em <= fimSemana && !['DESCARTADO', 'CONVERTIDO'].includes(l.status)),
        }));
        setToqueAberto(null);
    };

    const concluir = async (item) => {
        if (item.concluir.tipo === 'toque') {
            setToqueAberto(d.prosp.find((l) => l.id === item.concluir.id) || null);
            return;
        }
        setConcluindo(item.id);
        try {
            if (item.concluir.tipo === 'retorno') await concluirProximoPasso(item.concluir.id);
            else if (item.concluir.tipo === 'prospeccao') {
                const { error } = await supabase.from('prospeccao_leads').update({ proximo_contato_em: null }).eq('id', item.concluir.id);
                if (error) throw error;
            }
            else {
                const r = await concluirLembrete(item.concluir.rowId, currentUser);
                if (!r.ok) { toast.error(r.motivo); return; }
            }
            setD((x) => ({
                ...x,
                passos: x.passos.filter((a) => `crm:${a.id}` !== item.id),
                tarefas: x.tarefas.filter((t) => t.id !== item.id),
                prosp: x.prosp.filter((l) => `prosp:${l.id}` !== item.id),
                agenda: x.agenda.map((c) => (`ws:${c.rowId}` === item.id ? { ...c, feito: true } : c)),
            }));
            toast.success('Feito!');
        } catch (e) {
            console.error(e);
            toast.error('Não deu para concluir.');
        } finally {
            setConcluindo(null);
        }
    };

    const primeiroNome = (currentUser?.name || 'Olá').split(' ')[0];
    const nomeFmt = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();

    const opcoesNovo = useOpcoesNovo();

    const escolherNovo = (id) => {
        setNovoAberto(false);
        abrirNovo(id);
    };

    return (
        <div className="md:h-full w-full md:overflow-y-auto font-sans px-4 pb-8 pt-[80px] md:px-6 md:pt-[84px]">
            <div className="max-w-[1500px] mx-auto space-y-4">

                {/* Cabeçalho */}
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-0">
                        <p className="text-[12px] font-medium text-slate-400 first-letter:uppercase">{dataExtenso()}</p>
                        <h1 className="text-[24px] md:text-[26px] font-semibold text-slate-900 tracking-tight leading-tight">{saudacao()}, {nomeFmt}</h1>
                        {d && (
                            <p className="text-[13px] font-normal text-slate-500 mt-0.5">
                                {grupos.atrasado.length + grupos.hoje.length === 0
                                    ? 'Nada atrasado nem vencendo hoje.'
                                    : `${grupos.hoje.length} para hoje${grupos.atrasado.length ? ` · ${grupos.atrasado.length} atrasado(s)` : ''}.`}
                            </p>
                        )}
                    </div>
                    {/* No celular a busca está na barra de cima e o ＋ na de baixo */}
                    <div className="ml-auto hidden md:flex items-center gap-2">
                        <button onClick={() => window.dispatchEvent(new CustomEvent('medcode:busca'))}
                            className="h-9 pl-3 pr-2 w-64 max-w-[50vw] bg-white/85 backdrop-blur border border-black/[.06] rounded-lg flex items-center gap-2 text-[13px] font-normal text-slate-400 hover:text-slate-600">
                            <Search size={15} /> <span className="flex-1 text-left">Buscar…</span>
                            <kbd className="text-[10.5px] font-medium text-slate-400 border border-slate-200 rounded px-1.5 py-px">Ctrl K</kbd>
                        </button>
                        {opcoesNovo.length > 0 && (
                            <div className="relative" ref={novoRef}>
                                <button onClick={() => setNovoAberto((o) => !o)}
                                    className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 text-[13px] font-medium">
                                    <Plus size={15} /> Novo
                                </button>
                                {novoAberto && (
                                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-black/[.06] p-1 z-50 animate-in fade-in slide-in-from-top-1">
                                        {opcoesNovo.map((o) => (
                                            <button key={o.id} onClick={() => escolherNovo(o.id)}
                                                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-normal text-slate-700 hover:bg-slate-50">
                                                <o.icone size={15} className="text-slate-400" /> {o.rotulo}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {pode.numeros && (
                    <div className="flex gap-0.5 bg-slate-900/[.05] backdrop-blur rounded-lg p-0.5 w-fit">
                        {[['dia', 'Meu dia'], ['numeros', 'Números']].map(([id, rot]) => (
                            <button key={id} onClick={() => trocarVista(id)}
                                className={`h-7 px-3 rounded-md text-[13px] font-medium transition-all ${vista === id ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-800'}`}>
                                {rot}
                            </button>
                        ))}
                    </div>
                )}

                {vista === 'numeros' ? <Numeros /> : !d ? (
                    <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
                ) : (<>

                    {grupos.atrasado.length > 0 && (
                        <section className={`${VIDRO} p-4`}>
                            <Titulo icone={AlertTriangle}>
                                <span className="text-rose-600">Atrasados</span>
                                <span className="ml-1 min-w-[18px] px-1 rounded bg-rose-600 text-white text-[11px] tabular-nums text-center">{grupos.atrasado.length}</span>
                            </Titulo>
                            <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                                {grupos.atrasado.map((item) => {
                                    const t = TIPO_ITEM[item.tipo];
                                    return (
                                        <li key={item.id} className="flex items-center gap-2.5">
                                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.cor}`}><t.icone size={15} /></span>
                                            <button onClick={() => navigate(item.abrir)} className="min-w-0 flex-1 text-left">
                                                <p className="text-[12.5px] font-medium text-slate-800 leading-snug break-words">{item.titulo}</p>
                                                <p className="text-[11px] text-slate-400 truncate">{t.rotulo} · {item.contexto}</p>
                                            </button>
                                            <span className="text-[11px] font-semibold tabular-nums text-rose-600 whitespace-nowrap">{fmtData(item.data).slice(0, 5)}</span>
                                            {item.concluir && (
                                                <button onClick={() => concluir(item)} disabled={concluindo === item.id} title={item.concluir.tipo === 'toque' ? 'Abrir a mensagem pronta' : 'Marcar como feito'}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-100 shrink-0">
                                                    {concluindo === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {/* Agenda: tudo que tem data, por semana ou por mês — largura toda para dar para ler */}
                    <section className={`${VIDRO} p-4`}>
                        <AgendaInicio itens={itens} hoje={d.hoje} tipos={TIPO_ITEM} concluindo={concluindo}
                            onAbrir={(item) => (item.externo ? window.open(item.abrir, '_blank', 'noopener') : navigate(item.abrir))}
                            onConcluir={concluir}
                            extra={google?.configurado && (google.conectado ? (
                                <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500" title={`Sincronizado com ${google.email || 'o Google'}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Google Agenda
                                    <button onClick={desconectar} className="text-slate-400 hover:text-rose-600 underline-offset-2 hover:underline">desconectar</button>
                                </span>
                            ) : (
                                <button onClick={() => conectarGoogle().catch((e) => toast.error(e.message))}
                                    className="h-7 px-2.5 rounded-md text-[12px] font-medium text-slate-700 border border-black/[.08] hover:bg-slate-50 flex items-center gap-1.5">
                                    <CalendarDays size={13} /> Conectar Google Agenda
                                </button>
                            ))} />
                    </section>

                </>)}
            </div>

            {toqueAberto && (
                <ModalAcompanhamento lead={toqueAberto} onAlterado={leadAlterado} onClose={() => setToqueAberto(null)}
                    onAbrirFicha={() => navigate(`/prospeccao?abrir=${toqueAberto.id}`)} />
            )}
        </div>
    );
}

