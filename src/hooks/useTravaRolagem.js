import { useEffect } from 'react';

/**
 * Enquanto uma janela está aberta, a página por trás não rola. Importa no
 * celular, onde é a página inteira que rola (no computador rola só o <main>).
 */
export default function useTravaRolagem(ativa = true) {
    useEffect(() => {
        if (!ativa) return undefined;
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = antes; };
    }, [ativa]);
}
