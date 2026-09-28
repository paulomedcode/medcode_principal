import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pill } from 'lucide-react';
import ConfiguracoesApaTab from '../components/apa/ConfiguracoesApaTab';

/**
 * Regras e catálogos da APA e da Ficha Anestésica, fora das Configurações.
 *
 * O conteúdo é o mesmo da aba do Painel de Controle, mas com porta própria
 * ('Gerenciar Regras APA/FA'): quem cuida da conduta medicamentosa é
 * anestesista, e não precisa — nem deve — receber a chave que abre unidades,
 * convênios, usuários e o resto do sistema junto.
 */
export default function RegrasApaFa() {
    const navigate = useNavigate();

    return (
        <div className="min-h-full py-6 px-4 sm:px-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/pep-hub')}
                        className="p-2 -ml-2 rounded-xl text-slate-600 hover:bg-white/70 hover:text-slate-800 transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <span className="p-2.5 rounded-2xl bg-white/70 text-slate-800 shadow-sm border border-white/80">
                        <Pill size={22} strokeWidth={2.5} />
                    </span>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">Regras e catálogos</h1>
                        <p className="text-xs font-bold text-slate-500">Conduta de medicamentos, laudos padrão e descrições do ato anestésico</p>
                    </div>
                </div>

                <div className="bg-white/60 backdrop-blur-2xl border border-white rounded-3xl shadow-xl shadow-slate-300/40 p-5 md:p-7">
                    <ConfiguracoesApaTab />
                </div>
            </div>
        </div>
    );
}
