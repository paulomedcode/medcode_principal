// ============================================================================
// Visão Calendário — mês/semana/dia/agenda + arrastar para remarcar.
//
// Vive em arquivo separado DE PROPÓSITO: react-big-calendar + date-fns + CSS
// pesam bastante, e a maioria das aberturas do Compromisso não usa calendário.
// O DatabaseView importa este módulo com React.lazy, então o custo só aparece
// para quem realmente abre a visão de calendário.
// ============================================================================
import { useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import '../../styles/calendar.css';

const localizer = dateFnsLocalizer({
  format, parse, getDay, locales: { 'pt-BR': ptBR },
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
});
const DnDCalendar = withDragAndDrop(Calendar);

const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toHHMM = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Tarefa dentro da célula do dia.
 *
 * O padrão da biblioteca é uma linha só com reticências — "Alinhar com Marcos
 * Plantõ…" não diz nada. Aqui o nome quebra em DUAS linhas (o corte fica no
 * CSS, .ws-ev-titulo) com a letra bem menor, então cabe o nome inteiro da
 * maioria das tarefas sem gastar mais altura da célula do que antes.
 */
function EventoCompacto({ event }) {
  return (
    <span className="ws-ev" title={`${event.hora ? `${event.hora} · ` : ''}${event.title}`}>
      {event.hora && <span className="ws-ev-hora">{event.hora}</span>}
      <span className="ws-ev-titulo">{event.title}</span>
    </span>
  );
}

// Semana/dia já mostram a faixa de horário na lateral: repetir a hora dentro da
// pílula só rouba espaço do nome.
function EventoDaFaixa({ event }) {
  return <span className="ws-ev"><span className="ws-ev-titulo">{event.title}</span></span>;
}

const COMPONENTES = {
  event: EventoCompacto,
  week: { event: EventoDaFaixa },
  day: { event: EventoDaFaixa },
  agenda: { event: EventoDaFaixa },  // a agenda já tem coluna de hora
};

export default function CalendarBoard({ rows, props, datePropId, onCell, onAddRow, onOpenRow }) {
  const dateProp = useMemo(() => props.find((p) => p.id === datePropId) || props.find((p) => p.type === 'date'), [props, datePropId]);
  const timeProp = useMemo(
    () => props.find((p) => p.type === 'time')
      || props.find((p) => p.name.toLowerCase() === 'hora')
      || props.find((p) => p.type === 'text' && /hora|hor[aá]rio/i.test(p.name)),
    [props]
  );

  const events = useMemo(() => {
    if (!dateProp) return [];
    return rows.filter((r) => r.values[dateProp.id]).map((r) => {
      const dateStr = r.values[dateProp.id];
      const timeStr = timeProp ? r.values[timeProp.id] : null;
      const start = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
      const end = timeStr ? new Date(start.getTime() + 60 * 60 * 1000) : start;
      return {
        id: r.id,
        title: r.title || 'Sem título',
        hora: timeStr ? String(timeStr).substring(0, 5) : null,
        start, end, allDay: !timeStr,
      };
    });
  }, [rows, dateProp, timeProp]);

  const onEventDrop = useCallback(({ event, start, allDay }) => {
    onCell(event.id, dateProp.id, toLocalISO(start));
    if (timeProp) onCell(event.id, timeProp.id, allDay ? null : toHHMM(start));
  }, [onCell, dateProp, timeProp]);

  if (!dateProp) {
    return <div className="py-12 text-center text-slate-400 text-[13px] font-semibold max-w-sm mx-auto">Defina uma propriedade do tipo data para usar o calendário (barra acima → Data).</div>;
  }

  return (
    // Altura pela tela, não fixa: num monitor grande o mês inteiro respira e
    // cabem mais tarefas por dia; num notebook não estoura a dobra.
    <div className="ws-calendar bg-white dark:bg-slate-900/40 border border-slate-200/90 dark:border-slate-700/70 rounded-xl p-2" style={{ height: 'clamp(520px, 82vh, 1040px)' }}>
      <DnDCalendar
        localizer={localizer}
        events={events}
        components={COMPONENTES}
        style={{ height: '100%', width: '100%' }}
        startAccessor="start" endAccessor="end"
        views={['month', 'week', 'day', 'agenda']}
        defaultView="month"
        culture="pt-BR"
        popup
        dayLayoutAlgorithm="no-overlap"
        messages={{ next: '›', previous: '‹', today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', agenda: 'Agenda', date: 'Data', time: 'Hora', event: 'Tarefa', noEventsInRange: 'Nada neste período.', showMore: (n) => `+${n}` }}
        selectable
        resizable
        onEventDrop={onEventDrop}
        onEventResize={onEventDrop}
        onSelectEvent={(ev) => onOpenRow(ev.id)}
        onSelectSlot={(slot) => {
          const preset = { [dateProp.id]: toLocalISO(slot.start) };
          if (timeProp && slot.slots && slot.start.getHours() !== 0) preset[timeProp.id] = toHHMM(slot.start);
          onAddRow(preset);
        }}
      />
    </div>
  );
}
