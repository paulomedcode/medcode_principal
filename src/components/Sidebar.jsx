import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../contexts/PermissionContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import {
    LayoutDashboard,
    ClipboardList,
    HeartPulse,
    PlusCircle,
    Users,
    Settings,
    LogOut,
    Activity,
    CalendarDays,
    CalendarRange,
    FileText,
    Stethoscope,
    CalendarClock,
    Bed,
    FileSignature,
    ShieldCheck,
    CheckSquare,
    Building2,
    User,
    Lock,
    X,
    Save,
    Syringe,
    Moon,
    DollarSign,
    ArrowRightLeft,
    Wallet
} from 'lucide-react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { UnitSelector } from './UnitSelector';

const Sidebar = () => {
    const { currentUser, logout } = useAuth();
    const { hasPermission } = usePermission();
    const { theme } = useWhiteLabel();
    const location = useLocation();
    const navigate = useNavigate();

    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loadingPassword, setLoadingPassword] = useState(false);

    const [menusAbertos, setMenusAbertos] = useState({});

    const isActive = (path) => location.pathname === path;

    const toggleMenu = (id) => {
        setMenusAbertos(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error("Erro ao sair", error);
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) return toast.error("As senhas não coincidem!");
        if (newPassword.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");

        setLoadingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            toast.success("Senha atualizada com sucesso!");
            setNewPassword('');
            setConfirmPassword('');
            setIsProfileOpen(false);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao atualizar senha. Talvez seja necessário relogar antes.");
        } finally {
            setLoadingPassword(false);
        }
    };

    // O menu segue exatamente as mesmas permissões das rotas e dos blocos da
    // tela inicial (src/config/permissions.js). A camada `modules_access` saiu:
    // estava vazia em todos os cadastros e só mascarava a falta de permissão.

    const menuItems = [
        { id: 'dashboard', path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: hasPermission('Acessar Relatórios') },
        {
            id: 'recepcao', icon: Building2, label: 'Recepção', show: hasPermission('Acessar Atendimento'),
            subItems: [
                { path: '/recepcao', icon: Activity, label: 'Painel', show: hasPermission('Acessar Recepção') },
                { path: '/pacientes', icon: Users, label: 'Pacientes', show: hasPermission('Visualizar Pacientes') },
                { path: '#', icon: CalendarDays, label: 'Agenda', show: true, isSoon: true },
                { path: '#', icon: Bed, label: 'Internação', show: true, isSoon: true }
            ]
        },
        {
            id: 'cirurgias', icon: Syringe, label: 'Cirurgias', show: hasPermission('Acessar Mapa Cirúrgico') && (hasPermission('Visualizar Fila') || hasPermission('Visualizar Mapa/Agenda')),
            subItems: [
                { path: '/fila', icon: ClipboardList, label: 'Fila', show: hasPermission('Visualizar Fila') },
                { path: '/semana', icon: CalendarRange, label: 'Mapa', show: hasPermission('Visualizar Mapa/Agenda') }
            ]
        },
        {
            id: 'clinico', icon: Stethoscope, label: 'Clínico', show: hasPermission('Visualizar Atendimentos'),
            subItems: [
                { path: '#', icon: FileSignature, label: 'PEP', show: true, isSoon: true },
                { path: '/apa', icon: Activity, label: 'APA', show: hasPermission('Visualizar Atendimentos') },
                { path: '/ficha-anestesica', icon: HeartPulse, label: 'Ficha Anestésica', show: hasPermission('Visualizar Atendimentos') },
                { path: '/aih', icon: FileText, label: 'AIH', show: hasPermission('Visualizar Atendimentos') }
            ]
        },
        {
            id: 'regulacao', icon: ShieldCheck, label: 'Regulação', show: hasPermission('Acessar Autorizações'),
            subItems: [
                { path: '/autorizacoes', icon: CheckSquare, label: 'Autorizações', show: hasPermission('Acessar Autorizações') }
            ]
        },
        {
            id: 'financeiro', icon: DollarSign, label: 'Financeiro', show: hasPermission('Acessar Financeiro'),
            subItems: [
                { path: '/finance/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: hasPermission('Acessar Financeiro') },
                { path: '/finance/transacoes', icon: Activity, label: 'Extratos', show: hasPermission('Acessar Financeiro') },
                { path: '/finance/conciliacao', icon: ArrowRightLeft, label: 'Conciliar', show: hasPermission('Acessar Financeiro') },
                { path: '/finance/glosas', icon: ShieldCheck, label: 'Glosas', show: hasPermission('Acessar Financeiro') },
                { path: '/finance/configuracoes', icon: Settings, label: 'Ajustes', show: hasPermission('Editar Financeiro') }
            ]
        },
        {
            id: 'escala', path: '/escala', icon: CalendarClock, label: 'Escala', show: hasPermission('Acessar Escala')
        },
        {
            id: 'meusRepasses', path: '/meus-repasses', icon: Wallet, label: 'Repasses', show: hasPermission('Acessar Meus Repasses')
        },
        {
            id: 'compromissos', path: '/compromissos', icon: ClipboardList, label: 'Compromissos', show: hasPermission('Acessar Compromissos')
        },
        {
            id: 'admin', icon: Settings, label: 'Administração', show: hasPermission('Acessar Configurações') || hasPermission('Acessar Usuarios'),
            subItems: [
                { path: '/configuracoes', icon: Settings, label: 'Ajustes', show: hasPermission('Acessar Configurações') },
                { path: '/usuarios', icon: Users, label: 'Usuários', show: hasPermission('Acessar Usuarios') }
            ]
        }
    ].filter(item => item.show);

    return (
        <>
            <aside className="fixed left-0 top-0 h-screen w-24 bg-white/40 backdrop-blur-xl border-r border-white/400 shadow-lg flex flex-col items-center py-5 z-50 print:hidden">

                {/* Logo Compacto Clickable */}
                <div className="flex items-center justify-center mt-2 mb-3">
                    <Link to="/home" className="cursor-pointer transition-transform hover:scale-105 active:scale-95">
                        <img src={theme.logoUrl} alt="Logo do Sistema" className="h-8 w-auto object-contain drop-shadow-sm" />
                    </Link>
                </div>

                <div className="px-4 py-3 mt-4 mb-2 border-y border-slate-100/50 w-full flex justify-center bg-white/30 backdrop-blur-sm">
                    <UnitSelector />
                </div>

                {/* Menu Apenas Ícones */}
                <nav className="flex-1 w-full flex flex-col items-center space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar pb-4">
                    {menuItems.map((item) => {
                        if (item.subItems) {
                            const isOpen = !!menusAbertos[item.id];
                            return (
                                <div key={item.id} className="w-full flex flex-col items-center">
                                    <button
                                        title={item.label}
                                        onClick={() => toggleMenu(item.id)}
                                        className={`group w-[72px] mx-auto py-2 flex flex-col items-center justify-center rounded-xl transition-all duration-300 ${isOpen
                                            ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
                                            : 'text-slate-500 hover:bg-white/50 hover:text-blue-600'
                                            }`}
                                    >
                                        <item.icon size={20} className="mb-1" strokeWidth={isOpen ? 2.5 : 2} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-center leading-[1]">{item.label}</span>


                                    </button>

                                    {isOpen && (
                                        <div className="flex flex-col items-center w-full mt-1 mb-2 space-y-1 relative delay-150 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {/* Linha guia conectando submenus */}
                                            <div className="absolute left-1/2 -translate-x-[26px] top-0 bottom-4 w-px bg-slate-200"></div>

                                            {item.subItems.filter(sub => sub.show).map(sub => (
                                                sub.isSoon ? (
                                                    <div
                                                        key={sub.label}
                                                        title={`${sub.label} (Em Breve)`}
                                                        className="z-10 group w-[64px] ml-1 py-2 flex flex-col items-center justify-center rounded-xl transition-all duration-300 bg-white/30 text-slate-500 opacity-50 cursor-not-allowed"
                                                    >
                                                        <sub.icon size={16} className="mb-1" strokeWidth={2} />
                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-center leading-[1]">{sub.label}</span>
                                                        <span className="text-[6px] text-amber-500 font-black tracking-widest uppercase mt-0.5">BREVE</span>
                                                    </div>
                                                ) : (
                                                    <Link
                                                        key={sub.path}
                                                        to={sub.path}
                                                        title={sub.label}
                                                        className={`z-10 group w-[64px] ml-1 py-2 flex flex-col items-center justify-center rounded-xl transition-all duration-300 ${isActive(sub.path)
                                                            ? 'bg-white/80 text-blue-600 font-bold shadow-sm border border-white/400'
                                                            : 'bg-white/30 text-slate-500 hover:bg-white/60 hover:text-blue-600'
                                                            }`}
                                                    >
                                                        <sub.icon size={16} className="mb-1" strokeWidth={isActive(sub.path) ? 2.5 : 2} />
                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-center leading-[1]">{sub.label}</span>
                                                    </Link>
                                                )
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={item.label}
                                className={`group w-[72px] mx-auto py-2 flex flex-col items-center justify-center rounded-xl transition-all duration-300 ${isActive(item.path)
                                    ? 'bg-white/60 text-blue-600 font-bold shadow-sm border border-white/400'
                                    : 'text-slate-500 hover:bg-white/50 hover:text-blue-600'
                                    }`}
                            >
                                <item.icon size={20} className="mb-1" strokeWidth={isActive(item.path) ? 2.5 : 2} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-center leading-[1]">{item.label}</span>


                            </Link>
                        );
                    })}
                </nav>

                {/* Botões do Rodapé: Perfil e Sair */}
                <div className="mt-auto flex flex-col items-center w-full gap-2">
                    <Link
                        to="/home"
                        title="Início (Hub)"
                        className="w-[72px] mx-auto py-2.5 flex flex-col items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50/50 hover:text-blue-600 transition-all duration-300 group shadow-sm border border-transparent hover:border-slate-300"
                    >
                        <LayoutDashboard size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-center leading-[1]">Home</span>
                    </Link>
                    <button
                        title="Alternar Tema Claro/Escuro"
                        onClick={() => document.documentElement.classList.toggle('tema-escuro')}
                        className="w-[72px] mx-auto py-2.5 flex flex-col items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/50 hover:text-indigo-600 transition-all duration-300 group shadow-sm border border-transparent hover:border-slate-300 preserve-color"
                    >
                        <Moon size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-center leading-[1]">Tema</span>
                    </button>
                    <button
                        title="Meu Perfil"
                        onClick={() => setIsProfileOpen(true)}
                        className="w-[72px] mx-auto py-2.5 flex flex-col items-center justify-center rounded-xl text-slate-500 hover:bg-white/60 hover:text-blue-600 transition-all duration-300 group shadow-sm border border-transparent hover:border-white/400"
                    >
                        <User size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-center leading-[1]">Perfil</span>
                    </button>
                    <button
                        title="Sair"
                        onClick={handleLogout}
                        className="w-[72px] mx-auto py-2.5 flex flex-col items-center justify-center rounded-xl text-slate-500 hover:bg-rose-500/20 hover:text-rose-600 transition-all duration-300 group"
                    >
                        <LogOut size={20} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-center leading-[1]">Sair</span>
                    </button>
                </div>
            </aside>

            {/* Modal de Perfil */}
            {isProfileOpen && (
                <div className="fixed top-16 inset-x-0 bottom-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
                    <div className="bg-white/95 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                                    <User size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest leading-none">Meu Perfil</h2>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Gerencie sua conta</p>
                                </div>
                            </div>
                            <button onClick={() => setIsProfileOpen(false)} className="text-slate-500 hover:text-rose-500 bg-white p-2 rounded-full shadow-sm hover:shadow transition-all"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Info do Usuário */}
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Nome Completo</label>
                                    <div className="text-sm font-bold text-slate-800 uppercase">{currentUser?.name || currentUser?.displayName || '---'}</div>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">E-mail</label>
                                    <div className="text-xs font-semibold text-slate-600">{currentUser?.email}</div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Perfil</label>
                                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-[11px] font-black uppercase rounded">{currentUser?.role || '---'}</span>
                                </div>
                                {(currentUser?.crm || currentUser?.cpf) && (
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Documento</label>
                                        <div className="text-xs font-bold text-slate-700">{currentUser?.crm || currentUser?.cpf}</div>
                                    </div>
                                )}
                            </div>
                            {/* Trocar Senha */}
                            <form onSubmit={handleUpdatePassword} className="space-y-4 pt-2">
                                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                    <Lock size={12} /> Alterar Senha
                                </h3>
                                <div>
                                    <input
                                        type="password"
                                        placeholder="Nova Senha (min. 6 caracteres)"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold outline-none focus:border-blue-500 placeholder:text-slate-500 placeholder:font-normal"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="password"
                                        placeholder="Confirmar Nova Senha"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold outline-none focus:border-blue-500 placeholder:text-slate-500 placeholder:font-normal"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loadingPassword || !newPassword || !confirmPassword}
                                    className="w-full py-3 bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-900 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-slate-800/20"
                                >
                                    {loadingPassword ? 'Salvando...' : <><Save size={16} /> Atualizar Senha</>}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Sidebar;