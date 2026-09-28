import React, { useState, useEffect, useRef } from 'react';
import { FileSignature, X, ShieldCheck, Loader2, Eraser, Printer, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    fetchFolhaShiftsByAssignmentIds,
    signFolha,
} from '../../utils/folhaAssinaturas';
import { buildFolhaHtml, buildFolhaDocumento, printFolhaPages } from '../../utils/folhaPdf';
import { fetchLogosDosHospitais } from '../../utils/meusRepasses';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';

/*
 * Modal de assinatura da Folha de Ponto (Nível 1 — assinatura eletrônica
 * simples, sem certificado digital): mostra os plantões que compõem a folha,
 * colhe o traço no canvas e grava hash + autor + IP + data/hora.
 *
 * Vive fora do card que o abre porque quem lista a pendência é o card único de
 * Pendências (widgetsPendencias.jsx) — a assinatura é uma pendência entre
 * outras, não um widget próprio.
 */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatMonthLabel = (monthVal) => {
    if (!monthVal || !monthVal.includes('-')) return monthVal || '';
    const [y, m] = monthVal.split('-');
    return `${MESES[parseInt(m, 10) - 1] || m} de ${y}`;
};

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const SignFolhaModal = ({ record, currentUser, onClose, onSigned }) => {
    const { theme } = useWhiteLabel();
    const [logos, setLogos] = useState({});
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [signing, setSigning] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);
    const canvasRef = useRef(null);
    const drawingRef = useRef(false);

    const getCanvasPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const handlePointerDown = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        canvas.setPointerCapture(e.pointerId);
        const ctx = canvas.getContext('2d');
        const { x, y } = getCanvasPos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        drawingRef.current = true;
    };

    const handlePointerMove = (e) => {
        if (!drawingRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const { x, y } = getCanvasPos(e);
        ctx.lineTo(x, y);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        setHasSignature(true);
    };

    const handlePointerUp = () => { drawingRef.current = false; };

    const handleClearSignature = () => {
        const canvas = canvasRef.current;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
    };

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [data, mapaLogos] = await Promise.all([
                    fetchFolhaShiftsByAssignmentIds(record.assignment_ids),
                    fetchLogosDosHospitais(),
                ]);
                if (active) { setShifts(data); setLogos(mapaLogos); }
            } catch (e) {
                console.error('Erro ao carregar plantões da folha', e);
                toast.error('Erro ao carregar a folha.');
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [record.id]);

    const total = shifts.reduce((s, a) => s + (a.val || 0), 0);
    const adiantado = shifts.reduce((s, a) => s + (Number(a.avista?.valor) || 0), 0);

    /*
     * Plantões que a folha diz ter, mas que não existem mais na escala.
     *
     * Aconteceu de verdade: uma folha de agosto ficou assinada apontando para
     * um plantão excluído depois, e o PDF saiu com o carimbo de assinatura e
     * nenhuma linha. Assinar um documento que já não corresponde à escala é o
     * contrário do que a assinatura serve para fazer — então aqui isso vira
     * bloqueio, não aviso.
     */
    const faltando = (record.assignment_ids || []).length - shifts.length;

    // O documento em si — o mesmo HTML que vira PDF. O médico assina olhando a
    // folha inteira (cabeçalho, tabela, quadro do pagamento à vista, totais), e
    // não um resumo reescrito por outra tela.
    const documentoHtml = buildFolhaDocumento({
        title: `Folha de Ponto - ${record.doctor_name}`,
        pagesHtml: buildFolhaHtml({
            doctorName: record.doctor_name,
            hospitalName: record.hospital_name,
            crm: currentUser?.crm || '',
            shifts,
            withValue: true,
            signature: null,
            hospitalLogoUrl: logos[record.hospital_name] || '',
            brandLogoUrl: theme?.faviconUrl || theme?.logoUrl || '',
        }),
    });

    const verDocumento = () => {
        const ok = printFolhaPages({
            title: `Folha de Ponto - ${record.doctor_name} - ${formatMonthLabel(record.month_val)}`,
            pagesHtml: buildFolhaHtml({
                doctorName: record.doctor_name,
                hospitalName: record.hospital_name,
                crm: currentUser?.crm || '',
                shifts,
                withValue: true,
                signature: null,
                hospitalLogoUrl: logos[record.hospital_name] || '',
                brandLogoUrl: theme?.faviconUrl || theme?.logoUrl || '',
            }),
        });
        if (!ok) toast.error('O navegador bloqueou a janela. Libere os pop-ups deste site.');
    };

    const handleConfirm = async () => {
        if (faltando > 0) {
            toast.error('Esta folha mudou desde o envio e não pode ser assinada. Peça para a administração reenviar.', { duration: 7000 });
            return;
        }
        if (!hasSignature) {
            toast.error('Desenhe sua assinatura no campo antes de confirmar.');
            return;
        }
        setSigning(true);
        try {
            const signatureImage = canvasRef.current.toDataURL('image/png');
            await signFolha({ record, liveShifts: shifts, currentUser, signatureImage });
            toast.success('Folha assinada!');
            onSigned(record.id);
        } catch (e) {
            if (e.code === 'HASH_MISMATCH') {
                toast.error(e.message, { duration: 6000 });
            } else {
                console.error('Erro ao assinar folha', e);
                toast.error('Erro ao assinar a folha.');
            }
        } finally {
            setSigning(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md" onClick={onClose}></div>
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg relative z-10 max-h-[85vh] flex flex-col overflow-hidden border border-white/60">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
                            <FileSignature size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900">Assinar Folha de Ponto</h2>
                            <p className="text-[11px] font-semibold text-slate-500">{record.hospital_name} · {formatMonthLabel(record.month_val)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-70">
                            <Loader2 size={20} className="animate-spin text-indigo-500" />
                            <span className="text-xs font-semibold text-slate-500">Carregando plantões...</span>
                        </div>
                    ) : (
                        <>
                            {faltando > 0 && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 mb-4 flex items-start gap-2.5">
                                    <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-[12.5px] font-bold text-rose-800">Esta folha mudou depois que foi enviada</p>
                                        <p className="text-[11px] font-medium text-rose-700/90 mt-0.5 leading-relaxed">
                                            {faltando === 1 ? '1 plantão desta folha não existe mais' : `${faltando} plantões desta folha não existem mais`} na escala.
                                            Não assine: peça para a administração corrigir a escala e reenviar a folha.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* A folha inteira, do jeito que vai virar PDF. Em iframe
                                para o CSS do documento (tabelas com borda preta, A4)
                                não vazar para o app nem o do app entrar nele; sandbox
                                vazio porque o documento não precisa de script nenhum. */}
                            <iframe
                                title="Folha de ponto"
                                srcDoc={documentoHtml}
                                sandbox=""
                                className="w-full h-[46vh] min-h-[300px] sm:h-[440px] rounded-xl border border-slate-200 bg-white"
                            />

                            {/* No celular o total e o botão não cabem lado a lado sem
                                quebrar o número no meio. */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2 mb-4">
                                <p className="text-[11px] font-semibold text-slate-500">
                                    Total da folha <span className="text-slate-800 tabular-nums">R$ {brl(total)}</span>
                                    {adiantado > 0 && (
                                        <> · a receber <span className="text-indigo-600 tabular-nums">R$ {brl(total - adiantado)}</span></>
                                    )}
                                </p>
                                <button
                                    onClick={verDocumento}
                                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors shrink-0"
                                >
                                    <Printer size={13} /> Abrir em PDF
                                </button>
                            </div>

                            <p className="text-[11px] font-medium text-slate-500 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4">
                                Ao confirmar, você declara que reconhece as informações acima como corretas. Isso fica registrado com data, hora e IP como assinatura eletrônica desta folha, e o documento é guardado exatamente como está aqui.
                            </p>

                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Assine no campo abaixo</span>
                                <button onClick={handleClearSignature} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors">
                                    <Eraser size={11} /> Limpar
                                </button>
                            </div>
                            <canvas
                                ref={canvasRef}
                                width={500}
                                height={150}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerUp}
                                className="w-full h-[110px] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 touch-none cursor-crosshair"
                            />
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || signing || !hasSignature || faltando > 0}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 transition-colors shadow-md shadow-indigo-600/25"
                    >
                        {signing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        Confirmar e Assinar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignFolhaModal;
