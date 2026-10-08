import React, { useState } from 'react';
import { ChevronDown, Copy, MessageCircle, MessagesSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { ROTEIROS, OBJECOES, preencherRoteiro } from '../../config/roteiros';
import { linkWhats } from '../../config/prospeccao';

const copiar = async (texto) => {
    try { await navigator.clipboard.writeText(texto); toast.success('Roteiro copiado.'); }
    catch { toast.error('Não copiou. Selecione o texto e copie.'); }
};

/**
 * Roteiros de abordagem (src/config/roteiros.js). Com `lead`, o nome da
 * empresa já vem preenchido e "Mandar no WhatsApp" abre a conversa com o
 * texto pronto; `onContato('WhatsApp')` registra a tentativa (menos no teste
 * noturno, que é você se passando por paciente).
 */
export default function Roteiros({ lead, onContato, comObjecoes = false }) {
    const [aberto, setAberto] = useState(null);
    const whats = lead ? linkWhats(lead.telefone) : null;

    return (
        <div className="space-y-1.5">
            {ROTEIROS.map((r) => {
                const on = aberto === r.id;
                const texto = preencherRoteiro(r.texto, lead);
                return (
                    <div key={r.id} className="bg-white border border-black/[.085] rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setAberto(on ? null : r.id)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50">
                            <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-bold text-slate-800">{r.titulo}</p>
                                <p className="text-[11px] font-semibold text-slate-400 truncate">{r.quando}</p>
                            </div>
                            <ChevronDown size={15} className={`text-slate-400 shrink-0 transition-transform ${on ? 'rotate-180' : ''}`} />
                        </button>
                        {on && (
                            <div className="px-3 pb-3 space-y-2">
                                {r.dica && <p className="text-[11.5px] font-medium text-slate-500">{r.dica}</p>}
                                <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap break-words bg-slate-50 border-l-2 border-[#0071e3] rounded-r-lg px-3 py-2">{texto}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    <button type="button" onClick={() => copiar(texto)}
                                        className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                                        <Copy size={13} /> Copiar
                                    </button>
                                    {r.whats && whats && (
                                        <a href={`${whats}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"
                                            onClick={() => r.conta && onContato?.('WhatsApp')}
                                            className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5">
                                            <MessageCircle size={13} /> Mandar no WhatsApp
                                        </a>
                                    )}
                                </div>
                                {/\[[^\]]+\]/.test(texto) && (
                                    <p className="text-[10.5px] font-semibold text-amber-600">Complete o que está entre [colchetes] antes de mandar.</p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {comObjecoes && (
                <div className="bg-white border border-black/[.085] rounded-xl p-3 mt-3">
                    <p className="text-[12.5px] font-bold text-slate-800 flex items-center gap-1.5 mb-2"><MessagesSquare size={14} /> Objeções mais comuns</p>
                    <dl className="space-y-2">
                        {OBJECOES.map((o) => (
                            <div key={o.pergunta}>
                                <dt className="text-[12px] font-bold text-slate-700">"{o.pergunta}"</dt>
                                <dd className="text-[12px] text-slate-500">{o.resposta}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </div>
    );
}
