// Mesma lógica da tela da Escala: quando o plantão não tem horário próprio,
// usa um horário padrão conforme o período/setor.
const getNormalizedPeriod = (p) => {
    const s = (p || '').toLowerCase();
    if (s.includes('noturno')) return 'Noturno';
    if (s.includes('manhã') || s.includes('manha')) return 'Manhã';
    if (s.includes('tarde')) return 'Tarde';
    if (s.includes('diurno') || s.includes('extra') || s.includes('anestesista')) return 'Diurno';
    return 'Diurno';
};

const getDefaultTimeForPeriod = (period) => {
    switch (getNormalizedPeriod(period).toLowerCase()) {
        case 'diurno': return '07-19h';
        case 'noturno': return '19-07h';
        case 'manhã': return '07-13h';
        case 'tarde': return '13-19h';
        default: return '';
    }
};

const formatDoctorNameShort = (fullName) => {
    if (!fullName) return '';
    const prepositions = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
    const parts = fullName.trim().toLowerCase().split(' ').filter(p => Boolean(p) && !prepositions.has(p));
    if (parts.length === 0) return '';
    
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const firstName = parts[0];
    
    const femaleNames = new Set(['aline', 'gisele', 'simone', 'kelly', 'evelyn', 'carmen', 'iris', 'lais', 'ester', 'ruth', 'raquel', 'mirian', 'sueli', 'marli', 'roseli', 'cleide', 'katiusa', 'mariana', 'maria']);
    const isFemale = firstName.endsWith('a') || femaleNames.has(firstName);
    const title = isFemale ? 'Dra.' : 'Dr.';
    
    if (parts.length === 1) return `${title} ${capitalize(parts[0])}`;
    
    return `${title} ${capitalize(parts[0])} ${capitalize(parts[1])}`;
};

// Mesma paleta de cores de identidade usada na grade da tela (Escala.jsx),
// convertida para hex porque o HTML impresso não tem acesso ao Tailwind.
// bg/text/accent seguem o mesmo padrão do estilo original (tons 100/900/600).
const PDF_COLOR_THEMES = {
    slate: { bg: '#f1f5f9', text: '#0f172a', accent: '#475569' },
    gray: { bg: '#f3f4f6', text: '#111827', accent: '#4b5563' },
    zinc: { bg: '#f4f4f5', text: '#18181b', accent: '#52525b' },
    neutral: { bg: '#f5f5f5', text: '#171717', accent: '#525252' },
    stone: { bg: '#f5f5f4', text: '#1c1917', accent: '#57534e' },
    red: { bg: '#fee2e2', text: '#7f1d1d', accent: '#dc2626' },
    orange: { bg: '#ffedd5', text: '#7c2d12', accent: '#ea580c' },
    amber: { bg: '#fef3c7', text: '#78350f', accent: '#d97706' },
    yellow: { bg: '#fef9c3', text: '#713f12', accent: '#ca8a04' },
    lime: { bg: '#ecfccb', text: '#365314', accent: '#65a30d' },
    green: { bg: '#dcfce7', text: '#14532d', accent: '#16a34a' },
    emerald: { bg: '#d1fae5', text: '#064e3b', accent: '#059669' },
    teal: { bg: '#ccfbf1', text: '#134e4a', accent: '#0d9488' },
    cyan: { bg: '#cffafe', text: '#164e63', accent: '#0891b2' },
    sky: { bg: '#e0f2fe', text: '#0c4a6e', accent: '#0284c7' },
    blue: { bg: '#dbeafe', text: '#1e3a8a', accent: '#2563eb' },
    indigo: { bg: '#e0e7ff', text: '#312e81', accent: '#4f46e5' },
    violet: { bg: '#ede9fe', text: '#4c1d95', accent: '#7c3aed' },
    purple: { bg: '#f3e8ff', text: '#581c87', accent: '#9333ea' },
    fuchsia: { bg: '#fae8ff', text: '#701a75', accent: '#c026d3' },
    pink: { bg: '#fce7f3', text: '#831843', accent: '#db2777' },
    rose: { bg: '#ffe4e6', text: '#881337', accent: '#e11d48' },
};

const getPdfColorTheme = (colorName) => PDF_COLOR_THEMES[colorName] || PDF_COLOR_THEMES.slate;

const formatDoctorNameFull = (fullName, sexo) => {
    if (!fullName) return '';
    let title = 'Dr.';
    if (sexo === 'Feminino') {
        title = 'Dra.';
    } else if (!sexo) {
        const parts = fullName.trim().toLowerCase().split(' ').filter(Boolean);
        const firstName = parts[0] || '';
        const femaleNames = new Set(['aline', 'gisele', 'simone', 'kelly', 'evelyn', 'carmen', 'iris', 'lais', 'ester', 'ruth', 'raquel', 'mirian', 'sueli', 'marli', 'roseli', 'cleide', 'katiusa', 'mariana', 'maria']);
        if (firstName.endsWith('a') || femaleNames.has(firstName)) {
            title = 'Dra.';
        }
    }
    
    const capitalize = (s) => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return `${title} ${capitalize(fullName)}`;
};

export const printHospitalEscalaPdf = (hospital, assignments, activeWeeks, activeMonthLabel, activeMonth, doctors, currentUser) => {
    const hospitalName = hospital.name;
    const sectors = hospital.sectors || [];
    const theme = getPdfColorTheme(hospital.color);
    
    // Encontrar apenas os médicos que tem plantão neste mês neste hospital
    const scheduledDoctorNames = new Set();
    activeWeeks.forEach(week => {
        week.days.forEach((day, dayIndex) => {
            if (!day.isOutOfMonth) {
                sectors.forEach((_, sIdx) => {
                    const slotId = `${activeMonth}-${week.id}-${hospital.id}-${sIdx}-${dayIndex}`;
                    const assignedData = assignments[slotId];
                    if (assignedData && assignedData.doctorName) {
                        scheduledDoctorNames.add(assignedData.doctorName);
                    }
                });
            }
        });
    });

    const activeDoctors = (doctors || []).filter(d => d.status === 'Ativo' && scheduledDoctorNames.has(d.name));

    let weeksHtml = '';
    
    activeWeeks.forEach((week) => {
        let theadRow = `
            <tr>
                <th colspan="2" style="background-color: transparent; border: none;"></th>
        `;
        
        week.days.forEach((day) => {
            const dateStr = day.date.split('/')[0];
            const dayName = day.dayName.substring(0, 3).toUpperCase();
            
            if (day.isOutOfMonth) {
                theadRow += `<th style="background-color: transparent; border: none; width: 12%;"></th>`;
            } else {
                theadRow += `<th style="width: 12%; padding: 4px; text-align: center; border: none;">
                    <div style="font-size: 10px; font-weight: bold; color: #334155;">${dateStr}</div>
                    <div style="font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase;">${dayName}</div>
                </th>`;
            }
        });
        
        theadRow += `</tr>`;
        
        let tbodyHtml = '';

        // Mesma ordem da tela: mantém a ordem configurada dos setores, mas
        // empurra qualquer linha de período Noturno para o fim (sort estável).
        // sIdx original é preservado → os slotId continuam corretos.
        const orderedSectors = sectors
            .map((sector, sIdx) => ({ sector, sIdx }))
            .sort((a, b) => (getNormalizedPeriod(a.sector) === 'Noturno' ? 1 : 0) - (getNormalizedPeriod(b.sector) === 'Noturno' ? 1 : 0));

        orderedSectors.forEach(({ sector, sIdx }, renderIdx) => {
            let rowHtml = `<tr>`;

            // Coluna Hospital (Merge across sectors) — na primeira linha renderizada
            if (renderIdx === 0) {
                rowHtml += `<td rowspan="${sectors.length}" style="width: 10%; background-color: ${theme.bg}; border: 1px solid #ffffff; text-align: center; font-weight: 900; color: ${theme.text}; font-size: 11px; padding: 4px;">${hospitalName.toUpperCase()}</td>`;
            }

            // Coluna Tipo (Setor)
            rowHtml += `<td style="width: 10%; background-color: ${theme.bg}; border: 1px solid #ffffff; text-align: center; font-weight: bold; color: ${theme.text}; font-size: 8px; padding: 4px;">${sector.toUpperCase()}</td>`;
            
            // Colunas dos Dias
            week.days.forEach((day, dayIndex) => {
                if (day.isOutOfMonth) {
                    rowHtml += `<td style="background-color: #f8fafc; border: 1px solid #ffffff;"></td>`;
                } else {
                    const slotId = `${activeMonth}-${week.id}-${hospital.id}-${sIdx}-${dayIndex}`;
                    const assignedData = assignments[slotId];
                    
                    if (assignedData && assignedData.appearance?.uncovered) {
                        // Vaga sem plantonista: sai em vermelho para o hospital enxergar o buraco.
                        const periodoVaga = assignedData.period || sector;
                        const timeVaga = assignedData.time || getDefaultTimeForPeriod(periodoVaga);
                        rowHtml += `<td style="background-color: #fee2e2; border: 1px solid #ffffff; text-align: center; padding: 2px 1px;">
                            <div style="font-size: 8px; font-weight: 900; color: #9f1239; margin-bottom: 1px; line-height: 1;">DESCOBERTO</div>
                            <div style="font-size: 6.5px; font-weight: bold; color: #e11d48;">${timeVaga}</div>
                        </td>`;
                    } else if (assignedData && assignedData.doctorName) {
                        const formattedName = formatDoctorNameShort(assignedData.doctorName);
                        const periodo = assignedData.period || sector;
                        const time = assignedData.time || getDefaultTimeForPeriod(periodo);
                        // Observações/subtítulo são anotações internas: não saem no PDF do hospital
                        rowHtml += `<td style="background-color: ${theme.bg}; border: 1px solid #ffffff; text-align: center; padding: 2px 1px;">
                            <div style="font-size: 8px; font-weight: 900; color: ${theme.text}; margin-bottom: 1px; line-height: 1;">${formattedName}</div>
                            <div style="font-size: 6.5px; font-weight: bold; color: ${theme.accent};">${time}</div>
                        </td>`;
                    } else {
                        rowHtml += `<td style="background-color: #f1f5f9; border: 1px solid #ffffff;"></td>`;
                    }
                }
            });
            
            rowHtml += `</tr>`;
            tbodyHtml += rowHtml;
        });

        weeksHtml += `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px; font-family: sans-serif;">
                <thead>${theadRow}</thead>
                <tbody>${tbodyHtml}</tbody>
            </table>
        `;
    });

    // Contatos (Doctors Footer - Página 2)
    let contatosHtml = '';
    const docsPerCol = Math.ceil(activeDoctors.length / 4) || 1;
    
    let columns = [[], [], [], []];
    activeDoctors.forEach((doc, idx) => {
        const colIndex = Math.floor(idx / docsPerCol);
        if (colIndex < 4) {
            columns[colIndex].push(doc);
        } else {
            columns[3].push(doc);
        }
    });

    columns.forEach(col => {
        let colHtml = `<div style="flex: 1; padding: 0 10px;">`;
        col.forEach(doc => {
            colHtml += `
                <div style="font-size: 8px; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                    <div style="font-weight: 900; color: #334155; font-size: 9px; margin-bottom: 2px;">${formatDoctorNameFull(doc.name, doc.sexo)}</div>
                    <div style="color: #64748b; font-size: 7px;">
                        ${doc.crm ? `CRM: ${doc.crm}` : ''} ${doc.rqe ? `| RQE: ${doc.rqe}` : ''}
                    </div>
                    <div style="color: #64748b; font-size: 7px; margin-top: 1px;">
                        ${doc.cpf ? `CPF: ${doc.cpf}` : ''} ${doc.telefone ? `| Tel: ${doc.telefone}` : ''}
                    </div>
                </div>
            `;
        });
        colHtml += `</div>`;
        contatosHtml += colHtml;
    });

    const dataGeracao = new Date().toLocaleDateString('pt-BR');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Escala - ${hospitalName} - ${activeMonthLabel}</title>
            <style>
                @page { size: A4 landscape; margin: 10mm; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                    margin: 0; padding: 0; 
                    color: #0f172a; 
                    background-color: #ffffff;
                }
                .container {
                    width: 100%;
                    max-width: 100%;
                    zoom: 0.95;
                }
                .header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    margin-bottom: 8px; 
                }
                .logo-left {
                    width: 150px;
                    height: 40px;
                    object-fit: contain;
                    object-position: left center;
                }
                .logo-right {
                    width: 150px;
                    height: 40px;
                    object-fit: contain;
                    object-position: right center;
                }
                .title {
                    text-align: center;
                    flex: 1;
                }
                h1 { 
                    margin: 0; 
                    font-size: 14px; 
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                h2 {
                    margin: 2px 0 0 0;
                    font-size: 11px;
                    font-weight: bold;
                    color: #475569;
                    text-transform: uppercase;
                }
                .hospital-logo-text {
                    font-weight: 900;
                    color: #b91c1c;
                    font-size: 14px;
                    text-transform: uppercase;
                    text-align: right;
                }
                
                .footer-page {
                    page-break-before: always;
                    padding-top: 20px;
                }
                .contatos-header {
                    font-size: 12px;
                    font-weight: 900;
                    margin-bottom: 15px;
                    color: #0f172a;
                    text-transform: uppercase;
                    border-bottom: 2px solid #e2e8f0;
                    padding-bottom: 5px;
                }
                .contatos-grid {
                    display: flex;
                    width: 100%;
                }
                
                .signature-area {
                    margin-top: 50px;
                    display: flex;
                    justify-content: space-around;
                    align-items: flex-end;
                }
                .signature-box {
                    text-align: center;
                    width: 250px;
                }
                .signature-line {
                    border-top: 1px solid #334155;
                    width: 100%;
                    margin: 0 auto 5px auto;
                }
                .signature-name {
                    font-size: 10px;
                    font-weight: 900;
                    color: #0f172a;
                    margin-bottom: 2px;
                }
                .signature-role {
                    font-size: 9px;
                    color: #475569;
                }
                
                .company-footer {
                    margin-top: 40px;
                    text-align: center;
                    font-size: 8px;
                    font-weight: bold;
                    color: #64748b;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 5px;
                }
                @media print {
                    .container { zoom: 95%; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- PÁGINA 1: ESCALA -->
                <div class="header">
                    <img src="${window.location.origin}/logo.png" class="logo-left" alt="MedCode" onerror="this.style.display='none'" />
                    
                    <div class="title">
                        <h1>ESCALA MENSAL - ANESTESISTAS</h1>
                        <h2>${activeMonthLabel}</h2>
                    </div>
                    
                    ${hospital.logoUrl 
                        ? `<img src="${hospital.logoUrl}" class="logo-right" alt="${hospitalName}" />` 
                        : `<div class="hospital-logo-text">${hospitalName}</div>`
                    }
                </div>

                ${weeksHtml}
            </div>

            <!-- PÁGINA 2: CONTATOS E ASSINATURAS -->
            <div class="container footer-page">
                <div class="contatos-header">CONTATOS MÉDICOS - ${hospitalName} (${activeMonthLabel})</div>
                <div class="contatos-grid">
                    ${contatosHtml}
                </div>
                
                <div class="signature-area">

                    
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-name">Assinatura do Responsável</div>
                        <div class="signature-role">Diretor Operacional</div>
                    </div>
                </div>

                <div class="company-footer">
                                        <div>MedCode Assessoria - CNPJ 68.955.873/0001-91</div>
                    <div>Escala gerada em: ${dataGeracao}</div>
                </div>
            </div>

            <script>
                window.onload = () => { 
                    setTimeout(() => {
                        window.print(); 
                        window.close(); 
                    }, 500);
                }
            </script>
        </body>
        </html>
    `;

    const printWindow = window.open('', '', 'width=1100,height=800');
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
};

// PDF individual: mostra onde um médico específico está escalado no mês,
// percorrendo todos os hospitais/setores (ou apenas os hospitais passados,
// se o filtro de hospital também estiver ativo).
export const printMedicoEscalaPdf = (doctorName, hospitais, assignments, activeWeeks, activeMonthLabel, activeMonth, doctors, currentUser) => {
    if (!doctorName) return;

    const getDoctorOf = (slotData) => (typeof slotData === 'string' ? slotData : slotData?.doctorName);
    const docObj = (doctors || []).find(d => d.name === doctorName) || {};
    const nomeFormatado = formatDoctorNameFull(doctorName, docObj.sexo);

    let weeksHtml = '';
    let totalPlantoes = 0;
    let weeksRendered = 0;
    let totalRows = 0;

    activeWeeks.forEach((week) => {
        // Linhas (hospital + setor) onde o médico tem ao menos um plantão nesta semana
        const rows = [];
        (hospitais || []).forEach(h => {
            // Setores do médico neste hospital/semana, com Noturno sempre por último
            // (sort estável, igual à tela). sIdx original preservado p/ o slotId.
            const hRows = [];
            (h.sectors || []).forEach((sector, sIdx) => {
                const temPlantao = week.days.some((day, dayIndex) => {
                    if (day.isOutOfMonth) return false;
                    const slotId = `${activeMonth}-${week.id}-${h.id}-${sIdx}-${dayIndex}`;
                    return getDoctorOf(assignments[slotId]) === doctorName;
                });
                if (temPlantao) hRows.push({ hospital: h, sector, sIdx });
            });
            hRows.sort((a, b) => (getNormalizedPeriod(a.sector) === 'Noturno' ? 1 : 0) - (getNormalizedPeriod(b.sector) === 'Noturno' ? 1 : 0));
            rows.push(...hRows);
        });

        if (rows.length === 0) return; // semana sem plantões do médico: não imprime
        weeksRendered++;
        totalRows += rows.length;

        let theadRow = `<tr><th style="background-color: transparent; border: none;"></th>`;
        week.days.forEach((day) => {
            if (day.isOutOfMonth) {
                theadRow += `<th style="background-color: transparent; border: none; width: 12%;"></th>`;
            } else {
                const dateStr = day.date.split('/')[0];
                const dayName = day.dayName.substring(0, 3).toUpperCase();
                theadRow += `<th style="width: 12%; padding: 4px; text-align: center; border: none;">
                    <div style="font-size: 10px; font-weight: bold; color: #334155;">${dateStr}</div>
                    <div style="font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase;">${dayName}</div>
                </th>`;
            }
        });
        theadRow += `</tr>`;

        let tbodyHtml = '';
        rows.forEach(({ hospital, sector, sIdx }) => {
            const theme = getPdfColorTheme(hospital.color);
            let rowHtml = `<tr>`;
            rowHtml += `<td style="width: 16%; background-color: ${theme.bg}; border: 1px solid #ffffff; text-align: center; font-weight: bold; color: ${theme.text}; font-size: 8px; padding: 4px;">${(sector || '').toUpperCase()}</td>`;

            week.days.forEach((day, dayIndex) => {
                if (day.isOutOfMonth) {
                    rowHtml += `<td style="background-color: #f8fafc; border: 1px solid #ffffff;"></td>`;
                    return;
                }
                const slotId = `${activeMonth}-${week.id}-${hospital.id}-${sIdx}-${dayIndex}`;
                const assignedData = assignments[slotId];
                if (getDoctorOf(assignedData) === doctorName) {
                    totalPlantoes++;
                    const periodo = (typeof assignedData === 'object' && assignedData?.period) ? assignedData.period : sector;
                    const time = (typeof assignedData === 'object' && assignedData?.time) ? assignedData.time : getDefaultTimeForPeriod(periodo);
                    rowHtml += `<td style="background-color: ${theme.bg}; border: 1px solid #ffffff; text-align: center; padding: 2px 1px;">
                        <div style="font-size: 7.5px; font-weight: 900; color: ${theme.text}; line-height: 1.1; text-transform: uppercase;">${(hospital.name || '').toUpperCase()}</div>
                        <div style="font-size: 6.5px; font-weight: bold; color: ${theme.accent}; margin-top: 1px;">${time}</div>
                    </td>`;
                } else {
                    rowHtml += `<td style="background-color: #f1f5f9; border: 1px solid #ffffff;"></td>`;
                }
            });
            rowHtml += `</tr>`;
            tbodyHtml += rowHtml;
        });

        weeksHtml += `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px; font-family: sans-serif;">
                <thead>${theadRow}</thead>
                <tbody>${tbodyHtml}</tbody>
            </table>
        `;
    });

    if (!weeksHtml) {
        weeksHtml = `<div style="text-align: center; padding: 40px; color: #64748b; font-size: 12px; font-weight: bold;">Nenhum plantão encontrado para ${nomeFormatado} em ${activeMonthLabel}.</div>`;
    }

    // Zoom adaptativo para caber tudo em uma única página (A4 paisagem),
    // proporcional à quantidade de linhas/semanas com plantão.
    const contentUnits = totalRows + weeksRendered * 1.4 + 8;
    const pageZoom = Math.max(0.45, Math.min(0.88, 29 / contentUnits));

    const dataGeracao = new Date().toLocaleDateString('pt-BR');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Escala - ${nomeFormatado} - ${activeMonthLabel}</title>
            <style>
                @page { size: A4 landscape; margin: 8mm; }
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #0f172a; background-color: #ffffff; }
                .container { width: 100%; max-width: 100%; zoom: ${pageZoom}; }
                table { page-break-inside: avoid; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
                .logo-left { width: 150px; height: 40px; object-fit: contain; object-position: left center; }
                .title { text-align: center; flex: 1; }
                h1 { margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
                h2 { margin: 2px 0 0 0; font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; }
                .doctor-tag { font-weight: 900; color: #4338ca; font-size: 13px; text-transform: uppercase; text-align: right; max-width: 200px; }
                .resumo { font-size: 10px; color: #475569; margin: 4px 0 8px 0; font-weight: bold; }
                .signature-area { margin-top: 14px; display: flex; justify-content: space-around; align-items: flex-end; page-break-inside: avoid; }
                .signature-box { text-align: center; width: 250px; }
                .signature-line { border-top: 1px solid #334155; width: 100%; margin: 0 auto 5px auto; }
                .signature-name { font-size: 10px; font-weight: 900; color: #0f172a; margin-bottom: 2px; }
                .signature-role { font-size: 9px; color: #475569; }
                .company-footer { margin-top: 8px; text-align: center; font-size: 8px; font-weight: bold; color: #64748b; display: flex; flex-direction: column; align-items: center; gap: 3px; page-break-inside: avoid; }
                @media print { .container { zoom: ${pageZoom}; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${window.location.origin}/logo.png" class="logo-left" alt="MedCode" onerror="this.style.display='none'" />
                    <div class="title">
                        <h1>ESCALA INDIVIDUAL - ANESTESISTA</h1>
                        <h2>${activeMonthLabel}</h2>
                    </div>
                    <div class="doctor-tag">${nomeFormatado}</div>
                </div>

                <div class="resumo">
                    ${nomeFormatado}
                    ${docObj.crm ? ` &nbsp;|&nbsp; CRM: ${docObj.crm}` : ''}
                    ${docObj.rqe ? ` &nbsp;|&nbsp; RQE: ${docObj.rqe}` : ''}
                    &nbsp;|&nbsp; Total de plantões no mês: ${totalPlantoes}
                </div>

                ${weeksHtml}

                <div class="signature-area">
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-name">Assinatura do Responsável</div>
                        <div class="signature-role">Diretor Operacional</div>
                    </div>
                </div>

                <div class="company-footer">
                                        <div>MedCode Assessoria - CNPJ 68.955.873/0001-91</div>
                    <div>Escala gerada em: ${dataGeracao}</div>
                </div>
            </div>

            <script>
                window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }
            </script>
        </body>
        </html>
    `;

    const printWindow = window.open('', '', 'width=1100,height=800');
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
};
