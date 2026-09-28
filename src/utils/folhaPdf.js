// Extensão explícita para o arquivo rodar também no node puro, além do Vite.
import { calcRepasseItem, getOutrosDescricao } from './escalaValores.js';

/*
 * PDF da Folha de Ponto — o documento, sem a tela.
 *
 * Este gerador morava dentro de Escala.jsx e só podia ser usado por quem já
 * estava lá dentro: quem administra a escala. O médico assinava a folha e
 * nunca mais conseguia abrir o documento — a assinatura sumia do card de
 * Pendências e não havia segunda porta. Extraído para cá, o MESMO papel (mesmo
 * cabeçalho, mesmas tabelas, mesmo carimbo de assinatura) serve as duas telas:
 * a Folha de Ponto do administrativo e o Meus Repasses do médico.
 *
 * Nada aqui lê banco nem contexto de React: quem chama resolve CRM e logos e
 * passa prontos. É de propósito — assim a mesma função gera uma folha, o lote
 * de um hospital ou o mês inteiro, sem carregar a tela junto.
 */

// CSS único das Folhas de Ponto (usado por todos os geradores de PDF).
// Ajustado para caber em 1 folha A4 e dar espaço à assinatura.
export const FOLHA_PDF_STYLES = `
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: sans-serif; padding: 0; color: #000; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .folha-page { page-break-after: always; }
    .folha-page:last-child { page-break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 16px; }
    .header h2 { font-size: 15px; margin: 0 0 14px 0; }
    .details p { margin: 3px 0; font-size: 10.5px; font-weight: bold; }
    .details span { font-weight: normal; }
    .logos { display: flex; align-items: center; justify-content: flex-end; gap: 14px; flex-shrink: 0; }
    .logos img { max-height: 60px; max-width: 130px; object-fit: contain; }
    .logo { width: 68px; height: 68px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th, td { border: 1px solid #000; padding: 5px 6px; font-size: 10.5px; }
    th { font-weight: bold; text-align: center; background-color: #fafafa; }
    .total-row td { border: none; padding-top: 8px; font-weight: bold; font-size: 11px; text-align: right; }
    .signature-box { margin-top: 44px; text-align: center; font-size: 11px; page-break-inside: avoid; }
    .signature-line { border-top: 1px solid #000; width: 300px; margin: 78px auto 8px auto; }
`;

// "07" / "19h" / "7" -> "07:00"; "07:30" -> "07:30"
export const formatFolhaHour = (token) => {
    if (token === undefined || token === null) return '';
    let t = String(token).trim().replace(/[hH]/g, '');
    if (!t) return '';
    if (t.includes(':')) {
        const [hh, mm] = t.split(':');
        return `${hh.padStart(2, '0')}:${(mm || '00').padStart(2, '0')}`;
    }
    return `${t.padStart(2, '0')}:00`;
};

// Duração em horas entre dois horários "HH:MM" (vira madrugada quando saída <= entrada)
export const folhaHoursBetween = (entrada, saida) => {
    if (!entrada || !saida || !entrada.includes(':') || !saida.includes(':')) return null;
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
    let diff = toMin(saida) - toMin(entrada);
    if (diff <= 0) diff += 24 * 60;
    return diff / 60;
};

const brl = (v) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const fmtDataBR = (iso) => {
    if (!iso) return '-';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return (y && m && d) ? `${d}/${m}/${y}` : '-';
};

const FALLBACK_LOGO_SVG = `
                        <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M50 10 C30 10 10 30 10 50 C10 70 30 90 50 90 C70 90 90 70 90 50 C90 30 70 10 50 10 Z" stroke="#0284c7" stroke-width="8" stroke-linecap="round"/>
                            <path d="M35 70 C35 55 65 55 65 70" stroke="#0284c7" stroke-width="8" stroke-linecap="round"/>
                            <circle cx="50" cy="40" r="8" fill="#0284c7"/>
                        </svg>`;

/*
 * Uma folha (uma página A4). Devolve o HTML do miolo — sem <html>/<style> —
 * para que o chamador possa emendar várias páginas num PDF só.
 *
 * `shifts` é o formato da folha de ponto: { displayDate, time, val, outros,
 * subtitle, financial: { extraItems } }.
 */
export const buildFolhaHtml = ({
    doctorName, hospitalName, crm = '', shifts = [], withValue = true,
    signature = null, hospitalLogoUrl = '', brandLogoUrl = '',
}) => {
    // Plantões "Outros" saem numa tabela simplificada (Data | Descrição | Valor)
    // em vez da tabela tradicional de ponto (Entrada/Saída/Horas).
    const normalShifts = shifts.filter(a => !a.outros);
    const outrosShifts = shifts.filter(a => a.outros);

    let rowsHtml = '';
    let totalVal = 0;

    // Plantões do mesmo dia ficam na MESMA linha: diurno (07:00–19:00) + noturno
    // (19:00–07:00) viram "24 horas" e somam os valores (ex.: 2x plantão).
    const parseDateKey = (d) => { const [dd, mm] = (d || '99/99').split('/').map(Number); return (mm || 99) * 100 + (dd || 99); };
    const startMin = (a) => {
        const tp = a.time ? a.time.split('-').map(t => t.trim()) : [];
        const ent = formatFolhaHour(tp[0]);
        if (!ent.includes(':')) return 9999;
        const [h, m] = ent.split(':').map(Number);
        return h * 60 + (m || 0);
    };
    const sortedNormal = [...normalShifts].sort((a, b) =>
        parseDateKey(a.displayDate) - parseDateKey(b.displayDate) || startMin(a) - startMin(b)
    );

    const byDate = {};
    const dateOrder = [];
    sortedNormal.forEach(a => {
        const key = a.displayDate || '-';
        if (!byDate[key]) { byDate[key] = []; dateOrder.push(key); }
        byDate[key].push(a);
    });

    dateOrder.forEach(dateKey => {
        const dayShifts = byDate[dateKey];
        // Agrupa em pares (2 pares de Entrada/Saída por linha).
        for (let i = 0; i < dayShifts.length; i += 2) {
            const pair = dayShifts.slice(i, i + 2);
            const cells = ['', '', '', ''];
            let totalHours = 0;
            let rowVal = 0;
            // Um plantão já pago dentro da linha marca a linha inteira (o
            // par diurno+noturno divide a mesma linha); o quadro embaixo detalha
            // dia a dia.
            let temAvista = false;
            pair.forEach((s, idx) => {
                if (s.avista?.valor > 0) temAvista = true;
                const tp = s.time ? s.time.split('-').map(t => t.trim()) : [];
                const ent = formatFolhaHour(tp[0]);
                const sai = formatFolhaHour(tp[1]);
                cells[idx * 2] = ent;
                cells[idx * 2 + 1] = sai;
                const h = folhaHoursBetween(ent, sai);
                totalHours += (h != null ? h : 12);
                rowVal += (s.val || 0);
            });
            totalVal += rowVal;
            const horasLabel = `${Number.isInteger(totalHours) ? totalHours : totalHours.toFixed(1)} horas`;
            rowsHtml += `
                <tr>
                    <td style="text-align:center">${dateKey || '-'}</td>
                    <td style="text-align:center">${cells[0]}</td>
                    <td style="text-align:center">${cells[1]}</td>
                    <td style="text-align:center">${cells[2]}</td>
                    <td style="text-align:center">${cells[3]}</td>
                    <td style="text-align:center">${horasLabel}</td>
                    ${withValue ? `<td style="text-align:right">R$ ${brl(rowVal)}${temAvista ? ' *' : ''}</td>` : ''}
                </tr>
            `;
        }
    });

    let outrosRowsHtml = '';
    outrosShifts.forEach(a => {
        const items = a?.financial?.extraItems || [];
        // Cada linha do "Mais Opções" vira sua própria linha na folha, com seu
        // próprio valor (repasse); o total geral só aparece na linha de baixo.
        if (items.length > 0) {
            items.forEach(it => {
                const itemVal = calcRepasseItem(it);
                totalVal += itemVal;
                outrosRowsHtml += `
                <tr>
                    <td style="text-align:center; width:90px">${a.displayDate || '-'}</td>
                    <td style="text-align:left">${(it.descricao || '').trim() || '-'}</td>
                    ${withValue ? `<td style="text-align:right; width:110px">R$ ${brl(itemVal)}</td>` : ''}
                </tr>
            `;
            });
        } else {
            totalVal += (a.val || 0);
            outrosRowsHtml += `
                <tr>
                    <td style="text-align:center; width:90px">${a.displayDate || '-'}</td>
                    <td style="text-align:left">${getOutrosDescricao(a)}</td>
                    ${withValue ? `<td style="text-align:right; width:110px">R$ ${brl(a.val)}</td>` : ''}
                </tr>
            `;
        }
    });

    const totalRowHtml = (cols) => withValue ? `
                        <tr class="total-row">
                            <td colspan="${cols}"></td>
                            <td>R$ ${brl(totalVal)}</td>
                        </tr>` : '';

    // Tabela tradicional (só se houver plantões normais). O total geral fica na última tabela.
    const normalTableHtml = normalShifts.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>DATA</th>
                            <th>ENTRADA</th>
                            <th>SAÍDA</th>
                            <th>ENTRADA</th>
                            <th>SAÍDA</th>
                            <th>HORAS</th>
                            ${withValue ? '<th>VALOR</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        ${outrosShifts.length === 0 ? totalRowHtml(6) : ''}
                    </tbody>
                </table>` : '';

    const outrosTableHtml = outrosShifts.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th style="width:90px">DATA</th>
                            <th>DESCRIÇÃO</th>
                            ${withValue ? '<th style="width:110px">VALOR</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${outrosRowsHtml}
                        ${totalRowHtml(2)}
                    </tbody>
                </table>` : '';

    /*
     * Quadro do que já foi pago — e o asterisco que o acompanha na tabela.
     *
     * Só no PDF COM VALOR. O PDF sem valor vai para o hospital, e pagamento à
     * fora do fechamento é assunto interno entre a empresa e o médico: nenhuma marca dele
     * pode aparecer lá.
     *
     * Só aparece quando existe adiantamento, e é o que evita a dúvida: o
     * médico vê o total do que fez, o que já recebeu (com o dia de cada
     * pagamento) e quanto ainda entra no repasse do mês. Sem isso ele
     * receberia 14 mil por uma folha que fecha em 16 mil, e ligaria — com
     * razão.
     */
    const avistaShifts = shifts.filter(a => a.avista?.valor > 0);
    const totalAvista = avistaShifts.reduce((sum, a) => sum + (Number(a.avista.valor) || 0), 0);
    const avistaHtml = (withValue && avistaShifts.length > 0) ? `
                <table style="margin-top:16px">
                    <thead>
                        <tr>
                            <th colspan="3" style="text-align:left; background-color:#f0f0f0">JÁ PAGO (adiantado durante o mês)</th>
                        </tr>
                        <tr>
                            <th style="width:110px">PLANTÃO</th>
                            <th>PAGO EM</th>
                            <th style="width:110px">VALOR</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${avistaShifts.map(a => `
                        <tr>
                            <td style="text-align:center">${a.displayDate || '-'}</td>
                            <td style="text-align:center">${fmtDataBR(a.avista.data)}</td>
                            <td style="text-align:right">R$ ${brl(a.avista.valor)}</td>
                        </tr>`).join('')}
                        <tr class="total-row">
                            <td colspan="2" style="text-align:right">Total da folha</td>
                            <td>R$ ${brl(totalVal)}</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="2" style="text-align:right">(−) Já pago</td>
                            <td>R$ ${brl(totalAvista)}</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="2" style="text-align:right; font-size:12px">= A receber no repasse do mês</td>
                            <td style="font-size:12px">R$ ${brl(totalVal - totalAvista)}</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="3" style="text-align:left; font-weight:normal; font-size:9.5px">* dias marcados com asterisco na tabela acima já foram pagos.</td>
                        </tr>
                    </tbody>
                </table>` : '';

    // Ordem: hospital à esquerda, MedCode no canto direito.
    const logosHtml = `
                    <div class="logos">
                        ${hospitalLogoUrl ? `<img src="${hospitalLogoUrl}" alt="Logo do hospital" />` : ''}
                        ${brandLogoUrl ? `<img src="${brandLogoUrl}" alt="MedCode" />` : FALLBACK_LOGO_SVG}
                    </div>`;

    // Quando já houver assinatura eletrônica (Nível 1) registrada para esta
    // folha, o carimbo digital substitui a linha em branco de assinar a caneta.
    const signatureBoxHtml = signature?.status === 'assinado' ? `
                <div class="signature-box" style="margin-top:32px">
                    ${signature.signature_image ? `<img src="${signature.signature_image}" style="max-height:70px; max-width:280px; display:block; margin:0 auto 6px auto;" />` : ''}
                    <p style="font-weight:bold">✓ ASSINADO ELETRONICAMENTE</p>
                    <p style="font-weight:normal; margin-top:6px">
                        ${doctorName} — ${new Date(signature.signed_at).toLocaleString('pt-BR')}<br/>
                        IP ${signature.ip_address || '—'} · Hash ${(signature.content_hash || '').slice(0, 12)}…
                    </p>
                </div>` : `
                <div class="signature-box">
                    <p>RECONHEÇO AS INFORMAÇÕES CONSTANTES NESTA FOLHA DE PONTO.</p>
                    <div class="signature-line"></div>
                    <p>ASSINATURA E CARIMBO</p>
                </div>`;

    return `
            <div class="folha-page">
                <div class="header">
                    <div style="flex:1; min-width:0">
                        <h2>FOLHA DE PONTO - SERVIÇO DE ANESTESIA</h2>
                        <div class="details">
                            <p>EMPRESA: <span>MEDCODE ASSESSORIA</span></p>
                            <p>CNPJ: <span>68.955.873/0001-91</span></p>
                            <p>LOCAL: <span>${hospitalName}</span></p>
                            <p>MÉDICO: <span>${doctorName}</span></p>
                            <p>ESPECIALIDADE: <span>Anestesiologista</span></p>
                            <p>CRM: <span>${crm}</span></p>
                        </div>
                    </div>
                    ${logosHtml}
                </div>
                ${normalTableHtml}
                ${outrosTableHtml}
                ${avistaHtml}
                ${signatureBoxHtml}
            </div>
        `;
};

/*
 * Abre a janela de impressão com uma ou mais folhas.
 *
 * O bloqueador de pop-up devolve null em vez de janela — sem esta checagem o
 * clique morre calado e a pessoa fica achando que o sistema travou.
 */
/*
 * O documento completo, pronto para ser exibido (sem o script de impressão).
 *
 * Existe para o médico assinar olhando a FOLHA, e não um resumo dela: o modal de
 * assinatura embute exatamente este HTML. O que ele vê ali é, caractere por
 * caractere, o que sai no PDF.
 */
export const buildFolhaDocumento = ({ title, pagesHtml }) => `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>${title}</title>
                    <style>${FOLHA_PDF_STYLES}
                    /* Na tela o papel não tem margem de impressora; no PDF o @page manda. */
                    body { padding: 14px; }

                    /*
                     * Celular. O documento é desenhado para A4 (larguras generosas,
                     * cabeçalho em duas colunas, sete colunas de tabela); espremido
                     * em 360px o título quebra em cinco linhas e a coluna VALOR sai
                     * da tela — foi assim que o médico viu na primeira vez.
                     *
                     * Aqui ele se reorganiza SÓ NA TELA: logos em cima, dados em
                     * largura inteira, tipos menores para as sete colunas caberem.
                     * O @page e a impressão continuam intocados, então o papel sai
                     * igual ao de sempre.
                     */
                    @media (max-width: 700px) {
                        body { padding: 10px; font-size: 10px; }
                        .header { flex-direction: column-reverse; align-items: stretch; gap: 10px; margin-bottom: 12px; }
                        .header h2 { font-size: 12.5px; margin-bottom: 8px; line-height: 1.25; }
                        .logos { justify-content: flex-start; gap: 10px; }
                        .logos img { max-height: 34px; max-width: 88px; }
                        .logo { width: 40px; height: 40px; }
                        .details p { font-size: 9.5px; margin: 2px 0; }
                        table { margin-top: 8px; width: 100%; }
                        th, td { padding: 3px 3px; font-size: 8.5px; }
                        /* Valor não quebra: "R$" numa linha e o número na outra é
                           pior de ler do que uma fonte menor. */
                        th:last-child, td:last-child { white-space: nowrap; }
                        .total-row td { font-size: 9.5px; padding-top: 6px; white-space: nowrap; }
                        .signature-box { margin-top: 20px; font-size: 9.5px; }
                        .signature-line { width: 80%; margin-top: 40px; }
                    }
                    </style>
                </head>
                <body>
                    ${pagesHtml}
                </body>
                </html>
            `;

export const printFolhaPages = ({ title, pagesHtml }) => {
    const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${title}</title>
                    <style>${FOLHA_PDF_STYLES}</style>
                </head>
                <body>
                    ${pagesHtml}
                    <script>window.onload = () => { window.print(); window.close(); }</script>
                </body>
                </html>
            `;
    const printWindow = window.open('', '', 'width=900,height=900');
    if (!printWindow) return false;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
};
