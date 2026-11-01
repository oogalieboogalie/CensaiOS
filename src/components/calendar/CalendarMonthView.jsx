import { localDay } from '../../lib/schedule/plainWords.js';

const SHOWN = 2;
const dayName = (day) => day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const count = (n) => (n === 0 ? 'nothing on' : n === 1 ? '1 event' : `${n} events`);

// The month as a grid of days, shown whether or not anything is on it. Each
// day is a button that opens it; a day with more events than fit says how
// many more there are.
export function CalendarMonthView({ monthDays, groupedEvents, isToday, onSelectDate }) {
  return (
    <div className="hb-cal-month">
      {monthDays.map((day, i) => {
        if (!day) return <div key={`pad-${i}`} className="hb-cal-pad" aria-hidden="true" />;
        const dayDateStr = localDay(day);
        const dayEvents = groupedEvents.find((g) => g[0] === dayDateStr)?.[1] || [];
        const more = dayEvents.length - SHOWN;
        return (
          <button
            key={dayDateStr}
            type="button"
            className="hb-cal-day-cell"
            data-day={dayDateStr}
            data-today={isToday(day) ? 'true' : undefined}
            aria-current={isToday(day) ? 'date' : undefined}
            aria-label={`${dayName(day)}, ${count(dayEvents.length)}`}
            onClick={() => onSelectDate(dayDateStr)}
          >
            <span className="hb-cal-day-num">{day.getDate()}</span>
            {dayEvents.slice(0, SHOWN).map((ev) => (
              <span key={ev.key} className="hb-cal-chip" data-source={ev.source} data-lines={dayEvents.length === 1 ? 2 : 1} style={{ '--chip': ev.color }} title={`${ev.time}\n${ev.title}`}>
                {ev.title}
              </span>
            ))}
            {more > 0 && <span className="hb-cal-more">+{more} more</span>}
          </button>
        );
      })}
    </div>
  );
}
