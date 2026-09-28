import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Play, Clock, Droplets, Syringe, Plus, Trash2 } from 'lucide-react';
import { criarRegua, projetar, resumoFluidos, colunaDoInstante } from '../../utils/fichaAnestesica/projecao';
import { agruparPorSecao } from '../../services/faCatalogos';
import { POSICOES, paraHoraLocal, siglaDoItem } from '../../utils/fichaAnestesica/vocabulario';
import DialogoValor from './DialogoValor';
import GraficoHemodinamico from './GraficoHemodinamico';

/**
 * Grade temporal da ficha anestésica.
 *
 * A grade é sempre uma projeção dos eventos sobre a régua — nunca a fonte da
 * verdade. Trocar o passo, esticar a duração ou reabrir a ficha só recalcula
 * o desenho; nenhum registro é tocado.
 */

const LARGURA_COLUNA = 58;   // confortável para o toque no tablet
const LARGURA_ROTULO = 190;
const ALTURA_LINHA = 38;     // fino como a ficha de papel, sem perder o alvo do dedo

/**
 * Ordem e numeração da ficha de papel. Não é enfeite: o anestesista procura a
 * linha pelo número que decorou, e trocar a ordem na tela custa tempo em sala.
 */
const SECOES = ['agentes', 'balanco', 'monitorizacao', 'hemodinamica'];

const TITULOS = {
    agentes: '3. Agentes / Infusões contínuas',
    balanco: '4. Balanço hidroeletrolítico',
    monitorizacao: '5. Monitorização',
    hemodinamica: '6. Gráfico hemodinâmico'
};

/** Hachura das colunas que ainda não chegaram, como na ficha de papel. */
const HACHURA_FUTURO = 'repeating-linear-gradient(135deg,#f8fafc,#f8fafc 5px,#e2e8f0 5px,#e2e8f0 7px)';

export default function GradeTemporal({
    parametros, eventos, inicioAnestesia, fimAnestesia,
    passoMin, onTrocarPasso, onIniciarAnestesia, onRegistrar, onRemover,
    onRegistrarMedicacao, onEditarMedicacao, isReadOnly, tecladoNaTela = false, registroDesde = null,
    posicoes = [], onAdicionarPosicao, onRemoverPosicao, onAdicionarLinha
}) {
    const [agora, setAgora] = useState(() => Date.now());
    const [alvoEdicao, setAlvoEdicao] = useState(null);
    const [pintura, setPintura] = useState(null);   // arrasto que repete um valor pelas colunas
    const toqueLongo = useRef(null);                // espera do "segurar para repetir"
    const acabouDePintar = useRef(false);           // separa o fim do arrasto do toque que abre a célula

    // A régua avança sozinha enquanto a cirurgia acontece.
    useEffect(() => {
        if (fimAnestesia) return;
        const id = setInterval(() => setAgora(Date.now()), 30000);
        return () => clearInterval(id);
    }, [fimAnestesia]);

    const regua = useMemo(
        () => criarRegua({ inicio: inicioAnestesia, fim: fimAnestesia, passoMin, agora }),
        [inicioAnestesia, fimAnestesia, passoMin, agora]
    );

    const projecao = useMemo(
        () => projetar(eventos, regua, { propagarAte: fimAnestesia || agora }),
        [eventos, regua, fimAnestesia, agora]
    );

    const balanco = useMemo(() => {
        const saidas = (parametros || []).filter(p => p.sinal === 'saida').map(p => p.codigo);
        return resumoFluidos(eventos, saidas);
    }, [eventos, parametros]);

    const colunaAtual = fimAnestesia ? -1 : colunaDoInstante(regua, agora);

    /**
     * Depois de uma passagem de caso, o trecho anterior é de quem estava com o
     * paciente naquela hora: aparece na grade, some do alcance do dedo. O banco
     * recusa do mesmo jeito — aqui é só para não deixar tentar.
     */
    const limiteDoResponsavel = registroDesde ? new Date(registroDesde).getTime() : null;
    const trechoDeOutro = (coluna) => limiteDoResponsavel != null && coluna.inicioMs < limiteDoResponsavel;
    const porSecao = agruparPorSecao(parametros);

    if (!inicioAnestesia) {
        return (
            <div className="bg-white/60 backdrop-blur-2xl border border-white rounded-3xl shadow-xl p-10 text-center">
                <Clock className="mx-auto text-slate-400 mb-3" size={32} />
                <h3 className="text-sm font-black text-slate-700">A ficha ainda não começou</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1 mb-5 max-w-md mx-auto">
                    A linha do tempo nasce do início da anestesia. Ao iniciar, a grade passa a acompanhar o relógio.
                </p>
                {!isReadOnly && (
                    <button
                        onClick={onIniciarAnestesia}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm"
                    >
                        <Play size={15} /> Iniciar anestesia agora
                    </button>
                )}
            </div>
        );
    }

    const abrirCelula = (parametro, indiceColuna) => {
        if (isReadOnly) return;
        if (trechoDeOutro(regua.colunas[indiceColuna] || {})) return;
        // O clique que chega logo depois de soltar o arrasto é resto do gesto,
        // não vontade de digitar naquela célula.
        if (acabouDePintar.current) {
            acabouDePintar.current = false;
            return;
        }
        const coluna = regua.colunas[indiceColuna];
        if (!coluna) return;
        if (!fimAnestesia && coluna.inicioMs > agora) return;  // futuro não se registra

        setAlvoEdicao({
            parametro,
            indiceColuna,
            celula: projecao.linhas[parametro.codigo]?.celulas[indiceColuna] || null,
            horario: coluna.rotulo
        });
    };

    const salvarValor = (valor, item) => {
        const coluna = regua.colunas[alvoEdicao.indiceColuna];
        const celula = alvoEdicao.celula;

        // Reescrever uma célula é correção, não medida nova: o registro anterior
        // é substituído (e preservado no histórico). Sem isso, a ficha impressa
        // mostraria duas aferições contraditórias no mesmo horário.
        // Célula propagada não tem registro próprio — ali é lançamento novo.
        //
        // No balanço a conta é por item: lançar Ringer onde já havia soro
        // fisiológico acrescenta uma linha; só se corrige o item que está sendo
        // editado. Somar tudo num registro só apagaria o que já estava lá.
        const daCelula = celula && !celula.propagado ? (celula.eventoIds || []) : [];
        const doItem = celula?.itens?.find(atual => atual.nome === (item || ''))?.eventoIds || [];
        const substituiIds = celula?.itens?.length ? doItem : daCelula;

        // O instante gravado é o início da coluna: é o que o anestesista vê e
        // o que mantém o registro coerente se o passo mudar depois.
        onRegistrar({
            parametro: alvoEdicao.parametro,
            valor,
            observacao: item,
            t: new Date(coluna.inicioMs),
            substituiIds
        });
        setAlvoEdicao(null);
    };

    /**
     * Repetir um valor pelas colunas seguintes — "isto seguiu assim" sem reabrir
     * o diálogo a cada intervalo.
     *
     * No mouse, arrastar basta. No toque não bastava: o dedo fica capturado pela
     * célula de origem e as vizinhas nunca recebem o evento, então o gesto do
     * desktop simplesmente não existia no iPad. Aqui é **segurar e arrastar** —
     * a espera separa o toque que quer digitar do toque que quer repetir, e a
     * coluna sob o dedo é descoberta pela posição, não pelo alvo do evento.
     */
    const cancelarEspera = () => {
        if (toqueLongo.current?.temporizador) clearTimeout(toqueLongo.current.temporizador);
        toqueLongo.current = null;
    };

    const prepararPintura = (parametro, indice, celula, evento) => {
        acabouDePintar.current = false;
        if (isReadOnly || !celula || celula.valor == null) return;
        if (trechoDeOutro(regua.colunas[indice] || {})) return;
        const pintar = () => setPintura({ parametro, valor: celula.valor, origem: indice, ate: indice });

        // Mouse já tem o gesto: apertar e arrastar, direto.
        if (evento.pointerType === 'mouse') return pintar();

        cancelarEspera();
        toqueLongo.current = {
            x: evento.clientX,
            y: evento.clientY,
            temporizador: setTimeout(() => {
                navigator.vibrate?.(15);   // avisa que entrou no modo repetir
                pintar();
            }, 350)
        };
    };

    /** Enquanto se espera o toque longo, mover é rolagem — não é arrasto. */
    const moverPonteiro = (evento) => {
        if (!pintura) {
            if (!toqueLongo.current) return;
            const dx = Math.abs(evento.clientX - toqueLongo.current.x);
            const dy = Math.abs(evento.clientY - toqueLongo.current.y);
            if (dx > 10 || dy > 10) cancelarEspera();
            return;
        }

        // No toque, o alvo do evento continua sendo a célula de origem: quem diz
        // onde o dedo está é a posição na tela.
        const elemento = document.elementFromPoint(evento.clientX, evento.clientY);
        const coluna = elemento?.closest?.('[data-coluna]')?.dataset?.coluna;
        if (coluna != null) arrastarPintura(Number(coluna));
    };

    const arrastarPintura = (indice) => {
        if (!pintura || indice <= pintura.origem) return;
        const coluna = regua.colunas[indice];
        if (!coluna || (!fimAnestesia && coluna.inicioMs > agora) || trechoDeOutro(coluna)) return;
        setPintura(atual => (atual.ate === indice ? atual : { ...atual, ate: indice }));
    };

    /**
     * Soltar aplica o valor nas colunas percorridas.
     *
     * Só o contêiner escuta o `pointerup`: quando a célula também escutava, o
     * mesmo gesto era tratado duas vezes (o evento sobe) e cada coluna entrava
     * na ficha em dobro — as duas chamadas enxergam o mesmo estado.
     */
    const soltarPintura = () => {
        cancelarEspera();
        if (!pintura) return;
        const { parametro, valor, origem, ate } = pintura;
        setPintura(null);

        // Apertar e soltar na mesma célula é clique, não arrasto: só aí o clique
        // que vem em seguida deve abrir a célula para digitar.
        if (ate <= origem) return;
        acabouDePintar.current = true;

        for (let i = origem + 1; i <= ate; i++) {
            const celulaExistente = projecao.linhas[parametro.codigo]?.celulas[i];
            onRegistrar({
                parametro,
                valor,
                t: new Date(regua.colunas[i].inicioMs),
                substituiIds: celulaExistente && !celulaExistente.propagado ? (celulaExistente.eventoIds || []) : []
            });
        }
    };

    /** PA e FC vindas do gráfico entram como qualquer outro registro. */
    const registrarDoGrafico = ({ coluna, pas, pad, valor, alvo }) => {
        const instante = new Date(regua.colunas[coluna].inicioMs);
        const acharParametro = (codigo) => (parametros || []).find(p => p.codigo === codigo);

        const lancar = (codigo, valorNumero) => {
            const parametro = acharParametro(codigo);
            if (!parametro) return;
            const celula = projecao.linhas[codigo]?.celulas[coluna];
            onRegistrar({
                parametro,
                valor: valorNumero,
                t: instante,
                substituiIds: celula && !celula.propagado ? (celula.eventoIds || []) : []
            });
        };

        if (alvo === 'fc') return lancar('fc', valor);
        lancar('pas', pas);
        lancar('pad', pad);
    };

    const removerValor = (item) => {
        const celula = alvoEdicao.celula;
        const doItem = celula?.itens?.find(atual => atual.nome === (item || ''))?.eventoIds;
        const alvos = celula?.itens?.length ? doItem : celula?.eventoIds;
        if (alvos?.length) onRemover(alvos);
        setAlvoEdicao(null);
    };

    /**
     * O que aparece dentro da célula.
     *
     * Balanço mostra uma linha por item ("SF 100", "RL 500"): num mesmo intervalo
     * pode entrar mais de uma coisa, e somar tudo num número só esconderia o que
     * foi infundido. Valor de texto comprido (ritmo do ECG) diminui de corpo em
     * vez de ser cortado no meio da palavra.
     */
    const conteudoDaCelula = (celula) => {
        if (!celula) return '';

        if (celula.itens?.length) {
            return (
                <span className="block leading-[1.05] py-0.5">
                    {celula.itens.map((item, i) => (
                        <span key={i} className="block truncate">
                            {item.nome && <span className="text-[8px] font-black text-blue-500">{siglaDoItem(item.nome)} </span>}
                            <span className="text-[10px]">{item.valor}</span>
                        </span>
                    ))}
                </span>
            );
        }

        const texto = String(celula.valor ?? '');
        if (texto.length <= 6) return texto;
        return <span className="block px-0.5 text-[8px] leading-[1.1] line-clamp-3">{texto}</span>;
    };

    const renderLinha = (parametro) => {
        const linha = projecao.linhas[parametro.codigo];

        return (
            <div key={parametro.codigo} className="flex border-b border-slate-200/70 last:border-b-0">
                <div
                    className="sticky left-0 z-10 shrink-0 flex items-stretch bg-white border-r-2 border-slate-400"
                    style={{ width: LARGURA_ROTULO, height: ALTURA_LINHA }}
                >
                    <span
                        title={parametro.rotulo}
                        className="flex-1 flex items-center px-3 overflow-hidden text-[10.5px] font-semibold text-slate-800 leading-[1.15]"
                    >
                        <span className="line-clamp-2">{parametro.rotulo}</span>
                    </span>
                    <span className="w-[70px] shrink-0 flex items-center justify-center border-l text-[10px] font-black text-slate-500"
                        style={{ borderColor: '#87CEFA', background: '#f8fbff' }}>
                        {parametro.unidade}
                    </span>
                </div>

                <div className="flex">
                    {regua.colunas.map((coluna, indice) => {
                        const celula = linha?.celulas[indice];
                        const futuro = !fimAnestesia && coluna.inicioMs > agora;
                        const deOutro = trechoDeOutro(coluna);
                        const atual = indice === colunaAtual;

                        return (
                            <button
                                key={indice}
                                data-coluna={indice}
                                title={deOutro
                                    ? 'Registro do anestesista anterior — você registra a partir de quando assumiu o caso.'
                                    : (celula?.itens?.length
                                        ? celula.itens.map(item => `${item.nome || 'sem tipo'}: ${item.valor} ${celula.unidade || ''}`).join(' · ')
                                        : (celula?.valor != null ? String(celula.valor) : ''))}
                                onClick={() => abrirCelula(parametro, indice)}
                                onPointerDown={(evento) => prepararPintura(parametro, indice, celula, evento)}
                                disabled={isReadOnly || futuro || deOutro}
                                style={{
                                    width: LARGURA_COLUNA,
                                    height: ALTURA_LINHA,
                                    borderColor: atual ? '#f43f5e' : '#87CEFA',
                                    // Célula com valor é ponto de partida de arrasto: o dedo
                                    // ali não rola a grade de lado, senão o gesto nunca começa.
                                    ...(celula && !isReadOnly && !deOutro ? { touchAction: 'pan-y' } : {}),
                                    ...(futuro ? { background: HACHURA_FUTURO } : {})
                                }}
                                className={`shrink-0 border-r text-[11px] font-bold transition-colors leading-tight
                                    ${atual ? 'bg-rose-50/40' : ''}
                                    ${deOutro ? 'cursor-not-allowed opacity-70 bg-slate-50' : ''}
                                    ${futuro ? 'cursor-not-allowed' : (deOutro ? '' : 'hover:bg-blue-50 cursor-pointer')}
                                    ${celula && !celula.propagado ? 'bg-blue-100 text-blue-900' : ''}
                                    ${celula?.propagado ? 'bg-blue-50/70 text-blue-500' : ''}
                                    ${!celula && !futuro ? 'text-slate-300' : ''}
                                    ${pintura && pintura.parametro.codigo === parametro.codigo && indice > pintura.origem && indice <= pintura.ate ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''}`}
                            >
                                {pintura && pintura.parametro.codigo === parametro.codigo && indice > pintura.origem && indice <= pintura.ate
                                    ? pintura.valor
                                    : conteudoDaCelula(celula)}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div
            className="space-y-4"
            onPointerMove={moverPonteiro}
            onPointerUp={soltarPintura}
            onPointerCancel={() => { cancelarEspera(); setPintura(null); }}
            onPointerLeave={() => { cancelarEspera(); setPintura(null); }}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Intervalo</span>
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                        {[5, 10].map(passo => (
                            <button
                                key={passo}
                                onClick={() => onTrocarPasso(passo)}
                                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-colors ${passoMin === passo ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                {passo} min
                            </button>
                        ))}
                    </div>
                    {regua.truncada && (
                        <span className="text-[10px] font-bold text-amber-700">Exibindo as primeiras 24 h</span>
                    )}
                    {!isReadOnly && (
                        <span className="text-[10px] font-semibold text-slate-400">
                            Segure numa célula preenchida e arraste para repetir o valor.
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    <Droplets size={14} className="text-slate-400" />
                    Entradas {balanco.totalEntradas} ml · Saídas {balanco.totalSaidas} ml ·
                    <span className={balanco.balanco >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        balanço {balanco.balanco > 0 ? '+' : ''}{balanco.balanco} ml
                    </span>
                </div>
            </div>

            <div className="bg-white border-2 border-slate-400 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <div style={{ minWidth: LARGURA_ROTULO + regua.colunas.length * LARGURA_COLUNA }}>

                        {/* Régua de horários */}
                        <div className="flex border-b-2 border-slate-300 bg-white sticky top-0 z-20">
                            <div
                                className="sticky left-0 z-10 shrink-0 flex items-end justify-end px-3 pb-1 bg-white border-r-2 border-slate-400"
                                style={{ width: LARGURA_ROTULO }}
                            >
                                <span className="text-[10px] font-black text-slate-600">Tempo (Agora) →</span>
                            </div>
                            {regua.colunas.map((coluna, indice) => (
                                <div
                                    key={indice}
                                    style={{ width: LARGURA_COLUNA, borderColor: '#87CEFA' }}
                                    title={trechoDeOutro(coluna) ? 'Trecho do anestesista anterior' : undefined}
                                    className={`h-9 shrink-0 flex items-end justify-center pb-1 border-r text-[10px] font-black
                                        ${indice === colunaAtual ? 'bg-rose-100 text-rose-700' : (trechoDeOutro(coluna) ? 'bg-slate-100 text-slate-400' : 'text-slate-600')}`}
                                >
                                    {coluna.rotulo}
                                </div>
                            ))}
                        </div>

                        {SECOES.map(secao => {
                            const itens = porSecao[secao];
                            if (!itens?.length) return null;
                            return (
                                <div key={secao}>
                                    <div className="flex border-b border-slate-400">
                                        <div
                                            className="sticky left-0 z-10 shrink-0 px-3 py-1 border-r-2 border-slate-400"
                                            style={{ width: LARGURA_ROTULO, background: 'linear-gradient(100deg,#27466d,#41658e)' }}
                                        >
                                            <span className="text-[10px] font-black text-white uppercase tracking-wide">{TITULOS[secao]}</span>
                                        </div>
                                        <div style={{ width: regua.colunas.length * LARGURA_COLUNA, background: '#e7eef8' }} />
                                    </div>
                                    {itens.map(renderLinha)}

                                    {/* Infusão que não está no catálogo do hospital entra aqui e
                                        vale só para esta ficha — sem pedir cadastro no meio da cirurgia. */}
                                    {secao === 'agentes' && !isReadOnly && onAdicionarLinha && (
                                        <div className="flex border-b border-slate-200/70">
                                            <div
                                                className="sticky left-0 z-10 shrink-0 flex items-center px-3 bg-white border-r-2 border-slate-400"
                                                style={{ width: LARGURA_ROTULO, height: ALTURA_LINHA }}
                                            >
                                                <button
                                                    onClick={onAdicionarLinha}
                                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black"
                                                >
                                                    <Plus size={12} /> Adicionar medicação
                                                </button>
                                            </div>
                                            <div style={{ width: regua.colunas.length * LARGURA_COLUNA, height: ALTURA_LINHA, background: '#fbfdff' }} />
                                        </div>
                                    )}

                                    {/* Posicionamento fica dentro da grade, como na ficha de papel:
                                        é informação do intraoperatório, não do encerramento. */}
                                    {secao === 'monitorizacao' && (
                                        <div className="flex border-b border-slate-200/70">
                                            <div
                                                className="sticky left-0 z-10 shrink-0 flex flex-col justify-center gap-1 px-3 py-1.5 bg-white border-r-2 border-slate-400"
                                                style={{ width: LARGURA_ROTULO }}
                                            >
                                                <span className="text-[9px] font-black text-blue-700 uppercase tracking-wide">Posicionamento</span>
                                                {!isReadOnly && (
                                                    <div className="flex gap-1">
                                                        <select
                                                            id="fa-nova-posicao"
                                                            defaultValue={POSICOES[0]}
                                                            className="flex-1 min-w-0 px-1 py-1 text-[10px] font-bold bg-white border border-slate-300 rounded outline-none focus:border-blue-500"
                                                        >
                                                            {POSICOES.map(posicao => <option key={posicao} value={posicao}>{posicao}</option>)}
                                                        </select>
                                                        <button
                                                            onClick={() => onAdicionarPosicao?.(document.getElementById('fa-nova-posicao').value)}
                                                            className="px-2 py-1 bg-teal-700 hover:bg-teal-800 text-white text-[9px] font-black uppercase rounded shrink-0"
                                                        >
                                                            Registrar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1 px-2 py-1 bg-white" style={{ width: regua.colunas.length * LARGURA_COLUNA }}>
                                                {posicoes.map((posicao, i) => (
                                                    <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-700">
                                                        {posicao.nome} {paraHoraLocal(posicao.horario)}
                                                        {!isReadOnly && (
                                                            <button onClick={() => onRemoverPosicao?.(i)} className="text-slate-400 hover:text-rose-600">
                                                                <Trash2 size={10} />
                                                            </button>
                                                        )}
                                                    </span>
                                                ))}
                                                {posicoes.length === 0 && (
                                                    <span className="text-[10px] font-bold text-slate-300">Nenhum posicionamento registrado.</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {secao === 'hemodinamica' && (
                                        <GraficoHemodinamico
                                            regua={regua}
                                            projecao={projecao}
                                            larguraColuna={LARGURA_COLUNA}
                                            larguraRotulo={LARGURA_ROTULO}
                                            agora={agora}
                                            fimAnestesia={fimAnestesia}
                                            isReadOnly={isReadOnly}
                                            onRegistrarPA={({ coluna, pas, pad }) => registrarDoGrafico({ coluna, pas, pad })}
                                            onRegistrarFC={({ coluna, valor }) => registrarDoGrafico({ coluna, valor, alvo: 'fc' })}
                                        />
                                    )}
                                </div>
                            );
                        })}

                        {/* Medicações em dose única */}
                        <div className="flex border-t-2 border-slate-300">
                            <div
                                className="sticky left-0 z-10 shrink-0 flex flex-col justify-center gap-1.5 px-3 py-2 bg-slate-200/70 border-r-2 border-slate-300"
                                style={{ width: LARGURA_ROTULO }}
                            >
                                <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-600 uppercase tracking-wide">
                                    <Syringe size={12} /> Medicações
                                </span>
                                {!isReadOnly && (
                                    <button
                                        onClick={() => onRegistrarMedicacao(regua.colunas[Math.max(0, colunaAtual)] || regua.colunas[0])}
                                        className="flex items-center justify-center gap-1.5 w-full h-11 rounded-xl bg-white border-2 border-violet-500 text-violet-600 hover:bg-violet-50 active:bg-violet-100 text-xs font-black transition-colors"
                                    >
                                        <Plus size={15} /> Medicações
                                    </button>
                                )}
                            </div>
                            <div className="flex bg-white">
                                {regua.colunas.map((coluna, indice) => {
                                    const daColuna = projecao.medicacoes.filter(item => item.coluna === indice);
                                    return (
                                        <div
                                            key={indice}
                                            style={{ width: LARGURA_COLUNA, minHeight: 56 }}
                                            className={`shrink-0 border-r p-0.5 space-y-0.5 ${indice === colunaAtual ? 'border-r-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
                                        >
                                            {daColuna.map(item => (
                                                <button
                                                    key={item.evento.id}
                                                    onClick={() => !isReadOnly && !trechoDeOutro(coluna) && onEditarMedicacao?.(item.evento)}
                                                    title={`${item.evento.alvo} ${item.evento.valor} ${item.evento.unidade} ${item.evento.via}${item.evento.observacao ? ' — ' + item.evento.observacao : ''} · toque para editar`}
                                                    className="w-full px-1 py-0.5 rounded bg-violet-100 hover:bg-rose-100 text-violet-900 text-[8px] font-bold leading-tight text-left"
                                                >
                                                    <span className="block truncate">{item.evento.alvo}</span>
                                                    <span className="block text-violet-600">{item.evento.valor} {item.evento.unidade}</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {projecao.foraDaRegua.length > 0 && (
                <p className="text-[11px] font-bold text-amber-700">
                    {projecao.foraDaRegua.length} registro(s) fora da janela exibida — anteriores ao início da anestesia.
                </p>
            )}

            {alvoEdicao && (
                <DialogoValor
                    parametro={alvoEdicao.parametro}
                    celula={alvoEdicao.celula}
                    horario={alvoEdicao.horario}
                    tecladoNaTela={tecladoNaTela}
                    onSalvar={salvarValor}
                    onRemover={alvoEdicao.celula ? removerValor : null}
                    onFechar={() => setAlvoEdicao(null)}
                />
            )}
        </div>
    );
}
