import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import toast from 'react-hot-toast';

export const gerarPdfAih = async (data) => {
    try {
        const url = '/modelo-aih.pdf';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('modelo-aih.pdf não encontrado na pasta public.');
        }
        const formPdfBytes = await response.arrayBuffer();

        const pdfDoc = await PDFDocument.load(formPdfBytes);
        const page = pdfDoc.getPages()[0];
        const { height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const mmToPt = (mm) => mm * 2.83465;
        const draw = (text, x_mm, y_mm, size = 10, maxWidth_mm = 0, color = rgb(0, 0, 0)) => {
            if (!text) return;
            const x = mmToPt(x_mm);
            const y = height - mmToPt(y_mm); // Inverte o eixo Y para começar do topo
            const opt = { x, y, size, color };
            if (maxWidth_mm > 0) {
                opt.maxWidth = mmToPt(maxWidth_mm);
                opt.lineHeight = size * 1.2;
            }
            page.drawText(String(text).toUpperCase(), opt);
        };

        const linha = {
            autorizacao: 30, // Puxando o texto mais para baixo
            estab_solicitante: 37, estab_executante: 45, paciente: 58,
            cns_nasc_sexo: 66, mae_tel: 75, endereco: 82, municipio_cep: 90,
            sintomas: 148, justificativa: 105, resultados: 165, diagnostico: 183,
            procedimento: 196, clinica_carater: 204, medico_nome: 214,
            medico_doc: 204, data_assinatura: 214,
            box_49: 272, // NOVO: Coordenada Y para o campo 49 no rodapé
            box43_nome: 261,
            box45_46_docs: 269,
            box47_48_data_crm: 281,
        };

        draw(data.estabelecimentoSolicitante || '', 14, linha.estab_solicitante);
        draw(data.cnesSolicitante || '', 168, linha.estab_solicitante);
        draw(data.estabelecimentoExecutante || '', 14, linha.estab_executante);
        draw(data.cnesExecutante || '', 168, linha.estab_executante);

        draw(data.pacienteNome || '', 14, linha.paciente);
        draw(data.prontuario || '', 168, linha.paciente);

        draw(data.cns || '', 14, linha.cns_nasc_sexo);
        const dataNascimentoPt = data.dataNascimento ? data.dataNascimento.split('-').reverse().join('/') : '';
        draw(dataNascimentoPt, 120, linha.cns_nasc_sexo);
        draw(data.sexo ? data.sexo.charAt(0) : '', 174, linha.cns_nasc_sexo);

        draw(data.nomeMae || '', 14, linha.mae_tel);
        draw(data.telefone || '', 160, linha.mae_tel);

        draw(data.endereco || '', 14, linha.endereco);

        draw(data.municipio || '', 14, linha.municipio_cep);
        // Box 14: Cód. IBGE Município
        draw(data.codigoIbge || '', 132, linha.municipio_cep, 10);
        draw(data.uf || '', 154, linha.municipio_cep);
        draw(data.cep || '', 168, linha.municipio_cep);

        const texto17 = data.sinaisSintomas ? String(data.sinaisSintomas).substring(0, 1100) : '';
        draw(texto17, 14, linha.justificativa, 8, 184); // Campo 17 (y = 105)

        const texto18 = data.justificativa ? String(data.justificativa).substring(0, 400) : '';
        draw(texto18, 14, linha.sintomas - 4, 8, 184); // Campo 18 (y = 148, sobe 4)

        const texto19 = data.resultadosProvas ? String(data.resultadosProvas).substring(0, 400) : '';
        draw(texto19, 14, linha.resultados, 8, 184); // Campo 19 (y = 165)
        const diag = data.diagnosticoInicial || '';
        draw(diag.length > 40 ? diag.substring(0, 40) + '...' : diag, 14, linha.diagnostico);
        draw(data.cid10 || '', 110, linha.diagnostico);

        draw(data.procedimento || '', 14, linha.procedimento);
        draw(data.codigoProcedimento || '', 160, linha.procedimento);

        draw(data.clinica || '', 14, linha.clinica_carater);
        draw(data.caraterInternacao || '', 60, linha.clinica_carater);

        draw(data.medico || '', 14, linha.medico_nome);

        // Campo 28: Tipo de Documento Pessoal (Marcação do "X" nos parênteses estáticos do PDF)
        const tipoDocProfessor = data.tipoDocumentoProfissional || '';
        const docValor = data.numeroDocumento || data.crm || '';
        const isCpf = tipoDocProfessor === 'CPF' || (docValor.includes('-') && docValor.length === 14);
        const isCns = tipoDocProfessor === 'CNS' || docValor.length === 15;

        // Coordenadas milimétricas para imprimir exatamente em cima de ( ) CNS e ( ) CPF
        // Ajustados mais para a esquerda pois estavam caindo fora dos parênteses estáticos do PDF
        if (isCns) draw('X', 86.5, linha.medico_doc, 10);
        else if (isCpf) draw('X', 103.5, linha.medico_doc, 10);

        // Campo 29: N do Documento
        draw(docValor, 130, linha.medico_doc);
        const dataSolPt = data.dataSolicitacao ? data.dataSolicitacao.split('-').reverse().join('/') : '';
        draw(dataSolPt, 108, linha.data_assinatura);

        // Status de Regulação (Autorização)
        let textoAuth = '';
        let corAuth = rgb(0, 0, 0);
        if (data.status === 'autorizada') {
            textoAuth = `AUTORIZADA: ${data.numeroAutorizacao}`;
            corAuth = rgb(0.1, 0.6, 0.2); // Verde
        } else if (data.status === 'devolvida') {
            textoAuth = `DEVOLVIDA: ${data.motivoDevolucao}`;
            corAuth = rgb(0.8, 0.1, 0.1); // Vermelho
        } else if (data.status === 'pendente') {
            textoAuth = 'PENDENTE DE REGULAÇÃO';
            corAuth = rgb(0.8, 0.5, 0); // Laranja
        }

        // Carimba o número de autorização ou o aviso no Bloco 49 (Rodapé)
        draw(textoAuth, 140, linha.box_49, 10, 0, corAuth);

        // ==========================================
        // ASSINATURA DO AUTORIZADOR (RODAPÉ)
        // ==========================================
        if (data.status === 'autorizada') {

            // Função draw: (Texto, Posição X, Posição Y, Tamanho da Fonte)

            // Box 43: Nome do Autorizador
            draw(data.autorizadorNome || '', 14, linha.box43_nome, 10);

            // Box 44: Cód. Órgão Emissor (Dinâmico das Configurações)
            draw(data.orgaoEmissor || '', 110, linha.box43_nome, 10);

            // Box 45 e 46: Marca X no CPF e imprime o CPF
            if (data.autorizadorCpf) {
                draw('X', 38, linha.box45_46_docs, 10); // Checkbox CPF
                draw(data.autorizadorCpf, 62, linha.box45_46_docs, 10); // Número do CPF
            }

            // Box 47: Data da Autorização
            const dataAuthPt = data.dataAutorizacao ? data.dataAutorizacao.split('T')[0].split('-').reverse().join('/') : '';
            draw(dataAuthPt, 16, linha.box47_48_data_crm, 10);

            // Box 48: Assinatura e Carimbo (CRM)
            if (data.autorizadorCrm) {
                draw(data.autorizadorCrm, 45, linha.box47_48_data_crm, 10);
            }
        }

        const pdfBytesFinal = await pdfDoc.save();
        const blob = new Blob([pdfBytesFinal], { type: 'application/pdf' });
        const finalUrl = URL.createObjectURL(blob);
        window.open(finalUrl);
    } catch (error) {
        console.error('Erro ao gerar AIH PDF:', error);
        toast.error(error.message || 'Erro ao processar o arquivo PDF da AIH.');
    }
};
