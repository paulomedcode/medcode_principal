-- ============================================================================
-- Quadro de entregas dos projetos: colunas por ANDAMENTO, não por fase.
--
-- Os quadros nasciam agrupados pela Fase do serviço (Briefing, Copy, Design…),
-- que muda de serviço para serviço. Agora as colunas são as mesmas em todo
-- projeto — A fazer → Fazendo → Em revisão → Concluído —, o jeito do Vendas e
-- da Prospecção; a fase vira etiqueta no cartão. Quadros novos já nascem
-- assim (criarPaginaDeEntregas em src/services/crm.js); aqui os existentes.
--
-- Só mexe nos databases ligados a um projeto (projetos.workspace_page_id).
-- ============================================================================

-- 1. "Em revisão" no Status, antes do "Concluído" (se ainda não existir).
update public.workspace_db_properties pr
   set options = (
       select jsonb_agg(o order by ord)
         from (
             select o, (case when o->>'name' ilike 'conclu%' then 1000 else n end)::numeric as ord
               from jsonb_array_elements(pr.options) with ordinality as e(o, n)
             union all
             select jsonb_build_object('id', gen_random_uuid()::text, 'name', 'Em revisão', 'color', 'purple'), 999::numeric
         ) x
   )
 where pr.type = 'status' and pr.name = 'Status'
   and pr.database_id in (select workspace_page_id from public.projetos where workspace_page_id is not null)
   and not exists (select 1 from jsonb_array_elements(pr.options) o where o->>'name' = 'Em revisão');

-- 2. Visão "Quadro" agrupada pelo Status.
update public.workspace_db_views v
   set config = coalesce(v.config, '{}'::jsonb) || jsonb_build_object('groupBy', pr.id::text)
  from public.workspace_db_properties pr
 where v.type = 'board'
   and pr.database_id = v.database_id and pr.type = 'status' and pr.name = 'Status'
   and v.database_id in (select workspace_page_id from public.projetos where workspace_page_id is not null);
