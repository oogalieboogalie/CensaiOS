import React from 'react';
import { Icon } from '../Icons.jsx';

export function CanvasFitPrompt({ rect, zoom, neighbor, onFit, onDismiss }) {
  if (!neighbor) return null;
  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: rect.x, top: rect.y - (34 / zoom), zIndex: 64, display: 'flex', alignItems: 'center', gap: 5 / zoom, padding: `${4 / zoom}px ${6 / zoom}px`, borderRadius: 999, background: 'var(--surface)', border: `${1 / zoom}px solid oklch(var(--accent-l) calc(var(--accent-c) * 0.7) var(--accent-h))`, boxShadow: `0 ${4 / zoom}px ${16 / zoom}px oklch(0 0 0 / 0.14)`, fontFamily: 'var(--font-mono)', fontSize: 10 / zoom, color: 'var(--ink-soft)', whiteSpace: 'nowrap', pointerEvents: 'auto' }}>
      <span>fit to neighbor?</span>
      <button onClick={() => onFit(neighbor.fitted)} title="Fit to neighboring window" style={{ all: 'unset', cursor: 'pointer', width: 18 / zoom, height: 18 / zoom, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
        <Icon.Check size={10} stroke={2.4} />
      </button>
      <button onClick={onDismiss} title="Keep drawn size" style={{ all: 'unset', cursor: 'pointer', width: 18 / zoom, height: 18 / zoom, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--ink-faint)' }}>
        <Icon.Close size={10} stroke={2.4} />
      </button>
    </div>
  );
}
