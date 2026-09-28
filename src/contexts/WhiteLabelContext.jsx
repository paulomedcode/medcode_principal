import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

const WhiteLabelContext = createContext();

export const WhiteLabelProvider = ({ children }) => {
    const { currentUser } = useAuth();
    const [theme, setTheme] = useState({
        nomeInstituicao: 'Sistema de Gestão',
        corPrincipal: '#2563eb', 
        logoUrl: null, // Sem logo por padrão até carregar
        faviconUrl: '',
        hubAssistant1Name: 'Assistente 1', hubAssistant1Whatsapp: '', hubAssistant1Photo: '',
        hubAssistant2Name: 'Assistente 2', hubAssistant2Whatsapp: '', hubAssistant2Photo: '',
        hubInstagramLink: '',
        hubCarouselImages: [],
        marqueeText: ''
    });
    const [isThemeLoading, setIsThemeLoading] = useState(true);

    const fetchTheme = async () => {
        try {
            // Removido setIsThemeLoading(true) aqui para evitar desmontar o AppLayout inteiro (o que causava perda de dados nos forms)
            const { data, error } = await supabase.from('settings').select('data').eq('id', 'general').maybeSingle();
            if (data && data.data) {
                const fetchedTheme = {
                    nomeInstituicao: data.data.nomeInstituicao || 'Sistema de Gestão',
                    corPrincipal: data.data.corPrincipal || '#2563eb',
                    logoUrl: data.data.logoUrl || null,
                    faviconUrl: data.data.faviconUrl || '',
                    executanteNome: data.data.executanteNome || '',
                    executanteCnes: data.data.executanteCnes || '',
                    hubAssistant1Name: data.data.hubAssistant1Name || 'Assistente 1',
                    hubAssistant1Whatsapp: data.data.hubAssistant1Whatsapp || '',
                    hubAssistant1Photo: data.data.hubAssistant1Photo || '',
                    hubAssistant2Name: data.data.hubAssistant2Name || 'Assistente 2',
                    hubAssistant2Whatsapp: data.data.hubAssistant2Whatsapp || '',
                    hubAssistant2Photo: data.data.hubAssistant2Photo || '',
                    hubInstagramLink: data.data.hubInstagramLink || '',
                    hubCarouselImages: data.data.hubCarouselImages || [],
                    marqueeText: data.data.marqueeText || ''
                };
                setTheme(fetchedTheme);
                document.title = fetchedTheme.nomeInstituicao;
                document.documentElement.style.setProperty('--primary-color', fetchedTheme.corPrincipal);
                const favicon = document.querySelector("link[rel*='icon']");
                if (favicon && fetchedTheme.faviconUrl) {
                    favicon.href = fetchedTheme.faviconUrl;
                }
            }
        } catch (error) {
            console.error("Erro ao carregar tema:", error);
        } finally {
            setIsThemeLoading(false);
        }
    };

    useEffect(() => {
        fetchTheme();
    }, [currentUser]);

    return (
        <WhiteLabelContext.Provider value={{ theme, reloadTheme: fetchTheme, isThemeLoading }}>
            {children}
        </WhiteLabelContext.Provider>
    );
};

export const useWhiteLabel = () => useContext(WhiteLabelContext);
