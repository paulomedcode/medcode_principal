import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, UserSearch, Building2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { statusProspeccao } from '../../config/prospeccao';
import { TIPOS_EMPRESA } from '../../config/servicos';

/*
 * "Já existe?" — enquanto a pessoa digita um cadastro novo (lead ou empresa),
 * procura na Prospecção e em Clientes/Vendas por nome parecido, mesmo
 * telefone, Instagram ou CNPJ. Só avisa: não impede de salvar.
 */

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const espremido = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const digitos = (s) => String(s || '').replace(/\D/g, '');
const arroba = (s) => norm(s).replace(/^.*instagram\.com\//, '').replace(/[@/\s]/g, '');

// Palavras que não ajudam a achar ninguém ("Clínica", "de", "Ltda"…).
const VAZIAS = new Set(['clinica', 'consultorio', 'odontologia', 'odonto', 'centro', 'instituto', 'ltda', 'eireli', 'me', 'dr', 'dra', 'de', 'da', 'do', 'das', 'dos', 'e']);

// Para o ilike achar com ou sem acento, troca as vogais por "_" (qualquer letra).
const padrao = (palavra) => `%${palavra.replace(/[aeiou]/g, '_')}%`;

function palavrasChave(nome) {
    return [...new Set(norm(nome).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !VAZIAS.has(p)))].slice(0, 4);
}

function parecido(nomeA, nomeB) {
    const a = espremido(nomeA);
    const b = espremido(nomeB);
    if (a.length < 3 || b.length < 3) return false;
    if (a === b || b.includes(a) || (a.length >= 5 && a.includes(b))) return true;
    // Todas as palavras importantes do que foi digitado aparecem no outro nome.
    const ps = palavrasChave(nomeA);
    return ps.length > 0 && ps.every((p) => b.includes(p));
}

async function procurar({ nome, telefone, instagram, documento }) {
    const ps = palavrasChave(nome);
    const fone = digitos(telefone).slice(-8);
    const insta = arroba(instagram);
    const doc = digitos(documento);

    const filtrosLead = ps.map((p) => `nome.ilike.${padrao(p)}`);
    const filtrosEmp = ps.flatMap((p) => [`name.ilike.${padrao(p)}`, `nome_fantasia.ilike.${padrao(p)}`]);
    if (fone.length === 8) {
        filtrosLead.push(`telefone.ilike.%${fone.slice(-4)}%`);
        filtrosEmp.push(`telefone.ilike.%${fone.slice(-4)}%`);
    }
    if (insta.length >= 3) {
        filtrosLead.push(`instagram.ilike.%${insta}%`);
        filtrosEmp.push(`instagram.ilike.%${insta}%`);
    }
    if (doc.length >= 11) filtrosEmp.push(`document.ilike.%${doc.slice(-6)}%`);
    if (!filtrosLead.length && !filtrosEmp.length) return [];

    const [leads, emps] = await Promise.all([
        filtrosLead.length
            ? supabase.from('prospeccao_leads').select('id, nome, telefone, instagram, cidade, uf, status, party_id').or(filtrosLead.join(',')).limit(60)
            : { data: [] },
        filtrosEmp.length
            ? supabase.from('finance_parties').select('id, name, nome_fantasia, telefone, instagram, document, cidade, uf, kind').or(filtrosEmp.join(',')).limit(60)
            : { data: [] },
    ]);

    const bate = (r, nomes) => {
        const porNome = nomes.some((n) => parecido(nome, n));
        const porFone = fone.length === 8 && digitos(r.telefone).endsWith(fone);
        const porInsta = insta.length >= 3 && arroba(r.instagram) === insta;
        const porDoc = doc.length >= 11 && digitos(r.document) === doc;
        const motivo = porDoc ? 'mesmo CNPJ/CPF' : porFone ? 'mesmo telefone' : porInsta ? 'mesmo Instagram' : porNome ? 'nome parecido' : null;
        return motivo;
    };

    const achados = [];
    const partiesDeLeads = new Set();
    (leads.data || []).forEach((l) => {
        const motivo = bate(l, [l.nome]);
        if (!motivo) return;
        if (l.party_id) partiesDeLeads.add(l.party_id);
        const st = statusProspeccao(l.status);
        achados.push({
            chave: `l-${l.id}`, tipo: 'lead', nome: l.nome, motivo, local: [l.cidade, l.uf].filter(Boolean).join(' / '),
            onde: l.status === 'CONVERTIDO' ? 'Prospecção · já foi para o Vendas' : `Prospecção · ${st.label}`,
            url: `/prospeccao?abrir=${l.id}`,
        });
    });
    (emps.data || []).forEach((e) => {
        const motivo = bate(e, [e.name, e.nome_fantasia]);
        if (!motivo || partiesDeLeads.has(e.id)) return;   // já mostrado pelo lead que virou essa empresa
        const tipo = TIPOS_EMPRESA.find((t) => t.id === e.kind);
        achados.push({
            chave: `e-${e.id}`, tipo: 'empresa', nome: e.nome_fantasia && e.nome_fantasia !== e.name ? `${e.name} (${e.nome_fantasia})` : e.name,
            motivo, local: [e.cidade, e.uf].filter(Boolean).join(' / '),
            onde: `Clientes · ${tipo?.label || e.kind}`, url: `/clientes/${e.id}`,
        });
    });
    // Os mais fortes primeiro (documento/telefone antes de nome parecido).
    const peso = { 'mesmo CNPJ/CPF': 0, 'mesmo telefone': 1, 'mesmo Instagram': 2, 'nome parecido': 3 };
    return achados.sort((a, b) => peso[a.motivo] - peso[b.motivo]).slice(0, 5);
}

/**
 * Aviso de cadastro repetido. `onIr` roda antes de abrir o achado (para fechar
 * a janela de cadastro).
 */
export default function JaExiste({ nome = '', telefone = '', instagram = '', documento = '', onIr }) {
    const navigate = useNavigate();
    const [achados, setAchados] = useState([]);
    const temAlgo = espremido(nome).length >= 3 || digitos(telefone).length >= 8 || arroba(instagram).length >= 3 || digitos(documento).length >= 11;

    useEffect(() => {
        if (!temAlgo) return undefined;
        let vivo = true;
        const t = setTimeout(() => {
            procurar({ nome, telefone, instagram, documento })
                .then((r) => { if (vivo) setAchados(r); })
                .catch((e) => console.warn('[ja-existe]', e.message));
        }, 350);
        return () => { vivo = false; clearTimeout(t); };
    }, [temAlgo, nome, telefone, instagram, documento]);

    if (!temAlgo || !achados.length) return null;

    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-800 mb-1.5">
                <AlertTriangle size={13} /> Já tem cadastro parecido. Confira antes de salvar:
            </p>
            <div className="space-y-1">
                {achados.map((a) => {
                    const Icone = a.tipo === 'lead' ? UserSearch : Building2;
                    return (
                        <button key={a.chave} type="button" onClick={() => { onIr?.(); navigate(a.url); }}
                            className="w-full flex items-center gap-2 text-left rounded-md bg-white/70 hover:bg-white border border-amber-100 px-2 py-1.5">
                            <Icone size={13} className="text-slate-400 shrink-0" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[12.5px] font-medium text-slate-800 truncate">{a.nome}</span>
                                <span className="block text-[11px] text-slate-500 truncate">
                                    {a.onde}{a.local ? ` · ${a.local}` : ''} · {a.motivo}
                                </span>
                            </span>
                            <ChevronRight size={14} className="text-slate-300 shrink-0" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
