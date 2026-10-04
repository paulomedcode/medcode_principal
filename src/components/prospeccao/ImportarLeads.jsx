import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { CAMPOS_IMPORTACAO, soDigitos, traduzirCategoria } from '../../config/prospeccao';
import { importarLeads } from '../../services/prospeccao';
import { Janela, Campo, inputCls, textareaCls, btnPrimario, btnSecundario } from '../crm/ui';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const chaveNome = (nome, cidade) => `${norm(nome).replace(/[^a-z0-9]/g, '')}|${norm(cidade)}`;

/** "4,7" → 4.7 ; "1.234 avaliações" → 1234 */
const numero = (v, inteiro) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return inteiro ? Math.round(v) : v;
    const s = String(v).trim();
    const n = inteiro ? Number(s.replace(/\D/g, '')) : Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && s.match(/\d/) ? n : null;
};

/** Tenta tirar "Cidade - UF" do endereço do Google ("Rua X, 10 - Centro, Sorocaba - SP, 18000-000"). */
const cidadeDoEndereco = (end) => {
    const achados = [...String(end || '').matchAll(/,\s*([^,]+?)\s*-\s*([A-Z]{2})\b/g)];
    const m = achados[achados.length - 1];
    return m ? { cidade: m[1].trim(), uf: m[2] } : {};
};

/** Coluna da planilha que mais parece com cada campo. */
const mapearAutomatico = (cabecalho) => {
    const usado = new Set();
    const mapa = {};
    for (const campo of CAMPOS_IMPORTACAO) {
        const idx = cabecalho.findIndex((h, i) => !usado.has(i) && campo.apelidos.includes(norm(h)));
        if (idx >= 0) { mapa[campo.id] = idx; usado.add(idx); }
    }
    // Segunda passada: nome de coluna que CONTÉM o apelido ("Telefone 1", "website_url").
    for (const campo of CAMPOS_IMPORTACAO) {
        if (mapa[campo.id] != null) continue;
        const idx = cabecalho.findIndex((h, i) => !usado.has(i) && campo.apelidos.some((a) => a.length > 3 && norm(h).includes(a)));
        if (idx >= 0) { mapa[campo.id] = idx; usado.add(idx); }
    }
    return mapa;
};

export default function ImportarLeads({ existentes, onClose, onImportados }) {
    const [tabela, setTabela] = useState(null);      // { nomeArquivo, cabecalho, linhas }
    const [mapa, setMapa] = useState({});
    const [origem, setOrigem] = useState('Google Maps');
    const [pularDuplicados, setPularDuplicados] = useState(true);
    const [colado, setColado] = useState('');
    const [enviando, setEnviando] = useState(null);  // progresso

    const carregarPlanilha = (wb, nomeArquivo) => {
        const ws = wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
            .filter((l) => l.some((c) => String(c).trim() !== ''));
        if (linhas.length < 2) { toast.error('A planilha precisa de uma linha de títulos e ao menos um lead.'); return; }
        const cabecalho = linhas[0].map((h, i) => String(h || `Coluna ${i + 1}`).trim());
        setTabela({ nomeArquivo, cabecalho, linhas: linhas.slice(1) });
        setMapa(mapearAutomatico(cabecalho));
    };

    const lerArquivo = async (arquivo) => {
        if (!arquivo) return;
        try {
            const buf = await arquivo.arrayBuffer();
            if (/\.(csv|tsv|txt)$/i.test(arquivo.name)) {
                // CSV: o leitor da planilha assume Windows-1252 e transformava
                // "Clínica" em "ClÃ­nica". Decodifica como UTF-8 (o que os
                // extratores e o Google Planilhas geram) e só cai para
                // Windows-1252 se o arquivo não for UTF-8 válido. Também sem
                // adivinhar tipo: "4,8" não pode virar 48.
                let texto;
                try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
                catch { texto = new TextDecoder('windows-1252').decode(buf); }
                carregarPlanilha(XLSX.read(texto.replace(/^\uFEFF/, ''), { type: 'string', raw: true }), arquivo.name);
            } else {
                carregarPlanilha(XLSX.read(buf, { type: 'array' }), arquivo.name);
            }
        } catch (e) { console.error(e); toast.error('Não consegui ler esse arquivo.'); }
    };

    const lerColado = () => {
        try { carregarPlanilha(XLSX.read(colado, { type: 'string', raw: true }), 'Colado'); }
        catch (e) { console.error(e); toast.error('Não consegui ler o texto colado.'); }
    };

    // Linhas já no formato do banco, com a marcação de duplicado.
    const preparado = useMemo(() => {
        if (!tabela) return null;
        const fones = new Set(existentes.map((l) => soDigitos(l.telefone).slice(-8)).filter((f) => f.length === 8));
        const nomes = new Set(existentes.map((l) => chaveNome(l.nome, l.cidade)));
        const mapeadas = new Set(Object.values(mapa));
        const r = { novos: [], duplicados: 0, semNome: 0 };
        for (const linha of tabela.linhas) {
            const val = (campo) => (mapa[campo] == null ? '' : String(linha[mapa[campo]] ?? '').trim());
            const nome = val('nome');
            if (!nome) { r.semNome++; continue; }
            const doEnd = val('cidade') ? {} : cidadeDoEndereco(val('endereco'));
            const lead = {
                nome,
                categoria: traduzirCategoria(val('categoria')) || null,
                telefone: val('telefone') || null,
                email: val('email') || null,
                site: val('site') || null,
                instagram: val('instagram') || null,
                endereco: val('endereco') || null,
                cidade: val('cidade') || doEnd.cidade || null,
                uf: (val('uf') || doEnd.uf || '').toUpperCase().slice(0, 2) || null,
                maps_url: val('maps_url') || null,
                nota_google: (() => { const n = numero(val('nota_google')); return n != null && n >= 0 && n <= 5 ? n : null; })(),
                avaliacoes: numero(val('avaliacoes'), true),
                notas: val('notas') || null,
                origem: origem.trim() || null,
                extras: Object.fromEntries(tabela.cabecalho
                    .map((h, i) => [h, linha[i]])
                    .filter(([, v], i) => !mapeadas.has(i) && String(v ?? '').trim() !== '')
                    .map(([h, v]) => [h, String(v)])),
            };
            const fone = soDigitos(lead.telefone).slice(-8);
            const kNome = chaveNome(lead.nome, lead.cidade);
            const dup = (fone.length === 8 && fones.has(fone)) || nomes.has(kNome);
            if (dup && pularDuplicados) { r.duplicados++; continue; }
            if (fone.length === 8) fones.add(fone);
            nomes.add(kNome);
            r.novos.push(lead);
        }
        return r;
    }, [tabela, mapa, origem, pularDuplicados, existentes]);

    const importar = async () => {
        if (!preparado?.novos.length) return;
        setEnviando(0);
        try {
            const criados = await importarLeads(preparado.novos, setEnviando);
            toast.success(`${criados.length} lead(s) importado(s).`);
            onImportados(criados);
        } catch (e) {
            console.error(e);
            toast.error(e.code === '42501' ? 'Sem permissão para importar.' : 'Erro ao importar. Nada além do que já foi salvo entrou.');
            setEnviando(null);
        }
    };

    const rodape = tabela ? (<>
        <button onClick={() => setTabela(null)} className={btnSecundario} disabled={enviando != null}>Trocar arquivo</button>
        <button onClick={importar} disabled={!preparado?.novos.length || enviando != null || mapa.nome == null} className={btnPrimario}>
            {enviando != null ? <><Loader2 size={14} className="animate-spin" /> {enviando}/{preparado.novos.length}</> : <><Check size={14} /> Importar {preparado?.novos.length || 0}</>}
        </button>
    </>) : null;

    return (
        <Janela titulo="Importar leads" icone={Upload} onClose={enviando != null ? undefined : onClose} rodape={rodape} largura="max-w-3xl">
            {!tabela ? (<>
                <label className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-black/[.12] rounded-2xl bg-white cursor-pointer hover:border-[#0071e3] transition-colors"
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); lerArquivo(e.dataTransfer.files?.[0]); }}>
                    <FileSpreadsheet size={30} className="text-[#0071e3]" />
                    <span className="text-sm font-bold text-slate-700">Escolha ou arraste a planilha</span>
                    <span className="text-[11px] font-semibold text-slate-400">CSV, XLSX ou XLS — a primeira linha deve ter os títulos das colunas</span>
                    <input type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" className="hidden" onChange={(e) => lerArquivo(e.target.files?.[0])} />
                </label>
                <Campo label="Ou cole aqui (copiado do Excel / Google Planilhas, com os títulos)">
                    <textarea rows={5} value={colado} onChange={(e) => setColado(e.target.value)} className={textareaCls}
                        placeholder={'Nome\tTelefone\tCategoria\tCidade\nClínica Exemplo\t(11) 99999-0000\tDentista\tSão Paulo'} />
                </Campo>
                <div className="flex justify-end">
                    <button onClick={lerColado} disabled={!colado.trim()} className={btnPrimario}>Ler texto colado</button>
                </div>
            </>) : (<>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                    <span className="px-2 py-1 rounded-lg bg-white border border-black/[.085] text-slate-600">{tabela.nomeArquivo}: {tabela.linhas.length} linha(s)</span>
                    <span className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">{preparado.novos.length} para importar</span>
                    {preparado.duplicados > 0 && <span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">{preparado.duplicados} já existem</span>}
                    {preparado.semNome > 0 && <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500">{preparado.semNome} sem nome (ignoradas)</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Campo label="Origem (de onde vieram)">
                        <input value={origem} onChange={(e) => setOrigem(e.target.value)} className={inputCls} placeholder="Google Maps, Instagram, indicação…" />
                    </Campo>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 sm:mt-5">
                        <input type="checkbox" checked={pularDuplicados} onChange={(e) => setPularDuplicados(e.target.checked)} />
                        Pular quem já está na lista (mesmo telefone ou mesmo nome na mesma cidade)
                    </label>
                </div>

                <div className="bg-white border border-black/[.085] rounded-2xl p-3">
                    <p className="text-[11.5px] font-medium text-slate-500 mb-2">Qual coluna vai em cada campo</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {CAMPOS_IMPORTACAO.map((c) => (
                            <Campo key={c.id} label={c.label + (c.id === 'nome' ? ' *' : '')}>
                                <select value={mapa[c.id] ?? ''} className={inputCls}
                                    onChange={(e) => setMapa((m) => ({ ...m, [c.id]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                                    <option value="">— não importar —</option>
                                    {tabela.cabecalho.map((h, i) => <option key={i} value={i}>{h}</option>)}
                                </select>
                            </Campo>
                        ))}
                    </div>
                    <p className="text-[10.5px] font-semibold text-slate-400 mt-2">As colunas que sobrarem ficam guardadas na ficha do lead, em “Outros dados”.</p>
                </div>

                {preparado.novos.length > 0 && (
                    <div className="bg-white border border-black/[.085] rounded-2xl overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead>
                                <tr className="text-[11px] font-medium text-slate-400 border-b border-black/[.06]">
                                    <th className="py-2 px-3">Nome</th><th className="py-2 px-3">Categoria</th><th className="py-2 px-3">Telefone</th>
                                    <th className="py-2 px-3">Cidade</th><th className="py-2 px-3">Nota</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/[.05]">
                                {preparado.novos.slice(0, 5).map((l, i) => (
                                    <tr key={i} className="font-semibold text-slate-600">
                                        <td className="py-1.5 px-3 font-bold text-slate-800">{l.nome}</td>
                                        <td className="py-1.5 px-3">{l.categoria || '—'}</td>
                                        <td className="py-1.5 px-3">{l.telefone || '—'}</td>
                                        <td className="py-1.5 px-3">{[l.cidade, l.uf].filter(Boolean).join('/') || '—'}</td>
                                        <td className="py-1.5 px-3">{l.nota_google ?? '—'}{l.avaliacoes != null && ` (${l.avaliacoes})`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {preparado.novos.length > 5 && <p className="px-3 py-2 text-[10.5px] font-semibold text-slate-400">… e mais {preparado.novos.length - 5}</p>}
                    </div>
                )}
            </>)}
        </Janela>
    );
}
