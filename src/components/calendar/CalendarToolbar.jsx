import React from 'react';

export function CalendarToolbar({ viewMode, setViewMode, currentDate, setCurrentDate }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', marginRight: 16, alignItems: 'center', position: 'relative', zIndex: 5 }}>
          {/* View Toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--hairline)', marginRight: 12 }}>
            <button
              style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', fontSize: 10, fontWeight: 600, color: viewMode === 'list' ? 'var(--ink)' : 'var(--ink-faint)', background: viewMode === 'list' ? 'var(--hairline)' : 'transparent' }}
              onClick={() => setViewMode('list')}
            >List</button>
            <button
              style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', fontSize: 10, fontWeight: 600, color: viewMode === 'month' ? 'var(--ink)' : 'var(--ink-faint)', background: viewMode === 'month' ? 'var(--hairline)' : 'transparent' }}
              onClick={() => setViewMode('month')}
            >Month</button>
          </div>

          <button style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-faint)' }} onClick={() => {
            const d = new Date(currentDate);
            if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
            else d.setDate(d.getDate() - 7);
            setCurrentDate(d);
          }}>Prev</button>
          <span style={{ fontSize: 11, color: 'var(--ink)', width: 60, textAlign: 'center', fontWeight: 600 }}>
            {currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
          <button style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-faint)' }} onClick={() => {
            const d = new Date(currentDate);
            if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
            else d.setDate(d.getDate() + 7);
            setCurrentDate(d);
          }}>Next</button>
        </div>
  );
}
