import React, { useState } from 'react';
import { statusDoExame } from '../../utils/apaExameFisico';

/**
 * Campo de exame físico com dois estados: "Exame normal", que grava o laudo
 * padrão cadastrado, e "Com alterações", que abre texto livre.
 *
 * O valor salvo continua sendo o texto puro da coluna (`acv`, `ar`, `abdome`),
 * exatamente como antes — nenhuma coluna nova, nenhuma migração, e as APAs
 * antigas continuam abrindo. O estado dos botões é derivado do texto:
 * vazio = nada escolhido, igual ao padrão = normal, qualquer outra coisa =
 * alterado.
 */

export default function ExameNormalAlterado({ rotulo, valor, textoPadrao, onChange, isReadOnly }) {
    const [status, setStatus] = useState(() => statusDoExame(valor, textoPadrao));

    // Ressincroniza apenas quando o texto muda POR FORA (abrir outra APA,
    // restaurar rascunho). Alteração feita aqui dentro não pode reescrever o
    // estado — senão marcar "Com alterações" com o campo vazio se desfaria
    // sozinho. Ajuste durante o render, como recomenda o React para estado
    // derivado de prop.
    const [valorSincronizado, setValorSincronizado] = useState(valor);
    const [ultimoValorProprio, setUltimoValorProprio] = useState(null);

    if (valor !== valorSincronizado) {
        setValorSincronizado(valor);
        if (valor !== ultimoValorProprio) setStatus(statusDoExame(valor, textoPadrao));
    }

    const propagar = (texto) => {
        setUltimoValorProprio(texto);
        onChange(texto);
    };

    const escolher = (novoStatus) => {
        if (isReadOnly) return;
        setStatus(novoStatus);
        if (novoStatus === 'normal') {
            propagar(textoPadrao);
        } else if (statusDoExame(valor, textoPadrao) === 'normal') {
            // Saindo de "normal": limpa o laudo padrão para o médico descrever.
            propagar('');
        }
    };

    const editarTexto = (texto) => propagar(texto);

    const botao = (chave, texto) => {
        const ativo = status === chave;
        const cor = chave === 'normal'
            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700'
            : 'bg-amber-500/15 border-amber-500 text-amber-700';
        return (
            <button
                type="button"
                disabled={isReadOnly}
                onClick={() => escolher(chave)}
                className={`flex-1 px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${ativo ? `${cor} shadow-sm` : 'bg-white/60 border-white/60 text-slate-600 hover:border-white hover:bg-white/90'} ${isReadOnly ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
                {texto}
            </button>
        );
    };

    return (
        <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">{rotulo}</label>
            <div className="flex gap-1.5">
                {botao('normal', 'Exame normal')}
                {botao('alterado', 'Com alterações')}
            </div>

            {status === 'normal' && (
                <p className="mt-1.5 px-3 py-2 text-[11px] leading-relaxed font-medium text-slate-600 bg-blue-50/70 border-l-4 border-blue-400 rounded-r-lg">
                    {textoPadrao}
                </p>
            )}

            {status === 'alterado' && (
                <textarea
                    disabled={isReadOnly}
                    value={valor || ''}
                    onChange={e => editarTexto(e.target.value)}
                    rows={3}
                    placeholder={`Descreva as alterações — ${rotulo.toLowerCase()}`}
                    className="mt-1.5 w-full px-3 py-1.5 text-xs font-semibold bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg outline-none focus:border-amber-400"
                />
            )}
        </div>
    );
}
