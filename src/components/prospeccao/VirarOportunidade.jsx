import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Trophy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { listarEtapas } from '../../services/crm';
import { virarOportunidade } from '../../services/prospeccao';
import { useAuth } from '../../contexts/AuthContext';
import CurrencyInput from '../finance/CurrencyInput';
import { useUsuarios } from '../crm/dados';
import { GanharModal } from '../crm/OportunidadeModal';
import { Janela, Campo, ServicosPicker, inputCls, textareaCls, btnPrimario, btnSecundario } from '../crm/ui';

/**
 * Fim da prospecção: o lead respondeu e tem interesse. Cria a empresa e a
 * oportunidade no Vendas de uma vez (RPC prospeccao_virar_oportunidade).
 * Se o negócio já fechou, emenda direto no "Ganhar" e cria o projeto — a
 * oportunidade continua existindo (ganha) no Vendas, a jornada é a mesma.
 */
export default function VirarOportunidade({ lead, onClose, onFeito }) {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const usuarios = useUsuarios();
    const [etapas, setEtapas] = useState([]);
    const [salvando, setSalvando] = useState(false);
    const [ganhar, setGanhar] = useState(null); // { row, oportunidade } depois de criar, para fechar já
    const [form, setForm] = useState({
        titulo: `Site — ${lead.nome}`, servicos: ['SITE'], valor: 0, valor_recorrente: 0, etapa_id: '',
        responsavel_id: lead.responsavel_id || currentUser?.id || '', previsao_fechamento: '', notas: '',
    });
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    useEffect(() => {
        listarEtapas().then((e) => {
            const abertas = e.filter((x) => x.tipo === 'ABERTA');
            setEtapas(abertas);
            setForm((f) => ({ ...f, etapa_id: f.etapa_id || abertas[0]?.id || '' }));
        }).catch((e) => { console.error(e); toast.error('Não carregou as etapas do funil.'); });
    }, []);

    const salvar = async (depois) => {
        if (!form.titulo.trim()) { toast.error('Dê um título à oportunidade.'); return; }
        setSalvando(true);
        try {
            const { lead: row, oportunidade } = await virarOportunidade(lead, { ...form, titulo: form.titulo.trim() });
            if (depois === 'ganhar') { setGanhar({ row, oportunidade }); return; }
            toast.success('Oportunidade criada no Vendas.');
            onFeito(row);
            if (depois === 'abrir') navigate(`/vendas?abrir=${oportunidade.id}`);
        } catch (e) {
            console.error(e);
            toast.error(e.code === '42501' ? 'Sem permissão para criar oportunidade.' : 'Não criou a oportunidade.');
            setSalvando(false);
        }
    };

    if (ganhar) {
        return (
            <GanharModal oportunidade={ganhar.oportunidade}
                onClose={() => { toast('A oportunidade ficou aberta no Vendas.'); onFeito(ganhar.row); }}
                onGanha={(projeto) => { onFeito(ganhar.row); navigate(`/projetos/${projeto.id}`); }} />
        );
    }

    return (
        <Janela titulo="Virar oportunidade" icone={Target} onClose={onClose} largura="max-w-xl"
            rodape={<div className="w-full grid grid-cols-2 gap-2 sm:flex sm:justify-end [&>button]:justify-center [&>button]:whitespace-nowrap">
                <button onClick={onClose} className={`${btnSecundario} order-3 sm:order-none`}>Cancelar</button>
                <button onClick={() => salvar('abrir')} disabled={salvando} className={`${btnSecundario} order-1 sm:order-none border border-black/[.085] sm:border-0`}>Criar e abrir no Vendas</button>
                <button onClick={() => salvar('ganhar')} disabled={salvando} className={`${btnSecundario} order-2 sm:order-none border border-black/[.085] sm:border-0 flex items-center gap-1.5`} title="O cliente já fechou: cria a oportunidade ganha e o projeto">
                    <Trophy size={14} /> Já fechou: criar projeto
                </button>
                <button onClick={() => salvar()} disabled={salvando} className={`${btnPrimario} order-4 sm:order-none`}>
                    {salvando ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />} Criar
                </button>
            </div>}>
            <p className="text-[12px] font-semibold text-slate-500">
                <b className="text-slate-700">{lead.nome}</b> entra em Clientes (em negociação) e a oportunidade vai para o funil.
                As notas da prospecção vão junto para o histórico.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Título" className="sm:col-span-2">
                    <input autoFocus value={form.titulo} onChange={(e) => set({ titulo: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Serviços (pode marcar mais de um)" className="sm:col-span-2">
                    <ServicosPicker value={form.servicos} onChange={(v) => set({ servicos: v })} />
                </Campo>
                <Campo label="Etapa no funil">
                    <select value={form.etapa_id} onChange={(e) => set({ etapa_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select>
                </Campo>
                <Campo label="Responsável">
                    <select value={form.responsavel_id || ''} onChange={(e) => set({ responsavel_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        <option value="">—</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </Campo>
                <Campo label="Valor do projeto (se já souber)">
                    <CurrencyInput value={form.valor} onChange={(v) => set({ valor: v })} className={`${inputCls} text-right`} />
                </Campo>
                <Campo label="Mensalidade (se houver)">
                    <CurrencyInput value={form.valor_recorrente} onChange={(v) => set({ valor_recorrente: v })} className={`${inputCls} text-right`} />
                </Campo>
                <Campo label="Previsão de fechamento">
                    <input type="date" value={form.previsao_fechamento} onChange={(e) => set({ previsao_fechamento: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Observações" className="sm:col-span-2">
                    <textarea rows={2} value={form.notas} onChange={(e) => set({ notas: e.target.value })} className={textareaCls}
                        placeholder="O que a pessoa quer, prazo, orçamento…" />
                </Campo>
            </div>
        </Janela>
    );
}
