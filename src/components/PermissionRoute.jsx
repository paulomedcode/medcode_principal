import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../contexts/PermissionContext';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Porteiro de rota. Uma permissão, uma verificação — a camada antiga de
// `modules_access` saiu: era um segundo portão, invisível na tela de usuários,
// vazio em todos os cadastros, e que fazia `requiredModule` parecer proteção
// quando não protegia nada. Quem manda agora é a permissão do catálogo.
const PermissionRoute = ({ children, requiredPermission }) => {
    const { currentUser, loading: authLoading } = useAuth();
    const { hasPermission, loading: permLoading } = usePermission();

    if (authLoading || permLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" />;
    }

    if (requiredPermission && !hasPermission(requiredPermission)) {
        return <PermissionDeniedRedirect />;
    }

    return children;
};

// Dispara o aviso uma vez só e devolve para a home.
const PermissionDeniedRedirect = () => {
    React.useEffect(() => {
        toast.error('Você não tem permissão para acessar esta área.', { id: 'acesso-negado' });
    }, []);
    return <Navigate to="/home" />;
};

export default PermissionRoute;
