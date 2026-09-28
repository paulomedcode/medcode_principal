#!/usr/bin/env node
/*
 * A trava que impede a Fase 1 de se desfazer sozinha.
 *
 * Ligar RLS nas 52 tabelas foi um evento. Mantê-lo ligado é um hábito — e
 * hábito some: basta uma migration futura criar uma tabela e esquecer o
 * `enable row level security`. Ela nasce aberta, ninguém percebe, e o banco
 * volta a vazar por uma porta só.
 *
 * Este script pergunta ao banco três coisas, e falha se qualquer uma delas
 * estiver errada:
 *   1. existe tabela em `public` sem RLS ligado?
 *   2. existe tabela com RLS ligado e NENHUMA política? (RLS sem política nega
 *      tudo — é o erro que trava usuário, e é tão ruim quanto o contrário);
 *   3. o papel `anon` recebeu privilégio em alguma tabela?
 *
 * USO
 *   set -a && . ~/.medcode-secrets.env && set +a
 *   node scripts/checar-rls.mjs   # usa SUPABASE_PROJECT_REF do .env de segredos
 *
 * Sai com código 1 quando acha problema, para poder rodar em CI.
 */
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!REF) {
    console.error('Falta SUPABASE_PROJECT_REF (ref do projeto Supabase do MedCode).');
    process.exit(2);
}

if (!TOKEN) {
    console.error('Falta SUPABASE_ACCESS_TOKEN. Rode: set -a && . ~/.medcode-secrets.env && set +a');
    process.exit(2);
}

const sql = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    const json = await r.json();
    if (!Array.isArray(json)) throw new Error(json.message || JSON.stringify(json));
    return json;
};

const main = async () => {
    const [semRls, semPolitica, comAnon, buckets] = await Promise.all([
        sql(`select c.relname as tabela
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
              order by 1;`),
        sql(`select c.relname as tabela
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
                and not exists (select 1 from pg_policies p
                                 where p.schemaname = 'public' and p.tablename = c.relname)
              order by 1;`),
        sql(`select distinct table_name as tabela
               from information_schema.role_table_grants
              where table_schema = 'public' and grantee = 'anon'
              order by 1;`),
        sql(`select id, public from storage.buckets order by id;`),
    ]);

    let problemas = 0;
    const relatar = (titulo, linhas, comoResolver) => {
        if (!linhas.length) return;
        problemas += linhas.length;
        console.error(`\n✗ ${titulo} (${linhas.length}):`);
        for (const l of linhas) console.error(`    ${l.tabela}`);
        console.error(`  ${comoResolver}`);
    };

    relatar('Tabelas sem RLS', semRls,
        'alter table public.<tabela> enable row level security; + política para authenticated');
    relatar('Tabelas com RLS e nenhuma política (negam tudo)', semPolitica,
        'RLS sem política bloqueia até quem deveria entrar — escreva a política ou desligue o RLS');
    relatar('Tabelas com privilégio para o papel anon', comAnon,
        'revoke all on public.<tabela> from anon, public;');

    // Informativo: bucket público não é necessariamente erro (logos e workspace
    // são públicos de propósito), então avisa sem reprovar.
    const publicos = buckets.filter(b => b.public).map(b => b.id);
    const esperados = ['logos', 'workspace'];
    const inesperados = publicos.filter(b => !esperados.includes(b));
    if (inesperados.length) {
        problemas += inesperados.length;
        console.error(`\n✗ Buckets públicos fora do combinado (${inesperados.length}): ${inesperados.join(', ')}`);
        console.error("  update storage.buckets set public = false where id = '<bucket>';");
    }

    if (problemas) {
        console.error(`\n${problemas} problema(s) em ${REF}.`);
        process.exit(1);
    }
    console.log(`RLS em dia no projeto ${REF}: nenhuma tabela aberta, nenhuma tabela travada, anon sem privilégio.`);
    console.log(`Buckets públicos: ${publicos.join(', ') || 'nenhum'} (esperado).`);
};

main().catch(e => { console.error(e); process.exit(1); });
