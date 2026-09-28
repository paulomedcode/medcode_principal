#!/usr/bin/env node
/*
 * Faxina do Storage: encontra arquivo que ninguém usa e, se mandarem, apaga —
 * depois de baixar uma cópia.
 *
 * POR QUE ISSO EXISTE
 * Remover um anexo na tela apenas DESVINCULA o arquivo do lançamento, de
 * propósito: parcelas e rateios podem apontar para o mesmo arquivo, e apagar de
 * verdade quebraria os irmãos. O efeito colateral é que arquivo desvinculado —
 * e upload feito num lançamento que ninguém chegou a salvar — fica no bucket
 * para sempre. Storage é cota compartilhada e não tem faxina automática.
 *
 * COMO ELE DECIDE
 * Monta um "corpus" com todo texto do banco que pode citar arquivo (anexos do
 * financeiro, arquivos da cirurgia, link da agenda, exame da APA, logos em
 * settings/unidades/users, conteúdo das páginas do Compromisso) e procura o
 * nome de cada objeto lá dentro. O que não aparece em lugar nenhum é órfão.
 * Vale tanto para o formato antigo (URL pública gravada) quanto para o novo
 * (caminho gravado): a URL contém o caminho.
 *
 * A REDE DE SEGURANÇA
 *   - só apaga o que tem mais de N dias (padrão 7), porque upload recente pode
 *     ser de um formulário ainda aberto na tela de alguém;
 *   - baixa cada arquivo antes de apagar e confere o tamanho — se a cópia não
 *     bateu, não apaga;
 *   - sem `--apagar` ele só relata.
 *
 * USO
 *   set -a && . ~/.medcode-secrets.env && set +a
 *   node scripts/faxina-storage.mjs                          # só relatório
 *   node scripts/faxina-storage.mjs --apagar --dias=7        # faxina de verdade
 *   node scripts/faxina-storage.mjs --apagar --bucket=logos  # um bucket só
 *
 * Variáveis: SUPABASE_ACCESS_TOKEN (Management API) e SUPABASE_PROJECT_REF
 * (obrigatório). A chave service_role é buscada pela Management API.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!REF) {
    console.error('Falta SUPABASE_PROJECT_REF (ref do projeto Supabase do MedCode).');
    process.exit(2);
}
const args = process.argv.slice(2);
const temFlag = (f) => args.includes(f);
const valorDe = (nome, padrao) => {
    const achado = args.find(a => a.startsWith(`--${nome}=`));
    return achado ? achado.split('=')[1] : padrao;
};

const APAGAR = temFlag('--apagar');
const DIAS = parseInt(valorDe('dias', '7'), 10);
const SO_BUCKET = valorDe('bucket', null);

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

// As colunas que podem citar um arquivo. Mexeu no schema? Revisar esta lista —
// uma tabela esquecida aqui vira "órfão" que não é órfão.
const CORPUS = `
    select data::text                                  as t from public.settings
    union all select coalesce(attachments::text, '')         from public.finance_transactions
    union all select coalesce(row_to_json(s)::text, '')       from public.surgeries s
    union all select coalesce(link_anexo, '')                 from public.consultas
    union all select coalesce(exames_url, '')                 from public.apas
    union all select coalesce(row_to_json(u)::text, '')       from public.unidades u
    union all select coalesce(row_to_json(x)::text, '')       from public.users x
    union all select coalesce(content::text, '')              from public.workspace_pages
    union all select coalesce(value::text, '')                from public.workspace_db_values
`;

const kb = (bytes) => `${Math.round(bytes / 1024)} kB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
    console.log(`Projeto ${REF} — ${APAGAR ? 'FAXINA (vai apagar)' : 'apenas relatório'}, corte de ${DIAS} dias\n`);

    const orfaos = await sql(`
        with corpus as (select string_agg(t, ' ') as texto from (${CORPUS}) as tudo(t))
        select o.bucket_id, o.name,
               (o.metadata->>'size')::bigint as bytes,
               to_char(o.created_at, 'YYYY-MM-DD') as criado,
               (now() - o.created_at > interval '${DIAS} days') as maduro
          from storage.objects o cross join corpus c
         where position(o.name in c.texto) = 0
           ${SO_BUCKET ? `and o.bucket_id = '${SO_BUCKET}'` : ''}
         order by o.bucket_id, (o.metadata->>'size')::bigint desc;
    `);

    if (!orfaos.length) { console.log('Nenhum órfão. Nada a fazer.'); return; }

    const total = orfaos.reduce((s, o) => s + Number(o.bytes), 0);
    const maduros = orfaos.filter(o => o.maduro);
    const novos = orfaos.filter(o => !o.maduro);

    for (const o of orfaos) {
        console.log(`  ${o.maduro ? ' ' : '~'} ${o.bucket_id.padEnd(14)}${kb(o.bytes).padStart(9)}  ${o.criado}  ${o.name}`);
    }
    console.log(`\n${orfaos.length} órfãos, ${mb(total)}.`);
    if (novos.length) console.log(`${novos.length} marcados com ~ têm menos de ${DIAS} dias e ficam onde estão.`);

    if (!APAGAR) {
        console.log('\nRelatório apenas. Para apagar (com cópia local antes): --apagar');
        return;
    }

    // A chave service_role é a única que enxerga bucket privado sem sessão.
    const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
    })).json();
    const service = chaves.find(k => k.name === 'service_role')?.api_key;
    if (!service) throw new Error('Não consegui a chave service_role.');

    const pasta = path.join(os.homedir(), 'Backups',
        `medcode-storage-orfaos-${new Date().toISOString().slice(0, 10)}`);
    await fs.mkdir(pasta, { recursive: true });
    console.log(`\nCópia de segurança em ${pasta}\n`);

    let apagados = 0, liberado = 0, falhas = 0;
    for (const o of maduros) {
        const url = `https://${REF}.supabase.co/storage/v1/object/${o.bucket_id}/${encodeURI(o.name)}`;
        try {
            const resp = await fetch(url, { headers: { Authorization: `Bearer ${service}`, apikey: service } });
            if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
            const bytes = Buffer.from(await resp.arrayBuffer());
            if (bytes.length !== Number(o.bytes)) {
                throw new Error(`cópia com ${bytes.length} bytes, esperado ${o.bytes}`);
            }
            const destino = path.join(pasta, o.bucket_id, o.name);
            await fs.mkdir(path.dirname(destino), { recursive: true });
            await fs.writeFile(destino, bytes);

            const del = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${service}`, apikey: service },
            });
            if (!del.ok) throw new Error(`delete HTTP ${del.status}`);

            apagados++; liberado += Number(o.bytes);
            console.log(`  apagado  ${o.bucket_id}/${o.name}`);
        } catch (e) {
            falhas++;
            console.log(`  FALHOU   ${o.bucket_id}/${o.name} — ${e.message}`);
        }
    }
    console.log(`\n${apagados} apagados, ${mb(liberado)} liberados${falhas ? `, ${falhas} falharam (não foram apagados)` : ''}.`);
    console.log(`As cópias ficam em ${pasta} — confira antes de jogar fora.`);
}

main().catch(e => { console.error(e); process.exit(1); });
