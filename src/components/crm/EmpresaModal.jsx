import React, { useState } from 'react';
import { Building2, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { salvarEmpresa } from '../../services/crm';
import { TIPOS_EMPRESA } from '../../config/servicos';
import { maskDocumento, maskTelefone } from '../../utils/masks';
import { Janela, Campo, inputCls, textareaCls, btnPrimario, btnSecundario } from './ui';
import { useUsuarios, useListasGerais } from './dados';

const VAZIA = {
    name: '', kind: 'LEAD', tipo_pessoa: 'PJ', nome_fantasia: '', document: '', email: '', telefone: '',
    site: '', instagram: '', segmento: '', origem: '', cidade: '', uf: '', responsavel_id: '', notes: '',
};

/** Cadastro/edição de empresa (lead, cliente ou fornecedor). */
export default function EmpresaModal({ empresa, onClose, onSaved, kindInicial = 'LEAD', nomeInicial = '' }) {
    const [form, setForm] = useState(() => ({ ...VAZIA, kind: kindInicial, name: nomeInicial, ...(empresa || {}) }));
    const [salvando, setSalvando] = useState(false);
    const usuarios = useUsuarios();
    const { segmentos, origens_lead } = useListasGerais();
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    const salvar = async (e) => {
        e?.preventDefault();
        if (!form.name.trim()) return toast.error('Informe o nome da empresa ou pessoa.');
        setSalvando(true);
        try {
            const row = await salvarEmpresa({ ...form, name: form.name.trim(), id: empresa?.id });
            toast.success(empresa?.id ? 'Cadastro atualizado.' : 'Empresa cadastrada.');
            onSaved?.(row);
        } catch (err) {
            console.error(err);
            toast.error('Não foi possível salvar o cadastro.');
        } finally {
            setSalvando(false);
        }
    };

    // Opções da lista + o valor atual, para não sumir o que foi gravado antes
    // de a opção existir na lista de Configurações.
    const opcoes = (lista, atual) => [...new Set([...(lista || []), ...(atual ? [atual] : [])])];

    return (
        <Janela
            titulo={empresa?.id ? 'Editar empresa' : 'Nova empresa'}
            icone={Building2}
            onClose={onClose}
            rodape={<>
                <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} className={btnPrimario}>
                    {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                </button>
            </>}
        >
            <form onSubmit={salvar} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Campo label="Nome / Razão social" className="sm:col-span-2">
                        <input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="Ex: Clínica Sorriso Ltda" />
                    </Campo>
                    <Campo label="Tipo">
                        <select value={form.kind} onChange={(e) => set({ kind: e.target.value })} className={`${inputCls} cursor-pointer`}>
                            {TIPOS_EMPRESA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Nome fantasia" className="sm:col-span-2">
                        <input value={form.nome_fantasia || ''} onChange={(e) => set({ nome_fantasia: e.target.value })} className={inputCls} />
                    </Campo>
                    <Campo label={form.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'}>
                        <div className="flex gap-1.5">
                            <select value={form.tipo_pessoa} onChange={(e) => set({ tipo_pessoa: e.target.value })} className={`${inputCls} w-16 cursor-pointer px-2`}>
                                <option value="PJ">PJ</option>
                                <option value="PF">PF</option>
                            </select>
                            <input value={form.document || ''} onChange={(e) => set({ document: maskDocumento(e.target.value) })} className={inputCls} />
                        </div>
                    </Campo>
                    <Campo label="E-mail">
                        <input type="email" value={form.email || ''} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
                    </Campo>
                    <Campo label="Telefone / WhatsApp">
                        <input value={form.telefone || ''} onChange={(e) => set({ telefone: maskTelefone(e.target.value) })} className={inputCls} maxLength={15} />
                    </Campo>
                    <Campo label="Site">
                        <input value={form.site || ''} onChange={(e) => set({ site: e.target.value })} className={inputCls} placeholder="www.empresa.com.br" />
                    </Campo>
                    <Campo label="Instagram">
                        <input value={form.instagram || ''} onChange={(e) => set({ instagram: e.target.value })} className={inputCls} placeholder="@empresa" />
                    </Campo>
                    <Campo label="Cidade">
                        <input value={form.cidade || ''} onChange={(e) => set({ cidade: e.target.value })} className={inputCls} />
                    </Campo>
                    <Campo label="UF">
                        <input value={form.uf || ''} onChange={(e) => set({ uf: e.target.value.toUpperCase().slice(0, 2) })} className={inputCls} />
                    </Campo>
                    <Campo label="Segmento">
                        <select value={form.segmento || ''} onChange={(e) => set({ segmento: e.target.value })} className={`${inputCls} cursor-pointer`}>
                            <option value="">—</option>
                            {opcoes(segmentos, form.segmento).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Origem do lead">
                        <select value={form.origem || ''} onChange={(e) => set({ origem: e.target.value })} className={`${inputCls} cursor-pointer`}>
                            <option value="">—</option>
                            {opcoes(origens_lead, form.origem).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Responsável">
                        <select value={form.responsavel_id || ''} onChange={(e) => set({ responsavel_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                            <option value="">—</option>
                            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Observações" className="sm:col-span-3">
                        <textarea value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={`${textareaCls} h-16`} />
                    </Campo>
                </div>
                {(segmentos.length === 0 || origens_lead.length === 0) && (
                    <p className="text-[10px] font-semibold text-slate-400">
                        As listas de segmento e origem se cadastram em Configurações › Cadastros Gerais.
                    </p>
                )}
            </form>
        </Janela>
    );
}
