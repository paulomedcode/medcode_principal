import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PROCEDIMENTOS, CAMPOS_VENTILADOR, paraHoraLocal, paraIso } from '../../utils/fichaAnestesica/vocabulario';

/**
 * Procedimentos realizados, parâmetros do ventilador e destino do paciente —
 * as três seções do rodapé da ficha, no mesmo recorte do protótipo de
 * referência. Tudo isto alimenta a descrição do ato anestésico.
 *
 * O posicionamento saiu daqui: é informação do intraoperatório e passou a viver
 * dentro da grade, logo abaixo da monitorização, como na ficha de papel.
 */

const entrada = 'w-full px-2 py-1 text-[11px] font-semibold bg-white border border-slate-300 rounded outline-none focus:border-blue-500 disabled:opacity-70';
const rotuloCampo = 'block text-[9px] font-black text-slate-500 uppercase tracking-wide mb-0.5';

function Titulo({ children }) {
    return (
        <div className="px-3 py-1.5 rounded-t-lg text-[11px] font-black text-white uppercase tracking-wide"
            style={{ background: 'linear-gradient(100deg,#27466d,#41658e)' }}>
            {children}
        </div>
    );
}

export default function RodapeFicha({ dados, onAlterar, isReadOnly, referenciaHorario }) {
    const procedimentos = dados.procedimentos || {};
    const ventilador = dados.ventilador || {};
    const destino = dados.destino || {};

    const alterarProcedimento = (chave, alteracoes) => {
        onAlterar({ ...dados, procedimentos: { ...procedimentos, [chave]: { ...(procedimentos[chave] || {}), ...alteracoes } } });
    };

    const alternar = (chave) => {
        const atual = procedimentos[chave];
        if (atual?.realizado) {
            alterarProcedimento(chave, { realizado: false });
        } else {
            alterarProcedimento(chave, { realizado: true, horario: atual?.horario || new Date().toISOString() });
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Procedimentos ---------------------------------------------- */}
            <div className="rounded-lg border border-slate-300 bg-white overflow-hidden">
                <Titulo>Procedimentos realizados</Titulo>
                <div className="p-3 space-y-2">
                    {PROCEDIMENTOS.map(({ chave, rotulo, campos }) => {
                        const item = procedimentos[chave] || {};
                        return (
                            <div key={chave} className={`rounded-lg border p-2 ${item.realizado ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200'}`}>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        disabled={isReadOnly}
                                        checked={!!item.realizado}
                                        onChange={() => alternar(chave)}
                                        className="w-4 h-4 rounded"
                                    />
                                    <span className="flex-1 text-[11px] font-bold text-slate-700">{rotulo}</span>
                                    {item.realizado && (
                                        <input
                                            type="time"
                                            disabled={isReadOnly}
                                            value={paraHoraLocal(item.horario)}
                                            onChange={(e) => alterarProcedimento(chave, { horario: paraIso(e.target.value, referenciaHorario) })}
                                            className="w-[74px] px-1 py-0.5 text-[11px] font-bold border border-slate-300 rounded"
                                        />
                                    )}
                                </div>

                                {item.realizado && campos.length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                                        {campos.map(campo => (
                                            <div key={campo.nome}>
                                                <label className={rotuloCampo}>{campo.rotulo}</label>
                                                {campo.opcoes ? (
                                                    <select
                                                        disabled={isReadOnly}
                                                        value={item[campo.nome] || ''}
                                                        onChange={(e) => alterarProcedimento(chave, { [campo.nome]: e.target.value })}
                                                        className={entrada}
                                                    >
                                                        <option value="">—</option>
                                                        {campo.opcoes.map(opcao => <option key={opcao} value={opcao}>{opcao}</option>)}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={campo.tipo || 'text'}
                                                        disabled={isReadOnly}
                                                        value={item[campo.nome] || ''}
                                                        onChange={(e) => alterarProcedimento(chave, { [campo.nome]: e.target.value })}
                                                        className={entrada}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                </div>
            </div>

            <div className="space-y-4">
                {/* Ventilador --------------------------------------------- */}
                <div className="rounded-lg border border-slate-300 bg-white overflow-hidden">
                    <Titulo>Parâmetros do ventilador</Titulo>
                    <div className="p-3 grid grid-cols-3 gap-2">
                        {CAMPOS_VENTILADOR.map(campo => (
                            <div key={campo.nome}>
                                <label className={rotuloCampo}>{campo.rotulo}</label>
                                <input
                                    type={campo.tipo}
                                    disabled={isReadOnly}
                                    value={ventilador[campo.nome] ?? ''}
                                    placeholder={campo.padrao || ''}
                                    onChange={(e) => onAlterar({ ...dados, ventilador: { ...ventilador, [campo.nome]: e.target.value } })}
                                    className={entrada}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Destino ------------------------------------------------ */}
                <div className="rounded-lg border border-slate-300 bg-white overflow-hidden">
                    <Titulo>Encerramento e destino</Titulo>
                    <div className="p-3 space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {['SRPA', 'UTI', 'Enfermaria'].map(local => (
                                <button
                                    key={local}
                                    type="button"
                                    disabled={isReadOnly}
                                    onClick={() => onAlterar({ ...dados, destino: { ...destino, local } })}
                                    className={`px-4 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${destino.local === local ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                                >
                                    {local}
                                </button>
                            ))}
                        </div>

                        {destino.local && destino.local !== 'SRPA' && (
                            <div>
                                <label className={rotuloCampo}>Ventilação na transferência</label>
                                <div className="flex gap-2">
                                    {['ventilação espontânea', 'ventilação mecânica'].map(opcao => (
                                        <button
                                            key={opcao}
                                            type="button"
                                            disabled={isReadOnly}
                                            onClick={() => onAlterar({ ...dados, destino: { ...destino, ventilacao: opcao } })}
                                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border ${destino.ventilacao === opcao ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}
                                        >
                                            {opcao}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className={rotuloCampo}>Intercorrências / observações</label>
                            <textarea
                                disabled={isReadOnly}
                                value={destino.observacao || ''}
                                onChange={(e) => onAlterar({ ...dados, destino: { ...destino, observacao: e.target.value } })}
                                rows={2}
                                placeholder="Sem intercorrências"
                                className={entrada}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
