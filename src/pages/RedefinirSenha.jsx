import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase, HASH_INICIAL } from '../services/supabase';
import TelaAcesso, { rotuloAcesso, campoAcesso, botaoAcesso } from '../components/acesso/TelaAcesso';

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

    return (
        <TelaAcesso titulo="Nova senha" subtitulo={etapa === 'formulario' ? 'Escolha a senha que você vai usar para entrar.' : undefined}>
            {etapa === 'verificando' && (
                <div className="flex items-center gap-2.5 text-[14px] text-slate-500">
                    <Loader2 className="animate-spin text-slate-400" size={18} /> Validando o link...
                </div>
            )}

            {etapa === 'invalido' && (
                <div className="space-y-5">
                    <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg p-3.5">
                        <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={16} />
                        <p className="text-[13.5px] text-rose-800">
                            {motivo} Volte ao login e use "Esqueci minha senha" para receber um link novo.
                        </p>
                    </div>
                    <button type="button" onClick={voltarAoLogin} className={botaoAcesso}>
                        Voltar ao login
                    </button>
                </div>
            )}

            {etapa === 'formulario' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="senha" className={rotuloAcesso}>Senha nova</label>
                        <input
                            id="senha" type="password" required autoFocus autoComplete="new-password"
                            value={senha} onChange={(e) => setSenha(e.target.value)}
                            className={campoAcesso} placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                        />
                    </div>
                    <div>
                        <label htmlFor="confirmacao" className={rotuloAcesso}>Repita a senha</label>
                        <input
                            id="confirmacao" type="password" required autoComplete="new-password"
                            value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
                            className={campoAcesso} placeholder="••••••••"
                        />
                    </div>
                    <button disabled={salvando} className={`${botaoAcesso} !mt-6`}>
                        {salvando ? 'Salvando...' : 'Salvar e entrar'}
                    </button>
                </form>
            )}
        </TelaAcesso>
    );
};

export default RedefinirSenha;
