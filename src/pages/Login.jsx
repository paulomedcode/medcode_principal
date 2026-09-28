import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Key, UserPlus, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import bgImage from '../assets/capa-login.jpg';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [entrando, setEntrando] = useState(false);
    const { login, resetPassword, currentUser } = useAuth();
    const { theme } = useWhiteLabel();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (currentUser) {
            navigate('/home');
        }
    }, [currentUser, navigate]);

    /*
     * Quem leva para a home é o efeito acima, quando `currentUser` chega —
     * NÃO este handler.
     *
     * `login()` só devolve a sessão do Supabase; o perfil (cargo e permissões)
     * ainda está sendo buscado no banco pelo AuthContext quando esta linha roda.
     * Navegando para /home aqui, o ProtectedRoute encontrava `currentUser` nulo
     * e mandava a pessoa de volta para o login — o "pede para logar duas vezes"
     * que aparecia principalmente no celular, onde a busca do perfil demora
     * mais. Aqui só seguramos o botão até a sessão virar usuário de verdade.
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setEntrando(true);
        try {
            await login(email, password);
        } catch (error) {
            setEntrando(false);
            console.error("Erro de Login:", error);
            if (error.message?.includes('Invalid login credentials')) {
                toast.error("E-mail ou senha incorretos!");
            } else if (error.message?.includes('Email not confirmed')) {
                toast.error("Este e-mail ainda não foi confirmado no sistema.");
            } else {
                toast.error("Acesso negado. Ocorreu um erro ao conectar.");
            }
        }
    };

    const handleForgotPassword = async () => {
        if (!email) return toast.error("Digite seu e-mail primeiro!");
        try {
            await resetPassword(email);
            toast.success("Link de recuperação enviado para seu e-mail!");
        } catch (error) {
            toast.error("Erro ao processar solicitação.");
        }
    };

    return (
        <div
            className="min-h-full w-full flex justify-end font-sans"
            style={{
                backgroundImage: `url(${bgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            <div className="w-full md:w-1/2 lg:w-1/3 min-h-full bg-white/60 backdrop-blur-md border-l border-white/40 shadow-2xl p-10 flex flex-col justify-center animate-in fade-in slide-in-from-right duration-700 relative z-10">
                <div className="text-center mb-12">
                    {theme.logoUrl && (
                        <div className="flex justify-center mb-8">
                            <img src={theme.logoUrl} alt="Logo" className="h-[4.5rem] w-auto object-contain drop-shadow-md" />
                        </div>
                    )}
                    <h1 className="text-3xl font-extrabold text-slate-800 uppercase tracking-widest leading-tight drop-shadow-md mt-4">
                        BEM-VINDO
                    </h1>
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-5 leading-relaxed px-4">
                        Um sistema de saúde inteligente da <br /> MedCode Assessoria
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-900 drop-shadow-none uppercase ml-1">E-mail</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="email" required
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 font-bold placeholder:text-slate-500 transition-all shadow-sm"
                                placeholder="seu@email.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-900 drop-shadow-none uppercase ml-1">Senha de Acesso</label>
                        <div className="relative">
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="password" required
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 font-bold placeholder:text-slate-500 transition-all shadow-sm"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end pt-3 pb-3">
                        <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-[11px] font-bold text-blue-800 uppercase hover:text-blue-900 transition-colors drop-shadow-sm"
                        >
                            Esqueci minha senha
                        </button>
                    </div>

                    <button
                        disabled={entrando}
                        className="w-full py-4 bg-blue-50/90 hover:bg-blue-100 backdrop-blur-xl text-blue-800 border-2 border-blue-200/60 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/10 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait">
                        {entrando ? 'Entrando...' : 'Entrar no Sistema'}
                    </button>
                </form>

                <div className="mt-8 pt-8 border-t border-slate-300/40 text-center">
                    {/* Não há mais cadastro público: qualquer pessoa da internet podia
                        criar conta aqui. A conta nascia Inativa e não abria nada, mas
                        virava usuário no Auth e linha em `users`. Quem precisa de acesso
                        pede para a administração, que cria o cadastro. */}
                    <p className="text-[11px] font-bold text-slate-900 drop-shadow-none">
                        Não tem acesso? Fale com a administração para solicitar seu cadastro.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;