import React from 'react';

/**
 * Marcos de tempo do procedimento, no mesmo desenho do protótipo de referência:
 * entrada em sala, anestesia e cirurgia, cada um com o horário editável e um
 * atalho para carimbar o relógio.
 *
 * O início da anestesia é o que ancora a linha do tempo — mudá-lo aqui redesenha
 * a grade, sem tocar em nenhum registro.
 */

import { CAMPOS_HORARIO, paraHoraLocal, paraIso } from '../../utils/fichaAnestesica/vocabulario';

export default function BarraHorarios({ horarios, onAlterar, isReadOnly }) {
    const referencia = horarios.inicioAnestesia || horarios.entradaSala || null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {CAMPOS_HORARIO.map(({ campo, rotulo, acao, destaque, perigo }) => {
                const valor = horarios[campo];
                return (
                    <div
                        key={campo}
                        className={`flex items-center gap-2 px-3 h-10 rounded-xl bg-white border shadow-sm ${destaque && !valor ? 'border-emerald-400' : 'border-slate-200'}`}
                    >
                        <span className="text-[11px] font-black text-slate-700 leading-tight flex-1 min-w-0">{rotulo}</span>
                        <input
                            type="time"
                            disabled={isReadOnly}
                            value={paraHoraLocal(valor)}
                            onChange={(e) => onAlterar(campo, paraIso(e.target.value, referencia))}
                            className="w-[74px] px-1 py-0.5 text-[11px] font-bold text-slate-800 border border-slate-200 rounded-lg outline-none focus:border-blue-500 disabled:opacity-70 shrink-0"
                        />
                        {!isReadOnly && !valor && (
                            <button
                                type="button"
                                onClick={() => onAlterar(campo, new Date().toISOString())}
                                className={`px-2 py-1 text-[10px] font-black uppercase rounded-lg text-white shrink-0 ${perigo ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-700 hover:bg-teal-800'}`}
                            >
                                {acao}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
