import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Radar, Plus, Search, Upload, List, Columns3, CalendarClock, Trash2, X, Building2, ArrowUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { STATUS_PROSPECCAO, STATUS_MANUAIS, statusProspeccao, tempoDesde } from '../../config/prospeccao';
import {
    listarLeads, salvarLead, alterarLeads, excluirLeads, registrarTentativa, situacaoNoVendas,
} from '../../services/prospeccao';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../contexts/PermissionContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FichaLead from '../../components/prospeccao/FichaLead';
import ImportarLeads from '../../components/prospeccao/ImportarLeads';
import { Estrelas, Contatos, NotaGoogle } from '../../components/prospeccao/pecas';
import {
    PAGINA, CARD, CHIPS, FiltrosCelular, Etiqueta, Carregando, Vazio, Janela, Campo, inputCls, btnPrimario, btnSecundario,
} from '../../components/crm/ui';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hoje = () => { const d = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fmtCurta = (s) => { const [, m, d] = String(s).split('-'); return `${d}/${m}`; };

// Fora da fila de trabalho: descartados e os que já viraram oportunidade.
const ENCERRADOS = ['DESCARTADO', 'CONVERTIDO'];

const ORDENS = [
    { id: 'recentes', label: 'Mais recentes' },
    { id: 'prioridade', label: 'Prioridade' },
    { id: 'nota', label: 'Nota no Google' },
    { id: 'avaliacoes', label: 'Nº de avaliações' },
    { id: 'retorno', label: 'Próximo retorno' },
    { id: 'contato', label: 'Último contato (mais antigo)' },
    { id: 'nome', label: 'Nome (A–Z)' },
];
const comparar = {
    recentes: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
    prioridade: (a, b) => (b.prioridade - a.prioridade) || ((b.nota_google ?? -1) - (a.nota_google ?? -1)),
    nota: (a, b) => ((b.nota_google ?? -1) - (a.nota_google ?? -1)) || ((b.avaliacoes ?? -1) - (a.avaliacoes ?? -1)),
    avaliacoes: (a, b) => (b.avaliacoes ?? -1) - (a.avaliacoes ?? -1),
    retorno: (a, b) => String(a.proximo_contato_em || '9999').localeCompare(String(b.proximo_contato_em || '9999')),
    contato: (a, b) => String(a.ultimo_contato_em || '').localeCompare(String(b.ultimo_contato_em || '')),
    nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
};

const LIMITE = 150;   // linhas desenhadas por vez na lista (o resto em "mostrar mais")

/** Etapa do Vendas de um lead convertido (ou só "No Vendas" se não dá para ver). */
const NoVendas = ({ op }) => (
    <a href={op ? `/vendas?abrir=${op.id}` : '/vendas'} onClick={(e) => e.stopPropagation()}
        title={op ? `${op.titulo} — abrir no Vendas` : 'Abrir o Vendas'}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: op?.etapa?.cor || '#10b981' }} />
        Vendas{op?.etapa?.nome ? ` · ${op.etapa.nome}` : ''}
    </a>
);

/** Select de status colorido, para trocar direto na linha. Convertido não troca: mostra o Vendas. */
const SeletorStatus = ({ lead, onChange, disabled, op }) => {
    if (lead.status === 'CONVERTIDO') return <NoVendas op={op} />;
    const st = statusProspeccao(lead.status);
    return (
        <select value={lead.status} disabled={disabled} onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange(e.target.value)}
            className={`h-7 pl-2 pr-6 rounded-full border text-[10.5px] font-bold outline-none cursor-pointer disabled:cursor-default ${st.etiqueta}`}>
            {STATUS_MANUAIS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
    );
};

export default function Prospeccao() {
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Editar Prospecção');
    const podeExcluir = hasPermission('Excluir Prospecção');
    const podeVender = hasPermission('Editar Vendas');
    const veVendas = hasPermission('Acessar Vendas');
    const [searchParams, setSearchParams] = useSearchParams();

    const [leads, setLeads] = useState([]);
    const [noVendas, setNoVendas] = useState({});     // party_id → oportunidade com a etapa
    const [carregando, setCarregando] = useState(true);
    const [visao, setVisao] = useState(() => { try { return localStorage.getItem('prospeccao.visao') || 'lista'; } catch { return 'lista'; } });
    const [fStatus, setFStatus] = useState('ATIVOS');   // ATIVOS | TODOS | RETORNO | id do status
    const [busca, setBusca] = useState('');
    const [fCategoria, setFCategoria] = useState('');
    const [fCidade, setFCidade] = useState('');
    const [fOrigem, setFOrigem] = useState('');
    const [fContato, setFContato] = useState('');        // '', WHATS, SEM_SITE
    const [ordem, setOrdem] = useState('recentes');
    const [limite, setLimite] = useState(LIMITE);
    const [selecionados, setSelecionados] = useState(() => new Set());
    const [abertoId, setAbertoId] = useState(null);
    const [ordemFicha, setOrdemFicha] = useState([]);
    const [importar, setImportar] = useState(false);
    const [novo, setNovo] = useState(false);
    const [excluir, setExcluir] = useState(null);         // lista de ids
    const [excluindo, setExcluindo] = useState(false);
    const [arrastando, setArrastando] = useState(null);
    const [sobre, setSobre] = useState(null);

    const carregar = useCallback(async () => {
        try {
            const ls = await listarLeads();
            setLeads(ls);
            const convertidos = [...new Set(ls.filter((l) => l.party_id).map((l) => l.party_id))];
            if (veVendas && convertidos.length) setNoVendas(await situacaoNoVendas(convertidos).catch(() => ({})));
        }
        catch (e) { console.error(e); toast.error('Erro ao carregar os leads.'); }
        finally { setCarregando(false); }
    }, [veVendas]);
    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => { try { localStorage.setItem('prospeccao.visao', visao); } catch { /* sem storage */ } }, [visao]);
    useEffect(() => { setLimite(LIMITE); }, [fStatus, busca, fCategoria, fCidade, fOrigem, fContato, ordem]);

    // ?abrir=<id> (busca, Central do dia) e ?novo=1 (o "＋" de qualquer tela).
    const abrirParam = searchParams.get('abrir');
    const novoParam = searchParams.get('novo');
    useEffect(() => {
        if (novoParam) { setNovo(true); setSearchParams({}, { replace: true }); return; }
        if (!abrirParam || carregando) return;
        if (leads.some((l) => l.id === abrirParam)) { setOrdemFicha([abrirParam]); setAbertoId(abrirParam); }
        setSearchParams({}, { replace: true });
    }, [abrirParam, novoParam, carregando, leads, setSearchParams]);

    const atualizarLocal = useCallback((row) => setLeads((ls) => ls.map((l) => (l.id === row.id ? { ...l, ...row } : l))), []);

    // ------------------------------------------------------------------ filtros
    const opcoes = useMemo(() => {
        const conta = (campo) => {
            const m = new Map();
            leads.forEach((l) => { const v = l[campo]?.trim(); if (v) m.set(v, (m.get(v) || 0) + 1); });
            return [...m.entries()].sort((a, b) => b[1] - a[1]);
        };
        return { categorias: conta('categoria'), cidades: conta('cidade'), origens: conta('origem') };
    }, [leads]);

    // Filtra por tudo menos o status: é a base dos números dos chips.
    const base = useMemo(() => {
        const q = norm(busca.trim());
        const qd = busca.replace(/\D/g, '');
        return leads.filter((l) => {
            if (fCategoria && l.categoria !== fCategoria) return false;
            if (fCidade && l.cidade !== fCidade) return false;
            if (fOrigem && l.origem !== fOrigem) return false;
            if (fContato === 'WHATS' && !l.telefone) return false;
            if (fContato === 'SEM_SITE' && l.site) return false;
            if (!q) return true;
            if (qd.length >= 4 && String(l.telefone || '').replace(/\D/g, '').includes(qd)) return true;
            return [l.nome, l.categoria, l.cidade, l.endereco, l.email, l.site, l.instagram, l.notas].some((v) => norm(v).includes(q));
        });
    }, [leads, busca, fCategoria, fCidade, fOrigem, fContato]);

    const contagem = useMemo(() => {
        const c = { TODOS: base.length, ATIVOS: 0, RETORNO: 0 };
        STATUS_PROSPECCAO.forEach((s) => { c[s.id] = 0; });
        const h = hoje();
        base.forEach((l) => {
            c[l.status] = (c[l.status] || 0) + 1;
            if (!ENCERRADOS.includes(l.status)) c.ATIVOS++;
            if (l.proximo_contato_em && l.proximo_contato_em <= h && !ENCERRADOS.includes(l.status)) c.RETORNO++;
        });
        return c;
    }, [base]);

    const lista = useMemo(() => {
        const h = hoje();
        const r = base.filter((l) => {
            if (fStatus === 'TODOS') return true;
            if (fStatus === 'ATIVOS') return !ENCERRADOS.includes(l.status);
            if (fStatus === 'RETORNO') return l.proximo_contato_em && l.proximo_contato_em <= h && !ENCERRADOS.includes(l.status);
            return l.status === fStatus;
        });
        return r.sort(fStatus === 'RETORNO' ? comparar.retorno : comparar[ordem]);
    }, [base, fStatus, ordem]);

    const filtrosAtivos = [fCategoria, fCidade, fOrigem, fContato].filter(Boolean).length;

    // ------------------------------------------------------------------ ações
    const mudar = async (lead, dados) => {
        const antes = lead;
        atualizarLocal({ ...lead, ...dados });
        try { atualizarLocal(await salvarLead({ id: lead.id, ...dados })); }
        catch (e) {
            console.error(e); atualizarLocal(antes);
            toast.error(e.code === '42501' ? 'Sem permissão para alterar.' : 'Não salvou. Tente de novo.');
        }
    };

    // Abrir WhatsApp/ligação conta como tentativa. Dá para desfazer pelo aviso.
    const tentativa = async (lead, canal) => {
        const desde = new Date(Date.now() - 2000).toISOString();
        try {
            const row = await registrarTentativa(lead, canal, currentUser?.id);
            atualizarLocal(row);
            toast((t) => (
                <span className="flex items-center gap-3 text-sm">
                    <span><b>{row.tentativas}ª tentativa</b> registrada{lead.status === 'NOVO' ? ' · agora “Abordado”' : ''}</span>
                    <button className="text-[#0071e3] font-bold" onClick={async () => {
                        toast.dismiss(t.id);
                        try {
                            atualizarLocal(await salvarLead({ id: lead.id, tentativas: lead.tentativas || 0, ultimo_contato_em: lead.ultimo_contato_em, status: lead.status }));
                            // Some com o que esse clique gravou no histórico (tentativa e troca de status).
                            await supabase.from('prospeccao_eventos').delete().eq('lead_id', lead.id).gte('created_at', desde);
                        } catch (e) { console.error(e); toast.error('Não desfez.'); }
                    }}>Desfazer</button>
                </span>
            ), { duration: 5000 });
        } catch (e) {
            console.error(e);
            toast.error(e.code === '42501' ? 'Sem permissão para registrar.' : 'Não registrou a tentativa.');
        }
    };

    const emMassa = async (dados, rotulo) => {
        // Quem já virou oportunidade não volta para a fila por troca em massa.
        const convertidos = new Set(leads.filter((l) => l.status === 'CONVERTIDO').map((l) => l.id));
        const ids = [...selecionados].filter((id) => !(dados.status && convertidos.has(id)));
        if (!ids.length) { toast('Os selecionados já estão no Vendas.'); return; }
        try {
            const rows = await alterarLeads(ids, dados);
            rows.forEach(atualizarLocal);
            toast.success(`${rows.length} lead(s) ${rotulo}.`);
            setSelecionados(new Set());
        } catch (e) { console.error(e); toast.error('Não alterou.'); }
    };

    const confirmarExclusao = async () => {
        setExcluindo(true);
        try {
            await excluirLeads(excluir);
            const fora = new Set(excluir);
            setLeads((ls) => ls.filter((l) => !fora.has(l.id)));
            setSelecionados((s) => new Set([...s].filter((id) => !fora.has(id))));
            if (fora.has(abertoId)) setAbertoId(null);
            toast.success(`${excluir.length} lead(s) excluído(s).`);
            setExcluir(null);
        } catch (e) {
            console.error(e);
            toast.error(e.code === '42501' ? 'Sem permissão para excluir.' : 'Não excluiu.');
        } finally { setExcluindo(false); }
    };

    const alternarSel = (id) => setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const visiveis = lista.slice(0, limite);
    const todosMarcados = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.id));
    const marcarTodos = () => setSelecionados((s) => {
        const n = new Set(s);
        if (todosMarcados) visiveis.forEach((l) => n.delete(l.id)); else visiveis.forEach((l) => n.add(l.id));
        return n;
    });

    // Ficha: navega na ordem da lista do momento em que foi aberta. Congelada de
    // propósito — trocar o status tira o lead do filtro, e a sequência de
    // triagem não pode pular nem se perder por isso.
    const abrir = (id) => { setOrdemFicha(lista.map((l) => l.id)); setAbertoId(id); };
    const idxAberto = ordemFicha.indexOf(abertoId);
    const leadAberto = leads.find((l) => l.id === abertoId);
    const irPara = (i) => setAbertoId(ordemFicha[i]);

    const soltar = (status) => {
        const lead = arrastando;
        setArrastando(null); setSobre(null);
        if (!lead || lead.status === status) return;
        // Virar oportunidade pede título e serviço: é pela ficha, não arrastando.
        if (status === 'CONVERTIDO') { abrir(lead.id); toast('Use “Virar oportunidade” na ficha.'); return; }
        if (lead.status === 'CONVERTIDO') { toast('Esse lead já está no Vendas.'); return; }
        mudar(lead, { status });
    };

    const chips = [
        { id: 'ATIVOS', label: 'Ativos' },
        { id: 'RETORNO', label: 'Retornar hoje', cor: '#f43f5e' },
        ...STATUS_PROSPECCAO.map((s) => ({ id: s.id, label: s.label, cor: s.cor })),
        { id: 'TODOS', label: 'Todos' },
    ];

    return (
        <div className={PAGINA}>
            {/* Título e ações */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                    <Radar size={17} className="text-slate-400" /> Prospecção
                </h1>
                <div className="hidden md:flex items-center gap-0.5 bg-slate-100/70 rounded-lg p-0.5">
                    {[{ id: 'lista', icone: <List size={13} />, rot: 'Lista' }, { id: 'quadro', icone: <Columns3 size={13} />, rot: 'Quadro' }].map(({ id, icone, rot }) => (
                        <button key={id} onClick={() => setVisao(id)}
                            className={`h-7 px-2.5 rounded-md text-[12px] font-medium flex items-center gap-1 ${visao === id ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-slate-500'}`}>
                            {icone} {rot}
                        </button>
                    ))}
                </div>
                {podeEditar && (
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setImportar(true)} className="h-9 px-3 rounded-lg bg-white border border-black/[.085] text-slate-700 text-[12.5px] font-medium flex items-center gap-1.5 hover:border-[#0071e3]">
                            <Upload size={14} /> Importar
                        </button>
                        <button onClick={() => setNovo(true)} className={btnPrimario}><Plus size={15} /> Novo lead</button>
                    </div>
                )}
            </div>

            {/* Status */}
            <div className={`${CHIPS} mb-2`}>
                {chips.map((c) => (
                    <button key={c.id} onClick={() => setFStatus(c.id)}
                        className={`shrink-0 px-2.5 h-8 md:h-7 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all ${fStatus === c.id ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-800'}`}>
                        {c.cor && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.cor }} />}
                        {c.label} <span className="text-slate-400 font-normal tabular-nums">{contagem[c.id] ?? 0}</span>
                    </button>
                ))}
            </div>

            {/* Busca e filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 md:flex-none">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, telefone, cidade…"
                        className="h-10 md:h-8 pl-8 pr-3 w-full md:w-64 bg-white border border-black/[.085] rounded-lg text-xs font-semibold outline-none focus:border-[#0071e3]" />
                </div>
                <FiltrosCelular ativos={filtrosAtivos}>
                    <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)} className={`${inputCls} md:!w-48 md:!h-8`}>
                        <option value="">Todas as categorias</option>
                        {opcoes.categorias.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
                    </select>
                    <select value={fCidade} onChange={(e) => setFCidade(e.target.value)} className={`${inputCls} md:!w-40 md:!h-8`}>
                        <option value="">Todas as cidades</option>
                        {opcoes.cidades.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
                    </select>
                    {opcoes.origens.length > 1 && (
                        <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} className={`${inputCls} md:!w-36 md:!h-8`}>
                            <option value="">Toda origem</option>
                            {opcoes.origens.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
                        </select>
                    )}
                    <select value={fContato} onChange={(e) => setFContato(e.target.value)} className={`${inputCls} md:!w-40 md:!h-8`}>
                        <option value="">Com ou sem site</option>
                        <option value="SEM_SITE">Sem site (oportunidade)</option>
                        <option value="WHATS">Com telefone</option>
                    </select>
                    <div className="flex items-center gap-1">
                        <ArrowUpDown size={13} className="text-slate-400 hidden md:block" />
                        <select value={ordem} onChange={(e) => setOrdem(e.target.value)} className={`${inputCls} md:!w-44 md:!h-8`}>
                            {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                    </div>
                    {filtrosAtivos > 0 && (
                        <button onClick={() => { setFCategoria(''); setFCidade(''); setFOrigem(''); setFContato(''); }}
                            className="h-8 px-2 text-[11px] font-bold text-slate-400 hover:text-rose-500">Limpar filtros</button>
                    )}
                </FiltrosCelular>
            </div>

            {/* Ações em massa */}
            {selecionados.size > 0 && (
                <div className="sticky top-2 z-20 mb-2 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white shadow-lg">
                    <span className="text-[12px] font-bold">{selecionados.size} selecionado(s)</span>
                    {podeEditar && (<>
                        <select value="" onChange={(e) => e.target.value && emMassa({ status: e.target.value }, `movido(s) para ${statusProspeccao(e.target.value).label}`)}
                            className="h-8 px-2 rounded-lg bg-white/10 border border-white/20 text-[11px] font-bold outline-none">
                            <option value="">Mudar status…</option>
                            {STATUS_MANUAIS.map((s) => <option key={s.id} value={s.id} className="text-slate-800">{s.label}</option>)}
                        </select>
                        <select value="" onChange={(e) => e.target.value !== '' && emMassa({ prioridade: Number(e.target.value) }, 'com prioridade nova')}
                            className="h-8 px-2 rounded-lg bg-white/10 border border-white/20 text-[11px] font-bold outline-none">
                            <option value="">Prioridade…</option>
                            {[3, 2, 1, 0].map((p) => <option key={p} value={p} className="text-slate-800">{p ? '★'.repeat(p) : 'Sem prioridade'}</option>)}
                        </select>
                    </>)}
                    {podeExcluir && (
                        <button onClick={() => setExcluir([...selecionados])} className="h-8 px-2.5 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-[11px] font-bold flex items-center gap-1">
                            <Trash2 size={13} /> Excluir
                        </button>
                    )}
                    <button onClick={() => setSelecionados(new Set())} className="ml-auto p-1.5 rounded-lg hover:bg-white/10"><X size={15} /></button>
                </div>
            )}

            {carregando ? <div className={CARD}><Carregando /></div> : leads.length === 0 ? (
                <div className={`${CARD} py-14 px-6 text-center`}>
                    <Radar size={34} className="mx-auto text-[#0071e3] mb-3" />
                    <p className="text-sm font-bold text-slate-700">Nenhum lead na lista ainda</p>
                    <p className="text-[12px] font-semibold text-slate-400 mt-1 max-w-md mx-auto">
                        Importe a planilha que você tirou do Google Maps (ou de onde for) — CSV ou Excel — e trabalhe um por um daqui.
                    </p>
                    {podeEditar && (
                        <button onClick={() => setImportar(true)} className={`${btnPrimario} mx-auto mt-4`}><Upload size={14} /> Importar planilha</button>
                    )}
                </div>
            ) : visao === 'quadro' ? (
                /* ------------------------------------------------ QUADRO */
                <div className="hidden md:flex gap-3 overflow-x-auto pb-3 items-start">
                    {STATUS_PROSPECCAO.filter((s) => fStatus === 'TODOS' || s.id !== 'DESCARTADO' || fStatus === 'DESCARTADO').map((s) => {
                        const doStatus = lista.filter((l) => l.status === s.id);
                        return (
                            <div key={s.id}
                                onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSobre(s.id); } }}
                                onDragLeave={() => setSobre((x) => (x === s.id ? null : x))}
                                onDrop={(e) => { e.preventDefault(); soltar(s.id); }}
                                className={`w-[250px] shrink-0 rounded-2xl border transition-colors ${sobre === s.id ? 'bg-[#0071e3]/5 border-[#0071e3]/40' : 'bg-white/60 border-black/[.06]'}`}>
                                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[.05]">
                                    <span className="w-2 h-2 rounded-full" style={{ background: s.cor }} />
                                    <span className="text-[12.5px] font-semibold text-slate-800">{s.label}</span>
                                    <span className="ml-auto text-[11px] font-bold text-slate-400 tabular-nums">{doStatus.length}</span>
                                </div>
                                <div className="p-2 space-y-2 max-h-[calc(100dvh-330px)] overflow-y-auto">
                                    {doStatus.length === 0 && <p className="text-center text-[10.5px] font-semibold text-slate-300 py-4">vazio</p>}
                                    {doStatus.slice(0, 80).map((l) => (
                                        <div key={l.id} draggable={podeEditar && l.status !== 'CONVERTIDO'}
                                            onDragStart={(e) => { setArrastando(l); e.dataTransfer.effectAllowed = 'move'; }}
                                            onDragEnd={() => { setArrastando(null); setSobre(null); }}
                                            onClick={() => abrir(l.id)}
                                            className={`bg-white border border-black/[.085] rounded-xl p-2.5 shadow-sm cursor-pointer hover:border-[#0071e3]/50 ${arrastando?.id === l.id ? 'opacity-40' : ''}`}>
                                            <div className="flex items-start gap-1">
                                                <p className="flex-1 text-[12px] font-bold text-slate-800 leading-snug line-clamp-2">{l.nome}</p>
                                                {l.prioridade > 0 && <span className="text-[10px] text-amber-500 shrink-0">{'★'.repeat(l.prioridade)}</span>}
                                            </div>
                                            <p className="text-[10.5px] font-semibold text-slate-400 truncate mt-0.5">
                                                {[l.categoria, l.cidade].filter(Boolean).join(' · ') || '—'}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1.5">
                                                <Contatos lead={l} onContato={podeEditar ? (canal) => tentativa(l, canal) : undefined} />
                                                {l.proximo_contato_em && (
                                                    <span className={`ml-auto text-[10px] font-bold flex items-center gap-0.5 ${l.proximo_contato_em <= hoje() ? 'text-rose-500' : 'text-slate-400'}`}>
                                                        <CalendarClock size={11} /> {fmtCurta(l.proximo_contato_em)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {doStatus.length > 80 && <p className="text-center text-[10.5px] font-semibold text-slate-400 py-1">+ {doStatus.length - 80} — use a lista ou filtre</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {/* ------------------------------------------------ LISTA (e sempre no celular) */}
            {!carregando && leads.length > 0 && (
                <div className={`${CARD} overflow-hidden ${visao === 'quadro' ? 'md:hidden' : ''}`}>
                    {lista.length === 0 ? <Vazio>Nada com esse filtro</Vazio> : (<>
                        {/* Celular */}
                        <div className="md:hidden divide-y divide-black/[.055]">
                            {visiveis.map((l) => {
                                const st = statusProspeccao(l.status);
                                return (
                                    <div key={l.id} onClick={() => abrir(l.id)} className="px-4 py-3 active:bg-slate-50">
                                        <div className="flex items-start gap-2">
                                            <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: st.cor }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[14px] font-bold text-slate-800 leading-snug">{l.nome}</p>
                                                <p className="text-[11.5px] font-semibold text-slate-400 truncate">
                                                    {[l.categoria, l.cidade].filter(Boolean).join(' · ')}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <Etiqueta className={st.etiqueta}>{st.label}</Etiqueta>
                                                    {l.prioridade > 0 && <span className="text-[11px] text-amber-500">{'★'.repeat(l.prioridade)}</span>}
                                                    {l.tentativas > 0 && <span className="text-[10.5px] font-bold text-slate-400">{l.tentativas}× · {tempoDesde(l.ultimo_contato_em)}</span>}
                                                    {l.proximo_contato_em && (
                                                        <span className={`text-[10.5px] font-bold flex items-center gap-0.5 ${l.proximo_contato_em <= hoje() ? 'text-rose-500' : 'text-slate-400'}`}>
                                                            <CalendarClock size={11} /> {fmtCurta(l.proximo_contato_em)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <Contatos lead={{ ...l, site: null, instagram: null, maps_url: null, endereco: null, nome: null }}
                                                onContato={podeEditar ? (canal) => tentativa(l, canal) : undefined} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Computador */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/70 text-[11px] font-medium text-slate-400 border-b border-black/[.06]">
                                        <th className="py-2.5 pl-4 pr-1 w-8"><input type="checkbox" checked={todosMarcados} onChange={marcarTodos} /></th>
                                        <th className="py-2.5 px-1 w-[70px]">Prior.</th>
                                        <th className="py-2.5 px-3">Lead</th>
                                        <th className="py-2.5 px-3">Contato</th>
                                        <th className="py-2.5 px-3">Google</th>
                                        <th className="py-2.5 px-3">Status</th>
                                        <th className="py-2.5 px-3">Tentativas</th>
                                        <th className="py-2.5 px-3">Retorno</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/[.055]">
                                    {visiveis.map((l) => (
                                        <tr key={l.id} onClick={() => abrir(l.id)}
                                            className={`group text-xs cursor-pointer transition-colors ${selecionados.has(l.id) ? 'bg-[#0071e3]/5' : 'hover:bg-[#f5f5f7]'}`}>
                                            <td className="py-2 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                                                <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternarSel(l.id)} />
                                            </td>
                                            <td className="py-2 px-1"><Estrelas valor={l.prioridade} onChange={podeEditar ? (p) => mudar(l, { prioridade: p }) : undefined} /></td>
                                            <td className="py-2 px-3 max-w-[340px]">
                                                <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                                    {l.nome}
                                                    {l.party_id && <Building2 size={12} className="text-emerald-500 shrink-0" title="Já está em Clientes" />}
                                                </div>
                                                <div className="text-[10.5px] font-semibold text-slate-400 truncate">
                                                    {[l.categoria, [l.cidade, l.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—'}
                                                </div>
                                            </td>
                                            <td className="py-2 px-3">
                                                <div className="flex items-center gap-1">
                                                    <Contatos lead={l} onContato={podeEditar ? (canal) => tentativa(l, canal) : undefined} />
                                                </div>
                                                {l.telefone && <div className="text-[10.5px] font-semibold text-slate-400 tabular-nums">{l.telefone}</div>}
                                            </td>
                                            <td className="py-2 px-3 whitespace-nowrap"><NotaGoogle lead={l} /></td>
                                            <td className="py-2 px-3"><SeletorStatus lead={l} op={noVendas[l.party_id]} disabled={!podeEditar} onChange={(status) => mudar(l, { status })} /></td>
                                            <td className="py-2 px-3 whitespace-nowrap font-semibold text-slate-500">
                                                {l.tentativas ? <><span className="font-bold text-slate-700">{l.tentativas}×</span> · {tempoDesde(l.ultimo_contato_em)}</> : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-2 px-3 whitespace-nowrap">
                                                {l.proximo_contato_em ? (
                                                    <span className={`font-bold flex items-center gap-1 ${l.proximo_contato_em <= hoje() ? 'text-rose-500' : 'text-slate-600'}`}>
                                                        <CalendarClock size={12} /> {fmtCurta(l.proximo_contato_em)}
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {lista.length > limite && (
                            <button onClick={() => setLimite((n) => n + LIMITE)} className="w-full py-3 text-[12.5px] font-medium text-slate-500 hover:text-slate-900 border-t border-black/[.06] hover:bg-slate-50">
                                Mostrar mais ({lista.length - limite} restantes)
                            </button>
                        )}
                    </>)}
                </div>
            )}

            {/* Celular: botão de novo lead */}
            {podeEditar && (
                <div className="md:hidden flex gap-2 mt-3">
                    <button onClick={() => setImportar(true)} className="flex-1 h-11 rounded-xl bg-white border border-black/[.085] text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"><Upload size={15} /> Importar</button>
                    <button onClick={() => setNovo(true)} className="flex-1 h-11 rounded-xl bg-[#0071e3] text-white text-xs font-bold flex items-center justify-center gap-1.5"><Plus size={15} /> Novo lead</button>
                </div>
            )}

            {leadAberto && (
                <FichaLead
                    lead={leadAberto}
                    posicao={idxAberto >= 0 ? idxAberto + 1 : 1}
                    total={idxAberto >= 0 ? ordemFicha.length : 1}
                    onAnterior={idxAberto > 0 ? () => irPara(idxAberto - 1) : undefined}
                    onProximo={idxAberto >= 0 && idxAberto < ordemFicha.length - 1 ? () => irPara(idxAberto + 1) : undefined}
                    onClose={() => setAbertoId(null)}
                    onAlterado={(row) => { atualizarLocal(row); if (row.status === 'CONVERTIDO' && !noVendas[row.party_id]) carregar(); }}
                    onTentativa={(canal) => tentativa(leadAberto, canal)}
                    onExcluir={(l) => setExcluir([l.id])}
                    podeEditar={podeEditar} podeExcluir={podeExcluir} podeVender={podeVender} noVendas={noVendas[leadAberto.party_id]}
                />
            )}

            {importar && (
                <ImportarLeads existentes={leads} onClose={() => setImportar(false)}
                    onImportados={(criados) => { setLeads((ls) => [...criados, ...ls]); setImportar(false); setFStatus('NOVO'); }} />
            )}

            {novo && (
                <NovoLead onClose={() => setNovo(false)}
                    onSalvo={(row) => { setLeads((ls) => [row, ...ls]); setNovo(false); setOrdemFicha([row.id]); setAbertoId(row.id); }} />
            )}

            <ConfirmDialog open={!!excluir} busy={excluindo}
                title={excluir?.length > 1 ? `Excluir ${excluir.length} leads?` : 'Excluir este lead?'}
                message="Some da lista com todo o histórico. Se já virou cliente, a empresa em Clientes continua lá."
                confirmLabel="Excluir" onConfirm={confirmarExclusao} onCancel={() => setExcluir(null)} />
        </div>
    );
}

function NovoLead({ onClose, onSalvo }) {
    const [f, setF] = useState({ nome: '', telefone: '', categoria: '', cidade: '', uf: '', site: '', instagram: '', origem: '' });
    const [salvando, setSalvando] = useState(false);
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
    const salvar = async () => {
        if (!f.nome.trim()) { toast.error('Dê um nome ao lead.'); return; }
        setSalvando(true);
        try { onSalvo(await salvarLead({ ...f, nome: f.nome.trim(), uf: f.uf.toUpperCase().slice(0, 2) })); }
        catch (e) { console.error(e); toast.error(e.code === '42501' ? 'Sem permissão.' : 'Não salvou.'); setSalvando(false); }
    };
    return (
        <Janela titulo="Novo lead" icone={Radar} onClose={onClose} largura="max-w-lg"
            rodape={<><button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} className={btnPrimario}>Salvar</button></>}>
            <div className="grid grid-cols-2 gap-2.5">
                <Campo label="Nome *" className="col-span-2"><input autoFocus value={f.nome} onChange={set('nome')} className={inputCls}
                    onKeyDown={(e) => e.key === 'Enter' && salvar()} /></Campo>
                <Campo label="Telefone / WhatsApp"><input value={f.telefone} onChange={set('telefone')} className={inputCls} /></Campo>
                <Campo label="Categoria"><input value={f.categoria} onChange={set('categoria')} className={inputCls} placeholder="Dentista, clínica…" /></Campo>
                <Campo label="Cidade"><input value={f.cidade} onChange={set('cidade')} className={inputCls} /></Campo>
                <Campo label="UF"><input value={f.uf} onChange={set('uf')} maxLength={2} className={inputCls} /></Campo>
                <Campo label="Site"><input value={f.site} onChange={set('site')} className={inputCls} /></Campo>
                <Campo label="Instagram"><input value={f.instagram} onChange={set('instagram')} className={inputCls} placeholder="@perfil" /></Campo>
                <Campo label="Origem" className="col-span-2"><input value={f.origem} onChange={set('origem')} className={inputCls} placeholder="Google Maps, indicação…" /></Campo>
            </div>
        </Janela>
    );
}
