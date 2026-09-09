import React from 'react';

export function CalendarMonthView({ monthDays, groupedEvents, isToday, onSelectDate }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--hairline)', border: '1px solid var(--hairline)', borderRadius: 6, overflow: 'hidden' }}>
              {monthDays.map((day, i) => {
                if (!day) return <div key={`pad-${i}`} style={{ background: 'var(--surface-2)', minHeight: 60 }} />;
                const dayDateStr = day.toISOString().split('T')[0];
                const dayEvents = groupedEvents.find(g => g[0] === dayDateStr)?.[1] || [];
                return (
                  <div key={dayDateStr} onClick={() => onSelectDate(dayDateStr)} style={{ cursor: 'pointer', background: 'var(--surface)', minHeight: 60, maxHeight: 72, overflow: 'hidden', padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: isToday(day) ? 700 : 600,
                      color: isToday(day) ? 'var(--ps-red)' : 'var(--ink-soft)',
                      marginBottom: 2, paddingLeft: 2
                    }}>
                      {day.getDate()}
                    </span>
                    {dayEvents.map(ev => (
                      <a key={ev.id} onClick={(e) => e.preventDefault()} style={{
                        textDecoration: 'none', background: `${ev.color}22`, borderLeft: `2px solid ${ev.color}`,
                        padding: '2px 4px', borderRadius: '0 4px 4px 0', fontSize: 9, color: 'var(--ink)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }} title={`${ev.time}\n${ev.title}`}>
                        {ev.title}
                      </a>
                    ))}
                  </div>
                );
              })}
            </div>
  );
}
