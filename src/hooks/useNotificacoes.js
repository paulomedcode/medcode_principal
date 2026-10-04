// ============================================================================
// Hook das notificações do sino (Topbar).
//
// Busca as tarefas atribuídas ao usuário (novo Compromisso), as menções (@) e
// os lembretes do sistema antigo.
//
// Como o aviso se comporta:
//   • ao entrar no sistema, se já houver coisa pendente: som, vibração e o sino
//     destacado — é o "olha aqui" de quem acabou de logar;
//   • a contagem no sino NÃO some por abrir o sino: ela fica até a pessoa abrir
//     a tarefa (ou dispensar na mão). Quem some sozinho é o que foi concluído;
//   • a cada 30 minutos, havendo pendência, toca e vibra de novo — insistência
//     na dose certa, sem virar barulho de minuto em minuto;
//   • novidade que chega no meio do caminho avisa na hora.
//
// O que a pessoa já abriu fica guardado no aparelho (localStorage), então o
// aviso não volta a cada F5. Menção também é marcada como lida no banco, para
// valer em todos os aparelhos dela.
//
// O som é sintetizado na hora (WebAudio), sem arquivo de áudio: dois tons
// curtos e baixos, tipo um "ding" discreto.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  tarefasAtribuidas, lembretesLegado, mencoesNaoLidas, montarNotificacoes,
} from '../services/notificacoes';
import { marcarMencoesLidas } from '../services/workspace';

const INTERVALO_MS = 60000;           // varre a cada 1 min
const REPETIR_AVISO_MS = 30 * 60000;  // insiste a cada 30 min enquanto houver pendência
const CHAVE_LIDAS = 'medcode-notif-lidas';
const CHAVE_SOM = 'medcode-notif-som';    // '0' desliga o som

const lerLidas = () => {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_LIDAS) || '[]')); }
  catch { return new Set(); }
};
const gravarLidas = (set) => {
  try { localStorage.setItem(CHAVE_LIDAS, JSON.stringify([...set].slice(-300))); }
  catch { /* ignore */ }
};

export const somLigado = () => {
  try { return localStorage.getItem(CHAVE_SOM) !== '0'; } catch { return true; }
};
export const definirSom = (ligado) => {
  try { localStorage.setItem(CHAVE_SOM, ligado ? '1' : '0'); } catch { /* ignore */ }
};

/** "Ding" curto e suave via WebAudio (sem asset). Falha em silêncio. */
export function tocarAviso() {
  if (!somLigado()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const agora = ctx.currentTime;
    // Duas notas suaves (lá e mi acima), volume baixo e decaimento rápido.
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = agora + i * 0.14;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
    setTimeout(() => ctx.close?.(), 1200);
  } catch { /* navegador bloqueou áudio: segue sem som */ }
}

/**
 * O navegador só deixa vibrar/tocar som depois que a pessoa tocou na página;
 * antes disso a chamada é recusada e enche o console de erro. O sino continua
 * balançando de qualquer jeito.
 */
const jaInteragiu = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;

/** Vibração curta (só faz efeito em celular). */
function vibrar() {
  if (!jaInteragiu()) return;
  try { navigator.vibrate?.([90, 60, 90]); } catch { /* ignore */ }
}

export default function useNotificacoes(currentUser) {
  const [notificacoes, setNotificacoes] = useState([]);
  const [pulsando, setPulsando] = useState(false);   // anima o sino
  const lidasRef = useRef(lerLidas());
  const ultimoAvisoRef = useRef(0);                  // quando tocou pela última vez
  // Ids já anunciados NESTA sessão. Não vai para o localStorage de propósito:
  // ao entrar no sistema tudo é novidade outra vez, que é o aviso de boas-vindas
  // pedido ("logou e tem coisa te esperando").
  const avisadasRef = useRef(new Set());

  // Chama a atenção: sino balançando + som + vibração.
  const avisar = useCallback(() => {
    ultimoAvisoRef.current = Date.now();
    if (jaInteragiu()) tocarAviso();
    vibrar();
    setPulsando(true);
    setTimeout(() => setPulsando(false), 6000);
  }, []);

  const varrer = useCallback(async () => {
    if (!currentUser?.id) { setNotificacoes([]); return; }
    try {
      const [tarefas, legado, mencoes] = await Promise.all([
        tarefasAtribuidas(currentUser.id),
        lembretesLegado(currentUser),
        mencoesNaoLidas(currentUser.id),
      ]);
      const lista = montarNotificacoes({ tarefas, legado, mencoes, lidas: lidasRef.current });
      setNotificacoes(lista);

      if (!lista.length) { ultimoAvisoRef.current = 0; return; }

      // Novidade avisa na hora; o resto espera a vez dos 30 minutos.
      const novas = lista.filter((n) => !avisadasRef.current.has(n.id));
      novas.forEach((n) => avisadasRef.current.add(n.id));
      if (novas.length || Date.now() - ultimoAvisoRef.current >= REPETIR_AVISO_MS) avisar();
    } catch (e) {
      console.error('Erro ao buscar notificações', e);
    }
  }, [currentUser, avisar]);

  useEffect(() => {
    // Busca inicial + varredura periódica (efeito de sincronização com o banco).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    varrer();
    const t = setInterval(varrer, INTERVALO_MS);
    return () => clearInterval(t);
  }, [varrer]);

  /** Só apaga o destaque do sino (abrir o painel não conta como "li"). */
  const pararPulso = useCallback(() => setPulsando(false), []);

  /**
   * Tira UM aviso da lista: é o que acontece ao abrir a tarefa pelo sino (ou ao
   * dispensar). Menção também é marcada no banco, para não voltar em outro
   * aparelho.
   */
  const marcarLida = useCallback((n) => {
    if (!n?.id) return;
    lidasRef.current.add(n.id);
    gravarLidas(lidasRef.current);
    setNotificacoes((lista) => lista.filter((x) => x.id !== n.id));
    if (n.tipo === 'mencao' && n.mencaoId) marcarMencoesLidas([n.mencaoId]);
  }, []);

  /** Dispensa tudo de uma vez (o "limpar" do painel). */
  const marcarTodasLidas = useCallback(() => {
    const mencoes = [];
    notificacoes.forEach((n) => {
      lidasRef.current.add(n.id);
      if (n.tipo === 'mencao' && n.mencaoId) mencoes.push(n.mencaoId);
    });
    gravarLidas(lidasRef.current);
    setNotificacoes([]);
    setPulsando(false);
    if (mencoes.length) marcarMencoesLidas(mencoes);
  }, [notificacoes]);

  return { notificacoes, pulsando, recarregar: varrer, pararPulso, marcarLida, marcarTodasLidas };
}
