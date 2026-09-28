import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function importarCsv() {
    console.log('🚜 Ligando o trator... Começando a leitura do CSV');

    const filePath = '/Users/paulo/Library/Mobile Documents/com~apple~CloudDocs/Automações/Arquivos importantes/tabela_procedimentos_sigtap_filtrada.csv';
    const text = fs.readFileSync(filePath, 'utf-8');
    const linhas = text.split('\n');

    let lote = [];
    let count = 0;

    for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i].trim();
        if (!linha) continue;

        const partes = linha.split(',');
        if (partes.length >= 2) {
            const codigo = partes[0].trim().replace(/['"]/g, '');
            const nome = partes.slice(1).join(',').trim().replace(/['"]/g, '').toUpperCase();

            lote.push({ codigo, nome });

            if (lote.length >= 500) {
                const { error } = await supabase.from('sigtap').upsert(lote, { onConflict: 'codigo' });
                if (error) console.error('Erro no lote:', error.message);
                else {
                    count += lote.length;
                    console.log(`✅ Já enviei ${count} procedimentos pro banco...`);
                }
                lote = [];
            }
        }
    }

    if (lote.length > 0) {
        const { error } = await supabase.from('sigtap').upsert(lote, { onConflict: 'codigo' });
        if (error) console.error('Erro no lote final:', error.message);
        else count += lote.length;
    }

    console.log(`🏁 FIM! Um total de ${count} procedimentos (SIGTAP) foram importados.`);
}

importarCsv();
