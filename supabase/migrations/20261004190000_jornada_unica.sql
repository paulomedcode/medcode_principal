-- ============================================================================
-- Uma jornada só: Prospecção → Vendas → Projetos.
--
-- Antes, "lead" existia em três lugares (lista da Prospecção, tipo LEAD em
-- Clientes e as etapas "Novo lead"/"Qualificação" do funil) e a Prospecção
-- repetia Proposta/Fechado/Em produção, que são do Vendas e dos Projetos.
--
-- Agora:
--   Prospecção  A abordar → Abordado → Sem resposta → Respondeu (ou Descartado)
--               e, ao virar oportunidade, CONVERTIDO (daí em diante quem conta
--               a história é o Vendas; a tela só mostra onde ele está).
--   Vendas      começa em Reunião.
-- ============================================================================

-- 1. Status da prospecção --------------------------------------------------
alter table public.prospeccao_leads drop constraint if exists prospeccao_leads_status_check;
update public.prospeccao_leads
   set status = case when party_id is not null then 'CONVERTIDO' else 'RESPONDEU' end
 where status in ('INTERESSADO', 'PROPOSTA', 'FECHADO', 'PRODUCAO');
alter table public.prospeccao_leads add constraint prospeccao_leads_status_check
    check (status in ('NOVO', 'CONTATADO', 'SEM_RESPOSTA', 'RESPONDEU', 'DESCARTADO', 'CONVERTIDO'));

-- O lead não anda mais sozinho pelos status do Vendas: depois de convertido,
-- a tela lê a etapa da oportunidade direto.
drop trigger if exists prospeccao_por_oportunidade on public.crm_oportunidades;
drop trigger if exists prospeccao_por_proposta on public.finance_quotes;
drop trigger if exists prospeccao_por_projeto on public.projetos;
drop function if exists public.prospeccao_por_oportunidade();
drop function if exists public.prospeccao_por_proposta();
drop function if exists public.prospeccao_por_projeto();
drop function if exists public.prospeccao_avancar(uuid, text, text);
drop function if exists public.prospeccao_ordem(text);

-- 2. Virar oportunidade — tudo ou nada --------------------------------------
--    • cria a empresa (tipo LEAD = "em negociação") se o lead ainda não tem;
--    • cria a oportunidade no funil;
--    • leva o histórico da prospecção para a linha do tempo do cliente;
--    • marca o lead como CONVERTIDO.
-- p_op: { titulo, servicos[], valor, valor_recorrente, etapa_id,
--         responsavel_id, previsao_fechamento, notas }
create or replace function public.prospeccao_virar_oportunidade(p_lead uuid, p_op jsonb)
returns public.crm_oportunidades language plpgsql security definer set search_path to 'public' as $$
declare
    v_lead   prospeccao_leads;
    v_party  uuid;
    v_op     crm_oportunidades;
    v_eu     uuid := (select id from public.meu_cadastro());
    v_notas  text;
begin
    if not public.tem_permissao('Editar Vendas') then
        raise exception 'Sem permissão para criar oportunidade.' using errcode = '42501';
    end if;

    select * into v_lead from prospeccao_leads where id = p_lead for update;
    if not found then raise exception 'Lead não encontrado.'; end if;

    v_party := v_lead.party_id;
    if v_party is null then
        insert into finance_parties (name, kind, tipo_pessoa, telefone, email, site, instagram, segmento, origem,
                                     cidade, uf, responsavel_id, notes)
        values (v_lead.nome, 'LEAD', 'PJ', v_lead.telefone, v_lead.email, v_lead.site, v_lead.instagram,
                v_lead.categoria, coalesce(v_lead.origem, 'Prospecção'), v_lead.cidade, v_lead.uf,
                coalesce(v_lead.responsavel_id, v_eu),
                nullif(concat_ws(E'\n', v_lead.notas,
                    case when v_lead.maps_url is not null then 'Google Maps: ' || v_lead.maps_url end,
                    case when v_lead.endereco is not null then 'Endereço: ' || v_lead.endereco end), ''))
        returning id into v_party;
    end if;

    insert into crm_oportunidades (titulo, party_id, servicos, valor, valor_recorrente, etapa_id, responsavel_id,
                                   origem, previsao_fechamento, notas)
    values (
        coalesce(nullif(trim(p_op->>'titulo'), ''), v_lead.nome),
        v_party,
        coalesce((select array_agg(s) from jsonb_array_elements_text(p_op->'servicos') s), array['SITE']),
        coalesce(nullif(p_op->>'valor', '')::numeric, 0),
        coalesce(nullif(p_op->>'valor_recorrente', '')::numeric, 0),
        coalesce(nullif(p_op->>'etapa_id', '')::uuid,
                 (select id from crm_etapas where tipo = 'ABERTA' order by ordem limit 1)),
        coalesce(nullif(p_op->>'responsavel_id', '')::uuid, v_lead.responsavel_id, v_eu),
        coalesce(v_lead.origem, 'Prospecção'),
        nullif(p_op->>'previsao_fechamento', '')::date,
        nullif(p_op->>'notas', '')
    ) returning * into v_op;

    select string_agg('• ' || to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ': ' || texto, E'\n' order by created_at)
      into v_notas from prospeccao_eventos where lead_id = p_lead and tipo = 'NOTA';

    insert into crm_atividades (party_id, oportunidade_id, tipo, titulo, descricao, autor_id)
    values (v_party, v_op.id, 'SISTEMA', 'Veio da Prospecção',
            concat_ws(E'\n',
                v_lead.tentativas || ' tentativa(s) de contato até responder',
                case when v_lead.origem is not null then 'Origem: ' || v_lead.origem end,
                v_notas),
            v_eu);

    update prospeccao_leads set status = 'CONVERTIDO', party_id = v_party where id = p_lead;
    insert into prospeccao_eventos (lead_id, tipo, texto, autor_id)
    values (p_lead, 'SISTEMA', 'Virou oportunidade no Vendas: “' || v_op.titulo || '”', v_eu);

    return v_op;
end $$;
revoke all on function public.prospeccao_virar_oportunidade(uuid, jsonb) from public, anon;
grant execute on function public.prospeccao_virar_oportunidade(uuid, jsonb) to authenticated, service_role;

-- 3. Funil começa em Reunião ------------------------------------------------
--    O que estiver em "Novo lead"/"Qualificação" vai para a primeira etapa que
--    sobra; depois as duas somem e a ordem é refeita.
do $$
declare v_destino uuid;
begin
    select id into v_destino from crm_etapas
     where tipo = 'ABERTA' and nome not in ('Novo lead', 'Qualificação') order by ordem limit 1;
    if v_destino is null then return; end if;
    update crm_oportunidades set etapa_id = v_destino
     where etapa_id in (select id from crm_etapas where nome in ('Novo lead', 'Qualificação'));
    delete from crm_etapas where nome in ('Novo lead', 'Qualificação');
    update crm_etapas e set ordem = o.n
      from (select id, row_number() over (order by ordem) n from crm_etapas) o where o.id = e.id;
end $$;
