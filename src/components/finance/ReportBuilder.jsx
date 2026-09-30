import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { FileBarChart2, Printer, Download, ListTree, Rows3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { printReport } from '../../utils/printReport';
import { counterpartyName } from '../../utils/financeCounterparty';
import { paymentMethodLabel } from './paymentMethods';
import SearchableSelect from './SearchableSelect';
import { formatDateBR, todayISO } from '../../utils/date';

const fmtBRL = (v) => `R$ ${Math.abs(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
// Data exibida no detalhe = VENCIMENTO (due_date), com fallback p/ a data do lançamento quando não houver.
const dueOf = (t) => t.due_date || t.transaction_date;
const signedBRL = (v) => `${Number(v) < 0 ? '−' : '+'}${fmtBRL(v)}`;
const MONTHS_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const monthLabel = (ym) => {
  if (!ym || !/^\d{4}-\d{2}/.test(ym)) return ym || '—';
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_ABBR[m - 1]}/${String(y).slice(2)}`;
};

// Dimensões de agrupamento: como extrair a chave de cada lançamento.
const DIMENSIONS = {
  categoria:   { label: 'Categoria',        keyOf: t => t.finance_categories?.name || 'Sem categoria' },
  costCenter:  { label: 'Centro de Custo',  keyOf: t => t.finance_cost_centers?.name || 'Sem centro de custo' },
  contraparte: { label: 'Origem/Destino',   keyOf: t => counterpartyName(t) || 'Sem contraparte' },
  projeto:     { label: 'Projeto',          keyOf: t => t.projetos?.nome || 'Sem projeto' },
  conta:       { label: 'Conta',            keyOf: t => t.finance_accounts?.name || 'Sem conta' },
  metodo:      { label: 'Método',           keyOf: t => paymentMethodLabel(t.payment_method) || 'Sem método' },
  status:      { label: 'Status',           keyOf: t => (t.status === 'PAGO' ? 'Pago/Realizado' : 'Pendente') },
  tipo:        { label: 'Tipo',             keyOf: t => (t.type === 'ENTRADA' ? 'Entradas' : 'Saídas') },
  dia:         { label: 'Dia',              keyOf: t => formatDateBR(t.transaction_date) },
  mes:         { label: 'Mês (data)',       keyOf: t => monthLabel(String(t.transaction_date || '').slice(0, 7)) },
  competencia: { label: 'Competência',      keyOf: t => monthLabel(t.reference_month || String(t.transaction_date || '').slice(0, 7)) },
};

const selCls = 'h-8 px-2 bg-white border border-black/[.085] rounded-lg text-[11px] font-bold text-slate-600 outline-none focus:border-[#0071e3] shadow-sm cursor-pointer max-w-[180px]';
const inputCls = 'h-8 px-2 bg-white border border-black/[.085] rounded-lg text-[11px] font-medium text-slate-600 outline-none focus:border-[#0071e3] shadow-sm';

// Gerador de relatórios gerenciais: agrupa os lançamentos do período por qualquer dimensão,
// com todos os filtros combináveis, totais no rodapé, impressão e exportação com somas.
export default function ReportBuilder({ transactions, periodLabel, theme, userName }) {
  const [dim, setDim] = useState('categoria');
  const [view, setView] = useState('resumo'); // 'resumo' | 'detalhe'
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // seleção múltipla no detalhado
  const [f, setF] = useState({ tipo: '', status: '', conta: '', categoria: '', cc: '', metodo: '', contraparte: '', projeto: '', busca: '', min: '', max: '', transfers: false });
  const setFilter = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  // Opções dos selects derivadas dos próprios lançamentos do período (zero queries extras).
  const opts = useMemo(() => {
    const u = (fn) => [...new Set(transactions.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      contas: u(t => t.finance_accounts?.name),
      categorias: u(t => t.finance_categories?.name),
      ccs: u(t => t.finance_cost_centers?.name),
      metodos: u(t => paymentMethodLabel(t.payment_method)),
      contrapartes: u(t => counterpartyName(t)),
      projetos: u(t => t.projetos?.nome),
    };
  }, [transactions]);

  const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Lista filtrada — base tanto do resumo quanto do detalhe.
  const rows = useMemo(() => {
    const min = parseFloat(String(f.min).replace(',', '.'));
    const max = parseFloat(String(f.max).replace(',', '.'));
    const q = norm(f.busca.trim());
    return transactions.filter(t => {
      if (!f.transfers && t.transfer_group_id) return false;
      if (f.tipo && t.type !== f.tipo) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.conta && (t.finance_accounts?.name || '') !== f.conta) return false;
      if (f.categoria && (t.finance_categories?.name || '') !== f.categoria) return false;
      if (f.cc && (t.finance_cost_centers?.name || '') !== f.cc) return false;
      if (f.metodo && paymentMethodLabel(t.payment_method) !== f.metodo) return false;
      if (f.contraparte && counterpartyName(t) !== f.contraparte) return false;
      if (f.projeto && (t.projetos?.nome || '') !== f.projeto) return false;
      const v = Math.abs(Number(t.amount) || 0);
      if (!Number.isNaN(min) && v < min) return false;
      if (!Number.isNaN(max) && v > max) return false;
      if (!q) return true;
      return norm([t.description, counterpartyName(t), t.finance_categories?.name, t.finance_cost_centers?.name, t.finance_accounts?.name, t.doc_number, t.reference_month].join(' | ')).includes(q);
    });
  }, [transactions, f]);

  // Resumo agrupado pela dimensão escolhida.
  const groups = useMemo(() => {
    const keyOf = DIMENSIONS[dim].keyOf;
    // Chave de ordenação cronológica (YYYY-MM-DD / YYYY-MM) — o rótulo "Jan/26" ordena
    // alfabético (errado); guardamos a data ISO real para ordenar de verdade.
    const sortKeyOf = (t) => dim === 'dia' ? String(t.transaction_date || '').slice(0, 10)
      : dim === 'mes' ? String(t.transaction_date || '').slice(0, 7)
      : dim === 'competencia' ? (t.reference_month || String(t.transaction_date || '').slice(0, 7)) : '';
    const map = new Map();
    rows.forEach(t => {
      const k = keyOf(t);
      const g = map.get(k) || { key: k, sortKey: sortKeyOf(t), n: 0, inflow: 0, outflow: 0, bruto: 0, pendente: 0 };
      g.n += 1;
      const v = Number(t.amount) || 0;
      if (t.type === 'ENTRADA') g.inflow += v; else g.outflow += v;
      g.bruto += Number(t.gross_amount != null ? t.gross_amount : t.amount) || 0;
      g.pendente += t.status === 'PAGO' ? 0 : (v - (Number(t.paid_amount) || 0));
      map.set(k, g);
    });
    const list = [...map.values()].map(g => ({ ...g, net: g.inflow - g.outflow, mov: g.inflow + g.outflow }));
    const totalMov = list.reduce((a, g) => a + g.mov, 0) || 1;
    list.forEach(g => { g.share = (g.mov / totalMov) * 100; });
    // Dia/mês/competência em ordem cronológica; demais por movimento (maior primeiro).
    if (['dia', 'mes', 'competencia'].includes(dim)) {
      list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    } else list.sort((a, b) => b.mov - a.mov);
    return list;
  }, [rows, dim]);

  const totals = useMemo(() => {
    let inflow = 0, outflow = 0, bruto = 0, pendente = 0;
    rows.forEach(t => {
      const v = Number(t.amount) || 0;
      if (t.type === 'ENTRADA') inflow += v; else outflow += v;
      bruto += Number(t.gross_amount != null ? t.gross_amount : t.amount) || 0;
      pendente += t.status === 'PAGO' ? 0 : (v - (Number(t.paid_amount) || 0));
    });
    return { inflow, outflow, net: inflow - outflow, bruto, pendente, count: rows.length };
  }, [rows]);

  // Total só dos itens marcados (bruto / líquido / pendente) — no detalhado. Ignora ids fora do filtro.
  const selectedTotals = useMemo(() => {
    let bruto = 0, liquido = 0, pendente = 0, count = 0;
    rows.forEach(t => {
      if (!selectedIds.has(t.id)) return;
      count++;
      bruto += Number(t.gross_amount != null ? t.gross_amount : t.amount) || 0;
      liquido += Number(t.amount) || 0;
      pendente += t.status === 'PAGO' ? 0 : ((Number(t.amount) || 0) - (Number(t.paid_amount) || 0));
    });
    return { bruto, liquido, pendente, count };
  }, [rows, selectedIds]);
  const allVisibleSelected = rows.length > 0 && rows.every(t => selectedIds.has(t.id));
  const someVisibleSelected = rows.some(t => selectedIds.has(t.id));
  const toggleOne = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVisible = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (rows.every(t => prev.has(t.id))) rows.forEach(t => n.delete(t.id));
    else rows.forEach(t => n.add(t.id));
    return n;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const activeFiltersText = useMemo(() => {
    const parts = [];
    if (f.tipo) parts.push(f.tipo === 'ENTRADA' ? 'Entradas' : 'Saídas');
    if (f.status) parts.push(f.status === 'PAGO' ? 'Pagos' : f.status === 'PARCIAL' ? 'Parciais' : 'Pendentes');
    if (f.conta) parts.push(`Conta: ${f.conta}`);
    if (f.categoria) parts.push(`Cat: ${f.categoria}`);
    if (f.cc) parts.push(`CC: ${f.cc}`);
    if (f.metodo) parts.push(`Método: ${f.metodo}`);
    if (f.contraparte) parts.push(`Contraparte: ${f.contraparte}`);
    if (f.projeto) parts.push(`Projeto: ${f.projeto}`);
    if (f.min || f.max) parts.push(`Valor ${f.min || '0'}–${f.max || '∞'}`);
    if (f.busca) parts.push(`Busca: "${f.busca}"`);
    if (f.transfers) parts.push('c/ transferências');
    return parts.join(' · ');
  }, [f]);

  // Somas padronizadas (Bruto / Líquido / Pendente) — mesmas nas duas visões.
  const summaryLines = [
    { label: 'Bruto', value: fmtBRL(totals.bruto) },
    { label: 'Entradas', value: `+ ${fmtBRL(totals.inflow)}` },
    { label: 'Saídas', value: `− ${fmtBRL(totals.outflow)}` },
    { label: 'Líquido', value: `${totals.net < 0 ? '−' : ''}${fmtBRL(totals.net)}` },
    { label: 'Pendente', value: fmtBRL(totals.pendente) },
  ];

  const handlePrint = () => {
    if (!rows.length) return toast.error('Nada para imprimir com os filtros atuais.');
    const base = { theme, userName, periodText: `${periodLabel}${activeFiltersText ? ` · ${activeFiltersText}` : ''}`, summary: summaryLines };
    if (view === 'resumo') {
      printReport({
        ...base,
        title: `Relatório Gerencial por ${DIMENSIONS[dim].label}`,
        orientation: 'portrait',
        columns: [{ header: DIMENSIONS[dim].label }, { header: 'Lançamentos', align: 'right' }, { header: 'Bruto (R$)', align: 'right' }, { header: 'Líquido (R$)', align: 'right' }, { header: 'Pendente (R$)', align: 'right' }, { header: '% Mov.', align: 'right' }],
        rows: groups.map(g => [g.key, String(g.n), fmtBRL(g.bruto), signedBRL(g.net), g.pendente > 0.004 ? fmtBRL(g.pendente) : '—', `${g.share.toFixed(1)}%`]),
        totalLabel: 'Total de Grupos',
      });
    } else {
      printReport({
        ...base,
        title: 'Relatório Gerencial — Detalhado',
        orientation: 'landscape',
        columns: [{ header: 'Vencimento' }, { header: 'Comp.' }, { header: 'Origem/Destino' }, { header: 'Conta' }, { header: 'Categoria' }, { header: 'Centro de Custo' }, { header: 'Status' }, { header: 'Bruto (R$)', align: 'right' }, { header: 'Líquido (R$)', align: 'right' }, { header: 'Pendente (R$)', align: 'right' }],
        rows: rows.map(t => {
          const pend = t.status === 'PAGO' ? 0 : (Number(t.amount) - Number(t.paid_amount || 0));
          return [formatDateBR(dueOf(t)), t.reference_month ? monthLabel(t.reference_month) : '—', counterpartyName(t) || '—', t.finance_accounts?.name || '—', t.finance_categories?.name || 'Geral', t.finance_cost_centers?.name || '—', t.status === 'PAGO' ? 'Pago' : 'Pendente', fmtBRL(t.gross_amount != null ? t.gross_amount : t.amount), `${t.type === 'ENTRADA' ? '+' : '−'}${fmtBRL(t.amount)}`, pend > 0.004 ? fmtBRL(pend) : '—'];
        }),
        totalLabel: 'Total de Lançamentos',
      });
    }
  };

  const handleExport = () => {
    if (!rows.length) return toast.error('Nada para exportar com os filtros atuais.');
    let sheet;
    if (view === 'resumo') {
      sheet = groups.map(g => ({ [DIMENSIONS[dim].label]: g.key, 'Lançamentos': g.n, 'Bruto': g.bruto, 'Líquido': g.net, 'Pendente': g.pendente, '% Movimento': Number(g.share.toFixed(1)) }));
      sheet.push({ [DIMENSIONS[dim].label]: 'TOTAL', 'Lançamentos': totals.count, 'Bruto': totals.bruto, 'Líquido': totals.net, 'Pendente': totals.pendente, '% Movimento': 100 });
    } else {
      sheet = rows.map(t => {
        const pend = t.status === 'PAGO' ? 0 : (Number(t.amount) - Number(t.paid_amount || 0));
        return { 'Vencimento': formatDateBR(dueOf(t)), 'Competência': t.reference_month || '', 'Origem/Destino': counterpartyName(t) || '', 'Descrição': t.description || '', 'Conta': t.finance_accounts?.name || '', 'Categoria': t.finance_categories?.name || 'Geral', 'Centro de Custo': t.finance_cost_centers?.name || '', 'Método': paymentMethodLabel(t.payment_method), 'Status': t.status === 'PAGO' ? 'Pago' : 'Pendente', 'Bruto': Number(t.gross_amount != null ? t.gross_amount : t.amount) || 0, 'Líquido': (t.type === 'ENTRADA' ? 1 : -1) * (Number(t.amount) || 0), 'Pendente': pend };
      });
      sheet.push({ 'Origem/Destino': 'TOTAL', 'Bruto': totals.bruto, 'Líquido': totals.net, 'Pendente': totals.pendente });
    }
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    XLSX.writeFile(wb, `relatorio_gerencial_${todayISO()}.xlsx`);
  };

  const sel = (value, onChange, empty, list) => (
    <div className="w-[150px]">
      <SearchableSelect
        options={[{ value: '', label: empty }, ...list.map(o => ({ value: o.value ?? o, label: o.label ?? o }))]}
        value={value} onChange={onChange} placeholder={empty} searchPlaceholder="Buscar…" size="sm" />
    </div>
  );

  return (
    <div className="lg:col-span-12 bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <FileBarChart2 size={14} className="text-[#0071e3]" /> Relatórios Personalizados
        </h3>
        <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5">
          <div className="flex bg-slate-100/70 rounded-md p-0.5">
            <button onClick={() => setView('resumo')} className={`px-2.5 h-7 rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 transition-all ${view === 'resumo' ? 'bg-[#0071e3] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><ListTree size={12} /> Resumo</button>
            <button onClick={() => setView('detalhe')} className={`px-2.5 h-7 rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 transition-all ${view === 'detalhe' ? 'bg-[#0071e3] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Rows3 size={12} /> Detalhado</button>
          </div>
          <button onClick={handlePrint} className="h-8 px-3 bg-white border border-black/[.085] hover:border-[#0071e3]/40 rounded-lg text-[10px] font-semibold uppercase text-slate-600 flex items-center gap-1.5 shadow-sm transition-colors"><Printer size={13} /> Imprimir</button>
          <button onClick={handleExport} className="h-8 px-3 bg-white border border-black/[.085] hover:border-[#0071e3]/40 rounded-lg text-[10px] font-semibold uppercase text-slate-600 flex items-center gap-1.5 shadow-sm transition-colors"><Download size={13} /> Exportar</button>
        </div>
      </div>

      {/* Filtros — todos combináveis; opções derivadas dos lançamentos do período */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 pb-3 border-b border-black/[.06]">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Agrupar por</span>
        <select value={dim} onChange={e => setDim(e.target.value)} className={`${selCls} border-[#0071e3]/40 text-indigo-700`}>
          {Object.entries(DIMENSIONS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
        </select>
        <div className="h-5 w-px bg-slate-200 mx-1" />
        {sel(f.tipo, v => setFilter('tipo', v), 'Entradas + Saídas', [{ value: 'ENTRADA', label: 'Só Entradas' }, { value: 'SAIDA', label: 'Só Saídas' }])}
        {sel(f.status, v => setFilter('status', v), 'Todos os Status', [{ value: 'PAGO', label: 'Pagos/Realizados' }, { value: 'PARCIAL', label: 'Parciais' }, { value: 'PENDENTE', label: 'Pendentes' }])}
        {sel(f.conta, v => setFilter('conta', v), 'Todas as Contas', opts.contas)}
        {sel(f.categoria, v => setFilter('categoria', v), 'Todas as Categorias', opts.categorias)}
        {sel(f.cc, v => setFilter('cc', v), 'Todos os C. Custo', opts.ccs)}
        {sel(f.metodo, v => setFilter('metodo', v), 'Todos os Métodos', opts.metodos)}
        {sel(f.contraparte, v => setFilter('contraparte', v), 'Todas Origens/Destinos', opts.contrapartes)}
        {sel(f.projeto, v => setFilter('projeto', v), 'Todos os Projetos', opts.projetos)}
        <input type="text" placeholder="R$ mín" value={f.min} onChange={e => setFilter('min', e.target.value)} className={`${inputCls} w-[70px]`} />
        <input type="text" placeholder="R$ máx" value={f.max} onChange={e => setFilter('max', e.target.value)} className={`${inputCls} w-[70px]`} />
        <input type="text" placeholder="Buscar..." value={f.busca} onChange={e => setFilter('busca', e.target.value)} className={`${inputCls} w-[130px]`} />
        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer select-none ml-1">
          <input type="checkbox" checked={f.transfers} onChange={e => setFilter('transfers', e.target.checked)} className="accent-indigo-600" /> Incluir transferências
        </label>
        {(activeFiltersText || f.busca) && (
          <button onClick={() => setF({ tipo: '', status: '', conta: '', categoria: '', cc: '', metodo: '', contraparte: '', projeto: '', busca: '', min: '', max: '', transfers: false })}
            className="h-8 px-2.5 rounded-lg text-[10px] font-semibold uppercase text-rose-500 hover:bg-rose-50 transition-colors">Limpar</button>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto max-h-[52vh] overflow-y-auto custom-scrollbar">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-[11px] font-bold text-slate-400 uppercase">Nenhum lançamento bate com os filtros no período</div>
        ) : view === 'resumo' ? (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-black/[.06] text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="py-2 px-2">{DIMENSIONS[dim].label}</th>
                <th className="py-2 px-2 text-right">Lançamentos</th>
                <th className="py-2 px-2 text-right">Bruto (R$)</th>
                <th className="py-2 px-2 text-right">Líquido (R$)</th>
                <th className="py-2 px-2 text-right">Pendente (R$)</th>
                <th className="py-2 px-2 text-right">% Mov.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.055]">
              {groups.map(g => (
                <tr key={g.key} className="hover:bg-[#f5f5f7] text-[11.5px] text-slate-700">
                  <td className="py-1.5 px-2 font-bold text-slate-800 max-w-[300px] truncate" title={g.key}>{g.key}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-400 font-bold">{g.n}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-400" title={`Entradas +${fmtBRL(g.inflow)} · Saídas −${fmtBRL(g.outflow)}`}>{fmtBRL(g.bruto)}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${g.net < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{signedBRL(g.net)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{g.pendente > 0.004 ? <span className="font-semibold text-amber-600">{fmtBRL(g.pendente)}</span> : <span className="text-slate-300">0,00</span>}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-400 font-bold">{g.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-black/[.06] text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                <th className="py-2 px-2 w-8 text-center">
                  <input type="checkbox" aria-label="Selecionar todos os visíveis"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                    onChange={toggleAllVisible}
                    className="w-3.5 h-3.5 accent-[#0071e3] cursor-pointer align-middle" />
                </th>
                <th className="py-2 px-2">Vencimento</th><th className="py-2 px-2">Comp.</th><th className="py-2 px-2">Origem/Destino</th>
                <th className="py-2 px-2">Conta</th><th className="py-2 px-2">Categoria</th><th className="py-2 px-2">C. Custo</th>
                <th className="py-2 px-2 text-center">Status</th>
                <th className="py-2 px-2 text-right">Bruto (R$)</th><th className="py-2 px-2 text-right">Líquido (R$)</th><th className="py-2 px-2 text-right">Pendente (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.055]">
              {rows.map(t => (
                <tr key={t.id} className={`hover:bg-[#f5f5f7] text-[11.5px] text-slate-600 ${selectedIds.has(t.id) ? 'bg-[#0071e3]/[.04]' : ''}`}>
                  <td className="py-1.5 px-2 text-center">
                    <input type="checkbox" aria-label="Selecionar lançamento"
                      checked={selectedIds.has(t.id)} onChange={() => toggleOne(t.id)}
                      className="w-3.5 h-3.5 accent-[#0071e3] cursor-pointer align-middle" />
                  </td>
                  <td className="py-1.5 px-2 text-slate-400 tabular-nums whitespace-nowrap">{formatDateBR(dueOf(t))}</td>
                  <td className="py-1.5 px-2 text-sky-600 font-bold whitespace-nowrap">{t.reference_month ? monthLabel(t.reference_month) : '—'}</td>
                  <td className="py-1.5 px-2 max-w-[240px]">
                    <span className="font-bold text-slate-800 block truncate" title={counterpartyName(t) || t.description}>{counterpartyName(t) || t.description || '—'}</span>
                    {t.description && t.description !== counterpartyName(t) && <span className="block text-[10px] text-slate-400 truncate" title={t.description}>{t.description}</span>}
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap">{t.finance_accounts?.name || '—'}</td>
                  <td className="py-1.5 px-2 max-w-[170px] truncate" title={t.finance_categories?.name}>{t.finance_categories?.name || 'Geral'}</td>
                  <td className="py-1.5 px-2 max-w-[150px] truncate" title={t.finance_cost_centers?.name}>{t.finance_cost_centers?.name || '—'}</td>
                  <td className="py-1.5 px-2 text-center"><span className={`text-[9px] font-semibold uppercase ${t.status === 'PAGO' ? 'text-emerald-600' : 'text-amber-600'}`}>{t.status === 'PAGO' ? 'Pago' : 'Pend.'}</span></td>
                  <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap text-slate-400" title={t.gross_amount != null ? `Bruto R$ ${fmtBRL(t.gross_amount)} − impostos = líquido R$ ${fmtBRL(t.amount)}` : 'Sem retenção: bruto = líquido'}>{fmtBRL(t.gross_amount != null ? t.gross_amount : t.amount)}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-bold whitespace-nowrap ${t.type === 'ENTRADA' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.type === 'ENTRADA' ? '+' : '−'}{fmtBRL(t.amount)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{(() => { const pend = t.status === 'PAGO' ? 0 : (Number(t.amount) - Number(t.paid_amount || 0)); return pend > 0.004 ? <span className="font-semibold text-amber-600">{fmtBRL(pend)}</span> : <span className="text-slate-300">0,00</span>; })()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Barra de seleção — total só dos marcados (detalhado) */}
      {view === 'detalhe' && selectedTotals.count > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2 tabular-nums bg-[#0071e3]/[.05] border border-[#0071e3]/20 rounded-xl">
          <span className="text-[11px] font-semibold text-[#0071e3] mr-auto">{selectedTotals.count} selecionado{selectedTotals.count === 1 ? '' : 's'}</span>
          <span className="text-[11px] font-bold text-slate-400">Bruto <span className="font-semibold text-slate-700">{fmtBRL(selectedTotals.bruto)}</span></span>
          <span className="text-[11px] font-bold text-slate-400">Líquido <span className="font-semibold text-slate-700">{fmtBRL(selectedTotals.liquido)}</span></span>
          <span className="text-[11px] font-bold text-amber-600">Pendente <span className="font-semibold">{fmtBRL(selectedTotals.pendente)}</span></span>
          <button onClick={clearSelection} className="text-[10px] font-semibold uppercase text-slate-400 hover:text-rose-500">Limpar</button>
        </div>
      )}

      {/* Totais — sempre visíveis, reagem a todos os filtros */}
      {rows.length > 0 && (
        <div className="mt-2 pt-2.5 border-t-2 border-black/[.085] flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-1 tabular-nums">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-auto">{totals.count} lançamento{totals.count === 1 ? '' : 's'}{view === 'resumo' ? ` · ${groups.length} grupo${groups.length === 1 ? '' : 's'}` : ''}</span>
          <span className="text-[11px] font-bold text-slate-400">Bruto <span className="font-semibold text-slate-700">{fmtBRL(totals.bruto)}</span></span>
          <span className="text-[11px] font-bold text-emerald-600">Entradas <span className="font-semibold">+{fmtBRL(totals.inflow)}</span></span>
          <span className="text-[11px] font-bold text-rose-600">Saídas <span className="font-semibold">−{fmtBRL(totals.outflow)}</span></span>
          <span className={`text-[12px] font-semibold ${totals.net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>Líquido {signedBRL(totals.net)}</span>
          <span className="text-[11px] font-bold text-amber-600">Pendente <span className="font-semibold">{fmtBRL(totals.pendente)}</span></span>
        </div>
      )}
    </div>
  );
}
