// Gera um HTML para visualizar no navegador (sem precisar do Puppeteer)
// node exemplos/preview-html.js  →  abre preview.html no Chrome
import { readFileSync, writeFileSync } from 'node:fs';
import { gerarPropostaHTML } from '../src/template.js';

const dados = JSON.parse(readFileSync(new URL('./proposta-exemplo.json', import.meta.url), 'utf8'));
writeFileSync('preview.html', gerarPropostaHTML(dados));
console.log('✔ preview.html gerado');
