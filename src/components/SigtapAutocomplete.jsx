import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabase';

export const SigtapAutocomplete = ({ value, onSelect, disabled, className }) => {
    const [procedimentos, setProcedimentos] = useState([]);
    const [searchTerm, setSearchTerm] = useState(value || '');
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const wrapperRef = useRef(null);

    // Busca dinâmica ao digitar
    useEffect(() => {
        const fetchSigtap = async () => {
            if (!searchTerm || searchTerm.length < 3) {
                setProcedimentos([]);
                return;
            }
            if (!showResults) {
                return;
            }

            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('sigtap')
                    .select('codigo, nome')
                    .or(`nome.ilike."%${searchTerm}%",codigo.ilike."%${searchTerm}%"`)
                    .limit(300);

                if (error) throw error;
                setProcedimentos(data || []);
            } catch (error) {
                console.error("Erro ao buscar no SIGTAP:", error);
            } finally {
                setLoading(false);
            }
        };

        const debounceTimer = setTimeout(fetchSigtap, 400); // 400ms debounce
        return () => clearTimeout(debounceTimer);
    }, [searchTerm, value, showResults]);

    // Atualiza o termo de busca se o value externo mudar (ex: ao limpar o formulário)
    useEffect(() => {
        setSearchTerm(value || '');
    }, [value]);

    // Fecha o dropdown se clicar fora
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowResults(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (p) => {
        const nomeFinal = p.nome || p.descricao || p.ds_procedimento || '';
        const codFinal = p.codigo || p.cod || p.co_procedimento || '';
        setSearchTerm(nomeFinal);
        setShowResults(false);
        onSelect({ nome: nomeFinal, codigo: codFinal });
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowResults(true);
                    if (e.target.value !== value) onSelect({ nome: e.target.value, codigo: '' });
                }}
                onFocus={() => {
                    if (searchTerm && searchTerm.length >= 3) setShowResults(true);
                }}
                className={className || "w-full bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-900 drop-shadow-none text-sm font-semibold px-3 py-2.5 pl-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 uppercase transition-all"}
                placeholder={loading ? "Buscando..." : "Buscar por Nome ou Código (mín 3)..."}
                disabled={disabled}
                autoComplete="off"
            />
            {loading && (
                <div className="absolute right-10 top-1/2 -translate-y-1/2">
                    <Loader2 size={14} className="animate-spin text-blue-500" />
                </div>
            )}
            {searchTerm && !disabled && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSearchTerm('');
                        onSelect({ nome: '', codigo: '' });
                        setShowResults(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-rose-500 transition-colors"
                >
                    <X size={14} />
                </button>
            )}
            {showResults && searchTerm && searchTerm.length >= 3 && (
                <div className="absolute z-[100] w-full mt-1 bg-white/60 backdrop-blur-xl border border-white/60 rounded-xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.3)] max-h-60 overflow-y-auto custom-scrollbar">
                    {procedimentos.length > 0 ? procedimentos.map(p => {
                        const nomeShow = p.nome || 'Sem Nome';
                        const codShow = p.codigo || '---';
                        return (
                            <div key={codShow} onClick={() => handleSelect(p)} className="p-3 hover:bg-white/60 cursor-pointer border-b border-white/40 last:border-0 transition-colors">
                                <div className="text-xs font-bold uppercase text-slate-900 drop-shadow-none">{nomeShow}</div>
                                <div className="text-[11px] font-semibold text-blue-500 uppercase mt-0.5">CÓDIGO: {codShow}</div>
                            </div>
                        );
                    }) : (
                        !loading && <div className="p-3 bg-white/60 flex flex-col items-center text-center gap-2 border-t border-white/40">
                            <span className="text-[11px] font-bold text-slate-500 uppercase">Nenhum procedimento encontrado.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
