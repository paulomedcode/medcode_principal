import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Wallet, Printer, ChevronDown, ChevronLeft, ChevronRight, Loader2, ShieldCheck,
    Info, CalendarRange, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { fetchFolhaShiftsByAssignmentIds } from '../utils/folhaAssinaturas';
import { buildFolhaHtml, printFolhaPages } from '../utils/folhaPdf';
import { cup, Dot } from '../components/finance/cupertino';
import {
    fetchMeusRepasses, fetchLogosDosHospitais, estadoDe, legendaDe, rotuloMes, brl, dataBR,
} from '../utils/meusRepasses';

/*
 * MEUS REPASSES — a folha e o pagamento, do lado de quem plantona.
 *
 * Nasceu de uma reclamação simples: depois de assinar, o médico não achava mais
 * a folha em lugar nenhum. E não achava mesmo — a pendência some da tela inicial
 * no instante da assinatura, e a Folha de Ponto do administrativo fica atrás de
 * uma permissão que plantonista não tem.
 *
 * Esta tela é DELIBERADAMENTE separada do módulo Financeiro. Não é a mesma tela
 * com menos botões: é outro código, que só sabe perguntar por uma coisa (a
 * função meus_repasses() do banco, que decide de quem é a sessão). Assim não
 * existe caminho — nem por bug de permissão, nem por componente compartilhado —
 * que faça o caixa da empresa aparecer para o plantonista.
 *
 * A navegação é MÊS A MÊS, não uma lista do ano inteiro: o médico abre aqui para
 * conferir um fechamento ("o que entra deste mês?"), e o ano todo é a exceção —
 * fica atrás de um botão, para quando ele quer o apanhado.
 */

const anoDe = (monthVal) => (monthVal || '').slice(0, 4);

const MeusRepasses = () => {
    const { currentUser } = useAuth();
    const { theme } = useWhiteLabel();

    const [repasses, setRepasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(null);
    const [logos, setLogos] = useState({});
    // Plantões de cada folha, por id da folha. Vêm do snapshot da assinatura
    // quando existe (o documento que o médico assinou) e da escala só para as
    // folhas antigas, assinadas antes do snapshot existir.
    const [shiftsPorFolha, setShiftsPorFolha] = useState({});
    const [abertos, setAbertos] = useState({});
    const [mesAtivo, setMesAtivo] = useState(null);
    const [verAno, setVerAno] = useState(false);

    const carregar = useCallback(async ({ silencioso = false } = {}) => {
        try {
            const [lista, mapaLogos] = await Promise.all([fetchMeusRepasses(), fetchLogosDosHospitais()]);
            setRepasses(lista);
            setLogos(mapaLogos);
            setErro(null);

            /*
             * O conteúdo de cada folha. O snapshot vem junto na resposta, então
             * só quem não tem (folha assinada antes desta versão) precisa de uma
             * consulta à escala — e essas vão todas numa consulta só.
             */
            const doSnapshot = {};
            const semSnapshot = [];
            lista.forEach(r => {
                const snap = r.signed_snapshot?.shifts;
                if (Array.isArray(snap) && snap.length > 0) doSnapshot[r.folha_id] = snap;
                else semSnapshot.push(r);
            });

            if (semSnapshot.length > 0) {
                const todos = await fetchFolhaShiftsByAssignmentIds(semSnapshot.flatMap(r => r.assignment_ids || []));
                const porId = Object.fromEntries(todos.map(x => [x.slotId, x]));
                semSnapshot.forEach(r => {
                    doSnapshot[r.folha_id] = (r.assignment_ids || []).map(id => porId[id]).filter(Boolean);
                });
            }
            setShiftsPorFolha(doSnapshot);
        } catch (e) {
            console.error('Erro ao carregar Meus Repasses', e);
            if (!silencioso) setErro(e.code === 'SEM_FUNCAO' ? e.message : 'Não foi possível carregar seus repasses.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    /*
     * O status vem do financeiro, então precisa reaparecer aqui quando alguém dá
     * baixa lá. E NÃO por Realtime: finance_transactions está publicada no canal
     * e o RLS está desligado, então assinar essa tabela mandaria para o navegador
     * do médico o evento de todo lançamento da empresa — o oposto do ponto desta
     * tela. Recarregar quando ele volta para a aba resolve o caso real.
     */
    useEffect(() => {
        const aoVoltar = () => { if (!document.hidden) carregar({ silencioso: true }); };
        document.addEventListener('visibilitychange', aoVoltar);
        window.addEventListener('focus', aoVoltar);
        return () => {
            document.removeEventListener('visibilitychange', aoVoltar);
            window.removeEventListener('focus', aoVoltar);
        };
    }, [carregar]);

    /*
     * Três valores diferentes, e confundi-los é o que faz o médico ligar:
     *   bruto     = tudo que ele fez no mês (o que a folha mostra);
     *   adiantado = os plantões que ele já recebeu à vista, durante o mês;
     *   aReceber  = o que entra no repasse do fim do mês (bruto − adiantado).
     * Quando o lançamento existe no financeiro, ele já nasce com o líquido e é
     * ele quem manda.
     */
    const brutoDe = useCallback((r) => {
        const shifts = shiftsPorFolha[r.folha_id];
        return shifts ? shifts.reduce((s, x) => s + (x.val || 0), 0) : Number(r.valor) || 0;
    }, [shiftsPorFolha]);

    const adiantadoDe = useCallback((r) => {
        const shifts = shiftsPorFolha[r.folha_id] || [];
        return shifts.reduce((s, x) => s + (Number(x.avista?.valor) || 0), 0);
    }, [shiftsPorFolha]);

    const aReceberDe = useCallback((r) => {
        if (r.valor !== null && r.valor !== undefined) return Number(r.valor);
        return brutoDe(r) - adiantadoDe(r);
    }, [brutoDe, adiantadoDe]);

    // Quanto deste repasse já caiu na conta: a baixa do financeiro mais o que
    // saiu à vista durante o mês.
    const recebidoDe = useCallback((r) => (Number(r.paid_amount) || 0) + adiantadoDe(r),
        [adiantadoDe]);

    const meses = useMemo(
        () => [...new Set(repasses.map(r => r.month_val).filter(Boolean))].sort().reverse(),
        [repasses]
    );

    // Abre no mês mais recente que ele tem, e não no mês do calendário: folha é
    // sempre de um mês que já fechou.
    useEffect(() => {
        if (!mesAtivo && meses.length > 0) setMesAtivo(meses[0]);
    }, [meses, mesAtivo]);

    const idxMes = meses.indexOf(mesAtivo);
    const anoAtivo = anoDe(mesAtivo) || anoDe(meses[0]);

    const visiveis = useMemo(() => {
        if (verAno) return repasses.filter(r => anoDe(r.month_val) === anoAtivo);
        return repasses.filter(r => r.month_val === mesAtivo);
    }, [repasses, verAno, anoAtivo, mesAtivo]);

    const totais = useMemo(() => {
        let recebido = 0, aReceber = 0, bruto = 0;
        visiveis.forEach(r => {
            bruto += brutoDe(r);
            const recebidoNesta = recebidoDe(r);
            recebido += recebidoNesta;
            aReceber += Math.max(aReceberDe(r) - (Number(r.paid_amount) || 0), 0);
        });
        return { recebido, aReceber, bruto, folhas: visiveis.length };
    }, [visiveis, brutoDe, aReceberDe, recebidoDe]);

    // No modo ano, as folhas continuam agrupadas por competência.
    const grupos = useMemo(() => {
        const porMes = {};
        visiveis.forEach(r => { (porMes[r.month_val] = porMes[r.month_val] || []).push(r); });
        return Object.keys(porMes).sort().reverse().map(mes => ({
            mes,
            itens: porMes[mes].sort((a, b) => a.hospital_name.localeCompare(b.hospital_name)),
            total: porMes[mes].reduce((s, r) => s + brutoDe(r), 0),
        }));
    }, [visiveis, brutoDe]);

    const imprimir = (folha) => {
        try {
            const shifts = shiftsPorFolha[folha.folha_id] || [];
            const ok = printFolhaPages({
                title: `Folha de Ponto - ${folha.doctor_name} - ${rotuloMes(folha.month_val)}`,
                pagesHtml: buildFolhaHtml({
                    doctorName: folha.doctor_name,
                    hospitalName: folha.hospital_name,
                    crm: folha.signed_snapshot?.crm || currentUser?.crm || '',
                    shifts,
                    withValue: true,
                    // O carimbo sai porque a folha chegou aqui assinada — a função
                    // do banco não devolve outra coisa.
                    signature: {
                        status: 'assinado',
                        signature_image: folha.signature_image,
                        signed_at: folha.signed_at,
                        ip_address: folha.ip_address,
                        content_hash: folha.content_hash,
                    },
                    hospitalLogoUrl: logos[folha.hospital_name] || '',
                    brandLogoUrl: theme?.faviconUrl || theme?.logoUrl || '',
                }),
            });
            if (!ok) toast.error('O navegador bloqueou a janela de impressão. Libere os pop-ups deste site.');
        } catch (e) {
            console.error('Erro ao gerar a folha', e);
            toast.error('Não foi possível gerar a folha.');
        }
    };

    if (loading) {
        return (
            <div className={`px-4 sm:px-6 pr-8 py-4 min-h-full ${cup.page} flex items-center justify-center`}>
                <div className="flex flex-col items-center gap-2 opacity-70">
                    <Loader2 className="animate-spin text-[#0071e3]" size={26} />
                    <span className={cup.subtitle}>Carregando seus repasses…</span>
                </div>
            </div>
        );
    }

    const semNada = !erro && repasses.length === 0;

    return (
        <div className={`px-4 sm:px-6 pr-8 py-4 min-h-full ${cup.page} font-sans ${cup.text}`}>

            {/* Cabeçalho */}
            <div className={`mb-4 border-b ${cup.hairline} pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
                <div>
                    <h1 className="text-base font-semibold uppercase tracking-tight flex items-center gap-2">
                        <Wallet className={cup.pos} size={17} />
                        Meus Repasses
                    </h1>
                    <p className={`${cup.label} mt-0.5`}>Suas folhas assinadas e o andamento de cada pagamento</p>
                </div>

                {!semNada && (
                    <div className="flex items-center gap-2">
                        {/* Navegação mês a mês: é assim que se confere um
                            fechamento. O ano inteiro fica atrás de um botão. */}
                        <div className={`flex items-center ${cup.cardFlat} h-9 overflow-hidden`}>
                            <button
                                onClick={() => setMesAtivo(meses[idxMes + 1])}
                                disabled={verAno || idxMes >= meses.length - 1}
                                title="Mês anterior"
                                className="h-full px-2.5 text-[#86868b] hover:bg-black/[.03] disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <span className={`px-2 text-[11.5px] font-semibold whitespace-nowrap ${verAno ? 'text-[#86868b]' : ''}`}>
                                {verAno ? `Ano de ${anoAtivo}` : rotuloMes(mesAtivo)}
                            </span>
                            <button
                                onClick={() => setMesAtivo(meses[idxMes - 1])}
                                disabled={verAno || idxMes <= 0}
                                title="Próximo mês"
                                className="h-full px-2.5 text-[#86868b] hover:bg-black/[.03] disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </div>

                        <button
                            onClick={() => setVerAno(v => !v)}
                            className={verAno ? cup.btnPrimary : cup.btn}
                            title={verAno ? 'Voltar para a visão mensal' : 'Ver todas as folhas do ano'}
                        >
                            <CalendarRange size={14} /> Ano todo
                        </button>
                    </div>
                )}
            </div>

            {erro && (
                <div className={`${cup.card} p-4 flex items-center gap-2 text-[12px] font-medium ${cup.warn}`}>
                    <Info size={15} /> {erro}
                </div>
            )}

            {semNada && (
                <div className={`${cup.card} p-10 text-center`}>
                    <ShieldCheck size={24} className="mx-auto text-[#c7c7cc] mb-2" />
                    <p className={cup.title}>Nenhuma folha assinada ainda</p>
                    <p className={`${cup.subtitle} mt-1`}>
                        Assim que você assinar uma folha de ponto, ela aparece aqui — com o andamento do pagamento.
                    </p>
                </div>
            )}

            {!erro && repasses.length > 0 && (
                <>
                    {/* Faixa de números, no mesmo formato da Folha de Ponto */}
                    <div className={`${cup.card} mb-4 flex flex-wrap divide-x divide-black/[.06] overflow-hidden`}>
                        <div className="flex-1 min-w-fit px-4 py-3">
                            <span className={`${cup.label} whitespace-nowrap`}>{verAno ? `Produzido em ${anoAtivo}` : 'Produzido no mês'}</span>
                            <span className="block text-[19px] leading-none font-semibold tracking-[-.01em] tabular-nums mt-1.5 whitespace-nowrap">R$ {brl(totais.bruto)}</span>
                        </div>
                        <div className="flex-1 min-w-fit px-4 py-3 bg-[#248a3d]/[.05]">
                            <span className={`${cup.label} whitespace-nowrap`}>Já recebido</span>
                            <span className={`block text-[19px] leading-none font-semibold ${cup.pos} tracking-[-.01em] tabular-nums mt-1.5 whitespace-nowrap`}>R$ {brl(totais.recebido)}</span>
                        </div>
                        <div className="flex-1 min-w-fit px-4 py-3 bg-[#bf7a00]/[.05]">
                            <span className={`${cup.label} whitespace-nowrap`}>A receber</span>
                            <span className={`block text-[19px] leading-none font-semibold ${cup.warn} tracking-[-.01em] tabular-nums mt-1.5 whitespace-nowrap`}>R$ {brl(totais.aReceber)}</span>
                        </div>
                        <div className="flex-1 min-w-fit px-4 py-3">
                            <span className={`${cup.label} whitespace-nowrap`}>Folhas</span>
                            <span className="block text-[19px] leading-none font-semibold tracking-[-.01em] tabular-nums mt-1.5 whitespace-nowrap">{totais.folhas}</span>
                        </div>
                    </div>

                    {visiveis.length === 0 && (
                        <div className={`${cup.card} p-8 text-center`}>
                            <p className={cup.title}>Nenhuma folha em {rotuloMes(mesAtivo)}</p>
                            <p className={`${cup.subtitle} mt-1`}>Use as setas para ver outro mês, ou abra o ano todo.</p>
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        {grupos.map(({ mes, itens, total }) => (
                            <div key={mes} className={`${cup.card} overflow-hidden`}>
                                {/* No modo mensal o mês já está no cabeçalho; aqui a faixa
                                    serve ao modo ano, onde separa uma competência da outra. */}
                                {verAno && (
                                    <div className={`px-4 py-2.5 border-b ${cup.hairline} flex items-center justify-between gap-3 bg-black/[.015]`}>
                                        <span className={cup.label}>{rotuloMes(mes)}</span>
                                        <span className="text-[12px] font-semibold tabular-nums">R$ {brl(total)}</span>
                                    </div>
                                )}

                                <div className={`divide-y ${cup.rowline}`}>
                                    {itens.map(r => {
                                        const estado = estadoDe(r);
                                        const aberto = !!abertos[r.folha_id];
                                        const shifts = shiftsPorFolha[r.folha_id] || [];
                                        const adiantado = adiantadoDe(r);
                                        const doSnapshot = Array.isArray(r.signed_snapshot?.shifts) && r.signed_snapshot.shifts.length > 0;
                                        // Folha antiga (sem snapshot) que perdeu plantão na
                                        // escala: o documento assinado não bate mais.
                                        const faltando = doSnapshot ? 0 : (r.assignment_ids || []).length - shifts.length;

                                        return (
                                            <div key={r.folha_id}>
                                                <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${cup.hover} transition-colors`}>
                                                    <button
                                                        onClick={() => setAbertos(p => ({ ...p, [r.folha_id]: !p[r.folha_id] }))}
                                                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                                                    >
                                                        <ChevronDown size={14} className={`shrink-0 text-[#c7c7cc] transition-transform ${aberto ? 'rotate-180' : ''}`} />
                                                        <div className="min-w-0">
                                                            <h4 className="text-[12.5px] font-semibold">{r.hospital_name}</h4>
                                                            <p className={cup.subtitle}>{legendaDe(r)}</p>
                                                        </div>
                                                    </button>

                                                    <div className="flex items-center gap-4 shrink-0 pl-6 sm:pl-0">
                                                        <Dot tone={estado.tone}>{estado.label}</Dot>

                                                        <div className="text-right min-w-[130px]">
                                                            <span className="block text-[13px] font-semibold tabular-nums">R$ {brl(brutoDe(r))}</span>
                                                            {adiantado > 0 && (
                                                                <span className={`block text-[10px] ${cup.pos} tabular-nums leading-tight`}>
                                                                    − R$ {brl(adiantado)} já pago · repasse R$ {brl(aReceberDe(r))}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <button
                                                            onClick={() => imprimir(r)}
                                                            title="Abrir a folha assinada em PDF"
                                                            className="w-7 h-7 rounded-md flex items-center justify-center text-[#86868b] hover:text-[#0071e3] hover:bg-black/[.04] transition-colors"
                                                        >
                                                            <Printer size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {aberto && (
                                                    <div className="px-4 pb-4 pt-0 sm:pl-10">
                                                        {faltando > 0 && (
                                                            <div className={`mb-2 rounded-lg border border-[#d70015]/20 bg-[#d70015]/[.04] px-3 py-2 text-[11px] font-medium ${cup.neg} flex items-start gap-2`}>
                                                                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                                                                <span>
                                                                    {faltando === 1 ? '1 plantão desta folha não está mais na escala' : `${faltando} plantões desta folha não estão mais na escala`}.
                                                                    O documento assinado deixou de bater com o que existe hoje — fale com a administração.
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className={`rounded-lg border ${cup.hairline} overflow-hidden`}>
                                                            <table className="w-full">
                                                                <thead className="bg-black/[.015]">
                                                                    <tr>
                                                                        <th className={cup.th}>Data</th>
                                                                        <th className={cup.th}>Horário</th>
                                                                        <th className={`${cup.th} text-right`}>Valor</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className={`divide-y ${cup.rowline}`}>
                                                                    {shifts.map(s => (
                                                                        <tr key={s.slotId} className={s.avista ? 'bg-[#248a3d]/[.04]' : undefined}>
                                                                            <td className="px-3 py-2 text-[12px] font-medium align-top whitespace-nowrap">{s.displayDate || '—'}</td>
                                                                            <td className="px-3 py-2 text-[12px] text-[#86868b] align-top">
                                                                                {s.outros ? (s.subtitle || 'Outros') : s.time}
                                                                                {/* O dia que ele já recebeu, com a data do
                                                                                    pagamento: é a resposta para "esse plantão
                                                                                    não me pagaram?". */}
                                                                                {s.avista && (
                                                                                    <span className={`block text-[9.5px] font-semibold uppercase tracking-[.06em] ${cup.pos} mt-0.5`}>
                                                                                        pago em {dataBR(s.avista.data)}
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-3 py-2 text-[12px] font-medium text-right tabular-nums align-top whitespace-nowrap">R$ {brl(s.val)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                                <tfoot className={`border-t ${cup.hairline} bg-black/[.015]`}>
                                                                    <tr>
                                                                        <td colSpan={2} className="px-3 py-2 text-[11px] text-[#86868b]">Total da folha</td>
                                                                        <td className="px-3 py-2 text-[12px] font-semibold text-right tabular-nums">R$ {brl(brutoDe(r))}</td>
                                                                    </tr>
                                                                    {adiantado > 0 && (
                                                                        <>
                                                                            <tr>
                                                                                <td colSpan={2} className={`px-3 py-2 text-[11px] ${cup.pos}`}>(−) Já pago</td>
                                                                                <td className={`px-3 py-2 text-[12px] font-semibold text-right tabular-nums ${cup.pos}`}>R$ {brl(adiantado)}</td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td colSpan={2} className="px-3 py-2 text-[11px] font-semibold">= A receber no repasse</td>
                                                                                <td className={`px-3 py-2 text-[13px] font-semibold text-right tabular-nums ${cup.accent}`}>R$ {brl(aReceberDe(r))}</td>
                                                                            </tr>
                                                                        </>
                                                                    )}
                                                                </tfoot>
                                                            </table>
                                                        </div>

                                                        <p className={`${cup.subtitle} mt-2 flex items-center gap-1.5`}>
                                                            <ShieldCheck size={12} className={cup.pos} />
                                                            Assinada por você em {new Date(r.signed_at).toLocaleString('pt-BR')}
                                                            {doSnapshot && ' · documento preservado como assinado'}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default MeusRepasses;
