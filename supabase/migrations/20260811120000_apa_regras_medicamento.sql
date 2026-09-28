-- =============================================================================
-- APA — Regras de conduta pré-operatória de medicamentos
--
-- Substitui a lógica hardcoded por um catálogo editável em Configurações.
-- Nenhuma regra nasce marcada como revisada: `revisado = false` até que um
-- anestesista responsável valide o conteúdo e registre a referência.
--
-- Esta tabela é catálogo (não contém dado de paciente), por isso segue o
-- padrão de acesso das demais tabelas de configuração do sistema.
-- =============================================================================

create table if not exists public.apa_regras_medicamento (
    id            uuid primary key default gen_random_uuid(),
    codigo        text not null unique,
    ativo         boolean not null default true,
    ordem         integer not null default 100,
    classe        text not null,
    termos        text[] not null default '{}',
    conduta       text not null,
    texto         text not null default '',
    nivel         text not null default 'atencao' check (nivel in ('alta', 'atencao')),
    contexto      text not null default 'sempre' check (contexto in ('sempre', 'neuroeixo')),
    clcr_faixas   jsonb,
    referencia    text,
    revisado      boolean not null default false,
    revisado_por  text,
    revisado_em   date,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table  public.apa_regras_medicamento is 'Catálogo de regras de conduta pré-operatória de medicamentos usado pela APA.';
comment on column public.apa_regras_medicamento.termos      is 'Nomes genéricos e marcas comerciais; o motor casa com limite de palavra.';
comment on column public.apa_regras_medicamento.contexto    is '"neuroeixo" só dispara quando o plano anestésico prevê punção ou bloqueio.';
comment on column public.apa_regras_medicamento.clcr_faixas is 'Faixas por clearance de creatinina: [{"ate": 30, "conduta": "...", "texto": "..."}]. "ate" é o limite superior exclusivo; a última faixa usa null.';
comment on column public.apa_regras_medicamento.revisado    is 'Falso até que um anestesista valide a regra e registre a referência.';

create index if not exists idx_apa_regras_ativo_ordem on public.apa_regras_medicamento (ativo, ordem);

create or replace function public.apa_regras_touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_apa_regras_updated_at on public.apa_regras_medicamento;
create trigger trg_apa_regras_updated_at
    before update on public.apa_regras_medicamento
    for each row execute function public.apa_regras_touch_updated_at();

-- -----------------------------------------------------------------------------
-- Seed inicial (42 regras)
--
-- Conteúdo clínico transposto do protótipo de referência, reorganizado em
-- classes e contextos. PENDENTE de revisão por anestesista: enquanto
-- `revisado = false`, a APA exibe o alerta com aviso de conteúdo não validado.
-- -----------------------------------------------------------------------------

insert into public.apa_regras_medicamento
    (codigo, ordem, classe, termos, conduta, texto, nivel, contexto, clcr_faixas)
values
-- Fitoterápicos e substâncias complementares -----------------------------------
('fitoterapico_hemostatico', 10, 'Fitoterápico ou suplemento com efeito hemostático',
 array['alho','garlic','arnica','boldo','curcuma','acafrao','erva de sao joao','hiperico','hypericum','gengibre','ginger','ginkgo','ginkgo biloba','vitamina e','tocoferol'],
 'Suspender 2 semanas antes',
 'Alho, arnica, boldo, cúrcuma, erva-de-São-João, gengibre, ginkgo biloba e vitamina E devem ser suspensos 2 semanas antes da cirurgia devido ao efeito antiagregante plaquetário e à potencialização do efeito dos anticoagulantes.',
 'alta', 'sempre', null),

('substancia_complementar_risco', 20, 'Substância complementar com risco perioperatório',
 array['canabidiol','cannabidiol','cbd','dimetilamilamina','dmaa','efedra','ephedra','kratom','maconha','cannabis'],
 'Descontinuar antes da cirurgia',
 'Descontinuar preparações de canabidiol, dimetilamilamina (DMAA), efedra, kratom e maconha antes da cirurgia. Registrar produto, dose, frequência e data da última utilização.',
 'alta', 'sempre', null),

-- Neurologia e psiquiatria -----------------------------------------------------
('antidepressivo', 30, 'Antidepressivo',
 array['fluoxetina','sertralina','escitalopram','citalopram','paroxetina','venlafaxina','desvenlafaxina','duloxetina','amitriptilina','nortriptilina','trazodona','bupropiona','antidepressivo'],
 'Manter até o procedimento',
 'Manutenção até o dia do procedimento sob anestesia. Evitar meperidina e vasopressores de ação indireta; revisar interações serotoninérgicas e hemodinâmicas.',
 'atencao', 'sempre', null),

('litio', 40, 'Lítio',
 array['litio','carbonato de litio'],
 'Suspender 72 horas antes',
 'Interromper 72 horas antes da cirurgia. Reiniciar quando eletrólitos estiverem normais, estabilidade hemodinâmica presente e o paciente puder comer e beber.',
 'alta', 'sempre', null),

('antipsicotico_antiepileptico_bzd', 50, 'Antipsicótico, antiepiléptico ou benzodiazepínico',
 array['clonazepam','diazepam','alprazolam','lorazepam','antiepileptico','carbamazepina','fenitoina','fenobarbital','levetiracetam','valproato','antipsicotico','quetiapina','olanzapina','risperidona','haloperidol'],
 'Manter até o dia da cirurgia',
 'Manutenção até o dia da cirurgia, com revisão de interações, sedação e repercussões hemodinâmicas.',
 'atencao', 'sempre', null),

-- Analgesia e antiagregação ----------------------------------------------------
('analgesico_coxibe_opioide', 60, 'Analgésico, COX-2, opioide ou coadjuvante',
 array['celecoxibe','etoricoxibe','parecoxibe','valdecoxibe','dipirona','paracetamol','tramadol','morfina','codeina','oxicodona','gabapentina','pregabalina'],
 'Manter até o dia da cirurgia',
 'Manutenção até o dia da cirurgia. Atenção ao valdecoxibe em cirurgia cardíaca e ao aumento do risco de evento cardíaco.',
 'atencao', 'sempre', null),

('aas', 70, 'Ácido acetilsalicílico',
 array['aas','aspirina','acido acetilsalicilico'],
 'Em geral, manter',
 'Em pacientes com stent coronariano, manter em geral independentemente do intervalo desde o implante. Considerar suspensão apenas quando o risco de sangramento superar o risco cardíaco ou tromboembólico.',
 'alta', 'sempre', null),

('antiagregante_plaquetario', 80, 'Antiagregante plaquetário',
 array['clopidogrel','plavix','prasugrel','ticagrelor','brilinta','ticlopidina'],
 'Revisar stent e risco trombótico',
 'Identificar tipo e data do stent. Stent metálico: manter clopidogrel e AAS até 30 dias; stent farmacológico: até 12 meses. Cirurgia eletiva muito precoce deve ser adiada quando possível. Suspender apenas se o risco hemorrágico superar o risco de trombose. Para neuroeixo: clopidogrel 5–7 dias, ticlopidina 10 dias, prasugrel 7–10 dias e ticagrelor 5–7 dias; nova dose geralmente após 6 horas.',
 'alta', 'sempre', null),

('aine', 90, 'Anti-inflamatório não esteroide',
 array['ibuprofeno','diclofenaco','naproxeno','meloxicam','piroxicam','tenoxicam','cetoprofeno','cetorolaco','aine'],
 'Avaliar função renal e hepática',
 'Atenção em insuficiência renal ou hepática e uso de drogas ou álcool. A suspensão antes de bloqueio do neuroeixo permanece controversa; aspirina e AINEs isolados não impõem restrição de intervalo.',
 'atencao', 'sempre', null),

-- Endocrinologia e diversos ----------------------------------------------------
('corticoide', 100, 'Corticoide',
 array['prednisona','prednisolona','dexametasona','hidrocortisona','corticoide','budesonida','beclometasona'],
 'Manter até o dia da cirurgia',
 'Manutenção até o dia da cirurgia. Discutir necessidade de dose suplementar conforme dose, duração do tratamento e risco de supressão adrenal.',
 'atencao', 'sempre', null),

('asma_tireoide_tiazidico_miastenia', 110, 'Asma, tireoide, colírio, tiazídico ou miastenia',
 array['salbutamol','formoterol','salmeterol','tiotropio','levotiroxina','tapazol','metimazol','piridostigmina','mestinon','colirio','hidroclorotiazida','clortalidona','indapamida'],
 'Manter até o dia da cirurgia',
 'Manutenção até o dia da cirurgia.',
 'atencao', 'sempre', null),

('sildenafil_diuretico', 120, 'Sildenafil ou diurético não tiazídico',
 array['sildenafil','tadalafila','vardenafila','furosemida','espironolactona','bumetanida'],
 'Suspender na véspera',
 'Suspensão na véspera da cirurgia, salvo indicação clínica específica que exija conduta diferente.',
 'atencao', 'sempre', null),

('estrogenio_serm', 130, 'Estrogênio ou SERM',
 array['anticoncepcional','etinilestradiol','estradiol','tamoxifeno','raloxifeno','reposicao hormonal'],
 'Considerar suspensão 3 semanas antes',
 'Suspensão 3 semanas antes da cirurgia em pacientes com alto risco de tromboembolismo venoso. Individualizar contracepção e risco trombótico.',
 'alta', 'sempre', null),

-- Diabetes ---------------------------------------------------------------------
('metformina', 140, 'Metformina',
 array['metformina','glifage'],
 'Considerar suspensão no dia',
 'Deve ser considerada a suspensão no dia da cirurgia eletiva. Avaliar função renal, uso de contraste e risco metabólico.',
 'atencao', 'sempre', null),

('tiazolidinediona', 150, 'Tiazolidinediona',
 array['pioglitazona','rosiglitazona'],
 'Pode ser mantida',
 'Pode ser mantida ambulatorialmente em cirurgia eletiva não cardíaca.',
 'atencao', 'sempre', null),

('glp1_gip', 160, 'Análogo de GLP-1 ou GIP',
 array['ozempic','wegovy','rybelsus','semaglutida','saxenda','victoza','liraglutida','trulicity','dulaglutida','mounjaro','zepbound','tirzepatida','exenatida','byetta','bydureon','lixisenatida','lyxumia'],
 'Considerar suspensão (semaglutida: 21 dias)',
 'Considerar a suspensão. Para semaglutida oral ou subcutânea, orientar suspensão 21 dias antes da cirurgia. Avaliar sintomas gastrointestinais e risco de conteúdo gástrico residual.',
 'alta', 'sempre', null),

('dpp4', 170, 'Inibidor de DPP-4',
 array['sitagliptina','vildagliptina','linagliptina','saxagliptina','alogliptina'],
 'Manter',
 'É recomendada a manutenção no pré-operatório de cirurgia eletiva.',
 'atencao', 'sempre', null),

('sglt2', 180, 'Inibidor de SGLT-2',
 array['forxiga','dapagliflozina','jardiance','empagliflozina','invokana','canagliflozina','steglatro','ertugliflozina'],
 'Suspender 3–4 dias antes',
 'Suspender entre 3 e 4 dias antes da cirurgia para reduzir o risco de cetoacidose perioperatória. Reiniciar somente após estabilidade clínica e ingestão oral restabelecida.',
 'alta', 'sempre', null),

('alfa_glicosidase', 190, 'Inibidor de alfa-glicosidase',
 array['acarbose','miglitol'],
 'Suspender no dia',
 'Suspender no dia da cirurgia.',
 'atencao', 'sempre', null),

('sulfonilureia', 200, 'Sulfonilureia',
 array['glibenclamida','gliclazida','glimepirida','glipizida','sulfonilureia'],
 'Suspender 24 horas antes',
 'Suspender 24 horas antes da cirurgia devido ao risco de hipoglicemia.',
 'alta', 'sempre', null),

('glinida', 210, 'Glinida',
 array['repaglinida','nateglinida','glinida'],
 'Suspender no dia',
 'Suspender no dia da cirurgia.',
 'atencao', 'sempre', null),

('insulina_prandial', 220, 'Insulina prandial',
 array['insulina regular','lispro','asparte','glulisina','insulina prandial'],
 'Evitar durante o jejum',
 'Evitar durante o período de jejum; utilizar apenas para correção eventual conforme controle glicêmico.',
 'alta', 'sempre', null),

('insulina_nph', 230, 'Insulina NPH',
 array['nph','insulina intermediaria'],
 'Manter à noite; reduzir 50% pela manhã',
 'Manter a dose na noite anterior e reduzir em 50% a dose da manhã até o término do jejum. Individualizar pelo risco de hipoglicemia.',
 'alta', 'sempre', null),

('insulina_basal_longa', 240, 'Insulina basal de longa ação',
 array['glargina','detemir','lantus','levemir','basaglar'],
 'Reduzir 20–30%',
 'Manter ou reduzir em 20–30% a partir da noite anterior. Em pacientes com maior proporção basal, a redução pode chegar a 50%.',
 'alta', 'sempre', null),

('insulina_basal_ultralonga', 250, 'Insulina basal ultralonga',
 array['degludeca','tresiba','glargina u300','toujeo','insulina ultralenta'],
 'Reduzir 20–30% desde 72 horas antes',
 'Manter ou reduzir em 20–30% desde 72 horas antes do procedimento. Em pacientes com maior proporção basal, a redução pode chegar a 50%.',
 'alta', 'sempre', null),

-- Neuroeixo: só disparam quando o plano prevê punção ou bloqueio ---------------
('hnf_neuroeixo', 300, 'Heparina não fracionada',
 array['heparina nao fracionada','hnf','heparina'],
 'Intervalo mínimo 4–6 horas',
 'Dose profilática: aguardar 4–6 horas antes do neuroeixo e cerca de 1 hora para a próxima dose. Dose terapêutica IV: 4–6 horas antes, com próxima dose em aproximadamente 1 hora após a punção e 4 horas após retirada de cateter. Confirmar coagulação.',
 'alta', 'neuroeixo', null),

('enoxaparina_neuroeixo', 310, 'Enoxaparina',
 array['enoxaparina','clexane'],
 '12 h profilática / 24 h terapêutica',
 'Aguardar pelo menos 12 horas após dose profilática ou 24 horas após dose terapêutica antes da punção, manipulação ou retirada do cateter. Próxima dose após 4 horas.',
 'alta', 'neuroeixo', null),

('fondaparinux_neuroeixo', 320, 'Fondaparinux',
 array['fondaparinux','arixtra'],
 'Aguardar 36–42 horas',
 'Intervalo mínimo de 36–42 horas antes do neuroeixo; próxima dose 6–12 horas após manipulação ou retirada do cateter. Uso discutido: individualizar.',
 'alta', 'neuroeixo', null),

('varfarina_neuroeixo', 330, 'Varfarina',
 array['varfarina','warfarina','marevan','coumadin'],
 'Puncionar apenas com INR < 1,4',
 'Realizar punção, manipulação ou retirada de cateter somente com INR < 1,4. Próxima dose após INR < 1,5. Se INR entre 1,5 e 3, reduzir dose para retirada; INR > 3 contraindica a retirada do cateter.',
 'alta', 'neuroeixo', null),

('rivaroxabana_neuroeixo', 340, 'Rivaroxabana',
 array['rivaroxabana','xarelto'],
 'Aguardar 72 horas',
 'Aguardar 72 horas antes da punção, manipulação ou retirada do cateter. Próxima dose após 6 horas. Avaliação do nível sérico: aproximadamente 22–26 horas após a administração.',
 'alta', 'neuroeixo', null),

('apixabana_neuroeixo', 350, 'Apixabana',
 array['apixabana','eliquis'],
 'Aguardar 72 horas',
 'Aguardar 72 horas antes da punção, manipulação ou retirada do cateter. Próxima dose após 4–6 horas. Avaliação do nível sérico: aproximadamente 26–30 horas após a administração.',
 'alta', 'neuroeixo', null),

('edoxabana_neuroeixo', 360, 'Edoxabana',
 array['edoxabana','lixiana'],
 'Aguardar 72 horas',
 'Aguardar 72 horas antes da punção, manipulação ou retirada do cateter. Próxima dose após 6 horas. Avaliação do nível sérico: aproximadamente 20–28 horas após a administração.',
 'alta', 'neuroeixo', null),

('betrixabana_neuroeixo', 370, 'Betrixabana',
 array['betrixabana'],
 'Aguardar 72 horas',
 'Aguardar 72 horas antes do neuroeixo e aproximadamente 5 horas para nova dose. Clearance de creatinina < 30 mL/min contraindica bloqueio do neuroeixo.',
 'alta', 'neuroeixo', null),

('dabigatrana_neuroeixo', 380, 'Dabigatrana',
 array['dabigatrana','pradaxa'],
 'Aguardar 72–120 h conforme função renal',
 'O intervalo depende do clearance de creatinina. Próxima dose após 6 horas. ClCr < 30 mL/min contraindica bloqueio do neuroeixo.',
 'alta', 'neuroeixo',
 '[{"ate": 30, "conduta": "Contraindica bloqueio do neuroeixo", "texto": "ClCr < 30 mL/min contraindica o bloqueio do neuroeixo."},
   {"ate": 50, "conduta": "Aguardar 120 horas", "texto": "ClCr entre 30 e 49 mL/min: aguardar 120 horas antes da punção. Próxima dose após 6 horas."},
   {"ate": 80, "conduta": "Aguardar 96 horas",  "texto": "ClCr entre 50 e 79 mL/min: aguardar 96 horas antes da punção. Próxima dose após 6 horas."},
   {"ate": null, "conduta": "Aguardar 72 horas", "texto": "ClCr maior ou igual a 80 mL/min: aguardar 72 horas antes da punção. Próxima dose após 6 horas."}]'::jsonb),

('argatroban_neuroeixo', 390, 'Argatroban',
 array['argatroban'],
 'Aguardar 4 horas',
 'Aguardar 4 horas antes da manipulação; próxima dose após 2–6 horas.',
 'alta', 'neuroeixo', null),

('cangrelor_neuroeixo', 400, 'Cangrelor',
 array['cangrelor'],
 'Aguardar 3 horas',
 'Aguardar 3 horas antes da manipulação; próxima dose após 6–8 horas.',
 'alta', 'neuroeixo', null),

('cilostazol_neuroeixo', 410, 'Cilostazol',
 array['cilostazol'],
 'Aguardar 48 horas',
 'Aguardar 48 horas antes da manipulação; próxima dose após 3–6 horas.',
 'alta', 'neuroeixo', null),

('dipiridamol_neuroeixo', 420, 'Dipiridamol de liberação prolongada',
 array['dipiridamol'],
 'Aguardar 48 horas',
 'Aguardar 48 horas antes da manipulação; próxima dose após 6 horas.',
 'alta', 'neuroeixo', null),

('eptifibatida_neuroeixo', 430, 'Eptifibatida',
 array['eptifibatida','eptifibatide'],
 'Aguardar 8 horas',
 'Aguardar 8 horas antes da manipulação e 6 horas para nova dose; realizar bloqueio apenas com função plaquetária normal.',
 'alta', 'neuroeixo', null),

('abciximab_neuroeixo', 440, 'Abciximab',
 array['abciximab'],
 'Aguardar 24–48 horas',
 'Aguardar 24–48 horas antes da manipulação e 7 horas para nova dose; realizar bloqueio apenas com função plaquetária normal.',
 'alta', 'neuroeixo', null),

('tirofiban_neuroeixo', 450, 'Tirofiban',
 array['tirofiban'],
 'Aguardar 8 horas',
 'Aguardar 8 horas antes da manipulação e 8 horas para nova dose; realizar bloqueio apenas com função plaquetária normal.',
 'alta', 'neuroeixo', null),

('fibrinolitico_neuroeixo', 460, 'Fibrinolítico ou trombolítico',
 array['alteplase','tenecteplase','estreptoquinase','fibrinolitico','trombolitico'],
 'Aguardar 10 dias',
 'Aguardar 10 dias antes do neuroeixo e 10 dias para nova administração. Uso discutido em bloqueio do neuroeixo.',
 'alta', 'neuroeixo', null)

on conflict (codigo) do nothing;
