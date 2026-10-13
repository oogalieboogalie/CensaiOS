import React from 'react';

// Who else is on this window: a name chip in their colour, and (for a window
// they selected or are dragging) an outline in that colour. `quiet` drops
// the chip and keeps only the outline.
export function RemoteWindowActor({ actor, quiet = false }) {
  if (!actor) return null;
  const color = actor.color || 'var(--accent)';
  return (
    <>
      {actor.outline && <div aria-hidden="true" data-testid="remote-window-outline" style={{
        position: 'absolute', inset: 0, zIndex: 29, pointerEvents: 'none',
        borderRadius: 'inherit', boxShadow: `inset 0 0 0 2px ${color}`,
      }} />}
      {!quiet && <div data-testid="remote-window-actor" style={{
        position: 'absolute', left: '50%', top: 5, zIndex: 30,
        transform: 'translateX(-50%)',
        padding: '3px 7px', borderRadius: 'var(--radius-full)',
        background: color, color: actor.color ? 'var(--on-fill)' : 'var(--surface)',
        boxShadow: 'var(--shadow-card)', whiteSpace: 'nowrap',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700,
        letterSpacing: '0.04em', pointerEvents: 'none',
      }}>
        {actor.label || `Member ${actor.id}`}
      </div>}
    </>
  );
}
