import React, { useRef, useState } from 'react';

/**
 * Gráfico hemodinâmico.
 *
 * Não guarda nada: desenha os mesmos eventos de PA e FC que já estão na grade.
 * Registrar a pressão numa linha e vê-la aparecer aqui é o comportamento
 * esperado — são a mesma informação em duas leituras.
 *
 * Registro por arrasto, como no protótipo de referência: com a ferramenta PA,
 * arrastar de cima para baixo dentro da coluna marca sistólica e diastólica de
 * uma vez; com FC, um toque marca o ponto. É mais rápido do que abrir diálogo a
 * cada aferição, que é o que se precisa em sala.
 *
 * A PAM é derivada, nunca digitada: (PAS + 2 × PAD) / 3.
 */

const ALTURA = 240;
const VALOR_MAXIMO = 220;
const PASSO_ESCALA = 20;

/** Faixa exclusiva da escala: fora dela os números caíam por cima do texto. */
const LARGURA_ESCALA = 38;

const posicaoY = (valor) => ALTURA - (Math.max(0, Math.min(valor, VALOR_MAXIMO)) / VALOR_MAXIMO) * ALTURA;
const valorDoY = (y) => Math.round(((ALTURA - Math.max(0, Math.min(y, ALTURA))) / ALTURA) * VALOR_MAXIMO);

export default function GraficoHemodinamico({
    regua, projecao, larguraColuna, larguraRotulo,
    onRegistrarPA, onRegistrarFC, isReadOnly, agora, fimAnestesia
}) {
    const areaRef = useRef(null);
    const [ferramenta, setFerramenta] = useState('pa');
    const [arrasto, setArrasto] = useState(null);

    const colunas = regua?.colunas || [];
    if (colunas.length === 0) return null;

    const linhaPas = projecao.linhas?.pas?.celulas || [];
    const linhaPad = projecao.linhas?.pad?.celulas || [];
    const linhaFc = projecao.linhas?.fc?.celulas || [];

    const centroX = (indice) => indice * larguraColuna + larguraColuna / 2;
    const numero = (celula) => (celula && Number.isFinite(Number(celula.valor)) ? Number(celula.valor) : null);

    const pontosFc = colunas
        .map((_, i) => ({ i, valor: numero(linhaFc[i]) }))
        .filter(ponto => ponto.valor != null);

    const larguraTotal = colunas.length * larguraColuna;

    /** Posição do ponteiro convertida em coluna e valor. */
    const posicao = (evento) => {
        const area = areaRef.current?.getBoundingClientRect();
        if (!area) return null;
        const x = evento.clientX - area.left;
        const y = evento.clientY - area.top;
        const coluna = Math.floor(x / larguraColuna);
        if (coluna < 0 || coluna >= colunas.length) return null;
        return { coluna, valor: valorDoY(y), y };
    };

    const colunaLiberada = (coluna) => fimAnestesia || colunas[coluna].inicioMs <= agora;

    const iniciarArrasto = (evento) => {
        if (isReadOnly) return;
        const ponto = posicao(evento);
        if (!ponto || !colunaLiberada(ponto.coluna)) return;
        evento.currentTarget.setPointerCapture?.(evento.pointerId);
        setArrasto({ coluna: ponto.coluna, inicio: ponto.valor, atual: ponto.valor });
    };

    const moverArrasto = (evento) => {
        if (!arrasto) return;
        const ponto = posicao(evento);
        if (!ponto) return;
        setArrasto(atual => ({ ...atual, atual: ponto.valor }));
    };

    const soltarArrasto = () => {
        if (!arrasto) return;
        const { coluna, inicio, atual } = arrasto;
        setArrasto(null);

        if (ferramenta === 'fc') {
            onRegistrarFC?.({ coluna, valor: atual });
            return;
        }

        const pas = Math.max(inicio, atual);
        const pad = Math.min(inicio, atual);
        // Arrasto curto demais não distingue sistólica de diastólica: seria um
        // par sem sentido clínico, então tratamos como toque sem efeito.
        if (pas - pad < 8) return;
        onRegistrarPA?.({ coluna, pas, pad });
    };

    /**
     * Ferramenta de registro, no desenho do protótipo: a escolhida fica acesa na
     * própria cor do traço que vai desenhar.
     */
    const botaoFerramenta = (chave, simbolo, texto, cores) => (
        <button
            type="button"
            onClick={() => setFerramenta(chave)}
            className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-xl border text-[10px] font-black transition-colors
                ${ferramenta === chave ? cores : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}
        >
            <span className="w-3 text-center">{simbolo}</span>
            <span className="text-left leading-tight">{texto}</span>
        </button>
    );

    return (
        <div className="flex border-b border-slate-200/70">
            <div
                className="sticky left-0 z-10 shrink-0 flex bg-slate-50 border-r-2 border-slate-300"
                style={{ width: larguraRotulo, height: ALTURA }}
            >
                <div className="flex-1 min-w-0 flex flex-col px-3 py-2">
                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-wide pb-1.5 mb-2 border-b border-slate-200">
                        Sinais vitais
                    </div>

                    {!isReadOnly && (
                        <div className="space-y-1.5">
                            {botaoFerramenta('pa', '↕', 'PAS/PAD automático', 'bg-rose-50 text-rose-600 border-rose-400')}
                            {botaoFerramenta('fc', '●', 'FC', 'bg-blue-50 text-blue-600 border-blue-400')}
                            {/* A PAM não se registra: é calculada de PAS e PAD. Fica à vista,
                                apagada, para ninguém procurar onde digitá-la. */}
                            <div className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl border border-slate-200 text-[10px] font-black text-slate-300">
                                <span className="w-3 text-center">×</span>
                                <span>PAM (auto)</span>
                            </div>
                        </div>
                    )}

                    <p className="mt-auto text-[8.5px] font-semibold text-slate-400 leading-tight">
                        {isReadOnly
                            ? '▼ PAS · ▲ PAD · ● FC · × PAM calculada'
                            : (ferramenta === 'pa'
                                ? 'Arraste da sistólica até a diastólica dentro da coluna.'
                                : 'Toque na altura da frequência.')}
                    </p>
                </div>

                {/* Escala em faixa própria: encostada na grade e longe do texto. */}
                <svg
                    width={LARGURA_ESCALA}
                    height={ALTURA}
                    className="shrink-0 border-l border-slate-200 pointer-events-none"
                >
                    {Array.from({ length: VALOR_MAXIMO / PASSO_ESCALA + 1 }, (_, i) => i * PASSO_ESCALA).map(valor => (
                        <text
                            key={valor}
                            x={LARGURA_ESCALA - 5}
                            y={Math.min(ALTURA - 2, Math.max(9, posicaoY(valor) + 3))}
                            textAnchor="end"
                            className={valor % 40 === 0 ? 'fill-slate-500' : 'fill-slate-300'}
                            style={{ fontSize: 9, fontWeight: 700 }}
                        >
                            {valor}
                        </text>
                    ))}
                </svg>
            </div>

            <svg
                ref={areaRef}
                width={larguraTotal}
                height={ALTURA}
                onPointerDown={iniciarArrasto}
                onPointerMove={moverArrasto}
                onPointerUp={soltarArrasto}
                onPointerCancel={() => setArrasto(null)}
                className={`bg-white shrink-0 touch-none ${isReadOnly ? '' : 'cursor-crosshair'}`}
            >
                {Array.from({ length: VALOR_MAXIMO / PASSO_ESCALA + 1 }, (_, i) => i * PASSO_ESCALA).map(valor => (
                    <line
                        key={`h${valor}`}
                        x1={0} x2={larguraTotal}
                        y1={posicaoY(valor)} y2={posicaoY(valor)}
                        stroke={valor % 40 === 0 ? '#cbd5e1' : '#e2e8f0'}
                        strokeWidth={1}
                    />
                ))}
                {colunas.map((_, i) => (
                    <line key={`v${i}`} x1={i * larguraColuna} x2={i * larguraColuna} y1={0} y2={ALTURA} stroke="#e2e8f0" strokeWidth={1} />
                ))}

                {/* Colunas futuras ficam veladas, como no restante da grade */}
                {colunas.map((coluna, i) => (
                    !fimAnestesia && coluna.inicioMs > agora ? (
                        <rect key={`f${i}`} x={i * larguraColuna} y={0} width={larguraColuna} height={ALTURA} fill="#f1f5f9" opacity={0.75} />
                    ) : null
                ))}

                {/* Faixa de normalidade da PAM, para leitura rápida */}
                <rect x={0} y={posicaoY(100)} width={larguraTotal} height={posicaoY(65) - posicaoY(100)} fill="#10b981" opacity={0.05} />

                {/* Pressão: barra ligando sistólica e diastólica */}
                {colunas.map((_, i) => {
                    const pas = numero(linhaPas[i]);
                    const pad = numero(linhaPad[i]);
                    if (pas == null && pad == null) return null;
                    const x = centroX(i);

                    return (
                        <g key={`pa${i}`}>
                            {pas != null && pad != null && (
                                <line x1={x} x2={x} y1={posicaoY(pas)} y2={posicaoY(pad)} stroke="#f43f5e" strokeWidth={1.5} />
                            )}
                            {pas != null && (
                                <text x={x} y={posicaoY(pas) + 4} textAnchor="middle" className="fill-rose-500" style={{ fontSize: 11, fontWeight: 700 }}>▼</text>
                            )}
                            {pad != null && (
                                <text x={x} y={posicaoY(pad) + 4} textAnchor="middle" className="fill-rose-500" style={{ fontSize: 11, fontWeight: 700 }}>▲</text>
                            )}
                            {pas != null && pad != null && (
                                <text
                                    x={x}
                                    y={posicaoY(Math.round((pas + 2 * pad) / 3)) + 3}
                                    textAnchor="middle"
                                    className="fill-slate-500"
                                    style={{ fontSize: 10, fontWeight: 700 }}
                                >
                                    ×
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Frequência cardíaca */}
                {pontosFc.length > 1 && (
                    <polyline
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={1.5}
                        points={pontosFc.map(ponto => `${centroX(ponto.i)},${posicaoY(ponto.valor)}`).join(' ')}
                    />
                )}
                {pontosFc.map(ponto => (
                    <circle key={`fc${ponto.i}`} cx={centroX(ponto.i)} cy={posicaoY(ponto.valor)} r={3.5} fill="#2563eb" />
                ))}

                {/* Prévia do arrasto em andamento */}
                {arrasto && (
                    <g>
                        <line
                            x1={centroX(arrasto.coluna)} x2={centroX(arrasto.coluna)}
                            y1={posicaoY(arrasto.inicio)} y2={posicaoY(arrasto.atual)}
                            stroke={ferramenta === 'fc' ? '#2563eb' : '#f43f5e'}
                            strokeWidth={2}
                            strokeDasharray="3 2"
                        />
                        <text
                            x={centroX(arrasto.coluna) + 10}
                            y={posicaoY(arrasto.atual)}
                            className="fill-slate-700"
                            style={{ fontSize: 11, fontWeight: 800 }}
                        >
                            {ferramenta === 'fc'
                                ? arrasto.atual
                                : `${Math.max(arrasto.inicio, arrasto.atual)}/${Math.min(arrasto.inicio, arrasto.atual)}`}
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
}
