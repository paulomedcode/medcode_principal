import React from 'react';
import { Building2, ArrowLeft } from 'lucide-react';
import { useUnit } from '../contexts/UnitContext';
import { useNavigate } from 'react-router-dom';

export default function UnitPrompt() {
    const { unidades, changeUnidade } = useUnit();
    const navigate = useNavigate();

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 md:p-6 text-center w-full bg-white/60 relative">
            
            {/* Botão de Voltar */}
            <div className="absolute top-4 left-4 md:top-8 md:left-8 z-50">
                <button 
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-xs md:text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-widest bg-white/80 backdrop-blur px-4 py-2 rounded-xl border border-white/60 shadow-sm hover:shadow"
                >
                    <ArrowLeft size={16} /> Voltar
                </button>
            </div>

            <div className="bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl p-8 md:p-12 rounded-[2.5rem] shadow-sm max-w-6xl w-full flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500 mt-12 md:mt-0">
                
                <div className="space-y-3">
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 drop-shadow-none tracking-normal">Qual sua Unidade?</h2>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed px-4">
                        Selecione abaixo em qual <strong>Posto ou Unidade de Atendimento</strong> você está operando agora.
                    </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 w-full mt-2">
                    {unidades && unidades.length > 0 ? (
                        unidades.map((unidade, idx) => (
                            <button
                                key={idx}
                                onClick={() => changeUnidade(unidade)}
                                className="group relative overflow-hidden rounded-2xl bg-white/60 border border-white/50 hover:border-indigo-200 shadow-sm hover:shadow-lg transition-all duration-300 p-4 flex flex-col items-center text-center hover:-translate-y-1"
                            >
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                <div className="w-12 h-12 md:w-14 md:h-14 bg-white/70 group-hover:bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-3 transition-colors">
                                    <Building2 className="text-slate-400 group-hover:text-indigo-600 transition-colors" size={24} strokeWidth={1.75} />
                                </div>
                                <h3 className="text-[11px] md:text-xs font-bold text-slate-700 group-hover:text-indigo-800 transition-colors leading-tight line-clamp-2">{unidade}</h3>
                            </button>
                        ))
                    ) : (
                        <div className="col-span-full py-8">
                            <p className="text-slate-500 text-sm font-semibold">Nenhuma unidade vinculada ao seu perfil.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
