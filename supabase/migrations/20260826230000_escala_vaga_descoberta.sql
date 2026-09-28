-- Vaga descoberta deixa de ser um "médico" e vira estado do plantão.
--
-- Antes, para sinalizar um turno sem plantonista, escalava-se um cadastro
-- chamado "Dr. Descoberto!!!" — uma pessoa representando a ausência de uma
-- pessoa. Isso fazia o placeholder entrar na folha de ponto, na lista de
-- contatos dos PDFs e, com a regra de duplicidade, impedia marcar dois locais
-- descobertos no mesmo horário.
--
-- Agora: doctor_name vazio + appearance.uncovered = true.
--
-- O app já lê os registros antigos como vaga descoberta (compat em
-- src/utils/escalaDescoberto.js), então esta migration é uma limpeza: deixa o
-- banco no formato novo em vez de depender da conversão em memória.

UPDATE "public"."escala_plantoes"
SET
    doctor_name = '',
    appearance = COALESCE("appearance", '{}'::jsonb)
        || '{"uncovered": true, "color": "red"}'::jsonb
WHERE doctor_name ~* 'descobert|sem[[:space:]]*cobertura|vaga[[:space:]]*aberta';

-- Confere o que sobrou (deve ser 0):
-- SELECT count(*) FROM escala_plantoes WHERE doctor_name ~* 'descobert';
