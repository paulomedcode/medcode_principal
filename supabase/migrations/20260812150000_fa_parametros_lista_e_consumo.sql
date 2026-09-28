-- =============================================================================
-- Ficha Anestésica — parâmetros de lista (ECG) e consumo de infusões contínuas
--
-- A grade só aceitava número. O ritmo do ECG é escolha entre opções, não medida
-- numérica: sem isso a linha ficaria de fora da ficha.
--
-- As infusões contínuas também precisam registrar frascos abertos e diluição,
-- que é o que a farmácia confere e o que alimenta o custo.
-- =============================================================================

alter table public.fa_parametros drop constraint if exists fa_parametros_tipo_check;
alter table public.fa_parametros add constraint fa_parametros_tipo_check
    check (tipo in ('infusao', 'medida', 'fluido', 'lista'));

alter table public.fa_parametros add column if not exists opcoes text[] not null default '{}';
alter table public.fa_parametros add column if not exists apresentacao text;
alter table public.fa_parametros add column if not exists diluicao_padrao numeric;
alter table public.fa_parametros add column if not exists diluicao_unidade text;

comment on column public.fa_parametros.opcoes         is 'Para tipo=lista: valores possíveis (ex.: ritmos do ECG).';
comment on column public.fa_parametros.apresentacao   is 'Frasco ou ampola da infusão contínua, para o cálculo de consumo.';
comment on column public.fa_parametros.diluicao_padrao is 'Concentração habitual, sugerida ao registrar o consumo.';

-- ECG: a linha que faltava da monitorização ------------------------------------
insert into public.fa_parametros (codigo, rotulo, secao, tipo, unidade, valor_padrao, opcoes, ordem)
values (
    'ecg', 'ECG', 'monitorizacao', 'lista', 'ritmo', 'Sinusal',
    array['Sinusal', 'Taquicardia sinusal', 'Bradicardia sinusal', 'Fibrilação atrial',
          'Flutter atrial', 'Extrassístoles supraventriculares', 'Extrassístoles ventriculares',
          'Ritmo de marca-passo', 'BAV 1º grau', 'Outro'],
    35
)
on conflict (codigo) do nothing;

-- Apresentação e diluição habituais das infusões que se consomem por frasco ----
update public.fa_parametros set apresentacao = 'Frasco 20 ml (200 mg)', diluicao_padrao = 10, diluicao_unidade = 'mg/ml'
 where codigo = 'propofol' and apresentacao is null;
update public.fa_parametros set apresentacao = 'Frasco 2 mg', diluicao_padrao = 50, diluicao_unidade = 'mcg/ml'
 where codigo = 'remifentanil' and apresentacao is null;
update public.fa_parametros set apresentacao = 'Ampola 200 mcg', diluicao_padrao = 4, diluicao_unidade = 'mcg/ml'
 where codigo = 'dexmedetomidina' and apresentacao is null;
update public.fa_parametros set apresentacao = 'Frasco 250 ml'
 where codigo = 'sevoflurano' and apresentacao is null;
