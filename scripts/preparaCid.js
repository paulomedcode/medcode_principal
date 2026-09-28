import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.join(__dirname, '../CID-10-SUBCATEGORIAS.CSV');
const outPath = path.join(__dirname, '../src/utils/cid10.json');

try {
    // Check if CSV exists
    if (!fs.existsSync(csvPath)) {
        console.error('Arquivo CSV não encontrado em:', csvPath);
        // We will create an empty array JSON just to not break the build if CSV is missing
        const utilsDir = path.dirname(outPath);
        if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify([]), 'utf8');
        process.exit(1);
    }

    // Ler como latin1 (ISO-8859-1) para preservar acentos do Datasus
    const fileContent = fs.readFileSync(csvPath, 'latin1');
    const lines = fileContent.split('\n');

    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(';');
        if (cols.length >= 5) {
            let subcat = cols[0].trim();
            let descricao = cols[4].trim();

            // Format do SUBCAT: Inserir ponto no 4º caractere, se aplicável
            // Ex: A000 -> A00.0
            if (subcat.length === 4) {
                subcat = subcat.substring(0, 3) + '.' + subcat.substring(3);
            }

            result.push({
                c: subcat,
                d: descricao
            });
        }
    }

    // Garantir que a pasta exista
    const utilsDir = path.dirname(outPath);
    if (!fs.existsSync(utilsDir)) {
        fs.mkdirSync(utilsDir, { recursive: true });
    }

    // Salvar JSON
    fs.writeFileSync(outPath, JSON.stringify(result), 'utf8');
    console.log(`Sucesso: ${result.length} códigos processados e salvos em ${outPath}`);

} catch (error) {
    console.error('Erro ao processar CID-10:', error);
}
