import React, { useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';

/**
 * Entrada de um valor da grade.
 *
 * O teclado de teclas grandes serve a quem registra de luva, em pé, no tablet; no
 * desktop ele só atravessa a frente da grade, porque o teclado de verdade já está
 * na mesa. Quem manda é a preferência do aparelho (`tecladoNaTela`), ligada e
 * desligada no topo da ficha.
 *
 * Com o teclado próprio ligado o campo fica só de leitura: é o que impede o
 * teclado do sistema de subir por cima do nosso no iPad.
 */
export default function DialogoValor({ parametro, celula, horario, tecladoNaTela = false, onSalvar, onRemover, onFechar }) {
    // O diálogo é montado a cada abertura, então basta o valor inicial: célula
    // já preenchida entra para edição, célula vazia começa no padrão do parâmetro.
    const [valor, setValor] = useState(() => {
        // No balanço, o que se edita é o item aberto — não a soma da célula.
        if (celula?.itens?.length) return String(celula.itens[0].valor);
        if (celula?.valor != null) return String(celula.valor);
        return parametro?.valor_padrao || '';
    });
    const [confirmandoForaDaFaixa, setConfirmandoForaDaFaixa] = useState(false);

    // Balanço: a linha é "Soluções", o registro é "Ringer 500". O tipo é
    // escolhido aqui e viaja junto do volume, para a ficha não perder o que foi
    // de fato infundido.
    //
    // Num mesmo horário pode entrar mais de um: trocar o tipo aqui mostra o que
    // já foi lançado daquele item (ou campo vazio, se for o primeiro), e salvar
    // não encosta nos outros.
    const itens = parametro?.tipo === 'fluido' ? (parametro.opcoes || []) : [];
    const lancados = celula?.itens || [];
    const [item, setItem] = useState(() => (itens.length ? (lancados[0]?.nome || itens[0]) : ''));

    const escolherItem = (opcao) => {
        setItem(opcao);
        setConfirmandoForaDaFaixa(false);
        const jaLancado = lancados.find(atual => atual.nome === opcao);
        setValor(jaLancado ? String(jaLancado.valor) : '');
    };

    const digitar = (tecla) => {
        setConfirmandoForaDaFaixa(false);
        if (tecla === 'apagar') return setValor(atual => atual.slice(0, -1));
        if (tecla === ',') return setValor(atual => (atual.includes(',') || atual.includes('.') ? atual : `${atual || '0'},`));
        setValor(atual => (atual.length >= 6 ? atual : atual + tecla));
    };

    const numero = Number(String(valor).replace(',', '.'));
    const temValor = String(valor).trim() !== '' && Number.isFinite(numero);

    const foraDaFaixa = temValor
        && ((parametro?.faixa_min != null && numero < Number(parametro.faixa_min))
            || (parametro?.faixa_max != null && numero > Number(parametro.faixa_max)));

    const salvar = () => {
        if (!temValor) return;
        // Valor implausível quase sempre é dedo torto. Não bloqueia — pode ser
        // real — mas exige uma segunda confirmação antes de entrar na ficha.
        if (foraDaFaixa && !confirmandoForaDaFaixa) return setConfirmandoForaDaFaixa(true);
        onSalvar(numero, itens.length ? item : undefined);
    };

    const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'apagar'];

    // Parâmetro de lista (ECG, por exemplo) escolhe entre opções: teclado
    // numérico ali só atrapalharia.
    if (parametro?.tipo === 'lista') {
        return (
            <div className="fixed top-16 inset-x-0 bottom-0 z-[1010] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:hidden">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                    <div className="flex items-center justify-between p-4 border-b border-slate-200">
                        <div>
                            <h3 className="text-sm font-black text-slate-800">{parametro.rotulo}</h3>
                            <p className="text-[11px] font-bold text-slate-400">{horario}</p>
                        </div>
                        <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                    </div>

                    <div className="p-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
                        {(parametro.opcoes || []).map(opcao => (
                            <button
                                key={opcao}
                                onClick={() => onSalvar(opcao)}
                                className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs font-bold transition-colors ${String(celula?.valor) === opcao ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50'}`}
                            >
                                {opcao}
                            </button>
                        ))}
                        {(parametro.opcoes || []).length === 0 && (
                            <p className="py-6 text-center text-xs font-bold text-slate-400">
                                Nenhuma opção cadastrada para este parâmetro.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-200">
                        {celula && onRemover ? (
                            <button onClick={onRemover} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg">
                                <Trash2 size={14} /> Remover
                            </button>
                        ) : <span />}
                        <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1010] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div>
                        <h3 className="text-sm font-black text-slate-800">{parametro?.rotulo}</h3>
                        <p className="text-[11px] font-bold text-slate-400">{horario}</p>
                    </div>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-3">
                    {itens.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {itens.map(opcao => (
                                <button
                                    key={opcao}
                                    onClick={() => escolherItem(opcao)}
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors
                                        ${item === opcao ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                                >
                                    {opcao}
                                    {lancados.find(atual => atual.nome === opcao) && (
                                        <span className={`ml-1 font-black ${item === opcao ? 'text-blue-100' : 'text-blue-500'}`}>
                                            · {lancados.find(atual => atual.nome === opcao).valor}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-baseline justify-end gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <input
                            value={valor}
                            onChange={e => { setValor(e.target.value.replace(/[^0-9.,]/g, '')); setConfirmandoForaDaFaixa(false); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } }}
                            inputMode="decimal"
                            readOnly={tecladoNaTela}
                            autoFocus={!tecladoNaTela}
                            className="flex-1 min-w-0 bg-transparent text-right text-3xl font-black text-slate-800 outline-none"
                            placeholder="0"
                        />
                        <span className="text-sm font-bold text-slate-500 shrink-0">{parametro?.unidade}</span>
                    </div>

                    {foraDaFaixa && (
                        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] font-bold text-amber-900">
                                Valor fora do esperado para {parametro?.rotulo?.toLowerCase()} ({parametro.faixa_min}–{parametro.faixa_max} {parametro.unidade}).
                                {confirmandoForaDaFaixa ? ' Toque em Salvar de novo para confirmar.' : ' Confira antes de salvar.'}
                            </p>
                        </div>
                    )}

                    {tecladoNaTela && (
                        <div className="grid grid-cols-3 gap-2">
                            {teclas.map(tecla => (
                                <button
                                    key={tecla}
                                    onClick={() => digitar(tecla)}
                                    className="h-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-lg font-black text-slate-700 transition-colors"
                                >
                                    {tecla === 'apagar' ? '⌫' : tecla}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-200">
                    {celula && onRemover && (!itens.length || lancados.some(atual => atual.nome === item)) ? (
                        <button onClick={() => onRemover(item)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg">
                            <Trash2 size={14} /> Remover{itens.length ? ' este' : ''}
                        </button>
                    ) : <span />}

                    <div className="flex gap-2">
                        <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button
                            onClick={salvar}
                            disabled={!temValor}
                            className={`px-5 py-2 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 ${confirmandoForaDaFaixa ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {confirmandoForaDaFaixa ? 'Confirmar mesmo assim' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
