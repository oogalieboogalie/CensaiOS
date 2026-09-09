import React from 'react';

export function CalendarWeekHeader({ weekDays, viewMode, isToday }) {
  return (

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--hairline)', padding: '8px 0', background: 'var(--surface-2)' }}>
          {weekDays.map((d, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 600 }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              {viewMode === 'list' && (
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  fontSize: 12, fontWeight: isToday(d) ? 700 : 500,
                  color: isToday(d) ? 'white' : 'var(--ink)',
                  background: isToday(d) ? 'var(--ps-red)' : 'transparent'
                }}>
                  {d.getDate()}
                </span>
              )}
            </div>
          ))}
        </div>
  );
}
