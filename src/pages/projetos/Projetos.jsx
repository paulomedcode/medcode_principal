import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, Search, ChevronRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { listarProjetos } from '../../services/crm';
import { SERVICOS, STATUS_PROJETO, resumoServicos, temServico, statusProjeto, fmtBRL, fmtData } from '../../config/servicos';
import { usePermission } from '../../contexts/PermissionContext';
import { todayISO as hoje } from '../../utils/date';
import ProjetoModal from '../../components/crm/ProjetoModal';
import { PAGINA, CARD, Etiqueta, Carregando, Vazio, btnPrimario, CHIPS, FAIXA_KPI, FiltrosCelular } from '../../components/crm/ui';

const ATIVOS = ['PLANEJAMENTO', 'EM_ANDAMENTO', 'EM_REVISAO', 'PAUSADO'];

export default function Projetos() {
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Editar Projetos');
    const [projetos, setProjetos] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [filtro, setFiltro] = useState('ATIVOS');
    const [fServico, setFServico] = useState('');
    const [busca, setBusca] = useState('');
    const [novo, setNovo] = useState(false);

    const carregar = async () => {
        try { setProjetos(await listarProjetos()); }
        catch (e) { console.error(e); toast.error('Erro ao carregar projetos.'); }
        finally { setCarregando(false); }
    };
    useEffect(() => { carregar(); }, []);

    const lista = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return projetos
            .filter((p) => (filtro === 'ATIVOS' ? ATIVOS.includes(p.status) : filtro ? p.status === filtro : true))
            .filter((p) => !fServico || temServico(p, fServico))
            .filter((p) => !q || `${p.nome} ${p.empresa?.name || ''}`.toLowerCase().includes(q))
            .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
    }, [projetos, filtro, fServico, busca]);

    const resumo = useMemo(() => {
        const ativos = projetos.filter((p) => ATIVOS.includes(p.status));
        return {
            ativos: ativos.length,
            atrasados: ativos.filter((p) => p.prazo && p.prazo < hoje()).length,
            carteira: ativos.reduce((s, p) => s + Number(p.valor_contratado || 0), 0),
            mrr: projetos.filter((p) => p.status !== 'CANCELADO').reduce((s, p) => s + Number(p.valor_recorrente || 0), 0),
        };
    }, [projetos]);

    return (
        <div className={PAGINA}>
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
                    <FolderKanban size={18} className="text-[#0071e3]" /> Projetos
                </h1>
                <div className={`${CHIPS} order-last md:order-none w-full md:w-auto`}>
                    {[{ id: 'ATIVOS', label: 'Em curso' }, ...STATUS_PROJETO, { id: '', label: 'Todos' }].map((s) => (
                        <button key={s.id || 'todos'} onClick={() => setFiltro(s.id)}
                            className={`shrink-0 px-2.5 h-8 md:h-7 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${filtro === s.id ? 'bg-[#0071e3] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
                <FiltrosCelular ativos={fServico ? 1 : 0}>
                    <select value={fServico} onChange={(e) => setFServico(e.target.value)} className="h-8 px-2 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none cursor-pointer">
                        <option value="">Todos os serviços</option>
                        {SERVICOS.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                    </select>
                </FiltrosCelular>
                <div className="relative flex-1 md:flex-none">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…"
                        className="h-9 md:h-8 pl-8 pr-3 w-full md:w-44 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none focus:border-[#0071e3]" />
                </div>
                {podeEditar && <button onClick={() => setNovo(true)} className={`${btnPrimario} ml-auto hidden md:flex`}><Plus size={15} /> Novo projeto</button>}
            </div>

            <div className={FAIXA_KPI}>
                {[
                    ['Em curso', resumo.ativos, 'text-slate-800'],
                    ['Atrasados', resumo.atrasados, resumo.atrasados ? 'text-rose-600' : 'text-slate-800'],
                    ['Carteira em curso', fmtBRL(resumo.carteira), 'text-indigo-700'],
                    ['Receita recorrente (MRR)', fmtBRL(resumo.mrr), 'text-violet-700'],
                ].map(([r, v, tom]) => (
                    <div key={r} className={`${CARD} px-4 py-3 min-w-[150px] shrink-0 md:shrink md:flex-1`}>
                        <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest">{r}</p>
                        <p className={`text-lg font-bold tabular-nums ${tom}`}>{v}</p>
                    </div>
                ))}
            </div>

            <div className={`${CARD} overflow-hidden`}>
                {carregando ? <Carregando /> : lista.length === 0 ? (
                    <Vazio>{projetos.length === 0 ? 'Nenhum projeto ainda — eles nascem quando uma oportunidade é ganha' : 'Nada com esse filtro'}</Vazio>
                ) : (<>
                    {/* Celular: cartão por projeto — nome, cliente, status e prazo */}
                    <div className="md:hidden divide-y divide-black/[.055]">
                        {lista.map((p) => {
                            const s = resumoServicos(p);
                            const st = statusProjeto(p.status);
                            const atrasado = ATIVOS.includes(p.status) && p.prazo && p.prazo < hoje();
                            return (
                                <button key={p.id} type="button" onClick={() => navigate(`/projetos/${p.id}`)} className="w-full text-left px-4 py-3 flex items-start gap-3 active:bg-slate-50">
                                    <span className="text-lg leading-none mt-0.5 shrink-0">{s.emoji}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[14px] font-bold text-slate-800 truncate">{p.nome}</span>
                                        <span className="block text-[12px] font-semibold text-slate-500 truncate">{p.empresa?.name}</span>
                                        <span className="mt-1.5 flex items-center gap-2">
                                            <Etiqueta className={st.cor}>{st.label}</Etiqueta>
                                            {p.prazo && (
                                                <span className={`text-[11.5px] font-semibold tabular-nums whitespace-nowrap ${atrasado ? 'text-rose-600' : 'text-slate-500'}`}>
                                                    {atrasado && <AlertTriangle size={11} className="inline mr-0.5 -mt-0.5" />}{fmtData(p.prazo)}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                    <span className="text-right shrink-0">
                                        <span className="block text-[13px] font-bold text-slate-800 tabular-nums">{fmtBRL(p.valor_contratado)}</span>
                                        {Number(p.valor_recorrente) > 0 && <span className="block text-[11px] font-semibold text-violet-700 tabular-nums">{fmtBRL(p.valor_recorrente)}/mês</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/70 text-[9px] font-semibold text-slate-400 uppercase tracking-widest border-b border-black/[.06]">
                                    <th className="py-2.5 px-4">Projeto</th>
                                    <th className="py-2.5 px-3">Cliente</th>
                                    <th className="py-2.5 px-3">Status</th>
                                    <th className="py-2.5 px-3">Prazo</th>
                                    <th className="py-2.5 px-3">Responsável</th>
                                    <th className="py-2.5 px-3 text-right">Valor</th>
                                    <th className="py-2.5 px-3 text-right">Mensal</th>
                                    <th className="py-2.5 px-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/[.055]">
                                {lista.map((p) => {
                                    const s = resumoServicos(p);
                                    const st = statusProjeto(p.status);
                                    const atrasado = ATIVOS.includes(p.status) && p.prazo && p.prazo < hoje();
                                    return (
                                        <tr key={p.id} onClick={() => navigate(`/projetos/${p.id}`)} className="group hover:bg-[#f5f5f7] transition-colors text-xs cursor-pointer">
                                            <td className="py-2.5 px-4">
                                                <div className="font-bold text-slate-800 flex items-center gap-1.5"><span>{s.emoji}</span>{p.nome}</div>
                                                <div className="text-[10.5px] font-semibold text-slate-400">{s.label}</div>
                                            </td>
                                            <td className="py-2.5 px-3 font-semibold text-slate-600">{p.empresa?.name}</td>
                                            <td className="py-2.5 px-3"><Etiqueta className={st.cor}>{st.label}</Etiqueta></td>
                                            <td className={`py-2.5 px-3 font-semibold tabular-nums whitespace-nowrap ${atrasado ? 'text-rose-600' : 'text-slate-600'}`}>
                                                {atrasado && <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />}{fmtData(p.prazo)}
                                            </td>
                                            <td className="py-2.5 px-3 font-semibold text-slate-600">{p.responsavel?.name || '—'}</td>
                                            <td className="py-2.5 px-3 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">{fmtBRL(p.valor_contratado)}</td>
                                            <td className="py-2.5 px-3 text-right font-semibold text-violet-700 tabular-nums whitespace-nowrap">{Number(p.valor_recorrente) > 0 ? fmtBRL(p.valor_recorrente) : '—'}</td>
                                            <td className="py-2.5 px-3 text-right"><ChevronRight size={15} className="text-slate-300 group-hover:text-[#0071e3] inline" /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>)}
            </div>

            {novo && <ProjetoModal onClose={() => setNovo(false)} onSaved={(row) => { setNovo(false); navigate(`/projetos/${row.id}`); }} />}
        </div>
    );
}
