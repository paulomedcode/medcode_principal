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
    Volume2, VolumeX, CalendarClock, UserPlus, Sun, Moon, AtSign, CheckCheck
} from 'lucide-react';
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

    const [activeDropdown, setActiveDropdown] = useState(null);
    const dropdownRef = useRef(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);  // menu hambúrguer (telas estreitas)
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
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setActiveDropdown(null);
            if (notifRef.current && !notifRef.current.contains(event.target)) setShowNotifications(false);
            if (mobileNavRef.current && !mobileNavRef.current.contains(event.target)) setMobileNavOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fecha o menu hambúrguer ao trocar de página.
    useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

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

    // Menu superior do módulo Financeiro (aparece somente dentro de /finance).
    const financeMenu = [
        {
            id: 'financeiro', label: 'Financeiro',
            items: [
                { path: '/finance/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
                { path: '/finance/contas-pagar', icon: ArrowUpCircle, label: 'Contas a Pagar' },
                { path: '/finance/contas-receber', icon: ArrowDownCircle, label: 'Contas a Receber' },
                { path: '/finance/transacoes', icon: Activity, label: 'Movimentações' },
                { path: '/finance/fluxo-de-caixa', icon: TrendingUp, label: 'Fluxo de Caixa' },
                { path: '/finance/conciliacao', icon: ArrowRightLeft, label: 'Conciliação Bancária' },
            ]
        },
        {
            id: 'vendas', label: 'Vendas',
            items: [
                { path: '/finance/orcamentos', icon: FileText, label: 'Orçamentos' }
            ]
        },
        {
            id: 'relatorios', label: 'Relatórios',
            items: [
                { path: '/finance/relatorios/dre', icon: FileText, label: 'DRE' },
                { path: '/finance/relatorios/fluxo', icon: TrendingUp, label: 'Fluxo de Caixa' },
                { path: '/finance/relatorios/gerencial', icon: LayoutDashboard, label: 'Gerencial' },
                { path: '/finance/relatorios/vendas', icon: ShoppingCart, label: 'Vendas' },
            ]
        },
        { id: 'config', label: 'Configurações', path: '/finance/configuracoes', icon: Settings, show: hasPermission('Acessar Configurações') }
    ].filter(m => m.show !== false);

    return (
        <>
            <header className="h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-[999] shrink-0 print:hidden transition-colors duration-300 bg-white/60 dark:bg-slate-900/80 backdrop-blur-md border-b border-white/60 dark:border-slate-700/60 shadow-none">

                {/* LOGO */}
                <div className="flex items-center justify-center shrink-0">
                    <Link to="/home" className="cursor-pointer transition-transform hover:scale-105 active:scale-95 flex items-center">
                        <img src={theme.logoUrl} alt="Logo do Sistema" className="h-6 sm:h-8 max-w-[120px] sm:max-w-none w-auto object-contain drop-shadow-sm transition-all duration-300 opacity-90" />
                    </Link>
                </div>

                {/* MENU HAMBÚRGUER — telas estreitas (< lg), onde o menu horizontal some */}
                {isFinance && (
                    <div className="relative lg:hidden ml-2" ref={mobileNavRef}>
                        <button onClick={() => setMobileNavOpen(o => !o)} title="Menu do financeiro"
                            className="p-2 rounded-xl text-slate-700 hover:bg-white/70 border border-transparent hover:border-white/30 transition-all">
                            <Menu size={20} />
                        </button>
                        {mobileNavOpen && (
                            <div className="absolute left-0 top-full mt-2 w-64 max-h-[75vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl z-[1000] p-1.5 animate-in fade-in slide-in-from-top-1 custom-scrollbar">
                                {financeMenu.map(m => {
                                    if (m.soon) return (
                                        <div key={m.id} className="flex items-center justify-between px-3 py-2 text-[11px] font-bold text-slate-300">
                                            {m.label}<span className="text-[8px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">em breve</span>
                                        </div>
                                    );
                                    if (m.path) {
                                        const active = location.pathname === m.path;
                                        return (
                                            <Link key={m.id} to={m.path} onClick={() => setMobileNavOpen(false)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wide ${active ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
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

                {/* MENU DO MÓDULO FINANCEIRO (somente em /finance) */}
                <div className="hidden lg:flex flex-1 items-center h-full mx-4 sm:mx-8 min-w-0" ref={dropdownRef}>
                    {isFinance && (
                        <nav className="flex items-center gap-1">
                            {financeMenu.map(m => {
                                if (m.soon) {
                                    return (
                                        <button key={m.id} disabled
                                            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-black uppercase tracking-wide text-slate-300 cursor-not-allowed">
                                            {m.label}
                                            <span className="text-[8px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">em breve</span>
                                        </button>
                                    );
                                }
                                if (m.path) {
                                    const active = location.pathname === m.path;
                                    return (
                                        <Link key={m.id} to={m.path}
                                            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-black uppercase tracking-wide transition-colors ${active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}>
                                            {m.icon && <m.icon size={14} />} {m.label}
                                        </Link>
                                    );
                                }
                                const open = activeDropdown === m.id;
                                const anyActive = m.items?.some(s => location.pathname === s.path);
                                return (
                                    <div key={m.id} className="relative"
                                        onMouseEnter={() => setActiveDropdown(m.id)}
                                        onMouseLeave={() => setActiveDropdown(null)}>
                                        <button onClick={() => setActiveDropdown(open ? null : m.id)}
                                            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-black uppercase tracking-wide transition-colors ${open || anyActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}>
                                            {m.label}
                                            <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                                        </button>
                                        {open && (
                                            <div className="absolute left-0 top-full w-52 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden p-1 animate-in fade-in slide-in-from-top-1">
                                                {m.items.map(s => {
                                                    if (s.soon) {
                                                        return (
                                                            <div key={s.label} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[11px] font-bold text-slate-300 cursor-not-allowed">
                                                                {s.label}
                                                                <span className="text-[8px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">em breve</span>
                                                            </div>
                                                        );
                                                    }
                                                    const Icon = s.icon;
                                                    const sActive = location.pathname === s.path;
                                                    return (
                                                        <Link key={s.path} to={s.path} onClick={() => setActiveDropdown(null)}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold transition-colors ${sActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                                            <Icon size={14} /> {s.label}
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </nav>
                    )}
                </div>
                {/* DIREITA */}
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {/* COMPROMISSO / WORKSPACE (estilo Notion) */}
                    {/* Alternar tema claro/escuro */}
                    <button
                        title={temaEscuro ? 'Tema claro' : 'Tema escuro'}
                        onClick={alternarTema}
                        className="p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent text-slate-600 hover:bg-white/70 hover:border-white/30 hover:text-blue-600"
                    >
                        {temaEscuro ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    {/* BELL ICON NOTIFICATIONS */}
                    <div className="relative" ref={notifRef}>
                        <button
                            title="Notificações"
                            onClick={() => { const abrir = !showNotifications; setShowNotifications(abrir); if (abrir) pararPulso(); }}
                            className="p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent text-slate-800 hover:bg-white/70 hover:border-white/30 relative"
                        >
                            <Bell size={18} className={`${notificacoes.length > 0 ? 'text-rose-500' : 'text-slate-600'} ${pulsando ? 'mc-bell-ring' : ''}`} />
                            {notificacoes.length > 0 && (
                                <span className={`absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-3.5 px-[3px] bg-rose-500 text-white text-[9px] font-bold rounded-full border border-white ${pulsando ? 'animate-pulse' : ''}`}>
                                    {notificacoes.length > 9 ? '9+' : notificacoes.length}
                                </span>
                            )}
                        </button>

                        {/* DROPDOWN DE NOTIFICAÇÕES */}
                        {showNotifications && (
                            <div className="absolute right-0 top-full mt-2 w-[330px] bg-white border border-slate-200/80 rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
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

                    <button title="Meu Perfil" onClick={() => setIsProfileOpen(true)} className="p-1.5 sm:p-2 rounded-xl transition-all duration-300 shadow-sm border border-transparent text-slate-800 hover:bg-white/70 hover:border-white/30">
                        <User size={16} />
                    </button>
                    <button title="Sair" onClick={handleLogout} className="p-1.5 sm:p-2 rounded-xl transition-all duration-300 text-slate-800 hover:bg-rose-500/80 hover:text-white">
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            {/* MODAL DE PERFIL ORIGINAL INTACTO */}
            {isProfileOpen && (
                <div className="fixed top-16 inset-x-0 bottom-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
                    <div className="bg-white/95 backdrop-blur-2xl border border-white/60 rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl"><User size={20} /></div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest leading-none">Meu Perfil</h2>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Gerencie sua conta</p>
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
