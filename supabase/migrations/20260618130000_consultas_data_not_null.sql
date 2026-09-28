-- Blindagem: toda consulta precisa ter data de agendamento.
-- Sem data, a consulta fica invisível na agenda (o filtro por semana ignora NULL),
-- foi exatamente o que causou o sumiço de consultas de uma unidade.
-- Garante no nível do banco que esse registro inválido nunca mais seja criado,
-- venha de onde vier (importação, formulário, API).

alter table "public"."consultas"
    alter column "data_agendamento" set not null;
