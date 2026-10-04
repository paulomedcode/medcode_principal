import { useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, Target, FolderKanban, DollarSign, ClipboardList, Home, Radar } from 'lucide-react';
import { usePermission } from '../contexts/PermissionContext';
import { PERMISSION_MODULES } from '../config/permissions';

// Módulos da navegação (barra superior, menu e barra inferior do celular).
// Sai do catálogo de permissões: quem não abre o módulo não vê o item.
const ICONES_MODULO = { painel: LayoutDashboard, clientes: Building2, prospeccao: Radar, vendas: Target, projetos: FolderKanban, financeiro: DollarSign, compromissos: ClipboardList };

export function useModulosNav() {
    const { hasPermission } = usePermission();
    const location = useLocation();
    const modulos = [
        { id: 'inicio', label: 'Início', path: '/home', icon: Home, prefixos: ['/home'] },
        ...PERMISSION_MODULES
            .filter(m => ICONES_MODULO[m.id] && hasPermission(m.accessKey))
            .map(m => ({
                id: m.id, label: m.label, path: m.route, icon: ICONES_MODULO[m.id],
                prefixos: m.id === 'financeiro' ? ['/finance'] : m.id === 'vendas' ? ['/vendas'] : [m.route],
            })),
    ];
    const ativo = (m) => m.prefixos.some(pf => location.pathname === pf || location.pathname.startsWith(`${pf}/`));
    return { modulos, ativo };
}
