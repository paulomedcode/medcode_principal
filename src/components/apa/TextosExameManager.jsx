import React, { useState, useEffect } from 'react';
import { Loader2, Save, RotateCcw, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { carregarTextosExame, salvarTextosExame } from '../../services/apaExamePadrao';
import { CAMPOS_EXAME_PADRAO, TEXTOS_EXAME_FABRICA } from '../../config/apaExamePadrao';
import { logAction } from '../../utils/logger';
import { usePermission } from '../../contexts/PermissionContext';

/**
 * Cadastro dos laudos padrão exibidos quando o médico marca "Exame normal"
 * na APA. Sem esta tela o texto ficaria preso no código — que é o defeito do
 * protótipo que originou o recurso.
 */
export default function TextosExameManager() {
    const { hasPermission } = usePermission();
    const podeEditar = hasPermission('Acesso Total (Admin)') || hasPermission('Acessar Configurações');

    const [textos, setTextos] = useState(TEXTOS_EXAME_FABRICA);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        let ativo = true;
        carregarTextosExame().then(dados => {
            if (!ativo) return;
            setTextos(dados);
            setCarregando(false);
        });
        return () => { ativo = false; };
    }, []);

    const handleSalvar = async () => {
        const vazio = CAMPOS_EXAME_PADRAO.find(({ campo }) => !String(textos[campo] || '').trim());
        if (vazio) return toast.error(`O laudo padrão de ${vazio.rotulo} não pode ficar vazio.`);

        setSalvando(true);
        const { error } = await salvarTextosExame(textos);
        setSalvando(false);

        if (error) return toast.error('Erro ao salvar: ' + error.message);
        await logAction('TEXTOS DO EXAME FÍSICO (APA)', 'Laudos padrão de exame normal atualizados.');
        toast.success('Textos salvos!');
    };

    if (carregando) {
        return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-black text-slate-800">Textos do exame físico normal</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                    O que aparece na APA quando o médico marca &quot;Exame normal&quot;.
                </p>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p className="text-xs font-semibold leading-relaxed">
                    Alterar um texto vale para as próximas avaliações. APAs já salvas mantêm o laudo
                    exatamente como foi registrado na época — o que está impresso não muda depois.
                </p>
            </div>

            <div className="space-y-4">
                {CAMPOS_EXAME_PADRAO.map(({ campo, rotulo, padrao }) => {
                    const alterado = String(textos[campo] || '').trim() !== padrao;
                    return (
                        <div key={campo} className="p-4 rounded-xl bg-white border border-slate-200">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">{rotulo}</label>
                                {alterado && podeEditar && (
                                    <button
                                        onClick={() => setTextos(atual => ({ ...atual, [campo]: padrao }))}
                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md"
                                    >
                                        <RotateCcw size={11} /> Restaurar padrão
                                    </button>
                                )}
                            </div>
                            <textarea
                                disabled={!podeEditar}
                                value={textos[campo] || ''}
                                onChange={e => setTextos(atual => ({ ...atual, [campo]: e.target.value }))}
                                rows={3}
                                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                    );
                })}
            </div>

            {podeEditar && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSalvar}
                        disabled={salvando}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
                    >
                        {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        Salvar textos
                    </button>
                </div>
            )}
        </div>
    );
}
