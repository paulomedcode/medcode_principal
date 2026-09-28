import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, CircleDollarSign, Download, FileText, Send,
    Settings, X, Loader2, AlertTriangle, Check, Lock, RotateCcw, Banknote,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cup, Dot } from '../finance/cupertino';
import SearchableSelect from '../finance/SearchableSelect';
import BaixaModal from '../finance/BaixaModal';
import { financeService } from '../../services/financeService';
import { useFinanceRealtime } from '../../hooks/useFinanceRealtime';
import { printReport } from '../../utils/printReport';
import { logAction } from '../../utils/logger';
import {
    loadRepasseConfig, saveRepasseConfig, sugerirConfig, sugerirCentroDeCusto,
    fetchRepassesDoMes, folhaKey, enviarFolhaParaFinanceiro, vencimentoDaCompetencia,
    desfazerEnvioFinanceiro,
} from '../../utils/repasseFinanceiro';

/*
 * Repasses — a "planilha" de pagamento dos plantões, dentro da Escala.
 *
 * Uma linha por (hospital, médico) do mês:
 *   Valor Devido  <- folha de ponto (Escala)
 *   Valor Pago / Saldo / Status / Data Pgto  <- financeiro, SOMENTE LEITURA
 *
 * A Escala nunca escreve status nem baixa: quem manda nisso é o financeiro
 * (RPC settle_transaction + trigger). Aqui só se ENVIA a folha assinada como
 * conta a pagar; o resto chega de volta por realtime.
 */

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '—');

/*
 * Status da linha = o ciclo inteiro numa coluna só, do ponto de vista da Escala:
 *   não assinada -> pronta p/ enviar -> no financeiro -> pago parcial -> pago
 *
 * Antes do envio quem manda é a assinatura; depois, quem manda é o financeiro.
 * Sem assinatura a folha NÃO vai — por isso ela tem estado próprio, em vez de
 * ficar escondida atrás de um genérico "não enviada".
 */
// Opções do filtro de status — mesmas chaves devolvidas por statusDaLinha.
const STATUS_FILTROS = [
    { value: 'nao_assinada', label: 'Não assinada' },
    { value: 'pronta', label: 'Pronta p/ enviar' },
    { value: 'pendente', label: 'No financeiro · a pagar' },
    { value: 'lancado', label: 'No financeiro · lançada' },
    { value: 'parcial', label: 'Pago Parcial' },
    { value: 'pago', label: 'Pago' },
];

const statusDaLinha = (tx, assinatura) => {
    if (!tx) {
        return assinatura?.status === 'assinado'
            ? { key: 'pronta', label: 'Pronta p/ enviar', tone: 'accent', enviavel: true }
            : { key: 'nao_assinada', label: 'Não assinada', tone: 'neutral', enviavel: false };
    }
    switch (tx.status) {
        case 'PAGO': return { key: 'pago', label: 'Pago', tone: 'ok', enviavel: false };
        case 'PARCIAL': return { key: 'parcial', label: 'Pago Parcial', tone: 'warn', enviavel: false };
        case 'LANCADO': return { key: 'lancado', label: 'No financeiro · lançada', tone: 'accent', enviavel: false };
        default: return { key: 'pendente', label: 'No financeiro · a pagar', tone: 'accent', enviavel: false };
    }
};

export default function RepassesModal({
    isOpen, onClose, activeMonth, monthLabel, folhaPontoData, folhaAssinaturas,
    hospitais, doctors, currentUser, theme, onNavigateMonth, hasPrevMonth, hasNextMonth,
    onAssinaturasChanged,
}) {
    const [txs, setTxs] = useState([]);
    const [lastPaid, setLastPaid] = useState({});
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(null);
    const [filtroHospital, setFiltroHospital] = useState('');
    const [filtroMedico, setFiltroMedico] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');
    // Lançamento aberto no modal de baixa (o MESMO do financeiro).
    const [baixaRow, setBaixaRow] = useState(null);

    // Configuração (conta, categoria, mapa hospital -> centro de custo)
    const [config, setConfig] = useState(null);
    const [showConfig, setShowConfig] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [costCenters, setCostCenters] = useState([]);

    // Hospitais a configurar = cadastro de unidades UNIDO com os que aparecem na
    // folha do mês. Só a folha do mês não serve: abrir o modal num mês vazio
    // geraria um mapa vazio e a configuração nasceria "confirmada" sem nenhum
    // centro de custo. O cadastro cobre isso; a união cobre folha de unidade
    // que já saiu do cadastro.
    const hospitalNames = useMemo(() => {
        const nomes = new Set();
        (hospitais || []).forEach(h => h?.name && nomes.add(h.name));
        (folhaPontoData?.hospArray || []).forEach(h => h?.name && nomes.add(h.name));
        return [...nomes].sort((a, b) => a.localeCompare(b));
    }, [hospitais, folhaPontoData]);

    // Hospitais que realmente têm folha neste mês — são esses que precisam de
    // centro de custo para o envio funcionar.
    const hospitaisDoMes = useMemo(
        () => (folhaPontoData?.hospArray || []).map(h => h.name),
        [folhaPontoData]
    );

    const loadFinance = useCallback(async (silent = false) => {
        if (!activeMonth) return;
        if (!silent) setLoading(true);
        try {
            const rows = await fetchRepassesDoMes(activeMonth);
            setTxs(rows);
            const ids = rows.filter(r => r.status === 'PAGO' || r.status === 'PARCIAL').map(r => r.id);
            setLastPaid(ids.length ? await financeService.getLastPaymentDates(ids) : {});
        } catch (e) {
            console.error('Erro ao carregar repasses do financeiro', e);
            if (!silent) toast.error('Erro ao carregar dados do financeiro.');
        } finally {
            setLoading(false);
        }
    }, [activeMonth]);

    useEffect(() => { if (isOpen) loadFinance(); }, [isOpen, loadFinance]);

    // Baixa dada no financeiro reflete aqui sem recarregar a página.
    useFinanceRealtime(() => { if (isOpen) loadFinance(true); });

    // Carrega config + listas do financeiro uma vez ao abrir.
    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        (async () => {
            try {
                const [cfg, acc, cats, ccs] = await Promise.all([
                    loadRepasseConfig(), financeService.getAccounts(),
                    financeService.getCategories(), financeService.getCostCenters(),
                ]);
                if (!active) return;
                setAccounts(acc || []); setCategories(cats || []); setCostCenters(ccs || []);
                setConfig(cfg || sugerirConfig({ accounts: acc, categories: cats, costCenters: ccs, hospitalNames }));
            } catch (e) {
                console.error('Erro ao carregar configuração de repasse', e);
            }
        })();
        return () => { active = false; };
    }, [isOpen, hospitalNames]);

    const txPorChave = useMemo(() => {
        const m = {};
        txs.forEach(t => { m[t.shift_id] = t; });
        return m;
    }, [txs]);

    const assinaturaDe = useCallback(
        (doctorName, hospitalName) => (folhaAssinaturas || []).find(
            a => a.doctor_name === doctorName && a.hospital_name === hospitalName
        ),
        [folhaAssinaturas]
    );

    // Uma linha por (hospital, médico) — o formato da planilha.
    const linhas = useMemo(() => {
        const out = [];
        (folhaPontoData?.hospArray || []).forEach(h => {
            h.doctors.forEach(doc => {
                const tx = txPorChave[folhaKey(activeMonth, h.name, doc.name)];
                const pago = Number(tx?.paid_amount) || 0;
                const devido = Number(doc.totalVal) || 0;
                out.push({
                    hospital: h.name,
                    doctorName: doc.name,
                    tipo: 'Plantão',
                    devido,
                    pago,
                    // Saldo sai do lançamento quando existe (o financeiro é a
                    // verdade); sem lançamento, o saldo é tudo que se deve.
                    saldo: tx ? Math.max(0, Number(tx.amount) - pago) : devido,
                    tx,
                    status: statusDaLinha(tx, assinaturaDe(doc.name, h.name)),
                    dataPgto: tx ? lastPaid[tx.id] : null,
                    assinatura: assinaturaDe(doc.name, h.name),
                    shifts: doc.shifts,
                });
            });
        });
        return out.sort((a, b) => a.hospital.localeCompare(b.hospital) || a.doctorName.localeCompare(b.doctorName));
    }, [folhaPontoData, txPorChave, activeMonth, lastPaid, assinaturaDe]);

    const linhasFiltradas = useMemo(() => linhas.filter(l =>
        (!filtroHospital || l.hospital === filtroHospital) &&
        (!filtroMedico || l.doctorName === filtroMedico) &&
        (!filtroStatus || l.status.key === filtroStatus)
    ), [linhas, filtroHospital, filtroMedico, filtroStatus]);

    const totais = useMemo(() => linhasFiltradas.reduce((acc, l) => ({
        devido: acc.devido + l.devido,
        pago: acc.pago + l.pago,
        saldo: acc.saldo + l.saldo,
        prontas: acc.prontas + (l.status.enviavel ? 1 : 0),
        semAssinatura: acc.semAssinatura + (l.status.key === 'nao_assinada' ? 1 : 0),
    }), { devido: 0, pago: 0, saldo: 0, prontas: 0, semAssinatura: 0 }), [linhasFiltradas]);

    // Só "pronta" quando TODO hospital com folha neste mês tem centro de custo.
    // Conta + categoria + confirmedAt não bastam: sem o centro de custo o envio
    // seria barrado folha a folha, e o aviso some dando falsa sensação de ok.
    const hospitaisSemCentro = useMemo(
        () => hospitaisDoMes.filter(h => !config?.hospitals?.[h]),
        [hospitaisDoMes, config]
    );
    const configPronta = !!(config?.confirmedAt && config?.accountId && config?.categoryId)
        && hospitaisSemCentro.length === 0;

    // ---- Envio ao financeiro -------------------------------------------------
    const enviarLote = async (alvo, rotulo) => {
        if (!configPronta) {
            toast.error('Confira a configuração de repasse antes do primeiro envio.', { duration: 5000 });
            setShowConfig(true);
            return;
        }
        setSending(rotulo);
        const resultados = [];
        try {
            for (const l of alvo) {
                // eslint-disable-next-line no-await-in-loop
                const r = await enviarFolhaParaFinanceiro({
                    doctorName: l.doctorName, hospitalName: l.hospital, monthVal: activeMonth,
                    shifts: l.shifts, assinatura: l.assinatura, config, doctorsList: doctors, currentUser,
                });
                resultados.push(r);
            }
        } catch (e) {
            console.error('Erro ao enviar para o financeiro', e);
            toast.error('Erro ao enviar para o financeiro.');
        } finally {
            setSending(null);
        }

        const enviadas = resultados.filter(r => r.status === 'enviada');
        const jaEnviadas = resultados.filter(r => r.status === 'ja_enviada');
        const bloqueadas = resultados.filter(r => r.status === 'bloqueada');

        if (enviadas.length) {
            toast.success(`${enviadas.length} folha(s) enviada(s) para contas a pagar.`);
            logAction('escala_repasse_enviado', `Enviou ${enviadas.length} folha(s) de ${activeMonth} para o financeiro: ${enviadas.map(r => `${r.doctorName} (${r.hospitalName})`).join(' | ')}`);
        }
        if (jaEnviadas.length) toast(`${jaEnviadas.length} já estava(m) no financeiro — não duplicou.`, { icon: 'ℹ️' });
        bloqueadas.forEach(b => toast.error(`${b.doctorName} (${b.hospitalName}): ${b.motivo}`, { duration: 7000 }));

        await loadFinance(true);
    };

    // Enviável = assinada E ainda não enviada. Contar folha não assinada aqui
    // faria os botões prometerem um envio que as travas iriam recusar depois.
    const enviaveis = (arr) => arr.filter(l => l.status.enviavel);

    // Desfaz o envio de UMA folha: apaga a conta a pagar e libera novo envio.
    // Só passa se o lançamento não tiver baixa nem conciliação — a checagem
    // real acontece no util, relendo o banco na hora.
    const desfazerEnvio = async (l) => {
        const ok = window.confirm(
            `Desfazer o envio da folha de ${l.doctorName} (${l.hospital})?\n\n` +
            `A conta a pagar de ${fmt(l.devido)} será APAGADA do Financeiro e a folha volta a ficar "Pronta p/ enviar".\n\n` +
            `Se já houver qualquer baixa ou conciliação, a operação será recusada — nesse caso, estorne no Financeiro primeiro.`
        );
        if (!ok) return;
        const chave = `undo-${l.hospital}-${l.doctorName}`;
        setSending(chave);
        try {
            const r = await desfazerEnvioFinanceiro({ assinatura: l.assinatura, transactionId: l.tx?.id });
            if (r.status === 'bloqueada') {
                toast.error(`${l.doctorName}: ${r.motivo}`, { duration: 8000 });
            } else {
                toast.success('Envio desfeito. A folha voltou para "Pronta p/ enviar".');
                logAction('escala_repasse_envio_desfeito', `Desfez o envio da folha de ${l.doctorName} (${l.hospital}, ${activeMonth}) — conta a pagar apagada do financeiro.`);
            }
        } catch (e) {
            console.error('Erro ao desfazer envio', e);
            toast.error('Erro ao desfazer o envio.');
        } finally {
            setSending(null);
            await loadFinance(true);
            onAssinaturasChanged?.();
        }
    };

    // ---- Exportações ---------------------------------------------------------
    const exportCSV = () => {
        if (!linhasFiltradas.length) return toast.error('Nada para exportar.');
        const head = ['Hospital', 'Medico', 'Tipo', 'Valor Devido', 'Valor Pago', 'Saldo', 'Status', 'Data Pgto'];
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const body = linhasFiltradas.map(l => [
            l.hospital, l.doctorName, l.tipo,
            l.devido.toFixed(2).replace('.', ','), l.pago.toFixed(2).replace('.', ','),
            l.saldo.toFixed(2).replace('.', ','), l.status.label, l.dataPgto ? fmtDate(l.dataPgto) : '',
        ].map(esc).join(';'));
        // BOM na frente para o Excel pt-BR não quebrar os acentos
        const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `repasses_${activeMonth}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const exportPDF = () => {
        if (!linhasFiltradas.length) return toast.error('Nada para imprimir.');
        printReport({
            theme,
            title: 'Repasses — Folha de Ponto',
            periodText: monthLabel || activeMonth,
            userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema',
            orientation: 'landscape',
            columns: [
                { header: 'Hospital' }, { header: 'Médico' }, { header: 'Tipo' },
                { header: 'Valor Devido', align: 'right' }, { header: 'Valor Pago', align: 'right' },
                { header: 'Saldo', align: 'right' }, { header: 'Status' }, { header: 'Data Pgto', align: 'center' },
            ],
            rows: linhasFiltradas.map(l => [
                l.hospital, l.doctorName, l.tipo, fmt(l.devido), fmt(l.pago), fmt(l.saldo),
                l.status.label, l.dataPgto ? fmtDate(l.dataPgto) : '—',
            ]),
            summary: [
                { label: 'Total Devido', value: fmt(totais.devido) },
                { label: 'Total Pago', value: fmt(totais.pago) },
                { label: 'Saldo', value: fmt(totais.saldo) },
            ],
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
            <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,.18)] w-full max-w-[1200px] h-[88vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-black/[.085]">

                {/* Header */}
                <div className="px-7 py-4 border-b border-black/[.08] flex items-center justify-between shrink-0 bg-white">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="text-[#86868b] hover:text-[#1d1d1f] p-2 rounded-lg hover:bg-black/[.04] transition-colors">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-black/[.04] text-[#248a3d] flex items-center justify-center shrink-0">
                            <CircleDollarSign size={19} strokeWidth={2} />
                        </div>
                        <div>
                            <h2 className="text-[17px] font-semibold tracking-[-.01em] text-[#1d1d1f] leading-tight">Repasses</h2>
                            <div className="flex items-center gap-0.5 mt-1 bg-black/[.04] rounded-lg p-0.5 w-fit">
                                <button onClick={() => onNavigateMonth('prev')} disabled={!hasPrevMonth} className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-white disabled:opacity-30 transition-colors"><ChevronLeft size={15} strokeWidth={2.5} /></button>
                                <span className="px-2 text-[12.5px] font-medium text-[#1d1d1f] capitalize min-w-[130px] text-center tabular-nums">{monthLabel || activeMonth}</span>
                                <button onClick={() => onNavigateMonth('next')} disabled={!hasNextMonth} className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-white disabled:opacity-30 transition-colors"><ChevronRight size={15} strokeWidth={2.5} /></button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowConfig(true)} className={cup.btn} title="Configurar conta, categoria e centros de custo">
                            <Settings size={13} /> Configurar
                        </button>
                        <button onClick={exportCSV} className={cup.btn}><Download size={13} /> CSV</button>
                        <button onClick={exportPDF} className={cup.btn}><FileText size={13} /> PDF</button>
                        <button
                            onClick={() => enviarLote(enviaveis(linhasFiltradas), 'todos')}
                            disabled={!!sending || enviaveis(linhasFiltradas).length === 0}
                            className={`${cup.btnPrimary} disabled:opacity-40`}
                            title="Envia todas as folhas assinadas ainda não enviadas"
                        >
                            {sending === 'todos' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            Enviar todos ({enviaveis(linhasFiltradas).length})
                        </button>
                    </div>
                </div>

                {/* Corpo */}
                <div className="flex-1 overflow-y-auto px-7 py-5 flex flex-col space-y-4 bg-[#f5f5f7]">

                    {!configPronta && (
                        <div className={`${cup.cardFlat} shrink-0 px-5 py-3.5 flex items-center justify-between gap-4`}>
                            <div className="flex items-center gap-3">
                                <AlertTriangle size={17} className="text-[#bf7a00] shrink-0" />
                                <div>
                                    <p className={cup.title}>Configuração pendente</p>
                                    <p className={`${cup.subtitle} mt-0.5`}>
                                        {hospitaisSemCentro.length > 0
                                            ? `Sem centro de custo: ${hospitaisSemCentro.join(', ')}. Enquanto faltar, o envio desses hospitais fica bloqueado.`
                                            : 'Confirme a conta e a categoria antes do primeiro envio.'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowConfig(true)} className={cup.btnPrimary}>Configurar agora</button>
                        </div>
                    )}

                    {/* Totais */}
                    <div className={`${cup.card} shrink-0 overflow-hidden`}>
                        <div className="flex flex-wrap divide-x divide-black/[.06]">
                            <div className="flex-1 min-w-fit px-4 py-3">
                                <span className={`${cup.label} whitespace-nowrap`}>Total Devido</span>
                                <span className="block text-[19px] leading-none font-semibold text-[#1d1d1f] mt-1.5 tabular-nums whitespace-nowrap">{fmt(totais.devido)}</span>
                            </div>
                            <div className="flex-1 min-w-fit px-4 py-3 bg-[#248a3d]/[.05]">
                                <span className={`${cup.label} whitespace-nowrap`}>Total Pago</span>
                                <span className="block text-[19px] leading-none font-semibold text-[#248a3d] mt-1.5 tabular-nums whitespace-nowrap">{fmt(totais.pago)}</span>
                            </div>
                            <div className="flex-1 min-w-fit px-4 py-3 bg-[#bf7a00]/[.05]">
                                <span className={`${cup.label} whitespace-nowrap`}>Saldo</span>
                                <span className="block text-[19px] leading-none font-semibold text-[#bf7a00] mt-1.5 tabular-nums whitespace-nowrap">{fmt(totais.saldo)}</span>
                            </div>
                            <div className="flex-1 min-w-fit px-4 py-3">
                                <span className={`${cup.label} whitespace-nowrap`}>Prontas p/ Enviar</span>
                                <span className="block text-[19px] leading-none font-semibold text-[#0071e3] mt-1.5 whitespace-nowrap">{totais.prontas}</span>
                            </div>
                            <div className="flex-1 min-w-fit px-4 py-3">
                                <span className={`${cup.label} whitespace-nowrap`}>Sem Assinatura</span>
                                <span className="block text-[19px] leading-none font-semibold text-[#86868b] mt-1.5 whitespace-nowrap">{totais.semAssinatura}</span>
                            </div>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={`${cup.label} mr-1`}>Filtrar</span>
                        <div className="w-[210px]">
                            <SearchableSelect size="sm" allowEmpty emptyLabel="Todos os hospitais" searchPlaceholder="Buscar hospital…"
                                options={hospitalNames.map(h => ({ value: h, label: h }))}
                                value={filtroHospital} onChange={setFiltroHospital} />
                        </div>
                        <div className="w-[240px]">
                            <SearchableSelect size="sm" allowEmpty emptyLabel="Todos os médicos" searchPlaceholder="Buscar médico…"
                                options={[...new Set(linhas.map(l => l.doctorName))].sort().map(n => ({ value: n, label: n }))}
                                value={filtroMedico} onChange={setFiltroMedico} />
                        </div>
                        <div className="w-[200px]">
                            <SearchableSelect size="sm" allowEmpty emptyLabel="Todos os status" searchPlaceholder="Buscar status…"
                                options={STATUS_FILTROS}
                                value={filtroStatus} onChange={setFiltroStatus} />
                        </div>
                        {(filtroHospital || filtroMedico || filtroStatus) && (
                            <button onClick={() => { setFiltroHospital(''); setFiltroMedico(''); setFiltroStatus(''); }}
                                className="w-7 h-7 rounded-lg bg-white text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-colors border border-black/[.06]" title="Limpar filtros">
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {/* Tabela. shrink-0 é obrigatório: filho de flex-column com
                        overflow perde a altura mínima automática e seria espremido,
                        cortando as linhas em vez de deixar o container rolar. */}
                    <div className={`${cup.card} shrink-0 overflow-hidden`}>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px]">
                                <thead className="bg-black/[.02]">
                                    <tr className={`border-b ${cup.hairline}`}>
                                        <th className={cup.th}>Hospital</th>
                                        <th className={cup.th}>Médico</th>
                                        <th className={cup.th}>Tipo</th>
                                        <th className={`${cup.th} text-right`}>Valor Devido</th>
                                        <th className={`${cup.th} text-right`}>Valor Pago</th>
                                        <th className={`${cup.th} text-right`}>Saldo</th>
                                        <th className={cup.th}>Status</th>
                                        <th className={`${cup.th} text-center`}>Data Pgto</th>
                                        <th className={cup.th}></th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${cup.rowline}`}>
                                    {loading ? (
                                        <tr><td colSpan={9} className="py-12 text-center"><Loader2 size={18} className="animate-spin text-[#0071e3] inline" /></td></tr>
                                    ) : linhasFiltradas.length === 0 ? (
                                        <tr><td colSpan={9} className="py-12 text-center">
                                            <p className={cup.title}>Nenhum repasse neste mês</p>
                                            <p className={`${cup.subtitle} mt-1`}>Marque plantões como ✓ Verificado na escala para gerá-los.</p>
                                        </td></tr>
                                    ) : linhasFiltradas.map((l, i) => {
                                        return (
                                            <tr key={i} className={`${cup.hover} transition-colors`}>
                                                <td className="px-3 py-2.5 text-[12px] text-[#1d1d1f]">{l.hospital}</td>
                                                <td className="px-3 py-2.5 text-[12px] font-medium text-[#1d1d1f]">{l.doctorName}</td>
                                                <td className="px-3 py-2.5 text-[12px] text-[#86868b]">{l.tipo}</td>
                                                <td className="px-3 py-2.5 text-[12px] font-medium text-[#1d1d1f] text-right tabular-nums">{fmt(l.devido)}</td>
                                                <td className="px-3 py-2.5 text-[12px] text-right tabular-nums text-[#248a3d]">{l.pago > 0 ? fmt(l.pago) : '—'}</td>
                                                <td className={`px-3 py-2.5 text-[12px] text-right tabular-nums ${l.saldo > 0 ? 'text-[#bf7a00]' : 'text-[#86868b]'}`}>{fmt(l.saldo)}</td>
                                                <td className="px-3 py-2.5"><Dot tone={l.status.tone}>{l.status.label}</Dot></td>
                                                <td className="px-3 py-2.5 text-[11.5px] text-[#86868b] text-center tabular-nums">{fmtDate(l.dataPgto)}</td>
                                                <td className="px-3 py-2.5 text-right">
                                                    {l.status.enviavel ? (
                                                        <button
                                                            onClick={() => enviarLote([l], `${l.hospital}-${l.doctorName}`)}
                                                            disabled={!!sending}
                                                            title="Enviar para contas a pagar"
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10.5px] font-medium text-[#0071e3] hover:bg-[#0071e3]/[.08] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {sending === `${l.hospital}-${l.doctorName}` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                            Enviar
                                                        </button>
                                                    ) : l.status.key === 'nao_assinada' ? (
                                                        <span className="inline-flex items-center gap-1 text-[10.5px] text-[#86868b]" title="Só folha assinada pelo médico pode ir para o financeiro">
                                                            <Lock size={11} /> aguarda assinatura
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 justify-end">
                                                            {l.saldo > 0 && (
                                                                <button
                                                                    onClick={() => setBaixaRow(l.tx)}
                                                                    title="Dar baixa (pagamento) — registra direto no Financeiro"
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10.5px] font-medium text-[#248a3d] hover:bg-[#248a3d]/[.08] transition-colors"
                                                                >
                                                                    <Banknote size={12} /> Baixa
                                                                </button>
                                                            )}
                                                            {/* Desfazer só faz sentido enquanto não houver baixa: com
                                                                pagamento registrado a operação é recusada de qualquer forma. */}
                                                            {l.pago === 0 && (
                                                                <button
                                                                    onClick={() => desfazerEnvio(l)}
                                                                    disabled={!!sending}
                                                                    title="Desfazer envio (apaga a conta a pagar do Financeiro)"
                                                                    className="w-6 h-6 rounded-md flex items-center justify-center text-[#86868b] hover:text-[#d70015] hover:bg-black/[.04] transition-colors disabled:opacity-40"
                                                                >
                                                                    {sending === `undo-${l.hospital}-${l.doctorName}`
                                                                        ? <Loader2 size={11} className="animate-spin" />
                                                                        : <RotateCcw size={11} />}
                                                                </button>
                                                            )}
                                                            {l.saldo === 0 && (
                                                                <span className="inline-flex items-center gap-1 text-[10.5px] text-[#248a3d]"><Check size={12} /> quitado</span>
                                                            )}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Envio por hospital */}
                    {!filtroMedico && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0 pb-4">
                            <span className={`${cup.label} mr-1`}>Enviar hospital inteiro</span>
                            {(folhaPontoData?.hospArray || [])
                                .filter(h => !filtroHospital || h.name === filtroHospital)
                                .map(h => {
                                    const alvo = enviaveis(linhas.filter(l => l.hospital === h.name));
                                    return (
                                        <button key={h.name} onClick={() => enviarLote(alvo, h.name)} disabled={!!sending || alvo.length === 0}
                                            className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium bg-white border border-black/[.085] text-[#1d1d1f] hover:bg-black/[.03] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                                            {sending === h.name ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                            {h.name} ({alvo.length})
                                        </button>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>

            {/* Baixa: o MESMO modal de Contas a Pagar. Mesma RPC atômica
                (settle_transaction), mesmas travas, suporte a parcial e estorno.
                Dar baixa aqui é exatamente dar baixa no financeiro. */}
            {baixaRow && (
                <BaixaModal
                    row={baixaRow}
                    accounts={accounts}
                    onClose={() => setBaixaRow(null)}
                    onDone={() => loadFinance(true)}
                />
            )}

            {showConfig && (
                <ConfigRepasse
                    config={config} setConfig={setConfig} onClose={() => setShowConfig(false)}
                    accounts={accounts} categories={categories} costCenters={costCenters}
                    hospitalNames={hospitalNames} activeMonth={activeMonth}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Configuração: conta, categoria e o mapa hospital -> centro de custo.
// Exige salvar uma vez (confirmedAt) antes de qualquer envio — as sugestões
// vêm por casamento de nome, e casamento de nome não decide dinheiro sozinho.
// ---------------------------------------------------------------------------
function ConfigRepasse({ config, setConfig, onClose, accounts, categories, costCenters, hospitalNames, activeMonth }) {
    // Parte do que já está salvo e preenche APENAS as lacunas com sugestão por
    // nome. Assim uma configuração salva antes (talvez com o mapa incompleto)
    // ganha as sugestões que faltam, sem sobrescrever o que já foi escolhido.
    const [draft, setDraft] = useState(() => {
        const base = config || { accountId: '', categoryId: '', hospitals: {} };
        const hospitals = { ...(base.hospitals || {}) };
        (hospitalNames || []).forEach(h => {
            if (!hospitals[h]) hospitals[h] = sugerirCentroDeCusto(h, costCenters) || '';
        });
        return { ...base, hospitals };
    });
    const [saving, setSaving] = useState(false);

    const ccOptions = (costCenters || []).map(c => ({ value: c.id, label: c.name }));
    const faltando = hospitalNames.filter(h => !draft.hospitals?.[h]);

    const salvar = async () => {
        if (!draft.accountId) return toast.error('Escolha a conta bancária.');
        if (!draft.categoryId) return toast.error('Escolha a categoria do repasse.');
        setSaving(true);
        try {
            const salvo = await saveRepasseConfig(draft);
            setConfig(salvo);
            await logAction('escala_repasse_config', 'Atualizou a configuração de repasse da Escala (conta, categoria e centros de custo).');
            toast.success('Configuração salva.');
            onClose();
        } catch (e) {
            console.error(e);
            toast.error('Erro ao salvar configuração.');
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 max-h-[85vh] flex flex-col overflow-hidden border border-black/[.085]">
                <div className="px-6 py-4 border-b border-black/[.08] flex items-center justify-between shrink-0">
                    <div>
                        <h3 className={cup.title}>Configuração do Repasse</h3>
                        <p className={`${cup.subtitle} mt-0.5`}>Onde cada lançamento vai nascer no financeiro</p>
                    </div>
                    <button onClick={onClose} className="text-[#86868b] hover:text-[#1d1d1f] p-1.5 rounded-lg hover:bg-black/[.04]"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <div>
                        <label className={`${cup.label} block mb-1.5`}>Conta bancária</label>
                        <SearchableSelect size="sm" placeholder="Selecione…" searchPlaceholder="Buscar conta…"
                            options={(accounts || []).map(a => ({ value: a.id, label: a.name }))}
                            value={draft.accountId} onChange={(v) => setDraft(d => ({ ...d, accountId: v }))} />
                    </div>
                    <div>
                        <label className={`${cup.label} block mb-1.5`}>Categoria (saída)</label>
                        <SearchableSelect size="sm" placeholder="Selecione…" searchPlaceholder="Buscar categoria…"
                            options={(categories || []).filter(c => c.type === 'SAIDA').map(c => ({ value: c.id, label: c.name }))}
                            value={draft.categoryId} onChange={(v) => setDraft(d => ({ ...d, categoryId: v }))} />
                    </div>

                    <div className={`${cup.cardFlat} p-3`}>
                        <p className={cup.subtitle}>
                            Vencimento: último dia do mês seguinte à competência
                            {activeMonth && <> — para <strong className="text-[#1d1d1f]">{activeMonth}</strong> seria <strong className="text-[#1d1d1f]">{fmtDate(vencimentoDaCompetencia(activeMonth))}</strong></>}.
                        </p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className={cup.label}>Centro de custo por hospital</label>
                            {faltando.length > 0 && <Dot tone="warn">{faltando.length} sem centro</Dot>}
                        </div>
                        <p className={`${cup.subtitle} mb-2.5`}>Confira um a um — nomes parecidos (MedVita × MedVitalis) apontam para contratos diferentes.</p>
                        <div className="space-y-2">
                            {hospitalNames.map(h => (
                                <div key={h} className="flex items-center gap-2">
                                    <span className="text-[12px] text-[#1d1d1f] w-[110px] shrink-0 truncate">{h}</span>
                                    <div className="flex-1 min-w-0">
                                        <SearchableSelect size="sm" placeholder="Selecione o contrato…" searchPlaceholder="Buscar centro de custo…"
                                            options={ccOptions} value={draft.hospitals?.[h] || ''}
                                            onChange={(v) => setDraft(d => ({ ...d, hospitals: { ...d.hospitals, [h]: v } }))} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-black/[.08] shrink-0 flex justify-end gap-2">
                    <button onClick={onClose} className={cup.btn}>Cancelar</button>
                    <button onClick={salvar} disabled={saving} className={`${cup.btnPrimary} disabled:opacity-50`}>
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar configuração
                    </button>
                </div>
            </div>
        </div>
    );
}
