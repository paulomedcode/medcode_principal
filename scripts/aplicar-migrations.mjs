/**
 * Aplica no banco as migrations de supabase/migrations/ que ainda não rodaram.
 *
 * Faz o mesmo que `supabase db push`, mas pela Management API — só com o
 * token de acesso, sem a senha do banco. Cada arquivo roda numa requisição
 * (uma transação: se falhar, nada dele fica pela metade) e, dando certo, a
 * versão é registrada em `supabase_migrations.schema_migrations`, a mesma
 * tabela que o CLI usa. Os dois caminhos continuam compatíveis.
 *
 * Para no primeiro erro, na ordem dos arquivos: migration seguinte pode
 * depender da que falhou.
 *
 * USO
 *   set -a && . ~/.medcode-secrets.env && set +a
 *   node scripts/aplicar-migrations.mjs            # aplica o que falta
 *   node scripts/aplicar-migrations.mjs --conferir # só lista o que falta
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

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
    const texto = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${texto.slice(0, 1500)}`);
    return texto ? JSON.parse(texto) : null;
};

const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;

await sql(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);

const aplicadas = new Set((await sql('select version from supabase_migrations.schema_migrations')).map((l) => l.version));
const arquivos = (await fs.readdir(PASTA)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const pendentes = arquivos.filter((f) => !aplicadas.has(f.split('_')[0]));

if (!pendentes.length) {
    console.log(`Banco em dia: ${arquivos.length} migrations, nenhuma pendente.`);
    process.exit(0);
}
if (process.argv.includes('--conferir')) {
    console.log(`Pendentes (${pendentes.length}):\n  ${pendentes.join('\n  ')}`);
    process.exit(0);
}

for (const arquivo of pendentes) {
    const [versao, ...resto] = arquivo.replace(/\.sql$/, '').split('_');
    const nome = resto.join('_');
    try {
        await sql(await fs.readFile(path.join(PASTA, arquivo), 'utf8'));
    } catch (e) {
        console.error(`FALHOU ${arquivo}\n${e.message}`);
        process.exit(1);
    }
    await sql(`insert into supabase_migrations.schema_migrations (version, name, statements)
               values (${literal(versao)}, ${literal(nome)}, array[]::text[]) on conflict do nothing`);
    console.log(`ok ${arquivo}`);
}
console.log(`${pendentes.length} migration(s) aplicada(s).`);
