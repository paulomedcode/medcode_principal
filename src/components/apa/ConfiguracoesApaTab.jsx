import React, { useState } from 'react';
import { Pill, FileText, HeartPulse, Rows3 } from 'lucide-react';
import RegrasMedicamentoManager from './RegrasMedicamentoManager';
import TextosExameManager from './TextosExameManager';
import ModelosNarrativaManager from '../fa/ModelosNarrativaManager';
import CatalogosFaManager from '../fa/CatalogosFaManager';

/**
 * Configurações da APA. As abas são controladas aqui dentro, e não pelo
 * mecanismo de grupos do painel de Configurações — assim a seção continua
 * sendo uma única entrada avulsa no hub, sem alterar a navegação existente.
 */
const ABAS = [
    { id: 'regras', label: 'Regras de medicamentos', icon: Pill },
    { id: 'textos', label: 'Textos do exame físico', icon: FileText },
    { id: 'narrativas', label: 'Descrições da ficha anestésica', icon: HeartPulse },
    { id: 'catalogos', label: 'Linhas e fármacos da ficha', icon: Rows3 }
];

export default function ConfiguracoesApaTab() {
    const [aba, setAba] = useState('regras');

    return (
        <div className="space-y-6">
            <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 rounded-xl p-1">
                {ABAS.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setAba(item.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${aba === item.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                        <item.icon size={14} /> {item.label}
                    </button>
                ))}
            </div>

            {aba === 'regras' && <RegrasMedicamentoManager />}
            {aba === 'textos' && <TextosExameManager />}
            {aba === 'narrativas' && <ModelosNarrativaManager />}
            {aba === 'catalogos' && <CatalogosFaManager />}
        </div>
    );
}
