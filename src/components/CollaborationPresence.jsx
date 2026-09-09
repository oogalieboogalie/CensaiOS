import React from 'react';

const STATUS_LABELS = {
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  live: 'Live',
  offline: 'Offline',
};

export function CollaborationPresence({ collaboration, focusMode = false, onShare }) {
  const participants = collaboration.participants || [];
  const live = collaboration.status === 'live';
  return (
    <div data-testid="collaboration-presence" style={{
      position: 'fixed', right: 18, bottom: 16, zIndex: 45,
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '6px 9px', borderRadius: 999,
      border: '1px solid var(--hairline)', background: 'var(--surface)',
      boxShadow: 'var(--shadow-card)', color: 'var(--ink-soft)',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      opacity: focusMode ? 0 : 0.92, transition: 'opacity 0.3s',
      pointerEvents: focusMode ? 'none' : 'auto',
    }}>
      <span aria-hidden="true" style={{
        width: 7, height: 7, borderRadius: '50%',
        background: live ? 'var(--ps-green)' : 'var(--ink-faint)',
        boxShadow: live ? '0 0 0 3px var(--accent-soft)' : 'none',
      }} />
      <span>{STATUS_LABELS[collaboration.status] || 'Offline'}</span>
      {live && <span style={{ color: 'var(--ink-faint)' }}>· {participants.length}</span>}
      {onShare && (
        <button type="button" onClick={onShare} style={{ border: 0, borderRadius: 999, padding: '4px 7px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>
          Share
        </button>
      )}
      {participants.slice(0, 3).map((participant) => (
        <span key={participant.clientId} title={participant.actor?.label} style={{
          width: 20, height: 20, display: 'grid', placeItems: 'center',
          borderRadius: '50%', background: 'var(--accent-soft)',
          color: 'var(--accent-ink)', fontWeight: 700,
        }}>
          {(participant.actor?.label || '?').replace('Member ', '').slice(0, 2)}
        </span>
      ))}
      {collaboration.lastActivity?.label && (
        <span style={{ color: 'var(--accent-ink)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          · {collaboration.lastActivity.label}
        </span>
      )}
    </div>
  );
}
