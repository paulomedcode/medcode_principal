// ============================================================================
// Anexos do editor do Compromisso (imagem, PDF, Word, planilha, áudio, vídeo).
//
// É o que o BlockNote chama quando alguém arrasta um arquivo para dentro da
// tarefa, cola do clipboard ou escolhe pelo botão "Enviar". Antes só existia o
// caminho por URL — quem tinha o arquivo na máquina não tinha por onde subir.
//
// Manda para o bucket "workspace" (migration 20260731210000) e devolve a URL
// pública, que é o que fica gravado dentro do conteúdo da página.
//
// Foto de celular tem 4–8 MB e nenhuma serventia nesse tamanho dentro de uma
// tarefa: imagem grande é reduzida antes de subir. Documento (PDF/Word) sobe
// como está — comprimir arquivo desses estraga.
// ============================================================================
import { supabase } from './supabase';

const BUCKET = 'workspace';
const LIMITE_BYTES = 25 * 1024 * 1024;      // igual ao limite do bucket
const COMPRIMIR_ACIMA_DE = 1.2 * 1024 * 1024;
const LADO_MAXIMO = 2000;                    // px — mais que isso é desperdício na tela

/** Nome de arquivo previsível: sem acento, sem espaço, sem barra. */
function nomeSeguro(nome) {
  const limpo = String(nome || 'arquivo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-80);
  return limpo || 'arquivo';
}

const idCurto = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 8);

/** Reduz imagem grande. Se a compressão falhar, sobe o original — nunca perde o anexo. */
async function talvezComprimir(file) {
  if (!file.type?.startsWith('image/') || file.type === 'image/gif' || file.size <= COMPRIMIR_ACIMA_DE) return file;
  try {
    // Carregado sob demanda: quem nunca anexa imagem não paga a biblioteca.
    const { default: imageCompression } = await import('browser-image-compression');
    const menor = await imageCompression(file, {
      maxSizeMB: 1.2,
      maxWidthOrHeight: LADO_MAXIMO,
      useWebWorker: true,
      fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
    });
    // Compressão que engorda o arquivo (acontece com PNG pequeno) não serve.
    return menor.size < file.size ? menor : file;
  } catch (e) {
    console.error('Falha ao comprimir imagem (subindo o original):', e);
    return file;
  }
}

/**
 * Sobe um arquivo e devolve a URL pública.
 * Lança erro com mensagem em português — o BlockNote a mostra no bloco.
 */
export async function uploadArquivoDoEditor(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');
  if (file.size > LIMITE_BYTES) {
    throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é 25 MB.`);
  }

  const enviar = await talvezComprimir(file);
  const hoje = new Date();
  const pasta = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const caminho = `compromisso/${pasta}/${idCurto()}-${nomeSeguro(file.name)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(caminho, enviar, {
    contentType: enviar.type || file.type || 'application/octet-stream',
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    console.error('Erro ao subir anexo do Compromisso:', error);
    // Banco de hospital onde a migration do bucket ainda não rodou: a mensagem
    // crua ("Bucket not found") não ajudaria ninguém.
    if (/bucket/i.test(error.message || '')) {
      throw new Error('Armazenamento de anexos ainda não configurado neste hospital. Avise o suporte.');
    }
    throw new Error('Não foi possível enviar o arquivo. Tente de novo.');
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  if (!data?.publicUrl) throw new Error('Arquivo enviado, mas sem link público.');
  return data.publicUrl;
}
