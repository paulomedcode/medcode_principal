import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Trash2, ClipboardList, Loader2, Building2, Target, Repeat, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    obterProjeto, salvarProjeto, excluirProjeto, financeiroDoProjeto, mensalidadesDoProjeto, criarPaginaDeEntregas,
} from '../../services/crm';
import { STATUS_PROJETO, resumoServicos, statusProjeto, fmtBRL, fmtData } from '../../config/servicos';
import { usePermission } from '../../contexts/PermissionContext';
import { useAuth } from '../../contexts/AuthContext';
import { todayISO } from '../../utils/date';
import ProjetoModal from '../../components/crm/ProjetoModal';
import Atividades from '../../components/crm/Atividades';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { PAGINA, CARD, Etiqueta, Carregando } from '../../components/crm/ui';
import { resumoFinanceiro } from '../../components/crm/dados';

const STATUS_LANC = {
    PAGO: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    PARCIAL: 'bg-sky-50 text-sky-700 border-sky-100',
    PENDENTE: 'bg-amber-50 text-amber-700 border-amber-100',
    LANCADO: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function ProjetoDetalhe() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Editar Projetos');
    const podeExcluir = hasPermission('Excluir Projetos');
    const veFinanceiro = hasPermission('Acessar Financeiro');
    const veCompromissos = hasPermission('Acessar Compromissos');

    const [projeto, setProjeto] = useState(null);
    const [lancamentos, setLancamentos] = useState([]);
    const [mensalidades, setMensalidades] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [editando, setEditando] = useState(false);
    const [confirmar, setConfirmar] = useState(false);
    const [criandoEntregas, setCriandoEntregas] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const [p, f, m] = await Promise.all([
                obterProjeto(id),
                veFinanceiro ? financeiroDoProjeto(id) : Promise.resolve([]),
                veFinanceiro ? mensalidadesDoProjeto(id) : Promise.resolve([]),
            ]);
            setProjeto(p); setLancamentos(f || []); setMensalidades(m || []);
        } catch (e) {
            console.error(e);
            toast.error('Erro ao carregar o projeto.');
        } finally {
            setCarregando(false);
        }
    }, [id, veFinanceiro]);

    useEffect(() => { carregar(); }, [carregar]);

    const fin = useMemo(() => resumoFinanceiro(lancamentos), [lancamentos]);

    const mudarStatus = async (status) => {
        try {
            const row = await salvarProjeto({
                id: projeto.id, status,
                concluido_em: status === 'CONCLUIDO' ? (projeto.concluido_em || todayISO()) : null,
            });
            setProjeto(row);
            toast.success(`Status: ${statusProjeto(status).label}`);
        } catch (e) { console.error(e); toast.error('Não foi possível mudar o status.'); }
    };

    const criarEntregas = async () => {
        setCriandoEntregas(true);
        try {
            await criarPaginaDeEntregas(projeto, { userId: currentUser?.id });
            toast.success('Página de entregas criada em Compromissos.');
            carregar();
        } catch (e) { console.error(e); toast.error('Não foi possível criar a página de entregas.'); }
        finally { setCriandoEntregas(false); }
    };

    const excluir = async () => {
        try { await excluirProjeto(projeto); toast.success('Projeto excluído.'); navigate('/projetos'); }
        catch (e) { console.error(e); toast.error('Não foi possível excluir.'); }
        finally { setConfirmar(false); }
    };

    if (carregando) return <div className={PAGINA}><Carregando /></div>;
    if (!projeto) return <div className={PAGINA}><p className="text-sm font-semibold text-slate-500">Projeto não encontrado.</p></div>;

    const s = resumoServicos(projeto);
    const st = statusProjeto(projeto.status);
    const atrasado = projeto.prazo && projeto.prazo < todayISO() && !['CONCLUIDO', 'CANCELADO'].includes(projeto.status);
    const hoje = todayISO();
    const receitas = lancamentos.filter((t) => t.type === 'ENTRADA');
    const custos = lancamentos.filter((t) => t.type === 'SAIDA');

    return (
        <div className={PAGINA}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <button onClick={() => navigate('/projetos')} title="Voltar" className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-white hover:text-slate-800"><ArrowLeft size={18} /></button>
                <span className="text-2xl">{s.emoji}</span>
                <div className="min-w-0">
                    <h1 className="text-lg font-bold text-[#1d1d1f] flex items-center gap-2 flex-wrap">{projeto.nome} <Etiqueta className={st.cor}>{st.label}</Etiqueta></h1>
                    <button onClick={() => navigate(`/clientes/${projeto.party_id}`)} className="text-[11.5px] font-semibold text-[#0071e3] hover:underline flex items-center gap-1"><Building2 size={11} />{projeto.empresa?.name}</button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {podeEditar && (
                        <select value={projeto.status} onChange={(e) => mudarStatus(e.target.value)} className="h-9 px-2 bg-white border border-black/[.085] rounded-lg text-[12.5px] font-medium text-slate-600 outline-none cursor-pointer">
                            {STATUS_PROJETO.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                    )}
                    {podeEditar && <button onClick={() => setEditando(true)} className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-[12.5px] font-medium text-slate-600 hover:text-[#0071e3] flex items-center gap-1.5"><Edit2 size={13} /> Editar</button>}
                    {podeExcluir && <button onClick={() => setConfirmar(true)} className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-slate-500 hover:text-rose-600"><Trash2 size={13} /></button>}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="space-y-4">
                    <div className={`${CARD} p-4 grid grid-cols-2 gap-3 text-[11px]`}>
                        <div><p className="font-normal text-slate-400 text-[11px]">Serviços</p><p className="font-semibold text-slate-700">{s.label}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Responsável</p><p className="font-semibold text-slate-700">{projeto.responsavel?.name || '—'}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Início</p><p className="font-semibold text-slate-700">{fmtData(projeto.data_inicio)}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Prazo</p><p className={`font-semibold ${atrasado ? 'text-rose-600' : 'text-slate-700'}`}>{fmtData(projeto.prazo)}{atrasado ? ' · atrasado' : ''}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Valor contratado</p><p className="font-bold text-slate-800 text-sm tabular-nums">{fmtBRL(projeto.valor_contratado)}</p></div>
                        <div><p className="font-normal text-slate-400 text-[11px]">Mensalidade</p><p className="font-bold text-violet-700 text-sm tabular-nums">{Number(projeto.valor_recorrente) > 0 ? fmtBRL(projeto.valor_recorrente) : '—'}</p></div>
                        {projeto.concluido_em && <div><p className="font-normal text-slate-400 text-[11px]">Concluído em</p><p className="font-semibold text-emerald-700">{fmtData(projeto.concluido_em)}</p></div>}
                        {projeto.oportunidade && (
                            <button onClick={() => navigate(`/vendas?abrir=${projeto.oportunidade.id}`)} className="col-span-2 text-left text-[11px] font-semibold text-[#0071e3] hover:underline flex items-center gap-1">
                                <Target size={11} /> Veio da oportunidade: {projeto.oportunidade.titulo}
                            </button>
                        )}
                        {projeto.descricao && <p className="col-span-2 text-[11.5px] text-slate-600 whitespace-pre-wrap border-t border-black/[.05] pt-2">{projeto.descricao}</p>}
                    </div>

                    <div className={`${CARD} p-4`}>
                        <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight mb-2 flex items-center gap-1.5"><ClipboardList size={13} /> Entregas</h3>
                        {projeto.workspace_page_id ? (
                            <button onClick={() => navigate(`/compromissos?abrir=${projeto.workspace_page_id}`)} disabled={!veCompromissos}
                                className="w-full h-10 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 rounded-xl text-[12.5px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                                <ExternalLink size={13} /> Abrir quadro de entregas
                            </button>
                        ) : (
                            <>
                                <p className="text-[11px] font-semibold text-slate-400 mb-2">Ainda sem quadro de entregas.</p>
                                {podeEditar && veCompromissos && (
                                    <button onClick={criarEntregas} disabled={criandoEntregas}
                                        className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[12.5px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-60">
                                        {criandoEntregas ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />} Criar quadro de {s.label}
                                    </button>
                                )}
                            </>
                        )}
                        <p className="text-[10px] font-semibold text-slate-400 mt-2">Fases: {s.fases.join(' → ')}</p>
                    </div>

                    {veFinanceiro && (
                        <div className={`${CARD} p-4`}>
                            <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight mb-2">Resultado do projeto</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl bg-emerald-50/70 p-2.5"><p className="text-[11px] font-medium text-emerald-700">Receita</p><p className="text-sm font-bold text-emerald-800 tabular-nums">{fmtBRL(fin.receita)}</p><p className="text-[10px] font-semibold text-emerald-700/70">recebido {fmtBRL(fin.recebido)}</p></div>
                                <div className="rounded-xl bg-rose-50/70 p-2.5"><p className="text-[11px] font-medium text-rose-700">Custos</p><p className="text-sm font-bold text-rose-800 tabular-nums">{fmtBRL(fin.custo)}</p><p className="text-[10px] font-semibold text-rose-700/70">pago {fmtBRL(fin.pago)}</p></div>
                                <div className="rounded-xl bg-indigo-50/70 p-2.5 col-span-2">
                                    <p className="text-[11px] font-medium text-indigo-700">Margem</p>
                                    <p className="text-lg font-bold text-indigo-800 tabular-nums">{fmtBRL(fin.margem)}{fin.margemPct != null && <span className="text-xs font-bold ml-1.5">({fin.margemPct.toFixed(0)}%)</span>}</p>
                                    <p className="text-[10px] font-semibold text-indigo-700/70">Custos entram aqui quando o lançamento é vinculado ao projeto (freelancer, APIs, domínio…).</p>
                                </div>
                            </div>
                            {mensalidades.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-black/[.05] space-y-1">
                                    {mensalidades.map((m) => (
                                        <p key={m.id} className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                                            <Repeat size={12} className="text-violet-500" /> {m.description}: <b className="text-violet-700">{fmtBRL(m.amount)}</b>/mês
                                            <span className="text-slate-400">desde {fmtData(m.start_date)}{m.is_active ? '' : ' · encerrada'}</span>
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2 space-y-4">
                    {veFinanceiro && (
                        <div className={`${CARD} p-4`}>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight">Parcelas e custos</h3>
                                <button onClick={() => navigate('/finance/contas-receber')} className="text-[12px] font-medium text-slate-500 hover:text-slate-900">Contas a receber</button>
                            </div>
                            {lancamentos.length === 0 ? <p className="text-[11px] font-semibold text-slate-400">Nenhum lançamento vinculado a este projeto.</p> : (
                                <table className="w-full text-left text-[11.5px]">
                                    <tbody className="divide-y divide-black/[.05]">
                                        {[...receitas, ...custos].map((t) => {
                                            const vencido = t.status !== 'PAGO' && t.due_date && t.due_date < hoje;
                                            return (
                                                <tr key={t.id}>
                                                    <td className="py-1.5 pr-2">
                                                        <span className={`font-bold ${t.type === 'ENTRADA' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.type === 'ENTRADA' ? '↓' : '↑'}</span>{' '}
                                                        <span className="font-semibold text-slate-700">{t.description}</span>
                                                        {t.finance_categories?.name && <span className="text-[10px] text-slate-400 ml-1">· {t.finance_categories.name}</span>}
                                                    </td>
                                                    <td className={`py-1.5 px-2 whitespace-nowrap font-semibold tabular-nums ${vencido ? 'text-rose-600' : 'text-slate-500'}`}>{fmtData(t.due_date || t.transaction_date)}</td>
                                                    <td className="py-1.5 px-2 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtBRL(t.amount)}</td>
                                                    <td className="py-1.5 pl-2 text-right"><Etiqueta className={STATUS_LANC[t.status] || STATUS_LANC.PENDENTE}>{vencido ? 'Vencido' : t.status === 'PAGO' ? (t.type === 'ENTRADA' ? 'Recebido' : 'Pago') : t.status === 'PARCIAL' ? 'Parcial' : 'Em aberto'}</Etiqueta></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    <Atividades vinculo={{ party_id: projeto.party_id, projeto_id: projeto.id }} filtro={{ projetoId: projeto.id }} titulo="Histórico do projeto" />
                </div>
            </div>

            {editando && <ProjetoModal projeto={projeto} onClose={() => setEditando(false)} onSaved={(row) => { setEditando(false); setProjeto(row); }} />}
            <ConfirmDialog open={confirmar} title="Excluir projeto"
                message={`Excluir "${projeto.nome}"? Os lançamentos do financeiro ficam, sem o vínculo com o projeto. O quadro de entregas continua em Compromissos.`}
                confirmLabel="Excluir" onConfirm={excluir} onCancel={() => setConfirmar(false)} />
        </div>
    );
}
