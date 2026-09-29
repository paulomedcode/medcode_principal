import { supabase } from '../services/supabase';

// Resolve autor + IP de forma resiliente a token expirado (renovação falhou
// em aba em 2º plano / celular parado). Sem o cache do AuthContext, quem
// gravasse a ação viraria "Sistema" — usado pelo logAction.
export const resolveClientIdentity = async () => {
    let ipAddress = 'Desconhecido';
    try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        ipAddress = ipData.ip;
    } catch (e) {
        console.warn("Falha ao obter IP", e);
    }

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const metadata = user?.user_metadata || {};

    let cached = null;
    try {
        cached = JSON.parse(localStorage.getItem('@medcode_user_identity') || 'null');
    } catch (e) { /* ignora cache corrompido */ }

    return {
        userName: metadata.name || user?.email || cached?.name || cached?.email || 'Sistema',
        userEmail: user?.email || cached?.email || 'Sistema',
        ipAddress,
        userAgent: navigator.userAgent,
    };
};

export const logAction = async (action, details) => {
    try {
        const { userName, userEmail, ipAddress } = await resolveClientIdentity();

        await supabase.from('logs').insert([{
            action,
            details,
            userName,
            userEmail,
            ip_address: ipAddress,
            timestamp: new Date().toISOString()
        }]);

        // Apagar logs mais antigos que 6 meses
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        await supabase.from('logs').delete().lt('timestamp', sixMonthsAgo.toISOString());
    } catch (error) {
        console.error('Erro ao gravar log:', error);
    }
};
