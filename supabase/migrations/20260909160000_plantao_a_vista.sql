-- ============================================================================
-- Plantão pago à vista.
--
-- Acontece na prática: o médico faz o plantão e recebe aquele dia na hora, em
-- vez de esperar o fechamento do mês. O plantão TEM que sair na folha (ele
-- trabalhou, e a folha é o documento do que foi feito), mas não pode ser pago
-- de novo no repasse do mês — senão a folha de 16 mil vira 18 mil pagos.
--
-- Onde mora a verdade: o dinheiro é do financeiro (um lançamento próprio, com
-- baixa na data em que saiu), e a linha do plantão guarda o carimbo — data,
-- valor e o id do lançamento. As duas coisas são necessárias:
--
--  - o LANÇAMENTO, porque é dinheiro saindo da conta e precisa aparecer no
--    extrato, no DRE e na conciliação, na data certa;
--  - o CARIMBO na escala, porque a folha de ponto e a tela do médico precisam
--    dizer "este dia já foi pago em 12/08" — e o médico não pode ler
--    finance_transactions (é a tabela do caixa da empresa inteira).
--
-- O índice único é a trava contra pagar o mesmo plantão duas vezes: um clique
-- duplo, duas abas ou um reenvio de rede não criam a segunda saída. Mesmo
-- desenho da trava da folha (chave determinística em shift_id + índice único
-- parcial), pelo mesmo motivo: checar antes no navegador não resolve corrida.
-- ============================================================================

ALTER TABLE "public"."escala_plantoes"
    ADD COLUMN IF NOT EXISTS "paid_cash_at"     "date",
    ADD COLUMN IF NOT EXISTS "paid_cash_amount" numeric(15,2),
    ADD COLUMN IF NOT EXISTS "paid_cash_tx"     "uuid";

DO $$ BEGIN
    ALTER TABLE "public"."escala_plantoes"
        ADD CONSTRAINT "escala_plantoes_paid_cash_tx_fkey"
        FOREIGN KEY ("paid_cash_tx") REFERENCES "public"."finance_transactions"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Uma saída à vista por plantão. Chave: 'avista:<assignment_id>'.
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_avista_unica_idx"
    ON "public"."finance_transactions" ("shift_id")
    WHERE "shift_id" LIKE 'avista:%';

COMMENT ON COLUMN "public"."escala_plantoes"."paid_cash_at" IS 'Data em que este plantão foi pago à vista. Preenchida junto com a baixa do lançamento correspondente.';
COMMENT ON COLUMN "public"."escala_plantoes"."paid_cash_tx" IS 'Lançamento (SAIDA) do pagamento à vista deste plantão. ON DELETE SET NULL: apagar o lançamento no financeiro solta o carimbo, e o plantão volta a entrar inteiro no repasse do mês.';
COMMENT ON INDEX "public"."finance_transactions_avista_unica_idx" IS 'Impede duas saídas à vista para o mesmo plantão (chave avista:<assignment_id> em shift_id).';
