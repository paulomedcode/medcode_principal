import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// Garante que as fontes virtuais sejam carregadas
if (pdfFonts && pdfFonts.pdfMake) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
}

const getHeader = (titulo, customHeader) => {
    return {
        stack: [
            {
                text: customHeader || 'HOSPITAL MUNICIPAL / SANTA CASA',
                fontSize: 10,
                color: '#334155',
                alignment: 'right',
                margin: [0, 0, 0, 5]
            },
            {
                text: titulo,
                fontSize: 12,
                bold: true,
                color: '#0f172a',
                alignment: 'right'
            }
        ],
        margin: [0, 0, 0, 20]
    };
};

const getFooter = (medico, customFooter) => {
    return {
        stack: [
            {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }],
                margin: [0, 20, 0, 10]
            },
            {
                columns: [
                    {
                        text: [
                            { text: `Médico(a): `, bold: true }, medico, '\n',
                            { text: `Emissão: `, bold: true }, new Date().toLocaleString('pt-BR'), '\n',
                            { text: customFooter || '', fontSize: 8, color: '#64748b' }
                        ],
                        fontSize: 9,
                        color: '#334155',
                        width: '*'
                    },
                    {
                        text: '_________________________________________\nAssinatura do Médico',
                        alignment: 'center',
                        fontSize: 9,
                        width: 'auto',
                        margin: [0, 20, 0, 0]
                    }
                ]
            }
        ],
        margin: [0, 20, 0, 0]
    };
};

const getQuadroControleEspecial = () => {
    return {
        columns: [
            {
                width: '50%',
                stack: [
                    { text: 'IDENTIFICAÇÃO DO COMPRADOR', fontSize: 9, bold: true, margin: [0, 0, 0, 5] },
                    { text: 'Nome: _________________________________________', fontSize: 9, margin: [0, 0, 0, 5] },
                    { text: 'Identidade: __________________ Órgão Emissor: ______', fontSize: 9, margin: [0, 0, 0, 5] },
                    { text: 'Endereço: _______________________________________', fontSize: 9, margin: [0, 0, 0, 5] },
                    { text: 'Cidade: _____________________ UF: ____ Telefone: ___', fontSize: 9 }
                ],
                margin: [0, 0, 10, 0],
                padding: [10, 10, 10, 10],
                style: 'quadroBorder'
            },
            {
                width: '50%',
                stack: [
                    { text: 'IDENTIFICAÇÃO DO FORNECEDOR', fontSize: 9, bold: true, margin: [0, 0, 0, 5] },
                    { text: '\n\n', fontSize: 9 },
                    { text: '_________________________________________', fontSize: 9, alignment: 'center', margin: [0, 0, 0, 5] },
                    { text: 'Assinatura do Farmacêutico / Data', fontSize: 9, alignment: 'center' }
                ],
                margin: [10, 0, 0, 0],
                padding: [10, 10, 10, 10],
                style: 'quadroBorder'
            }
        ],
        margin: [0, 30, 0, 0]
    };
};

export const imprimirReceitaPdf = (paciente, textoOuMeds, medico, tipoReceita = null, medicasSettings = null) => {
    
    const cabecalhoCustom = medicasSettings?.cabecalho;
    const rodapeCustom = medicasSettings?.rodape;

    // Constrói uma página
    const buildPage = (titulo, isControle, medsList) => {
        let contentBody = [];
        if (Array.isArray(medsList)) {
            contentBody = {
                ol: medsList.map(m => [
                    { text: m.nome, fontSize: 12, bold: true, margin: [0, 5, 0, 2] },
                    { text: `Uso: ${m.posologia || 'Conforme orientação médica'}`, fontSize: 11, color: '#475569', margin: [0, 0, 0, 15] }
                ])
            };
        } else {
            contentBody = {
                text: medsList,
                fontSize: 12,
                lineHeight: 1.5,
                margin: [0, 0, 0, 40]
            };
        }

        const page = [
            getHeader(titulo, cabecalhoCustom),
            {
                stack: [
                    {
                        text: [
                            { text: 'Nome do Paciente: ', bold: true, fontSize: 10 },
                            { text: paciente.paciente_nome, fontSize: 10 }
                        ],
                        margin: [0, 0, 0, 2]
                    },
                    {
                        text: [
                            { text: 'CPF: ', bold: true, fontSize: 10 },
                            { text: paciente.cpf || 'Não Informado', fontSize: 10 }
                        ],
                        margin: [0, 0, 0, 10]
                    },
                    {
                        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#cbd5e1' }],
                        margin: [0, 0, 0, 20]
                    }
                ]
            },
            contentBody,
            getFooter(medico, rodapeCustom)
        ];

        if (isControle) {
            page.push(getQuadroControleEspecial());
        }

        return page;
    };

    const contentArray = [];

    if (Array.isArray(textoOuMeds)) {
        const controleMeds = textoOuMeds.filter(m => m.tipo === 'controle');
        const simplesMeds = textoOuMeds.filter(m => m.tipo !== 'controle');

        if (controleMeds.length > 0) {
            const via1 = buildPage('RECEITUÁRIO DE CONTROLE ESPECIAL\n1ª via Retenção Farmácia', true, controleMeds);
            via1[via1.length - 1].pageBreak = 'after'; 
            contentArray.push(...via1);
            
            const via2 = buildPage('RECEITUÁRIO DE CONTROLE ESPECIAL\n2ª via Paciente', false, controleMeds);
            if (simplesMeds.length > 0) {
                via2[via2.length - 1].pageBreak = 'after';
            }
            contentArray.push(...via2);
        }

        if (simplesMeds.length > 0) {
            contentArray.push(...buildPage('RECEITUÁRIO MÉDICO', false, simplesMeds));
        }

    } else {
        // Fallback for raw text
        if (tipoReceita === 'controle') {
            const via1 = buildPage('RECEITUÁRIO DE CONTROLE ESPECIAL\n1ª VIA - RETENÇÃO DA FARMÁCIA', true, textoOuMeds);
            via1[via1.length - 1].pageBreak = 'after'; 
            contentArray.push(...via1);
            const via2 = buildPage('RECEITUÁRIO DE CONTROLE ESPECIAL\n2ª VIA - ORIENTAÇÃO AO PACIENTE', false, textoOuMeds);
            contentArray.push(...via2);
        } else {
            contentArray.push(...buildPage('RECEITUÁRIO MÉDICO', false, textoOuMeds));
        }
    }

    const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        content: contentArray,
        styles: {
            headerTitle: { fontSize: 16, bold: true, color: '#1e3a8a' },
            headerDocument: { fontSize: 12, bold: true, color: '#64748b' },
            subheader: { fontSize: 12, bold: true },
            quadroBorder: {
                // Truque para simular borda no pdfmake stack (já que table tem border nativo)
            }
        },
        defaultStyle: {
            // Ajuste global se necessário
        }
    };
    pdfMake.createPdf(docDefinition).open();
};

export const imprimirExamePdf = (paciente, texto, medico, medicasSettings = null) => {
    const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        content: [
            getHeader('SOLICITAÇÃO DE EXAMES', medicasSettings?.cabecalho),
            {
                text: [
                    { text: 'Paciente: ', bold: true },
                    paciente.paciente_nome,
                    '\n',
                    { text: 'Data da Solicitação: ', bold: true },
                    new Date().toLocaleDateString('pt-BR')
                ],
                margin: [0, 0, 0, 30]
            },
            {
                text: 'Solicito o(s) seguinte(s) exame(s):',
                bold: true,
                margin: [0, 0, 0, 20]
            },
            {
                text: texto,
                fontSize: 12,
                lineHeight: 1.5,
                margin: [0, 0, 0, 40]
            },
            getFooter(medico, medicasSettings?.rodape)
        ],
        styles: {
            headerTitle: { fontSize: 16, bold: true, color: '#1e3a8a' },
            headerDocument: { fontSize: 14, bold: true, color: '#64748b' }
        }
    };
    pdfMake.createPdf(docDefinition).open();
};
