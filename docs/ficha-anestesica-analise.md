# Ficha Anestésica (FA) + evolução da APA — análise e plano

Data: 10/ago/2026
Base analisada: `ficha_anestesica_marcos/` (protótipo feito no Codex por terceiro)

## Status

| Fase | Situação |
|---|---|
| 0 — Higiene e análise | Concluída |
| 1 — APA: conduta medicamentosa | Concluída — 42 regras no banco, alerta por linha, cadastro em Configurações |
| 2 — APA: exame normal/alterado | Concluída — ACV, AR e Abdome com laudo padrão editável |
| 3 — FA: fundação | Concluída — tabela com trava de assinatura, RPC sem corrida, motor de eventos e prefill da APA |
| 4 — FA: preenchimento | Concluída — tela, grade temporal, gráfico, medicações e catálogos |
| 5 — FA: fechamento | Concluída — assinatura com trava, reabertura registrada, narrativa e impressão A4 |
| 6 — Integrações | Pendente — iniciar ficha pelo card da fila, widget na home, relatórios e tempo real entre aparelhos |

Todos os catálogos da FA e da APA têm tela de cadastro em
**Configurações → APA e Ficha Anestésica**: regras de medicamentos, textos do exame
físico, descrições do ato anestésico, linhas da grade e fármacos. Nenhuma mudança de
conteúdo clínico depende de código.

Ponto de retorno: tag `backup/pre-apa-fa-2026-08-11`.

Testes do que já existe:

```
node scripts/test-apa-regras.mjs     # 51 testes — conduta medicamentosa e exame físico
node scripts/test-fa-projecao.mjs    # 61 testes — eventos, régua, projeção, prefill e narrativa
```

### Decisões fechadas com o Paulo

- **Dispositivos:** tablet e desktop. Celular fora por ora.
- **Origem da ficha:** avulsa ou a partir da fila cirúrgica; havendo APA do paciente,
  o cabeçalho vem dela.
- **Assinatura:** assina quem está logado como anestesista. Ficha finalizada não se
  edita; corrigir exige reabertura, permitida só a quem tem a permissão
  "Reabrir FA Finalizada", e a próxima assinatura é de quem estiver logado.
- **Fase 2 mantida** como implementada, após confirmar que nenhuma APA existente foi
  alterada (não houve migração nem escrita).

### Adiante, fora do escopo atual

Redesenho do PEP e da interação APA ↔ FA — conversa futura, não entra nas fases 4 a 6.

---

## 1. O que existe na pasta

| Arquivo | Tamanho | O que é |
|---|---|---|
| `outputs/FichaAnestesica.html` | 171 KB / 2.411 linhas | **A ficha anestésica.** HTML + CSS + JS tudo inline, arquivo único |
| `outputs/APP-FICHA-V6-atualizado.html` | 124 KB | Versão anterior da mesma ficha (~1.000 linhas de diferença). Descartável |
| `outputs/FichaAnestesica.zip` | — | Zip da V6. Descartável |
| `outputs/AbrirFicha.html` | 645 B | Só um redirect |
| `outputs/AvaliacaoPreAnestesica.html` | 80 KB (minificado) | A APA dele, 5 passos + termo de consentimento |
| `tmp/pdfs/` | **~45 MB** | Lixo: perfis inteiros de Chrome/Edge que o Codex usou para gerar PDF + PNGs de teste |
| `work/` | vazio | — |

Não há `package.json`, README, migrations, testes ou qualquer documentação. São dois arquivos soltos
que rodam abrindo no navegador.

> **Higiene:** essa pasta não deve entrar no git como está (45 MB de perfil de browser).
> Guardar só os dois HTMLs em `docs/referencia/` e ignorar o resto.

---

## 2. Anatomia da Ficha Anestésica dele

### Tela (uma página só)

1. **Cabeçalho** — Paciente, Idade, Peso, Altura, IMC, Alergias, Cirurgia; 6 técnicas anestésicas em
   checkbox, cada uma com horário (AGVI, AGVT, sedação, raqui, peridural, bloqueio periférico);
   tempos de entrada em sala / início e fim de anestesia / início e fim de cirurgia com botões
   "Iniciar" e "Finalizar".
2. **Grade temporal** — **24 colunas × 5 min = 2 horas fixas**, ancoradas na hora em que a página
   carregou (`getRealTimeArray`, linha 1348).
   - *3. Agentes / infusões contínuas*: O₂, Ar comprimido, Sevoflurano, Propofol, Remifentanil,
     Dexmedetomidina (fixos) + "Adicionar medicação" (só na sessão, some ao recarregar).
   - *4. Balanço hidroeletrolítico*: soluções (+), hemocomponentes (+), sangue perdido (−), diurese (−).
   - *5. Monitorização*: temperatura, ETCO₂, SatO₂, ECG (ritmo), BIS, PAI.
   - *Posicionamento*: registra decúbito com horário, com reordenação por drag.
   - *6. Gráfico hemodinâmico*: escala 0–220, PAS/PAD em par (ferramenta "↕ automático"), FC (●),
     PAM calculada `(PAS + 2·PAD) / 3`.
   - *Linha de medicações*: tags posicionadas no tempo com dose, via e observação.
3. **Rodapé** — procedimentos (manta térmica, acesso venoso central, PAI, venóclise, extubação,
   bloqueio periférico, + procedimento livre), cada um com card de detalhes e horário; destino
   (SRPA / UTI, com ventilação na transferência e últimos sinais vitais); assinatura.
4. **Aba "2. Evolução"** — gera narrativa automática a partir do que foi marcado (textos padrão para
   AGVI, AGVT, sedação, raqui, peridural, bloqueio, AVC, PAI, venóclise, extubação), parâmetros do
   ventilador, lista de infusões com horários, balanço hídrico calculado, consumo de ampolas/frascos.
   Texto editável (`contenteditable`).
5. **Aba de impressão** — versão paisagem.

### Interação (a parte boa)

- Clique curto → modal de valor; clique-e-segura → preenche valor rápido; arrastar → preenche várias
  células; duplo clique → apaga.
- **Auto-propagação**: valor de infusão contínua se repete sozinho conforme o relógio anda (`updateTimeAccess`).
- **Bloqueio do futuro**: células adiante do horário atual ficam hachuradas e não editáveis.
- Catálogo de **74 fármacos** em 16 classes, com apresentação e unidade (`plot-med-select`).

### Problemas estruturais — por que não dá para "só colar" no sistema

1. **Zero persistência.** O único `localStorage` do arquivo guarda o *tema* (linha 951). F5, queda de
   Wi-Fi ou tela bloqueada = a cirurgia inteira se perde. Inaceitável para documento médico-legal.
2. **Janela de 2 horas fixa**, ancorada em `new Date()` do carregamento. Cirurgia de 4 h não cabe.
   Abrir a ficha antes ou depois do horário desalinha tudo. Não há como reabrir, continuar ou auditar.
3. **O estado mora no DOM.** Não existe modelo de dados. O relatório é montado lendo `textContent` das
   células e comparando texto de label — literalmente
   `.item-label.textContent.trim() === 'Soluções (+)'` (linha 2226). Renomear um rótulo ou mexer no CSS
   quebra o cálculo do balanço hídrico silenciosamente.
4. **Tudo hardcoded**: os 74 fármacos, as 6 infusões, a lista de bloqueios, as veias, as diluições
   (propofol 10, remi 50, dexmed 5), o texto das narrativas ("tubo nº 7", "L4–L5 com Quincke 27G",
   "sem intercorrências"). **Não existe nenhuma tela de cadastro** — é exatamente o que você notou.
5. **Sem multiusuário, sem unidade, sem permissão, sem log, sem assinatura, sem rastro de alteração.**
6. Código com funções globais, `innerHTML +=`, `window.onclick` — base ruim para manter.
7. Ergonomia: coluna de 45 px × 24 colunas com `pointer events`. Funciona bem no desktop; em tablet
   (que é onde a FA é preenchida de verdade) é duvidoso e nunca foi testado.

**Conclusão:** o protótipo é um bom *storyboard* — o modelo mental de planilha temporal, a auto-propagação,
a narrativa automática e o cálculo de consumo valem ser copiados como **conceito**. O código, não.

---

## 3. A APA dele — o que interessa copiar

### 3.1 Motor de interação medicamentosa (`medicationRisks()`, linhas 165–211)

**42 regras**, cada uma no formato: regex de nomes genéricos e marcas → `{classe, conduta curta,
texto longo, nível (warn|high)}`. Cobertura:

- Fitoterápicos/suplementos hemostáticos, canabinoides/DMAA/efedra/kratom
- Antidepressivos, lítio, antipsicóticos/antiepilépticos/benzodiazepínicos
- Analgésicos, COX-2, opioides, gabapentinoides; AAS; antiagregantes (stent!); AINEs
- Corticoide; asma/tireoide/tiazídico/miastenia; sildenafil e diuréticos; estrogênio/SERM
- Diabetes completo: metformina, TZD, GLP-1/GIP, DPP-4, SGLT-2, acarbose, sulfonilureia, glinida
- Insulinas: prandial, NPH, basal longa (glargina/detemir), basal ultralonga (degludeca/U300)
- **17 regras de neuroeixo** (ASRA): HNF, enoxaparina, fondaparinux, varfarina (INR), rivaroxabana,
  apixabana, edoxabana, betrixabana, dabigatrana **por faixa de ClCr**, argatroban, cangrelor,
  cilostazol, dipiridamol, eptifibatida, abciximab, tirofiban, fibrinolíticos

O **conteúdo clínico é bom e coerente** com ASRA/SBA. Vale aproveitar como base — depois de revisão
do seu anestesista responsável.

**Falhas técnicas a corrigir quando trouxermos:**

| Falha | Consequência |
|---|---|
| O match é feito na **concatenação de todos os medicamentos** (`all`) | O alerta não sabe de qual linha veio. Com 5 medicamentos, vira um bloco solto no fim da tela — como aparece no seu print, o alerta do AAS flutuando sem vínculo com a linha |
| Regex sem limite de palavra (`\b`) na maioria | Falsos positivos por substring |
| Regras de neuroeixo disparam sempre | Um paciente em anestesia geral recebe 17 alertas de punção que não vai acontecer |
| ClCr da dabigatrana está no *texto*, não é calculado | O sistema tem creatinina, peso, idade e sexo — dá para calcular e dizer o número de horas |
| Nada é cadastrável | Incluir fármaco novo = editar JavaScript |
| Nenhuma regra tem fonte/referência nem data de revisão | Conteúdo clínico sem rastreabilidade — problema para defender |

### 3.2 Padrão "Exame normal / Com alterações"

Radio *Exame normal* / *Com alterações*: em "normal", mostra um laudo padrão pronto
("Ritmo cardíaco regular, bulhas normofonéticas em dois tempos…"); em "alterado", abre textarea livre.
Simples, rápido e padroniza a redação. Os textos, de novo, estão hardcoded.

Na nossa APA hoje, `acv`, `ar` e `abdome` são inputs de texto livre
([Apa.jsx:1831](src/pages/Apa.jsx:1831)). Trocar por esse padrão é ganho imediato.

---

## 4. Como isso encaixa no que já temos

**Nosso terreno:**

- `apas`: 1.147 registros / 175 pacientes, **126 colunas planas** (uma coluna por campo);
  `alergias` e `medicamentos` são TEXT com JSON dentro; `comorbidadesList` é json.
- Rota `/apa` protegida por módulo `atendimento` + "Visualizar Atendimentos"; existe "Criar/Editar APA".
- Impressão: `ApaPrintTemplate.jsx` + `window.print()`.
- `surgeries` tem apenas um **booleano** `apa` (checklist da fila) — **não há FK para a APA**.
- `settings` é key-value JSONB (`general`, `medicas`, `opcoes_cirurgia`, `orientacoes`, `permissions`…),
  onde moram nossos cadastros editáveis.
- RLS desabilitado (dívida conhecida).

**Decisões de arquitetura recomendadas para a FA:**

1. **`fichas_anestesicas` com JSONB — nunca 126 colunas.** A APA já provou que coluna-por-campo não
   escala. Colunas fixas só para o que é chave/filtro: `id, paciente_id, apa_id, surgery_id, unidade,
   anestesista_id, status, inicio_anestesia, fim_anestesia, assinada_em, assinada_por, deleted_at`,
   mais `dados jsonb` e `eventos jsonb`.
2. **Registro por evento com timestamp real, não por índice de coluna.** Cada lançamento é
   `{t: ISO, tipo, alvo, valor, unidade, autor}`. A grade passa a ser uma *projeção* dos eventos sobre a
   régua de tempo. Isso resolve de uma vez: duração livre, reabertura da ficha, correção sem perder o
   original, auditoria e cirurgia que atravessa a meia-noite.
3. **Régua de tempo derivada do início/fim da anestesia**, passo configurável (5/10 min), rolagem
   contínua — não 24 colunas fixas.
4. **Salvamento contínuo e offline-first.** Sala de cirurgia tem Wi-Fi ruim: fila local (IndexedDB) +
   flush para o Supabase + Realtime para um segundo aparelho. Sem isso a FA é perigosa.
5. **Trava por assinatura**: assinou → somente leitura; correção posterior só como **adendo** com autor e
   hora (mesmo padrão do "plantão verificado" da Escala).
6. **Catálogos em tabela com CRUD em Configurações** — fármacos, infusões, narrativas, regras de
   medicamento, textos padrão de exame. Ninguém edita código para cadastrar fármaco.
7. Por ser o documento mais sensível do sistema, a FA deveria **nascer com RLS ligado**.

---

## 5. Plano por fases

### Fase 0 — Higiene (poucas horas)
- Manter só `FichaAnestesica.html` e `AvaliacaoPreAnestesica.html` como referência em `docs/referencia/`;
  ignorar `tmp/` no git.
- Este documento.

### Fase 1 — APA: interação medicamentosa *(entrega valor sozinha, independe da FA)*
1. Tabela `apa_regras_medicamento`: `id, ativo, ordem, classe, termos[], conduta, texto, nivel,
   exige_neuroeixo, exige_clcr, referencia, revisado_por, revisado_em`. Seed com as 42 regras revisadas.
2. Motor **por linha**: cada medicamento digitado casa contra as regras e o alerta aparece **na própria
   linha** (chip "Suspender 3–4 dias" + expandir texto completo), não num bloco solto no fim.
   Match por termo com limite de palavra + normalização de acento + sinônimos/marcas.
3. Filtro de contexto: regra de neuroeixo só dispara se o plano incluir raqui/peridural/bloqueio;
   regras por ClCr calculam com `ex_creat` + peso + idade + sexo (Cockcroft-Gault) e mostram o número.
4. Botão "aplicar conduta" preenche o campo `conduta` que a linha já tem (Manter/Suspender/Ajustar).
5. Tela em Configurações → **"Regras de medicamentos (APA)"**: criar/editar/excluir/ativar, campo de
   teste ("digite um nome e veja o que casa") e referência bibliográfica obrigatória.
6. Alertas entram na impressão da APA e no parecer.

### Fase 2 — APA: exame normal/alterado *(rápida, alto impacto)*
- ACV, AR, abdome, neurológico e coluna com radio Normal/Alterado; "normal" grava o texto padrão
  versionado, "alterado" abre texto livre.
- Textos padrão cadastráveis em Configurações (não hardcoded).
- Migração cuidadosa: as 1.147 APAs existentes têm texto livre nesses campos — o valor atual vira
  "Alterado" quando não estiver vazio.

### Fase 3 — FA: fundação *(a fase que decide se vai ser sólido ou amador)*
- Migration `fichas_anestesicas` + catálogos (`fa_farmacos`, `fa_infusoes`, `fa_narrativas`).
- Modelo de eventos + **reducer puro e testável** que projeta eventos → grade. Testes desse reducer
  **antes** de desenhar a tela.
- Serviço de persistência com fila offline + realtime.
- Permissões: `Modulo: Ficha Anestésica`, `Criar/Editar FA`, `Assinar FA`, `Editar FA Assinada`.
- Rota e item de menu.

### Fase 4 — FA: preenchimento
- **Cabeçalho puxando da APA**: pelo paciente/cirurgia, busca a APA mais recente e traz nome, idade,
  peso, altura, IMC, alergias, ASA, comorbidades, via aérea prevista, plano anestésico e jejum. Campos
  importados ficam marcados ("importado da APA de dd/mm") e continuam editáveis — o peso muda no dia.
- Grade temporal com duração livre; clique / segurar / arrastar (o esquema dele é bom);
  auto-propagação de infusão contínua; bloqueio do futuro.
- Gráfico hemodinâmico (PAS/PAD/FC/PAM) desenhado a partir dos eventos.
- Medicações a partir do catálogo, com dose, via e horário.
- Balanço hídrico.

### Fase 5 — FA: fechamento
- Narrativa automática a partir de **templates cadastráveis com placeholders**, editável antes de assinar.
- Consumo de ampolas/frascos → base para custo (e, depois, para o financeiro).
- Impressão A4 no padrão dos nossos documentos (`config/hospitalIdentity.js`), com assinatura, CRM e RQE
  do anestesista logado.
- Assinar → trava; adendo com autor e hora.
- Marcar `surgeries.fa = true`, no mesmo padrão do `apa`.

### Fase 6 — Integrações
- "Iniciar ficha" direto no card da fila cirúrgica / mapa do dia.
- Widget na home: "Fichas em aberto".
- Relatórios: consumo por período, tempo médio de sala, taxa de intercorrências.

---

## 6. Decisões que dependem de você

1. **Tablet ou desktop na sala?** Define o desenho da grade — é a decisão mais cara de mudar depois.
2. **A FA nasce da cirurgia agendada ou avulsa?** Recomendo permitir as duas, com vínculo obrigatório
   quando vier da fila.
3. **Quem assina e quem pode corrigir depois de assinada?**
4. **Um anestesista por ficha, ou troca de equipe no meio** (registrando quem estava em cada período)?
5. **Quem é o revisor clínico responsável pelas regras?** Precisamos de nome, data de revisão e
   referência por regra — inclusive porque as do protótipo estão sem fonte declarada.
6. **RLS na FA desde o início?** Recomendo sim, mesmo com o resto do banco ainda aberto.

---

# Rodada de ajustes — 13/ago/2026

Lista levantada pelo Paulo usando a FA de verdade. Cada fase abaixo é uma entrega
fechada (um PR), na ordem sugerida. A regra é a de sempre: nada de fase grande
misturada com fase pequena, e nenhuma delas deixa a ficha em estado quebrado.

| Fase | O que resolve | Risco | Situação |
|---|---|---|---|
| A — Correções de tela e de toque | modal sob a Topbar, número do eixo sobreposto, teclado virtual, botão de medicações | baixo | **concluída** (PR #182) |
| B — Responsável pela ficha e passagem de plantão | o "erro gravíssimo": outro médico mexer na ficha em andamento | alto (banco) | **concluída** (PR #183) |
| C — Salvamento automático e à prova de queda | perder anotação por internet/bateria | médio | pendente |
| D — Busca do paciente enquanto digita | ter que clicar em "Buscar" | baixo | pendente |
| E — Cabeçalho enxuto + "Visualizar APA" | excesso de dado da APA dentro da FA | médio | pendente |
| F — Descrição do ato anestésico automática | ter que clicar em "Gerar dos registros" | baixo | pendente |
| G — Grade no padrão do protótipo | balanço, medicação contínua, painel de sinais vitais | médio | pendente |
| H — Arrastar para repetir no toque | arrasto só funciona com mouse | médio | pendente |

## Fase A — Correções de tela e de toque

1. **Diálogos por baixo da barra cinza.** A Topbar é `sticky z-[999]`
   (`src/components/Topbar.jsx:128`) e todos os diálogos da FA nascem abaixo dela:
   `NovaFichaDialog` em `z-[100]`, `DialogoValor` / `DialogoMedicacao` /
   `DialogoFinalizar` em `z-[110]`. É por isso que o campo do nome do paciente fica
   encoberto. Padronizar os diálogos da FA no recorte que o resto do sistema já usa
   (`fixed top-16 inset-x-0 bottom-0` com z acima da Topbar), como em
   `PacienteFormModal`.
2. **"160" sobreposto pelo texto no gráfico.** Os números da escala são desenhados
   dentro do painel de rótulo, por cima do texto de instrução
   (`GraficoHemodinamico.jsx:134-149`). Reservar uma faixa própria para a escala à
   direita do painel e encurtar o texto.
3. **Teclado virtual no valor do gás.** `DialogoValor.jsx:121-131` desenha um teclado
   próprio. Sai o teclado; fica o campo com `inputMode="decimal"` e foco automático —
   no iPad e no celular sobe o teclado do sistema, no PC digita direto.
4. **Botão de medicação de dose única.** O "Nova" pequeno na coluna fixa
   (`GradeTemporal.jsx:329-336`) vira o botão largo "+ Medicações" do protótipo.

## Fase B — Responsável pela ficha e passagem de plantão

Hoje qualquer usuário com a permissão "Criar/Editar FA" edita qualquer ficha em
andamento: a tela só trava por ficha finalizada (`FichaAnestesica.jsx:566`). A trava
tem que morar no banco, senão continua valendo só enquanto a tela colabora.

- **Migration:** `responsavel_id`, `responsavel_nome` e `passagens jsonb` em
  `fichas_anestesicas`; nas fichas existentes o responsável passa a ser o
  `anestesista_id`.
- **Trigger `fa_bloqueia_edicao_de_terceiro`** (before update, com a ficha em
  andamento): recusa qualquer alteração de quem não é o responsável. A única
  exceção é a própria passagem — `responsavel_id` novo igual a `auth.uid()` **e**
  um registro novo em `passagens` indicando que o responsável anterior escolheu essa
  pessoa. `fa_append_eventos` e `fa_marcar_removido` são `security invoker`, então
  o trigger também vale para os registros da grade.
- **Tela:** quem abre uma ficha de outro vê o banner "Em andamento por Dr. X desde
  hh:mm — somente leitura" e a ficha inteira em modo leitura. O responsável tem o
  botão **"Passar o caso"**, que lista os usuários médicos; o escolhido vê
  **"Assumir"** e edita a partir do momento em que assumiu.
- **Rastro:** cada passagem grava quem passou, quem assumiu e a hora; entra na
  descrição do ato anestésico e na impressão. Admin também pode assumir à força —
  mas fica registrado do mesmo jeito, nada silencioso.
- A lista de fichas mostra quem está com cada ficha em andamento.

## Fase C — Salvamento automático e à prova de queda

Os registros da grade já têm fila local e reenvio (`services/fichaAnestesica.js`), mas
cabeçalho, descrição e rodapé só vão para o banco quando se clica em **Salvar**
(`FichaAnestesica.jsx:186`). Bateria acabando no meio da digitação perde tudo isso.

- Gravação automática com atraso curto (~1,2 s) sobre cabeçalho, narrativa e extras.
- Espelho local (`fa_dados_<id>`) escrito a cada tecla e descarregado ao trocar de aba
  ou fechar; ao reabrir, se o espelho for mais novo que o banco, a tela oferece
  restaurar.
- O botão Salvar dá lugar a "salvo hh:mm / salvando / pendente" (o botão continua
  existindo para quem quiser salvar na hora).
- Cuidado conhecido: a atualização ao voltar o foco (`FichaAnestesica.jsx:213`) não
  pode sobrescrever o campo que está sendo digitado.

## Fase D — Busca do paciente enquanto digita

`NovaFichaDialog.jsx:63-88` só busca ao clicar em "Buscar".

- Busca disparada sozinha a partir de 3 letras, com atraso de ~350 ms e descarte de
  resposta atrasada (a resposta antiga não pode sobrescrever a nova).
- Buscar em `pacientes` **e** nas APAs pelo nome, mostrando de onde veio cada
  resultado — é o caso do paciente que não está no mapa de hoje mas tem APA feita.
- Botão "Buscar" sai; Enter continua funcionando. "Nenhum encontrado" só aparece
  depois da resposta, nunca durante a digitação.

## Fase E — Cabeçalho enxuto + "Visualizar APA"

O cabeçalho hoje traz via aérea prevista, plano anestésico, ASA, jejum e medicamentos
de uso contínuo (`CabecalhoFicha.jsx`). Fica só o do print:

- **Linha 1:** Paciente · Idade · Peso · Altura · IMC · Alergias.
- **Linha 2:** Cirurgia + técnica anestésica em caixas de marcar (Geral balanceada
  AGVI, Geral venosa total AGVT, Sedação, Raquianestesia, Peridural, Bloqueio
  periférico).
- O que sai da tela **continua sendo gravado** em `dados.cabecalho` — some da vista,
  não do registro.
- Amarração a não esquecer: a descrição do ato anestésico escolhe os modelos pela
  técnica (`narrativa.js:130`, hoje `planoAnestesico.tecnica`). Passa a casar com as
  técnicas marcadas.
- **Botão "Visualizar APA"** no topo da ficha: abre a APA de origem em modal usando o
  mesmo `ApaPrintTemplate` da pré-visualização da APA. Sem `apa_id`, o botão fica
  cinza e desabilitado.
- Revisar a impressão da FA para não sair campo que deixou de ser preenchido.

## Fase F — Descrição do ato anestésico automática

`gerarNarrativa()` já monta o texto; hoje só roda no botão "Gerar dos registros".

- Passa a rodar sozinha enquanto a ficha é preenchida.
- Assim que o médico editar o texto à mão, o automático para naquela ficha
  (`narrativaManual`) — texto assinado não pode ser reescrito por baixo.
- O botão continua, como "Regerar", avisando que substitui o texto atual.

## Fase G — Grade no padrão do protótipo

- **Ordem das seções** igual à do print: 3. Agentes / 4. Balanço hidroeletrolítico /
  5. Monitorização / 6. Gráfico hemodinâmico (hoje o balanço é o 6 e a hemodinâmica é
  o 4, em `GradeTemporal.jsx:19-24`).
- **Balanço em quatro linhas**: Soluções (+), Hemocomponentes (+), Sangue (Perda) (−),
  Diurese (Perda) (−), com o tipo (SF, RL, coloide; CH, plasma, plaquetas) escolhido
  no diálogo e gravado junto do valor. Hoje são seis linhas fixas
  (`20260811190000_fa_catalogos.sql`). Antes de trocar, conferir se já existe ficha com
  registro nos códigos antigos — se existir, os eventos vão junto na migration.
- **"+ Adicionar Medicação"** no fim da seção de agentes: cria uma linha contínua só
  daquela ficha (`dados.extras.linhasExtras`), sem sujar o catálogo do hospital. A
  grade passa a montar as linhas do catálogo + as da ficha.
- **Painel do gráfico** no padrão "Sinais Vitais": PAS/PAD automático, FC e PAM (auto).

## Fase H — Arrastar para repetir no toque

`GradeTemporal.jsx:206-208` usa `onPointerEnter` para pintar as colunas seguintes. No
toque isso não dispara: o dedo fica capturado pela célula de origem. Por isso o arrasto
só funciona com mouse.

- Segurar ~350 ms numa célula com valor entra no modo "repetir" (vibra e destaca a
  linha); o movimento passa a calcular a coluna pelo deslocamento horizontal, e soltar
  aplica o valor até onde chegou.
- Toque curto continua abrindo a célula para digitar.
- `touch-action: none` só enquanto o modo está ativo, para não matar a rolagem da grade.

## O que sobrou para depois

- **Fichas com registros nos códigos antigos do balanço** (cristaloide, coloide,
  concentrado de hemácias, plasma) não aparecem mais na grade: as linhas foram
  desativadas na Fase G. Não havia nenhuma ficha viva com esses registros quando a
  mudança subiu; se aparecer alguma, reativar é um update.
- **Teste logado.** Nenhuma das fases foi vista com a FA aberta de verdade: o
  navegador do agente para no login. Grade, cabeçalho e o arrasto por toque foram
  conferidos com componentes renderizados isoladamente; a trava do responsável, com
  SQL contra o banco.

## Decisões fechadas nesta rodada (13/ago/2026)

1. **A grade segue o print, sem interpretação.** Seções na ordem 3. Agentes (com
   "+ Adicionar Medicação" no fim) / 4. Balanço hidroeletrolítico em quatro linhas /
   5. Monitorização (Temperatura, ETCO2, SatO2, ECG, BIS, PAI (PAM)) com o
   **posicionamento dentro da grade**, logo abaixo / 6. Gráfico hemodinâmico com o
   painel "Sinais Vitais" (PAS/PAD automático, FC, PAM (Auto) desabilitado) e a escala
   numérica em faixa própria, fora do texto.
2. **Teclado na tela é opção do aparelho**, não regra fixa: botão no topo da ficha
   liga e desliga, e a escolha fica gravada naquele aparelho. Nasce ligado no que é
   toque (tablet, celular) e desligado no que tem mouse. Com ele ligado, o campo não
   chama o teclado do sistema; desligado, o teclado do sistema é o único.
