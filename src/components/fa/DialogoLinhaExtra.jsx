import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

/**
 * Uma infusão contínua que não está no catálogo do hospital.
 *
 * Vale só para esta ficha. É de propósito: em sala não se para para cadastrar
 * item novo no sistema, e o catálogo do hospital não pode inchar com o que foi
 * exceção de um caso. Se virar rotina, alguém cadastra depois, em Configurações.
 */

const UNIDADES = ['mcg/kg/min', 'mcg/kg/h', 'mg/kg/h', 'ml/h', 'mcg/ml', 'ng/ml', 'mg/h', '%', 'L/min', 'UI/h'];

export default function DialogoLinhaExtra({ onSalvar, onFechar }) {
    const [nome, setNome] = useState('');
    const [unidade, setUnidade] = useState(UNIDADES[0]);

    const salvar = () => {
        if (!nome.trim()) return;
        onSalvar({ rotulo: nome.trim(), unidade });
    };

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1010] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="text-sm font-black text-slate-800">Adicionar medicação contínua</h3>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-3">
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Medicação</label>
                        <input
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } }}
                            autoFocus
                            placeholder="Ex.: Noradrenalina"
                            className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Unidade</label>
                        <div className="flex flex-wrap gap-1.5">
                            {UNIDADES.map(opcao => (
                                <button
                                    key={opcao}
                                    onClick={() => setUnidade(opcao)}
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${unidade === opcao ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                                >
                                    {opcao}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="text-[10px] font-semibold text-slate-400">
                        A linha aparece só nesta ficha. Para valer em todas, cadastre em Configurações.
                    </p>
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                    <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={!nome.trim()}
                        className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                        <Plus size={14} /> Adicionar
                    </button>
                </div>
            </div>
        </div>
    );
}
