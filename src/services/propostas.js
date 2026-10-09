/*
 * Proposta comercial em PDF dos orçamentos (layout em medcode-proposta/).
 *
 * O orçamento (finance_quotes + itens) continua sendo a fonte dos valores. A
 * coluna `proposta` guarda os textos que mudam de cliente para cliente, e cada
 * item guarda em `detalhes` o que aquele serviço entrega. Daqui sai o objeto
 * que o template entende, tanto para a pré-visualização na tela quanto para o
 * PDF gerado em /api/proposta-pdf.
 *
 * Cada PDF gerado vira uma versão (v1, v2…) no bucket privado `propostas`,
 * aberto por URL assinada — nada é sobrescrito.
 */
import { supabase } from './supabase';
import { gerarPropostaHTML, PADRAO } from '../../medcode-proposta/src/template.js';
import logoClara from '../../medcode-proposta/assets/logo-clara.webp';
import logoEscura from '../../medcode-proposta/assets/logo-escura.webp';
import foto from '../../medcode-proposta/assets/foto.jpg';
import { textoPadraoDoServico } from '../config/textosServicos';

const BUCKET = 'propostas';
const VALIDADE_URL = 300; // segundos

const copia = (v) => JSON.parse(JSON.stringify(v));
const nomeCliente = (party) => party?.nome_fantasia || party?.name || '';

// ---------------------------------------------------------------------------
// Textos de partida de uma proposta nova — genéricos de propósito: servem para
// clínica, restaurante ou loja. Tudo aparece no formulário para ajustar.
// ---------------------------------------------------------------------------
export function propostaModelo({ contato = '', titulo = '' } = {}) {
    return {
        contato,
        capa: {
            eyebrow: titulo,
            titulo: [
                { texto: 'Tecnologia sob medida', destaque: 'para o seu negócio' },
                { texto: 'vender mais e', destaque: 'atender melhor.' },
            ],
            subtitulo: 'Proposta preparada para **{cliente}**.',
        },
        carta: { saudacao: '', paragrafos: copia(PADRAO.carta), usarTextoPadrao: false },
        destaques: copia(PADRAO.destaques),
        cenario: { tituloProblemas: 'O que identificamos', problemas: [], tituloObjetivos: 'Onde queremos chegar', objetivos: [] },
        solucao: { titulo: { texto: 'Tudo que seu negócio precisa para', destaque: 'vender no digital.' }, introducao: '' },
        investimento: {
            desconto: { rotulo: 'Condição especial', valor: 0 },
            pixDescontoPercentual: 5,
            parcelasCartao: 10,
            formasPagamento: ['pix', '5050', 'cartao'],
            suporteMensal: null,
            custosTerceiros: null,
        },
        cronograma: [],
        etapas: copia(PADRAO.etapas),
        incluso: copia(PADRAO.incluso),
        naoIncluso: copia(PADRAO.naoIncluso),
        fechamento: { titulo: [{ texto: 'Vamos colocar seu negócio', destaque: '' }, { texto: 'para', destaque: 'funcionar sozinho?' }] },
        proximosPassos: copia(PADRAO.proximos),
    };
}

/** Proposta salva completada com o modelo (orçamentos antigos vêm com `{}`). */
export function propostaCompleta(salva, contexto) {
    const base = propostaModelo(contexto);
    const p = salva || {};
    if (!Object.keys(p).length) return base;
    return {
        ...base, ...p,
        capa: { ...base.capa, ...p.capa },
        carta: { ...base.carta, ...p.carta },
        cenario: { ...base.cenario, ...p.cenario },
        solucao: { ...base.solucao, ...p.solucao },
        investimento: { ...base.investimento, ...p.investimento },
        fechamento: { ...base.fechamento, ...p.fechamento },
    };
}

export const detalhesVazios = () => ({ rotulo: '', descricao: '', entregaveis: [], resumo: '', prazo: '', nomeTabela: '' });

export const subtotalItens = (items) =>
    items.reduce((a, it) => a + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);

export const descontoDe = (proposta) => Math.max(0, Number(proposta?.investimento?.desconto?.valor) || 0);

/** "10 dias", "2 semanas", "1 mês" → semanas (para o cronograma). */
export function prazoEmSemanas(prazo) {
    const m = String(prazo || '').toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(dia|semana|m[eê]s)/);
    if (!m) return 1;
    const n = parseFloat(m[1].replace(',', '.'));
    if (m[2] === 'dia') return Math.max(0.2, Math.round((n / 7) * 10) / 10);
    if (m[2] === 'semana') return n;
    return n * 4.3;
}

/** Cronograma sugerido: kick-off, um serviço depois do outro, entrega. */
export function cronogramaSugerido(items) {
    const linhas = [{ etapa: 'Kick-off', descricao: 'Alinhamento e materiais', inicio: 0, duracao: 0.4 }];
    let inicio = 0.3;
    items.filter((it) => it.description?.trim()).forEach((it) => {
        const duracao = prazoEmSemanas(it.detalhes?.prazo);
        linhas.push({ etapa: it.description.trim(), descricao: it.detalhes?.rotulo || '', inicio, duracao });
        inicio = Math.round((inicio + duracao * 0.8) * 10) / 10;
    });
    const fim = Math.max(...linhas.map((l) => l.inicio + l.duracao));
    linhas.push({ etapa: 'Treinamento e entrega', descricao: 'Equipe pronta para usar', inicio: Math.round(fim * 10) / 10, duracao: 0.6 });
    return linhas;
}

/** Troca {cliente} e {contato} em todos os textos (strings) de um objeto. */
function trocarMarcadores(v, valores) {
    if (typeof v === 'string') return v.replace(/\{(cliente|contato)\}/gi, (_, k) => valores[k.toLowerCase()] || '');
    if (Array.isArray(v)) return v.map((x) => trocarMarcadores(x, valores));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trocarMarcadores(x, valores)]));
    return v;
}

/**
 * Item sem explicação (nem descrição nem entregáveis) ganha o texto padrão do
 * tipo de serviço reconhecido pelo nome — senão a página de solução sai só com
 * o nome do serviço. Campo preenchido no item nunca é trocado.
 */
function comTextoPadrao(d, nome) {
    if (d.descricao?.trim() || (d.entregaveis || []).some((x) => String(x).trim())) return d;
    const t = textoPadraoDoServico(nome);
    if (!t) return d;
    return { ...d, rotulo: d.rotulo || t.rotulo, descricao: t.descricao, entregaveis: t.entregaveis, resumo: d.resumo || t.resumo };
}

/** Objeto que o template da proposta entende. */
export function montarDadosProposta({ numero, title, issue_date, valid_until, notes, party, items: itensBrutos, proposta }) {
    const marcadores = { cliente: nomeCliente(party), contato: proposta?.contato || nomeCliente(party) };
    const p = trocarMarcadores(proposta || {}, marcadores);
    const items = (itensBrutos || []).map((it) => ({ ...it, detalhes: trocarMarcadores(it.detalhes || {}, marcadores) }));
    const inv = p.investimento || {};
    const limpar = (l) => (l || []).map((x) => (typeof x === 'string' ? x.trim() : x)).filter(Boolean);
    const comTexto = (l) => (l || []).filter((x) => x && (x.texto || x.destaque || x.titulo || x.valor || x.legenda || x.etapa));
    // lista vazia volta ao texto padrão do template, em vez de deixar o bloco em branco
    const ouPadrao = (l) => (l.length ? l : undefined);
    return {
        numero: numero || 'MC-0000-000',
        emissao: issue_date || undefined,
        validade: valid_until || undefined,
        cliente: {
            nome: nomeCliente(party),
            contato: p.contato || '',
            razaoSocial: party?.name || '',
            documento: party?.document || '',
        },
        capa: { ...p.capa, eyebrow: p.capa?.eyebrow ?? title ?? '', titulo: ouPadrao(comTexto(p.capa?.titulo)) },
        carta: { ...p.carta, paragrafos: limpar(p.carta?.paragrafos) },
        destaques: ouPadrao(comTexto(p.destaques)),
        cenario: { ...p.cenario, problemas: limpar(p.cenario?.problemas), objetivos: limpar(p.cenario?.objetivos) },
        solucao: p.solucao,
        servicos: (items || []).filter((it) => it.description?.trim()).map((it) => {
            const d = comTextoPadrao(it.detalhes || {}, it.description);
            return {
                nome: it.description.trim(),
                nomeTabela: d.nomeTabela || undefined,
                rotulo: d.rotulo,
                descricao: d.descricao,
                entregaveis: limpar(d.entregaveis),
                resumo: d.resumo,
                prazo: d.prazo,
                valor: (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0),
            };
        }),
        investimento: {
            ...inv,
            desconto: descontoDe(p) ? { rotulo: inv.desconto?.rotulo || 'Desconto', valor: descontoDe(p) } : undefined,
            pixDescontoPercentual: Number(inv.pixDescontoPercentual ?? 5),
            parcelasCartao: Math.max(1, Number(inv.parcelasCartao) || 1),
            formasPagamento: inv.formasPagamento?.length ? inv.formasPagamento : ['pix'],
            suporteMensal: inv.suporteMensal || undefined,
            custosTerceiros: inv.custosTerceiros || undefined,
        },
        cronograma: comTexto(p.cronograma).map((c) => ({ ...c, inicio: Number(c.inicio) || 0, duracao: Number(c.duracao) || 0 })),
        etapas: ouPadrao(comTexto(p.etapas)),
        incluso: ouPadrao(limpar(p.incluso)),
        naoIncluso: ouPadrao(limpar(p.naoIncluso)),
        fechamento: { titulo: ouPadrao(comTexto(p.fechamento?.titulo)) },
        proximosPassos: ouPadrao(comTexto(p.proximosPassos)),
        observacoes: (notes || '').trim() || undefined,
    };
}

const absoluta = (url) => new URL(url, window.location.origin).href;

/** HTML da proposta para a pré-visualização (iframe srcdoc). */
export function htmlDaProposta(dados) {
    return gerarPropostaHTML(dados, { imagens: { logoClara: absoluta(logoClara), logoEscura: absoluta(logoEscura), foto: absoluta(foto) } });
}

// ---------------------------------------------------------------------------
// Banco e arquivos
// ---------------------------------------------------------------------------

/** Contato principal da empresa, para a saudação da carta. */
export async function contatoPrincipal(partyId) {
    if (!partyId) return '';
    const { data } = await supabase.from('crm_contatos').select('nome').eq('party_id', partyId)
        .order('principal', { ascending: false }).order('created_at').limit(1);
    return data?.[0]?.nome || '';
}

export async function listarPdfs(quoteId) {
    const { data, error } = await supabase.from('finance_quote_pdfs')
        .select('*, users:gerado_por(name)').eq('quote_id', quoteId).order('versao', { ascending: false });
    if (error) throw error;
    return data || [];
}

/**
 * Gera o PDF do orçamento como está salvo no banco, guarda no Storage e
 * registra a versão. Devolve a linha de finance_quote_pdfs.
 */
export async function gerarPdfDoOrcamento(quoteId) {
    const [{ data: q, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabase.from('finance_quotes').select('*, finance_parties(name, nome_fantasia, document)').eq('id', quoteId).single(),
        supabase.from('finance_quote_items').select('*').eq('quote_id', quoteId).order('created_at'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const contexto = { titulo: q.title || '' };
    const dados = montarDadosProposta({ ...q, party: q.finance_parties, items, proposta: propostaCompleta(q.proposta, contexto) });
    if (!dados.servicos.length) throw new Error('O orçamento não tem itens.');

    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch('/api/proposta-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify(dados),
    });
    if (!resp.ok) {
        const msg = await resp.json().then((j) => j.erro).catch(() => null);
        throw new Error(msg || `Falha ao gerar o PDF (${resp.status}).`);
    }
    const pdf = await resp.blob();

    const arquivo = `${quoteId}/${dados.numero}-${Date.now()}.pdf`;
    const { error: e3 } = await supabase.storage.from(BUCKET).upload(arquivo, pdf, { contentType: 'application/pdf' });
    if (e3) throw e3;
    const { data: linha, error: e4 } = await supabase.rpc('registrar_pdf_proposta', { p_quote_id: quoteId, p_arquivo: arquivo });
    if (e4) {
        await supabase.storage.from(BUCKET).remove([arquivo]);
        throw e4;
    }
    return linha;
}

const nomeArquivo = (pdf, cliente) =>
    `Proposta ${pdf.numero}${cliente ? ` - ${cliente}` : ''}${pdf.versao > 1 ? ` (v${pdf.versao})` : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '');

export async function urlDoPdf(pdf, { baixar = false, cliente = '' } = {}) {
    const { data, error } = await supabase.storage.from(BUCKET)
        .createSignedUrl(pdf.arquivo, VALIDADE_URL, baixar ? { download: nomeArquivo(pdf, cliente) } : undefined);
    if (error) throw error;
    return data.signedUrl;
}

export async function excluirPdf(pdf) {
    const { error } = await supabase.from('finance_quote_pdfs').delete().eq('id', pdf.id);
    if (error) throw error;
    await supabase.storage.from(BUCKET).remove([pdf.arquivo]);
}

/** Ao excluir o orçamento: as linhas somem em cascata, os arquivos saem aqui. */
export async function excluirArquivosDoOrcamento(quoteId) {
    const { data } = await supabase.storage.from(BUCKET).list(quoteId, { limit: 1000 });
    if (data?.length) await supabase.storage.from(BUCKET).remove(data.map((f) => `${quoteId}/${f.name}`));
}

export async function salvarPadraoDoServico(serviceId, detalhes) {
    const { error } = await supabase.rpc('salvar_padrao_proposta_servico', { p_service_id: serviceId, p_padrao: detalhes });
    if (error) throw error;
}
