-- Hora (opcional) do próximo passo combinado no histórico de Vendas/Clientes/
-- Projetos. Com ela, "Reunião às 14h" aparece na hora certa na agenda do Início.
alter table public.crm_atividades
    add column if not exists proximo_passo_hora time;
