import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, Search, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { listarProjetos } from '../../services/crm';
import { SERVICOS, STATUS_PROJETO, resumoServicos, temServico, statusProjeto, fmtBRL, fmtData } from '../../config/servicos';
import { usePermission } from '../../contexts/PermissionContext';
import { todayISO as hoje } from '../../utils/date';
import ProjetoModal from '../../components/crm/ProjetoModal';
import { IconesServicos, PAGINA, CARD, Etiqueta, Carregando, Vazio, btnPrimario, CHIPS, FiltrosCelular } from '../../components/crm/ui';

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
    const [verEncerrados, setVerEncerrados] = useState(false);

    const carregar = async () => {
        try { setProjetos(await listarProjetos()); }
        catch (e) { console.error(e); toast.error('Erro ao carregar projetos.'); }
        finally { setCarregando(false); }
    };
    useEffect(() => { carregar(); }, []);

    const lista = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return projetos
            .filter((p) => filtro === 'ATIVOS' || p.status === filtro)
            .filter((p) => !fServico || temServico(p, fServico))
            .filter((p) => !q || `${p.nome} ${p.empresa?.name || ''}`.toLowerCase().includes(q))
            .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
    }, [projetos, filtro, fServico, busca]);
    // Em "Em curso", concluídos e cancelados ficam num grupo recolhido no fim da lista.
    const agrupar = filtro === 'ATIVOS';
    const principais = agrupar ? lista.filter((p) => ATIVOS.includes(p.status)) : lista;
    const encerrados = agrupar ? lista.filter((p) => !ATIVOS.includes(p.status)) : [];

    return (
        <div className={PAGINA}>
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                    <FolderKanban size={17} className="text-slate-400" /> Projetos
                </h1>
                <div className={`${CHIPS} order-last md:order-none w-full md:w-auto`}>
                    {[{ id: 'ATIVOS', label: 'Em curso' }, ...STATUS_PROJETO].map((s) => (
                        <button key={s.id} onClick={() => setFiltro(s.id)}
                            className={`shrink-0 px-2.5 h-8 md:h-7 rounded-md text-[12px] font-medium transition-all ${filtro === s.id ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-800'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
                <FiltrosCelular ativos={fServico ? 1 : 0}>
                    <select value={fServico} onChange={(e) => setFServico(e.target.value)} className="h-8 px-2 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none cursor-pointer">
                        <option value="">Todos os serviços</option>
                        {SERVICOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </FiltrosCelular>
                <div className="relative flex-1 md:flex-none">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…"
                        className="h-9 md:h-8 pl-8 pr-3 w-full md:w-44 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none focus:border-[#0071e3]" />
                </div>
                {podeEditar && <button onClick={() => setNovo(true)} className={`${btnPrimario} ml-auto hidden md:flex`}><Plus size={15} /> Novo projeto</button>}
            </div>

            <div className={`${CARD} overflow-hidden`}>
                {carregando ? <Carregando /> : lista.length === 0 ? (
                    <Vazio>{projetos.length === 0 ? 'Nenhum projeto ainda — eles nascem quando uma oportunidade é ganha' : 'Nada com esse filtro'}</Vazio>
                ) : principais.length === 0 && !verEncerrados ? (<>
                    <Vazio>Nenhum projeto em curso</Vazio>
                    <BarraEncerrados qtd={encerrados.length} aberto={false} onClick={() => setVerEncerrados(true)} />
                </>
                ) : (<>
                    {/* Celular: cartão por projeto — nome, cliente, status e prazo */}
                    <div className="md:hidden divide-y divide-black/[.055]">
                        {[...principais, ...(verEncerrados ? encerrados : [])].map((p, i) => {
                            const s = resumoServicos(p);
                            const st = statusProjeto(p.status);
                            const atrasado = ATIVOS.includes(p.status) && p.prazo && p.prazo < hoje();
                            return (<React.Fragment key={p.id}>
                                {i === principais.length && <BarraEncerrados qtd={encerrados.length} aberto={verEncerrados} onClick={() => setVerEncerrados((v) => !v)} />}
                                <button type="button" onClick={() => navigate(`/projetos/${p.id}`)} className={`w-full text-left px-4 py-3 flex items-start gap-3 active:bg-slate-50 ${ATIVOS.includes(p.status) ? '' : 'opacity-70'}`}>
                                    <IconesServicos icones={s.icones} />
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
                            </React.Fragment>);
                        })}
                        {encerrados.length > 0 && !verEncerrados && <BarraEncerrados qtd={encerrados.length} aberto={false} onClick={() => setVerEncerrados(true)} />}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/70 text-[11px] font-medium text-slate-400 border-b border-black/[.06]">
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
                                {[...principais, ...(verEncerrados ? encerrados : [])].map((p, i) => {
                                    const s = resumoServicos(p);
                                    const st = statusProjeto(p.status);
                                    const atrasado = ATIVOS.includes(p.status) && p.prazo && p.prazo < hoje();
                                    return (<React.Fragment key={p.id}>
                                        {i === principais.length && <tr><td colSpan={8} className="p-0"><BarraEncerrados qtd={encerrados.length} aberto={verEncerrados} onClick={() => setVerEncerrados((v) => !v)} /></td></tr>}
                                        <tr onClick={() => navigate(`/projetos/${p.id}`)} className={`group hover:bg-[#f5f5f7] transition-colors text-xs cursor-pointer ${ATIVOS.includes(p.status) ? '' : 'opacity-70'}`}>
                                            <td className="py-2.5 px-4">
                                                <div className="font-bold text-slate-800 flex items-center gap-2"><IconesServicos icones={s.icones} tamanho="sm" />{p.nome}</div>
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
                                    </React.Fragment>);
                                })}
                                {encerrados.length > 0 && !verEncerrados && <tr><td colSpan={8} className="p-0"><BarraEncerrados qtd={encerrados.length} aberto={false} onClick={() => setVerEncerrados(true)} /></td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>)}
            </div>

            {novo && <ProjetoModal onClose={() => setNovo(false)} onSaved={(row) => { setNovo(false); navigate(`/projetos/${row.id}`); }} />}
        </div>
    );
}

/** Linha que abre/fecha o grupo de concluídos e cancelados. */
function BarraEncerrados({ qtd, aberto, onClick }) {
    return (
        <button type="button" onClick={onClick}
            className="w-full px-4 py-2.5 flex items-center gap-1.5 bg-slate-50/70 border-t border-black/[.06] text-[12px] font-medium text-slate-500 hover:text-slate-800 text-left">
            <ChevronDown size={14} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
            Concluídos e cancelados <span className="text-slate-400 tabular-nums">· {qtd}</span>
        </button>
    );
}
