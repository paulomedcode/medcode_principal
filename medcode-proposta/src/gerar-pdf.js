// =====================================================================
//  Gera o PDF da proposta a partir de um objeto de dados (Node.js)
//
//  Como módulo:
//    import { gerarPropostaPDF } from './src/gerar-pdf.js'
//    const buffer = await gerarPropostaPDF(dados)              // Buffer do PDF
//    await gerarPropostaPDF(dados, { caminho: 'proposta.pdf' }) // salva em disco
//
//  Pela linha de comando:
//    node src/gerar-pdf.js exemplos/proposta-exemplo.json saida.pdf
//
//  Chrome: na Vercel usa o @sparticuz/chromium; no computador, o Google Chrome
//  instalado (ou o caminho em CHROME_PATH).
// =====================================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { gerarPropostaHTML } from './template.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const base64 = (pasta, arq) => readFileSync(join(RAIZ, pasta, arq)).toString('base64');

// Fontes embutidas no HTML (o PDF fica idêntico em qualquer servidor, mesmo sem internet)
let fontesCache = null;
function fontesLocais() {
  if (fontesCache) return fontesCache;
  const face = (familia, arq, peso, estilo = 'normal') =>
    `@font-face{font-family:"${familia}";src:url(data:font/ttf;base64,${base64('fonts', arq)}) format("truetype");font-weight:${peso};font-style:${estilo};font-display:block}`;
  fontesCache = [
    face('Poppins', 'Poppins-Light.ttf', 300),
    face('Poppins', 'Poppins-Regular.ttf', 400),
    face('Poppins', 'Poppins-Medium.ttf', 500),
    face('Poppins', 'Poppins-Bold.ttf', '600 700'),
    face('Lora', 'Lora-Italic-Variable.ttf', '400 700', 'italic'),
  ].join('\n');
  return fontesCache;
}

let imagensCache = null;
function imagensLocais() {
  if (imagensCache) return imagensCache;
  imagensCache = {
    logoClara: `data:image/webp;base64,${base64('assets', 'logo-clara.webp')}`,
    logoEscura: `data:image/webp;base64,${base64('assets', 'logo-escura.webp')}`,
    foto: `data:image/jpeg;base64,${base64('assets', 'foto.jpg')}`,
  };
  return imagensCache;
}

const CHROME_LOCAL = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

let navegador = null; // reaproveita o Chrome entre chamadas (bem mais rápido em servidor)
async function obterNavegador() {
  if (navegador && navegador.connected) return navegador;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { default: chromium } = await import('@sparticuz/chromium');
    navegador = await puppeteer.launch({
      args: [...chromium.args, '--font-render-hinting=none'],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    const executablePath = CHROME_LOCAL.find((c) => existsSync(c));
    if (!executablePath) throw new Error('Chrome não encontrado. Defina CHROME_PATH com o caminho do Chrome.');
    navegador = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  }
  return navegador;
}

export async function gerarPropostaPDF(dados, { caminho } = {}) {
  const html = gerarPropostaHTML(dados, { fontesCss: fontesLocais(), imagens: imagensLocais() });
  const browser = await obterNavegador();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    if (caminho) writeFileSync(caminho, pdf);
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function fecharNavegador() {
  if (navegador) await navegador.close();
  navegador = null;
}

// ---------- CLI ----------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , entrada = join(RAIZ, 'exemplos/proposta-exemplo.json'), saida = 'proposta.pdf'] = process.argv;
  const dados = JSON.parse(readFileSync(entrada, 'utf8'));
  await gerarPropostaPDF(dados, { caminho: saida });
  await fecharNavegador();
  console.log(`✔ PDF gerado: ${saida}`);
}
