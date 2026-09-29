import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

/** Usuários ativos (para "Responsável"). Carrega uma vez por tela. */
export function useUsuarios() {
    const [usuarios, setUsuarios] = useState([]);
    useEffect(() => {
        let vivo = true;
        supabase.from('users').select('id, name, status').order('name').then(({ data }) => {
            if (vivo) setUsuarios((data || []).filter((u) => u.status !== 'Inativo'));
        });
        return () => { vivo = false; };
    }, []);
    return usuarios;
}

/** Lista de settings.general (segmentos, origens_lead). */
export function useListasGerais() {
    const [listas, setListas] = useState({ segmentos: [], origens_lead: [] });
    useEffect(() => {
        let vivo = true;
        supabase.from('settings').select('data').eq('id', 'general').maybeSingle().then(({ data }) => {
            if (!vivo) return;
            setListas({
                segmentos: data?.data?.segmentos || [],
                origens_lead: data?.data?.origens_lead || [],
            });
        });
        return () => { vivo = false; };
    }, []);
    return listas;
}

/** Soma do que ainda falta receber / já recebido de uma lista de lançamentos. */
export function resumoFinanceiro(lancamentos = []) {
    const r = { receita: 0, recebido: 0, aReceber: 0, custo: 0, pago: 0 };
    for (const t of lancamentos) {
        const valor = Number(t.amount) || 0;
        const quitado = t.status === 'PAGO' ? valor : Math.min(valor, Number(t.paid_amount) || 0);
        if (t.type === 'ENTRADA') { r.receita += valor; r.recebido += quitado; r.aReceber += valor - quitado; }
        else { r.custo += valor; r.pago += quitado; }
    }
    r.margem = r.receita - r.custo;
    r.margemPct = r.receita > 0 ? (r.margem / r.receita) * 100 : null;
    return r;
}
