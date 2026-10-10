import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { usePermission } from '../contexts/PermissionContext';
import {
    LayoutDashboard, Users, Settings, LogOut,
    Activity, User, FileText, TrendingUp, ShoppingCart,
    Lock, X, Save, ChevronDown, Menu,
    ArrowRightLeft, ArrowUpCircle, ArrowDownCircle, Bell, FileSignature,
    Volume2, VolumeX, CalendarClock, UserPlus, Sun, Moon, AtSign, CheckCheck,
    Home, Search, ChevronRight, UserCog
} from 'lucide-react';
import { useModulosNav } from './navegacao';
import Gaveta from './ui/Gaveta';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { formatNameStandard } from '../utils/nameFormatter';
import useNotificacoes, { somLigado, definirSom } from '../hooks/useNotificacoes';
import useTema from '../hooks/useTema';

export const Topbar = () => {
    const { currentUser, logout } = useAuth();
    const { theme } = useWhiteLabel();
    const { hasPermission } = usePermission();
    const location = useLocation();
    const navigate = useNavigate();

    const [mobileNavOpen, setMobileNavOpen] = useState(false);  // menu hambúrguer (tablet)
    const [maisAberto, setMaisAberto] = useState(false);        // "Mais" do celular
    const mobileNavRef = useRef(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loadingPassword, setLoadingPassword] = useState(false);

    // Notificações (tarefas atribuídas no Compromisso + menções + lembretes)
    const { notificacoes, pulsando, pararPulso, marcarLida, marcarTodasLidas } = useNotificacoes(currentUser);
    const [showNotifications, setShowNotifications] = useState(false);
    const [somOn, setSomOn] = useState(somLigado());
    const { escuro: temaEscuro, alternar: alternarTema } = useTema();
    const notifRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notifRef.current && !notifRef.current.contains(event.target)) setShowNotifications(false);
            if (mobileNavRef.current && !mobileNavRef.current.contains(event.target)) setMobileNavOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fecha o menu hambúrguer e o "Mais" ao trocar de página.
    useEffect(() => { setMobileNavOpen(false); setMaisAberto(false); }, [location.pathname]);

    // Clicar no aviso abre a tarefa (ou a página da menção) já aberta na tela —
    // e é ESSE gesto que tira o aviso da lista. Ver Workspace.jsx (?abrir=).
    const abrirNotificacao = (n) => {
        setShowNotifications(false);
        marcarLida(n);
        const alvo = n.rowId || n.pageId || null;
        navigate(alvo ? `/compromissos?abrir=${alvo}` : '/compromissos');
    };

    const handleLogout = async () => {
        try { await logout(); navigate('/login'); }
        catch (error) { console.error("Erro ao sair", error); }
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
            setNewPassword(''); setConfirmPassword(''); setIsProfileOpen(false);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao atualizar senha. Faça login novamente para trocar a senha se necessário.");
        } finally {
            setLoadingPassword(false);
        }
    };

    const isFinance = location.pathname.startsWith('/finance');

    // Navegação entre módulos, visível em todas as telas (antes só se trocava
    // de módulo voltando à tela inicial).
    const { modulos: modulosNav, ativo: moduloAtivo } = useModulosNav();
    const abrirBusca = () => window.dispatchEvent(new CustomEvent('medcode:busca'));

    // Menu superior do módulo Financeiro (aparece somente dentro de /finance).
    const financeMenu = [
        {
            id: 'financeiro', label: 'Financeiro',
            items: [
                { path: '/finance/dashboard', icon: LayoutDashboard, label: 'Painel' },
                { path: '/finance/contas-pagar', icon: ArrowUpCircle, label: 'Contas a pagar' },
                { path: '/finance/contas-receber', icon: ArrowDownCircle, label: 'Contas a receber' },
                { path: '/finance/transacoes', icon: Activity, label: 'Movimentações' },
                { path: '/finance/fluxo-de-caixa', icon: TrendingUp, label: 'Fluxo de caixa' },
                { path: '/finance/conciliacao', icon: ArrowRightLeft, label: 'Conciliação bancária' },
            ]
        },
        {
            id: 'relatorios', label: 'Relatórios',
            items: [
                { path: '/finance/relatorios/dre', icon: FileText, label: 'DRE' },
                { path: '/finance/relatorios/gerencial', icon: LayoutDashboard, label: 'Gerencial' },
            ]
        },
        { id: 'config', label: 'Configurações', path: '/finance/configuracoes', icon: Settings, show: hasPermission('Acessar Configurações') }
    ].filter(m => m.show !== false);

    return (
        <>
            <header className="h-[64px] flex items-center justify-between px-4 sm:px-6 sticky top-0 z-[999] shrink-0 print:hidden transition-colors duration-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-black/[.06] dark:border-slate-700/60 shadow-none">

                {/* LOGO */}
                <div className="flex items-center justify-center shrink-0">
                    <Link to="/home" className="cursor-pointer transition-transform hover:scale-105 active:scale-95 flex items-center">
                        <img src={theme.logoUrl} alt="Logo do Sistema" className="h-6 sm:h-8 max-w-[120px] sm:max-w-none w-auto object-contain drop-shadow-sm transition-all duration-300 opacity-90" />
                    </Link>
                </div>

                {/* MENU HAMBÚRGUER — telas estreitas (< lg), onde o menu horizontal some */}
                {(
                    <div className="relative hidden md:block lg:hidden ml-2" ref={mobileNavRef}>
                        <button onClick={() => setMobileNavOpen(o => !o)} title="Menu"
                            className="p-2 rounded-xl text-slate-700 hover:bg-white/70 border border-transparent hover:border-white/30 transition-all">
                            <Menu size={20} />
                        </button>
                        {mobileNavOpen && (
                            <div className="absolute left-0 top-full mt-2 w-64 max-h-[75vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl z-[1000] p-1.5 animate-in fade-in slide-in-from-top-1 custom-scrollbar">
                                <div className="px-3 pt-2 pb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Módulos</div>
                                {modulosNav.map(m => {
                                    const Icon = m.icon;
                                    return (
                                        <Link key={m.id} to={m.path} onClick={() => setMobileNavOpen(false)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium ${moduloAtivo(m) ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
                                            <Icon size={15} /> {m.label}
                                        </Link>
                                    );
                                })}
                                {isFinance && <div className="my-1.5 border-t border-slate-100" />}
                                {isFinance && financeMenu.map(m => {
                                    if (m.soon) return (
                                        <div key={m.id} className="flex items-center justify-between px-3 py-2 text-[11px] font-bold text-slate-300">
                                            {m.label}<span className="text-[8px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">em breve</span>
                                        </div>
                                    );
                                    if (m.path) {
                                        const active = location.pathname === m.path;
                                        return (
                                            <Link key={m.id} to={m.path} onClick={() => setMobileNavOpen(false)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
                                                {m.icon && <m.icon size={15} />} {m.label}
                                            </Link>
                                        );
                                    }
                                    return (
                                        <div key={m.id} className="mt-1 first:mt-0">
                                            <div className="px-3 pt-2 pb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">{m.label}</div>
                                            {m.items.filter(s => !s.soon).map(s => {
                                                const Icon = s.icon;
                                                const sActive = location.pathname === s.path;
                                                return (
                                                    <Link key={s.path} to={s.path} onClick={() => setMobileNavOpen(false)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold ${sActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                                        <Icon size={15} /> {s.label}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* MÓDULOS: a barra é a mesma em todo o sistema. O menu interno do
                    Financeiro fica numa faixa própria logo abaixo (ver o fim do header). */}
                <div className="hidden lg:flex flex-1 items-center h-full mx-4 sm:mx-8 min-w-0">
                    <nav className="flex items-center gap-1">
                        {modulosNav.map(m => {
                            const Icon = m.icon;
                            const ativo = moduloAtivo(m);
                            return (
                                <Link key={m.id} to={m.path}
                                    className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[13px] font-medium transition-colors ${ativo ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-black/[.04]' : 'text-slate-500 hover:text-slate-900 hover:bg-white/60'}`}>
                                    <Icon size={14} /> {m.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
                {/* DIREITA */}
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {/* Busca global (Ctrl/⌘ + K) */}
                    <button title="Buscar (Ctrl + K)" onClick={abrirBusca}
                        className="p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent text-slate-600 hover:bg-white/70 hover:border-white/30 hover:text-blue-600">
                        <Search size={18} />
                    </button>
                    {/* Alternar tema claro/escuro */}
                    <button
                        title={temaEscuro ? 'Tema claro' : 'Tema escuro'}
                        onClick={alternarTema}
                        className="hidden md:block p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent text-slate-600 hover:bg-white/70 hover:border-white/30 hover:text-blue-600"
                    >
                        {temaEscuro ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    {/* Configurações no desktop (no celular fica no "Mais"). Um caminho só:
                        Usuários mora dentro de Configurações; quem só tem a chave de
                        Usuários cai direto lá. */}
                    {(hasPermission('Acessar Configurações') || hasPermission('Acessar Usuarios')) && (
                        <Link to={hasPermission('Acessar Configurações') ? '/configuracoes' : '/usuarios'} title="Configurações"
                            className={`hidden md:block p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent hover:bg-white/70 hover:border-white/30 ${['/configuracoes', '/configuracoes-painel', '/usuarios'].includes(location.pathname) ? 'text-slate-900' : 'text-slate-600'}`}>
                            <Settings size={18} />
                        </Link>
                    )}

                    {/* BELL ICON NOTIFICATIONS */}
                    <div className="relative" ref={notifRef}>
                        <button
                            title="Notificações"
                            onClick={() => { const abrir = !showNotifications; setShowNotifications(abrir); if (abrir) pararPulso(); }}
                            className="p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent text-slate-800 hover:bg-white/70 hover:border-white/30 relative"
                        >
                            <Bell size={18} className={`text-slate-600 ${pulsando ? 'mc-bell-ring' : ''}`} />
                            {notificacoes.length > 0 && (
                                <span className={`absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-3.5 px-[3px] bg-rose-500 text-white text-[9px] font-bold rounded-full border border-white ${pulsando ? 'animate-pulse' : ''}`}>
                                    {notificacoes.length > 9 ? '9+' : notificacoes.length}
                                </span>
                            )}
                        </button>

                        {/* DROPDOWN DE NOTIFICAÇÕES */}
                        {showNotifications && (
                            <div className="fixed inset-x-3 top-16 md:absolute md:inset-x-auto md:right-0 md:top-full mt-2 md:w-[330px] bg-white border border-slate-200/80 rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200/70 flex items-center justify-between">
                                    <span className="text-sm font-bold text-slate-800">Notificações ({notificacoes.length})</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            title={somOn ? 'Desativar som' : 'Ativar som'}
                                            onClick={() => { const v = !somOn; setSomOn(v); definirSom(v); }}
                                            className={`p-1.5 rounded-lg transition-colors ${somOn ? 'text-slate-500 hover:bg-slate-200/60' : 'text-slate-300 hover:bg-slate-200/60'}`}
                                        >
                                            {somOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                                        </button>
                                        {/* O aviso só sai da lista quando a tarefa é aberta — este é o
                                            atalho para quem quer zerar tudo sem abrir uma por uma. */}
                                        {notificacoes.length > 0 && (
                                            <button title="Dispensar todos os avisos" onClick={marcarTodasLidas} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors">
                                                <CheckCheck size={15} />
                                            </button>
                                        )}
                                        <button onClick={() => { setShowNotifications(false); navigate('/compromissos'); }} className="text-xs font-bold text-blue-600 hover:text-blue-700 px-1.5">Abrir</button>
                                    </div>
                                </div>
                                <div className="max-h-[320px] overflow-y-auto">
                                    {notificacoes.length === 0 ? (
                                        <div className="p-6 text-center text-sm text-slate-400 font-medium">Nada por aqui — sem tarefas ou lembretes agora.</div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {notificacoes.map(n => {
                                                const ehLembrete = n.tipo === 'lembrete';
                                                const ehMencao = n.tipo === 'mencao';
                                                const Icone = ehLembrete ? CalendarClock : ehMencao ? AtSign : UserPlus;
                                                const cor = ehLembrete ? 'bg-rose-50 text-rose-500'
                                                    : ehMencao ? 'bg-violet-50 text-violet-500'
                                                    : 'bg-blue-50 text-blue-500';
                                                return (
                                                    <div key={n.id} className="p-3 hover:bg-slate-50 cursor-pointer transition-colors flex gap-2.5 group" onClick={() => abrirNotificacao(n)}>
                                                        <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${cor}`}>
                                                            <Icone size={14} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-bold text-slate-800 leading-tight truncate">{n.titulo}</p>
                                                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                                                                {ehLembrete ? 'Agora'
                                                                    : ehMencao ? `${n.autor ? formatNameStandard(n.autor) : 'Alguém'} marcou você`
                                                                    : 'Atribuída a você'}
                                                                {n.dataISO && ` · ${n.dataISO.split('-').reverse().join('/')}`}
                                                                {n.hora && ` às ${n.hora}`}
                                                            </p>
                                                        </div>
                                                        <button
                                                            title="Dispensar este aviso"
                                                            onClick={(e) => { e.stopPropagation(); marcarLida(n); }}
                                                            className="self-start p-1 rounded-md text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600 hover:bg-slate-200/70 transition-all"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <button title="Meu Perfil" onClick={() => setIsProfileOpen(true)} className="hidden md:block p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent text-slate-800 hover:bg-white/70 hover:border-white/30">
                        <User size={16} />
                    </button>
                    <button title="Sair" onClick={handleLogout} className="hidden md:block p-1.5 sm:p-2 rounded-xl transition-all duration-300 text-slate-800 hover:bg-rose-500/80 hover:text-white">
                        <LogOut size={16} />
                    </button>
                    {/* Celular: o resto mora no "Mais" */}
                    <button title="Mais" aria-label="Mais opções" onClick={() => setMaisAberto(true)} className="md:hidden p-2 rounded-xl text-slate-700 active:bg-white/70">
                        <Menu size={20} />
                    </button>
                </div>
            </header>

            {/* Faixa do Financeiro (desktop): as telas internas do módulo, em abas
                planas. No celular/tablet elas ficam no menu. App.jsx soma a altura
                desta faixa ao respiro do <main> em /finance. */}
            {isFinance && (
                <nav className="hidden lg:flex items-center gap-0.5 h-10 px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-black/[.06] dark:border-slate-700/60 overflow-x-auto no-scrollbar print:hidden">
                    {financeMenu.flatMap((m, gi) => {
                        const itens = m.items || [{ path: m.path, label: m.label }];
                        return [
                            gi > 0 && <span key={`sep-${m.id}`} className="w-px h-4 bg-black/[.08] mx-2 shrink-0" aria-hidden />,
                            ...itens.map(s => {
                                const ativo = location.pathname === s.path;
                                return (
                                    <Link key={s.path} to={s.path}
                                        className={`relative h-10 px-2.5 flex items-center text-[12.5px] whitespace-nowrap transition-colors ${ativo ? 'text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-900'}`}>
                                        {s.label}
                                        {ativo && <span className="absolute left-2.5 right-2.5 bottom-0 h-[2px] rounded-full bg-slate-900" />}
                                    </Link>
                                );
                            }),
                        ];
                    })}
                </nav>
            )}

            {/* "MAIS" DO CELULAR: módulos, financeiro, ajustes, tema, perfil e sair */}
            <Gaveta aberta={maisAberto} onClose={() => setMaisAberto(false)} titulo="Menu">
                <div className="grid grid-cols-3 gap-2">
                    {modulosNav.map(m => {
                        const Icon = m.icon;
                        const on = moduloAtivo(m);
                        return (
                            <Link key={m.id} to={m.path}
                                className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[11.5px] font-bold ${on ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-700 active:bg-slate-100'}`}>
                                <Icon size={20} /> {m.label}
                            </Link>
                        );
                    })}
                </div>

                {hasPermission('Acessar Financeiro') && (
                    <div className="mt-4">
                        <p className="px-1 pb-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Financeiro</p>
                        <div className="bg-slate-50 rounded-2xl divide-y divide-white overflow-hidden">
                            {[...financeMenu[0].items, ...financeMenu[1].items].map(s => (
                                <Link key={s.path} to={s.path}
                                    className={`flex items-center gap-3 px-4 h-12 text-[13px] font-semibold ${location.pathname === s.path ? 'text-indigo-700 bg-indigo-50' : 'text-slate-700 active:bg-slate-100'}`}>
                                    <s.icon size={16} className="text-slate-400" /> <span className="flex-1">{s.label}</span> <ChevronRight size={15} className="text-slate-300" />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-4 bg-slate-50 rounded-2xl divide-y divide-white overflow-hidden">
                    {hasPermission('Acessar Configurações') && (
                        <Link to="/configuracoes" className="flex items-center gap-3 px-4 h-12 text-[13px] font-semibold text-slate-700 active:bg-slate-100">
                            <Settings size={16} className="text-slate-400" /> <span className="flex-1">Configurações</span> <ChevronRight size={15} className="text-slate-300" />
                        </Link>
                    )}
                    {/* Usuários fica dentro de Configurações; aparece aqui só para quem não abre Configurações. */}
                    {hasPermission('Acessar Usuarios') && !hasPermission('Acessar Configurações') && (
                        <Link to="/usuarios" className="flex items-center gap-3 px-4 h-12 text-[13px] font-semibold text-slate-700 active:bg-slate-100">
                            <UserCog size={16} className="text-slate-400" /> <span className="flex-1">Usuários</span> <ChevronRight size={15} className="text-slate-300" />
                        </Link>
                    )}
                    <button onClick={() => { setMaisAberto(false); setIsProfileOpen(true); }} className="w-full flex items-center gap-3 px-4 h-12 text-[13px] font-semibold text-slate-700 active:bg-slate-100 text-left">
                        <User size={16} className="text-slate-400" /> <span className="flex-1">Meu perfil e senha</span> <ChevronRight size={15} className="text-slate-300" />
                    </button>
                    <button onClick={alternarTema} className="w-full flex items-center gap-3 px-4 h-12 text-[13px] font-semibold text-slate-700 active:bg-slate-100 text-left">
                        {temaEscuro ? <Sun size={16} className="text-slate-400" /> : <Moon size={16} className="text-slate-400" />}
                        <span className="flex-1">{temaEscuro ? 'Tema claro' : 'Tema escuro'}</span>
                    </button>
                </div>

                <button onClick={handleLogout} className="mt-4 w-full h-12 rounded-2xl bg-rose-50 text-rose-600 text-[13px] font-bold flex items-center justify-center gap-2 active:bg-rose-100">
                    <LogOut size={16} /> Sair da conta
                </button>
                {currentUser?.email && <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">{currentUser.email}</p>}
            </Gaveta>

            {/* MODAL DE PERFIL ORIGINAL INTACTO */}
            {isProfileOpen && (
                <div className="fixed top-16 inset-x-0 bottom-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
                    <div className="bg-white/95 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl"><User size={20} /></div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest leading-none">Meu Perfil</h2>
                                    <p className="text-[13px] font-semibold text-slate-800 tracking-tight mt-1">Gerencie sua conta</p>
                                </div>
                            </div>
                            <button onClick={() => setIsProfileOpen(false)} className="text-slate-500 hover:text-rose-500 bg-white p-2 rounded-full shadow-sm hover:shadow transition-all"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Nome Completo</label>
                                    <div className="text-sm font-bold text-slate-800 uppercase">{formatNameStandard(currentUser?.name || currentUser?.displayName) || '---'}</div>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">E-mail</label>
                                    <div className="text-xs font-semibold text-slate-600">{currentUser?.email}</div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Perfil</label>
                                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-[11px] font-black uppercase rounded">{currentUser?.role || '---'}</span>
                                </div>
                                {currentUser?.cpf && (
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Documento</label>
                                        <div className="text-xs font-bold text-slate-700">{currentUser?.cpf}</div>
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleUpdatePassword} className="space-y-4 pt-2">
                                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                    <Lock size={12} /> Alterar Senha
                                </h3>
                                <div><input type="password" placeholder="Nova Senha (min. 6 caracteres)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold outline-none focus:border-blue-500 placeholder:text-slate-500 placeholder:font-normal" /></div>
                                <div><input type="password" placeholder="Confirmar Nova Senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 font-semibold outline-none focus:border-blue-500 placeholder:text-slate-500 placeholder:font-normal" /></div>
                                <button type="submit" disabled={loadingPassword || !newPassword || !confirmPassword} className="w-full py-3 bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-900 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-slate-800/20">
                                    {loadingPassword ? 'Salvando...' : <><Save size={16} /> Atualizar Senha</>}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE AGENDA CASO ABERTO VIA NOTIFICAÇÃO */}
        </>
    );
};
