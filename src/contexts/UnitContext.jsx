import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

const UnitContext = createContext({});

export const UnitProvider = ({ children }) => {
    const { currentUser } = useAuth();
    const [unidades, setUnidades] = useState([]);
    const [unidadesObj, setUnidadesObj] = useState([]);
    const [unidadeAtual, setUnidadeAtual] = useState(null);
    const [isLoadingUnits, setIsLoadingUnits] = useState(true);

    // Limpa a unidade se o usuário deslogar
    useEffect(() => {
        if (!currentUser) {
            setUnidadeAtual(null);
            sessionStorage.removeItem('@medcode_unidade_sessao');
        }
    }, [currentUser]);

    // Busca as unidades no Firebase e checa a sessão atual
    useEffect(() => {
        if (!currentUser) return;
        const fetchUnidades = async () => {
            try {
                const { data, error } = await supabase.from('unidades').select('*').order('nome');
                if (error) throw error;

                let unidadesSalvas = [];
                let unidadesOriginais = [];
                if (data && data.length > 0) {
                    unidadesOriginais = data.map(u => u.nome);
                    unidadesSalvas = [...unidadesOriginais];
                }

                // Filtragem por permissão (unidades_permitidas)
                if (currentUser && currentUser.unidades_permitidas && Array.isArray(currentUser.unidades_permitidas)) {
                    if (!currentUser.unidades_permitidas.includes('*')) {
                        unidadesSalvas = unidadesSalvas.filter(u => currentUser.unidades_permitidas.includes(u));
                        // Atualiza tbm o obj
                        if (data) setUnidadesObj(data.filter(u => currentUser.unidades_permitidas.includes(u.nome)));
                    } else {
                        if (data) setUnidadesObj(data);
                    }
                } else {
                    // Sem array configurado: mostra todas (retrocompatibilidade)
                    // Se preferir bloquear por padrao, basta limpar o array aqui.
                    if (data) setUnidadesObj(data);
                }

                setUnidades(unidadesSalvas);

                // Pega a unidade apenas da sessão atual
                const salvaNaSessao = sessionStorage.getItem('@medcode_unidade_sessao');
                if (salvaNaSessao && unidadesSalvas.includes(salvaNaSessao)) {
                    setUnidadeAtual(salvaNaSessao);
                } else {
                    setUnidadeAtual(null);
                }
            } catch (error) {
                console.error("Erro ao carregar unidades: ", error);
            } finally {
                setIsLoadingUnits(false);
            }
        };
        fetchUnidades();
    }, [currentUser]);

    const changeUnidade = (novaUnidade) => {
        setUnidadeAtual(novaUnidade);
        sessionStorage.setItem('@medcode_unidade_sessao', novaUnidade);
    };

    return (
        <UnitContext.Provider value={{ unidadeAtual, unidades, unidadesObj, changeUnidade, isLoadingUnits }}>
            {children}
        </UnitContext.Provider>
    );
};

export const useUnit = () => useContext(UnitContext);
