// Impressão padronizada de relatórios para o sistema. Duas variantes:
//
// • 'grid'  (padrão) — estilo planilha do módulo financeiro: tabela toda
//   quadriculada, zebra e rodapé de totais.
// • 'notes' — relatório de tarefas do Compromisso: cada tarefa é um bloco com
//   a anotação por baixo, ocupando a largura toda. Sem grade vertical, porque
//   uma tarefa ocupa DUAS linhas de tabela e a grade sairia partida no meio.
//
// Nas duas: cabeçalho com logo + nome da instituição, linha de período e de
// "gerado por", e o rodapé de assinatura. Abre uma janela nova e imprime.
//
// Uso:
//   printReport({
//     theme,                       // { nomeInstituicao, logoUrl }
//     title: 'Contas a Pagar',     // nome do relatório (sob o nome da instituição)
//     periodText: 'Junho de 2026', // texto do período filtrado
//     periodLabel: 'Período Filtrado',             // rótulo da 1ª info (opcional)
//     userName: 'Paulo',           // quem gerou (opcional)
//     orientation: 'landscape',    // 'landscape' | 'portrait'
//     variant: 'grid',             // 'grid' | 'notes'
//     columns: [                   // definição das colunas
//       { header: 'Data', align: 'left', width: '18%' },  // width opcional
//       { header: 'Valor', align: 'right' },
//     ],
//     rows: [ ['01/06/2026', 'R$ 100,00'], ... ],  // matriz de células (strings)
//     // uma linha também pode vir como { cells: [...], note: 'texto', done: true }:
//     // a nota ganha uma segunda linha abaixo das células e `done` esmaece a
//     // tarefa já concluída (usado pelo Compromisso).
//     summary: [                   // resumo/totais no rodapé (opcional)
//       { label: 'Total do período', value: 'R$ 1.000,00' },
//     ],
//     totalLabel: 'Total de Registros Encontrados', // rótulo do contador (opcional)
//   })

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function printReport({
  theme = {},
  title = 'Relatório',
  periodText = 'Todos os Períodos',
  periodLabel = 'Período Filtrado',
  userName = 'Usuário do Sistema',
  orientation = 'landscape',
  variant = 'grid',
  columns = [],
  rows = [],
  summary = [],
  totalLabel = 'Total de Registros Encontrados',
}) {
  const now = new Date();
  const dataFormatada = now.toLocaleDateString('pt-BR');
  const horaFormatada = now.toLocaleTimeString('pt-BR');
  const instituicao = theme?.nomeInstituicao || 'Sistema de Gestão';
  const isNotes = variant === 'notes';

  const alignOf = (i) => (columns[i]?.align === 'right' ? 'right' : (columns[i]?.align === 'center' ? 'center' : 'left'));

  // Larguras fixas só entram se alguém pedir: sem elas o navegador distribui
  // pelo conteúdo, que é o que os relatórios do financeiro sempre fizeram.
  const colgroup = columns.some((c) => c.width)
    ? `<colgroup>${columns.map((c) => `<col${c.width ? ` style="width:${esc(c.width)}"` : ''} />`).join('')}</colgroup>`
    : '';

  const thead = columns.map((c, i) => `<th style="text-align:${alignOf(i)}">${esc(c.header)}</th>`).join('');

  const tbody = rows.length
    ? rows.map((r, idx) => {
        // Aceita a linha como matriz de células OU como { cells, note, done }.
        const cells = Array.isArray(r) ? r : (r?.cells || []);
        const note = Array.isArray(r) ? '' : (r?.note || '');
        const done = Array.isArray(r) ? false : !!r?.done;
        const tds = cells.map((cell, i) =>
          `<td class="${i === 0 ? 'c-first' : 'c'}${note ? ' has-note' : ''}" style="text-align:${alignOf(i)}">${esc(cell)}</td>`
        ).join('');
        // Zebra calculada aqui (e não por nth-child) porque as linhas de nota
        // entram no meio e desalinhariam a contagem do CSS.
        const marcas = `${idx % 2 === 1 ? ' alt' : ''}${done ? ' done' : ''}${idx === 0 ? ' first' : ''}`;
        // A nota vem numa linha própria, ocupando a largura toda: é texto
        // corrido e ficaria ilegível espremido na coluna do nome.
        const noteTr = note
          ? `<tr class="note-row${marcas}"><td colspan="${columns.length || 1}">${esc(note)}</td></tr>`
          : '';
        const par = `<tr class="task${marcas}">${tds}</tr>${noteTr}`;
        // No relatório de tarefas cada uma vira seu próprio <tbody>: é o que
        // segura a tarefa e a anotação dela na MESMA página — `page-break` na
        // <tr> sozinho deixaria a anotação órfã no alto da folha seguinte.
        return isNotes ? `<tbody class="tg">${par}</tbody>` : par;
      }).join('')
    : `<tr><td colspan="${columns.length || 1}" style="text-align:center; color:#666; padding:16px;">Nenhum registro no período/filtro selecionado.</td></tr>`;

  // Resumo: na planilha vira linha de rodapé da tabela; no relatório de tarefas
  // vira uma tarja de contagem ("Pendente: 9 · Concluído: 5"), que é como se lê
  // um apanhado de pendências.
  const summaryRows = isNotes ? '' : (summary || []).map(s =>
    `<tr class="summary-row">
      <td colspan="${Math.max(columns.length - 1, 1)}" style="text-align:right;">${esc(s.label)}</td>
      <td style="text-align:right;">${esc(s.value)}</td>
    </tr>`
  ).join('');

  const totalRow = isNotes ? '' : `
      <tr class="total-row">
        <td colspan="${columns.length || 1}" style="text-align:right;">${esc(totalLabel)}: ${rows.length}</td>
      </tr>`;

  const tally = isNotes
    ? `<div class="tally">${[...(summary || []).map((s) => `${esc(s.label)}: <strong>${esc(s.value)}</strong>`),
        `${esc(totalLabel)}: <strong>${rows.length}</strong>`].join('<span class="sep">·</span>')}</div>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — ${esc(instituicao)}</title>
  <style>
    @page { size: ${orientation}; margin: 1cm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 0; }
    .header { text-align: center; margin-bottom: 16px; }
    .header img { height: 42px; width: auto; margin-bottom: 8px; }
    .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: .5px; }
    .header h2 { margin: 4px 0 0; font-size: 13px; font-weight: normal; color: #333; }
    .info { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-bottom: 12px; border-bottom: 1.5px solid #111; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #444; padding: 5px 8px; text-align: left; font-size: 10.5px; vertical-align: middle; }
    th { background-color: #eee; font-weight: bold; text-transform: uppercase; letter-spacing: .3px; }
    thead { display: table-header-group; }  /* cabeçalho se repete a cada página */
    tbody tr.alt td { background-color: #fafafa; }
    /* A anotação é a continuação da tarefa: o par não leva traço entre si e
       não pode quebrar de página no meio. */
    tbody tr { page-break-inside: avoid; }
    td.has-note { border-bottom: none; }
    .note-row td { border-top: none; padding: 0 8px 6px 8px; font-size: 9.5px; color: #444; white-space: pre-line; }
    .summary-row td { font-weight: bold; background-color: #f2f2f2; }
    .total-row td { font-weight: bold; background-color: #e9e9e9; text-transform: uppercase; }
    .footer { text-align: center; font-size: 10px; border-top: 1px solid #999; padding-top: 6px; margin-top: 8px; color: #555; }
    @media print { .no-print { display: none !important; } }

    /* ---------------------------------------------------------------------
       VARIANTE 'notes' — relatório de tarefas com anotação.
       Sem grade: só um traço fino separando uma tarefa da outra. A tarefa é o
       que salta aos olhos; propriedade e anotação ficam em tom de apoio.
       --------------------------------------------------------------------- */
    .notes .header img { height: 38px; margin-bottom: 6px; }
    .notes .header h1 { font-size: 11.5px; font-weight: normal; color: #666; letter-spacing: .14em; }
    .notes .header h2 { margin-top: 3px; font-size: 17px; font-weight: bold; color: #111; }
    .notes th, .notes td { border: none; }
    .notes thead th { border-bottom: 1.2px solid #111; padding: 0 8px 4px; font-size: 9px; color: #333; background: none; }
    .notes tbody tr.alt td { background: none; }
    .notes td.c, .notes td.c-first { padding: 7px 8px 2px; vertical-align: top; font-size: 10.5px; color: #333; }
    .notes td.c-first { font-weight: bold; color: #111; font-size: 11px; }
    /* O traço vem no TOPO da tarefa: assim ele separa tarefa de tarefa e nunca
       cai entre a tarefa e a anotação dela. */
    .notes tbody.tg { page-break-inside: avoid; break-inside: avoid; }
    .notes tr.task td { border-top: 1px solid #ccc; }
    .notes tr.task.first td { border-top: none; }
    .notes .note-row td { padding: 1px 8px 7px 8px; font-size: 9.8px; line-height: 1.45; color: #4a4a4a; }
    .notes tr.done td.c-first { color: #6b6b6b; text-decoration: line-through; }
    .notes tr.done td.c, .notes tr.done.note-row td { color: #767676; }
    .tally { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; font-size: 10px; color: #333; border-top: 1.2px solid #111; padding-top: 5px; margin-bottom: 10px; }
    .tally .sep { color: #bbb; padding: 0 2px; }
  </style>
</head>
<body${isNotes ? ' class="notes"' : ''}>
  <div class="header">
    ${theme?.logoUrl ? `<img src="${esc(theme.logoUrl)}" alt="Logo" />` : ''}
    <h1>${esc(instituicao)}</h1>
    <h2>${esc(title)}</h2>
  </div>
  <div class="info">
    <span><strong>${esc(periodLabel)}:</strong> ${esc(periodText)}</span>
    <span><strong>Gerado por:</strong> ${esc(userName)} em ${esc(dataFormatada)} às ${esc(horaFormatada)}</span>
  </div>
  <table>
    ${colgroup}
    <thead><tr>${thead}</tr></thead>
    ${isNotes && rows.length ? tbody : `<tbody>${tbody}</tbody>`}
    ${isNotes ? '' : `<tfoot>${summaryRows}${totalRow}</tfoot>`}
  </table>
  ${tally}
  <div class="footer">${esc(instituicao)} • Relatório gerado pelo sistema em ${esc(dataFormatada)} ${esc(horaFormatada)}</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
    win.close();
  }, 300);
  return true;
}
