import React, { useState } from 'react';
import { MessageCircle, CheckCircle2, CalendarClock, PauseCircle, Loader2, PlayCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { TOQUES, toqueDaVez, textoDoToque, hojeISO, diasEntre } from '../../config/cadencia';
import { linkWhats } from '../../config/prospeccao';
import { iniciarCadencia, registrarToque, marcarRespondeu, pararCadencia } from '../../services/prospeccao';
import { useAuth } from '../../contexts/AuthContext';
import { textareaCls, inputCls } from '../crm/ui';

const fmt = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');
// Dia do último contato no fuso do computador (o ISO do banco vem em UTC).
const diaDoContato = (lead) => {
    if (!lead.ultimo_contato_em) return hojeISO();
    const d = new Date(lead.ultimo_contato_em);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Cadência de acompanhamento do lead (src/config/cadencia.js): mostra o toque
 * da vez com o texto pronto para revisar e mandar no WhatsApp. Mandar conta
 * como tentativa e agenda o próximo; "Respondeu" encerra a cadência.
 * Fica na ficha do lead e no aviso de "Meu dia".
 */
export default function Acompanhamento({ lead, onAlterado, podeEditar = true }) {
    const { currentUser } = useAuth();
    const toque = toqueDaVez(lead);
    const [texto, setTexto] = useState(() => (toque ? textoDoToque(toque, lead) : ''));
    const [chave, setChave] = useState(`${lead.id}:${lead.cadencia_etapa}`);
    const [inicio, setInicio] = useState(lead.cadencia_inicio || diaDoContato(lead));
    const [ocupado, setOcupado] = useState(null);

    // Trocou de lead ou de toque: o texto volta ao padrão do novo toque.
    const chaveAtual = `${lead.id}:${lead.cadencia_etapa}`;
    if (chave !== chaveAtual) {
        setChave(chaveAtual);
        setTexto(toque ? textoDoToque(toque, lead) : '');
        setInicio(lead.cadencia_inicio || diaDoContato(lead));
    }

    const executar = async (nome, fn, aviso) => {
        setOcupado(nome);
        try { onAlterado(await fn()); if (aviso) toast.success(aviso); }
        catch (e) { console.error(e); toast.error(e.code === '42501' ? 'Sem permissão para alterar.' : 'Não salvou. Tente de novo.'); }
        finally { setOcupado(null); }
    };

    const whats = linkWhats(lead.telefone);
    const esperando = ['CONTATADO', 'SEM_RESPOSTA'].includes(lead.status);

    if (!toque) {
        if (!esperando || !podeEditar) return null;
        return (
            <section className="bg-white border border-black/[.085] rounded-2xl p-3 space-y-2">
                <p className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5"><PlayCircle size={15} className="text-indigo-500" /> Acompanhamento</p>
                <p className="text-[11.5px] font-semibold text-slate-500">
                    Toques automáticos 2, 5 e 10 dias depois da abordagem, com a mensagem pronta em "Meu dia".
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-slate-500">Abordagem enviada em</span>
                    <input type="date" value={inicio} max={hojeISO()} onChange={(e) => setInicio(e.target.value)} className={`${inputCls} !w-40`} />
                    <button onClick={() => executar('iniciar', () => iniciarCadencia(lead, inicio || hojeISO(), currentUser?.id), 'Acompanhamento ligado.')}
                        disabled={!!ocupado}
                        className="h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50">
                        {ocupado === 'iniciar' ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />} Começar acompanhamento
                    </button>
                </div>
            </section>
        );
    }

    const hoje = hojeISO();
    const vence = lead.proximo_contato_em;
    const passou = lead.cadencia_inicio ? diasEntre(lead.cadencia_inicio, hoje) : null;
    const situacao = !vence ? '' : vence < hoje ? `atrasado desde ${fmt(vence)}` : vence === hoje ? 'é hoje' : `em ${fmt(vence)}`;
    const corSituacao = vence && vence <= hoje ? 'text-rose-600' : 'text-slate-400';

    return (
        <section className="bg-white border border-indigo-200 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-start gap-2">
                <CalendarClock size={16} className="text-indigo-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">
                        {toque.titulo} <span className="text-slate-400 font-semibold">· toque {lead.cadencia_etapa + 1} de {TOQUES.length}</span>
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                        {passou != null && `Abordado há ${passou} dia(s) (${fmt(lead.cadencia_inicio)})`}
                        {situacao && <> · <span className={corSituacao}>toque do dia {toque.dias} {situacao}</span></>}
                    </p>
                </div>
            </div>

            <textarea rows={4} value={texto} disabled={!podeEditar} onChange={(e) => setTexto(e.target.value)} className={textareaCls} />

            {podeEditar && (
                <div className="flex flex-wrap gap-1.5">
                    {whats ? (
                        <a href={`${whats}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"
                            onClick={() => executar('toque', () => registrarToque(lead, currentUser?.id),
                                toque.encerra ? 'Enviado. Lead encerrado como "Sem resposta".' : 'Enviado. Próximo toque agendado.')}
                            className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-bold flex items-center gap-1.5">
                            {ocupado === 'toque' ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} Mandar no WhatsApp
                        </a>
                    ) : (
                        <button onClick={() => executar('toque', () => registrarToque(lead, currentUser?.id), 'Marcado como enviado.')}
                            disabled={!!ocupado} title="Este lead não tem telefone: copie o texto e mande por onde preferir"
                            className="h-9 px-3 rounded-lg bg-slate-900 text-white text-[11.5px] font-bold flex items-center gap-1.5 disabled:opacity-50">
                            <CheckCircle2 size={14} /> Já mandei
                        </button>
                    )}
                    <button onClick={() => executar('respondeu', () => marcarRespondeu(lead), 'Boa! Acompanhamento encerrado.')}
                        disabled={!!ocupado}
                        className="h-9 px-3 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 text-[11.5px] font-bold flex items-center gap-1.5 disabled:opacity-50">
                        {ocupado === 'respondeu' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Respondeu
                    </button>
                    <button onClick={() => executar('parar', () => pararCadencia(lead, currentUser?.id), 'Acompanhamento parado.')}
                        disabled={!!ocupado} title="Para os toques deste lead (o status não muda)"
                        className="ml-auto h-9 px-2.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50">
                        <PauseCircle size={14} /> Parar
                    </button>
                </div>
            )}
            {!whats && <p className="text-[10.5px] font-semibold text-amber-600">Sem telefone cadastrado: copie o texto e mande por onde preferir.</p>}
        </section>
    );
}

/** O mesmo painel numa janela, para abrir direto do aviso em "Meu dia". */
export function ModalAcompanhamento({ lead, onAlterado, onClose, onAbrirFicha }) {
    return (
        <div className="fixed inset-0 z-[11000] flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
            <div className="relative w-full md:max-w-lg bg-[#f5f5f7] rounded-t-2xl md:rounded-2xl shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3">
                <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold text-slate-900 truncate">{lead.nome}</p>
                        <p className="text-[11.5px] font-semibold text-slate-400 truncate">{[lead.categoria, lead.cidade].filter(Boolean).join(' · ')}</p>
                    </div>
                    {onAbrirFicha && (
                        <button onClick={onAbrirFicha} className="h-8 px-2.5 rounded-lg bg-white border border-black/[.085] text-[11px] font-bold text-slate-600 hover:border-slate-300">Ver ficha</button>
                    )}
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 bg-white rounded-lg"><X size={16} /></button>
                </div>
                <Acompanhamento lead={lead} onAlterado={onAlterado} />
            </div>
        </div>
    );
}
