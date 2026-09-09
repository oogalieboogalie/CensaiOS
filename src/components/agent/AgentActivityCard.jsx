import React from 'react';

const LABELS = {
  queued: 'Waking',
  in_progress: 'Working',
  waiting_children: 'Waiting on agents',
  notified: 'Message waiting',
  failed: 'Wake failed',
  idle: 'Idle',
};

export function AgentActivityCard({ activity }) {
  const active = activity.status !== 'idle';
  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: 10,
      border: '1px solid var(--hairline)',
      background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
      display: 'grid',
      gap: 3,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: active ? 'var(--accent)' : 'var(--ink-faint)',
      }}>
        {LABELS[activity.status] || activity.status}
        {activity.unread > 0 ? ` · ${activity.unread} unread` : ''}
      </div>
      {activity.detail && (
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activity.detail}
        </div>
      )}
    </div>
  );
}
