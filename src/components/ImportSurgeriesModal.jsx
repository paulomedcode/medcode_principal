import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';
import toast from 'react-hot-toast';
import {
    X, UploadCloud, FileSpreadsheet, Loader2, CheckCircle2,
    Download, Sparkles, ChevronDown, ChevronRight, Stethoscope
} from 'lucide-react';
import {
    analyzeRow, finalizeRow, fieldNeedsDecision, buildDedupKey,
    mapHeaders, makeGetter, norm,
} from '../utils/reconcileImport';

const ENUM_LABELS = {
    cirurgiao: 'Cirurgião', procedimento: 'Procedimento', especialidade: 'Especialidade',
    anestesia: 'Anestesia', convenio: 'Convênio', prioridade: 'Prioridade', status: 'Status',
};

export default function ImportSurgeriesModal({ open, onClose, settings, medicos, existingSurgeries, unidadeAtual, onImported }) {
    const fileRef = useRef(null);
    const [fileName, setFileName] = useState('');
    const [parsing, setParsing] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [analyses, setAnalyses] = useState([]);
    const [decisions, setDecisions] = useState({});   // { [linha]: { campo: valor } }
    const [expanded, setExpanded] = useState(() => new Set());
    const [sigtap, setSigtap] = useState([]);
    const [loadingSigtap, setLoadingSigtap] = useState(false);

    const lists = useMemo(() => ({
        status: settings?.status || [],
        convenio: settings?.convenios || [],
        anestesia: settings?.anestesias || [],
        prioridade: settings?.prioridades || [],
        especialidade: settings?.especialidades || [],
        sala: settings?.salas || [],
    }), [settings]);

    // carrega o catálogo SIGTAP uma vez (para reconciliar procedimento)
    useEffect(() => {
        if (!open || sigtap.length) return;
        (async () => {
            setLoadingSigtap(true);
            const { data, error } = await supabase.from('sigtap').select('codigo,nome').limit(20000);
            if (!error && data) setSigtap(data);
            setLoadingSigtap(false);
        })();
    }, [open]); // eslint-disable-line

    const reset = () => { setAnalyses([]); setDecisions({}); setExpanded(new Set()); setFileName(''); if (fileRef.current) fileRef.current.value = ''; };
    const handleClose = () => { if (committing) return; reset(); onClose(); };

    function baixarModelo() {
        try {
            const headers = [
                'nomePaciente', 'cpf', 'cns', 'nascimento', 'telefone1', 'telefone2', 'municipio',
                'cirurgiao', 'especialidade', 'procedimento', 'anestesia', 'convenio', 'prioridade', 'sala',
                'dataAtendimento', 'dataAutorizacao', 'dataAgendado', 'horario',
                'aih', 'autorizada', 'apa', 'opme', 'status', 'observacoes', 'unidade', 'duracao',
            ];
            const cir = (medicos || []).map(m => m.name).filter(Boolean);
            const exemplo = [
                'MARIA APARECIDA DE SOUZA', '12345678901', '', '1970-05-12', '(15) 99999-0000', '', 'SÃO PAULO',
                (cir[0] || ''), (lists.especialidade[0] || ''), 'HERNIOPLASTIA INGUINAL', (lists.anestesia[0] || ''),
                (lists.convenio[0] || 'SUS'), (lists.prioridade[0] || 'ELETIVA'), '',
                '2026-06-20', '', '', '08:30', 'NAO', 'NAO', 'NAO', 'NAO',
                (lists.status.find(s => norm(s) === 'aguardando') || lists.status[0] || 'AGUARDANDO'), '', '', '60',
            ];
            const cols = [
                ['status', lists.status], ['especialidade', lists.especialidade], ['anestesia', lists.anestesia],
                ['convenio', lists.convenio], ['prioridade', lists.prioridade], ['aih/autorizada/apa/opme', ['SIM', 'NAO']],
                ['cirurgiao', cir],
            ];
            const maxLen = Math.max(...cols.map(c => c[1].length), 1);
            const aoa = [cols.map(c => c[0])];
            for (let i = 0; i < maxLen; i++) aoa.push(cols.map(c => c[1][i] ?? ''));
            const wb = XLSX.utils.book_new();
            const wsd = XLSX.utils.aoa_to_sheet([headers, exemplo]);
            wsd['!cols'] = headers.map(h => ({ wch: Math.max(13, Math.min(26, h.length + 4)) }));
            XLSX.utils.book_append_sheet(wb, wsd, 'Dados');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Valores válidos');
            const uni = String(unidadeAtual || 'fila').replace(/[^\w]+/g, '_').toLowerCase();
            XLSX.writeFile(wb, `modelo_importacao_fila_${uni}.xlsx`);
            toast.success('Modelo baixado.');
        } catch (e) { console.error(e); toast.error('Erro ao gerar o modelo.'); }
    }

    async function handleFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setParsing(true); setAnalyses([]); setDecisions({}); setExpanded(new Set());
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { cellDates: true });
            const sheetName = wb.SheetNames.find(n => /dados|fila/i.test(n)) || wb.SheetNames[0];
            const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
            if (!raw.length) { toast.error('A planilha está vazia.'); setParsing(false); return; }

            const headerMap = mapHeaders(raw[0]);
            const get = makeGetter(headerMap);
            const ctx = { get, medicos: medicos || [], sigtap, lists };
            const out = raw.map((r, i) => analyzeRow(r, i + 2, ctx));
            setAnalyses(out);
            // pré-expande as linhas que precisam de decisão (até 30 p/ não pesar)
            const need = out.filter(an => Object.values(an.fields).some(fieldNeedsDecision)).map(an => an.linha);
            setExpanded(new Set(need.slice(0, 30)));
        } catch (err) { console.error(err); toast.error('Não foi possível ler a planilha (.xlsx válido?).'); }
        finally { setParsing(false); }
    }

    const setDecision = (linha, campo, valor) =>
        setDecisions(prev => ({ ...prev, [linha]: { ...(prev[linha] || {}), [campo]: valor } }));

    // aceita todas as SUGESTÕES de alta confiança (não toca em "sem match"/"valor novo")
    function aceitarSugestoes() {
        const next = { ...decisions };
        for (const an of analyses) {
            for (const [campo, res] of Object.entries(an.fields)) {
                if (res?.status !== 'suggest') continue;
                next[an.linha] = next[an.linha] || {};
                if (next[an.linha][campo] !== undefined) continue;
                next[an.linha][campo] = campo === 'procedimento'
                    ? (res.suggestions?.[0] || '__free__')
                    : res.canonical;
            }
        }
        setDecisions(next);
        toast.success('Sugestões aplicadas. Revise o que sobrou.');
    }

    const finals = useMemo(() => analyses.map(an => ({
        an, ...finalizeRow(an, decisions[an.linha] || {}, unidadeAtual || null),
    })), [analyses, decisions, unidadeAtual]);

    const okFinals = finals.filter(f => f.status === 'ok');
    const decisaoCount = finals.filter(f => f.status === 'decisao').length;
    const erroCount = finals.filter(f => f.status === 'erro').length;

    // dedup das prontas vs banco
    const dedup = useMemo(() => {
        const map = new Map();
        for (const e of (existingSurgeries || [])) { const k = buildDedupKey(e); if (k) map.set(k, e.id); }
        const seen = new Set();
        let novas = 0, updates = 0, dupFile = 0;
        const plan = okFinals.map(f => {
            const k = buildDedupKey(f.payload);
            if (!k) { novas++; return { payload: f.payload, op: 'insert' }; }
            if (seen.has(k)) { dupFile++; return { payload: f.payload, op: 'skip' }; }
            seen.add(k);
            if (map.has(k)) { updates++; return { payload: f.payload, op: 'update', id: map.get(k) }; }
            novas++; return { payload: f.payload, op: 'insert' };
        });
        return { plan, novas, updates, dupFile };
    }, [okFinals, existingSurgeries]);

    async function handleCommit() {
        if (!okFinals.length) return;
        setCommitting(true);
        try {
            const toInsert = dedup.plan.filter(p => p.op === 'insert').map(p => p.payload);
            const toUpdate = dedup.plan.filter(p => p.op === 'update');
            let inserted = 0, updated = 0;
            for (let i = 0; i < toInsert.length; i += 200) {
                const chunk = toInsert.slice(i, i + 200);
                const { error } = await supabase.from('surgeries').insert(chunk);
                if (error) throw error;
                inserted += chunk.length;
            }
            for (const u of toUpdate) {
                const { error } = await supabase.from('surgeries').update(u.payload).eq('id', u.id);
                if (error) throw error;
                updated += 1;
            }
            await logAction('Importação em Lote', `Fila: ${inserted} nova(s) + ${updated} atualizada(s) via planilha (${fileName}).`);
            toast.success(`${inserted} nova(s) e ${updated} atualizada(s) com sucesso!`);
            reset(); onImported?.(); onClose();
        } catch (err) { console.error(err); toast.error(`Erro ao importar: ${err.message || ''}`); }
        finally { setCommitting(false); }
    }

    if (!open) return null;

    const statusBadge = (s) => s === 'ok'
        ? <span className="text-emerald-600 font-black text-[10px] uppercase">OK</span>
        : s === 'decisao'
            ? <span className="text-amber-600 font-black text-[10px] uppercase">Decisão</span>
            : <span className="text-rose-600 font-black text-[10px] uppercase">Erro</span>;

    const toggle = (linha) => setExpanded(prev => { const n = new Set(prev); n.has(linha) ? n.delete(linha) : n.add(linha); return n; });

    return createPortal(
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><FileSpreadsheet className="text-emerald-600" size={20} /></div>
                        <div>
                            <h2 className="text-lg font-black uppercase text-slate-800 tracking-tight">Importar Pacientes</h2>
                            <p className="text-[11px] text-slate-400 font-semibold">Validação e reconciliação antes de gravar {loadingSigtap && '· carregando SIGTAP…'}</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={parsing || committing || loadingSigtap}
                        className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-7 flex flex-col items-center gap-2 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                        {(parsing || loadingSigtap) ? <Loader2 className="animate-spin text-emerald-500" size={26} /> : <UploadCloud className="text-slate-400" size={26} />}
                        <span className="text-sm font-bold text-slate-600">{loadingSigtap ? 'Carregando catálogo SIGTAP…' : (fileName || 'Clique para escolher a planilha (.xlsx)')}</span>
                        <span className="text-[11px] text-slate-400">Cabeçalhos reconhecidos automaticamente.</span>
                    </button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
                    <div className="flex items-center justify-center">
                        <button type="button" onClick={baixarModelo} className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline"><Download size={14} /> Baixar planilha-modelo</button>
                    </div>

                    {analyses.length > 0 && (
                        <>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                                    <div className="text-2xl font-black text-emerald-600">{okFinals.length}</div>
                                    <div className="text-[10px] font-black uppercase text-emerald-500">prontas ({dedup.novas} nova(s) / {dedup.updates} atualiza)</div>
                                </div>
                                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                                    <div className="text-2xl font-black text-amber-600">{decisaoCount}</div>
                                    <div className="text-[10px] font-black uppercase text-amber-500">precisam decisão</div>
                                </div>
                                <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-center">
                                    <div className="text-2xl font-black text-rose-600">{erroCount}</div>
                                    <div className="text-[10px] font-black uppercase text-rose-500">com erro (corrigir na planilha)</div>
                                </div>
                            </div>

                            {decisaoCount > 0 && (
                                <button onClick={aceitarSugestoes} className="flex items-center gap-2 text-[12px] font-black uppercase text-blue-600 hover:text-blue-700 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-all">
                                    <Sparkles size={14} /> Aceitar todas as sugestões de alta confiança
                                </button>
                            )}

                            <div className="border border-slate-100 rounded-xl overflow-hidden">
                                <div className="max-h-[42vh] overflow-y-auto divide-y divide-slate-50">
                                    {finals.map(({ an, status, pending }) => {
                                        const decideFields = Object.entries(an.fields).filter(([, r]) => fieldNeedsDecision(r));
                                        const isOpen = expanded.has(an.linha);
                                        const canExpand = decideFields.length > 0 || an.baseErrors.length > 0;
                                        return (
                                            <div key={an.linha} className="text-[12px]">
                                                <div className={`flex items-center gap-3 px-3 py-2 ${canExpand ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={() => canExpand && toggle(an.linha)}>
                                                    <span className="w-5 text-slate-300">{canExpand ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : ''}</span>
                                                    <span className="w-8 text-slate-400 font-bold">{an.linha}</span>
                                                    <span className="w-16">{statusBadge(status)}</span>
                                                    <span className="flex-1 font-bold text-slate-700 truncate">{an.scalar.nomePaciente || <span className="text-slate-300">—</span>}</span>
                                                    <span className="text-slate-400 truncate max-w-[40%]">
                                                        {an.baseErrors[0] || (pending.length ? `definir: ${pending.map(c => ENUM_LABELS[c] || c).join(', ')}` : (an.fields.procedimento.value || ''))}
                                                    </span>
                                                </div>

                                                {isOpen && (
                                                    <div className="px-10 pb-3 pt-1 space-y-2 bg-slate-50/50">
                                                        {an.baseErrors.map((e, i) => <div key={i} className="text-rose-500 font-semibold">• {e} (corrija na planilha)</div>)}
                                                        {an.warnings.map((w, i) => <div key={i} className="text-amber-500">• {w}</div>)}
                                                        {decideFields.map(([campo, res]) => (
                                                            <div key={campo} className="flex items-center gap-2 flex-wrap">
                                                                <span className="w-28 text-slate-500 font-bold flex items-center gap-1 shrink-0">
                                                                    {campo === 'cirurgiao' && <Stethoscope size={12} />} {ENUM_LABELS[campo]}:
                                                                </span>
                                                                <span className="text-slate-400 italic">"{res.value}"</span>
                                                                <span className="text-slate-300">→</span>
                                                                {campo === 'procedimento' ? (
                                                                    <select className="border border-slate-200 rounded-lg px-2 py-1 text-[12px] max-w-[60%]"
                                                                        value={(() => { const d = decisions[an.linha]?.procedimento; return d === '__free__' ? '__free__' : (d?.codigo || ''); })()}
                                                                        onChange={(ev) => { const v = ev.target.value; if (v === '__free__') setDecision(an.linha, 'procedimento', '__free__'); else { const s = res.suggestions.find(x => x.codigo === v); setDecision(an.linha, 'procedimento', s); } }}>
                                                                        <option value="" disabled>Selecione o procedimento SIGTAP…</option>
                                                                        {(res.suggestions || []).map(s => <option key={s.codigo} value={s.codigo}>{s.codigo} — {s.nome}</option>)}
                                                                        <option value="__free__">⚠ Manter "{res.value}" (sem código SIGTAP)</option>
                                                                    </select>
                                                                ) : campo === 'cirurgiao' ? (
                                                                    <select className="border border-slate-200 rounded-lg px-2 py-1 text-[12px] max-w-[60%]"
                                                                        value={decisions[an.linha]?.cirurgiao ?? ''}
                                                                        onChange={(ev) => setDecision(an.linha, 'cirurgiao', ev.target.value)}>
                                                                        <option value="" disabled>Selecione o cirurgião…</option>
                                                                        {(res.candidates || []).map(c => <option key={c} value={c}>{c}</option>)}
                                                                        {(medicos || []).map(m => m.name).filter(n => !(res.candidates || []).includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
                                                                        <option value="__free__">Manter "{res.value}" (texto livre)</option>
                                                                    </select>
                                                                ) : (
                                                                    <select className="border border-slate-200 rounded-lg px-2 py-1 text-[12px] max-w-[60%]"
                                                                        value={decisions[an.linha]?.[campo] ?? ''}
                                                                        onChange={(ev) => setDecision(an.linha, campo, ev.target.value)}>
                                                                        <option value="" disabled>Selecione…</option>
                                                                        {(res.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                                                        <option value="__free__">Manter "{res.value}"</option>
                                                                    </select>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-400 font-semibold">
                        {dedup.dupFile > 0 && `${dedup.dupFile} duplicada(s) na planilha ignorada(s). `}
                        Só as linhas "prontas" são gravadas; decisões e erros ficam de fora.
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={handleClose} disabled={committing} className="h-10 px-4 rounded-xl font-black text-[11px] uppercase text-slate-500 hover:bg-slate-100">Cancelar</button>
                        <button onClick={handleCommit} disabled={committing || parsing || okFinals.length === 0}
                            className="h-10 px-5 rounded-xl font-black text-[11px] uppercase text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_4px_15px_rgba(16,185,129,0.3)]">
                            {committing ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                            {committing ? 'Importando…' : `Importar ${okFinals.length} pronta(s)`}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
