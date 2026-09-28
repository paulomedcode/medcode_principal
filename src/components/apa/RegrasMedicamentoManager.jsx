import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Pencil, Trash2, Search, ShieldCheck, ShieldQuestion, X, AlertTriangle, Info, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import { listarTodasRegras, salvarRegra, excluirRegra } from '../../services/apaRegras';
import { avaliarMedicamento, normalizar } from '../../utils/apaMedicationRules';
import { logAction } from '../../utils/logger';
import { usePermission } from '../../contexts/PermissionContext';

const REGRA_VAZIA = {
    id: null, codigo: '', ativo: true, ordem: 100, classe: '', termos: [],
    conduta: '', texto: '', nivel: 'atencao', contexto: 'sempre',
    clcr_faixas: null, referencia: '', revisado: false, revisado_por: '', revisado_em: null
};

function gerarCodigo(classe) {
    return normalizar(classe).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

const inputBase = 'w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors';
const rotulo = 'block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1';

/**
 * Cadastro das regras de conduta pré-operatória de medicamentos usadas pela APA.
 *
 * Sem esta tela, incluir um fármaco novo exigiria alterar código — que é
 * exatamente o problema do protótipo que deu origem a este módulo.
 */
export default function RegrasMedicamentoManager() {
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Acesso Total (Admin)') || hasPermission('Acessar Configurações');

    const [regras, setRegras] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erroTabela, setErroTabela] = useState(false);

    const [busca, setBusca] = useState('');
    const [filtroContexto, setFiltroContexto] = useState('todos');
    const [emEdicao, setEmEdicao] = useState(null);
    const [salvando, setSalvando] = useState(false);

    const [testeNome, setTesteNome] = useState('');
    const [testeNeuroeixo, setTesteNeuroeixo] = useState(false);
    const [testeClCr, setTesteClCr] = useState('');

    const carregar = async () => {
        setCarregando(true);
        const { regras: lista, erro } = await listarTodasRegras();
        setRegras(lista);
        setErroTabela(!!erro);
        setCarregando(false);
    };

    useEffect(() => {
        let ativo = true;
        listarTodasRegras().then(({ regras: lista, erro }) => {
            if (!ativo) return;
            setRegras(lista);
            setErroTabela(!!erro);
            setCarregando(false);
        });
        return () => { ativo = false; };
    }, []);

    const filtradas = useMemo(() => {
        const termo = normalizar(busca);
        return regras.filter(regra => {
            if (filtroContexto !== 'todos' && regra.contexto !== filtroContexto) return false;
            if (!termo) return true;
            const alvo = normalizar(`${regra.classe} ${regra.conduta} ${(regra.termos || []).join(' ')}`);
            return alvo.includes(termo);
        });
    }, [regras, busca, filtroContexto]);

    const naoRevisadas = regras.filter(r => !r.revisado).length;

    const resultadoTeste = useMemo(() => {
        if (!testeNome.trim()) return null;
        const clcr = testeClCr.trim() ? Number(testeClCr) : null;
        return avaliarMedicamento(
            { nome: testeNome },
            regras,
            { temNeuroeixo: testeNeuroeixo, clcr: Number.isFinite(clcr) ? clcr : null }
        );
    }, [testeNome, testeNeuroeixo, testeClCr, regras]);

    const handleSalvar = async () => {
        const regra = emEdicao;
        if (!regra.classe.trim()) return toast.error('Informe o nome da classe.');
        if (!regra.conduta.trim()) return toast.error('Informe a conduta.');
        if (!regra.termos.length) return toast.error('Informe ao menos um termo de busca.');
        if (regra.revisado && !regra.revisado_por?.trim()) return toast.error('Informe quem revisou a regra.');

        setSalvando(true);
        const payload = {
            ...regra,
            codigo: regra.codigo?.trim() || gerarCodigo(regra.classe),
            revisado_em: regra.revisado ? (regra.revisado_em || new Date().toISOString().slice(0, 10)) : null
        };
        const { error } = await salvarRegra(payload);
        setSalvando(false);

        if (error) return toast.error('Erro ao salvar: ' + error.message);
        await logAction('REGRAS DE MEDICAMENTO (APA)', `Regra "${payload.classe}" ${regra.id ? 'atualizada' : 'criada'}.`);
        toast.success(regra.id ? 'Regra atualizada!' : 'Regra criada!');
        setEmEdicao(null);
        carregar();
    };

    const handleExcluir = async (regra) => {
        if (!window.confirm(`Excluir a regra "${regra.classe}"? Ela deixará de gerar alertas na APA.`)) return;
        const { error } = await excluirRegra(regra.id);
        if (error) return toast.error('Erro ao excluir: ' + error.message);
        await logAction('REGRAS DE MEDICAMENTO (APA)', `Regra "${regra.classe}" excluída.`);
        toast.success('Regra excluída.');
        carregar();
    };

    const handleAlternarAtivo = async (regra) => {
        const { error } = await salvarRegra({ ...regra, ativo: !regra.ativo });
        if (error) return toast.error('Erro: ' + error.message);
        await logAction('REGRAS DE MEDICAMENTO (APA)', `Regra "${regra.classe}" ${regra.ativo ? 'desativada' : 'ativada'}.`);
        carregar();
    };

    if (carregando) {
        return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
    }

    if (erroTabela) {
        return (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                A tabela de regras ainda não existe neste banco. Aplique a migration
                <code className="mx-1 px-1 bg-white/70 rounded">20260811120000_apa_regras_medicamento.sql</code>
                para habilitar os alertas de conduta na APA.
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-800">Regras de medicamentos (APA)</h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {regras.length} regras · {regras.filter(r => r.ativo).length} ativas · {regras.filter(r => r.contexto === 'neuroeixo').length} de neuroeixo
                    </p>
                </div>
                {podeEditar && (
                    <button
                        onClick={() => setEmEdicao({ ...REGRA_VAZIA })}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
                    >
                        <Plus size={15} /> Nova regra
                    </button>
                )}
            </div>

            {naoRevisadas > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                    <ShieldQuestion size={16} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold leading-relaxed">
                        {naoRevisadas} {naoRevisadas === 1 ? 'regra ainda não foi revisada' : 'regras ainda não foram revisadas'} por anestesista responsável.
                        Na APA elas aparecem com aviso de conteúdo não validado. Ao revisar, registre quem revisou e a referência bibliográfica.
                    </p>
                </div>
            )}

            {/* Testador ------------------------------------------------------- */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                    <FlaskConical size={15} className="text-slate-500" />
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide">Testar um medicamento</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-6">
                        <label className={rotulo}>Nome digitado pelo médico</label>
                        <input value={testeNome} onChange={e => setTesteNome(e.target.value)} placeholder="Ex.: Xarelto 20mg" className={inputBase} />
                    </div>
                    <div className="md:col-span-3">
                        <label className={rotulo}>ClCr (mL/min)</label>
                        <input value={testeClCr} onChange={e => setTesteClCr(e.target.value)} placeholder="opcional" className={inputBase} />
                    </div>
                    <div className="md:col-span-3 flex items-end">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 pb-2">
                            <input type="checkbox" checked={testeNeuroeixo} onChange={e => setTesteNeuroeixo(e.target.checked)} className="w-4 h-4 rounded" />
                            Plano com neuroeixo
                        </label>
                    </div>
                </div>

                {resultadoTeste && (
                    <div className="space-y-1.5 pt-1">
                        {resultadoTeste.alertas.length === 0 && resultadoTeste.ocultosPorContexto.length === 0 && (
                            <p className="text-xs font-bold text-slate-400">Nenhuma regra casa com esse nome.</p>
                        )}
                        {resultadoTeste.alertas.map((alerta, i) => (
                            <div key={i} className={`p-2 rounded-lg text-[11px] font-semibold border-l-4 ${alerta.nivel === 'alta' ? 'bg-rose-50 border-rose-400 text-rose-900' : 'bg-amber-50 border-amber-400 text-amber-900'}`}>
                                <strong>{alerta.classe}</strong> — {alerta.conduta}
                                {alerta.detalheClCr && <span className="block opacity-70">{alerta.detalheClCr}</span>}
                            </div>
                        ))}
                        {resultadoTeste.ocultosPorContexto.map((alerta, i) => (
                            <div key={`o${i}`} className="p-2 rounded-lg text-[11px] font-semibold bg-slate-100 border-l-4 border-slate-300 text-slate-500">
                                <strong>{alerta.classe}</strong> — oculta: só aparece quando o plano prevê punção de neuroeixo
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Filtros -------------------------------------------------------- */}
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por classe, conduta ou termo..." className={`${inputBase} pl-9`} />
                </div>
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                    {[
                        { id: 'todos', label: 'Todas' },
                        { id: 'sempre', label: 'Sempre' },
                        { id: 'neuroeixo', label: 'Neuroeixo' }
                    ].map(opcao => (
                        <button
                            key={opcao.id}
                            onClick={() => setFiltroContexto(opcao.id)}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-colors ${filtroContexto === opcao.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {opcao.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Lista ---------------------------------------------------------- */}
            <div className="space-y-2">
                {filtradas.length === 0 && (
                    <p className="text-xs font-bold text-slate-400 py-6 text-center">Nenhuma regra encontrada.</p>
                )}
                {filtradas.map(regra => (
                    <div key={regra.id} className={`p-3 rounded-xl border bg-white flex flex-wrap items-start gap-3 ${regra.ativo ? 'border-slate-200' : 'border-slate-200 opacity-55'}`}>
                        <div className="flex-1 min-w-[240px]">
                            <div className="flex flex-wrap items-center gap-2">
                                {regra.nivel === 'alta'
                                    ? <AlertTriangle size={14} className="text-rose-500 shrink-0" />
                                    : <Info size={14} className="text-amber-500 shrink-0" />}
                                <span className="text-xs font-black text-slate-800">{regra.classe}</span>
                                {regra.contexto === 'neuroeixo' && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-indigo-100 text-indigo-700">Neuroeixo</span>
                                )}
                                {regra.clcr_faixas && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-cyan-100 text-cyan-700">Por ClCr</span>
                                )}
                                {regra.revisado
                                    ? <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-emerald-100 text-emerald-700"><ShieldCheck size={10} /> Revisada</span>
                                    : <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-slate-100 text-slate-500"><ShieldQuestion size={10} /> Não revisada</span>}
                            </div>
                            <p className="text-[11px] font-bold text-slate-600 mt-1">{regra.conduta}</p>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">{(regra.termos || []).join(' · ')}</p>
                        </div>
                        {podeEditar && (
                            <div className="flex items-center gap-1">
                                <button onClick={() => handleAlternarAtivo(regra)} title={regra.ativo ? 'Desativar' : 'Ativar'} className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-colors ${regra.ativo ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                                    {regra.ativo ? 'Ativa' : 'Inativa'}
                                </button>
                                <button onClick={() => setEmEdicao({ ...regra, termos: [...(regra.termos || [])] })} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"><Pencil size={15} /></button>
                                <button onClick={() => handleExcluir(regra)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 size={15} /></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {emEdicao && (
                <EditorRegra
                    regra={emEdicao}
                    setRegra={setEmEdicao}
                    onSalvar={handleSalvar}
                    onFechar={() => setEmEdicao(null)}
                    salvando={salvando}
                />
            )}
        </div>
    );
}

/** Modal de criação/edição de uma regra. */
function EditorRegra({ regra, setRegra, onSalvar, onFechar, salvando }) {
    const [novoTermo, setNovoTermo] = useState('');
    const alterar = (campo, valor) => setRegra(atual => ({ ...atual, [campo]: valor }));

    const adicionarTermos = () => {
        const novos = novoTermo.split(',').map(t => normalizar(t)).filter(Boolean);
        if (!novos.length) return;
        const unicos = [...new Set([...(regra.termos || []), ...novos])];
        alterar('termos', unicos);
        setNovoTermo('');
    };

    const faixas = regra.clcr_faixas || [];
    const alterarFaixa = (indice, campo, valor) => {
        const copia = faixas.map((f, i) => i === indice ? { ...f, [campo]: valor } : f);
        alterar('clcr_faixas', copia);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="text-sm font-black text-slate-800">{regra.id ? 'Editar regra' : 'Nova regra'}</h3>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-8">
                            <label className={rotulo}>Classe / nome exibido *</label>
                            <input value={regra.classe} onChange={e => alterar('classe', e.target.value)} placeholder="Ex.: Inibidor de SGLT-2" className={inputBase} />
                        </div>
                        <div className="md:col-span-4">
                            <label className={rotulo}>Ordem</label>
                            <input type="number" value={regra.ordem} onChange={e => alterar('ordem', e.target.value)} className={inputBase} />
                        </div>
                    </div>

                    <div>
                        <label className={rotulo}>Termos de busca * (genéricos e marcas)</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {(regra.termos || []).map(termo => (
                                <span key={termo} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-md">
                                    {termo}
                                    <button onClick={() => alterar('termos', regra.termos.filter(t => t !== termo))} className="text-slate-400 hover:text-rose-600"><X size={11} /></button>
                                </span>
                            ))}
                            {(regra.termos || []).length === 0 && <span className="text-[11px] text-slate-400 font-semibold">Nenhum termo ainda.</span>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                value={novoTermo}
                                onChange={e => setNovoTermo(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarTermos(); } }}
                                placeholder="Digite e tecle Enter. Separe vários por vírgula."
                                className={inputBase}
                            />
                            <button onClick={adicionarTermos} className="px-3 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900">Adicionar</button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">
                            O motor casa palavra inteira: &quot;aas&quot; não dispara dentro de outra palavra.
                        </p>
                    </div>

                    <div>
                        <label className={rotulo}>Conduta * (frase curta que vira o chip)</label>
                        <input value={regra.conduta} onChange={e => alterar('conduta', e.target.value)} placeholder="Ex.: Suspender 3–4 dias antes" className={inputBase} />
                    </div>

                    <div>
                        <label className={rotulo}>Texto completo</label>
                        <textarea value={regra.texto} onChange={e => alterar('texto', e.target.value)} rows={4} className={inputBase} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={rotulo}>Nível</label>
                            <select value={regra.nivel} onChange={e => alterar('nivel', e.target.value)} className={inputBase}>
                                <option value="atencao">Atenção</option>
                                <option value="alta">Alta (destaque em vermelho)</option>
                            </select>
                        </div>
                        <div>
                            <label className={rotulo}>Quando disparar</label>
                            <select value={regra.contexto} onChange={e => alterar('contexto', e.target.value)} className={inputBase}>
                                <option value="sempre">Sempre</option>
                                <option value="neuroeixo">Só quando o plano prevê punção de neuroeixo</option>
                            </select>
                        </div>
                    </div>

                    {/* Faixas por ClCr */}
                    <div className="p-3 rounded-xl bg-cyan-50/70 border border-cyan-200 space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-cyan-800 uppercase tracking-wide">Conduta por clearance de creatinina</label>
                            <button
                                onClick={() => alterar('clcr_faixas', [...faixas, { ate: null, conduta: '', texto: '' }])}
                                className="px-2 py-1 text-[10px] font-black uppercase bg-cyan-600 text-white rounded-md hover:bg-cyan-700"
                            >
                                + Faixa
                            </button>
                        </div>
                        {faixas.length === 0 && (
                            <p className="text-[10px] text-cyan-800/70 font-semibold">
                                Sem faixas: a conduta acima vale para todos. Use faixas quando o intervalo depende da função renal (ex.: dabigatrana).
                            </p>
                        )}
                        {faixas.map((faixa, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start p-2 bg-white rounded-lg border border-cyan-100">
                                <div className="md:col-span-3">
                                    <label className="text-[9px] font-black text-slate-400 uppercase">ClCr abaixo de</label>
                                    <input
                                        type="number"
                                        value={faixa.ate ?? ''}
                                        onChange={e => alterarFaixa(i, 'ate', e.target.value === '' ? null : Number(e.target.value))}
                                        placeholder="sem limite"
                                        className={inputBase}
                                    />
                                </div>
                                <div className="md:col-span-8">
                                    <label className="text-[9px] font-black text-slate-400 uppercase">Conduta desta faixa</label>
                                    <input value={faixa.conduta} onChange={e => alterarFaixa(i, 'conduta', e.target.value)} className={inputBase} />
                                    <textarea value={faixa.texto} onChange={e => alterarFaixa(i, 'texto', e.target.value)} rows={2} placeholder="Texto completo desta faixa" className={`${inputBase} mt-1`} />
                                </div>
                                <div className="md:col-span-1 flex md:justify-center pt-4">
                                    <button onClick={() => alterar('clcr_faixas', faixas.filter((_, idx) => idx !== i))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Revisão clínica */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div>
                            <label className={rotulo}>Referência bibliográfica</label>
                            <input value={regra.referencia || ''} onChange={e => alterar('referencia', e.target.value)} placeholder="Ex.: ASRA Guidelines, 4ª ed." className={inputBase} />
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                            <input type="checkbox" checked={!!regra.revisado} onChange={e => alterar('revisado', e.target.checked)} className="w-4 h-4 rounded" />
                            Conteúdo revisado por anestesista responsável
                        </label>
                        {regra.revisado && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className={rotulo}>Revisado por *</label>
                                    <input value={regra.revisado_por || ''} onChange={e => alterar('revisado_por', e.target.value)} placeholder="Nome e CRM" className={inputBase} />
                                </div>
                                <div>
                                    <label className={rotulo}>Data da revisão</label>
                                    <input type="date" value={regra.revisado_em || ''} onChange={e => alterar('revisado_em', e.target.value)} className={inputBase} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                    <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={onSalvar} disabled={salvando} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg shadow-sm">
                        {salvando && <Loader2 size={14} className="animate-spin" />}
                        Salvar regra
                    </button>
                </div>
            </div>
        </div>
    );
}
