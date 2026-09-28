/*
 * Traduz o catálogo de permissões (src/config/permissions.js) para as linhas da
 * tabela public.permissoes_catalogo, que é o que o banco consulta quando
 * decide, dentro de uma política de RLS, se a sessão tem uma permissão.
 *
 * Existe porque a regra de acesso passou a valer em dois lugares: na tela
 * (utils/permissoes.js) e no banco (public.tem_permissao). A regra é a mesma; o
 * que o banco não tem é o arquivo JavaScript. Em vez de reescrever a lista à
 * mão numa migration — e vê-la envelhecer em silêncio —, ela é gerada daqui.
 *
 *   node scripts/gerar-catalogo-permissoes.mjs            # imprime o SQL
 *   node scripts/gerar-catalogo-permissoes.mjs --conferir # compara com o banco
 *
 * O modo --conferir lê SUPABASE_ACCESS_TOKEN (e SUPABASE_PROJECT_REF,
 * obrigatório) e sai com código 1 se o banco divergir do catálogo — a mesma
 * convenção de scripts/checar-rls.mjs, para rodar na mão ou em CI depois de
 * mexer em permissions.js.
 */
import { PERMISSION_MODULES } from '../src/config/permissions.js';

export function linhasDoCatalogo() {
    const linhas = [];
    for (const modulo of PERMISSION_MODULES) {
        for (const perm of modulo.permissions) {
            linhas.push({
                permissao: perm.id,
                chave_acesso: modulo.accessKey || null,
                pessoal: !!modulo.pessoal,
            });
        }
    }
    return linhas.sort((a, b) => a.permissao.localeCompare(b.permissao));
}

function aspas(v) {
    return v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
}

export function sqlDoCatalogo() {
    const valores = linhasDoCatalogo()
        .map(l => `  (${aspas(l.permissao)}, ${aspas(l.chave_acesso)}, ${l.pessoal})`)
        .join(',\n');
    return [
        'delete from public.permissoes_catalogo;',
        'insert into public.permissoes_catalogo (permissao, chave_acesso, pessoal) values',
        valores + ';',
    ].join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('gerar-catalogo-permissoes.mjs')) {
    if (process.argv.includes('--conferir')) {
        const ref = process.env.SUPABASE_PROJECT_REF;
        if (!ref) {
            console.error('Falta SUPABASE_PROJECT_REF (ref do projeto Supabase do MedCode).');
            process.exit(2);
        }
        const token = process.env.SUPABASE_ACCESS_TOKEN;
        if (!token) {
            console.error('Falta SUPABASE_ACCESS_TOKEN. Rode: set -a && . ~/.medcode-secrets.env && set +a');
            process.exit(2);
        }
        const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;
        const resposta = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'select permissao, chave_acesso, pessoal from public.permissoes_catalogo order by permissao;' }),
        });
        const noBanco = await resposta.json();
        const esperado = linhasDoCatalogo();
        const chave = l => `${l.permissao}|${l.chave_acesso ?? ''}|${l.pessoal}`;
        const faltando = esperado.filter(e => !noBanco.some(b => chave(b) === chave(e)));
        const sobrando = noBanco.filter(b => !esperado.some(e => chave(e) === chave(b)));
        if (faltando.length || sobrando.length) {
            if (faltando.length) console.error('No código e não no banco:', faltando.map(l => l.permissao).join(', '));
            if (sobrando.length) console.error('No banco e não no código:', sobrando.map(l => l.permissao).join(', '));
            console.error('\nGere a correção com: node scripts/gerar-catalogo-permissoes.mjs');
            process.exit(1);
        }
        console.log(`Catálogo em dia: ${esperado.length} permissões, banco e código batem.`);
    } else {
        console.log(sqlDoCatalogo());
    }
}
