-- Converte os flags de cirurgia (aih, autorizada, apa, opme) de TEXT para BOOLEAN.
--
-- Causa do bug: sendo TEXT, o valor booleano `false` enviado pelo front-end era
-- gravado como a string "false". No JavaScript, "false" (texto não vazio) é
-- "truthy", então os botões voltavam a aparecer MARCADOS ao recarregar e não havia
-- como desmarcar. Todos os caminhos de escrita (cadastro de nova cirurgia, edição
-- da fila e importação de planilha) já enviam booleano de verdade — apenas o tipo
-- da coluna estava errado.
--
-- O USING é tolerante a qualquer valor textual legado: true/1/sim/x/... -> true,
-- vazio/NULL -> NULL, e qualquer outra coisa (inclusive "false") -> false.

ALTER TABLE public.surgeries
    ALTER COLUMN aih        TYPE boolean USING (CASE WHEN lower(btrim(coalesce(aih,'')))        IN ('true','t','1','sim','s','x','verdadeiro','autorizada') THEN true WHEN btrim(coalesce(aih,''))        = '' THEN NULL ELSE false END),
    ALTER COLUMN autorizada TYPE boolean USING (CASE WHEN lower(btrim(coalesce(autorizada,''))) IN ('true','t','1','sim','s','x','verdadeiro','autorizada') THEN true WHEN btrim(coalesce(autorizada,'')) = '' THEN NULL ELSE false END),
    ALTER COLUMN apa        TYPE boolean USING (CASE WHEN lower(btrim(coalesce(apa,'')))        IN ('true','t','1','sim','s','x','verdadeiro','autorizada') THEN true WHEN btrim(coalesce(apa,''))        = '' THEN NULL ELSE false END),
    ALTER COLUMN opme       TYPE boolean USING (CASE WHEN lower(btrim(coalesce(opme,'')))       IN ('true','t','1','sim','s','x','verdadeiro','autorizada') THEN true WHEN btrim(coalesce(opme,''))       = '' THEN NULL ELSE false END);
