// Data de HOJE em horário local, como 'YYYY-MM-DD'.
// Evita o salto de dia do new Date().toISOString() (que usa UTC e, em BRT/UTC-3,
// vira o dia seguinte das 21h às 23h59) — causa clássica de "venceu/agendou no dia errado".
// Formata um objeto Date como 'YYYY-MM-DD' em horário LOCAL (não UTC).
// new Date(...).toISOString() converte para UTC e, em fusos a leste/oeste,
// pode saltar o dia — use esta função para gerar datas-string consistentes.
export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

// Formata uma data 'YYYY-MM-DD' (coluna DATE do banco) como 'DD/MM/YYYY' sem
// passar por new Date(): este interpreta a string como meia-noite UTC e, em BRT
// (UTC-3), exibe o dia anterior. Causa do bug "marquei 25, aparece 24".
// Para valores com hora (timestamp) cai no toLocaleDateString normal.
export function formatDateBR(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).slice(0, 10));
  if (m && String(value).length <= 10) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(value).toLocaleDateString('pt-BR');
}

// Mês ANTERIOR ao atual como 'YYYY-MM' (horário local) — padrão de competência:
// normalmente o que se lança/concilia hoje refere-se ao mês que fechou.
export function prevMonthISO() {
  const d = new Date();
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
}
