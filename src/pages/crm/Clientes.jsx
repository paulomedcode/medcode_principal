import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, Phone, Mail, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { listarEmpresas } from '../../services/crm';
import { tipoEmpresa } from '../../config/servicos';
import { usePermission } from '../../contexts/PermissionContext';
import EmpresaModal from '../../components/crm/EmpresaModal';
import { PAGINA, CARD, CHIPS, Etiqueta, Carregando, Vazio, btnPrimario } from '../../components/crm/ui';

// Lead cru mora na Prospecção; aqui é a ficha de quem já é (ou está quase
// sendo) cliente. "Em negociação" (kind LEAD) aparece só em "Todos".
const FILTROS = [
    { id: 'CLIENTE', label: 'Clientes' },
    { id: 'FORNECEDOR', label: 'Fornecedores' },
    { id: '', label: 'Todos' },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Clientes() {
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Editar Clientes') || hasPermission('Editar Vendas') || hasPermission('Editar Financeiro');
    const [empresas, setEmpresas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [filtro, setFiltro] = useState('CLIENTE');
    const [busca, setBusca] = useState('');
    const [nova, setNova] = useState(false);

    const carregar = async () => {
        try { setEmpresas(await listarEmpresas()); }
        catch (e) { console.error(e); toast.error('Erro ao carregar empresas.'); }
        finally { setCarregando(false); }
    };
    useEffect(() => { carregar(); }, []);

    const contagem = useMemo(() => {
        const c = { '': empresas.length, CLIENTE: 0, FORNECEDOR: 0 };
        empresas.forEach((e) => {
            if (e.kind === 'CLIENTE' || e.kind === 'AMBOS') c.CLIENTE++;
            if (e.kind === 'FORNECEDOR' || e.kind === 'AMBOS') c.FORNECEDOR++;
        });
        return c;
    }, [empresas]);

    const lista = useMemo(() => {
        const q = norm(busca.trim());
        return empresas.filter((e) => {
            if (filtro === 'CLIENTE' && !['CLIENTE', 'AMBOS'].includes(e.kind)) return false;
            if (filtro === 'FORNECEDOR' && !['FORNECEDOR', 'AMBOS'].includes(e.kind)) return false;
            if (!q) return true;
            return [e.name, e.nome_fantasia, e.document, e.email, e.telefone, e.segmento, e.cidade].some((v) => norm(v).includes(q));
        });
    }, [empresas, filtro, busca]);

    return (
        <div className={PAGINA}>
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                    <Building2 size={17} className="text-slate-400" /> Clientes
                </h1>
                <div className={`${CHIPS} order-last md:order-none w-full md:w-auto`}>
                    {FILTROS.map((f) => (
                        <button key={f.id} onClick={() => setFiltro(f.id)}
                            className={`shrink-0 px-3 h-8 md:h-7 rounded-md text-[12px] font-medium transition-all ${filtro === f.id ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-800'}`}>
                            {f.label} <span className="text-slate-400 font-normal">{contagem[f.id]}</span>
                        </button>
                    ))}
                </div>
                <div className="relative w-full md:w-auto">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CNPJ, cidade…"
                        className="h-10 md:h-8 pl-8 pr-3 w-full md:w-56 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none focus:border-[#0071e3]" />
                </div>
                {podeEditar && (
                    <button onClick={() => setNova(true)} className={`${btnPrimario} ml-auto hidden md:flex`}><Plus size={15} /> Nova empresa</button>
                )}
            </div>

            <div className={`${CARD} overflow-hidden`}>
                {carregando ? <Carregando /> : lista.length === 0 ? (
                    <Vazio>{empresas.length === 0 ? 'Nenhuma empresa cadastrada ainda' : 'Nada encontrado com esse filtro'}</Vazio>
                ) : (<>
                    {/* Celular: um cartão por empresa, com ligar e WhatsApp à mão */}
                    <div className="md:hidden divide-y divide-black/[.055]">
                        {lista.map((e) => {
                            const t = tipoEmpresa(e.kind);
                            const fone = String(e.telefone || '').replace(/\D/g, '');
                            return (
                                <div key={e.id} className="flex items-center gap-2 px-4 py-3">
                                    <button type="button" onClick={() => navigate(`/clientes/${e.id}`)} className="flex-1 min-w-0 text-left">
                                        <span className="block text-[14px] font-bold text-slate-800 truncate">{e.name}</span>
                                        <span className="mt-1 flex items-center gap-2 min-w-0">
                                            <Etiqueta className={t.cor}>{t.label}</Etiqueta>
                                            <span className="text-[11.5px] font-semibold text-slate-400 truncate">
                                                {[e.segmento, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                    </button>
                                    {fone && (
                                        <a href={`tel:${fone}`} aria-label={`Ligar para ${e.name}`}
                                            className="w-10 h-10 shrink-0 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center active:bg-slate-200">
                                            <Phone size={16} />
                                        </a>
                                    )}
                                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/70 text-[11px] font-medium text-slate-400 border-b border-black/[.06]">
                                    <th className="py-2.5 px-4">Empresa</th>
                                    <th className="py-2.5 px-3">Tipo</th>
                                    <th className="py-2.5 px-3">Segmento</th>
                                    <th className="py-2.5 px-3">Contato</th>
                                    <th className="py-2.5 px-3">Cidade</th>
                                    <th className="py-2.5 px-3">Responsável</th>
                                    <th className="py-2.5 px-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/[.055]">
                                {lista.map((e) => {
                                    const t = tipoEmpresa(e.kind);
                                    return (
                                        <tr key={e.id} onClick={() => navigate(`/clientes/${e.id}`)}
                                            className="group hover:bg-[#f5f5f7] transition-colors text-xs cursor-pointer">
                                            <td className="py-2.5 px-4">
                                                <div className="font-bold text-slate-800">{e.name}</div>
                                                {e.nome_fantasia && <div className="text-[10.5px] font-semibold text-slate-400">{e.nome_fantasia}</div>}
                                            </td>
                                            <td className="py-2.5 px-3"><Etiqueta className={t.cor}>{t.label}</Etiqueta></td>
                                            <td className="py-2.5 px-3 font-semibold text-slate-600">{e.segmento || '—'}</td>
                                            <td className="py-2.5 px-3 text-slate-600">
                                                {e.telefone && <div className="flex items-center gap-1 font-semibold"><Phone size={11} className="text-slate-400" />{e.telefone}</div>}
                                                {e.email && <div className="flex items-center gap-1 text-[10.5px]"><Mail size={11} className="text-slate-400" />{e.email}</div>}
                                                {!e.telefone && !e.email && '—'}
                                            </td>
                                            <td className="py-2.5 px-3 font-semibold text-slate-600">{[e.cidade, e.uf].filter(Boolean).join(' / ') || '—'}</td>
                                            <td className="py-2.5 px-3 font-semibold text-slate-600">{e.responsavel?.name || '—'}</td>
                                            <td className="py-2.5 px-3 text-right"><ChevronRight size={15} className="text-slate-300 group-hover:text-[#0071e3] inline" /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>)}
            </div>

            {nova && (
                <EmpresaModal
                    kindInicial={filtro === 'FORNECEDOR' ? 'FORNECEDOR' : 'CLIENTE'}
                    onClose={() => setNova(false)}
                    onSaved={(row) => { setNova(false); navigate(`/clientes/${row.id}`); }} />
            )}
        </div>
    );
}
