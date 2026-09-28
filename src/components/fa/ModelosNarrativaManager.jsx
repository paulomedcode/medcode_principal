import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Pencil, Trash2, X, FileText, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { listarNarrativas, salvarNarrativa, excluirNarrativa } from '../../services/faCatalogos';
import { PROCEDIMENTOS } from '../../utils/fichaAnestesica/vocabulario';
import { preencherModelo } from '../../utils/fichaAnestesica/narrativa';
import { logAction } from '../../utils/logger';
import { usePermission } from '../../contexts/PermissionContext';

/**
 * Cadastro dos textos que descrevem o ato anestésico.
 *
 * No protótipo de referência estes parágrafos estavam no código — mudar o
 * calibre da agulha exigia deploy. Aqui são editáveis, com {{campos}} trocados
 * pelo que o médico informou na ficha.
 */

const MODELO_VAZIO = {
    id: null, codigo: '', titulo: '', origem: 'tecnica', chave: null,
    termos: [], texto: '', ordem: 100, ativo: true
};

const entrada = 'w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500';
const rotulo = 'block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1';

export default function ModelosNarrativaManager() {
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Acesso Total (Admin)') || hasPermission('Acessar Configurações');

    const [modelos, setModelos] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erroTabela, setErroTabela] = useState(false);
    const [emEdicao, setEmEdicao] = useState(null);
    const [salvando, setSalvando] = useState(false);

    const carregar = async () => {
        const { narrativas, erro } = await listarNarrativas();
        setModelos(narrativas);
        setErroTabela(!!erro);
        setCarregando(false);
    };

    useEffect(() => {
        let ativo = true;
        listarNarrativas().then(({ narrativas, erro }) => {
            if (!ativo) return;
            setModelos(narrativas);
            setErroTabela(!!erro);
            setCarregando(false);
        });
        return () => { ativo = false; };
    }, []);

    const handleSalvar = async () => {
        if (!emEdicao.titulo.trim()) return toast.error('Informe o título.');
        if (!emEdicao.texto.trim()) return toast.error('Informe o texto da descrição.');
        if (emEdicao.origem === 'tecnica' && !emEdicao.termos.length) return toast.error('Informe ao menos um termo da técnica.');
        if (emEdicao.origem === 'procedimento' && !emEdicao.chave) return toast.error('Escolha o procedimento que dispara este texto.');

        setSalvando(true);
        const { error } = await salvarNarrativa(emEdicao);
        setSalvando(false);
        if (error) return toast.error('Erro ao salvar: ' + error.message);

        await logAction('MODELOS DE DESCRIÇÃO (FA)', `Modelo "${emEdicao.titulo}" ${emEdicao.id ? 'atualizado' : 'criado'}.`);
        toast.success('Modelo salvo!');
        setEmEdicao(null);
        carregar();
    };

    const handleExcluir = async (modelo) => {
        if (!window.confirm(`Excluir o modelo "${modelo.titulo}"?`)) return;
        const { error } = await excluirNarrativa(modelo.id);
        if (error) return toast.error('Erro ao excluir: ' + error.message);
        await logAction('MODELOS DE DESCRIÇÃO (FA)', `Modelo "${modelo.titulo}" excluído.`);
        toast.success('Modelo excluído.');
        carregar();
    };

    if (carregando) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

    if (erroTabela) {
        return (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                A tabela de modelos ainda não existe neste banco. Aplique a migration
                <code className="mx-1 px-1 bg-white/70 rounded">20260812120000_fa_narrativas.sql</code>
                para habilitar as descrições automáticas.
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-800">Modelos de descrição (Ficha Anestésica)</h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {modelos.length} modelos · {modelos.filter(m => m.origem === 'tecnica').length} por técnica ·{' '}
                        {modelos.filter(m => m.origem === 'procedimento').length} por procedimento
                    </p>
                </div>
                {podeEditar && (
                    <button onClick={() => setEmEdicao({ ...MODELO_VAZIO })} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm">
                        <Plus size={15} /> Novo modelo
                    </button>
                )}
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p className="text-xs font-semibold leading-relaxed">
                    Escreva o texto usando <code className="px-1 bg-white/70 rounded">{'{{campo}}'}</code> onde entram os dados da ficha —
                    por exemplo <code className="px-1 bg-white/70 rounded">{'{{veia}}'}</code> ou <code className="px-1 bg-white/70 rounded">{'{{lado}}'}</code>.
                    O que o médico não preencher aparece entre colchetes, pedindo complemento em vez de sumir do texto.
                </p>
            </div>

            <div className="space-y-2">
                {modelos.map(modelo => (
                    <div key={modelo.id} className={`p-3 rounded-xl border bg-white ${modelo.ativo ? 'border-slate-200' : 'border-slate-200 opacity-55'}`}>
                        <div className="flex flex-wrap items-start gap-3">
                            <div className="flex-1 min-w-[240px]">
                                <div className="flex flex-wrap items-center gap-2">
                                    <FileText size={14} className="text-slate-400 shrink-0" />
                                    <span className="text-xs font-black text-slate-800">{modelo.titulo}</span>
                                    <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded ${modelo.origem === 'tecnica' ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'}`}>
                                        {modelo.origem === 'tecnica' ? 'Técnica' : 'Procedimento'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{modelo.texto}</p>
                                {modelo.origem === 'tecnica' && (
                                    <p className="text-[10px] font-bold text-slate-400 mt-1">Dispara com: {(modelo.termos || []).join(' · ')}</p>
                                )}
                            </div>
                            {podeEditar && (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => salvarNarrativa({ ...modelo, ativo: !modelo.ativo }).then(carregar)} className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md ${modelo.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                        {modelo.ativo ? 'Ativo' : 'Inativo'}
                                    </button>
                                    <button onClick={() => setEmEdicao({ ...modelo, termos: [...(modelo.termos || [])] })} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"><Pencil size={15} /></button>
                                    <button onClick={() => handleExcluir(modelo)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 size={15} /></button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {emEdicao && (
                <EditorModelo
                    modelo={emEdicao}
                    setModelo={setEmEdicao}
                    onSalvar={handleSalvar}
                    onFechar={() => setEmEdicao(null)}
                    salvando={salvando}
                />
            )}
        </div>
    );
}

function EditorModelo({ modelo, setModelo, onSalvar, onFechar, salvando }) {
    const alterar = (campo, valor) => setModelo(atual => ({ ...atual, [campo]: valor }));
    const procedimento = PROCEDIMENTOS.find(p => p.chave === modelo.chave);

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="text-sm font-black text-slate-800">{modelo.id ? 'Editar modelo' : 'Novo modelo'}</h3>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                            <label className={rotulo}>Título *</label>
                            <input value={modelo.titulo} onChange={e => alterar('titulo', e.target.value)} placeholder="Ex.: Raquianestesia" className={entrada} />
                        </div>
                        <div>
                            <label className={rotulo}>Ordem</label>
                            <input type="number" value={modelo.ordem} onChange={e => alterar('ordem', e.target.value)} className={entrada} />
                        </div>
                    </div>

                    <div>
                        <label className={rotulo}>Quando usar este texto</label>
                        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                            {[
                                { id: 'tecnica', texto: 'Pela técnica anestésica' },
                                { id: 'procedimento', texto: 'Por procedimento realizado' }
                            ].map(opcao => (
                                <button
                                    key={opcao.id}
                                    onClick={() => alterar('origem', opcao.id)}
                                    className={`px-3 py-1.5 text-[11px] font-bold rounded-md ${modelo.origem === opcao.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                                >
                                    {opcao.texto}
                                </button>
                            ))}
                        </div>
                    </div>

                    {modelo.origem === 'tecnica' ? (
                        <div>
                            <label className={rotulo}>Termos da técnica * (separados por vírgula)</label>
                            <input
                                value={(modelo.termos || []).join(', ')}
                                onChange={e => alterar('termos', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                                placeholder="raqui, raquianestesia, espinhal"
                                className={entrada}
                            />
                            <p className="text-[10px] text-slate-400 font-semibold mt-1">
                                O texto entra quando um destes termos aparece na técnica planejada da ficha.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label className={rotulo}>Procedimento *</label>
                            <select value={modelo.chave || ''} onChange={e => alterar('chave', e.target.value)} className={entrada}>
                                <option value="">Selecione...</option>
                                {PROCEDIMENTOS.map(p => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
                            </select>
                            {procedimento?.campos?.length > 0 && (
                                <p className="text-[10px] text-slate-500 font-semibold mt-1">
                                    Campos disponíveis: {procedimento.campos.map(c => `{{${c.nome}}}`).join('  ')}
                                </p>
                            )}
                        </div>
                    )}

                    <div>
                        <label className={rotulo}>Texto da descrição *</label>
                        <textarea value={modelo.texto} onChange={e => alterar('texto', e.target.value)} rows={7} className={entrada} />
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Prévia com dados de exemplo</p>
                        <p className="text-[11px] text-slate-700 leading-relaxed">
                            {preencherModelo(modelo.texto, {
                                veia: 'jugular interna', lado: 'direito', tecnica: 'ultrassonografia', profundidade: '14',
                                arteria: 'radial direita', cateter: '20', realizacao: 'em sala operatória',
                                abocath: '20', local: 'MSD', bloqueio: 'TAP'
                            }) || '—'}
                        </p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                    <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={onSalvar} disabled={salvando} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg shadow-sm">
                        {salvando && <Loader2 size={14} className="animate-spin" />}
                        Salvar modelo
                    </button>
                </div>
            </div>
        </div>
    );
}
