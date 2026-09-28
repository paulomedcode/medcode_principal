


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."update_account_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Caso de inserção ou atualização para transação confirmada (PAGO)
    IF (TG_OP = 'INSERT' AND NEW.status = 'PAGO') THEN
        IF NEW.type = 'ENTRADA' THEN
            UPDATE finance_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
        ELSE
            UPDATE finance_accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Reverte o valor antigo (se estava PAGO)
        IF OLD.status = 'PAGO' THEN
            IF OLD.type = 'ENTRADA' THEN
                UPDATE finance_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
            ELSE
                UPDATE finance_accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
            END IF;
        END IF;
        -- Aplica o novo valor (se está PAGO)
        IF NEW.status = 'PAGO' THEN
            IF NEW.type = 'ENTRADA' THEN
                UPDATE finance_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
            ELSE
                UPDATE finance_accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
            END IF;
        END IF;
    ELSIF (TG_OP = 'DELETE' AND OLD.status = 'PAGO') THEN
        -- Reverte se foi deletado
        IF OLD.type = 'ENTRADA' THEN
            UPDATE finance_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
        ELSE
            UPDATE finance_accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_account_balance"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agenda_categorias" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "cor" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agenda_categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agenda_pessoal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "texto" "text" NOT NULL,
    "concluido" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "data_agendada" "date" DEFAULT CURRENT_DATE,
    "autor_id" "uuid",
    "categoria_id" "uuid",
    "alerta_minutos" integer,
    "anexo_url" "text",
    "hora_agendada" time without time zone
);


ALTER TABLE "public"."agenda_pessoal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aihs" (
    "id" "text" NOT NULL,
    "pacienteId" "uuid",
    "pacienteNome" "text",
    "cns" "text",
    "dataNascimento" "date",
    "sexo" "text",
    "nomeMae" "text",
    "telefone" "text",
    "endereco" "text",
    "codigoIbge" "text",
    "uf" "text",
    "cep" "text",
    "municipio" "text",
    "resultadosProvas" "text",
    "diagnosticoInicial" "text",
    "cid10" "text",
    "cid10Secundario" "text",
    "sinaisSintomas" "text",
    "justificativa" "text",
    "procedimento" "text",
    "codigoProcedimento" "text",
    "clinica" "text",
    "caraterInternacao" "text",
    "medico" "text",
    "crm" "text",
    "tipoDocumentoProfissional" "text",
    "numeroDocumento" "text",
    "dataSolicitacao" "date",
    "status" "text",
    "numeroAutorizacao" "text",
    "motivoDevolucao" "text",
    "autorizadoPor" "text",
    "autorizadorCpf" "text",
    "autorizadorCrm" "text",
    "autorizadorNome" "text",
    "dataAutorizacao" timestamp with time zone,
    "orgaoEmissor" "text",
    "pacienteCpf" "text",
    "unidade" "text",
    "dataEmissao" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."aihs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "pacienteId" "uuid",
    "nome" "text",
    "cpf" "text",
    "dataNasc" "date",
    "sexo" "text",
    "peso" "text",
    "altura" "text",
    "telefone" "text",
    "procedimento" "text",
    "profissional" "text",
    "dataProcedimento" "date",
    "carater" "text",
    "porte" "text",
    "posicao" "text",
    "comorbidadesList" "jsonb",
    "detalhes_comorbidades" "text",
    "alergias" "text",
    "medicamentos" "text",
    "cirurgias" "text",
    "anestesias_previas" "text",
    "tabagismo" "text",
    "etilismo" "text",
    "drogas" "text",
    "mets" "text",
    "pa" "text",
    "fc" "text",
    "spo2" "text",
    "fr" "text",
    "temp" "text",
    "acv" "text",
    "ar" "text",
    "abdome" "text",
    "va_abertura" "text",
    "va_dtm" "text",
    "va_dem" "text",
    "va_cervical" "text",
    "va_protese" "text",
    "va_cormack" "text",
    "va_dificil" "text",
    "va_obs" "text",
    "asa" "text",
    "asa_e" "text",
    "ex_hb" "text",
    "ex_ht" "text",
    "ex_plaq" "text",
    "ex_leuco" "text",
    "ex_inr" "text",
    "ex_ttpa" "text",
    "ex_glic" "text",
    "ex_hba1c" "text",
    "ex_ureia" "text",
    "ex_creat" "text",
    "ex_na" "text",
    "ex_k" "text",
    "ex_ecg" "text",
    "ex_rx" "text",
    "ex_outros" "text",
    "ex_obs" "text",
    "jejum_orientacao" "text",
    "profilaxia_asp" "text",
    "plan_tecnica" "text",
    "plan_via_aerea" "text",
    "plan_monitor" "text",
    "plan_acesso" "text",
    "plan_hemoderivados" "text",
    "plan_destino" "text",
    "plan_obs" "text",
    "mpa_ansio" "text",
    "mpa_nvpo" "text",
    "mpa_atb" "text",
    "mpa_outras" "text",
    "parecer_obs" "text",
    "dataAvaliacao" timestamp with time zone,
    "responsavel" "text",
    "hm" "text",
    "carga_tabagica" "text",
    "parou_fumo" "text",
    "negaAlergia" boolean,
    "negaMed" boolean,
    "mallampati" "text",
    "parecerFinal" "text",
    "anestesistaNome" "text",
    "anestesistaCRM" "text",
    "anestesistaRQE" "text",
    "anestesistaSexo" "text",
    "anestesistaId" "uuid",
    "dataRegistro" timestamp with time zone,
    "dataAtualizacao" timestamp with time zone,
    "ex_coagulo" "text",
    "ex_eco" "text",
    "ex_hepato" "text",
    "ex_outros_esp" "text",
    "unidade" "text",
    "createdAt" timestamp with time zone DEFAULT "now"(),
    "exames_url" "text",
    "acesso_venoso" "text",
    "coluna_dorso" "text",
    "ex_tgo" "text",
    "ex_tgp" "text",
    "jejum_completa" "text",
    "jejum_formula" "text",
    "jejum_leite" "text",
    "jejum_leve" "text",
    "jejum_liquidos" "text",
    "neuro_consciencia" "text",
    "neuro_deficit" "text",
    "parecer_aval_esp" "text",
    "parecer_aval_especialidade" "text",
    "parecer_aval_motivo" "text",
    "plan_hemo_ch" "text",
    "plan_hemo_outros" "text",
    "plan_hemo_pfc" "text",
    "plan_hemo_plaq" "text",
    "tabag_anos" "text",
    "tabag_cigarro" "text",
    "tabag_cigarros" "text",
    "ex_data_cardio" "text",
    "ex_data_imagem" "text",
    "ex_data_lab" "text",
    "plan_recusa_hemo" "text",
    "resp_nome" "text",
    "resp_cpf" "text",
    "resp_parentesco" "text",
    "deleted_at" timestamp with time zone,
    "pacienteInapto" boolean
);


ALTER TABLE "public"."apas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atendimentos" (
    "id" "text" NOT NULL,
    "pacienteId" "uuid",
    "nomePaciente" "text",
    "cpf" "text",
    "idadeInfo" "text",
    "queixaPrincipal" "text",
    "tipoAtendimento" "text",
    "unidade" "text",
    "status" "text",
    "classificacaoRisco" "text",
    "dataChegada" timestamp with time zone DEFAULT "now"(),
    "triagemRealizada" boolean,
    "medicoAtribuido" "text",
    "observacoes" "text",
    "classificacao_risco" "text",
    "medico" "text",
    "createdAt" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atendimentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cirurgias_programacao_fixa" (
    "id" "text" NOT NULL,
    "mes" "text" NOT NULL,
    "semana" integer NOT NULL,
    "sala" "text" NOT NULL,
    "dia" "text" NOT NULL,
    "periodo" "text",
    "time_start" "text",
    "time_end" "text",
    "especialidade" "text",
    "medico" "text",
    "procedimento" "text",
    "telefone" "text",
    "color" "text" DEFAULT 'blue'::"text",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."cirurgias_programacao_fixa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "paciente_id" "uuid",
    "paciente_nome" "text",
    "paciente_cpf" "text",
    "paciente_telefone" "text",
    "paciente_nascimento" "date",
    "medico" "text",
    "especialidade" "text",
    "tipo_atendimento" "text",
    "convenio" "text",
    "data_agendamento" "date",
    "horario" "text",
    "status" "text",
    "observacoes" "text",
    "confirmado" boolean,
    "link_anexo" "text",
    "unidade" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."consultas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escala_plantoes" (
    "assignment_id" "text" NOT NULL,
    "month_val" "text" NOT NULL,
    "doctor_name" "text" NOT NULL,
    "hospital_name" "text",
    "sector_name" "text",
    "date" "text",
    "financial_base" numeric(15,2) DEFAULT 0.00,
    "financial_extra" numeric(15,2) DEFAULT 0.00,
    "financial_obs" "text",
    "subtitle" "text",
    "appearance" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."escala_plantoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "bank_name" "text",
    "agency" "text",
    "account_number" "text",
    "initial_balance" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "current_balance" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."finance_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "parent_id" "uuid",
    "color" "text" DEFAULT '#cbd5e1'::"text",
    "icon" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "finance_categories_type_check" CHECK (("type" = ANY (ARRAY['ENTRADA'::"text", 'SAIDA'::"text"])))
);


ALTER TABLE "public"."finance_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_doctor_settings" (
    "doctor_id" "uuid" NOT NULL,
    "admin_fee_rate" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "bank_name" "text",
    "bank_agency" "text",
    "bank_account" "text",
    "pix_key" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."finance_doctor_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_glosas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "surgery_id" "uuid",
    "shift_id" "text",
    "convenio" "text" NOT NULL,
    "doctor_id" "uuid",
    "glosa_date" "date" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'PENDENTE'::"text" NOT NULL,
    "recovered_amount" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "deducted_from_repasse_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "finance_glosas_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "finance_glosas_status_check" CHECK (("status" = ANY (ARRAY['PENDENTE'::"text", 'PAGO_PARCIAL'::"text", 'GLOSADO'::"text"])))
);


ALTER TABLE "public"."finance_glosas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_imported_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "fitid" "text",
    "transaction_date" "date" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "description" "text",
    "memo" "text",
    "reconciled" boolean DEFAULT false NOT NULL,
    "reconciled_transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."finance_imported_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_repasse_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repasse_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "surgery_id" "uuid",
    "shift_id" "text",
    "description" "text" NOT NULL,
    "gross_amount" numeric(15,2) NOT NULL,
    "admin_fee_rate" numeric(5,2) NOT NULL,
    "admin_fee_amount" numeric(15,2) NOT NULL,
    "net_amount" numeric(15,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "finance_repasse_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['SHIFT'::"text", 'SURGERY'::"text", 'OTHER'::"text"])))
);


ALTER TABLE "public"."finance_repasse_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_repasses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "reference_month" "text" NOT NULL,
    "gross_amount" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "admin_fee_amount" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "glosa_deduction" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "net_amount" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "status" "text" DEFAULT 'PENDENTE'::"text" NOT NULL,
    "payment_date" "date",
    "transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "finance_repasses_status_check" CHECK (("status" = ANY (ARRAY['PENDENTE'::"text", 'PAGO'::"text"])))
);


ALTER TABLE "public"."finance_repasses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_service_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "buyer_name" "text" NOT NULL,
    "sale_date" "date" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "status" "text" DEFAULT 'PENDENTE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "finance_service_sales_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "finance_service_sales_status_check" CHECK (("status" = ANY (ARRAY['PENDENTE'::"text", 'PAGO'::"text", 'CANCELADO'::"text"])))
);


ALTER TABLE "public"."finance_service_sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_price" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."finance_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "type" "text" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "transaction_date" "date" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDENTE'::"text" NOT NULL,
    "payment_method" "text",
    "doctor_id" "uuid",
    "surgery_id" "uuid",
    "shift_id" "text",
    "service_sale_id" "uuid",
    "imported_transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "finance_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "finance_transactions_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['PIX'::"text", 'BOLETO'::"text", 'TRANSFERENCIA'::"text", 'CARTAO'::"text", 'DINHEIRO'::"text", 'OUTRO'::"text"]))),
    CONSTRAINT "finance_transactions_status_check" CHECK (("status" = ANY (ARRAY['PENDENTE'::"text", 'PAGO'::"text"]))),
    CONSTRAINT "finance_transactions_type_check" CHECK (("type" = ANY (ARRAY['ENTRADA'::"text", 'SAIDA'::"text"])))
);


ALTER TABLE "public"."finance_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internacoes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "paciente_id" "uuid",
    "paciente_nome" "text",
    "leito_id" "uuid",
    "medico_responsavel" "text",
    "diagnostico" "text",
    "data_admissao" timestamp with time zone DEFAULT "now"(),
    "data_alta" timestamp with time zone,
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."internacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leitos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "setor_id" "uuid",
    "identificacao" "text",
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."leitos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leitos_setores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."leitos_setores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "action" "text",
    "details" "text",
    "user" "uuid",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "userName" "text",
    "userEmail" "text",
    "ip_address" "text"
);


ALTER TABLE "public"."logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."motivos_suspensao" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "descricao" "text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."motivos_suspensao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pacientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text",
    "cpf" "text",
    "cns" "text",
    "dataNascimento" "date",
    "sexo" "text",
    "nomeMae" "text",
    "telefone" "text",
    "rua" "text",
    "numero" "text",
    "bairro" "text",
    "municipio" "text",
    "uf" "text",
    "cep" "text",
    "createdAt" timestamp with time zone DEFAULT "now"(),
    "updatedAt" timestamp with time zone DEFAULT "now"(),
    "peso" "text",
    "altura" "text",
    "email" "text"
);


ALTER TABLE "public"."pacientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profissionais_agenda_bloqueios" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "medico" "text",
    "data_bloqueio" "date",
    "hora_inicio" "text",
    "hora_fim" "text",
    "motivo" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profissionais_agenda_bloqueios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profissionais_agenda_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "medico" "text",
    "especialidade" "text",
    "dia_semana" numeric,
    "hora_inicio" "text",
    "hora_fim" "text",
    "duracao_minutos" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profissionais_agenda_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prontuario_evolucao" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "paciente_id" "uuid",
    "paciente_nome" "text",
    "consulta_id" "uuid",
    "medico" "text",
    "texto" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prontuario_evolucao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prontuario_exames" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "paciente_id" "uuid",
    "paciente_nome" "text",
    "consulta_id" "uuid",
    "medico" "text",
    "texto" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prontuario_exames" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prontuario_receitas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "paciente_id" "uuid",
    "paciente_nome" "text",
    "consulta_id" "uuid",
    "medico" "text",
    "texto" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prontuario_receitas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "text" NOT NULL,
    "data" "jsonb",
    "createdAt" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sigtap" (
    "codigo" "text" NOT NULL,
    "nome" "text"
);


ALTER TABLE "public"."sigtap" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sigtap_procedimentos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "codigo" "text",
    "nome" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sigtap_procedimentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surgeries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "cns" "text",
    "nascimento" "date",
    "telefone1" "text",
    "telefone2" "text",
    "cirurgiao" "text",
    "especialidade" "text",
    "procedimento" "text",
    "anestesia" "text",
    "convenio" "text",
    "prioridade" "text",
    "sala" "text",
    "dataAtendimento" "date",
    "dataAutorizacao" "text",
    "dataAgendado" "text",
    "horario" "text",
    "aih" "text",
    "autorizada" "text",
    "apa" "text",
    "opme" "text",
    "status" "text",
    "observacoes" "text",
    "arquivourl" "text",
    "cpf" "text",
    "municipio" "text",
    "nomePaciente" "text",
    "paciente_confirmado" boolean,
    "motivo_suspensao_id" "uuid",
    "duracao" "text",
    "arquivos" "jsonb",
    "unidade" "text",
    "createdAt" timestamp with time zone DEFAULT "now"(),
    "arquivoUrl" "text"
);


ALTER TABLE "public"."surgeries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unidades" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text",
    "tipo" "text",
    "cnes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."unidades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "role" "text",
    "sexo" "text",
    "status" "text",
    "crm" "text",
    "rqe" "text",
    "cpf" "text",
    "unidades_permitidas" "jsonb",
    "createdAt" timestamp with time zone DEFAULT "now"(),
    "categoria_medica" "text" DEFAULT 'Normal'::"text",
    "modules_access" "jsonb",
    "exibir_agenda_home" boolean DEFAULT false,
    "telefone" "text",
    "categoria_agenda_id" "uuid",
    "especialidade" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agenda_categorias"
    ADD CONSTRAINT "agenda_categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agenda_pessoal"
    ADD CONSTRAINT "agenda_pessoal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aihs"
    ADD CONSTRAINT "aihs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apas"
    ADD CONSTRAINT "apas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atendimentos"
    ADD CONSTRAINT "atendimentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cirurgias_programacao_fixa"
    ADD CONSTRAINT "cirurgias_programacao_fixa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultas"
    ADD CONSTRAINT "consultas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escala_plantoes"
    ADD CONSTRAINT "escala_plantoes_pkey" PRIMARY KEY ("assignment_id");



ALTER TABLE ONLY "public"."finance_accounts"
    ADD CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_categories"
    ADD CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_doctor_settings"
    ADD CONSTRAINT "finance_doctor_settings_pkey" PRIMARY KEY ("doctor_id");



ALTER TABLE ONLY "public"."finance_glosas"
    ADD CONSTRAINT "finance_glosas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_imported_transactions"
    ADD CONSTRAINT "finance_imported_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_repasse_items"
    ADD CONSTRAINT "finance_repasse_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_repasses"
    ADD CONSTRAINT "finance_repasses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_service_sales"
    ADD CONSTRAINT "finance_service_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_services"
    ADD CONSTRAINT "finance_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internacoes"
    ADD CONSTRAINT "internacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leitos"
    ADD CONSTRAINT "leitos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leitos_setores"
    ADD CONSTRAINT "leitos_setores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."motivos_suspensao"
    ADD CONSTRAINT "motivos_suspensao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pacientes"
    ADD CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profissionais_agenda_bloqueios"
    ADD CONSTRAINT "profissionais_agenda_bloqueios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profissionais_agenda_config"
    ADD CONSTRAINT "profissionais_agenda_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prontuario_evolucao"
    ADD CONSTRAINT "prontuario_evolucao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prontuario_exames"
    ADD CONSTRAINT "prontuario_exames_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prontuario_receitas"
    ADD CONSTRAINT "prontuario_receitas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sigtap"
    ADD CONSTRAINT "sigtap_pkey" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."sigtap_procedimentos"
    ADD CONSTRAINT "sigtap_procedimentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surgeries"
    ADD CONSTRAINT "surgeries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_glosas_surgery" ON "public"."finance_glosas" USING "btree" ("surgery_id");



CREATE INDEX "idx_imported_trans_fitid" ON "public"."finance_imported_transactions" USING "btree" ("fitid");



CREATE INDEX "idx_repasse_items_repasse" ON "public"."finance_repasse_items" USING "btree" ("repasse_id");



CREATE INDEX "idx_repasses_doctor" ON "public"."finance_repasses" USING "btree" ("doctor_id");



CREATE INDEX "idx_transactions_account" ON "public"."finance_transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_category" ON "public"."finance_transactions" USING "btree" ("category_id");



CREATE INDEX "idx_transactions_date" ON "public"."finance_transactions" USING "btree" ("transaction_date");



CREATE INDEX "idx_transactions_doctor" ON "public"."finance_transactions" USING "btree" ("doctor_id");



CREATE OR REPLACE TRIGGER "trg_update_account_balance" AFTER INSERT OR DELETE OR UPDATE ON "public"."finance_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_account_balance"();



ALTER TABLE ONLY "public"."agenda_pessoal"
    ADD CONSTRAINT "agenda_pessoal_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."agenda_pessoal"
    ADD CONSTRAINT "agenda_pessoal_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."agenda_categorias"("id");



ALTER TABLE ONLY "public"."agenda_pessoal"
    ADD CONSTRAINT "agenda_pessoal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aihs"
    ADD CONSTRAINT "aihs_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."apas"
    ADD CONSTRAINT "apas_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."atendimentos"
    ADD CONSTRAINT "atendimentos_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."consultas"
    ADD CONSTRAINT "consultas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."finance_categories"
    ADD CONSTRAINT "finance_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."finance_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_doctor_settings"
    ADD CONSTRAINT "finance_doctor_settings_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_glosas"
    ADD CONSTRAINT "finance_glosas_deducted_from_repasse_id_fkey" FOREIGN KEY ("deducted_from_repasse_id") REFERENCES "public"."finance_repasses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_glosas"
    ADD CONSTRAINT "finance_glosas_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_glosas"
    ADD CONSTRAINT "finance_glosas_surgery_id_fkey" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_imported_transactions"
    ADD CONSTRAINT "finance_imported_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_imported_transactions"
    ADD CONSTRAINT "finance_imported_transactions_reconciled_transaction_id_fkey" FOREIGN KEY ("reconciled_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_repasse_items"
    ADD CONSTRAINT "finance_repasse_items_repasse_id_fkey" FOREIGN KEY ("repasse_id") REFERENCES "public"."finance_repasses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_repasse_items"
    ADD CONSTRAINT "finance_repasse_items_surgery_id_fkey" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_repasses"
    ADD CONSTRAINT "finance_repasses_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_repasses"
    ADD CONSTRAINT "finance_repasses_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_service_sales"
    ADD CONSTRAINT "finance_service_sales_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."finance_services"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_service_sale_id_fkey" FOREIGN KEY ("service_sale_id") REFERENCES "public"."finance_service_sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_surgery_id_fkey" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "fk_imported_trans" FOREIGN KEY ("imported_transaction_id") REFERENCES "public"."finance_imported_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internacoes"
    ADD CONSTRAINT "internacoes_leito_id_fkey" FOREIGN KEY ("leito_id") REFERENCES "public"."leitos"("id");



ALTER TABLE ONLY "public"."internacoes"
    ADD CONSTRAINT "internacoes_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."leitos"
    ADD CONSTRAINT "leitos_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."leitos_setores"("id");



ALTER TABLE ONLY "public"."prontuario_evolucao"
    ADD CONSTRAINT "prontuario_evolucao_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."prontuario_exames"
    ADD CONSTRAINT "prontuario_exames_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."prontuario_receitas"
    ADD CONSTRAINT "prontuario_receitas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_categoria_agenda_id_fkey" FOREIGN KEY ("categoria_agenda_id") REFERENCES "public"."agenda_categorias"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."update_account_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_account_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_account_balance"() TO "service_role";
























GRANT ALL ON TABLE "public"."agenda_categorias" TO "anon";
GRANT ALL ON TABLE "public"."agenda_categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_categorias" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_pessoal" TO "anon";
GRANT ALL ON TABLE "public"."agenda_pessoal" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_pessoal" TO "service_role";



GRANT ALL ON TABLE "public"."aihs" TO "anon";
GRANT ALL ON TABLE "public"."aihs" TO "authenticated";
GRANT ALL ON TABLE "public"."aihs" TO "service_role";



GRANT ALL ON TABLE "public"."apas" TO "anon";
GRANT ALL ON TABLE "public"."apas" TO "authenticated";
GRANT ALL ON TABLE "public"."apas" TO "service_role";



GRANT ALL ON TABLE "public"."atendimentos" TO "anon";
GRANT ALL ON TABLE "public"."atendimentos" TO "authenticated";
GRANT ALL ON TABLE "public"."atendimentos" TO "service_role";



GRANT ALL ON TABLE "public"."cirurgias_programacao_fixa" TO "anon";
GRANT ALL ON TABLE "public"."cirurgias_programacao_fixa" TO "authenticated";
GRANT ALL ON TABLE "public"."cirurgias_programacao_fixa" TO "service_role";



GRANT ALL ON TABLE "public"."consultas" TO "anon";
GRANT ALL ON TABLE "public"."consultas" TO "authenticated";
GRANT ALL ON TABLE "public"."consultas" TO "service_role";



GRANT ALL ON TABLE "public"."escala_plantoes" TO "anon";
GRANT ALL ON TABLE "public"."escala_plantoes" TO "authenticated";
GRANT ALL ON TABLE "public"."escala_plantoes" TO "service_role";



GRANT ALL ON TABLE "public"."finance_accounts" TO "anon";
GRANT ALL ON TABLE "public"."finance_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."finance_categories" TO "anon";
GRANT ALL ON TABLE "public"."finance_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_categories" TO "service_role";



GRANT ALL ON TABLE "public"."finance_doctor_settings" TO "anon";
GRANT ALL ON TABLE "public"."finance_doctor_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_doctor_settings" TO "service_role";



GRANT ALL ON TABLE "public"."finance_glosas" TO "anon";
GRANT ALL ON TABLE "public"."finance_glosas" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_glosas" TO "service_role";



GRANT ALL ON TABLE "public"."finance_imported_transactions" TO "anon";
GRANT ALL ON TABLE "public"."finance_imported_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_imported_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."finance_repasse_items" TO "anon";
GRANT ALL ON TABLE "public"."finance_repasse_items" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_repasse_items" TO "service_role";



GRANT ALL ON TABLE "public"."finance_repasses" TO "anon";
GRANT ALL ON TABLE "public"."finance_repasses" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_repasses" TO "service_role";



GRANT ALL ON TABLE "public"."finance_service_sales" TO "anon";
GRANT ALL ON TABLE "public"."finance_service_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_service_sales" TO "service_role";



GRANT ALL ON TABLE "public"."finance_services" TO "anon";
GRANT ALL ON TABLE "public"."finance_services" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_services" TO "service_role";



GRANT ALL ON TABLE "public"."finance_transactions" TO "anon";
GRANT ALL ON TABLE "public"."finance_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."internacoes" TO "anon";
GRANT ALL ON TABLE "public"."internacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."internacoes" TO "service_role";



GRANT ALL ON TABLE "public"."leitos" TO "anon";
GRANT ALL ON TABLE "public"."leitos" TO "authenticated";
GRANT ALL ON TABLE "public"."leitos" TO "service_role";



GRANT ALL ON TABLE "public"."leitos_setores" TO "anon";
GRANT ALL ON TABLE "public"."leitos_setores" TO "authenticated";
GRANT ALL ON TABLE "public"."leitos_setores" TO "service_role";



GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";



GRANT ALL ON TABLE "public"."motivos_suspensao" TO "anon";
GRANT ALL ON TABLE "public"."motivos_suspensao" TO "authenticated";
GRANT ALL ON TABLE "public"."motivos_suspensao" TO "service_role";



GRANT ALL ON TABLE "public"."pacientes" TO "anon";
GRANT ALL ON TABLE "public"."pacientes" TO "authenticated";
GRANT ALL ON TABLE "public"."pacientes" TO "service_role";



GRANT ALL ON TABLE "public"."profissionais_agenda_bloqueios" TO "anon";
GRANT ALL ON TABLE "public"."profissionais_agenda_bloqueios" TO "authenticated";
GRANT ALL ON TABLE "public"."profissionais_agenda_bloqueios" TO "service_role";



GRANT ALL ON TABLE "public"."profissionais_agenda_config" TO "anon";
GRANT ALL ON TABLE "public"."profissionais_agenda_config" TO "authenticated";
GRANT ALL ON TABLE "public"."profissionais_agenda_config" TO "service_role";



GRANT ALL ON TABLE "public"."prontuario_evolucao" TO "anon";
GRANT ALL ON TABLE "public"."prontuario_evolucao" TO "authenticated";
GRANT ALL ON TABLE "public"."prontuario_evolucao" TO "service_role";



GRANT ALL ON TABLE "public"."prontuario_exames" TO "anon";
GRANT ALL ON TABLE "public"."prontuario_exames" TO "authenticated";
GRANT ALL ON TABLE "public"."prontuario_exames" TO "service_role";



GRANT ALL ON TABLE "public"."prontuario_receitas" TO "anon";
GRANT ALL ON TABLE "public"."prontuario_receitas" TO "authenticated";
GRANT ALL ON TABLE "public"."prontuario_receitas" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."sigtap" TO "anon";
GRANT ALL ON TABLE "public"."sigtap" TO "authenticated";
GRANT ALL ON TABLE "public"."sigtap" TO "service_role";



GRANT ALL ON TABLE "public"."sigtap_procedimentos" TO "anon";
GRANT ALL ON TABLE "public"."sigtap_procedimentos" TO "authenticated";
GRANT ALL ON TABLE "public"."sigtap_procedimentos" TO "service_role";



GRANT ALL ON TABLE "public"."surgeries" TO "anon";
GRANT ALL ON TABLE "public"."surgeries" TO "authenticated";
GRANT ALL ON TABLE "public"."surgeries" TO "service_role";



GRANT ALL ON TABLE "public"."unidades" TO "anon";
GRANT ALL ON TABLE "public"."unidades" TO "authenticated";
GRANT ALL ON TABLE "public"."unidades" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


  create policy "Leitura Publica Exames"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'exames'::text));



  create policy "LiberarTudo 1peuqw_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'logos'::text));



  create policy "LiberarTudo 1peuqw_1"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'logos'::text));



  create policy "LiberarTudo 1peuqw_2"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'logos'::text));



  create policy "LiberarTudo 1peuqw_3"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'logos'::text));



  create policy "Permitir deletar de anexos_agenda"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'anexos_agenda'::text));



  create policy "Permitir leitura de anexos_agenda"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'anexos_agenda'::text));



  create policy "Permitir upload para anexos_agenda"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'anexos_agenda'::text));



  create policy "Upload Autenticado Exames"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'exames'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "anexosagenda 1bnpqx0_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'anexos'::text));



  create policy "anexosagenda 1bnpqx0_1"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'anexos'::text));



  create policy "anexosagenda 1bnpqx0_2"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'anexos'::text));



  create policy "anexosagenda 1bnpqx0_3"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'anexos'::text));



