import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Mantém uma cópia leve (nome + email) da identidade do usuário logado.
    // O logger usa isso como fallback quando a sessão do Supabase expira mas a
    // ação ainda é gravada (RLS desligado), evitando logs como "Sistema".
    useEffect(() => {
        try {
            if (currentUser?.email) {
                localStorage.setItem('@medcode_user_identity', JSON.stringify({
                    name: currentUser.name || currentUser.user_metadata?.name || null,
                    email: currentUser.email
                }));
            } else {
                localStorage.removeItem('@medcode_user_identity');
            }
        } catch (e) { /* localStorage indisponível */ }
    }, [currentUser]);

    const login = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    };

    const logout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    const resetPassword = async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
    };

    useEffect(() => {
        /*
         * O perfil (cargo + permissões individuais) vem da tabela `users`, que
         * hoje tem RLS: SELECT só para `authenticated`. Com token vencido a
         * busca volta 401 e o usuário cai no fallback lá embaixo — vira a
         * sessão crua do Supabase, SEM `role`, e o sistema passa a tratá-lo
         * como Visualizador. Sintoma: home sem módulo nenhum, igual ao que o
         * celular fez em set/2026 (ver PermissionContext). Por isso as
         * tentativas renovam a sessão antes de desistir.
         */
        const fetchProfile = async (sessionUser, retries = 3) => {
            if (sessionUser) {
                try {
                    let publicProfile = null;
                    let fetchError = null;

                    // Tenta buscar o perfil (pode falhar na primeira se o token PostgREST ainda não propagou no client auth)
                    for (let i = 0; i < retries; i++) {
                        const { data, error } = await supabase
                            .from('users')
                            .select('*')
                            .eq('email', sessionUser.email)
                            .maybeSingle(); // maybeSingle não joga erro se não achar, útil pra verificar dados nulos

                        if (data && !error) {
                            publicProfile = data;
                            fetchError = null;
                            break; // Sucesso, sai do loop
                        }

                        fetchError = error || new Error("Perfil não encontrado");
                        if (i === retries - 1) break;

                        // Erro de leitura (não "não achei") costuma ser token
                        // vencido: renova antes da próxima tentativa.
                        if (error) {
                            try { await supabase.auth.refreshSession(); } catch { /* tenta assim mesmo */ }
                        }
                        await new Promise(res => setTimeout(res, 500 * (i + 1)));
                    }

                    if (publicProfile) {
                        if (publicProfile.status === 'Inativo') {
                            await supabase.auth.signOut();
                            setCurrentUser(null);
                        } else {
                            setCurrentUser({ ...sessionUser, ...publicProfile });
                        }
                    } else {
                        throw fetchError || new Error("Perfil não encontrado após tentativas");
                    }
                } catch (error) {
                    console.warn('Erro ao buscar perfil do usuário:', error);
                    setCurrentUser(sessionUser);
                } finally {
                    setLoading(false);
                }
            } else {
                setCurrentUser(null);
                setLoading(false);
            }
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            fetchProfile(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                sessionStorage.setItem('login_timestamp', Date.now().toString());
                fetchProfile(session?.user ?? null);
            } else if (event === 'SIGNED_OUT') {
                sessionStorage.removeItem('login_timestamp');
                sessionStorage.removeItem('apa_draft_state');
                sessionStorage.removeItem('@medcode_unidade_sessao');
                sessionStorage.removeItem('@medcode_hub_animation_seen');
                setCurrentUser(null);
            } else if (event === 'USER_UPDATED') {
                fetchProfile(session?.user ?? null);
            }
            // Ignoramos TOKEN_REFRESHED para não causar re-render e piscar a tela ao trocar de aba
        });

        // --- Logout por inatividade: SOMENTE em computador ---
        // Celular/tablet permanecem logados; PCs deslogam após 3h sem
        // atividade (segurança em máquinas compartilhadas de hospital).
        const isMobileOrTablet =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); // iPadOS se passa por Mac

        let intervalId;
        let removeActivityListeners = () => {};

        if (!isMobileOrTablet) {
            const INACTIVITY_LIMIT_MS = 3 * 60 * 60 * 1000; // 3 horas
            const ACTIVITY_KEY = 'last_activity';

            // Se a última atividade for antiga demais (ex.: PC reaberto no dia
            // seguinte), desloga já na carga; senão, marca atividade agora.
            const last = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10);
            if (last && Date.now() - last >= INACTIVITY_LIMIT_MS) {
                localStorage.removeItem(ACTIVITY_KEY);
                supabase.auth.signOut();
            } else {
                localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
            }

            // Registra atividade (no máx. 1 gravação a cada 30s)
            let lastWrite = Date.now();
            const onActivity = () => {
                const now = Date.now();
                if (now - lastWrite > 30000) {
                    lastWrite = now;
                    localStorage.setItem(ACTIVITY_KEY, now.toString());
                }
            };
            const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
            events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
            removeActivityListeners = () => events.forEach(e => window.removeEventListener(e, onActivity));

            // Checa inatividade a cada 60s
            intervalId = setInterval(() => {
                const lastTs = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10);
                if (lastTs && Date.now() - lastTs >= INACTIVITY_LIMIT_MS) {
                    localStorage.removeItem(ACTIVITY_KEY);
                    supabase.auth.signOut();
                }
            }, 60000);
        }

        return () => {
            subscription.unsubscribe();
            if (intervalId) clearInterval(intervalId);
            removeActivityListeners();
        };
    }, []);

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, resetPassword }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);