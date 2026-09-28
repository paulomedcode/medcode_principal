import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Pencil, Trash2, X, Search, Rows3, Syringe } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    listarParametros, salvarParametro, excluirParametro,
    listarFarmacos, salvarFarmaco, excluirFarmaco
} from '../../services/faCatalogos';
import { normalizar } from '../../utils/apaMedicationRules';
import { logAction } from '../../utils/logger';
import { usePermission } from '../../contexts/PermissionContext';

/**
 * Cadastro das linhas da grade e dos fármacos da Ficha Anestésica.
 *
 * Sem esta tela, incluir um fármaco ou mudar a faixa plausível de um parâmetro
 * exigiria SQL — o mesmo defeito que o protótipo tinha em forma de código.
 */

const SECOES = [
    { id: 'agentes', rotulo: 'Agentes e infusões' },
    { id: 'hemodinamica', rotulo: 'Hemodinâmica' },
    { id: 'monitorizacao', rotulo: 'Monitorização' },
    { id: 'balanco', rotulo: 'Balanço hídrico' }
];

const TIPOS = [
    { id: 'infusao', rotulo: 'Infusão contínua (o valor vale até mudar)' },
    { id: 'medida', rotulo: 'Medida pontual (vale só no instante)' },
    { id: 'fluido', rotulo: 'Volume (soma no balanço)' },
    { id: 'lista', rotulo: 'Lista de opções (ex.: ritmo do ECG)' }
];

const PARAMETRO_VAZIO = {
    id: null, codigo: '', rotulo: '', secao: 'monitorizacao', tipo: 'medida',
    unidade: '', valor_padrao: '', sinal: null, faixa_min: null, faixa_max: null,
    opcoes: [], apresentacao: '', diluicao_padrao: null, diluicao_unidade: '', ordem: 100, ativo: true
};

const FARMACO_VAZIO = {
    id: null, codigo: '', nome: '', rotulo_curto: '', classe: 'Outros',
    ordem_classe: 99, unidade: 'mg', via_padrao: 'IV', ordem: 100, ativo: true
};

const entrada = 'w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500';
const rotulo = 'block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1';

export default function CatalogosFaManager() {
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Acesso Total (Admin)') || hasPermission('Acessar Configurações');

    const [aba, setAba] = useState('parametros');
    const [parametros, setParametros] = useState([]);
    const [farmacos, setFarmacos] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [busca, setBusca] = useState('');
    const [emEdicao, setEmEdicao] = useState(null);
    const [salvando, setSalvando] = useState(false);

    const recarregar = async () => {
        const [p, f] = await Promise.all([listarParametros(), listarFarmacos()]);
        setParametros(p.parametros);
        setFarmacos(f.farmacos);
        setCarregando(false);
    };

    useEffect(() => {
        let ativo = true;
        Promise.all([listarParametros(), listarFarmacos()]).then(([p, f]) => {
            if (!ativo) return;
            setParametros(p.parametros);
            setFarmacos(f.farmacos);
            setCarregando(false);
        });
        return () => { ativo = false; };
    }, []);

    const filtrar = (lista, campos) => {
        const termo = normalizar(busca);
        if (!termo) return lista;
        return lista.filter(item => normalizar(campos.map(c => item[c]).join(' ')).includes(termo));
    };

    const handleSalvar = async () => {
        const ehParametro = aba === 'parametros';
        const item = emEdicao;

        if (ehParametro) {
            if (!item.rotulo?.trim()) return toast.error('Informe o nome da linha.');
            if (item.tipo === 'lista' && !(item.opcoes || []).length) return toast.error('Informe as opções da lista.');
            if (item.tipo === 'fluido' && !item.sinal) return toast.error('Volume precisa ser entrada ou saída.');
        } else if (!item.nome?.trim()) {
            return toast.error('Informe o nome do fármaco.');
        }

        setSalvando(true);
        const { error } = ehParametro ? await salvarParametro(item) : await salvarFarmaco(item);
        setSalvando(false);
        if (error) return toast.error('Erro ao salvar: ' + error.message);

        await logAction('CATÁLOGOS DA FICHA ANESTÉSICA', `${ehParametro ? 'Parâmetro' : 'Fármaco'} "${item.rotulo || item.nome}" ${item.id ? 'atualizado' : 'criado'}.`);
        toast.success('Salvo!');
        setEmEdicao(null);
        recarregar();
    };

    const handleExcluir = async (item) => {
        const ehParametro = aba === 'parametros';
        const nome = item.rotulo || item.nome;
        if (!window.confirm(`Excluir "${nome}"? Fichas já registradas mantêm o que foi lançado.`)) return;

        const { error } = ehParametro ? await excluirParametro(item.id) : await excluirFarmaco(item.id);
        if (error) return toast.error('Erro ao excluir: ' + error.message);
        await logAction('CATÁLOGOS DA FICHA ANESTÉSICA', `${ehParametro ? 'Parâmetro' : 'Fármaco'} "${nome}" excluído.`);
        toast.success('Excluído.');
        recarregar();
    };

    const alternarAtivo = async (item) => {
        const ehParametro = aba === 'parametros';
        const { error } = ehParametro
            ? await salvarParametro({ ...item, ativo: !item.ativo })
            : await salvarFarmaco({ ...item, ativo: !item.ativo });
        if (error) return toast.error('Erro: ' + error.message);
        recarregar();
    };

    if (carregando) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

    const lista = aba === 'parametros'
        ? filtrar(parametros, ['rotulo', 'codigo', 'unidade', 'secao'])
        : filtrar(farmacos, ['nome', 'classe', 'unidade']);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-800">Catálogos da Ficha Anestésica</h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {parametros.length} linhas da grade · {farmacos.length} fármacos
                    </p>
                </div>
                {podeEditar && (
                    <button
                        onClick={() => setEmEdicao(aba === 'parametros' ? { ...PARAMETRO_VAZIO } : { ...FARMACO_VAZIO })}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm"
                    >
                        <Plus size={15} /> {aba === 'parametros' ? 'Nova linha' : 'Novo fármaco'}
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-3">
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                    {[
                        { id: 'parametros', label: 'Linhas da grade', icon: Rows3 },
                        { id: 'farmacos', label: 'Fármacos', icon: Syringe }
                    ].map(opcao => (
                        <button
                            key={opcao.id}
                            onClick={() => { setAba(opcao.id); setBusca(''); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-md transition-colors ${aba === opcao.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            <opcao.icon size={13} /> {opcao.label}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." className={`${entrada} pl-9`} />
                </div>
            </div>

            <div className="space-y-1.5">
                {lista.length === 0 && <p className="py-8 text-center text-xs font-bold text-slate-400">Nada encontrado.</p>}

                {lista.map(item => (
                    <div key={item.id} className={`p-3 rounded-xl border bg-white flex flex-wrap items-center gap-3 ${item.ativo ? 'border-slate-200' : 'border-slate-200 opacity-55'}`}>
                        <div className="flex-1 min-w-[220px]">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-slate-800">{item.rotulo || item.rotulo_curto || item.nome}</span>
                                {item.unidade && <span className="text-[10px] font-black text-slate-400 uppercase">{item.unidade}</span>}
                                {aba === 'parametros' && (
                                    <>
                                        <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-slate-100 text-slate-600">
                                            {SECOES.find(s => s.id === item.secao)?.rotulo || item.secao}
                                        </span>
                                        <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-indigo-100 text-indigo-700">
                                            {TIPOS.find(t => t.id === item.tipo)?.id || item.tipo}
                                        </span>
                                        {item.sinal && (
                                            <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded ${item.sinal === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                {item.sinal}
                                            </span>
                                        )}
                                    </>
                                )}
                                {aba === 'farmacos' && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-slate-100 text-slate-600">{item.classe}</span>
                                )}
                            </div>
                            {aba === 'parametros' && (item.faixa_min != null || item.faixa_max != null) && (
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                    Faixa esperada: {item.faixa_min ?? '—'} a {item.faixa_max ?? '—'} {item.unidade}
                                </p>
                            )}
                            {aba === 'farmacos' && item.nome !== item.rotulo_curto && (
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{item.nome}</p>
                            )}
                        </div>

                        {podeEditar && (
                            <div className="flex items-center gap-1">
                                <button onClick={() => alternarAtivo(item)} className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md ${item.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                    {item.ativo ? 'Ativo' : 'Inativo'}
                                </button>
                                <button onClick={() => setEmEdicao({ ...item, opcoes: [...(item.opcoes || [])] })} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"><Pencil size={15} /></button>
                                <button onClick={() => handleExcluir(item)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 size={15} /></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {emEdicao && (
                <Editor
                    item={emEdicao}
                    setItem={setEmEdicao}
                    ehParametro={aba === 'parametros'}
                    onSalvar={handleSalvar}
                    onFechar={() => setEmEdicao(null)}
                    salvando={salvando}
                    classes={[...new Set(farmacos.map(f => f.classe))].sort()}
                />
            )}
        </div>
    );
}

function Editor({ item, setItem, ehParametro, onSalvar, onFechar, salvando, classes }) {
    const alterar = (campo, valor) => setItem(atual => ({ ...atual, [campo]: valor }));

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="text-sm font-black text-slate-800">
                        {item.id ? 'Editar' : 'Novo'} {ehParametro ? 'parâmetro da grade' : 'fármaco'}
                    </h3>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-4">
                    {ehParametro ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                <div className="md:col-span-6">
                                    <label className={rotulo}>Nome na grade *</label>
                                    <input value={item.rotulo} onChange={e => alterar('rotulo', e.target.value)} placeholder="Ex.: Sevoflurano" className={entrada} />
                                </div>
                                <div className="md:col-span-3">
                                    <label className={rotulo}>Unidade</label>
                                    <input value={item.unidade || ''} onChange={e => alterar('unidade', e.target.value)} placeholder="%, ml, bpm..." className={entrada} />
                                </div>
                                <div className="md:col-span-3">
                                    <label className={rotulo}>Ordem</label>
                                    <input type="number" value={item.ordem} onChange={e => alterar('ordem', e.target.value)} className={entrada} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className={rotulo}>Seção</label>
                                    <select value={item.secao} onChange={e => alterar('secao', e.target.value)} className={entrada}>
                                        {SECOES.map(s => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={rotulo}>Comportamento</label>
                                    <select value={item.tipo} onChange={e => alterar('tipo', e.target.value)} className={entrada}>
                                        {TIPOS.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                                    </select>
                                </div>
                            </div>

                            {item.tipo === 'fluido' && (
                                <div>
                                    <label className={rotulo}>No balanço, este volume é *</label>
                                    <div className="flex gap-2">
                                        {['entrada', 'saida'].map(opcao => (
                                            <button
                                                key={opcao}
                                                onClick={() => alterar('sinal', opcao)}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg border ${item.sinal === opcao ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}
                                            >
                                                {opcao === 'entrada' ? 'Entrada (soma)' : 'Saída (subtrai)'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {item.tipo === 'lista' && (
                                <div>
                                    <label className={rotulo}>Opções * (uma por linha)</label>
                                    <textarea
                                        value={(item.opcoes || []).join('\n')}
                                        onChange={e => alterar('opcoes', e.target.value.split('\n').map(o => o.trim()).filter(Boolean))}
                                        rows={5}
                                        placeholder={'Sinusal\nFibrilação atrial\nBradicardia sinusal'}
                                        className={entrada}
                                    />
                                </div>
                            )}

                            {item.tipo !== 'lista' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className={rotulo}>Valor sugerido</label>
                                        <input value={item.valor_padrao || ''} onChange={e => alterar('valor_padrao', e.target.value)} className={entrada} />
                                    </div>
                                    <div>
                                        <label className={rotulo}>Mínimo plausível</label>
                                        <input type="number" value={item.faixa_min ?? ''} onChange={e => alterar('faixa_min', e.target.value === '' ? null : Number(e.target.value))} className={entrada} />
                                    </div>
                                    <div>
                                        <label className={rotulo}>Máximo plausível</label>
                                        <input type="number" value={item.faixa_max ?? ''} onChange={e => alterar('faixa_max', e.target.value === '' ? null : Number(e.target.value))} className={entrada} />
                                    </div>
                                </div>
                            )}

                            {item.tipo === 'infusao' && (
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="md:col-span-3">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Consumo e diluição</p>
                                        <p className="text-[10px] font-semibold text-slate-400">Usado ao encerrar a ficha, para registrar frascos abertos.</p>
                                    </div>
                                    <div>
                                        <label className={rotulo}>Apresentação</label>
                                        <input value={item.apresentacao || ''} onChange={e => alterar('apresentacao', e.target.value)} placeholder="Frasco 20 ml (200 mg)" className={entrada} />
                                    </div>
                                    <div>
                                        <label className={rotulo}>Diluição habitual</label>
                                        <input type="number" value={item.diluicao_padrao ?? ''} onChange={e => alterar('diluicao_padrao', e.target.value === '' ? null : Number(e.target.value))} className={entrada} />
                                    </div>
                                    <div>
                                        <label className={rotulo}>Unidade da diluição</label>
                                        <input value={item.diluicao_unidade || ''} onChange={e => alterar('diluicao_unidade', e.target.value)} placeholder="mg/ml" className={entrada} />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div>
                                <label className={rotulo}>Nome completo * (com apresentação)</label>
                                <input value={item.nome} onChange={e => alterar('nome', e.target.value)} placeholder="Fentanil 50 mcg/ml (2 ml)" className={entrada} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className={rotulo}>Nome curto (na lista)</label>
                                    <input value={item.rotulo_curto || ''} onChange={e => alterar('rotulo_curto', e.target.value)} className={entrada} />
                                </div>
                                <div>
                                    <label className={rotulo}>Classe</label>
                                    <input list="fa-classes" value={item.classe} onChange={e => alterar('classe', e.target.value)} className={entrada} />
                                    <datalist id="fa-classes">
                                        {classes.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                    <label className={rotulo}>Unidade</label>
                                    <input value={item.unidade} onChange={e => alterar('unidade', e.target.value)} placeholder="mg, mcg, ml" className={entrada} />
                                </div>
                                <div>
                                    <label className={rotulo}>Via padrão</label>
                                    <input value={item.via_padrao} onChange={e => alterar('via_padrao', e.target.value)} className={entrada} />
                                </div>
                                <div>
                                    <label className={rotulo}>Ordem da classe</label>
                                    <input type="number" value={item.ordem_classe} onChange={e => alterar('ordem_classe', e.target.value)} className={entrada} />
                                </div>
                                <div>
                                    <label className={rotulo}>Ordem</label>
                                    <input type="number" value={item.ordem} onChange={e => alterar('ordem', e.target.value)} className={entrada} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                    <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={onSalvar} disabled={salvando} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg shadow-sm">
                        {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
