-- ============================================================================
-- Cadência de acompanhamento da Prospecção.
--
-- Depois da abordagem (ou da proposta enviada), o lead entra numa sequência de
-- toques: 2, 5 e 10 dias depois. O dia do próximo toque continua em
-- proximo_contato_em, que é o que "Meu dia" e o filtro "Retornar hoje" já leem;
-- estas duas colunas dizem de onde a cadência conta e em que toque ela está.
--
--   cadencia_inicio  dia em que a abordagem foi enviada (base da contagem)
--   cadencia_etapa   0 = abordagem enviada, esperando o toque do dia 2
--                    1 = toque do dia 2 enviado, esperando o do dia 5
--                    2 = toque do dia 5 enviado, esperando o do dia 10
--                    null = sem cadência (não abordado, respondeu, encerrada)
--
-- Os dias e os textos de cada toque ficam em src/config/cadencia.js.
-- ============================================================================

alter table public.prospeccao_leads
    add column if not exists cadencia_inicio date,
    add column if not exists cadencia_etapa smallint check (cadencia_etapa between 0 and 2);

-- Quem já foi abordado e está esperando resposta entra na cadência a partir do
-- dia do último contato.
update public.prospeccao_leads
   set cadencia_inicio = (ultimo_contato_em at time zone 'America/Sao_Paulo')::date,
       cadencia_etapa = 0,
       proximo_contato_em = coalesce(proximo_contato_em, (ultimo_contato_em at time zone 'America/Sao_Paulo')::date + 2)
 where status = 'CONTATADO'
   and ultimo_contato_em is not null
   and cadencia_etapa is null;

-- Saiu de "esperando resposta" (respondeu, descartado, sem resposta, virou
-- oportunidade) por qualquer caminho: a cadência para sozinha, e a data de
-- retorno que ela tinha marcado sai junto.
create or replace function public.prospeccao_parar_cadencia()
returns trigger language plpgsql set search_path to 'public' as $$
begin
    if new.status is distinct from old.status
       and new.status in ('RESPONDEU', 'DESCARTADO', 'SEM_RESPOSTA', 'CONVERTIDO')
       and old.cadencia_etapa is not null and new.cadencia_etapa is not null then
        new.cadencia_etapa := null;
        new.proximo_contato_em := null;
    end if;
    return new;
end $$;
drop trigger if exists prospeccao_leads_parar_cadencia on public.prospeccao_leads;
create trigger prospeccao_leads_parar_cadencia before update of status on public.prospeccao_leads
    for each row execute function public.prospeccao_parar_cadencia();
