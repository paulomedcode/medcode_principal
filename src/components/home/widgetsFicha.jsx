import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartPulse, Loader2, ArrowRight, CloudOff } from 'lucide-react';
import { useUnit } from '../../contexts/UnitContext';
import { listarFichas, fichasComPendencia } from '../../services/fichaAnestesica';

/**
 * Fichas anestésicas em andamento.
 *
 * Serve para o anestesista retomar a ficha do paciente que está em sala e para
 * ninguém esquecer ficha aberta — que, sem encerrar, fica sem o documento final.
 */
export const FichasEmAbertoWidget = () => {
    const navigate = useNavigate();
    const { unidadeAtual } = useUnit();

    const [fichas, setFichas] = useState([]);
    const [pendencias, setPendencias] = useState([]);
    const [carregando, setCarregando] = useState(true);
    // O tempo decorrido vem do estado, não de Date.now() no render: assim o
    // contador anda sozinho e a renderização continua previsível.
    const [agora, setAgora] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setAgora(Date.now()), 60000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        let ativo = true;
        listarFichas({ unidade: unidadeAtual, status: 'em_andamento', limite: 8 }).then(({ data }) => {
            if (!ativo) return;
            setFichas(data || []);
            setPendencias(fichasComPendencia());
            setCarregando(false);
        });
        return () => { ativo = false; };
    }, [unidadeAtual]);

    const desde = (valor) => {
        if (!valor) return 'sem início registrado';
        const inicio = new Date(valor);
        if (Number.isNaN(inicio.getTime())) return '';
        const minutos = Math.max(0, Math.round((agora - inicio.getTime()) / 60000));
        if (minutos < 60) return `há ${minutos} min`;
        const horas = Math.floor(minutos / 60);
        return `há ${horas}h${String(minutos % 60).padStart(2, '0')}`;
    };

    return (
        <div className="h-full flex flex-col bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
                    <HeartPulse size={17} className="text-rose-500" /> Fichas em andamento
                </h3>
                <button
                    onClick={() => navigate('/ficha-anestesica')}
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                >
                    Ver todas <ArrowRight size={13} />
                </button>
            </div>

            {carregando && <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={22} /></div>}

            {!carregando && fichas.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <p className="text-xs font-bold text-slate-400">Nenhuma ficha aberta agora.</p>
                    <button
                        onClick={() => navigate('/ficha-anestesica')}
                        className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg"
                    >
                        Abrir ficha
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1.5">
                {fichas.map(ficha => {
                    const pendente = pendencias.find(p => p.fichaId === ficha.id);
                    return (
                        <button
                            key={ficha.id}
                            onClick={() => navigate('/ficha-anestesica', { state: { fichaId: ficha.id } })}
                            className="w-full text-left p-2.5 rounded-xl bg-white/80 border border-white hover:border-blue-300 hover:shadow-sm transition-all"
                        >
                            <div className="flex items-center gap-2">
                                <span className="flex-1 min-w-0 text-xs font-black text-slate-800 truncate">
                                    {ficha.paciente_nome || 'Sem nome'}
                                </span>
                                {pendente && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black shrink-0">
                                        <CloudOff size={10} /> {pendente.quantidade}
                                    </span>
                                )}
                                <span className="text-[10px] font-bold text-emerald-600 shrink-0">{desde(ficha.inicio_anestesia)}</span>
                            </div>
                            <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                                {ficha.procedimento || 'Procedimento não informado'} · {ficha.anestesista_nome || '—'}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
