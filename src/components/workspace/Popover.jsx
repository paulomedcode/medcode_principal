// ============================================================================
// Popover ancorado reutilizável (fecha ao clicar fora ou apertar Esc).
// Usado pelo editor de propriedade, filtros, ordenação e seletor de status.
// Renderiza via portal para não ser cortado por overflow das tabelas/kanban.
// ============================================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// eslint-disable-next-line react-refresh/only-export-components
export function useClickOutside(onClose, active = true) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose, active]);
  return ref;
}

// ----------------------------------------------------------------------------
// Pilha de popovers abertos (do mais antigo para o mais recente).
//
// Todo popover vai para o document.body via portal. Sem isto, um popover aberto
// DE DENTRO de outro (a paleta de cores dentro do menu da coluna) não é filho
// dele no DOM: o clique na cor era lido como "clique fora" pelo menu, que
// fechava e desmontava a paleta ANTES do onClick disparar — a cor nunca mudava.
//
// Regra: um popover só fecha por clique fora se o clique não caiu nele nem em
// nenhum popover aberto DEPOIS dele (seus filhos). Esc fecha só o do topo.
// ----------------------------------------------------------------------------
const pilha = [];

function registrarNaPilha(entrada) {
  pilha.push(entrada);
  return () => {
    const i = pilha.indexOf(entrada);
    if (i >= 0) pilha.splice(i, 1);
  };
}

/** O clique caiu neste painel ou em algum painel aberto depois dele? */
function cliqueEmMimOuNosMeusFilhos(entrada, alvo) {
  const i = pilha.indexOf(entrada);
  if (i < 0) return false;
  return pilha.slice(i).some((p) => p.el?.contains(alvo));
}

/**
 * Popover ancorado num elemento (anchorRef). align: 'left' | 'right'.
 * O conteúdo é `children`. Fecha via onClose (click-fora/Esc).
 */
const MARGEM = 8;  // respiro até a borda da janela
const GAP = 4;     // distância entre o gatilho e o painel

export default function Popover({ anchorRef, onClose, align = 'left', width = 260, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Fechar por clique fora / Esc, ciente do aninhamento (ver pilha acima).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const entrada = { el: panelRef.current, ancora: anchorRef?.current };
    const sair = registrarNaPilha(entrada);

    const onDown = (e) => {
      if (cliqueEmMimOuNosMeusFilhos(entrada, e.target)) return;
      // O próprio gatilho costuma alternar o popover no clique; fechar aqui
      // também faria abrir-e-fechar no mesmo gesto.
      if (entrada.ancora?.contains?.(e.target)) return;
      onCloseRef.current?.();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (pilha[pilha.length - 1] !== entrada) return; // só o do topo sai
      e.stopPropagation();
      onCloseRef.current?.();
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      sair();
    };
  }, [anchorRef]);
  // Altura natural, medida antes de aplicar maxHeight — reusá-la evita que o
  // painel encolha sozinho a cada recálculo.
  const alturaNatural = useRef(0);

  useLayoutEffect(() => {
    const el = anchorRef?.current;
    const panel = panelRef.current;
    if (!el || !panel) return;

    const calcular = () => {
      const r = el.getBoundingClientRect();
      if (!alturaNatural.current) alturaNatural.current = panel.offsetHeight;
      const altura = alturaNatural.current;

      // Última linha da tabela abre para CIMA: colado no rodapé, o painel
      // ficava metade fora da tela e não dava para escolher a opção.
      const abaixo = window.innerHeight - r.bottom - GAP - MARGEM;
      const acima = r.top - GAP - MARGEM;
      const cabeAbaixo = altura <= abaixo || abaixo >= acima;

      const maxHeight = Math.max(120, cabeAbaixo ? abaixo : acima);
      const top = cabeAbaixo ? r.bottom + GAP : Math.max(MARGEM, r.top - GAP - Math.min(altura, maxHeight));
      const left = align === 'right' ? r.right - width : r.left;

      // Medição de layout pós-montagem: setState aqui é o padrão correto.
      setPos({
        top,
        left: Math.max(MARGEM, Math.min(left, window.innerWidth - width - MARGEM)),
        maxHeight,
        acima: !cabeAbaixo,
      });
    };

    calcular();
    // Rolar ou redimensionar move a âncora: o painel acompanha.
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', calcular, true);
    return () => {
      window.removeEventListener('resize', calcular);
      window.removeEventListener('scroll', calcular, true);
    };
  }, [anchorRef, panelRef, align, width]);

  return createPortal(
    <div
      ref={panelRef}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width,
        maxHeight: pos?.maxHeight,
        // Primeiro render é só para medir a altura: fica invisível para não
        // piscar no canto da tela.
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={`fixed z-[1200] overflow-y-auto overscroll-contain bg-white rounded-xl border border-slate-200 shadow-xl ring-1 ring-black/5 ws-pop-in ${pos?.acima ? 'origin-bottom' : 'origin-top'}`}
    >
      {children}
    </div>,
    document.body
  );
}
