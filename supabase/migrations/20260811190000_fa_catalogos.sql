-- =============================================================================
-- Ficha Anestésica — catálogos editáveis
--
-- No protótipo de referência os fármacos, as infusões e as unidades estavam
-- escritos no JavaScript: incluir um item novo exigia alterar código. Aqui são
-- cadastro, com tela em Configurações.
-- =============================================================================

-- Linhas da grade: infusões contínuas, monitorização e balanço ----------------
create table if not exists public.fa_parametros (
    id            uuid primary key default gen_random_uuid(),
    codigo        text not null unique,
    rotulo        text not null,
    secao         text not null check (secao in ('agentes', 'monitorizacao', 'balanco', 'hemodinamica')),
    tipo          text not null check (tipo in ('infusao', 'medida', 'fluido')),
    unidade       text not null default '',
    valor_padrao  text,
    sinal         text check (sinal in ('entrada', 'saida')),
    faixa_min     numeric,
    faixa_max     numeric,
    ordem         integer not null default 100,
    ativo         boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table  public.fa_parametros is 'Linhas da grade da ficha anestésica. O código é o "alvo" dos eventos.';
comment on column public.fa_parametros.sinal     is 'Só para balanço: entrada soma, saida subtrai.';
comment on column public.fa_parametros.faixa_min is 'Faixa plausível, usada para confirmar valor digitado fora do esperado (ex.: FC 700).';

create index if not exists idx_fa_parametros_ativo on public.fa_parametros (ativo, secao, ordem);

-- Fármacos de dose única ------------------------------------------------------
create table if not exists public.fa_farmacos (
    id            uuid primary key default gen_random_uuid(),
    codigo        text not null unique,
    nome          text not null,
    rotulo_curto  text not null default '',
    classe        text not null default 'Outros',
    ordem_classe  integer not null default 99,
    unidade       text not null default 'mg',
    via_padrao    text not null default 'IV',
    ordem         integer not null default 100,
    ativo         boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.fa_farmacos is 'Catálogo de fármacos para registro de dose única na ficha anestésica.';

create index if not exists idx_fa_farmacos_ativo on public.fa_farmacos (ativo, ordem_classe, ordem);

drop trigger if exists trg_fa_parametros_updated_at on public.fa_parametros;
create trigger trg_fa_parametros_updated_at
    before update on public.fa_parametros
    for each row execute function public.fa_touch_updated_at();

drop trigger if exists trg_fa_farmacos_updated_at on public.fa_farmacos;
create trigger trg_fa_farmacos_updated_at
    before update on public.fa_farmacos
    for each row execute function public.fa_touch_updated_at();

-- Seed dos parâmetros ---------------------------------------------------------
insert into public.fa_parametros (codigo, rotulo, secao, tipo, unidade, valor_padrao, sinal, faixa_min, faixa_max, ordem) values
('oxigenio',        'Oxigênio',          'agentes', 'infusao', 'L/min',    '1',  null, 0,  15,  10),
('ar_comprimido',   'Ar comprimido',     'agentes', 'infusao', 'L/min',    '1',  null, 0,  15,  20),
('sevoflurano',     'Sevoflurano',       'agentes', 'infusao', '%',        null, null, 0,  8,   30),
('propofol',        'Propofol',          'agentes', 'infusao', 'mcg/ml',   null, null, 0,  12,  40),
('remifentanil',    'Remifentanil',      'agentes', 'infusao', 'ng/ml',    null, null, 0,  15,  50),
('dexmedetomidina', 'Dexmedetomidina',   'agentes', 'infusao', 'mcg/kg/h', null, null, 0,  2,   60),

('pas',             'PA sistólica',      'hemodinamica', 'medida', 'mmHg', null, null, 30, 300, 10),
('pad',             'PA diastólica',     'hemodinamica', 'medida', 'mmHg', null, null, 10, 200, 20),
('fc',              'Frequência cardíaca','hemodinamica','medida', 'bpm',  null, null, 20, 250, 30),

('temperatura',     'Temperatura',       'monitorizacao', 'medida', 'ºC',   null, null, 30, 43,  10),
('etco2',           'ETCO2',             'monitorizacao', 'medida', 'mmHg', '35', null, 10, 80,  20),
('spo2',            'SatO2',             'monitorizacao', 'medida', '%',    '98', null, 50, 100, 30),
('bis',             'BIS',               'monitorizacao', 'medida', '',     null, null, 0,  100, 40),
('pam_invasiva',    'PAM invasiva',      'monitorizacao', 'medida', 'mmHg', null, null, 20, 250, 50),

('cristaloide',        'Cristaloide',        'balanco', 'fluido', 'ml', '500', 'entrada', 0, 5000, 10),
('coloide',            'Coloide',            'balanco', 'fluido', 'ml', null,  'entrada', 0, 3000, 20),
('concentrado_hemacias','Concentrado de hemácias','balanco','fluido','ml', null,'entrada', 0, 3000, 30),
('plasma',             'Plasma fresco',      'balanco', 'fluido', 'ml', null,  'entrada', 0, 3000, 40),
('sangue',             'Sangramento',        'balanco', 'fluido', 'ml', null,  'saida',   0, 5000, 50),
('diurese',            'Diurese',            'balanco', 'fluido', 'ml', null,  'saida',   0, 5000, 60)
on conflict (codigo) do nothing;

-- Seed dos fármacos (transposto do protótipo de referência) -------------------
insert into public.fa_farmacos (codigo, nome, rotulo_curto, classe, ordem_classe, unidade, ordem) values
('lidocaina_2_5_ml', 'Lidocaína 2% (5 ml)', 'Lidocaína 2% (5 ml)', 'Anestésicos locais', 1, 'ml', 10),
('lidocaina_2_com_vasoconstritor_20_ml', 'Lidocaína 2% com vasoconstritor (20 ml)', 'Lidocaína 2% com vaso (20 ml)', 'Anestésicos locais', 1, 'ml', 20),
('lidocaina_2_sem_vasoconstritor_20_ml', 'Lidocaína 2% sem vasoconstritor (20 ml)', 'Lidocaína 2% sem vaso (20 ml)', 'Anestésicos locais', 1, 'ml', 30),
('ropivacaina_1_20_ml', 'Ropivacaína 1% (20 ml)', 'Ropivacaína 1% (20 ml)', 'Anestésicos locais', 1, 'ml', 40),
('bupivacaina_0_5_com_vasoconstritor_20_ml', 'Bupivacaína 0,5% com vasoconstritor (20 ml)', 'Bupivacaína 0,5% com vaso (20 ml)', 'Anestésicos locais', 1, 'ml', 50),
('bupivacaina_0_5_sem_vasoconstritor_20_ml', 'Bupivacaína 0,5% sem vasoconstritor (20 ml)', 'Bupivacaína 0,5% sem vaso (20 ml)', 'Anestésicos locais', 1, 'ml', 60),
('levobupivacaina_0_5_com_vasoconstritor_20_ml', 'Levobupivacaína 0,5% com vasoconstritor (20 ml)', 'Levobupivacaína 0,5% com vaso (20 ml)', 'Anestésicos locais', 1, 'ml', 70),
('levobupivacaina_0_5_sem_vasoconstritor_20_ml', 'Levobupivacaína 0,5% sem vasoconstritor (20 ml)', 'Levobupivacaína 0,5% sem vaso (20 ml)', 'Anestésicos locais', 1, 'ml', 80),
('bupivacaina_hiperbarica_0_5_4_ml_steripack', 'Bupivacaína hiperbárica 0,5% (4 ml - SteriPack)', 'Bupivacaína hiperbárica 0,5% (4 ml)', 'Anestésicos locais', 1, 'ml', 90),
('bupivacaina_isobarica_0_5_4_ml_steripack', 'Bupivacaína isobárica 0,5% (4 ml - SteriPack)', 'Bupivacaína isobárica 0,5% (4 ml)', 'Anestésicos locais', 1, 'ml', 100),
('propofol_1_20_ml', 'Propofol 1% (20 ml)', 'Propofol 1% (20 ml)', 'Hipnoindutores, benzodiazepínicos e antagonistas', 2, 'mg', 110),
('etomidato_2_mg_ml_10_ml', 'Etomidato 2 mg/ml (10 ml)', 'Etomidato 2 mg/ml (10 ml)', 'Hipnoindutores, benzodiazepínicos e antagonistas', 2, 'mg', 120),
('cetamina_50_mg_ml_2_ml', 'Cetamina 50 mg/ml (2 ml)', 'Cetamina 50 mg/ml (2 ml)', 'Hipnoindutores, benzodiazepínicos e antagonistas', 2, 'mg', 130),
('midazolam_1_mg_ml_5_ml', 'Midazolam 1 mg/ml (5 ml)', 'Midazolam 1 mg/ml (5 ml)', 'Hipnoindutores, benzodiazepínicos e antagonistas', 2, 'mg', 140),
('midazolam_5_mg_ml_3_ml', 'Midazolam 5 mg/ml (3 ml)', 'Midazolam 5 mg/ml (3 ml)', 'Hipnoindutores, benzodiazepínicos e antagonistas', 2, 'mg', 150),
('diazepam_5_mg_ml_2_ml', 'Diazepam 5 mg/ml (2 ml)', 'Diazepam 5 mg/ml (2 ml)', 'Hipnoindutores, benzodiazepínicos e antagonistas', 2, 'mg', 160),
('flumazenil_0_1_mg_ml_5_ml', 'Flumazenil 0,1 mg/ml (5 ml)', 'Flumazenil 0,1 mg/ml (5 ml)', 'Hipnoindutores, benzodiazepínicos e antagonistas', 2, 'mg', 170),
('suxametonio_100_mg_frasco', 'Suxametônio 100 mg (frasco)', 'Suxametônio 100 mg', 'Bloqueadores neuromusculares e antagonistas', 3, 'mg', 180),
('cisatracurio_2_mg_ml_5_ml', 'Cisatracúrio 2 mg/ml (5 ml)', 'Cisatracúrio 2 mg/ml (5 ml)', 'Bloqueadores neuromusculares e antagonistas', 3, 'mg', 190),
('neostigmina_0_5_mg_ml_1_ml', 'Neostigmina 0,5 mg/ml (1 ml)', 'Neostigmina 0,5 mg/ml (1 ml)', 'Bloqueadores neuromusculares e antagonistas', 3, 'mg', 200),
('rocuronio_10_mg_ml_5_ml', 'Rocurônio 10 mg/ml (5 ml)', 'Rocurônio 10 mg/ml (5 ml)', 'Bloqueadores neuromusculares e antagonistas', 3, 'mg', 210),
('sugamadex_100_mg_ml_2_ml', 'Sugamadex 100 mg/ml (2 ml)', 'Sugamadex 100 mg/ml (2 ml)', 'Bloqueadores neuromusculares e antagonistas', 3, 'mg', 220),
('sevoflurano_250_ml', 'Sevoflurano (250 ml)', 'Sevoflurano (250 ml)', 'Anestésicos inalatórios e dantrolene', 4, 'ml', 230),
('dantrolene_sodico_20_mg_frasco', 'Dantrolene sódico 20 mg (frasco)', 'Dantrolene sódico 20 mg', 'Anestésicos inalatórios e dantrolene', 4, 'mg', 240),
('fentanil_50_mcg_ml_2_ml_steripack', 'Fentanil 50 mcg/ml (2 ml - SteriPack)', 'Fentanil 50 mcg/ml (2 ml)', 'Opioides e antagonistas', 5, 'mcg', 250),
('fentanil_50_mcg_ml_10_ml', 'Fentanil 50 mcg/ml (10 ml)', 'Fentanil 50 mcg/ml (10 ml)', 'Opioides e antagonistas', 5, 'mcg', 260),
('alfentanil_0_5_mg_ml_5_ml', 'Alfentanil 0,5 mg/ml (5 ml)', 'Alfentanil 0,5 mg/ml (5 ml)', 'Opioides e antagonistas', 5, 'mg', 270),
('sufentanil_50_mcg_ml_1_ml', 'Sufentanil 50 mcg/ml (1 ml)', 'Sufentanil 50 mcg/ml (1 ml)', 'Opioides e antagonistas', 5, 'mcg', 280),
('remifentanil_2_mg_frasco', 'Remifentanil 2 mg (frasco)', 'Remifentanil 2 mg', 'Opioides e antagonistas', 5, 'mcg', 290),
('nalbufina_10_mg_ml_1_ml', 'Nalbufina 10 mg/ml (1 ml)', 'Nalbufina 10 mg/ml (1 ml)', 'Opioides e antagonistas', 5, 'mg', 300),
('tramadol_50_mg_ml_2_ml', 'Tramadol 50 mg/ml (2 ml)', 'Tramadol 50 mg/ml (2 ml)', 'Opioides e antagonistas', 5, 'mg', 310),
('morfina_0_2_mg_ml_1_ml_steripack', 'Morfina 0,2 mg/ml (1 ml - SteriPack)', 'Morfina 0,2 mg/ml (1 ml)', 'Opioides e antagonistas', 5, 'mg', 320),
('morfina_1_mg_ml_2_ml_steripack', 'Morfina 1 mg/ml (2 ml - SteriPack)', 'Morfina 1 mg/ml (2 ml)', 'Opioides e antagonistas', 5, 'mg', 330),
('morfina_10_mg_ml_1_ml', 'Morfina 10 mg/ml (1 ml)', 'Morfina 10 mg/ml (1 ml)', 'Opioides e antagonistas', 5, 'mg', 340),
('naloxona_0_4_mg_ml_1_ml', 'Naloxona 0,4 mg/ml (1 ml)', 'Naloxona 0,4 mg/ml (1 ml)', 'Opioides e antagonistas', 5, 'mg', 350),
('metoclopramida_10_mg_ml_1_ml', 'Metoclopramida 10 mg/ml (1 ml)', 'Metoclopramida 10 mg/ml (1 ml)', 'Antieméticos', 6, 'mg', 360),
('ondansetrona_2_mg_ml_2_ml', 'Ondansetrona 2 mg/ml (2 ml)', 'Ondansetrona 2 mg/ml (2 ml)', 'Antieméticos', 6, 'mg', 370),
('ondansetrona_2_mg_ml_4_ml', 'Ondansetrona 2 mg/ml (4 ml)', 'Ondansetrona 2 mg/ml (4 ml)', 'Antieméticos', 6, 'mg', 380),
('dimenidrinato_3_mg_ml_10_ml', 'Dimenidrinato 3 mg/ml (10 ml)', 'Dimenidrinato 3 mg/ml (10 ml)', 'Antieméticos', 6, 'mg', 390),
('droperidol_2_5_mg_ml_1_ml', 'Droperidol 2,5 mg/ml (1 ml)', 'Droperidol 2,5 mg/ml (1 ml)', 'Antieméticos', 6, 'mg', 400),
('dipirona_500_mg_ml_2_ml', 'Dipirona 500 mg/ml (2 ml)', 'Dipirona 500 mg/ml (2 ml)', 'Analgésicos não opioides e adjuvantes', 7, 'mg', 410),
('cetoprofeno_100_mg_frasco', 'Cetoprofeno 100 mg (frasco)', 'Cetoprofeno 100 mg', 'Analgésicos não opioides e adjuvantes', 7, 'mg', 420),
('tenoxicam_40_mg_frasco', 'Tenoxicam 40 mg (frasco)', 'Tenoxicam 40 mg', 'Analgésicos não opioides e adjuvantes', 7, 'mg', 430),
('cetorolaco_de_trometamol_30_mg_ml_ampola_de_1_ml', 'Cetorolaco de trometamol 30 mg/ml — ampola de 1 ml', 'Cetorolaco de trometamol 30 mg/ml — 1 ml', 'Analgésicos não opioides e adjuvantes', 7, 'mg', 440),
('dexmedetomidina_100_mcg_ml_2_ml', 'Dexmedetomidina 100 mcg/ml (2 ml)', 'Dexmedetomidina 100 mcg/ml (2 ml)', 'Analgésicos não opioides e adjuvantes', 7, 'mcg', 450),
('metadona_10_mg_ml_1_ml', 'Metadona 10 mg/ml (1 ml)', 'Metadona 10 mg/ml (1 ml)', 'Analgésicos não opioides e adjuvantes', 7, 'mg', 460),
('clonidina_150_mcg_1_ml', 'Clonidina 150 mcg (1 ml)', 'Clonidina 150 mcg (1 ml)', 'Analgésicos não opioides e adjuvantes', 7, 'mcg', 470),
('dexametasona_4_mg_ml_2_5_ml', 'Dexametasona 4 mg/ml (2,5 ml)', 'Dexametasona 4 mg/ml (2,5 ml)', 'Corticosteroides', 8, 'mg', 480),
('hidrocortisona_100_mg_frasco', 'Hidrocortisona 100 mg (frasco)', 'Hidrocortisona 100 mg', 'Corticosteroides', 8, 'mg', 490),
('hidrocortisona_500_mg_frasco', 'Hidrocortisona 500 mg (frasco)', 'Hidrocortisona 500 mg', 'Corticosteroides', 8, 'mg', 500),
('cimetidina_150_mg_ml_2_ml', 'Cimetidina 150 mg/ml (2 ml)', 'Cimetidina 150 mg/ml (2 ml)', 'Inibidores H2', 9, 'mg', 510),
('efedrina_5_mg_ml', 'Efedrina 5 mg/ml', 'Efedrina 5 mg/ml', 'Vasopressores', 10, 'mg', 520),
('fenilefrina', 'Fenilefrina', 'Fenilefrina', 'Vasopressores', 10, 'mcg', 530),
('metaraminol_aramin_0_5_mg_ml', 'Metaraminol (Aramin) 0,5 mg/ml', 'Metaraminol (Aramin) 0,5 mg/ml', 'Vasopressores', 10, 'mg', 540),
('vasopressina_20_u_ml_1_ml', 'Vasopressina 20 U/ml (1 ml)', 'Vasopressina 20 U/ml (1 ml)', 'Vasopressina', 11, 'U', 550),
('salbutamol_100_mcg_frasco_spray', 'Salbutamol 100 mcg (frasco spray)', 'Salbutamol 100 mcg', 'Broncodilatadores', 12, 'mcg', 560),
('terbutalina_0_5_mg_ml_1_ml', 'Terbutalina 0,5 mg/ml (1 ml)', 'Terbutalina 0,5 mg/ml (1 ml)', 'Broncodilatadores', 12, 'mg', 570),
('gluconato_de_calcio_10_10_ml', 'Gluconato de cálcio 10% (10 ml)', 'Gluconato de cálcio 10% (10 ml)', 'Cálcio', 13, 'ml', 580),
('cloreto_de_calcio', 'Cloreto de cálcio', 'Cloreto de cálcio', 'Cálcio', 13, 'ml', 590),
('acido_tranexamico_50_mg_ml_ampola_de_5_ml_total_250_mg', 'Ácido tranexâmico 50 mg/ml — ampola de 5 ml — total 250 mg', 'Ácido tranexâmico 50 mg/ml — 5 ml (250 mg)', 'Hemostáticos e antifibrinolíticos', 14, 'mg', 600),
('cefazolina_1_g_po_para_solucao_injetavel_frasco_ampola', 'Cefazolina 1 g — pó para solução injetável — frasco-ampola', 'Cefazolina 1 g — frasco-ampola', 'Antibióticos', 15, 'g', 610),
('clindamicina_150_mg_ml_ampola_de_4_ml_total_600_mg', 'Clindamicina 150 mg/ml — ampola de 4 ml — total 600 mg', 'Clindamicina 150 mg/ml — 4 ml (600 mg)', 'Antibióticos', 15, 'mg', 620),
('metronidazol_5_mg_ml_bolsa_de_100_ml_total_500_mg', 'Metronidazol 5 mg/ml — bolsa de 100 ml — total 500 mg', 'Metronidazol 5 mg/ml — 100 ml (500 mg)', 'Antibióticos', 15, 'mg', 630),
('vancomicina_500_mg_po_para_solucao_injetavel_frasco_ampola', 'Vancomicina 500 mg — pó para solução injetável — frasco-ampola', 'Vancomicina 500 mg — frasco-ampola', 'Antibióticos', 15, 'mg', 640),
('vancomicina_1_g_po_para_solucao_injetavel_frasco_ampola', 'Vancomicina 1 g — pó para solução injetável — frasco-ampola', 'Vancomicina 1 g — frasco-ampola', 'Antibióticos', 15, 'g', 650),
('ceftriaxona_1_g_po_para_solucao_injetavel_frasco_ampola', 'Ceftriaxona 1 g — pó para solução injetável — frasco-ampola', 'Ceftriaxona 1 g — frasco-ampola', 'Antibióticos', 15, 'g', 660),
('ciprofloxacino_2_mg_ml_bolsa_de_200_ml_total_400_mg', 'Ciprofloxacino 2 mg/ml — bolsa de 200 ml — total 400 mg', 'Ciprofloxacino 2 mg/ml — 200 ml (400 mg)', 'Antibióticos', 15, 'mg', 670),
('atropina', 'Atropina', 'Atropina', 'Outros', 16, 'mg', 680)
on conflict (codigo) do nothing;
