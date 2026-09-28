-- Compromissos de vários dias: data final opcional.
-- NULL (ou igual a data_agendada) = evento de 1 dia (comportamento atual preservado).
-- data_fim > data_agendada = evento que se estende de data_agendada até data_fim.
alter table public.agenda_pessoal
  add column if not exists data_fim date;
