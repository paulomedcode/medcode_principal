import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, Target, FolderKanban, CornerDownLeft, Loader2, Radar } from 'lucide-react';
import { supabase } from '../services/supabase';
import { usePermission } from '../contexts/PermissionContext';
import { PERMISSION_MODULES } from '../config/permissions';
import { rotuloServicos } from '../config/servicos';
import { statusProspeccao } from '../config/prospeccao';

/*
 * Busca global — Ctrl/⌘ + K ou a lupa da barra superior (evento
 * "medcode:busca"). Acha empresa, oportunidade e projeto pelo nome e também
 * leva direto a qualquer módulo. Cada fonte só é consultada por quem abre o
 * módulo; o banco (RLS) barra o resto de qualquer jeito.
 */

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function BuscaGlobal() {
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const [aberta, setAberta] = useState(false);
    const [termo, setTermo] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [sel, setSel] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        const abrir = () => { setAberta(true); setTermo(''); setResultados([]); setSel(0); };
        const tecla = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrir(); }
        };
        window.addEventListener('medcode:busca', abrir);
        window.addEventListener('keydown', tecla);
        return () => { window.removeEventListener('medcode:busca', abrir); window.removeEventListener('keydown', tecla); };
    }, []);

    useEffect(() => { if (aberta) setTimeout(() => inputRef.current?.focus(), 30); }, [aberta]);

    const modulos = useMemo(() => PERMISSION_MODULES
        .filter((m) => m.route && hasPermission(m.accessKey))
        .map((m) => ({ id: `mod:${m.id}`, tipo: 'Módulo', titulo: m.label, sub: m.desc, destino: m.route })), [hasPermission]);

    useEffect(() => {
        if (!aberta) return undefined;
        const q = termo.trim();
        if (q.length < 2) return undefined;
        const t = setTimeout(async () => {
            setBuscando(true);
            const like = `%${q.replace(/[%_]/g, '')}%`;
            const veEmpresas = hasPermission('Acessar Clientes') || hasPermission('Acessar Vendas') || hasPermission('Acessar Financeiro');
            const digitos = q.replace(/\D/g, '');
            const [emp, ops, projs, prosp] = await Promise.all([
                veEmpresas ? supabase.from('finance_parties').select('id, name, nome_fantasia, kind').or(`name.ilike.${like},nome_fantasia.ilike.${like},document.ilike.${like}`).limit(6) : { data: [] },
                hasPermission('Acessar Vendas') ? supabase.from('crm_oportunidades').select('id, titulo, servico, servicos, empresa:finance_parties(name)').ilike('titulo', like).limit(6) : { data: [] },
                (hasPermission('Acessar Projetos') || hasPermission('Acessar Clientes')) ? supabase.from('projetos').select('id, nome, servico, servicos, empresa:finance_parties(name)').ilike('nome', like).limit(6) : { data: [] },
                hasPermission('Acessar Prospecção') ? supabase.from('prospeccao_leads').select('id, nome, categoria, cidade, status')
                    .or(`nome.ilike.${like},categoria.ilike.${like}${digitos.length >= 4 ? `,telefone.ilike.%${digitos.slice(-4)}%` : ''}`)
                    .is('party_id', null).limit(6) : { data: [] },
            ]);
            const podeAbrirCliente = hasPermission('Acessar Clientes');
            setResultados([
                ...(emp.data || []).map((e) => ({ id: `emp:${e.id}`, tipo: 'Empresa', icone: Building2, titulo: e.name, sub: e.nome_fantasia || (e.kind === 'LEAD' ? 'Em negociação' : e.kind === 'FORNECEDOR' ? 'Fornecedor' : 'Cliente'), destino: podeAbrirCliente ? `/clientes/${e.id}` : '/finance/transacoes' })),
                ...(ops.data || []).map((o) => ({ id: `op:${o.id}`, tipo: 'Oportunidade', icone: Target, titulo: o.titulo, sub: `${rotuloServicos(o)} · ${o.empresa?.name || ''}`, destino: `/vendas?abrir=${o.id}` })),
                ...(prosp.data || []).map((l) => ({ id: `prosp:${l.id}`, tipo: 'Prospecção', icone: Radar, titulo: l.nome, sub: [statusProspeccao(l.status).label, l.categoria, l.cidade].filter(Boolean).join(' · '), destino: `/prospeccao?abrir=${l.id}` })),
                ...(projs.data || []).map((p) => ({ id: `proj:${p.id}`, tipo: 'Projeto', icone: FolderKanban, titulo: p.nome, sub: `${rotuloServicos(p)} · ${p.empresa?.name || ''}`, destino: `/projetos/${p.id}` })),
            ]);
            setSel(0);
            setBuscando(false);
        }, 220);
        return () => clearTimeout(t);
    }, [termo, aberta, hasPermission]);

    const q = termo.trim();
    const lista = q.length < 2
        ? modulos
        : [...resultados, ...modulos.filter((m) => norm(m.titulo).includes(norm(q)))];

    const ir = (item) => { setAberta(false); navigate(item.destino); };

    const onKey = (e) => {
        if (e.key === 'Escape') setAberta(false);
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
        else if (e.key === 'Enter' && lista[sel]) ir(lista[sel]);
    };

    if (!aberta) return null;

    return (
        <div className="fixed inset-0 z-[12000] flex items-start justify-center pt-[12vh] px-4" onKeyDown={onKey}>
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setAberta(false)} />
            <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-black/[.06] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-3 px-4 h-14 border-b border-black/[.06]">
                    <Search size={18} className="text-slate-400" />
                    <input ref={inputRef} autoFocus value={termo} onChange={(e) => setTermo(e.target.value)}
                        placeholder="Buscar cliente, lead, oportunidade, projeto ou módulo…"
                        className="flex-1 bg-transparent outline-none text-[14px] font-semibold text-slate-800 placeholder:text-slate-400" />
                    {buscando && <Loader2 size={16} className="animate-spin text-slate-300" />}
                    <kbd className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
                </div>
                <div className="max-h-[50vh] overflow-y-auto p-1.5">
                    {lista.length === 0 ? (
                        <p className="py-8 text-center text-[12px] font-semibold text-slate-400">{q.length < 2 ? 'Digite para buscar' : 'Nada encontrado'}</p>
                    ) : lista.map((item, i) => {
                        const Icone = item.icone;
                        return (
                            <button key={item.id} onMouseEnter={() => setSel(i)} onClick={() => ir(item)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left ${i === sel ? 'bg-indigo-50' : ''}`}>
                                <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                    {Icone ? <Icone size={15} /> : <CornerDownLeft size={14} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-bold text-slate-800 truncate">{item.titulo}</span>
                                    {item.sub && <span className="block text-[11px] font-semibold text-slate-400 truncate">{item.sub}</span>}
                                </span>
                                <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">{item.tipo}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
