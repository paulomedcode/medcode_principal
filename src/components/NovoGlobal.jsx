import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronRight } from 'lucide-react';
import { useOpcoesNovo } from './novo';
import { listarEtapas, listarEmpresas } from '../services/crm';
import EmpresaModal from './crm/EmpresaModal';
import ProjetoModal from './crm/ProjetoModal';
import { OportunidadeModal } from './crm/OportunidadeModal';
import Gaveta from './ui/Gaveta';

/*
 * "Novo" de qualquer tela. Abre pelo evento "medcode:novo":
 *   - sem detalhe → gaveta com as opções (o "＋" da barra inferior do celular);
 *   - { tipo: 'prospeccao' | 'lead' | 'oportunidade' | 'projeto' | 'tarefa' | 'lancamento' } → vai direto.
 * Cada opção só aparece para quem pode criar aquilo.
 */

export default function NovoGlobal() {
    const navigate = useNavigate();
    const opcoes = useOpcoesNovo();
    const [escolhendo, setEscolhendo] = useState(false);
    const [criar, setCriar] = useState(null);
    const fechar = useCallback(() => setCriar(null), []);

    const escolher = (id) => {
        setEscolhendo(false);
        if (id === 'tarefa') return navigate('/compromissos');
        if (id === 'prospeccao') return navigate('/prospeccao?novo=1');
        if (id === 'lancamento') return navigate('/finance/transacoes?novo=1');
        setCriar(id);
    };

    useEffect(() => {
        const abrir = (e) => {
            const tipo = e.detail?.tipo;
            if (tipo) escolher(tipo);
            else setEscolhendo(true);
        };
        window.addEventListener('medcode:novo', abrir);
        return () => window.removeEventListener('medcode:novo', abrir);
    });

    return (
        <>
            <Gaveta aberta={escolhendo} onClose={() => setEscolhendo(false)} titulo="Criar">
                {opcoes.length === 0 ? (
                    <p className="py-6 text-center text-[12px] font-semibold text-slate-400">Seu acesso não permite criar registros.</p>
                ) : (
                    <div className="space-y-1.5">
                        {opcoes.map((o) => (
                            <button key={o.id} onClick={() => escolher(o.id)}
                                className="w-full flex items-center gap-3 px-3 h-14 rounded-2xl bg-slate-50 active:bg-slate-100 text-left">
                                <span className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-indigo-600"><o.icone size={18} /></span>
                                <span className="flex-1 text-[14px] font-bold text-slate-700">{o.rotulo}</span>
                                <ChevronRight size={16} className="text-slate-300" />
                            </button>
                        ))}
                    </div>
                )}
            </Gaveta>

            {criar === 'lead' && <EmpresaModal kindInicial="CLIENTE" onClose={fechar} onSaved={(row) => { setCriar(null); navigate(`/clientes/${row.id}`); }} />}
            {criar === 'projeto' && <ProjetoModal onClose={fechar} onSaved={(row) => { setCriar(null); navigate(`/projetos/${row.id}`); }} />}
            {criar === 'oportunidade' && <NovaOportunidade onClose={fechar} onSaved={() => { setCriar(null); navigate('/vendas'); }} />}
        </>
    );
}

/** A OportunidadeModal precisa das etapas e empresas — carrega aqui antes de abrir. */
function NovaOportunidade({ onClose, onSaved }) {
    const [dados, setDados] = useState(null);
    useEffect(() => {
        Promise.all([listarEtapas(), listarEmpresas()]).then(([etapas, empresas]) => setDados({ etapas, empresas }))
            .catch((e) => { console.error(e); toast.error('Não foi possível abrir.'); onClose(); });
    }, [onClose]);
    if (!dados) return null;
    return <OportunidadeModal etapas={dados.etapas} empresas={dados.empresas} onClose={onClose} onSaved={onSaved}
        onEmpresaCriada={(row) => setDados((x) => ({ ...x, empresas: [...x.empresas, row] }))} />;
}
