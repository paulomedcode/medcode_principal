// ============================================================================
// Sincronização das linhas de um database do Compromisso.
//
// Um mesmo banco aparece em vários lugares ao mesmo tempo: a tabela da página,
// um calendário logo acima dela (bloco vinculado), o quadro de outra página, a
// aba do colega. Antes, cada um desses lugares carregava os dados uma vez e
// congelava — criar uma tarefa no calendário não a fazia surgir na tabela um
// palmo abaixo, nem depois de um minuto.
//
// Duas frentes, o mesmo formato de evento nas duas:
//
//   LOCAL  — instâncias da MESMA aba conversam por memória, sem rede: quem
//            edita chama `emit()` e as outras reagem no mesmo quadro. É o que
//            faz a tabela e o calendário da mesma página andarem juntos.
//   REMOTO — `postgres_changes` do Supabase para as outras abas e os outros
//            usuários (ver migration 20260731150000_workspace_realtime).
//
// O canal é UM por database, compartilhado por contagem de referências: dois
// blocos do mesmo banco na mesma página não abrem duas assinaturas.
//
// Formato do evento: { table, eventType, new, old, values? }, igual ao payload
// do Supabase — assim quem consome trata local e remoto com o mesmo código.
// `values` é um extra do caminho local (linha nova já com os valores dela),
// que no remoto chegaria como eventos separados de `workspace_db_values`.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';

// databaseId -> { listeners: Set<fn>, channel }
const registry = new Map();

function fanout(databaseId, evt, except) {
  const entry = registry.get(databaseId);
  if (!entry) return;
  entry.listeners.forEach((fn) => { if (fn !== except) { try { fn(evt); } catch (e) { console.error(e); } } });
}

function subscribe(databaseId, fn) {
  let entry = registry.get(databaseId);
  if (!entry) {
    entry = { listeners: new Set(), channel: null };
    registry.set(databaseId, entry);
    const relay = (p) => fanout(databaseId, { table: p.table, eventType: p.eventType, new: p.new, old: p.old });
    entry.channel = supabase
      .channel(`ws_db_${databaseId}`)
      // Linhas do database. O filtro no servidor não é economia à toa: o evento
      // de `workspace_pages` sai com a linha inteira, `content` inclusive, e sem
      // ele todo mundo receberia o texto das páginas que os outros escrevem.
      // (Efeito colateral do filtro: o DELETE físico de uma linha não chega,
      // porque o registro antigo do WAL só traz a chave primária — sem
      // `parent_id` não há como o filtro casar. Não é problema: excluir uma
      // tarefa manda para a lixeira, o que é um UPDATE de `deleted_at`.)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_pages', filter: `parent_id=eq.${databaseId}` }, relay)
      // Valores não têm por onde filtrar (a linha só conhece o `row_id`), mas o
      // payload é minúsculo e quem não reconhece o `row_id` ignora.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_db_values' }, relay)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_db_properties', filter: `database_id=eq.${databaseId}` }, relay)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_db_views', filter: `database_id=eq.${databaseId}` }, relay)
      .subscribe();
  }
  entry.listeners.add(fn);

  return () => {
    entry.listeners.delete(fn);
    if (entry.listeners.size === 0) {
      supabase.removeChannel(entry.channel);
      registry.delete(databaseId);
    }
  };
}

/**
 * @param {string} databaseId
 * @param {(evt) => void} onEvent  chamado para cada mudança vinda de fora
 *                                 (outra visão da mesma aba, outra aba, outro usuário)
 * @returns {(evt) => void} emit — avisa as OUTRAS instâncias desta aba
 */
export function useDatabaseSync(databaseId, onEvent) {
  const cbRef = useRef(onEvent);
  useEffect(() => { cbRef.current = onEvent; }, [onEvent]);

  // Identidade estável (criada uma vez, via useState): é ela que o fanout usa
  // para não devolver ao emissor o eco da própria edição.
  const [self] = useState(() => (evt) => cbRef.current?.(evt));

  useEffect(() => {
    if (!databaseId) return undefined;
    return subscribe(databaseId, self);
  }, [databaseId, self]);

  return useCallback((evt) => {
    if (!databaseId) return;
    fanout(databaseId, evt, self);
  }, [databaseId, self]);
}
