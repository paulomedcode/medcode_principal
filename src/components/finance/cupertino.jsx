import React from 'react';

// ============================================================================
// CUPERTINO — tokens visuais do módulo financeiro (decisão do usuário, jul/2026).
// Estilo aprovado no mockup "Opção A": superfícies brancas sobre cinza-pérola,
// divisórias fio-de-cabelo, disciplina de peso (semibold só em título e valor),
// status como ponto + texto, azul Apple como única cor de ação.
// AQUI SÓ MORA CARCAÇA: nenhuma lógica, nenhum dado.
// ============================================================================

export const cup = {
  // superfícies
  page: 'bg-[#f5f5f7]',
  card: 'bg-white border border-black/[.085] rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)]',
  cardFlat: 'bg-white border border-black/[.085] rounded-xl',

  // divisórias
  hairline: 'border-black/[.085]',
  rowline: 'border-black/[.055]',
  hover: 'hover:bg-black/[.025]',

  // texto
  text: 'text-[#1d1d1f]',
  muted: 'text-[#86868b]',
  label: 'text-[10px] font-semibold uppercase tracking-[.08em] text-[#86868b]',
  title: 'text-[15px] font-semibold tracking-[-.01em] text-[#1d1d1f]',
  subtitle: 'text-[11px] text-[#86868b]',

  // valores (sempre com tabular-nums no elemento)
  pos: 'text-[#248a3d]',
  neg: 'text-[#d70015]',
  warn: 'text-[#bf7a00]',
  accent: 'text-[#0071e3]',

  // controles
  btn: 'h-9 px-3.5 rounded-lg border border-black/[.085] bg-white text-[11.5px] font-medium text-[#1d1d1f] hover:bg-black/[.03] transition-colors inline-flex items-center gap-1.5',
  btnPrimary: 'h-9 px-4 rounded-lg bg-[#0071e3] hover:bg-[#0077ed] text-white text-[11.5px] font-semibold transition-colors inline-flex items-center gap-1.5 shadow-[0_1px_2px_rgba(0,113,227,.35)]',
  input: 'h-9 px-3 rounded-lg border border-black/[.085] bg-white text-[12px] text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] transition-colors',
  select: 'h-9 px-2.5 rounded-lg border border-black/[.085] bg-white text-[11.5px] font-medium text-[#1d1d1f] outline-none focus:border-[#0071e3] cursor-pointer transition-colors',

  // tabela
  th: 'text-[9.5px] font-semibold uppercase tracking-[.09em] text-[#86868b] text-left py-2.5 px-3 whitespace-nowrap',
};

// Status como ponto colorido + texto — substitui as pílulas de fundo colorido.
// tone: 'ok' (verde) | 'warn' (âmbar) | 'bad' (vermelho) | 'accent' (azul) | neutro.
const DOT_TONES = {
  ok: { dot: '#248a3d', text: 'text-[#248a3d]' },
  warn: { dot: '#bf7a00', text: 'text-[#bf7a00]' },
  bad: { dot: '#d70015', text: 'text-[#d70015]' },
  accent: { dot: '#0071e3', text: 'text-[#0071e3]' },
  info: { dot: '#7c3aed', text: 'text-[#7c3aed]' },
  neutral: { dot: '#86868b', text: 'text-[#86868b]' },
};
export function Dot({ tone = 'neutral', children, title }) {
  const t = DOT_TONES[tone] || DOT_TONES.neutral;
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium whitespace-nowrap ${t.text}`}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.dot }} />
      {children}
    </span>
  );
}
