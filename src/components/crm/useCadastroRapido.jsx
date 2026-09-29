import React, { useState } from 'react';
import toast from 'react-hot-toast';
import PartyModal from '../finance/PartyModal';
import { salvarEmpresa } from '../../services/crm';

/**
 * Cadastro rápido de empresa a partir de um campo de busca (SearchableSelect).
 *
 *   const { pedir, janela } = useCadastroRapido({ onCriada: (row) => ... });
 *   <SearchableSelect onCreate={(nome) => pedir(nome, 'CLIENTE')} ... />
 *   {janela}
 *
 * `pedir` devolve uma Promise com o id criado (ou null se cancelar) — é o que
 * o SearchableSelect espera para já deixar a empresa selecionada. `onCriada`
 * serve para a tela incluir a empresa nova na lista de opções.
 */
export default function useCadastroRapido({ onCriada } = {}) {
    const [pedido, setPedido] = useState(null);

    const pedir = (nome, kind = 'CLIENTE') => new Promise((resolve) => setPedido({ nome, kind, resolve }));

    const salvar = async (dados) => {
        try {
            const row = await salvarEmpresa(dados);
            toast.success(`"${row.name}" cadastrado.`);
            onCriada?.(row);
            pedido?.resolve(row.id);
            setPedido(null);
        } catch (e) {
            console.error(e);
            toast.error('Não foi possível cadastrar.');
        }
    };

    const cancelar = () => { pedido?.resolve(null); setPedido(null); };

    const janela = pedido
        ? <PartyModal initialName={pedido.nome} defaultKind={pedido.kind} onSave={salvar} onCancel={cancelar} />
        : null;

    return { pedir, janela };
}
