import React, { useState, useRef, useEffect } from 'react';
import { MapPin, ChevronDown, Building2 } from 'lucide-react';
import { useUnit } from '../contexts/UnitContext';
import { useLocation } from 'react-router-dom';

export const UnitSelector = () => {
    const { unidadeAtual, unidades, changeUnidade } = useUnit();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative z-[999]" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl transition-all duration-300 shadow-sm border bg-white/70 hover:bg-white/80 border-white/80"
                title="Alterar Local de Atendimento"
            >
                <MapPin size={16} className="text-slate-800" />
                <div className="flex flex-col items-start">
                    <span className="text-[9px] font-black uppercase tracking-widest leading-none text-slate-600">Local Atual</span>
                    <span className="text-[11px] font-bold uppercase tracking-widest leading-tight truncate max-w-[64px] sm:max-w-[150px] text-slate-800">
                        {unidadeAtual || 'SELECIONE O LOCAL'}
                    </span>
                </div>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''} text-slate-600`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 sm:left-0 mt-2 w-56 bg-white/90 backdrop-blur-xl border border-white/400 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 p-1.5 z-[999]">
                    <div className="p-2 border-b border-slate-100/50 mb-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Selecione a Unidade</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {unidades.map(u => (
                            <button
                                key={u}
                                onClick={() => { changeUnidade(u); setIsOpen(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all duration-300 ${unidadeAtual === u ? 'bg-white/80 text-blue-600 font-bold shadow-sm border border-white/400' : 'text-slate-500 hover:bg-white/60 hover:text-blue-600'}`}
                            >
                                <Building2 size={14} className={unidadeAtual === u ? 'text-blue-600' : 'text-slate-500'} />
                                <span className="text-[10px] font-bold uppercase tracking-widest truncate">{u}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
