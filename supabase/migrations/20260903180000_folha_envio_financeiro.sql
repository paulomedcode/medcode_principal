-- ============================================================================
-- Folha de ponto assinada -> conta a pagar no Financeiro.
--
-- Fecha o ciclo do dinheiro do plantão: a Escala calcula quanto o médico tem a
-- receber (folha de ponto), o médico assina, e daí a folha é ENVIADA para o
-- financeiro como conta a pagar (finance_transactions, type='SAIDA'). Dali em
-- diante o dinheiro é assunto do financeiro: status, valor pago e saldo saem de
-- lá (RPC settle_transaction + trigger sync_auto_payment), nunca da Escala.
--
-- Duas coisas entram aqui:
--
-- 1) O vínculo, no lado da Escala: qual lançamento nasceu de qual folha.
--
-- 2) A TRAVA ANTI-DUPLICIDADE, no lado do financeiro. Esta é a parte que
--    realmente importa: é dinheiro, e clicar "Enviar" duas vezes (duplo clique,
--    duas abas, reenvio depois de um erro de rede) não pode gerar duas contas a
--    pagar para o mesmo médico. Checar antes no client não resolve corrida —
--    duas requisições simultâneas passam as duas pela checagem. Um índice único
--    no banco resolve: a segunda inserção falha, e o código trata a falha como
--    "já existe, religa" em vez de erro.
--
--    A chave é determinística: 'folha:<mês>:<hospital>:<médico>', gravada em
--    finance_transactions.shift_id — coluna que já existia na baseline e estava
--    sem uso nenhum (0 de 106 lançamentos preenchidos na criação deste índice).
--    O índice é PARCIAL ('folha:%') para não atrapalhar quem um dia quiser usar
--    shift_id para amarrar lançamento a plantão individual.
--
-- O que NÃO está aqui, de propósito: nada apaga nem altera lançamento
-- automaticamente. Cancelar a assinatura de uma folha já enviada só emite
-- alerta — corrigir valor no financeiro é decisão humana.
-- ============================================================================

ALTER TABLE "public"."folha_assinaturas"
    ADD COLUMN IF NOT EXISTS "transaction_id"      "uuid",
    ADD COLUMN IF NOT EXISTS "sent_to_finance_at"  timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "sent_by"             "uuid";

DO $$ BEGIN
    ALTER TABLE "public"."folha_assinaturas"
        ADD CONSTRAINT "folha_assinaturas_transaction_fkey"
        FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."folha_assinaturas"
        ADD CONSTRAINT "folha_assinaturas_sent_by_fkey"
        FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A trava. Uma conta a pagar por folha (médico + hospital + competência).
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_folha_unica_idx"
    ON "public"."finance_transactions" ("shift_id")
    WHERE "shift_id" LIKE 'folha:%';

COMMENT ON COLUMN "public"."folha_assinaturas"."transaction_id" IS 'Conta a pagar gerada no financeiro a partir desta folha. ON DELETE SET NULL: apagar o lançamento não apaga o histórico da assinatura.';
COMMENT ON INDEX "public"."finance_transactions_folha_unica_idx" IS 'Impede duas contas a pagar para a mesma folha (chave folha:<mês>:<hospital>:<médico> em shift_id). É a garantia contra envio duplicado sob corrida.';
