import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useModulosNav } from './navegacao';
import { useOpcoesNovo, abrirNovo } from './novo';

/*
 * Barra inferior — só no celular (< md). Início, os módulos mais usados e o
 * "＋" no meio, ao alcance do polegar. O resto (outros módulos, tema, perfil,
 * sair) fica no "Mais" da barra superior.
 */
const PRIORIDADE = ['vendas', 'projetos', 'prospeccao', 'financeiro', 'clientes', 'compromissos', 'painel'];

export default function BarraInferior() {
    const { modulos, ativo } = useModulosNav();
    const podeCriar = useOpcoesNovo().length > 0;

    const inicio = modulos.find((m) => m.id === 'inicio');
    const outros = PRIORIDADE.map((id) => modulos.find((m) => m.id === id)).filter(Boolean).slice(0, podeCriar ? 3 : 4);
    const itens = [inicio, ...outros];
    if (podeCriar) itens.splice(2, 0, { id: 'novo' });

    return (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-[998] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-black/[.06] pb-seguro print:hidden">
            <div className="flex items-stretch h-16 px-1">
                {itens.map((m) => {
                    if (m.id === 'novo') {
                        return (
                            <div key="novo" className="flex-1 flex items-center justify-center">
                                <button onClick={() => abrirNovo()} aria-label="Criar"
                                    className="w-12 h-12 rounded-2xl bg-indigo-600 active:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center">
                                    <Plus size={24} />
                                </button>
                            </div>
                        );
                    }
                    const Icon = m.icon;
                    const on = ativo(m);
                    return (
                        <Link key={m.id} to={m.path}
                            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${on ? 'text-indigo-600' : 'text-slate-500'}`}>
                            <Icon size={21} strokeWidth={on ? 2.4 : 2} />
                            <span className="truncate max-w-full px-0.5">{m.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
