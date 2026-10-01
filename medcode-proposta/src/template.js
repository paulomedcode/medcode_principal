// =====================================================================
//  MedCode Assessoria — Gerador de Proposta Comercial (HTML A4)
//  Uso:  import { gerarPropostaHTML } from './template.js'
//        const html = gerarPropostaHTML(dados, { imagens: { logoClara, logoEscura, foto } })
//  Sem dependências. Funciona no Node e no navegador.
//  As imagens ficam em ../assets: no navegador entram como URL, no gerador de
//  PDF entram embutidas (data:), para o arquivo não depender de rede.
// =====================================================================
import { ESTILOS } from './estilos.js';

// ---------- Dados fixos da empresa (edite aqui uma vez) ----------
export const EMPRESA = {
  nome: 'MedCode',
  sufixo: 'Assessoria',
  responsavel: 'Paulo Nogueira',
  cargo: 'Fundador · MedCode Assessoria',
  iniciais: 'PN',
  whatsapp: '(11) 99164-9612',
  email: 'contato@medcodedev.com',
  site: 'contato.medcodedev.com',
  rodape: 'medcodedev.com',
  atendimento: 'Todo o Brasil',
  cnpj: '68.955.873/0001-98',
};

// Textos padrão — usados quando a proposta não informa os seus
export const PADRAO = {
  carta: [
    'Na MedCode, cada projeto é construído sob medida, sem pacote engessado e sem contrato de fidelidade. Você recebe algo pronto em poucos dias e conta com suporte próximo depois da entrega, porque tecnologia só vale a pena quando funciona na rotina real do negócio.',
    'Já estive em cada cadeira de uma empresa, do atendimento à diretoria. Essa experiência é o que coloco a serviço do seu projeto.',
  ],
  destaques: [
    { valor: '24/7', legenda: 'atendimento no WhatsApp, inclusive fins de semana' },
    { valor: '< 10 s', legenda: 'tempo médio de primeira resposta' },
    { valor: '15+ anos', legenda: 'de experiência em operação e gestão' },
    { valor: '0', legenda: 'fidelidade. Você fica porque funciona.' },
  ],
  etapas: [
    { titulo: 'Diagnóstico', texto: 'Entendemos a rotina, os gargalos e as metas do negócio.' },
    { titulo: 'Construção', texto: 'Desenvolvimento com validações semanais, sem surpresas.' },
    { titulo: 'Entrega', texto: 'Publicação, treinamento da equipe e material de apoio.' },
    { titulo: 'Acompanhamento', texto: '30 dias de ajustes inclusos e suporte próximo.' },
  ],
  incluso: [
    'Reuniões de alinhamento semanais',
    'Até 2 rodadas de revisão por entrega',
    '30 dias de garantia e ajustes após a entrega',
    'Treinamento da equipe (online)',
    'Código e dados de propriedade do cliente',
  ],
  naoIncluso: [
    'Custos de terceiros (domínio, hospedagem, APIs)',
    'Produção de fotos e vídeos profissionais',
    'Gestão de tráfego pago',
    'Funcionalidades fora do escopo descrito',
  ],
  proximos: [
    { titulo: 'Aprovação', texto: 'Responda esta proposta ou assine o aceite abaixo.' },
    { titulo: 'Pagamento', texto: 'Escolha a condição que fizer mais sentido para você.' },
    { titulo: 'Kick-off', texto: 'Agendamos a primeira reunião em até 48h.' },
  ],
};

// ---------- utilitários ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// permite **negrito** nos textos livres
const rich = (v) => esc(v).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
const arred = (n) => Math.round(n * 100) / 100;

function paraData(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) { const [a, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) { const [d, m, a] = v.split('/').map(Number); return new Date(a, m - 1, d); }
  return null;
}
const fmtData = (d) => (d ? d.toLocaleDateString('pt-BR') : '');

const lista = (itens, cls = '') => `<ul class="clean ${cls}">${(itens || []).map((i) => `<li>${rich(i)}</li>`).join('')}</ul>`;
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------- cálculos ----------
export function calcularInvestimento(dados) {
  const servicos = dados.servicos || [];
  const inv = dados.investimento || {};
  const subtotal = arred(servicos.reduce((s, x) => s + Number(x.valor || 0), 0));
  const desconto = arred(Number(inv.desconto?.valor || 0));
  const total = arred(subtotal - desconto);
  const pixPct = inv.pixDescontoPercentual ?? 5;
  const pix = arred(total * (1 - pixPct / 100));
  const parcelas = inv.parcelasCartao ?? 10;
  const parcela = arred(total / parcelas);
  return { subtotal, desconto, total, pixPct, pix, parcelas, parcela };
}

// ---------- blocos ----------
let IMG = {}; // imagens da geração em curso (gerarPropostaHTML é síncrona)

// escura = logo para fundo escuro (capa e fechamento); clara = cabeçalho das páginas brancas
function logo(fundoEscuro = true) {
  const src = fundoEscuro ? IMG.logoEscura : IMG.logoClara;
  if (src) return `<div class="logo"><img src="${esc(src)}" alt="${esc(EMPRESA.nome)} ${esc(EMPRESA.sufixo)}" style="height:${fundoEscuro ? 58 : 34}px;width:auto;display:block"></div>`;
  return `<div class="logo"><div class="mark">&lt;/&gt;</div><div class="name">${esc(EMPRESA.nome)}${fundoEscuro ? `<small>${esc(EMPRESA.sufixo)}</small>` : ''}</div></div>`;
}

const avatar = () => (IMG.foto
  ? `<img class="av" src="${esc(IMG.foto)}" alt="${esc(EMPRESA.responsavel)}" style="object-fit:cover">`
  : `<div class="av">${esc(EMPRESA.iniciais)}</div>`);

function paginaClara({ ref, conteudo, rodape, n }) {
  return `<section class="page light">
  <header class="head">${logo(false)}<div class="ref">${esc(ref)}</div></header>
  <div class="body">${conteudo}</div>
  <footer class="foot"><span>${esc(rodape)}</span><span class="n">${String(n).padStart(2, '0')}</span></footer>
</section>`;
}

function tituloDestaque(t) {
  // aceita string simples ou { texto, destaque }
  if (typeof t === 'string') return esc(t);
  return `${esc(t.texto)} <span class="serif">${esc(t.destaque)}</span>`;
}

// =====================================================================
//  FUNÇÃO PRINCIPAL
// =====================================================================
export function gerarPropostaHTML(dados, opcoes = {}) {
  const d = dados || {};
  IMG = opcoes.imagens || {};
  const cliente = d.cliente || {};
  const emissao = paraData(d.emissao) || new Date();
  const validade = paraData(d.validade) || new Date(emissao.getTime() + (d.validadeDias ?? 15) * 86400000);
  const numero = d.numero || 'MC-0000-000';
  const ref = `Proposta ${numero} · ${cliente.nome || ''}`;
  const calc = calcularInvestimento(d);
  const inv = d.investimento || {};
  const servicos = (d.servicos || []).map((s, i) => ({ ...s, letra: LETRAS[i] }));
  const paginas = [];
  let n = 1;

  // ---------- 1. CAPA ----------
  const capa = d.capa || {};
  const linhas = capa.titulo || [{ texto: 'Atendimento que', destaque: 'não dorme,' }, { texto: 'gestão que', destaque: 'não trava.' }];
  paginas.push(`<section class="page dark cover">
  <div class="grid-bg"></div>
  <div class="glow" style="width:420px;height:420px;background:#6d28d9;top:-120px;right:-140px"></div>
  <div class="glow" style="width:260px;height:260px;background:#22d3ee;opacity:.18;bottom:120px;left:-100px"></div>
  <div class="inner">
    <div class="top">${logo(true)}<div class="pill">Proposta Comercial</div></div>
    <div class="hero">
      ${capa.eyebrow ? `<div class="eyebrow">${esc(capa.eyebrow)}</div>` : ''}
      <h1>${linhas.map((l) => `${esc(l.texto)} <span class="serif">${esc(l.destaque || '')}</span>`).join('<br>')}</h1>
      ${capa.subtitulo ? `<p class="lead">${rich(capa.subtitulo).replace(/<b>/g, '<b style="color:#fff;font-weight:500">')}</p>` : ''}
    </div>
    <div class="meta">
      <div><span>Preparado para</span><b>${esc(cliente.nome)}</b></div>
      <div><span>Proposta nº</span><b>${esc(numero)}</b></div>
      <div><span>Emissão</span><b>${fmtData(emissao)}</b></div>
      <div><span>Válida até</span><b>${fmtData(validade)}</b></div>
    </div>
  </div>
</section>`);
  n++;

  // ---------- 2. APRESENTAÇÃO + CENÁRIO ----------
  const carta = d.carta || {};
  const paragrafos = [...(carta.paragrafos || []), ...(carta.usarTextoPadrao === false ? [] : PADRAO.carta)];
  const destaques = d.destaques || PADRAO.destaques;
  const cenario = d.cenario || {};
  paginas.push(paginaClara({
    ref, n, rodape: `${EMPRESA.nome} ${EMPRESA.sufixo} · ${EMPRESA.rodape}`,
    conteudo: `
    <div class="sec-num">01 · Apresentação</div>
    <h2>Tecnologia que resolve, <span class="serif">sem complicação.</span></h2>
    <div class="letter">
      <div>
        <p>${rich(carta.saudacao || `Olá, **${cliente.contato || cliente.nome || ''}**,`)}</p>
        ${paragrafos.map((p) => `<p>${rich(p)}</p>`).join('')}
        <div class="sig">${avatar()}<div><b>${esc(EMPRESA.responsavel)}</b><span>${esc(EMPRESA.cargo)}</span></div></div>
      </div>
      <div class="aside-card">${destaques.map((x) => `<div class="row"><b>${esc(x.valor)}</b><span>${esc(x.legenda)}</span></div>`).join('')}</div>
    </div>
    ${cenario.problemas?.length || cenario.objetivos?.length ? `<div class="context">
      ${cenario.problemas?.length ? `<div class="box"><h3><span class="dot"></span>${esc(cenario.tituloProblemas || 'O que identificamos')}</h3>${lista(cenario.problemas)}</div>` : ''}
      ${cenario.objetivos?.length ? `<div class="box"><h3><span class="dot c"></span>${esc(cenario.tituloObjetivos || 'Onde queremos chegar')}</h3>${lista(cenario.objetivos, 'check')}</div>` : ''}
    </div>` : ''}`,
  }));
  n++;

  // ---------- 3. SOLUÇÃO (3 serviços por página) ----------
  const sol = d.solucao || {};
  for (let i = 0; i < servicos.length; i += 3) {
    const bloco = servicos.slice(i, i + 3);
    const primeira = i === 0;
    paginas.push(paginaClara({
      ref, n, rodape: `${EMPRESA.nome} ${EMPRESA.sufixo} · ${EMPRESA.rodape}`,
      conteudo: `
      <div class="sec-num">02 · Solução proposta${primeira ? '' : ' (cont.)'}</div>
      ${primeira ? `<h2>${tituloDestaque(sol.titulo || { texto: 'Tudo que seu negócio precisa para', destaque: 'vender no digital.' })}</h2>
      ${sol.introducao ? `<p class="muted" style="max-width:150mm;margin-bottom:6mm">${rich(sol.introducao)}</p>` : ''}` : ''}
      ${bloco.map((s) => `
      <div class="svc">
        <div><div class="tag">${s.letra}</div><h3>${esc(s.nome)}</h3>${s.rotulo ? `<div class="lbl">${esc(s.rotulo)}</div>` : ''}</div>
        <div>
          ${s.descricao ? `<p class="desc">${rich(s.descricao)}</p>` : ''}
          ${lista(s.entregaveis, 'check')}
        </div>
      </div>`).join('')}`,
    }));
    n++;
  }

  // ---------- 4. INVESTIMENTO ----------
  const pag = inv.formasPagamento || ['pix', '5050', 'cartao'];
  const opcoesPag = {
    pix: `<div class="opt hl"><div class="kicker">Recomendado</div><b>À vista no PIX</b><p>${calc.pixPct > 0 ? `${calc.pixPct}% de desconto adicional: <b style="display:inline;font-size:inherit;margin:0;white-space:nowrap">${brl(calc.pix)}</b>` : `Pagamento único de <b style="display:inline;font-size:inherit;margin:0;white-space:nowrap">${brl(calc.total)}</b>`}</p></div>`,
    '5050': `<div class="opt"><div class="kicker">Parcelado</div><b>50% + 50%</b><p>Metade na aprovação e metade na entrega final.</p></div>`,
    cartao: `<div class="opt"><div class="kicker">Cartão</div><b>Até ${calc.parcelas}× sem juros</b><p>${calc.parcelas} parcelas de ${brl(calc.parcela)} no cartão de crédito.</p></div>`,
  };
  const notas = [];
  if (inv.suporteMensal) notas.push(`<div class="note"><h3>Suporte e evolução (opcional)</h3><p>${rich(inv.suporteMensal.descricao || 'Ajustes, pequenas melhorias e monitoramento contínuo por')} <span class="price">${brl(inv.suporteMensal.valor)}/mês</span>. Sem fidelidade: cancele quando quiser. Não há mensalidade obrigatória.</p></div>`);
  if (inv.custosTerceiros) notas.push(`<div class="note"><h3>Custos de terceiros</h3><p>${rich(inv.custosTerceiros.descricao || 'Domínio, hospedagem e APIs são pagos direto aos fornecedores. Estimativa atual:')} <span class="price">${esc(inv.custosTerceiros.estimativa || '')}</span>.</p></div>`);

  paginas.push(paginaClara({
    ref, n, rodape: `Valores válidos até ${fmtData(validade)} · ${EMPRESA.nome} ${EMPRESA.sufixo}`,
    conteudo: `
    <div class="sec-num">03 · Investimento</div>
    <h2>Transparente, <span class="serif">do início ao fim.</span></h2>
    <table class="inv">
      <thead><tr><th>Item</th><th>Prazo</th><th>Valor</th></tr></thead>
      <tbody>${servicos.map((s) => `<tr><td><b>${s.letra} · ${esc(s.nomeTabela || s.nome)}</b>${s.resumo ? `<small>${esc(s.resumo)}</small>` : ''}</td><td class="q">${esc(s.prazo || '')}</td><td class="v">${brl(s.valor)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="totals"><div class="t">
      ${calc.desconto ? `<div class="l"><span>Subtotal</span><span>${brl(calc.subtotal)}</span></div>
      <div class="l disc"><span>${esc(inv.desconto.rotulo || 'Desconto')}</span><span>− ${brl(calc.desconto)}</span></div>` : ''}
      <div class="total-card"><span>Investimento total</span><b>${brl(calc.total)}</b></div>
    </div></div>
    <div class="pay" style="grid-template-columns:repeat(${pag.length},1fr)">${pag.map((k) => opcoesPag[k] || '').join('')}</div>
    ${notas.length ? `<div class="notes" style="grid-template-columns:repeat(${notas.length},1fr)">${notas.join('')}</div>` : ''}`,
  }));
  n++;

  // ---------- 5. CRONOGRAMA ----------
  const crono = d.cronograma || [];
  const totalSem = Math.max(1, Math.ceil(Math.max(0, ...crono.map((c) => Number(c.inicio || 0) + Number(c.duracao || 0)))));
  const etapas = d.etapas || PADRAO.etapas;
  paginas.push(paginaClara({
    ref, n, rodape: `Prazos contam a partir do envio dos materiais · ${EMPRESA.nome} ${EMPRESA.sufixo}`,
    conteudo: `
    <div class="sec-num">04 · Cronograma e método</div>
    <h2>Simples, do primeiro contato <span class="serif">até a entrega.</span></h2>
    ${crono.length ? `
    <div class="weeks"><span></span><div style="grid-template-columns:repeat(${totalSem},1fr)">${Array.from({ length: totalSem }, (_, i) => `<span>Sem ${i + 1}</span>`).join('')}</div></div>
    <div class="tl">${crono.map((c, i) => {
      const left = (Number(c.inicio || 0) / totalSem) * 100;
      const width = Math.max(4, (Number(c.duracao || 0) / totalSem) * 100);
      const final = i === crono.length - 1;
      return `<div class="tl-row"><div class="lab"><b>${esc(c.etapa)}</b><span>${esc(c.descricao || '')}</span></div><div class="track" style="background:repeating-linear-gradient(90deg,var(--soft) 0 calc(${100 / totalSem}% - 1px),var(--line) calc(${100 / totalSem}% - 1px) ${100 / totalSem}%)"><div class="bar${final ? ' c' : ''}" style="left:${left.toFixed(2)}%;width:${Math.min(width, 100 - left).toFixed(2)}%"></div></div></div>`;
    }).join('')}</div>` : ''}
    <div class="steps" style="grid-template-columns:repeat(${etapas.length},1fr)">${etapas.map((e, i) => `<div class="step"><div class="k">${String(i + 1).padStart(2, '0')}</div><b>${esc(e.titulo)}</b><p>${rich(e.texto)}</p></div>`).join('')}</div>
    <div class="incl">
      <div class="box"><h3><span class="dot"></span>Está incluso</h3>${lista(d.incluso || PADRAO.incluso, 'check')}</div>
      <div class="box"><h3><span class="dot c"></span>Não está incluso</h3>${lista(d.naoIncluso || PADRAO.naoIncluso, 'x')}</div>
    </div>`,
  }));
  n++;

  // ---------- 6. FECHAMENTO / ACEITE ----------
  const proximos = d.proximosPassos || PADRAO.proximos;
  paginas.push(`<section class="page dark closing">
  <div class="grid-bg"></div>
  <div class="glow" style="width:380px;height:380px;background:#6d28d9;bottom:-140px;right:-120px"></div>
  <div class="glow" style="width:220px;height:220px;background:#22d3ee;opacity:.15;top:60px;left:-80px"></div>
  <div class="inner">
    ${logo(true)}
    <h2>${(d.fechamento?.titulo || [{ texto: 'Vamos colocar seu negócio', destaque: '' }, { texto: 'para', destaque: 'funcionar sozinho?' }]).map((l) => `${esc(l.texto)}${l.destaque ? ` <span class="serif">${esc(l.destaque)}</span>` : ''}`).join('<br>')}</h2>
    <div class="next" style="grid-template-columns:repeat(${proximos.length},1fr)">${proximos.map((p, i) => `<div><div class="n">${String(i + 1).padStart(2, '0')}</div><b>${esc(p.titulo)}</b><p>${rich(p.texto)}</p></div>`).join('')}</div>
    <div class="accept">
      <h3>Termo de aceite</h3>
      <p>Declaro estar de acordo com o escopo, os prazos e as condições comerciais descritos na proposta nº ${esc(numero)}.</p>
      <div class="signs">
        <div><b>${esc(cliente.razaoSocial || cliente.nome)}</b><span>Contratante${cliente.documento ? ` · ${esc(cliente.documento)}` : ''} · Data: ____/____/______</span></div>
        <div><b>${esc(EMPRESA.responsavel)}</b><span>${esc(EMPRESA.nome)} ${esc(EMPRESA.sufixo)}</span></div>
      </div>
    </div>
    <div class="contact">
      <div class="c">
        <div><span>WhatsApp</span><b>${esc(EMPRESA.whatsapp)}</b></div>
        <div><span>E-mail</span><b>${esc(EMPRESA.email)}</b></div>
        <div><span>Site</span><b>${esc(EMPRESA.site)}</b></div>
        <div><span>Atendimento</span><b>${esc(EMPRESA.atendimento)}</b></div>
      </div>
      <div class="legal">${esc(EMPRESA.nome)} ${esc(EMPRESA.sufixo)}<br>CNPJ ${esc(EMPRESA.cnpj)}<br>Proposta Comercial</div>
    </div>
  </div>
</section>`);

  // fontes: por padrão Google Fonts; o gerador de PDF injeta as fontes locais (opcoes.fontesCss)
  const fontes = opcoes.fontesCss
    ? `<style>${opcoes.fontesCss}</style>`
    : `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,400;1,500&family=Poppins:wght@300;400;500;700&display=swap" rel="stylesheet">`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposta ${esc(numero)} — ${esc(cliente.nome || '')}</title>
${fontes}
<style>${ESTILOS}</style>
</head><body>
${paginas.join('\n')}
</body></html>`;
}
