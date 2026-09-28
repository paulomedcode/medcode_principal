-- =============================================================================
-- Ficha Anestésica — modelos de descrição do ato anestésico
--
-- No protótipo de referência estes textos estavam escritos no JavaScript: mudar
-- "tubo nº 7" ou "L4–L5 com Quincke 27G" exigia alterar código. Aqui viram
-- cadastro, com placeholders {{campo}} preenchidos pelo que o médico informou
-- no rodapé da ficha.
-- =============================================================================

create table if not exists public.fa_narrativas (
    id          uuid primary key default gen_random_uuid(),
    codigo      text not null unique,
    titulo      text not null,
    origem      text not null check (origem in ('tecnica', 'procedimento')),
    chave       text,
    termos      text[] not null default '{}',
    texto       text not null,
    ordem       integer not null default 100,
    ativo       boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table  public.fa_narrativas is 'Modelos de descrição do ato anestésico, por técnica ou procedimento.';
comment on column public.fa_narrativas.origem is '"tecnica" casa com o plano anestésico; "procedimento" dispara quando o item do rodapé é marcado.';
comment on column public.fa_narrativas.chave  is 'Para origem=procedimento: chave do item no rodapé da ficha.';
comment on column public.fa_narrativas.termos is 'Para origem=tecnica: termos procurados no plano anestésico.';
comment on column public.fa_narrativas.texto  is 'Placeholders no formato {{campo}} são trocados pelos dados informados na ficha.';

create index if not exists idx_fa_narrativas_ativo on public.fa_narrativas (ativo, ordem);

drop trigger if exists trg_fa_narrativas_updated_at on public.fa_narrativas;
create trigger trg_fa_narrativas_updated_at
    before update on public.fa_narrativas
    for each row execute function public.fa_touch_updated_at();

insert into public.fa_narrativas (codigo, titulo, origem, chave, termos, texto, ordem) values
('geral_balanceada_agvi', 'Geral balanceada (AGVI)', 'tecnica', null, array['geral balanceada','agvi','balanceada'], 'Indução da anestesia geral por via intravenosa, com hipnose, analgesia e bloqueio neuromuscular conforme indicação e doses registradas na ficha anestésica. Após perda da consciência, olhos fechados e protegidos bilateralmente com micropore, sem compressão ocular. Realizada intubação orotraqueal com tubo número 7 com cuff, com confirmação por capnografia com curva. Paciente conectado à workstation de anestesia, em ventilação mecânica controlada, com parâmetros registrados no aparelho/ficha anestésica. Mantida anestesia geral balanceada e monitorização contínua, sem intercorrências imediatas.', 10),
('geral_venosa_total_agvt', 'Geral venosa total (AGVT)', 'tecnica', null, array['geral venosa','agvt','venosa total'], 'Realizada pré-oxigenação sob máscara facial com oxigênio a 100%. Indução da anestesia geral por via intravenosa, com hipnose, analgesia e bloqueio neuromuscular conforme indicação e doses registradas na ficha anestésica. Após perda da consciência, olhos fechados e protegidos bilateralmente com micropore, sem compressão ocular. Realizada intubação orotraqueal com tubo número 7 com cuff, com confirmação por capnografia com curva. Paciente conectado à workstation de anestesia, em ventilação mecânica controlada, com parâmetros registrados no aparelho/ficha anestésica. Mantida anestesia geral venosa total e monitorização contínua, sem intercorrências imediatas.', 20),
('sedacao', 'Sedação', 'tecnica', null, array['sedacao'], 'Realizada sedação por via intravenosa, com fármacos e doses registrados na ficha anestésica, mantendo acompanhamento clínico, ventilatório e hemodinâmico durante o procedimento. Sem intercorrências imediatas.', 30),
('raquianestesia', 'Raquianestesia', 'tecnica', null, array['raqui','raquianestesia','espinhal'], 'Paciente posicionado sentado, realizada assepsia e antissepsia da região lombar, com uso de luvas estéreis e colocação de campos estéreis. Realizada punção subaracnóidea em L4–L5, pela via mediana, com agulha Quincke 27G. Obtido refluxo de líquido cefalorraquidiano; administrados anestésico local e adjuvantes, se utilizados, conforme doses registradas na ficha. Sem intercorrências imediatas. Paciente mantido sob monitorização e encaminhado para o procedimento em condições clínicas estáveis.', 40),
('peridural', 'Peridural', 'tecnica', null, array['peridural','epidural'], 'Realizada assepsia e antissepsia da região, com uso de luvas estéreis, colocação de campos estéreis e infiltração de anestésico local. Punção do espaço peridural em {{nivel}}, pela via mediana, identificado pela técnica de Dogliotti com ar. Inserido cateter peridural até {{profundidade}}, sem intercorrências; administrada dose-teste, quando realizada, e posteriormente {{anestesico}}, nas doses registradas na ficha anestésica. Sem parestesias persistentes ou sinais de injeção intravascular/intratecal. Cateter fixado e paciente mantido sob monitorização contínua.', 50),
('extubacao', 'Extubação', 'procedimento', 'extubacao', '{}'::text[], 'Extubação realizada após avaliação de critérios clínicos. Paciente acordado, com ventilação espontânea adequada, oxigenação satisfatória, estabilidade hemodinâmica, reflexos protetores presentes e tosse eficaz. Secreções aspiradas quando necessário. Balonete desinsuflado e tubo orotraqueal retirado sem intercorrências.', 60),
('bloqueio_periferico', 'Bloqueio periférico', 'procedimento', 'bloqueioPeriferico', '{}'::text[], 'Realizadas assepsia e antissepsia da região, paramentação e colocação de campos estéreis. Realizado bloqueio {{bloqueio}}, lado {{lado}}, guiado por ultrassonografia, com visualização contínua da agulha e da dispersão do anestésico local. Administrado anestésico local conforme ficha anestésica. Sem intercorrências imediatas.', 70),
('acesso_venoso_central', 'Acesso venoso central', 'procedimento', 'acessoCentral', '{}'::text[], 'Realizado acesso venoso central em veia {{veia}}, lado {{lado}}, sob {{tecnica}}, pela técnica de Seldinger. Após assepsia/antissepsia, paramentação, uso de luvas estéreis e colocação de campos estéreis, realizada punção venosa com refluxo de sangue venoso. Passado fio-guia, dilatado o trajeto e introduzido cateter venoso central até {{profundidade}} cm. Retirado o fio-guia, com teste de permeabilidade e refluxo sanguíneo em todos os lúmens. Cateter fixado e realizado curativo estéril. Procedimento concluído sem intercorrências imediatas, sem punção arterial ou hematoma.', 80),
('pressao_arterial_invasiva_pai', 'Pressão arterial invasiva (PAI)', 'procedimento', 'pai', '{}'::text[], 'Paciente monitorizado com ECG, SpO₂ e pressão arterial não invasiva. Após assepsia/antissepsia, paramentação e uso de luvas estéreis, realizada punção da artéria {{arteria}} com cateter {{cateter}}, pela técnica de punção direta, com refluxo de sangue arterial e obtenção de curva pressórica adequada. Sistema conectado ao transdutor, previamente preenchido, purgado, zerado e nivelado ao eixo flebostático. Cateter fixado e realizado curativo estéril. Mantida perfusão distal preservada, sem hematoma, sangramento significativo ou outras intercorrências imediatas.', 90),
('venoclise', 'Venóclise', 'procedimento', 'venoclise', '{}'::text[], 'Venóclise realizada {{realizacao}}, em {{local}}, com cateter venoso periférico Abocath nº {{abocath}}, fixado e mantido pérvio, sem intercorrências imediatas.', 100)
on conflict (codigo) do nothing;
