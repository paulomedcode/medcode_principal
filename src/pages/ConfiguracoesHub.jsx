import React from 'react';
import { Link } from 'react-router-dom';
import { PAGINA, CARD, BotaoVoltar } from '../components/crm/ui';
import { usePermission } from '../contexts/PermissionContext';
import { Users, Palette, Activity, ChevronRight, Building2 } from 'lucide-react';

const ConfiguracoesHub = () => {
    const { hasPermission } = usePermission();

    const modules = [
        {
            path: '/configuracoes-painel?tab=segmentos',
            icon: Building2,
            title: 'Cadastros gerais',
            description: 'Segmentos, origens de lead e equipes',
            show: hasPermission('Acessar Configurações')
        },
        {
            path: '/usuarios',
            icon: Users,
            title: 'Usuários e permissões',
            description: 'Quem acessa o sistema e o que cada um pode fazer',
            show: hasPermission('Acesso Total (Admin)') || hasPermission('Acessar Usuarios')
        },
        {
            path: '/configuracoes-painel?tab=identidade',
            icon: Palette,
            title: 'Identidade visual',
            description: 'Logo, cores e nome que aparecem no sistema',
            show: hasPermission('Acesso Total (Admin)')
        },
        {
            path: '/configuracoes-painel?tab=logs',
            icon: Activity,
            title: 'Registro de atividades',
            description: 'Quem fez o quê e quando',
            show: hasPermission('Acesso Total (Admin)')
        }
    ].filter(m => m.show);

    return (
        <div className={PAGINA}>
            <div className="max-w-3xl mx-auto">
                <div className="mb-5">
                    <div className="flex items-center gap-1.5">
                        <BotaoVoltar />
                        <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight">Configurações</h1>
                    </div>
                    <p className="text-[13px] text-slate-500 mt-1 ml-8">Ajustes do sistema, usuários e parametrizações.</p>
                </div>

                <div className={`${CARD} divide-y divide-black/[.06]`}>
                    {modules.map((mod) => (
                        <Link key={mod.path} to={mod.path}
                            className="group flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl transition-colors">
                            <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 grid place-items-center shrink-0">
                                <mod.icon size={17} />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[13.5px] font-medium text-slate-900">{mod.title}</span>
                                <span className="block text-[12.5px] text-slate-500">{mod.description}</span>
                            </span>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ConfiguracoesHub;
