import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Edit2, Trash2, Phone, Mail, Globe, Instagram, MapPin, User, Plus, Star, Target, FolderKanban, Loader2, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    obterEmpresa, excluirEmpresa, listarContatos, salvarContato, excluirContato, listarOportunidades,
    listarEtapas, listarProjetos, financeiroDaEmpresa, listarEmpresas,
} from '../../services/crm';
import { tipoEmpresa, resumoServicos, statusProjeto, fmtBRL, fmtData } from '../../config/servicos';
import { usePermission } from '../../contexts/PermissionContext';
import { maskTelefone } from '../../utils/masks';
import EmpresaModal from '../../components/crm/EmpresaModal';
import Atividades from '../../components/crm/Atividades';
import { OportunidadeModal } from '../../components/crm/OportunidadeModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { PAGINA, CARD, Etiqueta, Carregando, Janela, Campo, inputCls, textareaCls, btnPrimario, btnSecundario } from '../../components/crm/ui';
import { resumoFinanceiro } from '../../components/crm/dados';

const Linha = ({ icone, children, href }) => {
    const Icone = icone;
    return children ? (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 min-w-0">
        <Icone size={13} className="text-slate-400 shrink-0" />
        {href ? <a href={href} target="_blank" rel="noreferrer" className="truncate hover:text-[#0071e3]">{children}</a> : <span className="truncate">{children}</span>}
    </div>
    ) : null;
};

const linkSite = (s) => (s ? (s.startsWith('http') ? s : `https://${s}`) : null);
const linkInsta = (s) => (s ? `https://instagram.com/${s.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}` : null);
const linkWhats = (t) => { const d = String(t || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null; };

function ContatoModal({ contato, partyId, onClose, onSaved }) {
    const [form, setForm] = useState({ nome: '', cargo: '', email: '', telefone: '', principal: false, notas: '', ...(contato || {}) });
    const [salvando, setSalvando] = useState(false);
    const salvar = async (e) => {
        e?.preventDefault();
        if (!form.nome.trim()) return toast.error('Informe o nome do contato.');
        setSalvando(true);
        try { await salvarContato({ ...form, party_id: partyId, nome: form.nome.trim() }); onSaved(); }
        catch (err) { console.error(err); toast.error('Não foi possível salvar o contato.'); }
        finally { setSalvando(false); }
    };
    return (
        <Janela titulo={contato?.id ? 'Editar contato' : 'Novo contato'} icone={User} onClose={onClose} largura="max-w-md"
            rodape={<>
                <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} className={btnPrimario}>{salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar</button>
            </>}>
            <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
                <Campo label="Nome" className="col-span-2"><input autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputCls} /></Campo>
                <Campo label="Cargo"><input value={form.cargo || ''} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className={inputCls} placeholder="Ex: Sócio, Marketing" /></Campo>
                <Campo label="Telefone / WhatsApp"><input value={form.telefone || ''} onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })} className={inputCls} maxLength={15} /></Campo>
                <Campo label="E-mail" className="col-span-2"><input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></Campo>
                <Campo label="Observações" className="col-span-2"><textarea value={form.notas || ''} onChange={(e) => setForm({ ...form, notas: e.target.value })} className={`${textareaCls} h-14`} /></Campo>
                <label className="col-span-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={!!form.principal} onChange={(e) => setForm({ ...form, principal: e.target.checked })} className="rounded" /> Contato principal
                </label>
            </form>
        </Janela>
    );
}

export default function ClienteDetalhe() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Editar Clientes') || hasPermission('Editar Vendas') || hasPermission('Editar Financeiro');
    const podeExcluir = hasPermission('Excluir Clientes') || hasPermission('Editar Financeiro');
    const podeVender = hasPermission('Editar Vendas');
    const veFinanceiro = hasPermission('Acessar Financeiro');

    const [empresa, setEmpresa] = useState(null);
    const [contatos, setContatos] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [etapas, setEtapas] = useState([]);
    const [projetos, setProjetos] = useState([]);
    const [lancamentos, setLancamentos] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [editando, setEditando] = useState(false);
    const [contatoAberto, setContatoAberto] = useState(undefined);
    const [novaOp, setNovaOp] = useState(false);
    const [confirmar, setConfirmar] = useState(false);
    const [historicoVersao, setHistoricoVersao] = useState(0);

    const carregar = useCallback(async () => {
        try {
            const [e, c, o, et, p, f] = await Promise.all([
                obterEmpresa(id), listarContatos(id), listarOportunidades({ partyId: id }), listarEtapas(),
                listarProjetos({ partyId: id }), veFinanceiro ? financeiroDaEmpresa(id) : Promise.resolve([]),
            ]);
            setEmpresa(e); setContatos(c); setOportunidades(o); setEtapas(et); setProjetos(p); setLancamentos(f || []);
        } catch (err) {
            console.error(err);
            toast.error('Erro ao carregar a empresa.');
        } finally {
            setCarregando(false);
        }
    }, [id, veFinanceiro]);

    useEffect(() => { carregar(); }, [carregar]);

    const fin = useMemo(() => resumoFinanceiro(lancamentos), [lancamentos]);
    const etapaDe = (op) => etapas.find((e) => e.id === op.etapa_id);

    const excluir = async () => {
        try { await excluirEmpresa(empresa); toast.success('Empresa excluída.'); navigate('/clientes'); }
        catch (e) {
            console.error(e);
            toast.error(e.code === '23503' ? 'Esta empresa tem projetos ou lançamentos no financeiro — não dá para excluir.' : 'Não foi possível excluir.');
        } finally { setConfirmar(false); }
    };

    const tirarContato = async (c) => {
        if (!window.confirm(`Remover o contato ${c.nome}?`)) return;
        try { await excluirContato(c.id); setContatos((l) => l.filter((x) => x.id !== c.id)); }
        catch (e) { console.error(e); toast.error('Não foi possível remover.'); }
    };

    if (carregando) return <div className={PAGINA}><Carregando /></div>;
    if (!empresa) return <div className={PAGINA}><p className="text-sm font-semibold text-slate-500">Empresa não encontrada.</p></div>;

    const t = tipoEmpresa(empresa.kind);

    return (
        <div className={PAGINA}>
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <button onClick={() => navigate('/clientes')} title="Voltar" className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-white hover:text-slate-800"><ArrowLeft size={18} /></button>
                <div className="min-w-0">
                    <h1 className="text-lg font-bold text-[#1d1d1f] flex items-center gap-2 flex-wrap">
                        {empresa.name} <Etiqueta className={t.cor}>{t.label}</Etiqueta>
                        {empresa.segmento && <Etiqueta className="bg-white text-slate-500 border-slate-200">{empresa.segmento}</Etiqueta>}
                    </h1>
                    {empresa.nome_fantasia && <p className="text-[11px] font-semibold text-slate-400">{empresa.nome_fantasia}</p>}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {podeEditar && <button onClick={() => setEditando(true)} className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-[11px] font-bold uppercase text-slate-600 hover:text-[#0071e3] flex items-center gap-1.5"><Edit2 size={13} /> Editar</button>}
                    {podeExcluir && <button onClick={() => setConfirmar(true)} className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-[11px] font-bold uppercase text-slate-500 hover:text-rose-600 flex items-center gap-1.5"><Trash2 size={13} /></button>}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Coluna esquerda */}
                <div className="space-y-4">
                    <div className={`${CARD} p-4 space-y-2`}>
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Dados</h3>
                        <Linha icone={Phone} href={linkWhats(empresa.telefone)}>{empresa.telefone}</Linha>
                        <Linha icone={Mail} href={empresa.email ? `mailto:${empresa.email}` : null}>{empresa.email}</Linha>
                        <Linha icone={Globe} href={linkSite(empresa.site)}>{empresa.site}</Linha>
                        <Linha icone={Instagram} href={linkInsta(empresa.instagram)}>{empresa.instagram}</Linha>
                        <Linha icone={MapPin}>{[empresa.cidade, empresa.uf].filter(Boolean).join(' / ')}</Linha>
                        <div className="pt-2 mt-2 border-t border-black/[.05] grid grid-cols-2 gap-2 text-[11px]">
                            <div><p className="font-bold text-slate-400 uppercase text-[9px]">{empresa.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'}</p><p className="font-semibold text-slate-700">{empresa.document || '—'}</p></div>
                            <div><p className="font-bold text-slate-400 uppercase text-[9px]">Origem</p><p className="font-semibold text-slate-700">{empresa.origem || '—'}</p></div>
                            <div><p className="font-bold text-slate-400 uppercase text-[9px]">Responsável</p><p className="font-semibold text-slate-700">{empresa.responsavel?.name || '—'}</p></div>
                            <div><p className="font-bold text-slate-400 uppercase text-[9px]">Cliente desde</p><p className="font-semibold text-slate-700">{fmtData(empresa.created_at)}</p></div>
                        </div>
                        {empresa.notes && <p className="text-[11.5px] text-slate-600 whitespace-pre-wrap pt-2 border-t border-black/[.05]">{empresa.notes}</p>}
                    </div>

                    <div className={`${CARD} p-4`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Contatos</h3>
                            {podeEditar && <button onClick={() => setContatoAberto(null)} className="text-[10px] font-bold text-[#0071e3] uppercase flex items-center gap-1"><Plus size={12} /> Adicionar</button>}
                        </div>
                        {contatos.length === 0 ? <p className="text-[11px] font-semibold text-slate-400">Nenhum contato.</p> : (
                            <ul className="space-y-2">
                                {contatos.map((c) => (
                                    <li key={c.id} className="group flex items-start gap-2 p-2 rounded-xl hover:bg-slate-50">
                                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0">{c.nome.charAt(0).toUpperCase()}</div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12px] font-bold text-slate-800 flex items-center gap-1">{c.nome}{c.principal && <Star size={11} className="text-amber-500 fill-amber-400" />}</p>
                                            {c.cargo && <p className="text-[10.5px] font-semibold text-slate-400">{c.cargo}</p>}
                                            {c.telefone && <a href={linkWhats(c.telefone)} target="_blank" rel="noreferrer" className="block text-[11px] font-semibold text-slate-600 hover:text-[#0071e3]">{c.telefone}</a>}
                                            {c.email && <a href={`mailto:${c.email}`} className="block text-[11px] text-slate-500 hover:text-[#0071e3] truncate">{c.email}</a>}
                                        </div>
                                        {podeEditar && (
                                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setContatoAberto(c)} className="p-1 text-slate-400 hover:text-[#0071e3]"><Edit2 size={12} /></button>
                                                <button onClick={() => tirarContato(c)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={12} /></button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {veFinanceiro && (
                        <div className={`${CARD} p-4`}>
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Financeiro</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl bg-emerald-50/70 p-2.5"><p className="text-[9px] font-bold text-emerald-700 uppercase">Recebido</p><p className="text-sm font-bold text-emerald-800 tabular-nums">{fmtBRL(fin.recebido)}</p></div>
                                <div className="rounded-xl bg-amber-50/70 p-2.5"><p className="text-[9px] font-bold text-amber-700 uppercase">A receber</p><p className="text-sm font-bold text-amber-800 tabular-nums">{fmtBRL(fin.aReceber)}</p></div>
                                {fin.custo > 0 && <div className="rounded-xl bg-rose-50/70 p-2.5 col-span-2"><p className="text-[9px] font-bold text-rose-700 uppercase">Pago a ele (fornecedor)</p><p className="text-sm font-bold text-rose-800 tabular-nums">{fmtBRL(fin.custo)}</p></div>}
                            </div>
                        </div>
                    )}
                </div>

                {/* Coluna direita */}
                <div className="lg:col-span-2 space-y-4">
                    <div className={`${CARD} p-4`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Target size={13} /> Oportunidades</h3>
                            {podeVender && <button onClick={() => setNovaOp(true)} className="text-[10px] font-bold text-[#0071e3] uppercase flex items-center gap-1"><Plus size={12} /> Nova oportunidade</button>}
                        </div>
                        {oportunidades.length === 0 ? <p className="text-[11px] font-semibold text-slate-400">Nenhuma oportunidade.</p> : (
                            <ul className="divide-y divide-black/[.05]">
                                {oportunidades.map((op) => {
                                    const et = etapaDe(op);
                                    const s = resumoServicos(op);
                                    return (
                                        <li key={op.id} onClick={() => navigate(`/vendas?abrir=${op.id}`)} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg">
                                            <span className="text-base">{s.emoji}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[12px] font-bold text-slate-800 truncate">{op.titulo}</p>
                                                <p className="text-[10.5px] font-semibold text-slate-400">{s.label}{op.previsao_fechamento ? ` · previsão ${fmtData(op.previsao_fechamento)}` : ''}</p>
                                            </div>
                                            <span className="text-[12px] font-bold text-slate-700 tabular-nums">{fmtBRL(op.valor)}</span>
                                            {et && <Etiqueta className="bg-white border-slate-200 text-slate-600"><span className="w-1.5 h-1.5 rounded-full" style={{ background: et.cor }} />{et.nome}</Etiqueta>}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className={`${CARD} p-4`}>
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FolderKanban size={13} /> Projetos</h3>
                        {projetos.length === 0 ? <p className="text-[11px] font-semibold text-slate-400">Nenhum projeto ainda — nasce quando uma oportunidade é ganha.</p> : (
                            <ul className="divide-y divide-black/[.05]">
                                {projetos.map((p) => {
                                    const st = statusProjeto(p.status);
                                    const s = resumoServicos(p);
                                    return (
                                        <li key={p.id} onClick={() => navigate(`/projetos/${p.id}`)} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg">
                                            <span className="text-base">{s.emoji}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[12px] font-bold text-slate-800 truncate">{p.nome}</p>
                                                <p className="text-[10.5px] font-semibold text-slate-400">{s.label}{p.prazo ? ` · prazo ${fmtData(p.prazo)}` : ''}</p>
                                            </div>
                                            <span className="text-[12px] font-bold text-slate-700 tabular-nums">{fmtBRL(p.valor_contratado)}</span>
                                            <Etiqueta className={st.cor}>{st.label}</Etiqueta>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <Atividades key={historicoVersao} vinculo={{ party_id: empresa.id }} filtro={{ partyId: empresa.id }} />
                </div>
            </div>

            {editando && <EmpresaModal empresa={empresa} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); carregar(); }} />}
            {contatoAberto !== undefined && (
                <ContatoModal contato={contatoAberto} partyId={empresa.id} onClose={() => setContatoAberto(undefined)}
                    onSaved={async () => { setContatoAberto(undefined); setContatos(await listarContatos(empresa.id)); }} />
            )}
            {novaOp && (
                <OportunidadeWrapper empresa={empresa} etapas={etapas} onClose={() => setNovaOp(false)}
                    onSaved={() => { setNovaOp(false); carregar(); setHistoricoVersao((v) => v + 1); }} />
            )}
            <ConfirmDialog open={confirmar} title="Excluir empresa"
                message={`Excluir ${empresa.name}? Contatos, oportunidades e histórico saem junto. Empresas com projetos ou lançamentos no financeiro não podem ser excluídas.`}
                confirmLabel="Excluir" onConfirm={excluir} onCancel={() => setConfirmar(false)} />
        </div>
    );
}

// A OportunidadeModal espera a lista de empresas; aqui a empresa é fixa.
function OportunidadeWrapper({ empresa, etapas, onClose, onSaved }) {
    const [empresas, setEmpresas] = useState([empresa]);
    useEffect(() => { listarEmpresas().then(setEmpresas).catch(() => {}); }, []);
    return <OportunidadeModal etapas={etapas} empresas={empresas} partyIdFixo={empresa.id} onClose={onClose} onSaved={onSaved} />;
}
