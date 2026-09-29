import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DollarSign, Settings as SettingsIcon, ClipboardList } from 'lucide-react';
import HomeLayout from '../components/home/HomeLayout';
import { usePermission } from '../contexts/PermissionContext';
import { HOME_BLOCK_PERMISSION } from '../config/permissions';

const HomeHub = () => {
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const navigate = useNavigate();

    const [agendaRefreshTrigger] = useState(0);

    const name = currentUser?.name || currentUser?.nome || currentUser?.displayName || 'Usuário';

    const formatName = (str) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    const primeiroNome = formatName(name.split(' ')[0]);

    const sexo = (currentUser?.sexo || '').toUpperCase();
    let bemVindoText = 'bem-vindo';

    if (sexo === 'F' || sexo === 'FEMININO') {
        bemVindoText = 'bem-vinda';
    } else if (sexo === 'M' || sexo === 'MASCULINO') {
        bemVindoText = 'bem-vindo';
    }

    const saudacao = `Olá, ${primeiroNome}`;

    // Um bloco por módulo do catálogo de permissões (HOME_BLOCK_PERMISSION).
    const modules = [
        { id: 'financeiro', title: 'Financeiro', icon: DollarSign, path: '/finance/dashboard', gradient: 'from-violet-400 to-fuchsia-500 shadow-violet-500/30' },
        { id: 'compromissos', title: 'Compromissos', icon: ClipboardList, path: '/compromissos', gradient: 'from-fuchsia-400 to-pink-500 shadow-fuchsia-500/30' },
        { id: 'configuracoes', title: 'Configurações', icon: SettingsIcon, path: '/configuracoes', gradient: 'from-slate-400 to-slate-500 shadow-slate-500/30' },
    ].filter(mod => hasPermission(HOME_BLOCK_PERMISSION[mod.id]));
    // Quem não tem acesso ao módulo não vê o bloco. A rota continua protegida
    // por PermissionRoute, para quem digitar o endereço na mão.

    const header = (
        <div className="flex flex-col text-slate-800 drop-shadow-md shrink-0">
            <h1 className="text-3xl md:text-4xl font-black tracking-normal mb-1">{saudacao}</h1>
            <p className="text-xs md:text-sm font-bold text-slate-600 uppercase tracking-widest">Seja {bemVindoText} ao sistema da MedCode</p>
        </div>
    );

    // Ninguém deveria ficar sem módulo nenhum, mas cadastro novo nasce
    // Visualizador: sem esta linha a home dele seria só a saudação, e ele não
    // teria como saber que falta liberar acesso.
    const modulesGrid = modules.length === 0 ? (
        <div className="rounded-[1.5rem] bg-white/40 backdrop-blur-2xl border border-white/50 p-6 text-center shrink-0">
            <p className="text-sm font-black text-slate-700">Seu acesso ainda não foi liberado</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">Fale com a administração para liberar os módulos do seu perfil.</p>
        </div>
    ) : (
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-5 shrink-0 md:flex-1 md:min-h-0 md:auto-rows-fr md:content-stretch`}>
            {modules.map((mod) => {
                return (
                    <div
                        key={mod.id}
                        onClick={() => { if (mod.path) navigate(mod.path); }}
                        className="group relative overflow-hidden rounded-[1.5rem] lg:rounded-[2rem] flex flex-col items-center justify-center text-center transition-all duration-500 cursor-pointer w-full p-4 lg:p-6 min-h-[110px] sm:min-h-[130px] lg:min-h-[140px] shrink-0 bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:bg-white/50 hover:-translate-y-1 hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)]"
                    >
                        <div className={`w-12 h-12 lg:w-14 lg:h-14 mb-2 lg:mb-3 rounded-[1rem] flex items-center justify-center shrink-0 bg-gradient-to-br ${mod.gradient} shadow-md transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-[0_0_15px_rgba(0,0,0,0.2)]`}>
                            <mod.icon size={20} className="lg:w-6 lg:h-6 text-white" strokeWidth={2} />
                        </div>

                        <h3 className="text-[12px] sm:text-[14px] md:text-base font-black mb-0 leading-tight tracking-wide z-10 px-1 drop-shadow-sm text-slate-800">{mod.title}</h3>
                    </div>
                );
            })}
        </div>
    );

    const widgetProps = { currentUser, refreshTrigger: agendaRefreshTrigger };

    return (
        <div className="h-full w-full flex flex-col font-sans px-4 pb-4 pt-[88px] md:px-8 md:pb-8 md:pt-[104px] relative overflow-hidden">
            <div className="relative z-10 flex-1 flex flex-col mb-4 px-2 lg:px-4 min-h-0 w-full max-w-[1500px] mx-auto overflow-y-auto custom-scrollbar">
                <HomeLayout
                    header={header}
                    modules={modulesGrid}
                    widgetProps={widgetProps}
                />
            </div>

        </div>
    );
};

export default HomeHub;
