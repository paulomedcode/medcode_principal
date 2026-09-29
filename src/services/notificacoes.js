// ============================================================================
// Notificações do Compromisso.
//
// Duas origens:
//   • NOVO workspace — linhas de database com uma coluna do tipo "pessoa"
//     apontando para o usuário. É assim que uma tarefa "fica atribuída" a
//     alguém. Data/Hora vêm das colunas de data e de hora do mesmo database.
//   • agenda_pessoal (legado) — enquanto houver lembretes antigos gravados.
//
// Tudo aqui é leitura. Quem decide som/vibração/dedupe é o hook useNotificacoes.
// ============================================================================
import { supabase } from './supabase';

/** 'YYYY-MM-DD' de hoje no fuso local (sem o salto do toISOString/UTC). */
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Junta 'YYYY-MM-DD' + 'HH:MM' num Date local. Sem hora, assume 08:00. */
export function montarDataHora(dataISO, hora) {
  if (!dataISO) return null;
  const [h, m] = (hora || '08:00').split(':');
  const [y, mo, d] = String(dataISO).split('-').map(Number);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, Number(h) || 0, Number(m) || 0, 0, 0);
}

/**
 * Tarefas do novo Compromisso atribuídas a `userId`.
 * Devolve [{ id, titulo, dataISO, hora, quando, databaseId, origem:'workspace' }].
 * Silencioso: se as tabelas ainda não existirem neste banco, devolve [].
 */
export async function tarefasAtribuidas(userId) {
  if (!userId) return [];

  // 1) Colunas do tipo "pessoa" (é o que amarra uma linha a um usuário).
  //    `options` vem junto para saber o nome do status de cada tarefa — é o que
  //    permite calar o sino sobre o que já foi concluído.
  const { data: props, error: pErr } = await supabase
    .from('workspace_db_properties')
    .select('id, database_id, name, type, options');
  if (pErr) return [];

  const pessoaIds = (props || []).filter((p) => p.type === 'person').map((p) => p.id);
  if (!pessoaIds.length) return [];

  // 2) Valores dessas colunas. O filtro por usuário é no cliente porque
  //    `value` é jsonb e a comparação direta via PostgREST é frágil.
  const { data: vals, error: vErr } = await supabase
    .from('workspace_db_values')
    .select('row_id, property_id, value')
    .in('property_id', pessoaIds);
  if (vErr) return [];

  const meus = (vals || []).filter((v) => {
    const raw = typeof v.value === 'string' ? v.value : v.value?.toString?.();
    return raw === userId;
  });
  if (!meus.length) return [];

  const rowIds = [...new Set(meus.map((v) => v.row_id))];

  // 3) As linhas (páginas) — só as vivas.
  const { data: rows, error: rErr } = await supabase
    .from('workspace_pages')
    .select('id, title, parent_id')
    .in('id', rowIds)
    .is('deleted_at', null);
  if (rErr || !rows?.length) return [];

  // 4) Data/hora: descobre as colunas certas de cada database envolvido.
    const dbIds = [...new Set(rows.map((r) => r.parent_id).filter(Boolean))];
  const propsPorDb = new Map();
  dbIds.forEach((id) => {
    const doDb = (props || []).filter((p) => p.database_id === id);
    propsPorDb.set(id, {
      // O lembrete é sobre o PRAZO. Com duas datas na tarefa (criação e
      // expectativa de conclusão), avisar pela data de cadastro faria o sino
      // tocar no dia em que a tarefa nasceu — inútil.
      data: doDb.find((p) => p.type === 'date' && /expectativa|conclus|prazo|vencimento|entrega/i.test(p.name))
        || doDb.find((p) => p.type === 'date' && !/cria[çc]/i.test(p.name))
        || doDb.find((p) => p.type === 'date')
        || null,
      hora: doDb.find((p) => p.type === 'time') || doDb.find((p) => /hora|hor[aá]rio/i.test(p.name)) || null,
      status: doDb.find((p) => p.type === 'status' || p.type === 'select') || null,
    });
  });

  const idsDeInteresse = [];
  propsPorDb.forEach((p) => { [p.data, p.hora, p.status].forEach((x) => x && idsDeInteresse.push(x.id)); });

  let valoresLinha = new Map();
  if (idsDeInteresse.length) {
    const { data: dv } = await supabase
      .from('workspace_db_values')
      .select('row_id, property_id, value')
      .in('row_id', rowIds)
      .in('property_id', idsDeInteresse);
    (dv || []).forEach((v) => {
      const m = valoresLinha.get(v.row_id) || {};
      m[v.property_id] = v.value;
      valoresLinha.set(v.row_id, m);
    });
  }

  return rows
    .map((r) => {
      const cfg = propsPorDb.get(r.parent_id) || {};
      const vs = valoresLinha.get(r.id) || {};
      const dataISO = cfg.data ? vs[cfg.data.id] || null : null;
      const hora = cfg.hora ? vs[cfg.hora.id] || null : null;

      // Tarefa concluída (ou cancelada) não tem por que continuar cutucando o
      // sino: o aviso ficaria para sempre, já que ele só sai quando a pessoa
      // abre a tarefa.
      const optStatus = cfg.status
        ? (cfg.status.options || []).find((o) => o.id === vs[cfg.status.id])
        : null;
      if (optStatus && /conclu|feito|final|cancel|arquiv/i.test(optStatus.name || '')) return null;

      return {
        id: `ws:${r.id}`,
        rowId: r.id,
        titulo: r.title || 'Sem título',
        dataISO,
        hora: hora ? String(hora).substring(0, 5) : null,
        quando: montarDataHora(dataISO, hora),
        databaseId: r.parent_id,
        origem: 'workspace',
      };
    })
    .filter(Boolean);
}

/**
 * Menções (@fulano) ainda não lidas: alguém marcou o usuário dentro de uma
 * página ou de uma tarefa. Devolve já com o título da página e o nome de quem
 * marcou, prontos para o sino.
 * Silencioso: banco sem a tabela ainda (migration 20260731180000) devolve [].
 */
export async function mencoesNaoLidas(userId) {
  if (!userId) return [];
  try {
    const { data: mencoes, error } = await supabase
      .from('workspace_mentions')
      .select('id, page_id, autor_id, criado_em')
      .eq('user_id', userId)
      .is('lida_em', null)
      .order('criado_em', { ascending: false })
      .limit(20);
    if (error || !mencoes?.length) return [];

    const [{ data: pages }, { data: autores }] = await Promise.all([
      supabase.from('workspace_pages').select('id, title, parent_id')
        .in('id', [...new Set(mencoes.map((m) => m.page_id))])
        .is('deleted_at', null),
      supabase.from('users').select('id, name')
        .in('id', [...new Set(mencoes.map((m) => m.autor_id).filter(Boolean))]),
    ]);

    const porPagina = new Map((pages || []).map((p) => [p.id, p]));
    const porAutor = new Map((autores || []).map((u) => [u.id, u.name]));

    return mencoes
      // Página excluída no meio do caminho: o aviso perdeu o assunto.
      .filter((m) => porPagina.has(m.page_id))
      .map((m) => ({
        id: `mc:${m.id}`,
        mencaoId: m.id,
        titulo: porPagina.get(m.page_id).title || 'Sem título',
        autor: porAutor.get(m.autor_id) || null,
        pageId: m.page_id,
        dataISO: null,
        hora: null,
        quando: null,
        origem: 'mencao',
      }));
  } catch {
    return [];
  }
}

/**
 * Lembretes do sistema antigo (agenda_pessoal) que ainda estejam na janela de
 * alerta. Mantido para não sumir com o que já estava agendado.
 */
export async function lembretesLegado(currentUser) {
  if (!currentUser?.id) return [];
  try {
    let q = supabase
      .from('agenda_pessoal')
      .select('id, texto, data_agendada, hora_agendada, alerta_minutos, agenda_categorias(nome, cor)')
      .gte('data_agendada', hojeISO())
      .eq('concluido', false)
      .not('alerta_minutos', 'is', null)
      .not('hora_agendada', 'is', null);

    // Lembrete da agenda pessoal é de quem é dono ou de quem o criou.
    q = q.or(`user_id.eq.${currentUser.id},autor_id.eq.${currentUser.id}`);

    const { data, error } = await q;
    if (error || !data) return [];

    const agora = new Date();
    return data
      .map((t) => {
        const quando = montarDataHora(t.data_agendada, t.hora_agendada);
        if (!quando) return null;
        const alerta = new Date(quando.getTime() - (t.alerta_minutos || 0) * 60000);
        const limite = new Date(quando.getTime() + 2 * 60 * 60000); // some 2h depois
        if (agora < alerta || agora > limite) return null;
        return {
          id: `ag:${t.id}`,
          titulo: t.texto,
          dataISO: t.data_agendada,
          hora: String(t.hora_agendada).substring(0, 5),
          quando,
          cor: t.agenda_categorias?.cor || null,
          origem: 'agenda',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Quantos minutos antes o lembrete de horário começa a aparecer.
export const ANTECEDENCIA_MIN = 30;

/**
 * Monta a lista final exibida no sino, já classificada:
 *   tipo 'mencao'     → alguém me marcou com @
 *   tipo 'atribuicao' → tarefa atribuída a mim que ainda não abri
 *   tipo 'lembrete'   → está na hora (ou passou há pouco)
 *
 * `lidas` = Set de ids que a pessoa JÁ ABRIU. É esse o critério de sumir da
 * lista — não "já apareceu na tela". Abrir o sino conta quantas coisas há;
 * quem tira o aviso dali é abrir a tarefa (ou dispensar na mão).
 */
export function montarNotificacoes({ tarefas, legado, mencoes = [], lidas }) {
  const agora = new Date();
  const out = [];
  const jaLi = (id) => !!lidas?.has?.(id);

  // Menção também some do banco (lida_em) quando aberta; o Set cobre o tempo
  // entre o clique e a próxima varredura.
  mencoes.forEach((m) => { if (!jaLi(m.id)) out.push({ ...m, tipo: 'mencao' }); });

  tarefas.forEach((t) => {
    if (jaLi(t.id)) return;
    if (t.quando) {
      const inicioAlerta = new Date(t.quando.getTime() - ANTECEDENCIA_MIN * 60000);
      const limite = new Date(t.quando.getTime() + 2 * 60 * 60000);
      // Na janela do horário vira lembrete; fora dela continua valendo como
      // tarefa atribuída em aberto (inclusive depois do prazo — sumir sozinha
      // seria justamente perder de vista o que atrasou).
      out.push({ ...t, tipo: (agora >= inicioAlerta && agora <= limite) ? 'lembrete' : 'atribuicao' });
      return;
    }
    out.push({ ...t, tipo: 'atribuicao' });
  });

  legado.forEach((l) => { if (!jaLi(l.id)) out.push({ ...l, tipo: 'lembrete' }); });

  // Primeiro o que tem hora marcada, depois quem falou comigo, por último o que
  // só foi atribuído. Dentro do mesmo tipo, o mais próximo no tempo na frente
  // (o sort é estável, então as menções mantêm a ordem em que vieram: recentes
  // primeiro).
  const PESO = { lembrete: 0, mencao: 1, atribuicao: 2 };
  out.sort((a, b) => (
    (PESO[a.tipo] ?? 9) - (PESO[b.tipo] ?? 9)
    || (a.quando?.getTime() || Infinity) - (b.quando?.getTime() || Infinity)
  ));
  return out;
}
