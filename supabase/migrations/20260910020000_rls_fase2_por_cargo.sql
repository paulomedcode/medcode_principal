-- ============================================================================
-- RLS — Fase 2: separar por papel o que é dinheiro e o que é gente.
--
-- A Fase 1 fechou a porta da rua: sem login, ninguém entra. Mas dentro de casa
-- todas as portas continuavam abertas — e "dentro de casa" hoje são 58 médicos,
-- para 1 administrador. Na prática, qualquer médico logado podia pedir à API a
-- tabela `finance_transactions` inteira (o caixa da empresa), a folha e a
-- assinatura dos colegas, os 8.9 mil registros de `logs` — e, o mais grave,
-- podia REESCREVER `settings/permissions`, que é a matriz de permissões: dois
-- comandos e a pessoa se dá Acesso Total.
--
-- Esta fase faz o banco obedecer à MESMA matriz que a tela já obedece. Nada de
-- regra nova inventada aqui: a fonte é `settings/permissions` + as permissões
-- individuais de `users.permissoes_extras`, exatamente como em
-- `src/utils/permissoes.js`. Se a tela deixa, o banco deixa; se a tela esconde,
-- o banco agora também nega.
--
-- COMO A REGRA CHEGOU AO BANCO
--   `public.permissoes_catalogo` guarda, por permissão, a chave de acesso do
--   módulo dono dela e se o módulo é pessoal — é a tradução do catálogo em
--   `src/config/permissions.js`, gerada por `scripts/gerar-catalogo-permissoes.mjs`
--   (o mesmo script confere se banco e código continuam iguais).
--   `public.tem_permissao(texto)` repete a decisão de `podeAcessar()`: cargo,
--   extras, coringa do Acesso Total, passe do Desenvolvedor e a regra de que
--   permissão fina só vale com o módulo aberto.
--
-- A IDENTIDADE VEM DO E-MAIL DO JWT, não de auth.uid(). Neste sistema o perfil
-- é resolvido por e-mail e o id do cadastro não é o id de autenticação —
-- comparar `auth.uid()` com `users.id` numa política barraria o próprio dono do
-- registro, em silêncio. Foi assim que `meus_repasses()` já foi escrita.
--
-- O QUE NÃO ENTRA NESTA FASE: as tabelas clínicas (pacientes, apas, aihs,
-- prontuário) e a escala continuam visíveis a todo mundo que está logado.
-- Restringi-las depende de decisão de quem toca o hospital ("médico enxerga
-- paciente de outra unidade?"), não de regra que já exista no código — é a
-- Fase 3, e sem essa resposta ela seria chute.
--
-- REVERSÃO: o bloco comentado no fim devolve, tabela por tabela, a política
-- permissiva da Fase 1. Nada aqui apaga dado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O catálogo de permissões, do lado do banco
-- ----------------------------------------------------------------------------
create table if not exists public.permissoes_catalogo (
    permissao    text primary key,
    chave_acesso text,
    pessoal      boolean not null default false
);

comment on table public.permissoes_catalogo is
  'Espelho de src/config/permissions.js para uso nas políticas de RLS. Regenerar com scripts/gerar-catalogo-permissoes.mjs; conferir com --conferir.';

alter table public.permissoes_catalogo enable row level security;
drop policy if exists permissoes_catalogo_leitura on public.permissoes_catalogo;
create policy permissoes_catalogo_leitura on public.permissoes_catalogo
    for select to authenticated using (true);
-- Sem política de escrita: só migration (via postgres) e service_role mudam o
-- catálogo. Um usuário que pudesse editá-lo poderia se dar qualquer permissão.
revoke all on public.permissoes_catalogo from anon, public;
grant select on public.permissoes_catalogo to authenticated;
grant all on public.permissoes_catalogo to service_role;

delete from public.permissoes_catalogo;
insert into public.permissoes_catalogo (permissao, chave_acesso, pessoal) values
  ('Acao: Anexos', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Anotar', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Bloquear Agenda', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Confirmar', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Editar Tudo', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Imprimir', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Nao Internou', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Realizada', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Retrabalho', 'Acessar Mapa Cirúrgico', false),
  ('Acao: Suspensa', 'Acessar Mapa Cirúrgico', false),
  ('Acessar Atendimento', 'Acessar Atendimento', false),
  ('Acessar Autorizações', 'Acessar Autorizações', false),
  ('Acessar Compromissos', 'Acessar Compromissos', false),
  ('Acessar Configurações', 'Acessar Configurações', false),
  ('Acessar Escala', 'Acessar Escala', false),
  ('Acessar Financeiro', 'Acessar Financeiro', false),
  ('Acessar Mapa Cirúrgico', 'Acessar Mapa Cirúrgico', false),
  ('Acessar Meus Repasses', 'Acessar Meus Repasses', true),
  ('Acessar Recepção', 'Acessar Atendimento', false),
  ('Acessar Relatórios', 'Acessar Relatórios', false),
  ('Acessar Usuarios', 'Acessar Usuarios', false),
  ('Acesso Total (Admin)', 'Acesso Total (Admin)', false),
  ('Admin Escala', 'Acessar Escala', false),
  ('Alterar Quadros Compromisso', 'Acessar Compromissos', false),
  ('Assumir FA de Outro', 'Visualizar Atendimentos', false),
  ('Criar Agendamentos', 'Acessar Mapa Cirúrgico', false),
  ('Criar Bancos Compromisso', 'Acessar Compromissos', false),
  ('Criar Pacientes', 'Acessar Atendimento', false),
  ('Criar Páginas Compromisso', 'Acessar Compromissos', false),
  ('Criar/Editar AIH', 'Visualizar Atendimentos', false),
  ('Criar/Editar APA', 'Visualizar Atendimentos', false),
  ('Criar/Editar FA', 'Visualizar Atendimentos', false),
  ('Editar Agendamentos', 'Acessar Mapa Cirúrgico', false),
  ('Editar Bancos Compromisso', 'Acessar Compromissos', false),
  ('Editar Financeiro', 'Acessar Financeiro', false),
  ('Editar Pacientes', 'Acessar Atendimento', false),
  ('Editar Páginas Compromisso', 'Acessar Compromissos', false),
  ('Editar Verificados Escala', 'Acessar Escala', false),
  ('Excluir Agendamentos', 'Acessar Mapa Cirúrgico', false),
  ('Excluir AIH/APA', 'Visualizar Atendimentos', false),
  ('Excluir Bancos Compromisso', 'Acessar Compromissos', false),
  ('Excluir Pacientes', 'Acessar Atendimento', false),
  ('Excluir Páginas Compromisso', 'Acessar Compromissos', false),
  ('Excluir Quadros Compromisso', 'Acessar Compromissos', false),
  ('Finalizar FA', 'Visualizar Atendimentos', false),
  ('Forçar Conflito Escala', 'Acessar Escala', false),
  ('Gerenciar Permissões', 'Acessar Usuarios', false),
  ('Gerenciar Regras APA/FA', 'Visualizar Atendimentos', false),
  ('Imprimir Documentos', 'Visualizar Atendimentos', false),
  ('Operacional Escala', 'Acessar Escala', false),
  ('Reabrir FA Finalizada', 'Visualizar Atendimentos', false),
  ('Ver APAs de Todas as Unidades', 'Visualizar Atendimentos', false),
  ('Ver Fichas de Todas as Unidades', 'Visualizar Atendimentos', false),
  ('Ver Observações Escala', 'Acessar Escala', false),
  ('Visualizar Atendimentos', 'Visualizar Atendimentos', false),
  ('Visualizar Fila', 'Acessar Mapa Cirúrgico', false),
  ('Visualizar Mapa/Agenda', 'Acessar Mapa Cirúrgico', false),
  ('Visualizar Pacientes', 'Acessar Atendimento', false),
  ('Visualizar Toda Escala', 'Acessar Escala', false);

-- ----------------------------------------------------------------------------
-- 2. Quem sou eu, e o que eu posso
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER porque a própria função precisa ler `users` e `settings`
-- para responder — e essas tabelas passam a ter política. Sem isso, a decisão
-- dependeria da permissão que ela mesma está calculando.
create or replace function public.meu_cadastro()
returns table (id uuid, nome text, cargo text, extras jsonb, situacao text)
language sql
stable
security definer
set search_path = public
as $$
    select u.id, u.name, coalesce(u.role, 'Visualizador'),
           coalesce(u.permissoes_extras, '{}'::jsonb), coalesce(u.status, 'Ativo')
      from public.users u
     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and coalesce(auth.jwt() ->> 'email', '') <> ''
     limit 1;
$$;

comment on function public.meu_cadastro() is
  'O cadastro em public.users da sessão atual, resolvido pelo E-MAIL do JWT (não por auth.uid(): o id do cadastro não é o id de autenticação).';

create or replace function public.tem_permissao(p_permissao text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    eu       record;
    v_matriz jsonb;
    v_cargo  jsonb;
    v_somada jsonb;
    v_chave  text;
    v_pessoal boolean;
begin
    select * into eu from public.meu_cadastro();
    -- Sem sessão, sem cadastro, ou cadastro desativado: não pode nada. O app já
    -- desloga quem está 'Inativo'; aqui a regra deixa de depender do app.
    if eu.id is null or eu.situacao = 'Inativo' then
        return false;
    end if;

    select s.data into v_matriz from public.settings s where s.id = 'permissions';
    v_cargo  := coalesce(v_matriz -> eu.cargo, '{}'::jsonb);
    -- Extras são aditivos e vencem o cargo, como em podeAcessar().
    v_somada := v_cargo || eu.extras;

    select c.chave_acesso, c.pessoal into v_chave, v_pessoal
      from public.permissoes_catalogo c
     where c.permissao = p_permissao;

    -- Módulo pessoal (hoje: Meus Repasses) não é aberto por coringa nenhum —
    -- nem Acesso Total, nem passe de Desenvolvedor. A tela de alguém não é área
    -- administrativa.
    if coalesce(v_pessoal, false) then
        return (v_somada -> p_permissao) = 'true'::jsonb;
    end if;

    if lower(eu.cargo) in ('desenvolvedor', 'developer') then
        return true;
    end if;

    -- O coringa vem do CARGO, como na tela: extras não fabricam Acesso Total.
    if (v_cargo -> 'Acesso Total (Admin)') = 'true'::jsonb then
        return true;
    end if;

    if (v_somada -> p_permissao) is distinct from 'true'::jsonb then
        return false;
    end if;

    -- Permissão fina só vale com a porta do módulo aberta.
    if v_chave is null or v_chave = p_permissao then
        return true;
    end if;
    return (v_somada -> v_chave) = 'true'::jsonb;
end;
$$;

comment on function public.tem_permissao(text) is
  'A mesma decisão de src/utils/permissoes.js podeAcessar(), do lado do banco: cargo + extras, coringa do Acesso Total, passe do Desenvolvedor e a exigência da chave de acesso do módulo.';

-- Atalho para as três permissões que aparecem juntas em quase toda política de
-- escala; existe para a política ficar legível.
create or replace function public.opera_escala()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.tem_permissao('Operacional Escala') or public.tem_permissao('Admin Escala');
$$;

revoke all on function public.meu_cadastro() from public, anon;
revoke all on function public.tem_permissao(text) from public, anon;
revoke all on function public.opera_escala() from public, anon;
grant execute on function public.meu_cadastro() to authenticated, service_role;
grant execute on function public.tem_permissao(text) to authenticated, service_role;
grant execute on function public.opera_escala() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Financeiro
--
-- Regra: ver exige 'Acessar Financeiro', mexer exige 'Editar Financeiro'.
--
-- A exceção é a Escala. Quem envia folha para o financeiro e quem registra
-- plantão pago à vista trabalha em `finance_transactions` sem ter (nem dever
-- ter) a chave do módulo Financeiro — o cargo Operador é exatamente esse caso.
-- Toda gravação desse fluxo carrega `shift_id` ('folha:…' / 'avista:…'), e toda
-- leitura dele filtra por `shift_id`. Então a exceção é essa, e só essa: linha
-- de repasse. O caixa da empresa continua fora do alcance.
-- ----------------------------------------------------------------------------
do $$
declare
    -- Todas as tabelas do financeiro EXCETO as quatro tratadas logo abaixo.
    tabelas text[] := array[
        'finance_doctor_settings', 'finance_glosas', 'finance_imported_transactions',
        'finance_parties', 'finance_quote_items', 'finance_quotes',
        'finance_recurrences', 'finance_repasse_items', 'finance_repasses',
        'finance_service_sales', 'finance_services'
    ];
    t text;
begin
    foreach t in array tabelas loop
        if to_regclass(format('public.%I', t)) is null then continue; end if;
        execute format('drop policy if exists %I on public.%I', t || '_autenticado', t);
        execute format($f$
            create policy %I on public.%I for select to authenticated
            using ((select public.tem_permissao('Acessar Financeiro')))
        $f$, t || '_ver', t);
        execute format($f$
            create policy %I on public.%I for insert to authenticated
            with check ((select public.tem_permissao('Editar Financeiro')))
        $f$, t || '_criar', t);
        execute format($f$
            create policy %I on public.%I for update to authenticated
            using ((select public.tem_permissao('Editar Financeiro')))
            with check ((select public.tem_permissao('Editar Financeiro')))
        $f$, t || '_editar', t);
        execute format($f$
            create policy %I on public.%I for delete to authenticated
            using ((select public.tem_permissao('Editar Financeiro')))
        $f$, t || '_excluir', t);
    end loop;
end $$;

-- Contas, categorias e centros de custo: a tela de Repasses da Escala monta os
-- seletores da baixa com essas três listas. Quem opera a escala passa a
-- enxergá-las (nomes — e, no caso das contas, o saldo). É a menor abertura que
-- mantém a tela funcionando; escrever continua exigindo 'Editar Financeiro'.
do $$
declare
    tabelas text[] := array['finance_accounts', 'finance_categories', 'finance_cost_centers'];
    t text;
begin
    foreach t in array tabelas loop
        if to_regclass(format('public.%I', t)) is null then continue; end if;
        execute format('drop policy if exists %I on public.%I', t || '_autenticado', t);
        execute format($f$
            create policy %I on public.%I for select to authenticated
            using ((select public.tem_permissao('Acessar Financeiro') or public.opera_escala()))
        $f$, t || '_ver', t);
        execute format($f$
            create policy %I on public.%I for insert to authenticated
            with check ((select public.tem_permissao('Editar Financeiro')))
        $f$, t || '_criar', t);
        execute format($f$
            create policy %I on public.%I for update to authenticated
            using ((select public.tem_permissao('Editar Financeiro')))
            with check ((select public.tem_permissao('Editar Financeiro')))
        $f$, t || '_editar', t);
        execute format($f$
            create policy %I on public.%I for delete to authenticated
            using ((select public.tem_permissao('Editar Financeiro')))
        $f$, t || '_excluir', t);
    end loop;
end $$;

-- finance_transactions: o caixa. Aqui mora a exceção do repasse.
drop policy if exists finance_transactions_autenticado on public.finance_transactions;

create policy finance_transactions_ver on public.finance_transactions
    for select to authenticated
    using (
        (select public.tem_permissao('Acessar Financeiro'))
        or ((select public.opera_escala()) and shift_id is not null)
    );

create policy finance_transactions_criar on public.finance_transactions
    for insert to authenticated
    with check (
        (select public.tem_permissao('Editar Financeiro'))
        or ((select public.opera_escala()) and shift_id is not null)
    );

create policy finance_transactions_editar on public.finance_transactions
    for update to authenticated
    using (
        (select public.tem_permissao('Editar Financeiro'))
        or ((select public.opera_escala()) and shift_id is not null)
    )
    with check (
        (select public.tem_permissao('Editar Financeiro'))
        or ((select public.opera_escala()) and shift_id is not null)
    );

create policy finance_transactions_excluir on public.finance_transactions
    for delete to authenticated
    using (
        (select public.tem_permissao('Editar Financeiro'))
        or ((select public.opera_escala()) and shift_id is not null)
    );

-- Baixas: a tela de Repasses reaproveita o BaixaModal do financeiro e lista os
-- pagamentos do lançamento de repasse. Só esses.
drop policy if exists finance_transaction_payments_autenticado on public.finance_transaction_payments;

create policy finance_transaction_payments_ver on public.finance_transaction_payments
    for select to authenticated
    using (
        (select public.tem_permissao('Acessar Financeiro'))
        or (
            (select public.opera_escala())
            and exists (
                select 1 from public.finance_transactions t
                 where t.id = finance_transaction_payments.transaction_id
                   and t.shift_id is not null
            )
        )
    );

create policy finance_transaction_payments_criar on public.finance_transaction_payments
    for insert to authenticated
    with check ((select public.tem_permissao('Editar Financeiro')));

create policy finance_transaction_payments_editar on public.finance_transaction_payments
    for update to authenticated
    using ((select public.tem_permissao('Editar Financeiro')))
    with check ((select public.tem_permissao('Editar Financeiro')));

create policy finance_transaction_payments_excluir on public.finance_transaction_payments
    for delete to authenticated
    using ((select public.tem_permissao('Editar Financeiro')));

-- ----------------------------------------------------------------------------
-- 4. Folha de ponto assinada
--
-- O médico precisa ver e assinar a folha DELE — é o que a pendência da tela
-- inicial faz. Ver a folha (e a assinatura, e o valor) dos colegas, não.
-- O casamento por id OU por nome é o mesmo de meus_repasses(): folha antiga não
-- tem doctor_id, e o nome vem da escala, que pode divergir do cadastro.
-- ----------------------------------------------------------------------------
drop policy if exists folha_assinaturas_autenticado on public.folha_assinaturas;

create policy folha_assinaturas_ver on public.folha_assinaturas
    for select to authenticated
    using (
        (select public.opera_escala())
        or doctor_id = (select id from public.meu_cadastro())
        or lower(doctor_name) = lower((select nome from public.meu_cadastro()))
    );

create policy folha_assinaturas_criar on public.folha_assinaturas
    for insert to authenticated
    with check ((select public.opera_escala()));

-- O UPDATE do médico é a assinatura. O da escala é enviar, cancelar e vincular
-- ao lançamento.
create policy folha_assinaturas_editar on public.folha_assinaturas
    for update to authenticated
    using (
        (select public.opera_escala())
        or doctor_id = (select id from public.meu_cadastro())
        or lower(doctor_name) = lower((select nome from public.meu_cadastro()))
    )
    with check (
        (select public.opera_escala())
        or doctor_id = (select id from public.meu_cadastro())
        or lower(doctor_name) = lower((select nome from public.meu_cadastro()))
    );

create policy folha_assinaturas_excluir on public.folha_assinaturas
    for delete to authenticated
    using ((select public.opera_escala()));

-- ----------------------------------------------------------------------------
-- 5. Cadastro de pessoas
--
-- LER continua liberado a quem está logado, e isso é intencional: o nome do
-- médico aparece na escala, na fila, na agenda, na APA, na ficha — é uma lista
-- telefônica interna. O que muda é MEXER: criar, editar e excluir cadastro
-- passa a exigir 'Acessar Usuarios'. A exceção é a própria pessoa se cadastrar
-- pela tela "Solicitar Acesso", que cria a linha dela mesma (e nasce Inativo,
-- esperando liberação).
--
-- FICA REGISTRADO: `users.cpf` continua legível por qualquer pessoa logada.
-- Esconder coluna não é trabalho de RLS (que filtra linha) e mexer nisso exige
-- trocar o `select('*')` do AuthContext — é candidato a Fase 3.
-- ----------------------------------------------------------------------------
drop policy if exists users_autenticado on public.users;

create policy users_ver on public.users
    for select to authenticated using (true);

create policy users_criar on public.users
    for insert to authenticated
    with check (
        (select public.tem_permissao('Acessar Usuarios'))
        or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '#sem-email#'))
    );

create policy users_editar on public.users
    for update to authenticated
    using ((select public.tem_permissao('Acessar Usuarios')))
    with check ((select public.tem_permissao('Acessar Usuarios')));

create policy users_excluir on public.users
    for delete to authenticated
    using ((select public.tem_permissao('Acessar Usuarios')));

-- ----------------------------------------------------------------------------
-- 6. settings — a tabela mais perigosa do banco
--
-- Ela guarda a matriz de permissões. Enquanto qualquer pessoa logada pudesse
-- gravar em `settings/permissions`, toda a matriz era decorativa: bastava um
-- upsert para se dar Acesso Total. É a correção mais importante desta fase.
--
-- LER continua liberado: praticamente toda tela do sistema lê algum documento
-- daqui (`general` para identidade visual, `permissions` para montar o próprio
-- menu, `escala` para a grade, `medicas` para o cabeçalho dos documentos).
-- ESCREVER passa a depender de qual documento é.
-- ----------------------------------------------------------------------------
drop policy if exists settings_autenticado on public.settings;

create policy settings_ver on public.settings
    for select to authenticated using (true);

-- Uma função só, usada nas três políticas de escrita, para a regra ficar num
-- lugar só e não divergir entre INSERT, UPDATE e DELETE.
create or replace function public.pode_gravar_setting(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select case
        -- A matriz de permissões: só quem gerencia permissões.
        when p_id = 'permissions'
            then public.tem_permissao('Gerenciar Permissões')
        -- A escala e seus satélites (backups, lixeira, config financeira do
        -- repasse) são escritos pela tela de Escala.
        when p_id like 'escala%'
            then public.opera_escala() or public.tem_permissao('Acessar Configurações')
        -- Textos padrão do exame físico da APA: a chave é a das regras
        -- clínicas, não a das Configurações do sistema.
        when p_id = 'apa_exame_padrao'
            then public.tem_permissao('Gerenciar Regras APA/FA')
              or public.tem_permissao('Acessar Configurações')
        else public.tem_permissao('Acessar Configurações')
    end;
$$;

revoke all on function public.pode_gravar_setting(text) from public, anon;
grant execute on function public.pode_gravar_setting(text) to authenticated, service_role;

create policy settings_criar on public.settings
    for insert to authenticated
    with check ((select public.pode_gravar_setting(id)));

create policy settings_editar on public.settings
    for update to authenticated
    using ((select public.pode_gravar_setting(id)))
    with check ((select public.pode_gravar_setting(id)));

create policy settings_excluir on public.settings
    for delete to authenticated
    using ((select public.pode_gravar_setting(id)));

-- ----------------------------------------------------------------------------
-- 7. logs
--
-- Todo mundo GRAVA (é o rastro de quem fez o quê). Ler é outra história: o log
-- traz e-mail, IP e a descrição da ação — inclusive das ações do financeiro.
-- Fica com quem já tem a tela que os exibe: Configurações (tela de Logs) e a
-- Escala (o histórico de alterações da grade).
--
-- A limpeza dos logs com mais de 6 meses que o logger dispara a cada gravação
-- vira um DELETE que não encontra linha para quem não pode lê-las — não é erro,
-- é o RLS filtrando; a faxina continua acontecendo quando quem grava é alguém
-- de Configurações ou da Escala.
-- ----------------------------------------------------------------------------
drop policy if exists logs_autenticado on public.logs;

create policy logs_ver on public.logs
    for select to authenticated
    using (
        (select public.tem_permissao('Acessar Configurações') or public.opera_escala())
    );

create policy logs_criar on public.logs
    for insert to authenticated with check (true);

create policy logs_excluir on public.logs
    for delete to authenticated
    using (
        (select public.tem_permissao('Acessar Configurações') or public.opera_escala())
    );

-- ============================================================================
-- REVERSÃO DE EMERGÊNCIA — devolve a permissividade da Fase 1 (continua
-- fechado para o anônimo, que é o ganho maior):
--
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'finance_accounts','finance_categories','finance_cost_centers',
--     'finance_doctor_settings','finance_glosas','finance_imported_transactions',
--     'finance_parties','finance_quote_items','finance_quotes','finance_recurrences',
--     'finance_repasse_items','finance_repasses','finance_service_sales',
--     'finance_services','finance_transaction_payments','finance_transactions',
--     'folha_assinaturas','users','settings','logs'
--   ] loop
--     execute format('drop policy if exists %I on public.%I', t || '_ver', t);
--     execute format('drop policy if exists %I on public.%I', t || '_criar', t);
--     execute format('drop policy if exists %I on public.%I', t || '_editar', t);
--     execute format('drop policy if exists %I on public.%I', t || '_excluir', t);
--     execute format(
--       'create policy %I on public.%I for all to authenticated using (true) with check (true)',
--       t || '_autenticado', t);
--   end loop;
-- end $$;
-- ============================================================================
