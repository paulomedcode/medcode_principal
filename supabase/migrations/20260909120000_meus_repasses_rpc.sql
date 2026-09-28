-- ============================================================================
-- Meus Repasses — a folha assinada e o pagamento dela, do ponto de vista do
-- médico.
--
-- O problema: depois de assinar, o médico perdia a folha de vista. A pendência
-- some do card da tela inicial no instante em que o status deixa de ser
-- 'pendente', e o único lugar que abre uma folha assinada é o modal Folha de
-- Ponto, dentro da Escala, atrás da permissão 'Operacional Escala' — que
-- plantonista não tem, e não deve ter.
--
-- Por que uma FUNÇÃO e não uma consulta direta da tela: o dado que interessa
-- ao médico (quanto, quando vence, se já pagou) mora em finance_transactions,
-- a mesma tabela que guarda o caixa inteiro da empresa. Filtrar no client
-- resolveria a tela e não resolveria o risco: com RLS desligado, qualquer
-- pessoa autenticada pode pedir a tabela toda pela API. Aqui o filtro é do
-- servidor — a função é SECURITY DEFINER, decide sozinha de quem é a sessão e
-- devolve APENAS as folhas daquele médico, com um punhado de colunas. Conta
-- bancária, categoria, centro de custo e todo o resto do financeiro não saem.
--
-- A identidade vem do E-MAIL do JWT, não de auth.uid(): neste sistema o perfil
-- é resolvido por e-mail (AuthContext faz users.eq('email', ...)), e o id do
-- cadastro não é o id do usuário de autenticação. Comparar auth.uid() com
-- users.id aqui deixaria todo mundo de fora.
-- ============================================================================

DROP FUNCTION IF EXISTS "public"."meus_repasses"();

CREATE FUNCTION "public"."meus_repasses"()
RETURNS TABLE (
    "folha_id"          "uuid",
    "hospital_name"     text,
    "month_val"         text,
    "assignment_ids"    text[],
    "content_hash"      text,
    "signature_image"   text,
    "signed_at"         timestamp with time zone,
    "ip_address"        text,
    "doctor_name"       text,
    "valor"             numeric,
    "pagamento"         text,
    "due_date"          "date",
    "paid_amount"       numeric,
    "pago_em"           "date"
)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    WITH eu AS (
        SELECT "id", "name"
        FROM "public"."users"
        WHERE lower("email") = lower("auth"."jwt"() ->> 'email')
        LIMIT 1
    )
    SELECT
        f."id",
        f."hospital_name",
        f."month_val",
        f."assignment_ids",
        f."content_hash",
        f."signature_image",
        f."signed_at",
        f."ip_address",
        f."doctor_name",
        t."amount",
        -- Folha assinada que ainda não virou conta a pagar não é "pendente de
        -- pagamento": ela ainda nem chegou ao financeiro. Estados diferentes,
        -- nomes diferentes — senão o médico cobra o que ninguém ainda recebeu
        -- para pagar.
        CASE WHEN t."id" IS NULL THEN 'EM_PROCESSAMENTO' ELSE t."status" END,
        t."due_date",
        t."paid_amount",
        (SELECT max(p."payment_date")
           FROM "public"."finance_transaction_payments" p
          WHERE p."transaction_id" = t."id")
    FROM "public"."folha_assinaturas" f
    CROSS JOIN eu
    LEFT JOIN "public"."finance_transactions" t ON t."id" = f."transaction_id"
    -- Casa por id do cadastro OU por nome, como o resto do fluxo da folha: o
    -- envio grava os dois, e o nome vem da escala, que pode divergir do
    -- cadastro (acento, abreviação, "Dr."). Só pelo id, folha antiga sem
    -- doctor_id sumiria; só pelo nome, uma grafia diferente esconderia a folha
    -- sem erro nenhum.
    WHERE f."status" = 'assinado'
      AND (f."doctor_id" = eu."id" OR lower(f."doctor_name") = lower(eu."name"))
    ORDER BY f."month_val" DESC, f."hospital_name";
$$;

-- Sem sessão não há e-mail no JWT e a função devolveria vazio de qualquer
-- forma; ainda assim, uma função SECURITY DEFINER não fica aberta ao anônimo.
REVOKE ALL ON FUNCTION "public"."meus_repasses"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."meus_repasses"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."meus_repasses"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."meus_repasses"() TO "service_role";

COMMENT ON FUNCTION "public"."meus_repasses"() IS 'Folhas de ponto assinadas do médico logado (resolvido pelo e-mail do JWT) com o status de pagamento do lançamento vinculado. SECURITY DEFINER de propósito: é o que garante que a tela do médico enxergue só as linhas dele, sem abrir finance_transactions.';
