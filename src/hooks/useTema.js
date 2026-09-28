// ============================================================================
// Tema claro/escuro.
//
// Liga/desliga a classe `dark` no <html> e guarda a escolha no localStorage.
// Sem escolha salva, segue a preferência do sistema operacional.
//
// O Tailwind v4 deste projeto usa config em CSS: a variante `dark` está
// declarada em src/index.css (@custom-variant), apontando para essa classe.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';

const CHAVE = 'medcode-tema';

function preferido() {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === 'dark' || salvo === 'light') return salvo;
  } catch { /* ignore */ }
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
}

function aplicar(tema) {
  try {
    document.documentElement.classList.toggle('dark', tema === 'dark');
    document.documentElement.style.colorScheme = tema;
  } catch { /* ignore */ }
}

// Aplica antes do React montar, para não piscar branco ao recarregar.
aplicar(preferido());

export default function useTema() {
  const [tema, setTema] = useState(preferido);

  useEffect(() => { aplicar(tema); }, [tema]);

  const alternar = useCallback(() => {
    setTema((t) => {
      const novo = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(CHAVE, novo); } catch { /* ignore */ }
      return novo;
    });
  }, []);

  return { tema, escuro: tema === 'dark', alternar };
}
