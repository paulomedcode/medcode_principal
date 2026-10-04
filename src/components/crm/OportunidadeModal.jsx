import React, { useEffect, useMemo, useState } from 'react';
import { Target, Loader2, Save, Trophy, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { salvarOportunidade, listarContatos, ganharOportunidade, perderOportunidade } from '../../services/crm';
import { financeService } from '../../services/financeService';
import { idsServicos, servicosDe, fmtBRL } from '../../config/servicos';
import { useAuth } from '../../contexts/AuthContext';
import CurrencyInput from '../finance/CurrencyInput';
import SearchableSelect from '../finance/SearchableSelect';
import useCadastroRapido from './useCadastroRapido';
import { Janela, Campo, ServicosPicker, inputCls, textareaCls, btnPrimario, btnSecundario } from './ui';
import { useUsuarios, useListasGerais } from './dados';

const hojeMais = (dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** Criar/editar oportunidade. `empresas` = lista para escolher (lead/cliente). */
export function OportunidadeModal({ oportunidade, etapas, empresas, partyIdFixo, onClose, onSaved, onEmpresaCriada }) {
    const { currentUser } = useAuth();
    const usuarios = useUsuarios();
    const { origens_lead } = useListasGerais();
    const abertas = etapas.filter((e) => e.tipo === 'ABERTA');
    const [form, setForm] = useState(() => ({
        titulo: '', party_id: partyIdFixo || '', contato_id: '', valor: 0, valor_recorrente: 0,
        etapa_id: abertas[0]?.id || '', responsavel_id: currentUser?.id || '', origem: '', previsao_fechamento: '', notas: '',
        ...(oportunidade || {}),
        servicos: idsServicos(oportunidade),
    }));
    const [contatos, setContatos] = useState([]);
    const [salvando, setSalvando] = useState(false);
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const { pedir, janela } = useCadastroRapido({
        onCriada: (row) => { onEmpresaCriada?.(row); set({ contato_id: '' }); },
    });

    useEffect(() => {
        if (!form.party_id) { setContatos([]); return; }
        listarContatos(form.party_id).then(setContatos).catch(() => setContatos([]));
    }, [form.party_id]);

    const salvar = async (e) => {
        e?.preventDefault();
        if (!form.titulo.trim()) return toast.error('Dê um título à oportunidade.');
        if (!form.party_id) return toast.error('Escolha a empresa.');
        if (!form.etapa_id) return toast.error('Escolha a etapa.');
        setSalvando(true);
        try {
            const row = await salvarOportunidade({ ...form, id: oportunidade?.id, titulo: form.titulo.trim() });
            toast.success(oportunidade?.id ? 'Oportunidade atualizada.' : 'Oportunidade criada.');
            onSaved?.(row);
        } catch (err) {
            console.error(err);
            toast.error('Não foi possível salvar a oportunidade.');
        } finally {
            setSalvando(false);
        }
    };

    const opcoesEmpresa = empresas
        .filter((p) => p.kind !== 'FORNECEDOR' || p.id === form.party_id)
        .map((p) => ({ value: p.id, label: `${p.name}${p.kind === 'LEAD' ? ' · em negociação' : ''}` }));

    return (
        <>
            <Janela
                titulo={oportunidade?.id ? 'Editar oportunidade' : 'Nova oportunidade'}
                icone={Target}
                onClose={onClose}
                rodape={<>
                    <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                    <button onClick={salvar} disabled={salvando} className={btnPrimario}>
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                    </button>
                </>}
            >
                <form onSubmit={salvar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Campo label="Título" className="sm:col-span-2">
                        <input autoFocus value={form.titulo} onChange={(e) => set({ titulo: e.target.value })} className={inputCls}
                            placeholder="Ex: Landing page de captação — Clínica Sorriso" />
                    </Campo>
                    <Campo label="Empresa">
                        {partyIdFixo ? (
                            <input disabled value={empresas.find((p) => p.id === partyIdFixo)?.name || ''} className={inputCls} />
                        ) : (
                            <SearchableSelect options={opcoesEmpresa} value={form.party_id}
                                onChange={(v) => set({ party_id: v, contato_id: '' })}
                                placeholder="Selecione…" searchPlaceholder="Buscar empresa…"
                                onCreate={(nome) => pedir(nome, 'LEAD')} createLabel="Cadastrar" />
                        )}
                    </Campo>
                    <Campo label="Contato">
                        <select value={form.contato_id || ''} onChange={(e) => set({ contato_id: e.target.value })} className={`${inputCls} cursor-pointer`} disabled={!form.party_id}>
                            <option value="">—</option>
                            {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` (${c.cargo})` : ''}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Serviços (pode marcar mais de um)" className="sm:col-span-2">
                        <ServicosPicker value={form.servicos} onChange={(v) => set({ servicos: v })} />
                    </Campo>
                    <Campo label="Etapa">
                        <select value={form.etapa_id} onChange={(e) => set({ etapa_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                            {(oportunidade?.id ? etapas : abertas).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Valor do projeto">
                        <CurrencyInput value={form.valor} onChange={(v) => set({ valor: v })} className={`${inputCls} text-right`} />
                    </Campo>
                    <Campo label="Mensalidade (se houver)">
                        <CurrencyInput value={form.valor_recorrente} onChange={(v) => set({ valor_recorrente: v })} className={`${inputCls} text-right`} />
                    </Campo>
                    <Campo label="Previsão de fechamento">
                        <input type="date" value={form.previsao_fechamento || ''} onChange={(e) => set({ previsao_fechamento: e.target.value })} className={inputCls} />
                    </Campo>
                    <Campo label="Responsável">
                        <select value={form.responsavel_id || ''} onChange={(e) => set({ responsavel_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                            <option value="">—</option>
                            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Origem">
                        <select value={form.origem || ''} onChange={(e) => set({ origem: e.target.value })} className={`${inputCls} cursor-pointer`}>
                            <option value="">—</option>
                            {[...new Set([...origens_lead, ...(form.origem ? [form.origem] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Observações" className="sm:col-span-2">
                        <textarea value={form.notas || ''} onChange={(e) => set({ notas: e.target.value })} className={`${textareaCls} h-16`} />
                    </Campo>
                </form>
            </Janela>

            {janela}
        </>
    );
}

/**
 * Ganhar: define como o dinheiro entra (parcelas + mensalidade) e cria o
 * projeto. Tudo numa transação no banco (ganhar_oportunidade).
 */
export function GanharModal({ oportunidade, onClose, onGanha }) {
    const { currentUser } = useAuth();
    const usuarios = useUsuarios();
    const [contas, setContas] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [salvando, setSalvando] = useState(false);
    const [form, setForm] = useState({
        nome: oportunidade.titulo, servicos: idsServicos(oportunidade), responsavel_id: oportunidade.responsavel_id || currentUser?.id || '',
        data_inicio: hojeMais(0), prazo: '', valor: Number(oportunidade.valor) || 0, parcelas: 1, primeiro_vencimento: hojeMais(7),
        account_id: '', category_id: '', valor_recorrente: Number(oportunidade.valor_recorrente) || 0, inicio_recorrencia: hojeMais(30),
        category_recorrente_id: '', criarEntregas: true,
    });
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const servicos = servicosDe(form);
    // Categoria sugerida: a do serviço principal (o primeiro que tem categoria).
    const categoriaSugerida = servicos.find((s) => s.categoria)?.categoria || null;

    useEffect(() => {
        Promise.all([financeService.getAccounts(), financeService.getCategories()]).then(([a, c]) => {
            setContas(a || []);
            const receitas = (c || []).filter((x) => x.type === 'ENTRADA');
            setCategorias(receitas);
            const porNome = (n) => receitas.find((x) => x.name === n)?.id || '';
            setForm((f) => ({
                ...f,
                account_id: f.account_id || a?.[0]?.id || '',
                category_id: f.category_id || porNome(categoriaSugerida),
                category_recorrente_id: f.category_recorrente_id || porNome('Mensalidades e Manutenção'),
            }));
        }).catch((e) => { console.error(e); toast.error('Não foi possível carregar contas e categorias.'); });
    }, [categoriaSugerida]);

    const parcela = useMemo(() => (form.parcelas > 0 ? (Number(form.valor) || 0) / form.parcelas : 0), [form.valor, form.parcelas]);
    const precisaConta = (Number(form.valor) > 0 || Number(form.valor_recorrente) > 0);

    const ganhar = async () => {
        if (!form.nome.trim()) return toast.error('Dê um nome ao projeto.');
        if (precisaConta && !form.account_id) return toast.error('Escolha a conta que vai receber.');
        setSalvando(true);
        try {
            const { projeto, entregasErro } = await ganharOportunidade(oportunidade, {
                ...form, nome: form.nome.trim(), parcelas: Number(form.parcelas) || 1,
            }, { criarEntregas: form.criarEntregas, userId: currentUser?.id });
            toast.success('Oportunidade ganha! Projeto criado.');
            if (entregasErro) toast.error('O projeto foi criado, mas a página de entregas não. Crie pela tela do projeto.');
            onGanha?.(projeto);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Não foi possível ganhar a oportunidade.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela titulo="Ganhar oportunidade" icone={Trophy} onClose={onClose} largura="max-w-xl"
            rodape={<>
                <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={ganhar} disabled={salvando} className={`${btnPrimario} !bg-emerald-600 hover:!bg-emerald-700`}>
                    {salvando ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />} Ganhar e criar projeto
                </button>
            </>}
        >
            <p className="text-[11.5px] font-semibold text-slate-500">
                <b className="text-slate-700">{oportunidade.empresa?.name}</b> vira cliente, nasce o projeto e as contas a receber entram no financeiro.
            </p>

            <div className="bg-white border border-black/[.06] rounded-xl p-3 grid grid-cols-2 gap-3">
                <p className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Projeto</p>
                <Campo label="Nome do projeto" className="col-span-2">
                    <input value={form.nome} onChange={(e) => set({ nome: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Serviços" className="col-span-2">
                    <ServicosPicker value={form.servicos} onChange={(v) => set({ servicos: v })} />
                </Campo>
                <Campo label="Responsável" className="col-span-2">
                    <select value={form.responsavel_id || ''} onChange={(e) => set({ responsavel_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        <option value="">—</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </Campo>
                <Campo label="Início">
                    <input type="date" value={form.data_inicio} onChange={(e) => set({ data_inicio: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Prazo de entrega">
                    <input type="date" value={form.prazo} onChange={(e) => set({ prazo: e.target.value })} className={inputCls} />
                </Campo>
                <label className="col-span-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={form.criarEntregas} onChange={(e) => set({ criarEntregas: e.target.checked })} className="rounded" />
                    Criar a página de entregas em Compromissos, com as fases e tarefas de {servicos.map((s) => s.label).join(' + ')}
                </label>
            </div>

            <div className="bg-white border border-black/[.06] rounded-xl p-3 grid grid-cols-2 gap-3">
                <p className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recebimento</p>
                <Campo label="Valor do projeto">
                    <CurrencyInput value={form.valor} onChange={(v) => set({ valor: v })} className={`${inputCls} text-right`} />
                </Campo>
                <Campo label="Parcelas">
                    <select value={form.parcelas} onChange={(e) => set({ parcelas: Number(e.target.value) })} className={`${inputCls} cursor-pointer`}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}x{n > 1 ? ` de ${fmtBRL((Number(form.valor) || 0) / n)}` : ''}</option>)}
                    </select>
                </Campo>
                <Campo label="1º vencimento">
                    <input type="date" value={form.primeiro_vencimento} onChange={(e) => set({ primeiro_vencimento: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Categoria">
                    <select value={form.category_id} onChange={(e) => set({ category_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        <option value="">Sem categoria</option>
                        {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </Campo>
                <Campo label="Mensalidade (0 = sem)">
                    <CurrencyInput value={form.valor_recorrente} onChange={(v) => set({ valor_recorrente: v })} className={`${inputCls} text-right`} />
                </Campo>
                <Campo label="1ª mensalidade em">
                    <input type="date" value={form.inicio_recorrencia} disabled={!(Number(form.valor_recorrente) > 0)}
                        onChange={(e) => set({ inicio_recorrencia: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Conta que recebe" className="col-span-2">
                    <select value={form.account_id} onChange={(e) => set({ account_id: e.target.value })} className={`${inputCls} cursor-pointer`}>
                        <option value="">Selecione…</option>
                        {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {contas.length === 0 && (
                        <p className="text-[10px] font-semibold text-amber-600 mt-1 ml-1">Nenhuma conta bancária cadastrada — cadastre em Financeiro › Configurações.</p>
                    )}
                </Campo>
            </div>

            {Number(form.valor) > 0 && (
                <p className="text-[11px] font-semibold text-slate-500">
                    Vão entrar {form.parcelas} conta(s) a receber de <b>{fmtBRL(parcela)}</b>
                    {Number(form.valor_recorrente) > 0 && <> e uma mensalidade de <b>{fmtBRL(form.valor_recorrente)}</b></>}.
                </p>
            )}
        </Janela>
    );
}

/** Perder: pede o motivo (vira histórico e relatório de perdas). */
export function PerderModal({ oportunidade, etapaPerdidoId, onClose, onPerdida }) {
    const { currentUser } = useAuth();
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const MOTIVOS = ['Preço', 'Prazo', 'Escolheu concorrente', 'Sem orçamento agora', 'Sem resposta', 'Desistiu do projeto'];

    const perder = async () => {
        setSalvando(true);
        try {
            await perderOportunidade(oportunidade, etapaPerdidoId, motivo.trim(), currentUser?.id);
            toast.success('Oportunidade marcada como perdida.');
            onPerdida?.();
        } catch (e) {
            console.error(e);
            toast.error('Não foi possível atualizar.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela titulo="Marcar como perdida" icone={XCircle} onClose={onClose} largura="max-w-md"
            rodape={<>
                <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={perder} disabled={salvando} className={`${btnPrimario} !bg-rose-600 hover:!bg-rose-700`}>
                    {salvando ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Marcar perdida
                </button>
            </>}
        >
            <p className="text-[11.5px] font-semibold text-slate-600">{oportunidade.titulo}</p>
            <div className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                    <button key={m} type="button" onClick={() => setMotivo(m)}
                        className={`px-2.5 h-7 rounded-lg text-[10.5px] font-bold transition-all ${motivo === m ? 'bg-rose-600 text-white' : 'bg-white border border-black/[.06] text-slate-600 hover:text-slate-900'}`}>
                        {m}
                    </button>
                ))}
            </div>
            <Campo label="Motivo">
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${textareaCls} h-16`} placeholder="Por que não fechou?" />
            </Campo>
        </Janela>
    );
}

