/*
 * Teto e compressão antes de subir arquivo.
 *
 * O que acontecia sem isto: foto de comprovante tirada no celular chega com 4
 * MB e subia inteira; PDF de 60 MB subia também; e o único limite era um `if`
 * solto de 15 MB dentro do modal do financeiro — as outras telas não tinham
 * nenhum. Storage é cota compartilhada e não tem faxina automática.
 *
 * Aqui a regra fica num lugar só:
 *   1. tipo permitido (o resto é recusado com nome e motivo, não em silêncio);
 *   2. imagem passa por compressão — 4 MB de foto viram ~300 KB sem perder
 *      legibilidade de comprovante;
 *   3. o teto é conferido DEPOIS de comprimir, porque comprimir é justamente o
 *      que costuma salvar o envio.
 *
 * O teto também existe no próprio bucket (file_size_limit), que é a trava de
 * verdade — esta aqui é a que consegue explicar o problema para quem está
 * olhando a tela.
 */
import imageCompression from 'browser-image-compression';

export const TIPOS_DOCUMENTO = [
    'application/pdf',
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];

// Word/Excel aparecem em anexo de contrato, briefing e proposta.
export const TIPOS_DOCUMENTO_AMPLO = [
    ...TIPOS_DOCUMENTO,
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MB = 1024 * 1024;

const ehImagem = (file) => String(file?.type || '').startsWith('image/');

// HEIC do iPhone não abre em canvas na maioria dos navegadores; comprimir
// quebraria o arquivo. Sobe como está (o teto continua valendo).
const comprimivel = (file) => ehImagem(file) && !/hei[cf]/i.test(file.type);

export const formatarTamanho = (bytes) =>
    bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/*
 * Devolve o arquivo pronto para subir, ou lança Error com uma frase que pode
 * ir direto para o toast.
 *
 * @param {File} file
 * @param {object} [opcoes]
 * @param {number} [opcoes.maxMB=15]
 * @param {string[]} [opcoes.tipos=TIPOS_DOCUMENTO]
 */
export async function prepararArquivo(file, { maxMB = 15, tipos = TIPOS_DOCUMENTO } = {}) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');

    // Alguns navegadores mandam type vazio (arquivo vindo de app de câmera,
    // por exemplo). Nesse caso o tipo é decidido pela extensão.
    const tipo = file.type || tipoPelaExtensao(file.name);
    if (tipos.length && !tipos.includes(tipo)) {
        throw new Error(`"${file.name}" não é um tipo aceito aqui. Envie ${descreverTipos(tipos)}.`);
    }

    let pronto = file;
    if (comprimivel(file) && file.size > 400 * 1024) {
        try {
            pronto = await imageCompression(file, {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 2000, // legível para comprovante e laudo
                useWebWorker: true,
            });
        } catch (e) {
            console.warn('Compressão falhou; sobe o original.', e);
            pronto = file;
        }
    }

    if (pronto.size > maxMB * MB) {
        throw new Error(
            `"${file.name}" tem ${formatarTamanho(pronto.size)} e o limite é ${maxMB} MB.`
        );
    }
    return pronto;
}

const PELA_EXTENSAO = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function tipoPelaExtensao(nome) {
    const ext = String(nome || '').split('.').pop().toLowerCase();
    return PELA_EXTENSAO[ext] || '';
}

function descreverTipos(tipos) {
    const rotulos = [];
    if (tipos.includes('application/pdf')) rotulos.push('PDF');
    if (tipos.some(t => t.startsWith('image/'))) rotulos.push('imagem (JPG, PNG)');
    if (tipos.some(t => t.includes('word'))) rotulos.push('Word');
    if (tipos.some(t => t.includes('sheet') || t.includes('excel'))) rotulos.push('Excel');
    return rotulos.join(', ') || 'outro formato';
}

// Nome seguro para chave do Storage: sem acento, sem espaço, sem surpresa.
export const nomeSeguro = (nome) =>
    String(nome || 'arquivo')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
