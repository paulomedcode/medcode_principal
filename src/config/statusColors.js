/*
 * Paleta de cores compartilhada pelos widgets da Tela Inicial.
 * Cada tom = { bg (fundo claro), tx (texto escuro), dot (cor sólida p/ pontos/rosca) }.
 *
 * statusColor() deriva a cor de forma estável a partir do nome do status (hash),
 * garantindo que o MESMO status tenha sempre a MESMA cor em todos os widgets.
 */

export const STATUS_PALETTE = [
    { bg: '#EAF3DE', tx: '#3B6D11', dot: '#639922' }, // verde
    { bg: '#E6F1FB', tx: '#0C447C', dot: '#185FA5' }, // azul
    { bg: '#FAEEDA', tx: '#854F0B', dot: '#BA7517' }, // âmbar
    { bg: '#FAECE7', tx: '#993C1D', dot: '#D85A30' }, // coral
    { bg: '#EEEDFE', tx: '#3C3489', dot: '#534AB7' }, // roxo
    { bg: '#E1F5EE', tx: '#085041', dot: '#0F6E56' }, // teal
    { bg: '#FBEAF0', tx: '#72243E', dot: '#993556' }, // rosa
    { bg: '#F1EFE8', tx: '#444441', dot: '#5F5E5A' }, // cinza
    { bg: '#FCEBEB', tx: '#A32D2D', dot: '#E24B4A' }, // vermelho
];

export const statusColor = (status) => {
    const s = String(status || '').toLowerCase().trim();
    if (!s) return STATUS_PALETTE[7];
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
    return STATUS_PALETTE[h % STATUS_PALETTE.length];
};
