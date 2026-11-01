import React from 'react';

/** The same day a month earlier or later; the 31st becomes that month's last day. */
export function shiftMonth(date, by) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + by);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

/** The month before or after, or in the list the week before or after. */
function stepped(currentDate, viewMode, by) {
  if (viewMode === 'month') return shiftMonth(currentDate, by);
  const d = new Date(currentDate);
  d.setDate(d.getDate() + 7 * by);
  return d;
}

export function CalendarToolbar({ viewMode, setViewMode, currentDate, setCurrentDate }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', marginRight: 16, alignItems: 'center', position: 'relative', zIndex: 5 }}>
          {/* View Toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--hairline)', marginRight: 12 }}>
            <button
              style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: viewMode === 'list' ? 'var(--ink)' : 'var(--ink-faint)', background: viewMode === 'list' ? 'var(--hairline)' : 'transparent' }}
              onClick={() => setViewMode('list')}
            >List</button>
            <button
              style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: viewMode === 'month' ? 'var(--ink)' : 'var(--ink-faint)', background: viewMode === 'month' ? 'var(--hairline)' : 'transparent' }}
              onClick={() => setViewMode('month')}
            >Month</button>
          </div>

          <button style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }} onClick={() => setCurrentDate(stepped(currentDate, viewMode, -1))}>Prev</button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', width: 60, textAlign: 'center', fontWeight: 600 }}>
            {currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
          <button style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }} onClick={() => setCurrentDate(stepped(currentDate, viewMode, 1))}>Next</button>
        </div>
  );
}
