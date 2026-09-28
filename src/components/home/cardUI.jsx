import React from 'react';

/*
 * Peças compartilhadas dos cards da tela inicial.
 *
 * A lateral tinha três cards que não conversavam: cada um com seu tamanho de
 * título, seu peso e sua régua de caixa alta — tudo em `font-black`, o que
 * deixava a coluna gritando por igual e sem hierarquia nenhuma. Aqui a
 * disciplina é a mesma do financeiro: poucos pesos (semibold para conteúdo,
 * medium para apoio), hierarquia por TAMANHO e COR em vez de peso, e um único
 * acento (índigo) reservado para o que é "agora".
 */

// Superfície do card. Sombra curta e difusa em vez de sombra longa e escura.
export const CARD_SHELL = 'rounded-[1.75rem] bg-white/45 backdrop-blur-2xl border border-white/60 shadow-[0_6px_24px_rgba(15,23,42,0.07)]';

// Título de card: pequeno, discreto, uma linha só. Ele rotula — não compete
// com o conteúdo.
export const CardHeader = ({ icon: Icon, title, action }) => (
    <div className="flex items-center justify-between gap-2 shrink-0 mb-2.5">
        <h3 className="flex items-center gap-1.5 min-w-0 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-slate-500">
            {Icon && <Icon size={12} className="shrink-0 text-slate-400" />}
            <span className="truncate">{title}</span>
        </h3>
        {action}
    </div>
);

// Ação secundária do cabeçalho: link de texto, não botão. Um botão desenhado
// aqui viraria o elemento mais pesado do card.
export const CardLink = ({ onClick, children }) => (
    <button
        onClick={onClick}
        className="shrink-0 text-[10.5px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors whitespace-nowrap"
    >
        {children}
    </button>
);
