# MedCode — ERP/CRM

Sistema interno da MedCode Assessoria (sites, landing pages, sistemas sob
medida, agentes de IA e consultoria). No ar em https://sistema.medcodedev.com.

## Módulos

| Módulo | Rota | O que faz |
|---|---|---|
| Painel | `/painel` | MRR, a receber/pagar, funil, vendas por mês, margem por projeto, próximos passos |
| Clientes | `/clientes` | Cadastro único de empresas (lead, cliente, fornecedor), contatos e histórico |
| Vendas | `/vendas` | Funil em quadro, propostas, ganhar/perder oportunidade |
| Projetos | `/projetos` | Projetos vendidos, prazos, entregas, parcelas, custos e margem |
| Financeiro | `/finance/*` | Contas, lançamentos, conciliação OFX, recorrências, DRE e relatórios |
| Compromissos | `/compromissos` | Páginas e quadros estilo Notion; cada projeto tem o seu quadro de entregas |

"Ganhar" uma oportunidade (`ganhar_oportunidade` no banco) faz tudo de uma
vez: lead vira cliente, nasce o projeto, as parcelas a receber, a mensalidade
e o quadro de entregas com as fases do tipo de serviço (`src/config/servicos.js`).

## Stack

React 19 + Vite + Tailwind, Supabase (Postgres com RLS por permissão), Vercel.

- Permissões: catálogo único em `src/config/permissions.js`; o banco repete a
  regra em `tem_permissao()` e a tabela `permissoes_catalogo`.
- Banco: migrations em `supabase/migrations/`, aplicadas pelo workflow
  `db-migrate.yml` (ou `node scripts/aplicar-migrations.mjs`), que em seguida
  confere RLS (`scripts/checar-rls.mjs`) e catálogo
  (`scripts/gerar-catalogo-permissoes.mjs --conferir`).

## Rodar local

```bash
npm install
npm run dev
```

Precisa de `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
