import React, { useCallback, useEffect, useState } from 'react';
import { FileText, FileDown, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { financeService } from '../../services/financeService';
import { fmtBRL, fmtData } from '../../config/servicos';
import { usePermission } from '../../contexts/PermissionContext';
import { QuoteModal } from '../../pages/finance/Quotes';
import PdfsProposta from './PdfsProposta';
import { CARD, Etiqueta } from '../crm/ui';

const STATUS_PROPOSTA = { PENDENTE: 'bg-amber-50 text-amber-700 border-amber-100', APROVADO: 'bg-emerald-50 text-emerald-700 border-emerald-100', RECUSADO: 'bg-rose-50 text-rose-700 border-rose-100' };

/**
 * Bloco "Propostas" da oportunidade (Vendas) e do projeto: lista, PDF e nova
 * proposta. A proposta mora na oportunidade (finance_quotes.oportunidade_id);
 * projeto sem oportunidade (criado à mão) lista as propostas avulsas do cliente.
 */
export default function PropostasBloco({ oportunidade = null, partyId, titulo = '' }) {
    const { hasPermission } = usePermission();
    const ver = hasPermission('Acessar Vendas') || hasPermission('Acessar Financeiro');
    const podeCriar = hasPermission('Editar Vendas') || hasPermission('Editar Financeiro');
    const [propostas, setPropostas] = useState([]);
    const [servicos, setServicos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [nova, setNova] = useState(false);
    const [pdfsDe, setPdfsDe] = useState(null); // { quote, gerar }

    const opId = oportunidade?.id;
    const carregar = useCallback(() => {
        if (!ver) return;
        const filtro = opId ? { oportunidadeId: opId } : { partyId, semOportunidade: true };
        financeService.getQuotes(filtro).then(setPropostas).catch(() => setPropostas([]));
    }, [opId, partyId, ver]);

    useEffect(() => { carregar(); }, [carregar]);

    const abrirNova = async () => {
        try {
            const [sv, pt] = await Promise.all([financeService.getServices(), financeService.getParties()]);
            setServicos((sv || []).filter((x) => x.is_active !== false));
            setEmpresas((pt || []).filter((p) => p.kind !== 'FORNECEDOR'));
            setNova(true);
        } catch (e) { console.error(e); toast.error('Não foi possível abrir a proposta.'); }
    };

    if (!ver) return null;
    return (
        <div className={`${CARD} p-4`}>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight flex items-center gap-1.5"><FileText size={13} /> Propostas</h3>
                {podeCriar && <button onClick={abrirNova} className="text-[12px] font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1"><Plus size={12} /> Nova proposta</button>}
            </div>
            {propostas.length === 0 ? <p className="text-[11px] font-semibold text-slate-400">Nenhuma proposta ainda.</p> : (
                <ul className="divide-y divide-black/[.05]">
                    {propostas.map((q) => (
                        <li key={q.id} className="py-2 flex items-center gap-2 text-[11.5px]">
                            <span className="font-semibold text-slate-700 flex-1 truncate">{q.title || 'Proposta'}{q.numero && <span className="text-slate-400 font-semibold"> · {q.numero}</span>}</span>
                            <span className="text-slate-400 font-semibold">{fmtData(q.valid_until)}</span>
                            <span className="font-bold text-slate-800 tabular-nums">{fmtBRL(q.total_amount)}</span>
                            <Etiqueta className={STATUS_PROPOSTA[q.status] || STATUS_PROPOSTA.PENDENTE}>{q.status}</Etiqueta>
                            <button onClick={() => setPdfsDe({ quote: q })} title="Proposta em PDF" className="p-1 text-violet-500 hover:text-violet-700 hover:bg-violet-50 rounded-md"><FileDown size={14} /></button>
                        </li>
                    ))}
                </ul>
            )}

            {nova && (
                <QuoteModal quote={null} services={servicos} parties={empresas} oportunidade={oportunidade || { party_id: partyId, titulo }}
                    onClose={() => setNova(false)}
                    onSaved={async (salvo) => {
                        setNova(false);
                        carregar();
                        if (salvo?.gerarPdf) setPdfsDe({ quote: await financeService.getQuoteDetails(salvo.id), gerar: true });
                    }} />
            )}
            {pdfsDe && <PdfsProposta quote={pdfsDe.quote} podeGerar={podeCriar} gerarAoAbrir={!!pdfsDe.gerar} onClose={() => setPdfsDe(null)} />}
        </div>
    );
}
