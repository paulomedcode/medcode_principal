import { Building2, Target, FolderKanban, ClipboardList, DollarSign } from 'lucide-react';
import { usePermission } from '../contexts/PermissionContext';

// Opções do "Novo" (NovoGlobal.jsx) e o atalho para abri-lo de qualquer tela.

export function useOpcoesNovo() {
    const { hasPermission } = usePermission();
    return [
        (hasPermission('Editar Clientes') || hasPermission('Editar Vendas') || hasPermission('Editar Financeiro'))
            && { id: 'lead', rotulo: 'Lead / Cliente', icone: Building2 },
        hasPermission('Editar Vendas') && { id: 'oportunidade', rotulo: 'Oportunidade', icone: Target },
        hasPermission('Editar Projetos') && { id: 'projeto', rotulo: 'Projeto', icone: FolderKanban },
        hasPermission('Acessar Compromissos') && { id: 'tarefa', rotulo: 'Tarefa', icone: ClipboardList },
        hasPermission('Editar Financeiro') && { id: 'lancamento', rotulo: 'Lançamento', icone: DollarSign },
    ].filter(Boolean);
}

export const abrirNovo = (tipo) => window.dispatchEvent(new CustomEvent('medcode:novo', { detail: tipo ? { tipo } : null }));
