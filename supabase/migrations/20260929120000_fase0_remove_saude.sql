-- ============================================================================
-- Fase 0 do MedCode: fim do legado de saúde.
--
-- O sistema nasceu de um ERP hospitalar (fila cirúrgica, APA, ficha anestésica,
-- prontuário, escala de plantões, repasse médico, glosas, unidades). A MedCode é
-- uma agência — nada disso tem uso, e o banco ainda está vazio: apagar agora
-- custa zero; depois de ter dado real misturado custaria caro.
--
-- Fica: autenticação/usuários/permissões, Compromissos (workspace), agenda
-- pessoal (lembretes), logs, settings e o núcleo do Financeiro. O financeiro
-- perde o vínculo com médico/cirurgia/plantão (doctor_id, surgery_id, shift_id)
-- — o vínculo que o substitui é o projeto, nas próximas migrations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Políticas e funções do financeiro que abriam exceção para a Escala
--    (quem operava a escala via e lançava o repasse do plantão). Saem antes de
--    opera_escala() e de shift_id.
-- ----------------------------------------------------------------------------
drop policy if exists finance_accounts_ver on public.finance_accounts;
create policy finance_accounts_ver on public.finance_accounts for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro')));

drop policy if exists finance_categories_ver on public.finance_categories;
create policy finance_categories_ver on public.finance_categories for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro')));

drop policy if exists finance_cost_centers_ver on public.finance_cost_centers;
create policy finance_cost_centers_ver on public.finance_cost_centers for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro')));

drop policy if exists finance_transactions_ver on public.finance_transactions;
create policy finance_transactions_ver on public.finance_transactions for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro')));
drop policy if exists finance_transactions_criar on public.finance_transactions;
create policy finance_transactions_criar on public.finance_transactions for insert to authenticated
    with check ((select public.tem_permissao('Editar Financeiro')));
drop policy if exists finance_transactions_editar on public.finance_transactions;
create policy finance_transactions_editar on public.finance_transactions for update to authenticated
    using ((select public.tem_permissao('Editar Financeiro')))
    with check ((select public.tem_permissao('Editar Financeiro')));
drop policy if exists finance_transactions_excluir on public.finance_transactions;
create policy finance_transactions_excluir on public.finance_transactions for delete to authenticated
    using ((select public.tem_permissao('Editar Financeiro')));

drop policy if exists finance_transaction_payments_ver on public.finance_transaction_payments;
create policy finance_transaction_payments_ver on public.finance_transaction_payments for select to authenticated
    using ((select public.tem_permissao('Acessar Financeiro')));

drop policy if exists logs_ver on public.logs;
create policy logs_ver on public.logs for select to authenticated
    using ((select public.tem_permissao('Acessar Configurações')));
drop policy if exists logs_excluir on public.logs;
create policy logs_excluir on public.logs for delete to authenticated
    using ((select public.tem_permissao('Acessar Configurações')));

create or replace function public.pode_gravar_setting(p_id text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
    select case
        -- A matriz de permissões: só quem gerencia permissões.
        when p_id = 'permissions'
            then public.tem_permissao('Gerenciar Permissões')
        else public.tem_permissao('Acessar Configurações')
    end;
$function$;

create or replace function public.pode_mexer_no_lancamento(p_transaction_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
    select public.tem_permissao('Editar Financeiro');
$function$;

create or replace function public.settle_group(p_group_id uuid, p_date date, p_method text, p_account_id uuid, p_doc text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
    if not public.tem_permissao('Editar Financeiro') then
        raise exception 'Sem permissão para dar baixa neste grupo.' using errcode = '42501';
    end if;
    return public.settle_group__interno(p_group_id, p_date, p_method, p_account_id, p_doc);
end; $function$;

-- Rateio e lançamento a partir do extrato: mesmas funções, sem doctor_id.
create or replace function public.create_split_transactions__interno(p_rows jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_group uuid := gen_random_uuid(); r jsonb; v_sum numeric := 0;
begin
  if p_rows is null or jsonb_array_length(p_rows) < 2 then
    raise exception 'O rateio precisa de pelo menos 2 categorias.';
  end if;
  for r in select * from jsonb_array_elements(p_rows)
  loop
    if coalesce((r->>'amount')::numeric, 0) <= 0 then
      raise exception 'Cada linha do rateio deve ter valor maior que zero.';
    end if;
    insert into finance_transactions (
      account_id, category_id, party_id, type, amount,
      transaction_date, due_date, description, status, payment_method,
      cost_center_id, doc_number, split_group_id
    ) values (
      (r->>'account_id')::uuid,
      nullif(r->>'category_id', '')::uuid,
      nullif(r->>'party_id', '')::uuid,
      r->>'type',
      (r->>'amount')::numeric,
      (r->>'transaction_date')::date,
      nullif(r->>'due_date', '')::date,
      r->>'description',
      coalesce(nullif(r->>'status', ''), 'PENDENTE'),
      nullif(r->>'payment_method', ''),
      coalesce(nullif(r->>'cost_center_id', '')::uuid, '30000000-0000-0000-0000-000000000001'),
      nullif(r->>'doc_number', ''),
      v_group
    );
    v_sum := v_sum + (r->>'amount')::numeric;
  end loop;
  return v_group;
end $function$;

create or replace function public.launch_imported_transactions_detailed__interno(p_items jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_item jsonb; v_imp public.finance_imported_transactions; v_tx_id uuid; v_first uuid;
  v_count int := 0; v_amount numeric; v_type text; v_desc text; v_cc uuid; v_method text;
  v_ref text; v_party uuid; v_as_transfer boolean; v_counter uuid;
  v_counter_name text; v_group uuid; v_splits jsonb; v_split_sum numeric; r jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    select * into v_imp from finance_imported_transactions where id = (v_item->>'id')::uuid for update;
    if not found then continue; end if;
    if v_imp.reconciled or v_imp.ignored then continue; end if;

    v_amount := abs(coalesce(nullif(v_item->>'amount', '')::numeric, v_imp.amount));
    if v_amount <= 0 then continue; end if;
    -- O valor do banco é fato: o lançamento criado tem de valer o mesmo que a linha do extrato.
    if abs(v_amount - abs(v_imp.amount)) > 0.01 then
      raise exception 'Valor do lançamento (R$ %) difere da linha do banco (R$ %). O valor do extrato não pode ser editado ao lançar.',
        trim(to_char(v_amount, 'FM999G999G990D00')), trim(to_char(abs(v_imp.amount), 'FM999G999G990D00'));
    end if;
    v_type := case when coalesce(v_imp.amount, 0) >= 0 then 'ENTRADA' else 'SAIDA' end;
    v_desc := coalesce(nullif(trim(v_item->>'description'), ''), v_imp.description, 'Lançamento conciliado (OFX)');
    v_cc := coalesce(nullif(v_item->>'cost_center_id', '')::uuid, '30000000-0000-0000-0000-000000000001');
    v_method := coalesce(nullif(v_item->>'payment_method', ''), 'OUTRO');
    v_ref := nullif(v_item->>'reference_month', '');
    v_party := nullif(v_item->>'party_id', '')::uuid;
    v_as_transfer := coalesce((v_item->>'as_transfer')::boolean, false);
    v_splits := v_item->'splits';

    if v_as_transfer then
      v_counter := nullif(v_item->>'counter_account_id', '')::uuid;
      v_counter_name := null;
      if v_counter is not null then select name into v_counter_name from finance_accounts where id = v_counter; end if;
      if v_counter_name is not null then
        v_desc := v_desc || case when v_imp.amount >= 0 then ' ← ' else ' → ' end || v_counter_name;
      end if;
      v_group := gen_random_uuid();
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, transfer_group_id, reference_month, party_id)
      values
        (v_imp.account_id, null, v_cc, v_type, v_amount, v_imp.transaction_date, v_desc, 'PAGO', 'TRANSFERENCIA', v_imp.id, v_group, v_ref, v_party)
      returning id into v_tx_id;

    elsif jsonb_typeof(v_splits) = 'array' and jsonb_array_length(v_splits) >= 2 then
      v_split_sum := 0;
      for r in select * from jsonb_array_elements(v_splits) loop
        v_split_sum := v_split_sum + abs(coalesce((r->>'amount')::numeric, 0));
      end loop;
      if abs(v_split_sum - v_amount) > 0.01 then
        raise exception 'A soma do rateio (%) difere do valor da linha (%).', v_split_sum, v_amount;
      end if;
      v_group := gen_random_uuid();
      v_first := null;
      for r in select * from jsonb_array_elements(v_splits) loop
        insert into finance_transactions
          (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, split_group_id, reference_month, party_id)
        values
          (v_imp.account_id, nullif(r->>'category_id','')::uuid, v_cc, v_type, abs(coalesce((r->>'amount')::numeric,0)), v_imp.transaction_date, v_desc, 'PAGO', v_method, case when v_first is null then v_imp.id else null end, v_group, v_ref, v_party)
        returning id into v_tx_id;
        if v_first is null then v_first := v_tx_id; end if;
      end loop;
      v_tx_id := v_first;

    else
      insert into finance_transactions
        (account_id, category_id, cost_center_id, type, amount, transaction_date, description, status, payment_method, imported_transaction_id, reference_month, party_id)
      values
        (v_imp.account_id, nullif(v_item->>'category_id','')::uuid, v_cc, v_type, v_amount, v_imp.transaction_date, v_desc, 'PAGO', v_method, v_imp.id, v_ref, v_party)
      returning id into v_tx_id;
    end if;

    update finance_imported_transactions set reconciled = true, reconciled_transaction_id = v_tx_id where id = v_imp.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;

-- ----------------------------------------------------------------------------
-- 2. Funções exclusivas dos módulos de saúde.
-- ----------------------------------------------------------------------------
drop function if exists public.create_repasse(jsonb, jsonb, uuid[]);
drop function if exists public.create_repasse__interno(jsonb, jsonb, uuid[]);
drop function if exists public.pay_repasse(uuid, uuid, date);
drop function if exists public.pay_repasse__interno(uuid, uuid, date);
drop function if exists public.meus_repasses();
drop function if exists public.fa_append_eventos(uuid, jsonb);
drop function if exists public.fa_marcar_removido(uuid, text, uuid);
drop function if exists public.fa_ids_do_usuario() cascade;
drop function if exists public.fa_pode_excluir() cascade;
drop function if exists public.fa_bloqueia_edicao_finalizada() cascade;
drop function if exists public.fa_exige_permissao_de_exclusao() cascade;
drop function if exists public.fa_exige_responsavel() cascade;
drop function if exists public.fa_touch_updated_at() cascade;
drop function if exists public.apa_regras_touch_updated_at() cascade;

-- ----------------------------------------------------------------------------
-- 3. Tabelas de saúde (cascade leva junto FKs, triggers e políticas delas).
-- ----------------------------------------------------------------------------
drop table if exists
    public.aihs, public.apa_regras_medicamento, public.apas, public.atendimentos,
    public.cirurgias_programacao_fixa, public.consultas, public.escala_plantoes,
    public.fa_farmacos, public.fa_narrativas, public.fa_parametros,
    public.fichas_anestesicas, public.finance_doctor_settings, public.finance_glosas,
    public.finance_repasse_items, public.finance_repasses, public.folha_assinaturas,
    public.internacoes, public.leitos, public.leitos_setores, public.motivos_suspensao,
    public.pacientes, public.profissionais_agenda_bloqueios,
    public.profissionais_agenda_config, public.prontuario_evolucao,
    public.prontuario_exames, public.prontuario_receitas, public.sigtap,
    public.sigtap_procedimentos, public.surgeries, public.unidades
    cascade;

drop function if exists public.opera_escala();

-- ----------------------------------------------------------------------------
-- 4. Colunas médicas nas tabelas que ficam.
-- ----------------------------------------------------------------------------
alter table public.finance_transactions
    drop column if exists doctor_id,
    drop column if exists surgery_id,
    drop column if exists shift_id;
alter table public.finance_recurrences
    drop column if exists doctor_id;
alter table public.users
    drop column if exists crm,
    drop column if exists rqe,
    drop column if exists categoria_medica,
    drop column if exists especialidade,
    drop column if exists unidades_permitidas,
    drop column if exists modules_access,
    drop column if exists exibir_agenda_home;

-- Configurações que só a saúde usava.
delete from public.settings
 where id in ('medicas', 'orientacoes', 'regras_internacao', 'apa_exame_padrao')
    or id like 'escala%';

-- ----------------------------------------------------------------------------
-- 5. Catálogo de permissões = src/config/permissions.js
--    (gerado por: node scripts/gerar-catalogo-permissoes.mjs)
-- ----------------------------------------------------------------------------
delete from public.permissoes_catalogo;
insert into public.permissoes_catalogo (permissao, chave_acesso, pessoal) values
  ('Acessar Compromissos', 'Acessar Compromissos', false),
  ('Acessar Configurações', 'Acessar Configurações', false),
  ('Acessar Financeiro', 'Acessar Financeiro', false),
  ('Acessar Usuarios', 'Acessar Usuarios', false),
  ('Acesso Total (Admin)', 'Acesso Total (Admin)', false),
  ('Alterar Quadros Compromisso', 'Acessar Compromissos', false),
  ('Criar Bancos Compromisso', 'Acessar Compromissos', false),
  ('Criar Páginas Compromisso', 'Acessar Compromissos', false),
  ('Editar Bancos Compromisso', 'Acessar Compromissos', false),
  ('Editar Financeiro', 'Acessar Financeiro', false),
  ('Editar Páginas Compromisso', 'Acessar Compromissos', false),
  ('Excluir Bancos Compromisso', 'Acessar Compromissos', false),
  ('Excluir Páginas Compromisso', 'Acessar Compromissos', false),
  ('Excluir Quadros Compromisso', 'Acessar Compromissos', false),
  ('Gerenciar Permissões', 'Acessar Usuarios', false);
