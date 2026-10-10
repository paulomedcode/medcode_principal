import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import TelaAcesso, { rotuloAcesso, campoAcesso, botaoAcesso } from '../components/acesso/TelaAcesso';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [entrando, setEntrando] = useState(false);
    const { login, resetPassword, currentUser } = useAuth();
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
        } catch {
            toast.error("Erro ao processar solicitação.");
        }
    };

    return (
        <TelaAcesso titulo="Entrar" subtitulo="Acesse o painel da MedCode.">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="email" className={rotuloAcesso}>E-mail</label>
                    <input
                        id="email" type="email" required autoComplete="email" autoFocus
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        className={campoAcesso} placeholder="voce@empresa.com"
                    />
                </div>

                <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                        <label htmlFor="senha" className="text-[13px] font-medium text-slate-700">Senha</label>
                        <button type="button" onClick={handleForgotPassword}
                            className="text-[12.5px] text-slate-500 hover:text-slate-900 transition-colors">
                            Esqueci minha senha
                        </button>
                    </div>
                    <input
                        id="senha" type="password" required autoComplete="current-password"
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        className={campoAcesso} placeholder="••••••••"
                    />
                </div>

                <button disabled={entrando} className={`${botaoAcesso} !mt-6`}>
                    {entrando ? 'Entrando...' : 'Entrar'}
                </button>
            </form>

            {/* Não há mais cadastro público: qualquer pessoa da internet podia
                criar conta aqui. A conta nascia Inativa e não abria nada, mas
                virava usuário no Auth e linha em `users`. Quem precisa de acesso
                pede para a administração, que cria o cadastro. */}
            <p className="text-[12.5px] text-slate-500 mt-6">
                Não tem acesso? Fale com a administração para pedir o seu cadastro.
            </p>
        </TelaAcesso>
    );
};

export default Login;