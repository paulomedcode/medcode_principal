import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Key, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase, HASH_INICIAL } from '../services/supabase';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import bgImage from '../assets/capa-login.jpg';

/*
 * Destino do link "redefinir senha" do e-mail.
 *
 * O link já traz uma sessão: o Supabase loga a pessoa e dispara
 * PASSWORD_RECOVERY. Antes desta tela o app tratava isso como login comum —
 * a raiz mandava para /home, e quem não tinha perfil carregado caía de volta
 * no login, sem nunca ver onde pôr a senha nova. Link vencido ou já usado
 * voltava com #error=... e o erro sumia em silêncio.
 */

const TEMPO_MAXIMO_MS = 8000; // sem sessão até aqui, o link não serviu
const SENHA_MINIMA = 6;       // mínimo padrão do Supabase Auth

// Link vencido/usado volta como #error=access_denied&error_code=otp_expired&...
function erroDoLink(hash) {
    const params = new URLSearchParams((hash || '').replace(/^#/, ''));
    if (!params.get('error') && !params.get('error_code')) return null;
    return params.get('error_code') === 'otp_expired'
        ? 'Este link venceu ou já foi usado.'
        : (params.get('error_description') || 'O link não é válido.').replace(/\+/g, ' ');
}

/**
 * Link antigo, ou de template que ainda aponte para a raiz do site: a sessão
 * de recuperação chega em qualquer rota. Este desvio leva para a tela certa.
 */
export const DesvioDeRecuperacao = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // O cliente pode ter processado o link antes de o efeito de baixo montar, e
    // aí o evento já passou — o hash guardado na carga cobre esse caso. Roda
    // uma vez só: depois de salvar a senha a pessoa segue para /home.
    useEffect(() => {
        if (HASH_INICIAL.includes('type=recovery') && window.location.pathname !== '/redefinir-senha') {
            navigate('/redefinir-senha', { replace: true });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY' && location.pathname !== '/redefinir-senha') {
                navigate('/redefinir-senha', { replace: true });
            }
        });
        return () => subscription.unsubscribe();
    }, [navigate, location.pathname]);

    return null;
};

const RedefinirSenha = () => {
    const navigate = useNavigate();
    const { theme } = useWhiteLabel();
    const [motivo, setMotivo] = useState(() => erroDoLink(HASH_INICIAL));
    // verificando | formulario | invalido
    const [etapa, setEtapa] = useState(() => (erroDoLink(HASH_INICIAL) ? 'invalido' : 'verificando'));
    const [senha, setSenha] = useState('');
    const [confirmacao, setConfirmacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (etapa !== 'verificando') return undefined;

        let resolvido = false;
        const liberar = () => { resolvido = true; setEtapa('formulario'); };

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) liberar();
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) liberar();
        });
        const timer = setTimeout(() => {
            if (!resolvido) {
                setMotivo('Não foi possível validar o link.');
                setEtapa('invalido');
            }
        }, TEMPO_MAXIMO_MS);

        return () => { subscription.unsubscribe(); clearTimeout(timer); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (senha.length < SENHA_MINIMA) return toast.error(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
        if (senha !== confirmacao) return toast.error('As duas senhas não são iguais.');

        setSalvando(true);
        const { error } = await supabase.auth.updateUser({ password: senha });
        setSalvando(false);
        if (error) {
            console.error('Erro ao redefinir senha:', error);
            if (error.message?.includes('different from the old')) {
                return toast.error('A senha nova precisa ser diferente da atual.');
            }
            return toast.error('Não foi possível salvar a senha. Tente de novo.');
        }
        toast.success('Senha definida! Bem-vindo.');
        navigate('/home', { replace: true });
    };

    const voltarAoLogin = async () => {
        await supabase.auth.signOut().catch(() => {});
        navigate('/login', { replace: true });
    };

    const inputClass = 'w-full pl-12 pr-4 py-3.5 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl text-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 font-bold placeholder:text-slate-500 transition-all shadow-sm';

    return (
        <div
            className="min-h-full w-full flex justify-end font-sans"
            style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
            <div className="w-full md:w-1/2 lg:w-1/3 min-h-full bg-white/60 backdrop-blur-md border-l border-white/40 shadow-2xl p-10 flex flex-col justify-center relative z-10">
                <div className="text-center mb-10">
                    {theme.logoUrl && (
                        <div className="flex justify-center mb-8">
                            <img src={theme.logoUrl} alt="Logo" className="h-[4.5rem] w-auto object-contain drop-shadow-md" />
                        </div>
                    )}
                    <h1 className="text-2xl font-extrabold text-slate-800 uppercase tracking-widest leading-tight">
                        Nova senha
                    </h1>
                </div>

                {etapa === 'verificando' && (
                    <div className="flex flex-col items-center gap-3 text-slate-600">
                        <Loader2 className="animate-spin text-blue-600" size={32} />
                        <p className="text-[11px] font-bold uppercase tracking-widest">Validando o link...</p>
                    </div>
                )}

                {etapa === 'invalido' && (
                    <div className="space-y-6 text-center">
                        <div className="flex items-start gap-3 text-left bg-rose-50/90 border border-rose-200 rounded-2xl p-4">
                            <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-sm font-semibold text-rose-800">
                                {motivo} Volte ao login e use "Esqueci minha senha" para receber um link novo.
                            </p>
                        </div>
                        <button
                            type="button" onClick={voltarAoLogin}
                            className="w-full py-4 bg-blue-50/90 hover:bg-blue-100 text-blue-800 border-2 border-blue-200/60 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/10 transition-all active:scale-95"
                        >
                            Voltar ao login
                        </button>
                    </div>
                )}

                {etapa === 'formulario' && (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-900 uppercase ml-1">Senha nova</label>
                            <div className="relative">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password" required autoFocus autoComplete="new-password"
                                    value={senha} onChange={(e) => setSenha(e.target.value)}
                                    className={inputClass} placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-900 uppercase ml-1">Repita a senha</label>
                            <div className="relative">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password" required autoComplete="new-password"
                                    value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
                                    className={inputClass} placeholder="••••••••"
                                />
                            </div>
                        </div>
                        <button
                            disabled={salvando}
                            className="w-full py-4 bg-blue-50/90 hover:bg-blue-100 text-blue-800 border-2 border-blue-200/60 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/10 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                        >
                            {salvando ? 'Salvando...' : 'Salvar e entrar'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default RedefinirSenha;
