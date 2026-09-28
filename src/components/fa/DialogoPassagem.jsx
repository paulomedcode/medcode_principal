import React, { useState, useEffect } from 'react';
import { X, Loader2, UserRound, ArrowRightLeft, AlertTriangle, Search } from 'lucide-react';
import { supabase } from '../../services/supabase';

/**
 * Passagem do caso entre anestesistas.
 *
 * `passar`  — o responsável indica quem vai assumir. A ficha continua com ele
 *             até o outro assumir de fato: entre "avisei" e "pegou" não pode
 *             existir um intervalo em que ninguém responde pelo caso.
 * `assumir` — quem foi indicado confirma que está com o paciente. Sem indicação,
 *             ainda dá para assumir (o anestesista saiu, passou mal), mas o
 *             motivo é obrigatório e fica registrado na ficha.
 */
export default function DialogoPassagem({
    modo = 'passar', responsavelNome = '', indicadoNome = '', indicadoId = null,
    meuId = null, onIndicar, onCancelarIndicacao, onAssumir, onFechar
}) {
    const [medicos, setMedicos] = useState([]);
    const [carregando, setCarregando] = useState(modo === 'passar');
    const [busca, setBusca] = useState('');
    const [escolhido, setEscolhido] = useState(null);
    const [motivo, setMotivo] = useState('');
    const [processando, setProcessando] = useState(false);

    useEffect(() => {
        if (modo !== 'passar') return;
        let ativo = true;

        supabase
            .from('users')
            .select('id, name, crm')
            .in('role', ['Médico', 'Médico Coordenador'])
            .eq('status', 'Ativo')
            .order('name', { ascending: true })
            .then(({ data }) => {
                if (!ativo) return;
                // Passar o caso para si mesmo não existe.
                setMedicos((data || []).filter(medico => medico.id !== meuId));
                setCarregando(false);
            });

        return () => { ativo = false; };
    }, [modo, meuId]);

    const confirmar = async () => {
        setProcessando(true);
        if (modo === 'passar') await onIndicar(escolhido);
        else await onAssumir(motivo.trim());
        setProcessando(false);
    };

    const filtrados = medicos.filter(medico =>
        !busca.trim() || (medico.name || '').toLowerCase().includes(busca.trim().toLowerCase())
    );

    const semIndicacao = modo === 'assumir' && indicadoId !== meuId;

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1010] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
                        <ArrowRightLeft size={16} className="text-blue-600" />
                        {modo === 'passar' ? 'Passar o caso' : 'Assumir o caso'}
                    </h3>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                {modo === 'passar' ? (
                    <div className="p-4 space-y-3">
                        <p className="text-[11px] font-semibold text-slate-500">
                            Escolha quem assume a ficha. Você continua respondendo pelo caso e registrando
                            normalmente até a outra pessoa assumir.
                        </p>

                        {indicadoNome && (
                            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                                <p className="text-[11px] font-bold text-amber-900">
                                    Aguardando <strong>{indicadoNome}</strong> assumir.
                                </p>
                                <button
                                    onClick={onCancelarIndicacao}
                                    className="px-2.5 py-1 text-[10px] font-black uppercase text-amber-800 hover:bg-amber-100 rounded-lg shrink-0"
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}

                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar anestesista..."
                                className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                            />
                        </div>

                        {carregando && <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-blue-600" size={22} /></div>}

                        {!carregando && filtrados.length === 0 && (
                            <p className="py-6 text-center text-xs font-bold text-slate-400">
                                Nenhum médico ativo encontrado.
                            </p>
                        )}

                        <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                            {filtrados.map(medico => (
                                <button
                                    key={medico.id}
                                    onClick={() => setEscolhido(medico)}
                                    className={`w-full flex items-center gap-2 text-left p-3 rounded-xl border transition-colors ${escolhido?.id === medico.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-800 hover:border-blue-400 hover:bg-blue-50/50'}`}
                                >
                                    <UserRound size={15} className="shrink-0 opacity-70" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-xs font-black truncate">{medico.name}</span>
                                        {medico.crm && <span className={`block text-[10px] font-bold ${escolhido?.id === medico.id ? 'text-blue-100' : 'text-slate-400'}`}>CRM {medico.crm}</span>}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <p className="text-[11px] font-semibold text-slate-600">
                                O caso está com <strong>{responsavelNome || 'outro anestesista'}</strong>.
                                Ao assumir, os próximos registros passam a ser seus — e a passagem fica na ficha.
                            </p>
                        </div>

                        {semIndicacao && (
                            <div className="space-y-2">
                                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                                    <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-[11px] font-bold text-amber-900">
                                        O responsável não indicou você. Dá para assumir mesmo assim, mas explique
                                        por quê — isso fica registrado na ficha e sai na impressão.
                                    </p>
                                </div>
                                <textarea
                                    value={motivo}
                                    onChange={e => setMotivo(e.target.value)}
                                    rows={3}
                                    placeholder="Ex.: anestesista chamado para emergência na sala 2; assumi o caso às 14h20."
                                    className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                    <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button
                        onClick={confirmar}
                        disabled={processando || (modo === 'passar' ? !escolhido : (semIndicacao && !motivo.trim()))}
                        className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                        {processando && <Loader2 size={14} className="animate-spin" />}
                        {modo === 'passar' ? 'Passar o caso' : 'Assumir o caso'}
                    </button>
                </div>
            </div>
        </div>
    );
}
