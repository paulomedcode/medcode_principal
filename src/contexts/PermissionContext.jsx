import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { Loader2, WifiOff, RefreshCw, LogOut } from 'lucide-react';
import { podeAcessar } from '../utils/permissoes';

const PermissionContext = createContext();

const espera = (ms) => new Promise(res => setTimeout(res, ms));

export const PermissionProvider = ({ children }) => {
    const { currentUser, logout } = useAuth();
    const [permissionsMatrix, setPermissionsMatrix] = useState({});
    const [loading, setLoading] = useState(true);

    // A leitura da matriz FALHOU (rede caiu, sessão expirada, RLS negou). Não é
    // a mesma coisa que "esse cargo não tem permissão nenhuma" — ver abaixo.
    const [falhouAoCarregar, setFalhouAoCarregar] = useState(false);
    const carregando = useRef(false);

    /**
     * Relê a matriz de cargos do banco.
     *
     * ATENÇÃO ao tratamento de erro aqui — foi o que quebrou o sistema no
     * celular em set/2026. A versão anterior fazia `const { data } = await ...`
     * e jogava `data?.data || {}` no estado, ignorando o `error`. Como a tabela
     * `settings` passou a ter RLS (SELECT só para `authenticated`), qualquer
     * requisição sem token válido — token expirado no celular, que nunca
     * desloga, ou primeira carga com a sessão ainda não restaurada — volta
     * 401/42501. O erro sumia e o app seguia com a matriz VAZIA.
     *
     * Matriz vazia não derruba ninguém para uma tela de erro: derruba para o
     * cargo sem nenhuma permissão. Quem tinha permissões individuais
     * (`permissoes_extras`) via só elas — um usuário abria o celular e só
     * enxergava Financeiro, Configurações e Compromissos, que são justamente os
     * extras dele. Quem não tem extras via "Seu acesso ainda não foi
     * liberado". No computador, onde a sessão estava fresca, os mesmos usuários
     * viam tudo. Desenvolvedor nunca notou: tem passe livre em podeAcessar().
     *
     * Agora: erro é erro. Tenta de novo, renova a sessão no meio do caminho (a
     * causa provável é token vencido) e, se ainda assim não vier, mostra uma
     * tela dizendo o que houve — nunca um sistema pela metade fingindo que o
     * acesso foi revogado.
     *
     * Linha nenhuma em `settings` (`data` nulo SEM erro) é outra história: é um
     * banco sem matriz configurada, e aí a matriz vazia é a resposta correta.
     */
    const carregarMatriz = useCallback(async () => {
        if (carregando.current) return;
        carregando.current = true;
        setFalhouAoCarregar(false);

        try {
            for (let tentativa = 0; tentativa < 3; tentativa++) {
                const { data, error } = await supabase
                    .from('settings')
                    .select('data')
                    .eq('id', 'permissions')
                    .maybeSingle();

                if (!error) {
                    setPermissionsMatrix(data?.data || {});
                    return;
                }

                console.error(`Erro ao carregar permissões (tentativa ${tentativa + 1}/3):`, error);

                if (tentativa < 2) {
                    // Causa mais provável: o access token venceu enquanto o app
                    // ficou aberto no celular. Renovar antes de tentar de novo.
                    try { await supabase.auth.refreshSession(); } catch { /* segue para a próxima tentativa */ }
                    await espera(500 * (tentativa + 1));
                }
            }

            setFalhouAoCarregar(true);
        } finally {
            carregando.current = false;
            setLoading(false);
        }
    }, []);

    /*
     * SEM USUÁRIO LOGADO NÃO SE LÊ A MATRIZ — e, principalmente, não se falha.
     *
     * Este provider envolve o app INTEIRO, tela de login inclusive. Sem sessão,
     * `settings` responde 401 (RLS: SELECT só para `authenticated`), e a
     * primeira versão desta tela de erro cobriu o próprio login: ninguém
     * conseguia entrar no sistema para consertar a sessão que a tela mandava
     * consertar. Quem não está logado não tem permissão para carregar — isso é
     * o estado normal, não um erro.
     */
    useEffect(() => {
        if (!currentUser) {
            setPermissionsMatrix({});
            setFalhouAoCarregar(false);
            setLoading(false);
            return;
        }
        carregarMatriz();
    }, [carregarMatriz, currentUser]);

    // Celular não desloga e passa o dia com a aba suspensa: ao voltar para o app
    // (ou ao reconectar), se a matriz não tiver vindo, tenta de novo sozinho.
    useEffect(() => {
        if (!falhouAoCarregar || !currentUser) return;

        const tentarDeNovo = () => {
            if (document.visibilityState === 'visible') carregarMatriz();
        };
        document.addEventListener('visibilitychange', tentarDeNovo);
        window.addEventListener('online', tentarDeNovo);
        return () => {
            document.removeEventListener('visibilitychange', tentarDeNovo);
            window.removeEventListener('online', tentarDeNovo);
        };
    }, [falhouAoCarregar, carregarMatriz, currentUser]);

    /**
     * A regra mora em utils/permissoes.js — cargo, extras e Acesso Total juntos.
     *
     * Uma permissão fina só vale com a chave de acesso do módulo aberta. Antes a
     * checagem olhava a permissão isolada, então um cargo com
     * `Acessar Compromissos: false` e `Excluir Páginas: true` ainda podia
     * excluir página se chegasse até lá — e a tela de extras exibia essas
     * permissões como "já vem do Perfil", travadas, mesmo sem valer nada.
     */
    const hasPermission = (requiredPermission) => {
        if (!currentUser) return false;

        return podeAcessar({
            cargo: currentUser.role,
            matriz: permissionsMatrix,
            extras: currentUser.permissoes_extras,
            permissao: requiredPermission
        });
    };

    // As duas telas abaixo valem só para quem está logado: para o resto, deixar
    // passar é o que mantém o login acessível.
    if (loading && currentUser) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-blue-600" size={32} />
            </div>
        );
    }

    // Sem matriz o sistema não sabe o que essa pessoa pode abrir. Melhor dizer
    // isso na cara do que entregar uma tela inicial mutilada que faz o usuário
    // pensar que perdeu o acesso.
    if (falhouAoCarregar && currentUser) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-6">
                <div className="max-w-sm w-full text-center bg-white border border-slate-200 rounded-3xl shadow-xl p-8">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <WifiOff size={24} />
                    </div>
                    <h1 className="text-base font-black text-slate-800 uppercase tracking-widest">Não deu para carregar seus acessos</h1>
                    <p className="text-xs font-semibold text-slate-500 mt-2 leading-relaxed">
                        O sistema não conseguiu ler suas permissões. Costuma ser conexão instável
                        ou sessão expirada. Seu acesso <strong>não</strong> foi removido.
                    </p>
                    <button
                        onClick={carregarMatriz}
                        className="mt-6 w-full py-3 bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={15} /> Tentar de novo
                    </button>
                    <button
                        onClick={async () => { try { await logout(); } catch { /* ignora */ } window.location.href = '/login'; }}
                        className="mt-2 w-full py-3 text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
                    >
                        <LogOut size={15} /> Sair e entrar de novo
                    </button>
                </div>
            </div>
        );
    }

    return (
        <PermissionContext.Provider value={{ hasPermission, permissionsMatrix, loading, recarregarPermissoes: carregarMatriz }}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermission = () => useContext(PermissionContext);
