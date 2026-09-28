-- =============================================================================
-- Ficha Anestésica — balanço hidroeletrolítico no desenho da ficha de papel
--
-- Eram seis linhas fixas (cristaloide, coloide, concentrado de hemácias, plasma,
-- sangramento, diurese). A ficha que os anestesistas usam tem quatro, e o tipo
-- é escolhido na hora do registro:
--
--     Soluções (+) · Hemocomponentes (+) · Sangue (Perda) (-) · Diurese (Perda) (-)
--
-- Menos linha na grade é mais coluna de tempo visível no tablet — e a informação
-- não se perde: o que foi infundido fica no próprio registro.
--
-- As linhas antigas são desativadas, não apagadas: registro de ficha antiga
-- continua existindo, e reativar é um update.
-- =============================================================================

update public.fa_parametros set ativo = false
 where codigo in ('cristaloide', 'coloide', 'concentrado_hemacias', 'plasma');

update public.fa_parametros
   set rotulo = 'Sangue (Perda) (-)', ordem = 30
 where codigo = 'sangue';

update public.fa_parametros
   set rotulo = 'Diurese (Perda) (-)', ordem = 40
 where codigo = 'diurese';

-- As duas linhas novas. `opcoes` já existia para os parâmetros de lista; aqui
-- ela responde "qual solução / qual hemocomponente" na hora de lançar o volume.
insert into public.fa_parametros (codigo, rotulo, secao, tipo, unidade, sinal, faixa_min, faixa_max, ordem, opcoes)
values
    ('solucoes', 'Soluções (+)', 'balanco', 'fluido', 'ml', 'entrada', 0, 5000, 10,
     array['SF 0,9%', 'Ringer lactato', 'Ringer simples', 'Soro glicosado 5%', 'Coloide', 'Manitol']),
    ('hemocomponentes', 'Hemocomponentes (+)', 'balanco', 'fluido', 'ml', 'entrada', 0, 3000, 20,
     array['Concentrado de hemácias', 'Plasma fresco congelado', 'Plaquetas', 'Crioprecipitado'])
on conflict (codigo) do update
   set rotulo = excluded.rotulo,
       secao  = excluded.secao,
       tipo   = excluded.tipo,
       sinal  = excluded.sinal,
       ordem  = excluded.ordem,
       opcoes = excluded.opcoes,
       ativo  = true;
