-- ============================================================================
-- RLS — Fase 1: fechar a porta da rua.
--
-- Estado até aqui: 51 das 52 tabelas do schema `public` estavam com Row Level
-- Security DESLIGADO e com GRANT ALL para o papel `anon`. Como a chave anônima
-- é pública por design (vai no bundle JavaScript que qualquer pessoa lê no
-- DevTools do site), isso significa que, SEM LOGIN, a API REST do Supabase
-- entregava a base inteira: nome/e-mail/CPF de todo mundo em `users`, 596
-- pacientes, 1.533 APAs, o caixa em `finance_transactions`, 8.9 mil linhas de
-- `logs`. Não é risco hipotético — foi comprovado com requisição direta.
--
-- A única tabela protegida era `fichas_anestesicas`, que já roda com RLS desde
-- agosto/2026 sem incidente. Esta migration estende exatamente aquele modelo,
-- que já provou que não atrapalha quem está logado, para todas as demais.
--
-- O QUE ESTA FASE FAZ (e o que deliberadamente NÃO faz):
--   FAZ  — liga RLS em todas as tabelas e cria uma política única por tabela:
--          quem está autenticado continua enxergando e fazendo tudo o que já
--          fazia; quem não está não enxerga nada.
--   FAZ  — revoga os GRANTs de `anon`, para que a porta esteja fechada em duas
--          camadas: mesmo que uma tabela futura nasça sem política, o papel
--          anônimo não tem privilégio de tabela nenhum aqui.
--   NÃO FAZ — nenhuma distinção por cargo. Médico continua alcançando o mesmo
--          que alcançava ontem. Separar financeiro/cadastro por papel é a Fase
--          2, e vem em migration própria justamente para que o risco de cada
--          etapa possa ser avaliado (e revertido) isoladamente.
--
-- POR QUE ISSO NÃO TRAVA NINGUÉM (a preocupação legítima de quem já apanhou de
-- RLS): ligar RLS sem política nega tudo — esse é o erro clássico. Aqui toda
-- tabela recebe a política ANTES de qualquer coisa entrar em vigor, na mesma
-- transação, e a política é permissiva para `authenticated` em TODOS os
-- comandos (USING true / WITH CHECK true). O app resolve o perfil por e-mail
-- depois que a sessão existe (AuthContext), logo nenhuma consulta do sistema
-- roda como anônimo.
--
-- REVERSÃO: `alter table public.<tabela> disable row level security;` é
-- instantâneo e não perde dado. O bloco no fim do arquivo, comentado, desfaz
-- tudo de uma vez.
--
-- EFEITO COLATERAL CONHECIDO E ACEITO: os scripts avulsos da raiz do repo
-- (test_*.js, check_db.js, importar.js, scripts/*.js) falam com o banco usando
-- a chave anônima e sem login — eles param de enxergar dado. São ferramentas de
-- diagnóstico local, não fazem parte do sistema em produção; para usá-los de
-- novo, trocar a chave anônima pela `service_role` no ambiente local.
-- ============================================================================

do $$
declare
  -- Lista explícita, e não "toda tabela do schema", de propósito: uma tabela
  -- nova que apareça amanhã tem de ser uma decisão consciente de quem a criou,
  -- e não algo que este arquivo silenciosamente adota.
  tabelas text[] := array[
    'agenda_categorias', 'agenda_pessoal', 'aihs', 'apa_regras_medicamento', 'apas',
    'atendimentos', 'cirurgias_programacao_fixa', 'consultas', 'escala_plantoes',
    'fa_farmacos', 'fa_narrativas', 'fa_parametros', 'finance_accounts',
    'finance_categories', 'finance_cost_centers', 'finance_doctor_settings',
    'finance_glosas', 'finance_imported_transactions', 'finance_parties',
    'finance_quote_items', 'finance_quotes', 'finance_recurrences',
    'finance_repasse_items', 'finance_repasses', 'finance_service_sales',
    'finance_services', 'finance_transaction_payments', 'finance_transactions',
    'folha_assinaturas', 'internacoes', 'leitos', 'leitos_setores', 'logs',
    'motivos_suspensao', 'pacientes', 'profissionais_agenda_bloqueios',
    'profissionais_agenda_config', 'prontuario_evolucao', 'prontuario_exames',
    'prontuario_receitas', 'settings', 'sigtap', 'sigtap_procedimentos',
    'surgeries', 'unidades', 'users', 'workspace_db_properties',
    'workspace_db_values', 'workspace_db_views', 'workspace_mentions',
    'workspace_pages'
  ];
  t text;
begin
  foreach t in array tabelas loop
    -- Tabela que ainda não existe neste banco (bancos de hospital nascem em
    -- estágios diferentes) é pulada em silêncio, para a migration continuar
    -- aplicável em qualquer um deles.
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Idempotente: rodar de novo não duplica nem falha.
    execute format('drop policy if exists %I on public.%I', t || '_autenticado', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_autenticado', t
    );

    -- Segunda camada. `anon` herda privilégios concedidos a PUBLIC, então
    -- revogar só de `anon` não bastaria.
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from public', t);

    -- Quem está logado precisa continuar com os privilégios de tabela que já
    -- tinha; RLS filtra linha, GRANT abre a porta. Reafirmado aqui para o caso
    -- de o revoke de PUBLIC ter alcançado algo herdado.
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- `fichas_anestesicas` já vivia com RLS e três políticas próprias (select,
-- insert, update — sem delete, porque ficha não some em definitivo: vai para a
-- lixeira via fa_marcar_removido). Não recebe a política genérica para não
-- afrouxar o que já está mais apertado; só a revogação do anônimo, para ficar
-- no mesmo padrão das outras.
do $$
begin
  if to_regclass('public.fichas_anestesicas') is not null then
    revoke all on public.fichas_anestesicas from anon;
    revoke all on public.fichas_anestesicas from public;
    grant select, insert, update, delete on public.fichas_anestesicas to authenticated;
    grant all on public.fichas_anestesicas to service_role;
  end if;
end $$;

-- Sequências: sem USAGE o insert de quem está logado falharia em tabela com
-- coluna serial. Fecha para o anônimo pelo mesmo motivo das tabelas.
do $$
declare s record;
begin
  for s in select schemaname, sequencename from pg_sequences where schemaname = 'public' loop
    execute format('revoke all on sequence public.%I from anon', s.sequencename);
    execute format('grant usage, select on sequence public.%I to authenticated', s.sequencename);
  end loop;
end $$;

-- Privilégios padrão: tabela criada daqui para frente não nasce mais aberta ao
-- anônimo. (RLS continua sendo decisão explícita de quem cria a tabela — este
-- default só evita que ela nasça pública por esquecimento.)
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ============================================================================
-- REVERSÃO DE EMERGÊNCIA — descomentar e rodar devolve o estado anterior:
--
-- do $$
-- declare t record;
-- begin
--   for t in select tablename from pg_tables where schemaname = 'public' loop
--     execute format('alter table public.%I disable row level security', t.tablename);
--     execute format('grant all on public.%I to anon', t.tablename);
--   end loop;
-- end $$;
-- ============================================================================
