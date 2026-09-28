import React, { useState } from 'react';
import { X, Loader2, Lock, AlertTriangle, Unlock } from 'lucide-react';

/**
 * Finalização (assinatura) e reabertura da ficha.
 *
 * Quem assina é sempre o usuário logado no momento. Depois de assinada a ficha
 * não é editada: para corrigir é preciso reabrir, e a reabertura fica
 * registrada com autor e motivo — o banco recusa reabrir sem isso.
 */
export default function DialogoFinalizar({ modo, assinante, pendentes, infusoesUsadas = [], consumo = {}, onAlterarConsumo, onConfirmar, onFechar }) {
    const [motivo, setMotivo] = useState('');
    const [processando, setProcessando] = useState(false);

    const reabertura = modo === 'reabrir';

    const confirmar = async () => {
        if (reabertura && !motivo.trim()) return;
        setProcessando(true);
        await onConfirmar(reabertura ? motivo.trim() : undefined);
        setProcessando(false);
    };

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1010] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
                        {reabertura ? <Unlock size={16} className="text-amber-600" /> : <Lock size={16} className="text-slate-600" />}
                        {reabertura ? 'Reabrir ficha finalizada' : 'Finalizar ficha'}
                    </h3>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-3">
                    {!reabertura && (
                        <>
                            <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                                A ficha será encerrada por <strong className="text-slate-900">{assinante || 'usuário não identificado'}</strong> e
                                passará a somente leitura. Correções posteriores exigem reabertura registrada.
                                A assinatura do anestesiologista é feita a caneta no documento impresso.
                            </p>

                            {/* Frascos abertos: é o que a farmácia confere e o que
                                vira custo. Só aparecem as infusões efetivamente usadas. */}
                            {infusoesUsadas.length > 0 && (
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                                        Consumo das infusões contínuas
                                    </p>
                                    {infusoesUsadas.map(parametro => (
                                        <div key={parametro.codigo} className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-slate-700 truncate">{parametro.rotulo}</p>
                                                {parametro.apresentacao && (
                                                    <p className="text-[10px] font-semibold text-slate-400 truncate">{parametro.apresentacao}</p>
                                                )}
                                            </div>
                                            {parametro.diluicao_padrao != null && (
                                                <input
                                                    type="number"
                                                    value={consumo[parametro.codigo]?.diluicao ?? parametro.diluicao_padrao}
                                                    onChange={e => onAlterarConsumo?.(parametro.codigo, { diluicao: e.target.value })}
                                                    title={`Diluição em ${parametro.diluicao_unidade || ''}`}
                                                    className="w-[70px] px-2 py-1 text-[11px] font-bold text-right bg-white border border-slate-300 rounded"
                                                />
                                            )}
                                            <span className="text-[10px] font-bold text-slate-400 w-[46px]">{parametro.diluicao_unidade || ''}</span>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="frascos"
                                                value={consumo[parametro.codigo]?.frascos ?? ''}
                                                onChange={e => onAlterarConsumo?.(parametro.codigo, { frascos: e.target.value })}
                                                className="w-[80px] px-2 py-1 text-[11px] font-bold text-right bg-white border border-slate-300 rounded"
                                            />
                                        </div>
                                    ))}
                                    <p className="text-[10px] font-semibold text-slate-400">
                                        Informe apenas os frascos ou ampolas abertos neste procedimento.
                                    </p>
                                </div>
                            )}

                            {pendentes > 0 && (
                                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                    <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-[11px] font-bold text-amber-900">
                                        Há {pendentes} registro(s) ainda não enviados. Reconecte antes de encerrar — o que está
                                        no aparelho precisa entrar na ficha primeiro.
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {reabertura && (
                        <>
                            <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                                A reabertura fica registrada na ficha, com seu nome, a data e o motivo informado.
                                Ao encerrar de novo, o responsável registrado passa a ser quem estiver logado.
                            </p>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Motivo da reabertura *</label>
                                <textarea
                                    value={motivo}
                                    onChange={e => setMotivo(e.target.value)}
                                    rows={3}
                                    autoFocus
                                    placeholder="Ex.: corrigir dose de fentanil registrada às 09:15"
                                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                    <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button
                        onClick={confirmar}
                        disabled={processando || (reabertura ? !motivo.trim() : pendentes > 0)}
                        className={`flex items-center gap-2 px-5 py-2 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 ${reabertura ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-800 hover:bg-slate-900'}`}
                    >
                        {processando && <Loader2 size={14} className="animate-spin" />}
                        {reabertura ? 'Reabrir ficha' : 'Encerrar ficha'}
                    </button>
                </div>
            </div>
        </div>
    );
}
