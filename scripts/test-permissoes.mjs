/**
 * Testes da regra de acesso.
 * Rodar com:  node scripts/test-permissoes.mjs
 */
import { concede, podeAcessar, chaveDeAcessoDe } from '../src/utils/permissoes.js';

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
    if (JSON.stringify(recebido) !== JSON.stringify(esperado)) {
        throw new Error(`${contexto}esperado ${JSON.stringify(esperado)}, recebido ${JSON.stringify(recebido)}`);
    }
}
const verdadeiro = (v, c = '') => { if (!v) throw new Error(`${c}esperado verdadeiro`); };
const falso = (v, c = '') => { if (v) throw new Error(`${c}esperado falso`); };

console.log('\nchaveDeAcessoDe()');
teste('permissão fina aponta para a porta do módulo', () => {
    igual(chaveDeAcessoDe('Excluir Páginas Compromisso'), 'Acessar Compromissos');
});
teste('a própria porta aponta para si mesma', () => {
    igual(chaveDeAcessoDe('Acessar Compromissos'), 'Acessar Compromissos');
});
teste('permissão fora do catálogo não tem porta', () => {
    igual(chaveDeAcessoDe('Permissão Que Não Existe'), null);
});

console.log('\nconcede() — o caso que apareceu em produção');
teste('módulo fechado invalida a permissão fina', () => {
    // Estado de um cargo: porta fechada, permissões internas ligadas
    const medico = {
        'Acessar Compromissos': false,
        'Excluir Páginas Compromisso': true,
        'Criar Páginas Compromisso': true
    };
    falso(concede(medico, 'Excluir Páginas Compromisso'), 'não pode excluir com o módulo fechado: ');
    falso(concede(medico, 'Criar Páginas Compromisso'));
});
teste('com a porta aberta, a permissão fina vale', () => {
    const perfil = { 'Acessar Compromissos': true, 'Excluir Páginas Compromisso': true };
    verdadeiro(concede(perfil, 'Excluir Páginas Compromisso'));
});
teste('a porta em si não depende de mais nada', () => {
    verdadeiro(concede({ 'Acessar Compromissos': true }, 'Acessar Compromissos'));
});
teste('permissão desligada continua desligada', () => {
    falso(concede({ 'Acessar Compromissos': true }, 'Excluir Páginas Compromisso'));
});
teste('permissão avulsa (sem módulo) não exige porta', () => {
    verdadeiro(concede({ 'Permissão Legada': true }, 'Permissão Legada'));
});
teste('porta vinda de outra origem é aceita', () => {
    const extras = { 'Excluir Páginas Compromisso': true };
    const doCargo = { 'Acessar Compromissos': true };
    verdadeiro(concede(extras, 'Excluir Páginas Compromisso', { porta: doCargo }));
});

console.log('\npodeAcessar() — cargo, extras e Acesso Total');
const matriz = {
    'Produção': {
        'Acessar Compromissos': false,
        'Excluir Páginas Compromisso': true,
        'Acessar Financeiro': true
    },
    'Administrador': { 'Acesso Total (Admin)': true },
    'Visualizador': {}
};

teste('produção não exclui página com o módulo fechado', () => {
    falso(podeAcessar({ cargo: 'Produção', matriz, permissao: 'Excluir Páginas Compromisso' }));
});
teste('extra que abre a porta faz a permissão do cargo valer', () => {
    verdadeiro(podeAcessar({
        cargo: 'Produção', matriz,
        extras: { 'Acessar Compromissos': true },
        permissao: 'Excluir Páginas Compromisso'
    }), 'o extra abriu o módulo: ');
});
teste('extra sozinho, sem porta, não vale', () => {
    falso(podeAcessar({
        cargo: 'Visualizador', matriz,
        extras: { 'Excluir Páginas Compromisso': true },
        permissao: 'Excluir Páginas Compromisso'
    }));
});
teste('extra com porta e permissão vale', () => {
    verdadeiro(podeAcessar({
        cargo: 'Visualizador', matriz,
        extras: { 'Acessar Compromissos': true, 'Excluir Páginas Compromisso': true },
        permissao: 'Excluir Páginas Compromisso'
    }));
});
teste('Acesso Total ignora as portas', () => {
    verdadeiro(podeAcessar({ cargo: 'Administrador', matriz, permissao: 'Excluir Páginas Compromisso' }));
});
teste('Desenvolvedor mantém o passe livre', () => {
    verdadeiro(podeAcessar({ cargo: 'Desenvolvedor', matriz: {}, permissao: 'Qualquer Coisa' }));
});
teste('cargo sem nada não acessa', () => {
    falso(podeAcessar({ cargo: 'Visualizador', matriz, permissao: 'Acessar Financeiro' }));
});
teste('permissão que o cargo tem, com porta aberta, continua valendo', () => {
    // 'Acessar Financeiro' é a própria porta do módulo Financeiro
    verdadeiro(podeAcessar({ cargo: 'Produção', matriz, permissao: 'Acessar Financeiro' }));
});
teste('usuário sem cargo não quebra', () => {
    falso(podeAcessar({ matriz, permissao: 'Acessar Financeiro' }));
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou > 0 ? 1 : 0);
