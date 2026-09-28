import React, { useState } from 'react';
import { AlertTriangle, Info, ChevronDown, CornerDownRight, EyeOff, ShieldQuestion } from 'lucide-react';

/**
 * Alertas de conduta pré-operatória de UM medicamento da APA.
 *
 * Fica ancorado na linha que o gerou — é o que diferencia do bloco solto de
 * alertas: o médico vê "metformina → considerar suspensão no dia" junto do
 * campo que acabou de digitar.
 */
export default function AlertaCondutaMedicamento({ avaliacao, onAplicarConduta, isReadOnly }) {
    const [abertos, setAbertos] = useState({});
    const [mostrarOcultos, setMostrarOcultos] = useState(false);

    const alertas = avaliacao?.alertas || [];
    const ocultos = avaliacao?.ocultosPorContexto || [];
    if (alertas.length === 0 && ocultos.length === 0) return null;

    const alternar = (chave) => setAbertos(atual => ({ ...atual, [chave]: !atual[chave] }));

    const renderAlerta = (alerta, chave, atenuado = false) => {
        const grave = alerta.nivel === 'alta';
        const aberto = !!abertos[chave];
        const Icone = grave ? AlertTriangle : Info;

        const cores = atenuado
            ? 'border-slate-300 bg-slate-50/80 text-slate-600'
            : grave
                ? 'border-rose-400 bg-rose-50/90 text-rose-900'
                : 'border-amber-400 bg-amber-50/90 text-amber-900';

        return (
            <div key={chave} className={`rounded-lg border-l-4 shadow-sm ${cores}`}>
                <div className="flex items-start gap-2 p-2">
                    <button
                        type="button"
                        onClick={() => alternar(chave)}
                        className="flex-1 flex items-start gap-2 text-left min-w-0"
                    >
                        <Icone size={14} className="shrink-0 mt-0.5" />
                        <span className="flex-1 min-w-0">
                            <span className="text-[11px] font-black uppercase tracking-wide">{alerta.classe}</span>
                            <span className="mx-1.5 opacity-40">·</span>
                            <span className="text-[11px] font-bold">{alerta.conduta}</span>
                        </span>
                        <ChevronDown size={14} className={`shrink-0 mt-0.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                    </button>
                    {!isReadOnly && !atenuado && (
                        <button
                            type="button"
                            onClick={() => onAplicarConduta?.(alerta.conduta)}
                            title="Preencher o campo de conduta desta linha com a orientação sugerida"
                            className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase rounded-md bg-white/80 border border-white shadow-sm hover:bg-white transition-all"
                        >
                            <CornerDownRight size={11} /> Aplicar
                        </button>
                    )}
                </div>

                {aberto && (
                    <div className="px-3 pb-2.5 pt-0.5 space-y-1.5">
                        <p className="text-[11px] leading-relaxed font-medium">{alerta.texto}</p>

                        {alerta.detalheClCr && (
                            <p className="text-[10px] font-bold opacity-80">{alerta.detalheClCr}</p>
                        )}

                        {alerta.referencia && (
                            <p className="text-[10px] italic opacity-70">Fonte: {alerta.referencia}</p>
                        )}

                        {!alerta.revisado && (
                            <p className="flex items-start gap-1 text-[10px] font-bold text-slate-500">
                                <ShieldQuestion size={11} className="shrink-0 mt-px" />
                                Orientação ainda não revisada por anestesista responsável. Confirme antes de usar.
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full pl-1 pr-1 pb-1 space-y-1.5">
            {alertas.map((alerta, i) => renderAlerta(alerta, `a-${i}`))}

            {ocultos.length > 0 && (
                <div className="space-y-1.5">
                    <button
                        type="button"
                        onClick={() => setMostrarOcultos(v => !v)}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700"
                    >
                        <EyeOff size={11} />
                        {ocultos.length === 1
                            ? '1 orientação de neuroeixo oculta — o plano não prevê punção'
                            : `${ocultos.length} orientações de neuroeixo ocultas — o plano não prevê punção`}
                        <ChevronDown size={11} className={`transition-transform ${mostrarOcultos ? 'rotate-180' : ''}`} />
                    </button>
                    {mostrarOcultos && ocultos.map((alerta, i) => renderAlerta(alerta, `o-${i}`, true))}
                </div>
            )}
        </div>
    );
}
