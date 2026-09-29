import React, { useEffect, useState } from 'react';
import { FolderKanban, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { salvarProjeto, listarEmpresas } from '../../services/crm';
import { SERVICOS, STATUS_PROJETO } from '../../config/servicos';
import CurrencyInput from '../finance/CurrencyInput';
import SearchableSelect from '../finance/SearchableSelect';
import { Janela, Campo, inputCls, textareaCls, btnPrimario, btnSecundario } from './ui';
import { useUsuarios } from './dados';
import useCadastroRapido from './useCadastroRapido';

/**
 * Cadastro/edição de projeto. O caminho normal é nascer de uma oportunidade
 * ganha; criar aqui é para projeto interno ou que veio de fora do funil (não
 * gera parcelas — o financeiro se lança à parte, vinculando o projeto).
 */
export default function ProjetoModal({ projeto, onClose, onSaved }) {
    const usuarios = useUsuarios();
    const [empresas, setEmpresas] = useState([]);
    const [form, setForm] = useState(() => ({
        nome: '', party_id: '', servico: 'SITE', status: 'PLANEJAMENTO', responsavel_id: '', data_inicio: '', prazo: '',
        valor_contratado: 0, valor_recorrente: 0, descricao: '', ...(projeto || {}),
    }));
    const [salvando, setSalvando] = useState(false);
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const { pedir, janela } = useCadastroRapido({
        onCriada: (row) => setEmpresas((l) => [...l, row].sort((a, b) => a.name.localeCompare(b.name))),
    });

    useEffect(() => { listarEmpresas().then(setEmpresas).catch(() => {}); }, []);

    const salvar = async (e) => {
        e?.preventDefault();
        if (!form.nome.trim()) return toast.error('Dê um nome ao projeto.');
        if (!form.party_id) return toast.error('Escolha o cliente.');
        setSalvando(true);
        try {
            const patch = { ...form, id: projeto?.id, nome: form.nome.trim() };
            if (form.status === 'CONCLUIDO' && !form.concluido_em) patch.concluido_em = new Date().toISOString().slice(0, 10);
            if (form.status !== 'CONCLUIDO') patch.concluido_em = null;
            const row = await salvarProjeto(patch);
            toast.success(projeto?.id ? 'Projeto atualizado.' : 'Projeto criado.');
            onSaved?.(row);
        } catch (err) {
            console.error(err);
            toast.error('Não foi possível salvar o projeto.');
        } finally {
            setSalvando(false);
        }
    };

    return (<>
        <Janela titulo={projeto?.id ? 'Editar projeto' : 'Novo projeto'} icone={FolderKanban} onClose={onClose}
            rodape={<>
                <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} className={btnPrimario}>
                    {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                </button>
            </>}>
            <form onSubmit={salvar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Nome do projeto" className="sm:col-span-2">
                    <input autoFocus value={form.nome} onChange={(e) => set({ nome: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Cliente">
                    <SearchableSelect options={empresas.filter((p) => p.kind !== 'FORNECEDOR' || p.id === form.party_id).map((p) => ({ value: p.id, label: p.name }))}
                        value={form.party_id} onChange={(v) => set({ party_id: v })} placeholder="Selecione…" searchPlaceholder="Digite o nome do cliente…"
                        onCreate={(nome) => pedir(nome, 'CLIENTE')} createLabel="Cadastrar cliente" />
                </Campo>
                <Campo label="Serviço">
                    <select value={form.servico} onChange={(e) => set({ servico: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        {SERVICOS.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                    </select>
                </Campo>
                <Campo label="Status">
                    <select value={form.status} onChange={(e) => set({ status: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        {STATUS_PROJETO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </Campo>
                <Campo label="Responsável">
                    <select value={form.responsavel_id || ''} onChange={(e) => set({ responsavel_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        <option value="">—</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </Campo>
                <Campo label="Início">
                    <input type="date" value={form.data_inicio || ''} onChange={(e) => set({ data_inicio: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Prazo de entrega">
                    <input type="date" value={form.prazo || ''} onChange={(e) => set({ prazo: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Valor contratado">
                    <CurrencyInput value={form.valor_contratado} onChange={(v) => set({ valor_contratado: v })} className={`${inputCls} text-right`} />
                </Campo>
                <Campo label="Mensalidade">
                    <CurrencyInput value={form.valor_recorrente} onChange={(v) => set({ valor_recorrente: v })} className={`${inputCls} text-right`} />
                </Campo>
                <Campo label="Descrição / escopo" className="sm:col-span-2">
                    <textarea value={form.descricao || ''} onChange={(e) => set({ descricao: e.target.value })} className={`${textareaCls} h-20`} />
                </Campo>
                {!projeto?.id && (
                    <p className="sm:col-span-2 text-[10.5px] font-semibold text-slate-400">
                        Projeto criado aqui não gera contas a receber. Para isso, ganhe uma oportunidade no funil ou lance no financeiro vinculando o projeto.
                    </p>
                )}
            </form>
        </Janela>
        {janela}
    </>);
}
