import * as pdfjsLib from 'pdfjs-dist';

// Configurar o worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export const extractTextFromPdf = async (file) => {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();

        fileReader.onload = async function () {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;

                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    // Juntar os itens com um pequeno espaço para não colar as palavras, 
                    // e quebrar linha a cada Y diferente (simulando a estrutura tabular)
                    let lastY = -1;
                    let pageText = '';
                    
                    textContent.items.forEach(item => {
                        if (lastY !== item.transform[5] && lastY !== -1) {
                            pageText += '\n';
                        }
                        pageText += item.str + ' ';
                        lastY = item.transform[5];
                    });

                    fullText += pageText + '\n\n';
                }
                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };

        fileReader.onerror = function () {
            reject(new Error("Erro ao ler o arquivo PDF"));
        };

        fileReader.readAsArrayBuffer(file);
    });
};

export const parseCelk = (text) => {
    const consultas = [];
    
    // Tentar identificar o nome do médico
    // Ex: "FULANO DE TAL / ANESTESISTA"
    let medico = '';
    const medicoMatch = text.match(/([A-ZÀ-Ú\s]+)\s*\/\s*ANESTESISTA/i);
    if (medicoMatch && medicoMatch[1]) {
        medico = medicoMatch[1].trim();
    }

    // Dividir em linhas para analisar
    const linhas = text.split('\n');
    
    // Regex para pegar os dados da linha.
    // Exemplo de linha: "Qua - 03/06/2026 14:25 Consulta (41402) RAIMUNDO ALVES MARTINS 07/09/67 (15) 99761-5849 Agendado"
    // Pode haver quebras de texto dependendo de como o PDF.js extraiu.
    
    // Vamos varrer todo o texto bruto usando uma regex global que captura a estrutura de um agendamento.
    // Como a extração do PDF pode colocar tudo na mesma linha ou separar em quebras, vamos tentar uma regex mais permissiva.
    const textLimpo = text.replace(/\n/g, ' '); // Transformar tudo numa linha só facilita a busca sequencial
    
    // Pattern: 
    // Data: (\d{2}\/\d{2}\/\d{4})
    // Hora: (\d{2}:\d{2})
    // Tipo: (Consulta|Urgencia|Urgência|Retorno) ou simplesmente pulamos até o ID
    // ID + Nome: (?:\(\d+\)\s*)?([A-ZÀ-Ú\s]+?)
    // Nasc: (\d{2}\/\d{2}\/\d{2,4})
    // Telefone: (\(\d{2}\)\s*\d{4,5}-\d{4})
    // A complexidade é que o Nome do paciente varia de tamanho, limitamos pela data de nascimento a seguir.

    const regex = /(?:(?:Seg|Ter|Qua|Qui|Sex|Sab|Dom|Sáb)\s*-\s*(\d{2}\/\d{2}\/\d{4})\s+)?(\d{2}:\d{2})\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(?:\(\d+\)\s*)?([A-ZÀ-ÖØ-öø-ÿ\s]+?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\(\d{2}\)\s*\d{4,5}-\d{4})/g;
    
    let match;
    let lastDate = null;
    while ((match = regex.exec(textLimpo)) !== null) {
        if (match[1]) {
            lastDate = match[1];
        }
        
        const currentDateStr = match[1] || lastDate;
        if (!currentDateStr) continue;

        // Converter a data de nascimento para formato YYYY-MM-DD
        let dataNascStr = null;
        if (match[5]) {
            const parts = match[5].split('/');
            if (parts.length === 3) {
                let ano = parts[2];
                if (ano.length === 2) {
                    const anoNum = parseInt(ano);
                    ano = anoNum > 30 ? `19${ano}` : `20${ano}`;
                }
                dataNascStr = `${ano}-${parts[1]}-${parts[0]}`;
            }
        }

        // Formatar a data de agendamento
        let dataAgendamento = null;
        if (currentDateStr) {
            const parts = currentDateStr.split('/');
            if (parts.length === 3) {
                dataAgendamento = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        consultas.push({
            paciente_nome: match[4].trim(),
            paciente_nascimento: dataNascStr,
            paciente_telefone: match[6].trim(),
            data_agendamento: dataAgendamento,
            horario: match[2].trim(),
            tipo: match[3].trim(),
            medico: medico
        });
    }

    // BURLANDO O SISTEMA: Espalhar as consultas para garantir intervalo mínimo de 10 minutos
    const porData = {};
    consultas.forEach(c => {
        if (!porData[c.data_agendamento]) porData[c.data_agendamento] = [];
        porData[c.data_agendamento].push(c);
    });

    Object.keys(porData).forEach(data => {
        // Ordenar pelo horário original
        porData[data].sort((a, b) => a.horario.localeCompare(b.horario));
        
        let lastTimeMin = -1;
        porData[data].forEach(c => {
            const [h, m] = c.horario.split(':').map(Number);
            let currentMin = h * 60 + m;
            
            // Se estiver colado demais (menos de 10 min de diferença), empurramos pra frente
            if (lastTimeMin !== -1 && currentMin < lastTimeMin + 10) {
                currentMin = lastTimeMin + 10;
                const newH = Math.floor(currentMin / 60).toString().padStart(2, '0');
                const newM = (currentMin % 60).toString().padStart(2, '0');
                c.horario = `${newH}:${newM}`;
            }
            lastTimeMin = currentMin;
        });
    });

    return consultas;
};

export const parseAmeInterconsulta = (text) => {
    const consultas = [];
    
    // Pegar o profissional
    let medico = '';
    const profMatch = text.match(/PROFISSIONAL:\s*([A-ZÀ-ÖØ-öø-ÿ\s]+?)(?=\s+DATA AGENDA|\n|$)/i);
    if (profMatch) {
        medico = profMatch[1].trim();
    }
    
    // Pegar a data da agenda
    let dataAgendamento = null;
    const dataMatch = text.match(/DATA AGENDA:\s*(\d{2})-(\d{2})-(\d{4})/i) || text.match(/DATA AGENDA:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (dataMatch) {
        dataAgendamento = `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}`;
    }
    
    // Procurar por horários e pacientes
    // Matcher para: 13:00 25303926 JOVELINA SILVA DE OLIVEIRA F 72 anos...
    const matches = Array.from(text.matchAll(/(\d{2}:\d{2})\s+(\d{5,12})\s+([A-ZÀ-ÖØ-öø-ÿ\s]+?)\s+(?=[FM]\b|\d+\s*anos)/g));
    
    for (let i = 0; i < matches.length; i++) {
        const horario = matches[i][1];
        const paciente_nome = matches[i][3].trim();
        
        const startIdx = matches[i].index;
        const endIdx = i + 1 < matches.length ? matches[i+1].index : text.length;
        const bloco = text.substring(startIdx, endIdx);
        
        let telefone = '';
        const telMatch = bloco.match(/(?:\(\d{2}\)\s*\d{4,5}-?\d{4})/);
        if (telMatch) {
            telefone = telMatch[0].trim();
        }
        
        consultas.push({
            paciente_nome,
            paciente_telefone: telefone,
            paciente_nascimento: null, 
            data_agendamento: dataAgendamento,
            horario,
            tipo: 'Consulta',
            medico
        });
    }

    // BURLANDO O SISTEMA: Espalhar as consultas para garantir intervalo mínimo de 10 minutos
    const porData = {};
    consultas.forEach(c => {
        if (!c.data_agendamento) return;
        if (!porData[c.data_agendamento]) porData[c.data_agendamento] = [];
        porData[c.data_agendamento].push(c);
    });

    Object.keys(porData).forEach(data => {
        porData[data].sort((a, b) => a.horario.localeCompare(b.horario));
        let lastTimeMin = -1;
        porData[data].forEach(c => {
            const [h, m] = c.horario.split(':').map(Number);
            let currentMin = h * 60 + m;
            if (lastTimeMin !== -1 && currentMin < lastTimeMin + 10) {
                currentMin = lastTimeMin + 10;
                const newH = Math.floor(currentMin / 60).toString().padStart(2, '0');
                const newM = (currentMin % 60).toString().padStart(2, '0');
                c.horario = `${newH}:${newM}`;
            }
            lastTimeMin = currentMin;
        });
    });

    return consultas;
};

export const parsePrintAgenda = (text, medicoStr = '') => {
    const consultas = [];
    
    // Pegar a data no texto: "quarta-feira, 27 de maio de 2026"
    let dataAgendamento = null;
    const meses = {
        'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
        'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
        'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
    };
    
    // Formato por extenso: "27 de maio de 2026"
    const dataMatch = text.match(/(\d{1,2})\s+de\s+([a-zà-ú]+)\s+de\s+(\d{4})/i);
    if (dataMatch && meses[dataMatch[2].toLowerCase()]) {
        const dia = dataMatch[1].padStart(2, '0');
        const mes = meses[dataMatch[2].toLowerCase()];
        const ano = dataMatch[3];
        dataAgendamento = `${ano}-${mes}-${dia}`;
    }

    // Fallback numérico: "27/05/2026" ou "27-05-2026" (ano com 2 ou 4 dígitos)
    if (!dataAgendamento) {
        const dataNum = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (dataNum) {
            const dia = dataNum[1].padStart(2, '0');
            const mes = dataNum[2].padStart(2, '0');
            let ano = dataNum[3];
            if (ano.length === 2) ano = `20${ano}`;
            dataAgendamento = `${ano}-${mes}-${dia}`;
        }
    }
    
    // Regex para pegar os agendamentos:
    // 08:00 CONSULTA IZAIAS DOS REIS CARDOSO
    // Se não tiver quebra de linha (tudo na mesma linha), ele para no próximo número.
    const regex = /(\d{2}:\d{2})\s+(?:CONSULTA\s+)?([A-ZÀ-ÖØ-öø-ÿ\s\.]+)/gi;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
        const horario = match[1];
        let paciente_nome = match[2].trim();
        
        // Nomes cortados por "..." são comuns no print, guardamos como estão
        consultas.push({
            paciente_nome,
            paciente_telefone: '', 
            paciente_nascimento: null, 
            data_agendamento: dataAgendamento,
            horario,
            tipo: 'Consulta',
            medico: medicoStr
        });
    }

    const porData = {};
    consultas.forEach(c => {
        if (!c.data_agendamento) return;
        if (!porData[c.data_agendamento]) porData[c.data_agendamento] = [];
        porData[c.data_agendamento].push(c);
    });

    Object.keys(porData).forEach(data => {
        porData[data].sort((a, b) => a.horario.localeCompare(b.horario));
        let lastTimeMin = -1;
        porData[data].forEach(c => {
            const [h, m] = c.horario.split(':').map(Number);
            let currentMin = h * 60 + m;
            if (lastTimeMin !== -1 && currentMin < lastTimeMin + 10) {
                currentMin = lastTimeMin + 10;
                const newH = Math.floor(currentMin / 60).toString().padStart(2, '0');
                const newM = (currentMin % 60).toString().padStart(2, '0');
                c.horario = `${newH}:${newM}`;
            }
            lastTimeMin = currentMin;
        });
    });

    return consultas;
};
