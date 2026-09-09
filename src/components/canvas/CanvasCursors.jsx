import React from 'react';

function cursorColor(clientId) {
  let hash = 0;
  for (const ch of String(clientId)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 80% 55%)`;
}

/**
 * Remote live cursors in canvas coordinates. Pure presentational —
 * positions stream in via the collaboration socket, no persistence.
 */
export function CanvasCursors({ cursors = {}, zoom = 1 }) {
  const entries = Object.values(cursors).filter(
    (c) => Number.isFinite(c?.x) && Number.isFinite(c?.y)
  );
  if (entries.length === 0) return null;
  const s = 1 / (zoom || 1);
  return (
    <>
      {entries.map((c) => {
        const color = cursorColor(c.clientId);
        const label = c.actor?.label || 'Someone';
        return (
          <div
            key={c.clientId}
            data-testid="remote-cursor"
            style={{
              position: 'absolute', left: c.x, top: c.y, zIndex: 200,
              pointerEvents: 'none', transform: `scale(${s})`, transformOrigin: '0 0',
            }}
          >
            <svg width="18" height="26" viewBox="0 0 18 26" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}>
              <path d="M2 1 L2 19 L7.5 14.5 L10 20 L12.5 18.8 L10 13.5 L15 13.5 Z" fill={color} stroke="white" strokeWidth="1.2" />
            </svg>
            <div style={{
              marginTop: 1, marginLeft: 12, display: 'inline-block',
              background: color, color: 'white', borderRadius: 4,
              padding: '1px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              {label}
            </div>
          </div>
        );
      })}
    </>
  );
}
