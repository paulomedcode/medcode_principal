import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Building2, CalendarRange, Activity, DollarSign, CalendarClock, LayoutDashboard, Settings as SettingsIcon, ClipboardList, Wallet } from 'lucide-react';
import HomeLayout from '../components/home/HomeLayout';
import { ehTelaMedico } from '../config/homeLayout';
import { usePermission } from '../contexts/PermissionContext';
import { HOME_BLOCK_PERMISSION } from '../config/permissions';

const HomeHub = () => {
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const navigate = useNavigate();

    // Na tela administrativa os módulos são o conteúdo principal: eles esticam
    // para ocupar a altura livre em vez de ficarem espremidos no topo.
    const telaMedico = ehTelaMedico(currentUser);

    const [agendaRefreshTrigger] = useState(0);

    let titulo = '';
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

    if (currentUser?.role === 'Médico') {
        if (sexo === 'M' || sexo === 'MASCULINO') titulo = 'Dr. ';
        else if (sexo === 'F' || sexo === 'FEMININO') titulo = 'Dra. ';
    }

    const saudacao = `Olá, ${titulo}${primeiroNome}`;

    const modules = [
        {
            id: 'atendimento',
            title: 'Atendimento',
            desc: 'Pacientes e Agenda',
            icon: Building2,
            path: '/atendimento',
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50'
        },
        {
            id: 'mapa',
            title: 'Mapa Cirúrgico',
            desc: 'Mapa das Unidades',
            icon: CalendarRange,
            path: '/semana',
            iconColor: 'text-blue-600',
            iconBg: 'bg-blue-50'
        },
        {
            id: 'pep',
            title: 'PEP',
            desc: 'Prontuário e Atendimento',
            icon: Activity,
            path: '/pep-hub',
            iconColor: 'text-indigo-600',
            iconBg: 'bg-indigo-50'
        },
        {
            id: 'financeiro',
            title: 'Financeiro',
            desc: 'Repasses e relatórios',
            icon: DollarSign,
            path: '/finance/dashboard',
            iconColor: 'text-violet-600',
            iconBg: 'bg-violet-50'
        },
        {
            id: 'escala',
            title: 'Escala Médica',
            desc: 'Escala de plantões',
            icon: CalendarClock,
            path: '/escala',
            iconColor: 'text-amber-600',
            iconBg: 'bg-amber-50'
        },
        {
            id: 'meusRepasses',
            title: 'Meus Repasses',
            desc: 'Folhas e pagamentos',
            icon: Wallet,
            path: '/meus-repasses',
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50'
        },
        {
            id: 'relatorios',
            title: 'Relatórios',
            desc: 'Relatórios diversos',
            icon: LayoutDashboard,
            path: '/dashboard',
            iconColor: 'text-rose-600',
            iconBg: 'bg-rose-50'
        },
        {
            id: 'configuracoes',
            title: 'Configurações',
            desc: 'Ajustes diversos',
            icon: SettingsIcon,
            path: '/configuracoes',
            iconColor: 'text-slate-600',
            iconBg: 'bg-slate-100'
        },
        {
            id: 'compromissos',
            title: 'Compromissos',
            desc: 'Agendar tarefas',
            icon: ClipboardList,
            path: '/compromissos',
            iconColor: 'text-fuchsia-600',
            iconBg: 'bg-fuchsia-50'
        }
    ].filter(mod => hasPermission(HOME_BLOCK_PERMISSION[mod.id]));
    // Um bloco = um módulo do catálogo de permissões, e a tela inicial mostra
    // só o que a pessoa abre. Até set/2026 o módulo bloqueado ficava na grade
    // com cadeado, para ela ver que existia e saber o que pedir; na prática
    // virou uma parede de cadeados na home de quem só plantona — decisão do
    // Paulo: quem não tem acesso não vê. A rota continua protegida por
    // PermissionRoute, para quem digitar o endereço na mão.

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
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-5 ${telaMedico ? 'shrink-0' : 'shrink-0 md:flex-1 md:min-h-0 md:auto-rows-fr md:content-stretch'}`}>
            {modules.map((mod) => {
                let darkIconColor = 'text-slate-800';
                let darkIconBg = 'bg-white/70';
                if (mod.id === 'atendimento') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-md shadow-emerald-500/30'; }
                if (mod.id === 'mapa') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-blue-400 to-indigo-500 shadow-md shadow-blue-500/30'; }
                if (mod.id === 'pep') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-indigo-400 to-purple-500 shadow-md shadow-indigo-500/30'; }
                if (mod.id === 'financeiro') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-violet-400 to-fuchsia-500 shadow-md shadow-violet-500/30'; }
                if (mod.id === 'escala') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/30'; }
                if (mod.id === 'meusRepasses') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-emerald-400 to-green-500 shadow-md shadow-emerald-500/30'; }
                if (mod.id === 'relatorios') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-rose-400 to-pink-500 shadow-md shadow-rose-500/30'; }
                if (mod.id === 'configuracoes') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-slate-400 to-slate-500 shadow-md shadow-slate-500/30'; }
                if (mod.id === 'compromissos') { darkIconColor = 'text-white'; darkIconBg = 'bg-gradient-to-br from-fuchsia-400 to-pink-500 shadow-md shadow-fuchsia-500/30'; }

                return (
                    <div
                        key={mod.id}
                        onClick={() => { if (mod.path) navigate(mod.path); }}
                        className="group relative overflow-hidden rounded-[1.5rem] lg:rounded-[2rem] flex flex-col items-center justify-center text-center transition-all duration-500 cursor-pointer w-full p-4 lg:p-6 min-h-[110px] sm:min-h-[130px] lg:min-h-[140px] shrink-0 bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:bg-white/50 hover:-translate-y-1 hover:shadow-[0_15px_30px_rgba(0,0,0,0.15)]"
                    >
                        <div className={`w-12 h-12 lg:w-14 lg:h-14 mb-2 lg:mb-3 rounded-[1rem] flex items-center justify-center shrink-0 ${darkIconBg} transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-[0_0_15px_rgba(0,0,0,0.2)]`}>
                            <mod.icon size={20} className={`lg:w-6 lg:h-6 ${darkIconColor}`} strokeWidth={2} />
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
