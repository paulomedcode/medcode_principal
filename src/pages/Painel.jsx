import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserSearch } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { listarEtapas, listarOportunidades, listarProjetos } from '../services/crm';
import { listarLeads } from '../services/prospeccao';
import { SERVICOS, idsServicos, resumoServicos, fmtBRL } from '../config/servicos';
import { usePermission } from '../contexts/PermissionContext';
import { todayISO } from '../utils/date';
import { CARD, Carregando } from '../components/crm/ui';

/*
 * NÚMEROS — a aba do Início com a empresa numa tela: dinheiro recorrente, o
 * que entra nos próximos dias, a prospecção, o funil, o que foi vendido e
 * quanto cada projeto deixou de margem. Era a tela "Painel"; virou aba para os
 * números morarem num lugar só (o "Meu dia" ficou só com o que fazer).
 * Cada bloco só aparece para quem tem a permissão do módulo de onde ele vem.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const addDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d + n); const p = (x) => String(x).padStart(2, '0'); return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`; };
const mensal = (r) => (r.frequency === 'ANUAL' ? r.amount / 12 : r.frequency === 'SEMANAL' ? r.amount * 52 / 12 : Number(r.amount));
const compacto = (v) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmtBRL(v));

const Numero = ({ rotulo, valor, detalhe, tom = 'text-slate-900', onClick }) => (
    <button onClick={onClick} disabled={!onClick}
        className={`${CARD} px-4 py-3 text-left min-w-0 ${onClick ? 'hover:border-[#0071e3]/40 cursor-pointer' : 'cursor-default'}`}>
        <p className="text-[11.5px] font-medium text-slate-500">{rotulo}</p>
        <p className={`text-[19px] font-semibold tabular-nums tracking-tight mt-0.5 truncate ${tom}`}>{valor}</p>
        {detalhe && <p className="text-[11px] font-normal text-slate-400 mt-0.5 truncate">{detalhe}</p>}
    </button>
);

const Bloco = ({ titulo, acao, children, className = '' }) => (
    <div className={`${CARD} p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight">{titulo}</h3>
            {acao}
        </div>
        {children}
    </div>
);

/** Barra horizontal rotulada — o rótulo e o valor carregam a leitura, a barra só a proporção. */
const BarraRotulada = ({ rotulo, valor, max, cor, detalhe }) => (
    <div className="group" title={`${rotulo}: ${fmtBRL(valor)}${detalhe ? ` · ${detalhe}` : ''}`}>
        <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="font-semibold text-slate-700 truncate">{rotulo}</span>
            <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtBRL(valor)}{detalhe && <span className="text-slate-400 font-semibold"> · {detalhe}</span>}</span>
        </div>
        <div className="h-2 mt-1 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full transition-all group-hover:brightness-110" style={{ width: `${max > 0 ? Math.max(2, (valor / max) * 100) : 0}%`, background: cor }} />
        </div>
    </div>
);

const TooltipVendas = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-white border border-black/[.08] rounded-lg shadow-lg px-3 py-2 text-[11px]">
            <p className="font-bold text-slate-700 capitalize">{label}</p>
            <p className="font-semibold text-slate-600 tabular-nums">{fmtBRL(d.valor)} · {d.qtd} venda(s)</p>
        </div>
    );
};

export default function Painel() {
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const veVendas = hasPermission('Acessar Vendas');
    const veProjetos = hasPermission('Acessar Projetos');
    const veFinanceiro = hasPermission('Acessar Financeiro');
    const veClientes = hasPermission('Acessar Clientes');
    const veProspeccao = hasPermission('Acessar Prospecção');

    const [d, setD] = useState(null);

    useEffect(() => {
        const hoje = todayISO();
        const vazio = Promise.resolve([]);
        const q = (fn) => fn.then((r) => { if (r.error) throw r.error; return r.data || []; });
        Promise.all([
            veVendas ? listarEtapas() : vazio,
            veVendas ? listarOportunidades() : vazio,
            (veProjetos || veVendas || veClientes) ? listarProjetos() : vazio,
            veFinanceiro ? q(supabase.from('finance_recurrences').select('amount, frequency, type, is_active, end_date').eq('is_active', true).eq('type', 'ENTRADA')) : vazio,
            veFinanceiro ? q(supabase.from('finance_transactions').select('amount, paid_amount, status, due_date, type, projeto_id, transfer_group_id')
                .is('transfer_group_id', null).neq('status', 'PAGO').lte('due_date', addDias(hoje, 30))) : vazio,
            veFinanceiro ? q(supabase.from('finance_transaction_payments').select('amount, payment_date, finance_transactions!inner(type, transfer_group_id)')
                .gte('payment_date', `${hoje.slice(0, 8)}01`).lte('payment_date', hoje)) : vazio,
            veFinanceiro ? q(supabase.from('finance_transactions').select('amount, type, projeto_id').not('projeto_id', 'is', null).is('transfer_group_id', null)) : vazio,
            veProspeccao ? listarLeads() : vazio,
            // Propostas pendentes feitas fora do Vendas (pelo projeto ou pelo financeiro).
            veVendas ? q(supabase.from('finance_quotes').select('total_amount').eq('status', 'PENDENTE').is('oportunidade_id', null)) : vazio,
        ]).then(([etapas, ops, projetos, recorr, abertos, pagamentos, porProjeto, leads, avulsas]) => {
            setD({ hoje, etapas, ops, projetos, recorr, abertos, pagamentos, porProjeto, leads, avulsas });
        }).catch((e) => { console.error(e); toast.error('Erro ao carregar os números.'); setD({ erro: true }); });
    }, [veVendas, veProjetos, veFinanceiro, veClientes, veProspeccao]);

    const k = useMemo(() => {
        if (!d || d.erro) return null;
        const { hoje } = d;
        const etapaDe = (o) => d.etapas.find((e) => e.id === o.etapa_id);
        const abertas = d.ops.filter((o) => etapaDe(o)?.tipo === 'ABERTA');

        // Recorrente: mensalidades ativas (financeiro) — ou, sem acesso a ele, o que os projetos declaram.
        const mrr = veFinanceiro
            ? d.recorr.filter((r) => !r.end_date || r.end_date >= hoje).reduce((s, r) => s + mensal(r), 0)
            : d.projetos.filter((p) => !['CANCELADO'].includes(p.status)).reduce((s, p) => s + Number(p.valor_recorrente || 0), 0);

        const saldo = (t) => Number(t.amount) - Number(t.paid_amount || 0);
        const receber = d.abertos.filter((t) => t.type === 'ENTRADA');
        const pagar = d.abertos.filter((t) => t.type === 'SAIDA');
        const recebidoMes = d.pagamentos
            .filter((p) => p.finance_transactions?.type === 'ENTRADA' && !p.finance_transactions?.transfer_group_id)
            .reduce((s, p) => s + Number(p.amount), 0);

        // Vendas ganhas nos últimos 6 meses (inclui o atual).
        const base = new Date(); base.setDate(1);
        const meses = Array.from({ length: 6 }, (_, i) => {
            const dt = new Date(base.getFullYear(), base.getMonth() - (5 - i), 1);
            return { chave: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`, mes: `${MESES[dt.getMonth()]}/${String(dt.getFullYear()).slice(2)}`, valor: 0, qtd: 0 };
        });
        d.ops.filter((o) => o.ganho_em).forEach((o) => {
            const m = meses.find((x) => x.chave === o.ganho_em.slice(0, 7));
            if (m) { m.valor += Number(o.valor || 0); m.qtd += 1; }
        });

        const funil = d.etapas.filter((e) => e.tipo === 'ABERTA').map((e) => {
            const l = abertas.filter((o) => o.etapa_id === e.id);
            return { ...e, valor: l.reduce((s, o) => s + Number(o.valor || 0), 0), qtd: l.length };
        });

        // Receita contratada por serviço, projetos iniciados nos últimos 12 meses.
        // Projeto com vários serviços conta em cada um, com o valor dividido
        // igualmente entre eles (a soma das barras continua sendo o total).
        const umAno = addDias(hoje, -365);
        const porServico = SERVICOS.map((s) => {
            const l = d.projetos.filter((p) => idsServicos(p).includes(s.id) && p.status !== 'CANCELADO' && (p.data_inicio || p.created_at?.slice(0, 10) || '') >= umAno);
            return { ...s, valor: l.reduce((acc, p) => acc + Number(p.valor_contratado || 0) / idsServicos(p).length, 0), qtd: l.length };
        }).filter((s) => s.qtd > 0).sort((a, b) => b.valor - a.valor);

        const margem = d.projetos.map((p) => {
            const l = d.porProjeto.filter((t) => t.projeto_id === p.id);
            const receita = l.filter((t) => t.type === 'ENTRADA').reduce((s, t) => s + Number(t.amount), 0);
            const custo = l.filter((t) => t.type === 'SAIDA').reduce((s, t) => s + Number(t.amount), 0);
            return { ...p, receita, custo, margem: receita - custo, pct: receita > 0 ? ((receita - custo) / receita) * 100 : null };
        }).filter((p) => p.receita > 0 || p.custo > 0).sort((a, b) => b.receita - a.receita).slice(0, 8);

        const ativos = d.projetos.filter((p) => ['PLANEJAMENTO', 'EM_ANDAMENTO', 'EM_REVISAO', 'PAUSADO'].includes(p.status));

        return {
            mrr,
            receber30: receber.reduce((s, t) => s + saldo(t), 0),
            vencidoReceber: receber.filter((t) => t.due_date < hoje).reduce((s, t) => s + saldo(t), 0),
            pagar30: pagar.reduce((s, t) => s + saldo(t), 0),
            recebidoMes,
            abertoValor: abertas.reduce((s, o) => s + Number(o.valor || 0), 0) + d.avulsas.reduce((s, x) => s + Number(x.total_amount || 0), 0),
            abertoQtd: abertas.length,
            avulsasQtd: d.avulsas.length,
            avulsasValor: d.avulsas.reduce((s, x) => s + Number(x.total_amount || 0), 0),
            ponderado: abertas.reduce((s, o) => s + Number(o.valor || 0) * (etapaDe(o)?.probabilidade || 0) / 100, 0),
            meses, funil, porServico, margem,
            ativos: ativos.length,
            atrasados: ativos.filter((p) => p.prazo && p.prazo < hoje).length,
            prospeccao: (() => {
                const c = (f) => d.leads.filter(f).length;
                const abordados = c((l) => l.status !== 'NOVO');
                const responderam = c((l) => ['RESPONDEU', 'CONVERTIDO'].includes(l.status));
                return {
                    total: d.leads.length, abordados, responderam, convertidos: c((l) => l.status === 'CONVERTIDO'),
                    taxa: abordados ? Math.round((responderam / abordados) * 100) : null,
                };
            })(),
        };
    }, [d, veFinanceiro]);

    if (!d) return <Carregando />;
    if (!k) return <p className="text-sm font-semibold text-slate-500">Não foi possível montar os números.</p>;

    const maxFunil = Math.max(0, k.avulsasValor, ...k.funil.map((e) => e.valor));
    const maxServico = Math.max(0, ...k.porServico.map((s) => s.valor));
    const temVendas = k.meses.some((m) => m.qtd > 0);

    return (
        <div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
                <Numero rotulo="Receita recorrente (MRR)" valor={fmtBRL(k.mrr)} detalhe={`${fmtBRL(k.mrr * 12)} por ano`} tom="text-violet-700" />
                {veFinanceiro && <Numero rotulo="Recebido no mês" valor={fmtBRL(k.recebidoMes)} tom="text-emerald-700" onClick={() => navigate('/finance/dashboard')} />}
                {veFinanceiro && <Numero rotulo="A receber · 30 dias" valor={fmtBRL(k.receber30)}
                    detalhe={k.vencidoReceber > 0 ? `${fmtBRL(k.vencidoReceber)} vencido` : 'nada vencido'}
                    tom={k.vencidoReceber > 0 ? 'text-amber-600' : 'text-slate-900'} onClick={() => navigate('/finance/contas-receber')} />}
                {veFinanceiro && <Numero rotulo="A pagar · 30 dias" valor={fmtBRL(k.pagar30)} onClick={() => navigate('/finance/contas-pagar')} />}
                {veVendas && <Numero rotulo="Em negociação" valor={fmtBRL(k.abertoValor)} detalhe={`${k.abertoQtd} oportunidade(s)${k.avulsasQtd ? ` + ${k.avulsasQtd} proposta(s)` : ''} · ponderado ${compacto(k.ponderado)}`} onClick={() => navigate('/vendas')} />}
                {(veProjetos || veVendas || veClientes) && <Numero rotulo="Projetos em curso" valor={k.ativos}
                    detalhe={k.atrasados ? `${k.atrasados} atrasado(s)` : 'nenhum atrasado'} tom={k.atrasados ? 'text-rose-600' : 'text-slate-900'} onClick={veProjetos ? () => navigate('/projetos') : undefined} />}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {veVendas && (
                    <Bloco titulo="Vendas ganhas · 6 meses" className="lg:col-span-2">
                        {temVendas ? (
                            <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={k.meses} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="0" />
                                        <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                        <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 10, fill: '#94a3b8' }}
                                            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR')} mil` : v)} />
                                        <Tooltip content={<TooltipVendas />} cursor={{ fill: 'rgba(0,113,227,0.06)' }} />
                                        <Bar dataKey="valor" fill="#0071e3" radius={[4, 4, 0, 0]} maxBarSize={36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <p className="text-[11.5px] font-semibold text-slate-400 py-10 text-center">Nenhuma venda ganha nos últimos 6 meses.</p>}
                    </Bloco>
                )}

                {veVendas && (
                    <Bloco titulo="Funil por etapa" acao={<button onClick={() => navigate('/vendas')} className="text-[12px] font-medium text-slate-500 hover:text-slate-900">Abrir funil</button>}>
                        {k.funil.length === 0 ? <p className="text-[11.5px] font-semibold text-slate-400">Sem etapas.</p> : (
                            <div className="space-y-3">
                                {k.funil.map((e) => <BarraRotulada key={e.id} rotulo={e.nome} valor={e.valor} max={maxFunil} cor={e.cor} detalhe={`${e.qtd}`} />)}
                                {k.avulsasQtd > 0 && <BarraRotulada rotulo="Propostas fora do funil" valor={k.avulsasValor} max={maxFunil} cor="#94a3b8" detalhe={`${k.avulsasQtd}`} />}
                            </div>
                        )}
                    </Bloco>
                )}

                {(veProjetos || veVendas || veClientes) && (
                    <Bloco titulo="Contratado por serviço · 12 meses">
                        {k.porServico.length === 0 ? <p className="text-[11.5px] font-semibold text-slate-400">Nenhum projeto no período.</p> : (
                            <div className="space-y-3">
                                {k.porServico.map((s) => <BarraRotulada key={s.id} rotulo={`${s.emoji} ${s.label}`} valor={s.valor} max={maxServico} cor="#6366f1" detalhe={`${s.qtd} proj.`} />)}
                            </div>
                        )}
                    </Bloco>
                )}

                {veFinanceiro && (
                    <Bloco titulo="Margem por projeto" className="lg:col-span-2">
                        {k.margem.length === 0 ? (
                            <p className="text-[11.5px] font-semibold text-slate-400">Aparece quando houver receitas e custos lançados com o projeto vinculado.</p>
                        ) : (
                            <table className="w-full text-left text-[11.5px]">
                                <thead>
                                    <tr className="text-[11px] font-medium text-slate-400">
                                        <th className="pb-2">Projeto</th><th className="pb-2 text-right">Receita</th><th className="pb-2 text-right">Custos</th><th className="pb-2 text-right">Margem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/[.05]">
                                    {k.margem.map((p) => (
                                        <tr key={p.id} onClick={() => navigate(`/projetos/${p.id}`)} className="cursor-pointer hover:bg-slate-50">
                                            <td className="py-1.5 pr-2"><span className="mr-1">{resumoServicos(p).emoji}</span><span className="font-semibold text-slate-700">{p.nome}</span><span className="text-slate-400"> · {p.empresa?.name}</span></td>
                                            <td className="py-1.5 text-right font-semibold text-slate-700 tabular-nums">{fmtBRL(p.receita)}</td>
                                            <td className="py-1.5 text-right font-semibold text-slate-500 tabular-nums">{fmtBRL(p.custo)}</td>
                                            <td className={`py-1.5 text-right font-bold tabular-nums ${p.margem < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                                {fmtBRL(p.margem)}{p.pct != null && <span className="text-slate-400 font-semibold"> ({p.pct.toFixed(0)}%)</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Bloco>
                )}

                {veProspeccao && (
                    <Bloco titulo="Prospecção" acao={<button onClick={() => navigate('/prospeccao')} className="text-[12px] font-medium text-slate-500 hover:text-slate-900">Abrir</button>}>
                        {k.prospeccao.total === 0 ? <p className="text-[11.5px] font-semibold text-slate-400">Nenhum lead na lista ainda.</p> : (
                            <div className="space-y-2.5">
                                {[['Na lista', k.prospeccao.total, '#94a3b8'], ['Abordados', k.prospeccao.abordados, '#3b82f6'],
                                    ['Responderam', k.prospeccao.responderam, '#06b6d4'], ['Viraram oportunidade', k.prospeccao.convertidos, '#10b981']].map(([rot, n, cor]) => (
                                    <div key={rot}>
                                        <div className="flex items-baseline justify-between text-[11.5px]">
                                            <span className="font-semibold text-slate-700">{rot}</span>
                                            <span className="font-bold text-slate-800 tabular-nums">{n}</span>
                                        </div>
                                        <div className="h-2 mt-1 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${Math.max(n ? 2 : 0, (n / k.prospeccao.total) * 100)}%`, background: cor }} />
                                        </div>
                                    </div>
                                ))}
                                <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 pt-1">
                                    <UserSearch size={12} /> Taxa de resposta: <b className="text-slate-600">{k.prospeccao.taxa == null ? '—' : `${k.prospeccao.taxa}%`}</b>
                                </p>
                            </div>
                        )}
                    </Bloco>
                )}
            </div>
        </div>
    );
}
