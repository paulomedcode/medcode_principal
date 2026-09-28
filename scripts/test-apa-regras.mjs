/**
 * Testes do motor de conduta medicamentosa da APA.
 * Rodar com:  node scripts/test-apa-regras.mjs
 *
 * Sem dependência externa de propósito: o projeto não tem runner de testes e
 * não vale instalar um só para isto.
 */
import {
    normalizar,
    contemTermo,
    planoTemNeuroeixo,
    condutaEhManutencao,
    calcularClCr,
    avaliarMedicamento,
    avaliarMedicamentos
} from '../src/utils/apaMedicationRules.js';
import { statusDoExame } from '../src/utils/apaExameFisico.js';

let passou = 0;
let falhou = 0;

function teste(nome, fn) {
    try {
        fn();
        passou++;
        console.log(`  ok   ${nome}`);
    } catch (erro) {
        falhou++;
        console.log(`  FALHA ${nome}\n        ${erro.message}`);
    }
}

function igual(recebido, esperado, contexto = '') {
    const a = JSON.stringify(recebido);
    const b = JSON.stringify(esperado);
    if (a !== b) throw new Error(`${contexto}esperado ${b}, recebido ${a}`);
}

function verdadeiro(valor, contexto = '') {
    if (!valor) throw new Error(`${contexto}esperado verdadeiro, recebido ${JSON.stringify(valor)}`);
}

function falso(valor, contexto = '') {
    if (valor) throw new Error(`${contexto}esperado falso, recebido ${JSON.stringify(valor)}`);
}

// Regras de mentira, só para exercitar o motor.
const REGRAS = [
    {
        id: 'aas', ativo: true, classe: 'Ácido acetilsalicílico',
        termos: ['aas', 'aspirina', 'acido acetilsalicilico'],
        conduta: 'Em geral, manter', texto: 'Manter em portador de stent.',
        nivel: 'alta', contexto: 'sempre'
    },
    {
        id: 'metformina', ativo: true, classe: 'Metformina',
        termos: ['metformina', 'glifage'],
        conduta: 'Considerar suspensão no dia', texto: 'Avaliar função renal.',
        nivel: 'atencao', contexto: 'sempre'
    },
    {
        id: 'enoxaparina', ativo: true, classe: 'Enoxaparina — neuroeixo',
        termos: ['enoxaparina', 'clexane'],
        conduta: '12 h profilática / 24 h terapêutica', texto: 'Aguardar antes da punção.',
        nivel: 'alta', contexto: 'neuroeixo'
    },
    {
        id: 'dabigatrana', ativo: true, classe: 'Dabigatrana — neuroeixo',
        termos: ['dabigatrana', 'pradaxa'],
        conduta: '72–120 h conforme função renal', texto: 'Depende do ClCr.',
        nivel: 'alta', contexto: 'neuroeixo',
        clcr_faixas: [
            { ate: 30, conduta: 'Contraindica neuroeixo', texto: 'ClCr < 30 mL/min contraindica bloqueio.' },
            { ate: 50, conduta: 'Aguardar 120 h', texto: 'ClCr 30–49 mL/min: 120 horas.' },
            { ate: 80, conduta: 'Aguardar 96 h', texto: 'ClCr 50–79 mL/min: 96 horas.' },
            { ate: null, conduta: 'Aguardar 72 h', texto: 'ClCr ≥ 80 mL/min: 72 horas.' }
        ]
    },
    {
        id: 'desativada', ativo: false, classe: 'Regra desligada',
        termos: ['paracetamol'], conduta: 'X', texto: 'Y', nivel: 'atencao', contexto: 'sempre'
    }
];

console.log('\nnormalizar()');
teste('remove acento e caixa', () => igual(normalizar('Ácido AcetilSalicílico'), 'acido acetilsalicilico'));
teste('hífen vira espaço', () => igual(normalizar('erva-de-são-joão'), 'erva de sao joao'));
teste('colapsa espaços e apara', () => igual(normalizar('  AAS   100mg  '), 'aas 100mg'));
teste('aceita nulo', () => igual(normalizar(null), ''));

console.log('\ncontemTermo() — limite de palavra');
teste('casa o termo exato', () => verdadeiro(contemTermo(normalizar('AAS 100mg'), 'aas')));
teste('casa termo composto', () => verdadeiro(contemTermo(normalizar('acido acetilsalicilico 100'), 'acido acetilsalicilico')));
teste('NÃO casa por substring', () => falso(contemTermo(normalizar('Maalox'), 'aas')));
teste('NÃO casa prefixo colado', () => falso(contemTermo(normalizar('metformineitor'), 'metformina')));
teste('casa termo após pontuação', () => verdadeiro(contemTermo(normalizar('Glifage (metformina)'), 'metformina')));

console.log('\nplanoTemNeuroeixo()');
teste('detecta raquianestesia', () => verdadeiro(planoTemNeuroeixo('Raquianestesia')));
teste('detecta em lista composta', () => verdadeiro(planoTemNeuroeixo('Geral, Bloqueio')));
teste('geral isolada não é neuroeixo', () => falso(planoTemNeuroeixo('Geral')));
teste('vazio não é neuroeixo', () => falso(planoTemNeuroeixo('')));

console.log('\ncondutaEhManutencao()');
teste('"Manter" é manutenção', () => verdadeiro(condutaEhManutencao('Manter')));
teste('"Em geral, manter" é manutenção', () => verdadeiro(condutaEhManutencao('Em geral, manter')));
teste('"Pode ser mantida" é manutenção', () => verdadeiro(condutaEhManutencao('Pode ser mantida')));
teste('"Manter até o dia da cirurgia" é manutenção', () => verdadeiro(condutaEhManutencao('Manter até o dia da cirurgia')));
teste('"Suspender no dia" não é manutenção', () => falso(condutaEhManutencao('Suspender no dia')));
teste('"Manter à noite; reduzir 50%" — texto misto conta como manutenção', () => verdadeiro(condutaEhManutencao('Manter à noite; reduzir 50% pela manhã')));
teste('suspensão vence quando as duas palavras aparecem', () => falso(condutaEhManutencao('Manter em geral, mas considerar suspender')));
teste('vazio não é manutenção', () => falso(condutaEhManutencao('')));

console.log('\ncalcularClCr() — Cockcroft-Gault');
// (140-60)*70 / (72*1,0) = 77,8 -> 78
teste('homem 60a 70kg creat 1,0', () => igual(calcularClCr({ idade: 60, peso: 70, creatinina: 1.0, sexo: 'Masculino' }), 78));
// mesmo caso x0,85 = 66,1 -> 66
teste('mulher aplica fator 0,85', () => igual(calcularClCr({ idade: 60, peso: 70, creatinina: 1.0, sexo: 'Feminino' }), 66));
teste('aceita vírgula decimal', () => igual(calcularClCr({ idade: 60, peso: 70, creatinina: '1,0', sexo: 'M' }), 78));
teste('sem creatinina retorna null', () => igual(calcularClCr({ idade: 60, peso: 70, creatinina: '', sexo: 'M' }), null));
teste('creatinina zero retorna null', () => igual(calcularClCr({ idade: 60, peso: 70, creatinina: 0, sexo: 'M' }), null));
teste('idade absurda retorna null', () => igual(calcularClCr({ idade: 999, peso: 70, creatinina: 1, sexo: 'M' }), null));

console.log('\navaliarMedicamento()');
teste('casa a regra certa', () => {
    const { alertas } = avaliarMedicamento({ nome: 'AAS' }, REGRAS);
    igual(alertas.map(a => a.regraId), ['aas']);
});
teste('nome vazio não gera alerta', () => {
    const { alertas } = avaliarMedicamento({ nome: '' }, REGRAS);
    igual(alertas, []);
});
teste('regra inativa é ignorada', () => {
    const { alertas } = avaliarMedicamento({ nome: 'paracetamol' }, REGRAS);
    igual(alertas, []);
});
teste('regra de neuroeixo fica oculta em anestesia geral', () => {
    const r = avaliarMedicamento({ nome: 'Clexane' }, REGRAS, { temNeuroeixo: false });
    igual(r.alertas, []);
    igual(r.ocultosPorContexto.map(a => a.regraId), ['enoxaparina']);
});
teste('regra de neuroeixo aparece quando há punção', () => {
    const r = avaliarMedicamento({ nome: 'Clexane' }, REGRAS, { temNeuroeixo: true });
    igual(r.alertas.map(a => a.regraId), ['enoxaparina']);
    igual(r.ocultosPorContexto, []);
});
teste('dose e frequência não geram alerta', () => {
    const { alertas } = avaliarMedicamento({ nome: 'Losartana', dose: 'aas 100mg', frequencia: 'metformina' }, REGRAS);
    igual(alertas, []);
});
teste('alerta grave vem antes do de atenção', () => {
    const regras = [
        { id: 'b', ativo: true, classe: 'B', termos: ['x'], conduta: 'c', texto: 't', nivel: 'atencao' },
        { id: 'a', ativo: true, classe: 'A', termos: ['x'], conduta: 'c', texto: 't', nivel: 'alta' }
    ];
    const { alertas } = avaliarMedicamento({ nome: 'x' }, regras);
    igual(alertas.map(a => a.nivel), ['alta', 'atencao']);
});

console.log('\navaliarMedicamento() — faixas de ClCr');
teste('ClCr 90 usa a faixa aberta', () => {
    const { alertas } = avaliarMedicamento({ nome: 'Pradaxa' }, REGRAS, { temNeuroeixo: true, clcr: 90 });
    igual(alertas[0].conduta, 'Aguardar 72 h');
});
teste('ClCr 60 usa 96 h', () => {
    const { alertas } = avaliarMedicamento({ nome: 'Pradaxa' }, REGRAS, { temNeuroeixo: true, clcr: 60 });
    igual(alertas[0].conduta, 'Aguardar 96 h');
});
teste('ClCr 40 usa 120 h', () => {
    const { alertas } = avaliarMedicamento({ nome: 'Pradaxa' }, REGRAS, { temNeuroeixo: true, clcr: 40 });
    igual(alertas[0].conduta, 'Aguardar 120 h');
});
teste('ClCr 20 contraindica', () => {
    const { alertas } = avaliarMedicamento({ nome: 'Pradaxa' }, REGRAS, { temNeuroeixo: true, clcr: 20 });
    igual(alertas[0].conduta, 'Contraindica neuroeixo');
});
teste('limite exato 30 cai na faixa de cima', () => {
    const { alertas } = avaliarMedicamento({ nome: 'Pradaxa' }, REGRAS, { temNeuroeixo: true, clcr: 30 });
    igual(alertas[0].conduta, 'Aguardar 120 h');
});
teste('sem ClCr mantém conduta genérica e pede o dado', () => {
    const { alertas } = avaliarMedicamento({ nome: 'Pradaxa' }, REGRAS, { temNeuroeixo: true, clcr: null });
    igual(alertas[0].conduta, '72–120 h conforme função renal');
    verdadeiro(alertas[0].detalheClCr.includes('Informe creatinina'));
});

console.log('\navaliarMedicamentos() — lista');
teste('cada alerta fica preso à sua linha', () => {
    const meds = [{ nome: 'metformina' }, { nome: 'aas' }, { nome: 'losartana' }];
    const r = avaliarMedicamentos(meds, REGRAS);
    igual(r.linhas[0].alertas.map(a => a.regraId), ['metformina']);
    igual(r.linhas[1].alertas.map(a => a.regraId), ['aas']);
    igual(r.linhas[2].alertas, []);
    igual(r.totalAlertas, 2);
    igual(r.totalAltos, 1);
});
teste('conta os ocultos por contexto', () => {
    const r = avaliarMedicamentos([{ nome: 'clexane' }], REGRAS, { temNeuroeixo: false });
    igual(r.totalAlertas, 0);
    igual(r.totalOcultos, 1);
});
teste('lista vazia não quebra', () => {
    const r = avaliarMedicamentos([], REGRAS);
    igual(r.totalAlertas, 0);
});
teste('sem regras não quebra', () => {
    const r = avaliarMedicamentos([{ nome: 'aas' }], null);
    igual(r.totalAlertas, 0);
});

console.log('\nstatusDoExame() — exame normal / com alterações');
const PADRAO_ACV = 'Ritmo cardíaco regular, bulhas normofonéticas em dois tempos, sem sopros audíveis.';
teste('campo vazio não tem estado', () => igual(statusDoExame('', PADRAO_ACV), ''));
teste('só espaços não tem estado', () => igual(statusDoExame('   ', PADRAO_ACV), ''));
teste('texto igual ao padrão é normal', () => igual(statusDoExame(PADRAO_ACV, PADRAO_ACV), 'normal'));
teste('diferença de acento/caixa ainda é normal', () => {
    igual(statusDoExame(PADRAO_ACV.toUpperCase(), PADRAO_ACV), 'normal');
});
teste('texto livre é alterado', () => igual(statusDoExame('Sopro sistólico em foco aórtico.', PADRAO_ACV), 'alterado'));
teste('APA antiga com texto próprio abre como alterado', () => {
    igual(statusDoExame('RCR 2T BNF sem sopros', PADRAO_ACV), 'alterado');
});
teste('padrão trocado depois faz a APA antiga virar alterado', () => {
    igual(statusDoExame(PADRAO_ACV, 'Outro laudo padrão qualquer.'), 'alterado');
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
