import React from 'react';
import { Lock } from 'lucide-react';
import { calcularImc } from '../../utils/fichaAnestesica/prefill';
import { TECNICAS_ANESTESICAS } from '../../utils/fichaAnestesica/vocabulario';

/**
 * Cabeçalho da ficha anestésica, no desenho da ficha de papel: uma faixa fina,
 * campos em linha, sem seção nenhuma abrindo espaço.
 *
 * A ficha em papel mostra o que o anestesista precisa **de relance, em sala**:
 * quem é o paciente, peso, alergia, qual cirurgia e qual técnica. Todo o resto
 * que veio da APA — via aérea prevista, plano, comorbidades, jejum, medicamentos
 * de uso contínuo — continua guardado na ficha e a um toque de distância no
 * botão "Ver APA", mas não ocupa a tela: em sala, tela ocupada é tempo perdido.
 *
 * Nada aqui é campo obrigatório e nada é travado: o peso muda no dia e a técnica
 * planejada nem sempre é a executada.
 */

const pilula = 'flex items-center gap-2 px-3 h-9 rounded-xl bg-white border border-slate-200 shadow-sm';
const etiqueta = 'text-[9px] font-black text-slate-400 uppercase tracking-wide shrink-0';
const entrada = 'flex-1 min-w-0 bg-transparent text-xs font-bold text-slate-800 outline-none disabled:opacity-70';

export default function CabecalhoFicha({ cabecalho, onChange, isReadOnly }) {
    const dados = cabecalho || {};
    const tecnicas = Array.isArray(dados.tecnicas) ? dados.tecnicas : [];

    const alterar = (campo, valor) => onChange({ ...dados, [campo]: valor });

    const alternarTecnica = (tecnica) => {
        const marcadas = tecnicas.includes(tecnica)
            ? tecnicas.filter(item => item !== tecnica)
            : [...tecnicas, tecnica];
        onChange({ ...dados, tecnicas: marcadas });
    };

    const imc = calcularImc(dados.peso, dados.altura);

    const campo = (rotulo, valor, aoMudar, largura) => (
        <div className={`${pilula} ${largura}`}>
            <span className={etiqueta}>{rotulo}</span>
            <input disabled={isReadOnly} value={valor ?? ''} onChange={e => aoMudar(e.target.value)} className={entrada} />
        </div>
    );

    return (
        <div className="space-y-2">
            {isReadOnly && (
                <div className="flex items-center gap-2 px-3 h-8 rounded-xl bg-slate-100 border border-slate-200">
                    <Lock size={13} className="text-slate-500 shrink-0" />
                    <p className="text-[11px] font-bold text-slate-600">Somente leitura.</p>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-12 gap-2">
                {campo('Paciente', dados.paciente, v => alterar('paciente', v), 'col-span-2 md:col-span-4')}
                {campo('Idade', dados.idade, v => alterar('idade', v), 'md:col-span-1')}
                {campo('Peso', dados.peso, v => alterar('peso', v), 'md:col-span-1')}
                {campo('Altura', dados.altura, v => alterar('altura', v), 'md:col-span-1')}
                <div className={`${pilula} md:col-span-1`}>
                    <span className={etiqueta}>IMC</span>
                    <span className="text-xs font-bold text-slate-500">{imc ?? '--'}</span>
                </div>
                {campo('Alergias', dados.alergias, v => alterar('alergias', v), 'col-span-2 md:col-span-4')}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                {campo('Cirurgia', dados.procedimento, v => alterar('procedimento', v), 'md:col-span-4')}

                <div className={`${pilula} md:col-span-8 h-auto min-h-9 py-1.5 flex-wrap`}>
                    <span className={etiqueta}>Anestesia</span>
                    {TECNICAS_ANESTESICAS.map(tecnica => (
                        <label
                            key={tecnica}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border cursor-pointer transition-colors
                                ${tecnicas.includes(tecnica) ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'}
                                ${isReadOnly ? 'cursor-default opacity-80' : ''}`}
                        >
                            <input
                                type="checkbox"
                                disabled={isReadOnly}
                                checked={tecnicas.includes(tecnica)}
                                onChange={() => alternarTecnica(tecnica)}
                                className="w-3.5 h-3.5 rounded"
                            />
                            <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">{tecnica}</span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
