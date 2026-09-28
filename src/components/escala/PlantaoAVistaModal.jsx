import React, { useState, useEffect } from 'react';
import { X, Loader2, Banknote, Undo2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { financeService } from '../../services/financeService';
import { todayISO } from '../../utils/date';
import { PAYMENT_METHODS } from '../finance/paymentMethods';
import { registrarPlantaoAVista, desfazerPlantaoAVista, folhaJaEnviada } from '../../utils/plantaoAVista';
import { folhaAssinadaDoPlantao } from '../../utils/folhaAssinaturas';
import { loadRepasseConfig } from '../../utils/repasseFinanceiro';

const fmt = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

/*
 * PLANTÃO À VISTA — o pop-up de pagar um dia na hora, em vez de esperar o
 * fechamento do mês.
 *
 * Tem a cara e os campos da baixa do financeiro (conta, data, forma,
 * documento) porque é a mesma decisão: de onde saiu, quando e como. Mas não é
 * o BaixaModal — lá existe um lançamento esperando baixa; aqui o lançamento
 * nasce neste clique. Reaproveitar o componente exigiria criar o lançamento
 * antes de abrir a tela, e deixar lixo no financeiro se a pessoa desistisse.
 *
 * O valor não é editável: à vista se paga o plantão inteiro (decisão do
 * Paulo). Adiantar metade de um plantão continua sendo baixa parcial da folha,
 * no financeiro.
 */
const PlantaoAVistaModal = ({ plantao, onClose, onDone }) => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [folhaEnviada, setFolhaEnviada] = useState(false);
    const [folhaAssinada, setFolhaAssinada] = useState(false);
    // Conta, categoria e centro de custo do repasse: o pagamento do plantão cai
    // exatamente onde cairia o repasse do mês, senão ele sumiria do contrato do
    // hospital no DRE. Sem essa configuração não dá para lançar nada.
    const [config, setConfig] = useState(null);
    const [form, setForm] = useState({ date: todayISO(), method: 'PIX', accountId: '', doc: '' });

    const jaPago = !!plantao?.avista;

    useEffect(() => {
        let ativo = true;
        (async () => {
            try {
                const [acc, cfg, enviada, assinada] = await Promise.all([
                    financeService.getAccounts(),
                    loadRepasseConfig(),
                    // Depois que a folha do mês virou conta a pagar, o valor cheio
                    // já está no financeiro: pagar aqui criaria uma segunda
                    // saída pelo mesmo plantão.
                    jaPago ? Promise.resolve(false) : folhaJaEnviada(plantao.monthVal, plantao.hospitalName, plantao.doctorName),
                    jaPago ? Promise.resolve(null) : folhaAssinadaDoPlantao(plantao.assignmentId),
                ]);
                if (!ativo) return;
                setAccounts(acc || []);
                setConfig(cfg);
                setFolhaEnviada(enviada);
                setFolhaAssinada(!!assinada);
                setForm(f => ({ ...f, accountId: f.accountId || (acc?.[0]?.id || '') }));
            } catch (e) {
                console.error('Erro ao preparar o pagamento do plantão', e);
                toast.error('Erro ao carregar as contas.');
            } finally {
                if (ativo) setLoading(false);
            }
        })();
        return () => { ativo = false; };
    }, [plantao, jaPago]);

    const confirmar = async () => {
        setSaving(true);
        try {
            const r = await registrarPlantaoAVista({
                assignmentId: plantao.assignmentId,
                doctorName: plantao.doctorName,
                hospitalName: plantao.hospitalName,
                monthVal: plantao.monthVal,
                displayDate: plantao.displayDate,
                valor: plantao.valor,
                data: form.date,
                contaId: form.accountId,
                forma: form.method,
                doc: form.doc,
                config,
                doctorsList: plantao.doctorsList,
                jaEnviadaAoFinanceiro: folhaEnviada,
            });
            if (r.status === 'bloqueada') {
                toast.error(r.motivo, { duration: 7000 });
                return;
            }
            toast.success(r.status === 'ja_pago' ? 'Este plantão já estava marcado como pago.' : 'Pagamento do plantão registrado!');
            onDone?.({ data: form.date, valor: plantao.valor, transactionId: r.transactionId });
        } catch (e) {
            console.error('Erro ao registrar o pagamento do plantão', e);
            toast.error(e?.message || 'Erro ao registrar o pagamento.');
        } finally {
            setSaving(false);
        }
    };

    const desfazer = async () => {
        if (!window.confirm('Desfazer o pagamento deste plantão? A baixa é estornada e o lançamento apagado no financeiro — o plantão volta a ser pago no repasse do mês.')) return;
        setSaving(true);
        try {
            const r = await desfazerPlantaoAVista({
                assignmentId: plantao.assignmentId,
                transactionId: plantao.avista?.transactionId,
            });
            if (r.status === 'bloqueada') {
                toast.error(r.motivo, { duration: 7000 });
                return;
            }
            toast.success('Pagamento desfeito.');
            onDone?.(null);
        } catch (e) {
            console.error('Erro ao desfazer o pagamento do plantão', e);
            toast.error(e?.message || 'Erro ao desfazer o pagamento.');
        } finally {
            setSaving(false);
        }
    };

    const campo = 'w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all';

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md" onClick={onClose}></div>
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md relative z-10 border border-white/60 overflow-hidden">

                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/25 shrink-0">
                            <Banknote size={18} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-slate-900">Plantão Já Pago</h2>
                            <p className="text-[11px] font-semibold text-slate-500 truncate">
                                {plantao?.displayDate ? `${plantao.displayDate} · ` : ''}{plantao?.hospitalName}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-5 py-4">
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50/50 rounded-xl px-3.5 py-2.5 flex items-center justify-between border border-emerald-100/80 mb-4">
                        <span className="text-[11px] font-bold text-emerald-700/70 uppercase tracking-wider">Valor do plantão</span>
                        <span className="text-[15px] font-black text-emerald-700 tracking-tight tabular-nums">{fmt(plantao?.valor)}</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-8 gap-2 opacity-70">
                            <Loader2 size={18} className="animate-spin text-emerald-500" />
                            <span className="text-xs font-semibold text-slate-500">Carregando...</span>
                        </div>
                    ) : jaPago ? (
                        <>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-start gap-2.5">
                                <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-emerald-800">Já pago em {fmtDate(plantao.avista.data)}</p>
                                    <p className="text-[11px] font-medium text-emerald-700/80 mt-0.5">
                                        {fmt(plantao.avista.valor)} — sai na folha de ponto do mês e é descontado do repasse.
                                    </p>
                                    <p className="text-[11px] font-medium text-emerald-700/80 mt-1.5">
                                        Enquanto este pagamento existir, o plantão não pode ser alterado. Desfazer estorna a baixa no financeiro e libera a edição.
                                    </p>
                                </div>
                            </div>
                            <p className="text-[11px] font-medium text-slate-500 leading-relaxed mt-3">
                                O médico vê este dia marcado como já pago, com a data, tanto na folha quanto na tela Meus Repasses.
                            </p>
                        </>
                    ) : folhaAssinada ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] font-semibold text-amber-800 leading-relaxed">
                            A folha deste mês <strong>já foi assinada</strong> pelo médico, com este plantão inteiro a receber.
                            Marcar o pagamento agora mudaria o valor que ele assinou e invalidaria a assinatura.
                            <br /><br />
                            Cancele a assinatura na <strong>Folha de Ponto</strong>, registre o pagamento e reenvie para assinar.
                        </div>
                    ) : !config?.categoryId || !config?.hospitals?.[plantao.hospitalName] ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] font-semibold text-amber-800 leading-relaxed">
                            O repasse ainda não está configurado para <strong>{plantao.hospitalName}</strong> (categoria e centro de custo).
                            <br /><br />
                            Abra <strong>Financeiro → Repasses</strong> na Escala e confirme a configuração antes de registrar o pagamento.
                        </div>
                    ) : folhaEnviada ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] font-semibold text-amber-800 leading-relaxed">
                            A folha deste médico neste mês <strong>já foi enviada ao financeiro</strong> com o valor cheio. Registrar o pagamento agora criaria uma segunda saída pelo mesmo plantão.
                            <br /><br />
                            Dê baixa parcial no lançamento do repasse, ou desfaça o envio antes.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Pago em</label>
                                    <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={campo} />
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Forma</label>
                                    <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={`${campo} cursor-pointer`}>
                                        {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Conta de saída</label>
                                <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className={`${campo} cursor-pointer`}>
                                    <option value="">Selecione a conta…</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Documento / comprovante <span className="font-normal text-slate-400">(opcional)</span></label>
                                <input type="text" value={form.doc} onChange={(e) => setForm({ ...form, doc: e.target.value })} placeholder="Nº do comprovante, recibo…" className={campo} />
                            </div>

                            <p className="text-[11px] font-medium text-slate-500 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-3">
                                O plantão continua saindo na folha de ponto pelo valor cheio — e o repasse do mês vem descontado deste valor, para não pagar duas vezes.
                                <br /><br />
                                Ao confirmar, este plantão também fica <strong>Verificado</strong> e passa a somente leitura: para alterar qualquer coisa nele depois, é preciso desfazer o pagamento aqui. A marca de verificado é definitiva e não volta atrás.
                            </p>
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex justify-between items-center gap-2">
                    {jaPago ? (
                        <button
                            onClick={desfazer}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                            Desfazer pagamento
                        </button>
                    ) : <span />}

                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                            Fechar
                        </button>
                        {!jaPago && !folhaEnviada && !folhaAssinada && config?.categoryId && config?.hospitals?.[plantao.hospitalName] && (
                            <button
                                onClick={confirmar}
                                disabled={loading || saving || !form.accountId}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 transition-colors shadow-md shadow-emerald-600/25"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
                                Confirmar pagamento
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlantaoAVistaModal;
