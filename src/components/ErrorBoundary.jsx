import React from 'react';
import { logAction } from '../utils/logger';

// Captura erros de renderização em qualquer parte da árvore e mostra uma tela de
// recuperação no lugar da "tela branca". Também registra o erro nos logs (com
// stack), o que permite diagnosticar crashes que só acontecem para certos usuários.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('Erro capturado pelo ErrorBoundary:', error, info);
        // Best-effort: registra nos logs para diagnóstico (logAction nunca lança).
        try {
            const stack = (info && info.componentStack) ? info.componentStack.slice(0, 1500) : '';
            logAction('ERRO DE TELA (Crash)', `${error?.message || error} | em ${window.location.pathname} | ${stack}`);
        } catch (_) { /* ignora */ }
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center">
                        <h1 className="text-lg font-black text-slate-800 uppercase tracking-wide mb-2">
                            Ops, algo deu errado
                        </h1>
                        <p className="text-sm text-slate-500 mb-6">
                            A tela encontrou um erro inesperado. Seus dados anteriores estão seguros — basta recarregar para continuar.
                        </p>
                        <button
                            onClick={this.handleReload}
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
                        >
                            Recarregar página
                        </button>
                        {this.state.error?.message && (
                            <p className="mt-4 text-[11px] text-slate-400 font-mono break-words">
                                {this.state.error.message}
                            </p>
                        )}
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
