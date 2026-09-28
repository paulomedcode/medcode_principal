import React, { useState, useMemo } from 'react';
import { financeService } from '../../services/financeService';
import FinancePeriodBar from '../../components/finance/FinancePeriodBar';
import SearchableSelect from '../../components/finance/SearchableSelect';
import { FileText, Loader2, Printer, ChevronRight, ChevronDown, Rows3, ListTree } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { useAuth } from '../../contexts/AuthContext';
import { counterpartyName } from '../../utils/financeCounterparty';
import { formatDateBR } from '../../utils/date';

import { COMP_TAX_DEFAULT, COMP_TAX_AME, isAmeParty } from '../../utils/financeTaxes';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const normName = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function RelatorioDRE() {
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [ccFilter, setCcFilter] = useState('all');
  const [label, setLabel] = useState('');
  const { theme } = useWhiteLabel();
  const { currentUser } = useAuth();
  const [expanded, setExpanded] = useState(() => new Set()); // ids de categorias abertas no drill-down
  const toggle = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Opções do filtro de centro de custo (hierárquicas) para o combobox com busca.
  const ccOptions = useMemo(() => {
    const childrenOf = (pid) => costCenters.filter(c => (c.parent_id || null) === (pid || null))
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
    const out = [{ value: 'all', label: 'Centro de custo: todos', depth: 0 }];
    const walk = (pid, depth) => childrenOf(pid).forEach(c => { out.push({ value: c.id, label: c.name, depth }); walk(c.id, depth + 1); });
    walk(null, 0);
    return out;
  }, [costCenters]);

  const load = async (range) => {
    setLabel(range.label);
    setLoading(true);
    try {
      const [txs, cats, ccs] = await Promise.all([
        financeService.getTransactions({ startDate: range.start, endDate: range.end, basis: range.basis }),
        financeService.getCategories(),
        financeService.getCostCenters()
      ]);
      setTransactions(txs || []);
      setCategories(cats || []);
      setCostCenters(ccs || []);
    } catch (e) { console.error(e); toast.error('Erro ao carregar o DRE.'); }
    finally { setLoading(false); }
  };

  // DRE genérico, dirigido pelo próprio plano de contas (grupos de 1º nível, em cascata),
  // respeitando in_result em QUALQUER nível (ex.: 1.3/1.4/3.2 ficam fora mesmo com o pai dentro).
  const dre = useMemo(() => {
    const byId = {};
    categories.forEach(c => { byId[c.id] = { ...c, in_result: c.in_result !== false }; });
    // Filtro de centro de custo HIERÁRQUICO: selecionar um pai inclui os descendentes.
    const ccSet = (() => {
      if (ccFilter === 'all') return null;
      const kids = {};
      costCenters.forEach(c => { (kids[c.parent_id || 'root'] ||= []).push(c.id); });
      const set = new Set(); const stack = [ccFilter];
      while (stack.length) { const cur = stack.pop(); if (set.has(cur)) continue; set.add(cur); (kids[cur] || []).forEach(k => stack.push(k)); }
      return set;
    })();
    const amt = {};      // valor LÍQUIDO lançado DIRETAMENTE em cada categoria
    const gamt = {};     // valor BRUTO (gross_amount, fallback amount) por categoria
    const txByCat = {};  // lançamentos lançados DIRETAMENTE em cada categoria (p/ o drill-down)
    categories.forEach(c => { amt[c.id] = 0; gamt[c.id] = 0; });
    // in_result efetivo: falso se a categoria OU qualquer ancestral estiver fora do resultado.
    const effInResult = (id) => { let cur = byId[id]; while (cur) { if (cur.in_result === false) return false; cur = byId[cur.parent_id]; } return true; };
    // Receita operacional (NF emitida) = subárvore "Receitas Operacionais" — base dos impostos complementares.
    const isOperationalRevenue = (id) => { let cur = byId[id]; while (cur) { if (normName(cur.name).includes('receitas operacionais')) return true; cur = byId[cur.parent_id]; } return false; };
    let withheldTaxes = 0;  // impostos retidos na fonte = Σ (bruto − líquido) das receitas do resultado
    let compTaxes = 0;      // impostos complementares = alíquota × bruto (provisão calculada)
    transactions.forEach(t => {
      if (t.transfer_group_id) return; // transferência entre contas não entra no DRE
      if (ccSet && !ccSet.has(t.cost_center_id)) return;
      // DRE por competência: considera TODOS os lançamentos do período (pagos ou não),
      // pelo valor cheio. O que ainda não foi pago é problema de fluxo de caixa, não do
      // resultado da operação.
      if (t.category_id && amt[t.category_id] !== undefined) {
        const liq = parseFloat(t.amount) || 0;
        const gross = t.gross_amount != null ? (parseFloat(t.gross_amount) || 0) : liq;
        amt[t.category_id] += liq;
        gamt[t.category_id] += gross;
        (txByCat[t.category_id] ||= []).push(t);
        if (t.type === 'ENTRADA' && effInResult(t.category_id)) {
          withheldTaxes += gross - liq;
          // Alíquota do próprio lançamento (comp_tax_pct: 2,08 · 2,38 · 8,23 · 0 = sem).
          // Lançamento antigo (NULL) cai na regra padrão sobre as receitas operacionais.
          if (t.comp_tax_pct != null) {
            compTaxes += gross * ((parseFloat(t.comp_tax_pct) || 0) / 100);
          } else if (isOperationalRevenue(t.category_id)) {
            compTaxes += gross * ((isAmeParty(counterpartyName(t) || t.description) ? COMP_TAX_AME : COMP_TAX_DEFAULT) / 100);
          }
        }
      }
    });

    const childrenOf = (pid) => categories
      .filter(c => (c.parent_id || null) === (pid || null))
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));

    // Total rolando para o RESULTADO: soma a categoria + descendentes, mas zera os ramos in_result=false.
    const rolledRes = (id) => byId[id]?.in_result === false ? 0
      : amt[id] + childrenOf(id).reduce((s, ch) => s + rolledRes(ch.id), 0);
    // Idem, pelo valor BRUTO — usado na seção de receitas (a demonstração parte do faturamento bruto).
    const rolledResGross = (id) => byId[id]?.in_result === false ? 0
      : gamt[id] + childrenOf(id).reduce((s, ch) => s + rolledResGross(ch.id), 0);
    // Total cheio (todos os descendentes) — usado na seção "fora do resultado".
    const rolledAll = (id) => amt[id] + childrenOf(id).reduce((s, ch) => s + rolledAll(ch.id), 0);

    // Nó do resultado: só filhos in_result entram; total via rolledRes.
    const resNode = (c) => ({
      id: c.id, name: c.name, type: c.type, total: rolledRes(c.id),
      children: childrenOf(c.id).filter(ch => byId[ch.id].in_result).map(resNode)
    });
    // Nó de receita: igual ao resNode, mas com totais BRUTOS.
    const revNode = (c) => ({
      id: c.id, name: c.name, type: c.type, total: rolledResGross(c.id),
      children: childrenOf(c.id).filter(ch => byId[ch.id].in_result).map(revNode)
    });
    // Nó cheio (todos os descendentes) — usado na seção "fora do resultado".
    const allNode = (c) => ({
      id: c.id, name: c.name, type: c.type, total: rolledAll(c.id),
      children: childrenOf(c.id).map(allNode)
    });
    const tops = childrenOf(null);
    const revenueGroups = tops.filter(c => c.type === 'ENTRADA' && byId[c.id].in_result).map(revNode);
    // Despesas operacionais (cascata) x Impostos sobre o Lucro (IRPJ/CSLL) — estes saem da
    // cascata e são subtraídos no final, após o LAIR. Depreciação (3.7) é despesa operacional
    // normal (in_result=true), entra aqui; o que a diferencia é só o caixa (in_cash_flow=false).
    const saidaTops = tops.filter(c => c.type === 'SAIDA' && byId[c.id].in_result);
    const expenseGroups = saidaTops.filter(c => !byId[c.id].is_profit_tax).map(resNode);
    const profitTaxGroups = saidaTops.filter(c => byId[c.id].is_profit_tax).map(resNode);

    // "Fora do resultado": raízes de ramos in_result=false (pai dentro ou inexistente), com total cheio.
    const nonOpRoots = categories.filter(c => byId[c.id].in_result === false
      && (!c.parent_id || byId[c.parent_id]?.in_result !== false));
    const nonOpGroups = nonOpRoots
      .map(allNode)
      .filter(g => Math.abs(g.total) > 0.0049)
      .sort((a, b) => (byId[a.id].position || 0) - (byId[b.id].position || 0));

    const grossRevenues = revenueGroups.reduce((a, g) => a + g.total, 0);           // Receita Bruta (faturamento)
    const netRevenues = grossRevenues - withheldTaxes - compTaxes;                  // Receita Líquida após impostos
    const totalExpenses = expenseGroups.reduce((a, g) => a + g.total, 0);
    const profitTaxes = profitTaxGroups.reduce((a, g) => a + g.total, 0);
    const lair = netRevenues - totalExpenses;            // Lucro Antes do IRPJ/CSLL (LAIR)
    const netProfit = lair - profitTaxes;                // Lucro Líquido
    const margin = netRevenues > 0 ? (netProfit / netRevenues) * 100 : 0;

    // Ids de todas as categorias que têm algo a expandir (filhos ou lançamentos) — p/ "expandir tudo".
    const expandableIds = [];
    const collect = (node) => {
      const kids = txByCat[node.id] || [];
      if (node.children.length || kids.length) expandableIds.push(node.id);
      node.children.forEach(collect);
    };
    [...revenueGroups, ...expenseGroups, ...profitTaxGroups, ...nonOpGroups].forEach(collect);

    return { revenueGroups, expenseGroups, profitTaxGroups, nonOpGroups, grossRevenues, withheldTaxes, compTaxes, netRevenues, totalExpenses, profitTaxes, lair, netProfit, margin, txByCat, byId, expandableIds };
  }, [transactions, categories, costCenters, ccFilter]);

  // Impressão / PDF — demonstração com cara de DRE (statement), não uma tabela de dados.
  const handlePrint = () => {
    const ccName = ccFilter === 'all' ? 'Todos os centros de custo' : (costCenters.find(c => c.id === ccFilter)?.name || '—');
    const instituicao = theme?.nomeInstituicao || 'Sistema de Gestão';
    const userName = currentUser?.name || currentUser?.email || 'Usuário do Sistema';
    const line = (lbl, value, cls, level = 0, sign = '') =>
      `<tr class="${cls}"><td style="padding-left:${8 + level * 20}px">${esc(lbl)}</td><td class="v">${value == null ? '' : `${sign === '-' ? '- ' : ''}${esc(fmt(value))}`}</td></tr>`;
    const nodeH = (node, level, sign) => {
      let h = line(node.name, node.total, level === 0 ? 'grp' : 'cat', level, sign);
      node.children.filter(c => Math.abs(c.total) > 0.0049).forEach(c => { h += nodeH(c, level + 1, sign); });
      return h;
    };
    let body = '';
    dre.revenueGroups.filter(g => Math.abs(g.total) > 0.0049).forEach(g => { body += nodeH(g, 0, '+'); });
    body += line('(=) Receita Bruta', dre.grossRevenues, 'tot');
    body += line('(-) Impostos Retidos na Fonte', dre.withheldTaxes, 'cat', 0, '-');
    body += line('(-) Impostos Complementares (alíquota do lançamento sobre o bruto)', dre.compTaxes, 'cat', 0, '-');
    body += line('(=) Receita Líquida', dre.netRevenues, 'tot');
    dre.expenseGroups.filter(g => Math.abs(g.total) > 0.0049).forEach(g => { body += nodeH(g, 0, '-'); });
    const taxG = dre.profitTaxGroups.filter(g => Math.abs(g.total) > 0.0049);
    if (taxG.length) {
      body += line('(=) Lucro Antes dos Impostos (LAIR)', dre.lair, 'tot');
      taxG.forEach(g => { body += nodeH(g, 0, '-'); });
    }
    body += line(`(=) ${dre.profitTaxes > 0.0049 ? 'Lucro Líquido do Exercício' : 'Resultado Líquido do Exercício'}`, dre.netProfit, 'res');
    body += `<tr class="mrg"><td>Margem Líquida</td><td class="v">${dre.margin.toFixed(1)}%</td></tr>`;
    let nonOp = '';
    dre.nonOpGroups.forEach(g => { nonOp += nodeH(g, 0, g.type === 'ENTRADA' ? '+' : '-'); });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DRE — ${esc(instituicao)}</title><style>
      @page { size: portrait; margin: 1.4cm; }
      *{box-sizing:border-box} body{font-family:-apple-system,Arial,sans-serif;color:#1d1d1f;margin:0}
      .head{text-align:center;margin-bottom:16px}.head img{height:38px;margin-bottom:6px}
      .head .inst{font-size:15px;font-weight:700;letter-spacing:.3px}
      .head h1{font-size:12.5px;font-weight:600;margin:2px 0 0;text-transform:uppercase;letter-spacing:.5px;color:#0071e3}
      .meta{display:flex;justify-content:space-between;gap:12px;font-size:10.5px;color:#555;border-bottom:2px solid #1d1d1f;padding-bottom:6px;margin-bottom:6px}
      table{width:100%;border-collapse:collapse}
      td{padding:5px 8px;font-size:11.5px}
      td.v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      tr.cat td{color:#444;border-bottom:1px solid #f1f1f4}
      tr.grp td{font-weight:700;text-transform:uppercase;letter-spacing:.3px;font-size:11px;background:#f6f6f8;border-top:1px solid #e6e6eb}
      tr.tot td{font-weight:700;background:#eef1ff;border-top:1px solid #dfe3ff;border-bottom:1px solid #dfe3ff}
      tr.res td{font-weight:700;color:#fff;background:#1d1d1f;font-size:12px;text-transform:uppercase}
      tr.mrg td{font-size:10.5px;color:#666}
      .sec{margin-top:16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:2px}
      .foot{margin-top:16px;text-align:center;font-size:9.5px;color:#888;border-top:1px solid #ddd;padding-top:6px}
    </style></head><body>
      <div class="head">${theme?.logoUrl ? `<img src="${esc(theme.logoUrl)}" alt="" />` : ''}<div class="inst">${esc(instituicao)}</div><h1>Demonstração do Resultado do Exercício</h1></div>
      <div class="meta"><span><b>Período:</b> ${esc(label)} &nbsp;·&nbsp; ${esc(ccName)}</span><span><b>Gerado por:</b> ${esc(userName)}</span></div>
      <table>${body}</table>
      ${nonOp ? `<div class="sec">Fora do resultado (não-operacional)</div><table>${nonOp}</table>` : ''}
      <div class="foot">${esc(instituicao)} · DRE por competência — receitas pelo bruto; impostos complementares provisionados (2,08% · AME 2,38%)</div>
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return toast.error('Permita pop-ups para gerar o PDF.');
    win.document.write(html); win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 350);
  };

  // Drill-down: linha de lançamento (folha) e linha de categoria (recursiva).
  // useGross: na seção de receitas a demonstração parte do BRUTO (gross_amount).
  const txRow = (t, depth, sign, useGross) => (
    <tr key={`tx-${t.id}`} className="border-b border-black/[.03] text-[10.5px] text-slate-500 bg-slate-50/50">
      <td className="py-1.5 px-3" style={{ paddingLeft: `${28 + depth * 18}px` }}>
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="tabular-nums text-slate-400 shrink-0">{formatDateBR(t.due_date || t.transaction_date)}</span>
          <span className="truncate max-w-[460px]">{counterpartyName(t) || t.description || '—'}</span>
          {t.reference_month && <span className="text-[9px] text-[#0071e3] shrink-0">comp {t.reference_month.split('-').reverse().join('/')}</span>}
          {useGross && t.gross_amount != null && <span className="text-[9px] text-slate-400 shrink-0">líq. {fmt(Number(t.amount))}</span>}
        </span>
      </td>
      <td className={`py-1.5 px-3 text-right tabular-nums whitespace-nowrap ${sign === '-' ? 'text-rose-500' : 'text-emerald-600'}`}>{sign === '-' ? '- ' : ''}{fmt(useGross && t.gross_amount != null ? Number(t.gross_amount) : Number(t.amount))}</td>
    </tr>
  );
  const renderNode = (node, depth, sign, useGross = false) => {
    const kids = (dre.txByCat[node.id] || []).slice().sort((a, b) => (a.due_date || a.transaction_date || '').localeCompare(b.due_date || b.transaction_date || ''));
    const childCats = node.children.filter(c => Math.abs(c.total) > 0.0049);
    const has = childCats.length > 0 || kids.length > 0;
    const open = expanded.has(node.id);
    const isGroup = depth === 0;
    const out = [
      <tr key={node.id} onClick={has ? () => toggle(node.id) : undefined}
        className={`border-b border-black/[.06] ${isGroup ? 'bg-[#f5f5f7] text-slate-800 text-xs font-semibold' : 'text-[11px] text-slate-600 font-medium'} ${has ? 'cursor-pointer hover:bg-black/[.02]' : ''}`}>
        <td className="py-2 px-3" style={{ paddingLeft: `${12 + depth * 18}px` }}>
          <span className="inline-flex items-center gap-1.5">
            {has ? (open ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />) : <span className="inline-block w-[13px] shrink-0" />}
            <span className={isGroup ? 'uppercase tracking-wide' : ''}>{isGroup ? `${sign === '-' ? '(-)' : '(+)'} ` : ''}{node.name}</span>
            {kids.length > 0 && <span className="text-[9px] font-medium text-slate-400 shrink-0">{kids.length} lçto{kids.length > 1 ? 's' : ''}</span>}
          </span>
        </td>
        <td className={`py-2 px-3 text-right tabular-nums whitespace-nowrap ${isGroup ? (sign === '-' ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-500'}`}>{sign === '-' ? '- ' : ''}{fmt(node.total)}</td>
      </tr>
    ];
    if (open) {
      childCats.forEach(c => { out.push(...renderNode(c, depth + 1, sign, useGross)); });
      kids.forEach(t => out.push(txRow(t, depth + 1, sign, useGross)));
    }
    return out;
  };
  const allOpen = dre.expandableIds.length > 0 && dre.expandableIds.every(id => expanded.has(id));
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(dre.expandableIds));

  return (
    <div className="px-4 sm:px-5 py-4 min-h-[calc(100dvh-64px)] bg-[#f5f5f7] font-sans text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
          <FileText size={18} className="text-[#0071e3]" /> Demonstração do Resultado do Exercício <span className="text-slate-400">· {label}</span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={toggleAll} disabled={loading || dre.expandableIds.length === 0} title={allOpen ? 'Recolher tudo' : 'Expandir tudo (abre categorias e lançamentos)'}
            className="h-9 px-3 inline-flex items-center gap-1.5 bg-white border border-black/[.085] rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm">
            {allOpen ? <ListTree size={14} /> : <Rows3 size={14} />} {allOpen ? 'Recolher' : 'Expandir tudo'}
          </button>
          <button onClick={handlePrint} disabled={loading} title="Imprimir / gerar PDF do DRE"
            className="h-9 px-3 inline-flex items-center gap-1.5 bg-white border border-black/[.085] rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm">
            <Printer size={14} /> Imprimir
          </button>
          <div className="w-52 sm:w-60">
            <SearchableSelect options={ccOptions} value={ccFilter} onChange={setCcFilter}
              placeholder="Centro de custo: todos" searchPlaceholder="Buscar centro de custo…" />
          </div>
          <FinancePeriodBar onChange={load} showBasis />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="text-[#0071e3] animate-spin" /></div>
      ) : (
        <div className="bg-white border border-black/[.085] rounded-2xl p-2 sm:p-3 shadow-sm">
          <table className="w-full text-left border-collapse">
            <tbody>
              {/* RECEITAS — grupos ENTRADA pelo valor BRUTO (expansíveis até os lançamentos) */}
              {dre.revenueGroups.filter(g => Math.abs(g.total) > 0.0049).flatMap(g => renderNode(g, 0, '+', true))}
              <tr className="border-b border-black/[.06] bg-indigo-50/40 font-semibold text-slate-900 text-xs">
                <td className="py-2 px-3 uppercase tracking-wide" style={{ paddingLeft: '12px' }}>(=) Receita Bruta</td>
                <td className="py-2 px-3 text-right text-indigo-700 tabular-nums">{fmt(dre.grossRevenues)}</td>
              </tr>

              {/* DEDUÇÕES DA RECEITA: retenções na fonte + provisão de impostos complementares */}
              <tr className="border-b border-black/[.06] text-[11px] text-slate-600 font-medium">
                <td className="py-2 px-3" style={{ paddingLeft: '12px' }}>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[13px] shrink-0" />(−) Impostos Retidos na Fonte</span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-rose-600">- {fmt(dre.withheldTaxes)}</td>
              </tr>
              <tr className="border-b border-black/[.06] text-[11px] text-slate-600 font-medium">
                <td className="py-2 px-3" style={{ paddingLeft: '12px' }}>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[13px] shrink-0" />(−) Impostos Complementares
                    <span className="text-[9px] text-slate-400">alíquota do lançamento (2,08 · 2,38 · 8,23%) sobre o bruto</span>
                  </span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-rose-600">- {fmt(dre.compTaxes)}</td>
              </tr>
              <tr className="border-b border-black/[.06] bg-indigo-50/40 font-semibold text-slate-900 text-xs">
                <td className="py-2 px-3 uppercase tracking-wide" style={{ paddingLeft: '12px' }}>(=) Receita Líquida</td>
                <td className={`py-2 px-3 text-right tabular-nums ${dre.netRevenues >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>{fmt(dre.netRevenues)}</td>
              </tr>

              {/* CUSTOS/DESPESAS OPERACIONAIS */}
              {dre.expenseGroups.filter(g => Math.abs(g.total) > 0.0049).flatMap(g => renderNode(g, 0, '-'))}

              {/* IRPJ/CSLL (quando houver): LAIR → impostos → Lucro Líquido */}
              {(() => {
                const taxGroups = dre.profitTaxGroups.filter(g => Math.abs(g.total) > 0.0049);
                if (!taxGroups.length) return null;
                return [
                  <tr key="lair" className="border-b border-black/[.06] bg-indigo-50/40 font-semibold text-slate-900 text-xs">
                    <td className="py-2 px-3 uppercase tracking-wide" style={{ paddingLeft: '12px' }}>(=) Lucro Antes dos Impostos (LAIR)</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${dre.lair >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>{fmt(dre.lair)}</td>
                  </tr>,
                  ...taxGroups.flatMap(g => renderNode(g, 0, '-')),
                ];
              })()}

              {/* RESULTADO/LUCRO LÍQUIDO */}
              <tr className="bg-slate-900 text-white font-semibold text-xs">
                <td className="py-2.5 px-3 uppercase tracking-wide rounded-l-xl">(=) {dre.profitTaxes > 0.0049 ? 'Lucro Líquido do Exercício' : 'Resultado Líquido do Exercício'}</td>
                <td className={`py-2.5 px-3 text-right rounded-r-xl tabular-nums ${dre.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(dre.netProfit)}</td>
              </tr>
              <tr className="text-[11px] font-semibold text-slate-500">
                <td className="py-2 px-3 uppercase tracking-wide">Margem Líquida</td>
                <td className={`py-2 px-3 text-right tabular-nums ${dre.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{dre.margin.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>

          {/* Fora do resultado (não-operacional): financiamento, capex, sócio — não afetam o resultado. */}
          {dre.nonOpGroups.length > 0 && (
            <div className="mt-4 border-t border-dashed border-black/[.085] pt-3">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Fora do resultado (não-operacional)</div>
              <table className="w-full text-left border-collapse">
                <tbody>
                  {dre.nonOpGroups.flatMap(g => renderNode(g, 0, g.type === 'ENTRADA' ? '+' : '-'))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10px] font-medium text-slate-400 leading-snug">
                Não entram no Resultado Líquido — são movimentações de caixa/balanço (empréstimos, amortização de principal, compra de ativos, retirada de sócio). Mostradas só para conferência.
              </p>
            </div>
          )}

          <p className="mt-3 text-[10px] font-semibold text-slate-400">Clique nos grupos para <b>abrir as categorias e os lançamentos</b>. Considera todos os lançamentos do período por competência (pagos ou não). Receitas pelo valor <b>bruto</b>; impostos retidos = bruto − líquido informado no lançamento; impostos complementares são <b>provisão calculada</b> pela alíquota escolhida no lançamento (2,08 · 2,38 · 8,23%) sobre o bruto — lançamentos antigos sem escolha usam 2,08% (AME 2,38%). Os DARFs pagos (2.1.1) ficam fora do resultado para não contar duas vezes.</p>
        </div>
      )}
    </div>
  );
}
