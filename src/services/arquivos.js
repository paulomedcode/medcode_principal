/*
 * Abrir um arquivo guardado no Storage — sem deixá-lo público.
 *
 * Até aqui os buckets `documentos`, `exames`, `anexos` e `anexos_agenda` eram
 * públicos e o sistema gravava no banco a URL pública do arquivo. Quer dizer:
 * a nota fiscal, o boleto, o contrato e o PDF de exame do paciente abriam para
 * QUALQUER pessoa com o link — sem login, sem pertencer à empresa. Link de
 * bucket público não expira e não pergunta quem é você.
 *
 * O padrão de mercado para documento assim é bucket privado + URL ASSINADA,
 * gerada no clique e válida por poucos minutos. É o que este arquivo faz.
 *
 * O detalhe que torna a migração possível sem mexer nos dados: a URL pública
 * já guardada no banco CONTÉM o caminho do arquivo dentro do bucket. Então dá
 * para receber o que está gravado — URL antiga, caminho novo, ou um link
 * externo que alguém digitou à mão — e resolver os três casos aqui, em vez de
 * sair reescrevendo 1.500 registros.
 */
import { supabase } from './supabase';

// Buckets fechados. `logos` (identidade visual, entra em PDF impresso) e
// `workspace` (anexos do Compromisso, cuja URL o editor grava dentro do
// documento) seguem públicos — ver o comentário no fim do arquivo.
export const BUCKETS_PRIVADOS = ['documentos', 'exames', 'anexos', 'anexos_agenda'];

// Curto de propósito: a URL vale para abrir agora, não para virar link
// compartilhável. Quem precisar de novo, clica de novo.
const VALIDADE_SEGUNDOS = 300;

/*
 * De onde veio isto? Aceita:
 *   - URL pública    .../storage/v1/object/public/documentos/financeiro/x.pdf
 *   - URL assinada   .../storage/v1/object/sign/documentos/financeiro/x.pdf?token=…
 *   - caminho puro   financeiro/x.pdf            (aí o bucket vem por parâmetro)
 * Devolve null para link externo (Drive, site do laboratório) e para lixo.
 */
export function refDoStorage(referencia, bucketPadrao = null) {
    const valor = String(referencia || '').trim();
    if (!valor) return null;

    if (!/^https?:\/\//i.test(valor)) {
        return bucketPadrao ? { bucket: bucketPadrao, caminho: valor } : null;
    }

    const achado = valor.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
    if (!achado) return null;

    const bucket = decodeURIComponent(achado[1]);
    const caminho = decodeURIComponent(achado[2]);
    return { bucket, caminho };
}

/*
 * A URL para abrir agora.
 *
 * Link externo e bucket que continua público voltam como estão — quem chama
 * não precisa saber de qual caso se trata.
 */
export async function urlParaAbrir(referencia, bucketPadrao = null) {
    const ref = refDoStorage(referencia, bucketPadrao);
    if (!ref) return String(referencia || '') || null;
    if (!BUCKETS_PRIVADOS.includes(ref.bucket)) {
        // Bucket público: a URL pública continua valendo.
        if (/^https?:\/\//i.test(String(referencia))) return String(referencia);
        return supabase.storage.from(ref.bucket).getPublicUrl(ref.caminho).data.publicUrl;
    }

    const { data, error } = await supabase
        .storage.from(ref.bucket)
        .createSignedUrl(ref.caminho, VALIDADE_SEGUNDOS);
    if (error) throw error;
    return data.signedUrl;
}

/*
 * Abre o arquivo numa aba nova.
 *
 * A aba é aberta ANTES do await de propósito: navegador só deixa abrir aba
 * durante o clique. Se esperássemos a assinatura para só então chamar
 * window.open, o bloqueador de pop-up engoliria o clique — e o usuário veria
 * "não aconteceu nada".
 */
export async function abrirArquivo(referencia, bucketPadrao = null) {
    const aba = window.open('', '_blank');
    try {
        const url = await urlParaAbrir(referencia, bucketPadrao);
        if (!url) throw new Error('Arquivo sem endereço.');
        if (aba) aba.location.href = url;
        else window.location.href = url; // aba bloqueada: navega na mesma
        return true;
    } catch (e) {
        if (aba) aba.close();
        console.error('Falha ao abrir arquivo do Storage:', e);
        return false;
    }
}

/*
 * Handler pronto para <a href=…>: cancela a navegação normal e abre assinado.
 * O href original fica no elemento para o "copiar endereço do link" continuar
 * mostrando algo, e para o link não parecer quebrado com o JS desligado.
 */
export function aoClicarNoArquivo(referencia, bucketPadrao = null) {
    return (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        abrirArquivo(referencia, bucketPadrao);
    };
}

/*
 * POR QUE `workspace` E `logos` CONTINUAM PÚBLICOS
 *
 * `logos`: identidade visual (logo do hospital, favicon, foto do anestesista)
 * que entra em PDF gerado e impresso. Não é dado de ninguém.
 *
 * `workspace`: os anexos do Compromisso são inseridos pelo editor (BlockNote),
 * que grava a URL DENTRO do conteúdo da página. URL assinada expira; o
 * documento ficaria com imagem quebrada dias depois. Fechar esse bucket exige
 * guardar o caminho no bloco e resolvê-lo na hora de desenhar — mudança no
 * editor, não aqui. Fica anotado como pendência.
 */
