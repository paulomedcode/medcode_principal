import React, { useState, useMemo } from 'react';
import { X, Search, Loader2, Trash2 } from 'lucide-react';
import { agruparPorClasse } from '../../services/faCatalogos';
import { normalizar } from '../../utils/apaMedicationRules';
import { paraHoraLocal, paraIso } from '../../utils/fichaAnestesica/vocabulario';

/**
 * Registro de medicação em dose única.
 *
 * O catálogo vem do banco (fa_farmacos) — no protótipo de referência os
 * fármacos estavam escritos no JavaScript e só mudavam com deploy.
 *
 * O horário é campo, não carimbo do relógio: ficha preenchida depois do
 * procedimento — que é a regra em plantão movimentado — precisa registrar a hora
 * em que a dose foi dada, não a hora em que foi digitada. Serve também para
 * corrigir uma dose já lançada, e aí o registro anterior é substituído (e fica
 * no histórico), em vez de virar dose nova.
 */

const VIAS = ['IV', 'IM', 'SC', 'VO', 'Peridural', 'Subaracnóidea', 'Perineural', 'Tópica', 'Inalatória'];

export default function DialogoMedicacao({
    farmacos, horarioSugerido, instanteSugerido, emEdicao = null,
    onSalvar, onRemover, onFechar
}) {
    const [busca, setBusca] = useState('');
    const [selecionado, setSelecionado] = useState(() => (emEdicao
        ? (farmacos.find(f => (f.rotulo_curto || f.nome) === emEdicao.alvo) || { nome: emEdicao.alvo, rotulo_curto: emEdicao.alvo, unidade: emEdicao.unidade, classe: '—' })
        : null));
    const [dose, setDose] = useState(() => (emEdicao?.valor != null ? String(emEdicao.valor) : ''));
    const [via, setVia] = useState(emEdicao?.via || 'IV');
    const [observacao, setObservacao] = useState(emEdicao?.observacao || '');
    const [horario, setHorario] = useState(() => paraHoraLocal(emEdicao?.t || instanteSugerido || new Date().toISOString()));
    const [salvando, setSalvando] = useState(false);

    const filtrados = useMemo(() => {
        const termo = normalizar(busca);
        if (!termo) return farmacos;
        return farmacos.filter(f => normalizar(`${f.nome} ${f.classe}`).includes(termo));
    }, [farmacos, busca]);

    const grupos = useMemo(() => agruparPorClasse(filtrados), [filtrados]);

    const doseNumero = Number(String(dose).replace(',', '.'));
    const podeSalvar = selecionado && Number.isFinite(doseNumero) && doseNumero > 0;

    const salvar = async () => {
        if (!podeSalvar) return;
        setSalvando(true);
        await onSalvar({
            farmaco: selecionado,
            dose: doseNumero,
            via,
            observacao: observacao.trim(),
            t: paraIso(horario, emEdicao?.t || instanteSugerido) || instanteSugerido,
            substituiId: emEdicao?.id || null
        });
        setSalvando(false);
    };

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1010] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div>
                        <h3 className="text-sm font-black text-slate-800">
                            {emEdicao ? 'Editar medicação' : 'Registrar medicação'}
                        </h3>
                        <p className="text-[11px] font-bold text-slate-400">{horarioSugerido}</p>
                    </div>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-3">
                    {!selecionado ? (
                        <>
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={busca}
                                    onChange={e => setBusca(e.target.value)}
                                    autoFocus
                                    placeholder="Buscar fármaco..."
                                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="max-h-[340px] overflow-y-auto space-y-3">
                                {grupos.length === 0 && (
                                    <p className="py-6 text-center text-xs font-bold text-slate-400">Nenhum fármaco encontrado.</p>
                                )}
                                {grupos.map(grupo => (
                                    <div key={grupo.classe}>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1">{grupo.classe}</p>
                                        <div className="space-y-1">
                                            {grupo.itens.map(farmaco => (
                                                <button
                                                    key={farmaco.id}
                                                    onClick={() => { setSelecionado(farmaco); setVia(farmaco.via_padrao || 'IV'); }}
                                                    className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                                                >
                                                    <span className="text-[11px] font-bold text-slate-800">{farmaco.rotulo_curto || farmaco.nome}</span>
                                                    <span className="ml-2 text-[10px] font-black text-slate-400 uppercase">{farmaco.unidade}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-start justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                <div>
                                    <p className="text-xs font-black text-slate-800">{selecionado.nome}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{selecionado.classe}</p>
                                </div>
                                <button onClick={() => setSelecionado(null)} className="text-[10px] font-black text-blue-600 hover:underline shrink-0">Trocar</button>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Horário</label>
                                    <input
                                        type="time"
                                        value={horario}
                                        onChange={e => setHorario(e.target.value)}
                                        className="w-full px-3 py-2.5 text-xs font-bold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Dose ({selecionado.unidade})</label>
                                    <input
                                        value={dose}
                                        onChange={e => setDose(e.target.value.replace(/[^0-9.,]/g, ''))}
                                        inputMode="decimal"
                                        autoFocus
                                        className="w-full px-3 py-2 text-lg font-black text-right bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Via</label>
                                    <select value={via} onChange={e => setVia(e.target.value)} className="w-full px-3 py-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500">
                                        {VIAS.map(opcao => <option key={opcao} value={opcao}>{opcao}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Observação</label>
                                <input
                                    value={observacao}
                                    onChange={e => setObservacao(e.target.value)}
                                    placeholder="Opcional"
                                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-200">
                    {emEdicao && onRemover ? (
                        <button onClick={() => onRemover(emEdicao.id)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg">
                            <Trash2 size={14} /> Remover
                        </button>
                    ) : <span />}
                    <div className="flex gap-2">
                    <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={!podeSalvar || salvando}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                        {salvando && <Loader2 size={14} className="animate-spin" />}
                        {emEdicao ? 'Salvar' : 'Registrar'}
                    </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
