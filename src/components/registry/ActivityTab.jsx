// src/components/registry/ActivityTab.jsx
// D4 RegistryWindow tab 4 — live WS feed of events from installed cards.

import React from 'react';

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function ActivityTab({ events }) {
  if (!events || events.length === 0) {
    return (
      <div data-testid="registry-activity-empty" style={{ padding: 18, color: 'var(--ink-faint)', fontSize: 12, textAlign: 'center', border: '1px dashed var(--hairline)', borderRadius: 8, margin: 12 }}>
        No activity yet. Calls on installed cards will stream here in real time.
      </div>
    );
  }
  // Newest first.
  const reversed = events.slice().reverse();
  return (
    <div data-testid="registry-activity-list" style={{ padding: 12, display: 'grid', gap: 6, flex: 1, minHeight: 0, overflow: 'auto' }}>
      {reversed.map((ev, i) => (
        <div
          key={`${ev.taskId || 'no-task'}-${events.length - i}`}
          data-testid="registry-activity-row"
          data-event-type={ev.type}
          style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 8px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}
        >
          <span style={{ color: 'var(--ink-faint)' }}>{fmtTime(ev.ts)}</span>
          <span style={{ color: 'var(--ink)' }}>
            <strong>{ev.type}</strong>{' '}
            {ev.cardId && <span style={{ color: 'var(--ink-soft)' }}>· {ev.cardId}</span>}
            {ev.stage && <span style={{ color: 'var(--ink-faint)' }}>· {ev.stage}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}