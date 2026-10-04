import React from 'react';
import { Star, MessageCircle, Phone, Globe, Instagram, MapPin } from 'lucide-react';
import { linkWhats, linkSite, linkInstagram, linkMaps, soDigitos } from '../../config/prospeccao';

/** Três estrelas de prioridade. Clicar na estrela acesa de maior valor zera. */
export const Estrelas = ({ valor = 0, onChange, tamanho = 13 }) => (
    <span className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
        {[1, 2, 3].map((n) => (
            <button key={n} type="button" disabled={!onChange} title={`Prioridade ${n}`}
                onClick={() => onChange?.(valor === n ? 0 : n)}
                className="p-0.5 disabled:cursor-default">
                <Star size={tamanho} className={n <= valor ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
            </button>
        ))}
    </span>
);

/**
 * Atalhos de contato do lead. `onContato(canal)` é chamado ao abrir WhatsApp
 * ou ligação — quem usa registra a tentativa.
 */
export const Contatos = ({ lead, onContato, grande = false }) => {
    const whats = linkWhats(lead.telefone);
    const fone = soDigitos(lead.telefone);
    const itens = [
        whats && { href: whats, icone: MessageCircle, titulo: 'WhatsApp', canal: 'WhatsApp', cor: 'text-emerald-600 hover:bg-emerald-50' },
        fone && { href: `tel:${fone}`, icone: Phone, titulo: `Ligar: ${lead.telefone}`, canal: 'ligação', cor: 'text-slate-600 hover:bg-slate-100' },
        lead.site && { href: linkSite(lead.site), icone: Globe, titulo: lead.site, cor: 'text-sky-600 hover:bg-sky-50' },
        lead.instagram && { href: linkInstagram(lead.instagram), icone: Instagram, titulo: lead.instagram, cor: 'text-pink-600 hover:bg-pink-50' },
        linkMaps(lead) && { href: linkMaps(lead), icone: MapPin, titulo: 'Abrir no Google Maps', cor: 'text-rose-500 hover:bg-rose-50' },
    ].filter(Boolean);
    const cls = grande ? 'h-10 px-3 gap-1.5 rounded-xl border border-black/[.085] bg-white text-xs font-bold' : 'w-7 h-7 justify-center rounded-lg';
    return (
        <span className={`inline-flex items-center ${grande ? 'flex-wrap gap-2' : 'gap-0.5'}`} onClick={(e) => e.stopPropagation()}>
            {itens.map((it) => (
                <a key={it.titulo} href={it.href} target="_blank" rel="noreferrer" title={it.titulo}
                    onClick={() => it.canal && onContato?.(it.canal)}
                    className={`inline-flex items-center transition-colors ${cls} ${it.cor}`}>
                    <it.icone size={grande ? 16 : 14} />
                    {grande && <span>{it.titulo.length > 26 ? `${it.titulo.slice(0, 24)}…` : it.titulo}</span>}
                </a>
            ))}
            {itens.length === 0 && <span className="text-[11px] text-slate-300 font-semibold">sem contato</span>}
        </span>
    );
};

/** Nota do Google com o número de avaliações. */
export const NotaGoogle = ({ lead }) => (lead.nota_google == null ? <span className="text-slate-300">—</span> : (
    <span className="inline-flex items-center gap-1 tabular-nums font-bold text-slate-700">
        <Star size={11} className="fill-amber-400 text-amber-400" />
        {Number(lead.nota_google).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
        {lead.avaliacoes != null && <span className="font-semibold text-slate-400">({lead.avaliacoes})</span>}
    </span>
));
