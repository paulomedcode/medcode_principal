# Gerador de Propostas — MedCode Assessoria

Gera a proposta comercial premium (PDF A4, 6 páginas) a partir de um objeto JSON.
Os totais, o desconto do PIX, as parcelas, a validade e a numeração de páginas são calculados automaticamente.

```
medcode-proposta/
├── src/
│   ├── template.js      ← gerarPropostaHTML(dados)  (sem dependências; dados fixos da empresa em EMPRESA)
│   ├── estilos.js       ← CSS / cores da marca (:root)
│   └── gerar-pdf.js     ← gerarPropostaPDF(dados)  (Node + puppeteer-core)
├── assets/              ← logos e foto da assinatura
├── fonts/               ← Poppins e Lora (licença OFL, embutidas no PDF)
└── exemplos/
    ├── proposta-exemplo.json
    └── preview-html.js
```

## 1. Como está ligado ao sistema

- **Tela:** Orçamentos (`/vendas/propostas`) e painel da oportunidade no Funil. Aba **Textos da proposta** no
  orçamento, botões **Pré-visualizar** e **Salvar e gerar PDF**, e o ícone de PDF em cada orçamento com as versões geradas.
- **Dados:** `finance_quotes.proposta` (textos), `finance_quote_items.detalhes` (entregáveis, prazo…),
  `finance_services.proposta_padrao` (ponto de partida de cada serviço) — montados em `src/services/propostas.js`.
- **PDF:** `api/proposta-pdf.js` (função da Vercel, `puppeteer-core` + `@sparticuz/chromium`). No `npm run dev`
  o `vite.config.js` atende a mesma rota com o Google Chrome do computador (ou `CHROME_PATH`).
- **Arquivos:** bucket privado `propostas`, uma versão por geração (`finance_quote_pdfs`).
- **Logo:** vetorial, em `src/logo.js` (o mesmo da landing page; não depende de imagem nem de fonte).
- **Imagens:** `assets/` (foto da assinatura). Os dados fixos da empresa
  (WhatsApp, e-mail, CNPJ) ficam em `EMPRESA`, no topo de `src/template.js`.

Teste rápido pela linha de comando (na raiz do projeto):

```bash
node medcode-proposta/src/gerar-pdf.js medcode-proposta/exemplos/proposta-exemplo.json proposta.pdf
```

## 2. Campos do JSON

| Campo | Obrigatório | Observação |
|---|---|---|
| `numero` | sim | ex.: `MC-2026-014` |
| `emissao` | não | `AAAA-MM-DD` ou `DD/MM/AAAA` (padrão: hoje) |
| `validade` / `validadeDias` | não | data fixa, ou nº de dias (padrão 15) |
| `cliente.nome`, `cliente.contato` | sim | `razaoSocial` e `documento` (CNPJ/CPF) opcionais, vão no aceite |
| `capa.titulo` | não | linhas `{ texto, destaque }`; o destaque sai em itálico lilás |
| `capa.subtitulo` | não | aceita `**negrito**` |
| `carta.paragrafos` | não | parágrafos personalizados; o texto institucional é somado depois (`usarTextoPadrao: false` para tirar) |
| `cenario.problemas` / `objetivos` | sim | listas de texto |
| `servicos[]` | sim | `nome`, `rotulo`, `descricao`, `entregaveis[]`, `resumo`, `prazo`, `valor` (número). `nomeTabela` opcional. 3 serviços por página: mais de 3 cria outra página automaticamente |
| `investimento.desconto` | não | `{ rotulo, valor }` |
| `investimento.pixDescontoPercentual` | não | padrão 5 (use 0 para não dar desconto) |
| `investimento.parcelasCartao` | não | padrão 10 |
| `investimento.formasPagamento` | não | qualquer combinação de `["pix","5050","cartao"]` |
| `investimento.suporteMensal` / `custosTerceiros` | não | se omitidos, os cards não aparecem |
| `cronograma[]` | não | `{ etapa, descricao, inicio, duracao }` em **semanas** (aceita decimais). O nº de semanas do gráfico é calculado |
| `destaques`, `etapas`, `incluso`, `naoIncluso`, `proximosPassos` | não | substituem os textos padrão |

Em qualquer texto, `{cliente}` e `{contato}` são trocados pelo nome do cliente e de quem recebe (feito em `src/services/propostas.js`).
