import React from 'react';

export function RemoteWindowActor({ actor }) {
  if (!actor) return null;
  return (
    <div data-testid="remote-window-actor" style={{
      position: 'absolute', left: '50%', top: 5, zIndex: 30,
      transform: 'translateX(-50%)',
      padding: '3px 7px', borderRadius: 999,
      background: 'var(--accent)', color: 'var(--surface)',
      boxShadow: 'var(--shadow-card)', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.04em', pointerEvents: 'none',
    }}>
      {actor.label || `Member ${actor.id}`}
    </div>
  );
}
