import React from 'react';
import { getWindowBounds } from '../../lib/layoutAlgo.js';

export function CanvasSelectionOutline({ wins, selectedIds, zoom }) {
  const selected = wins.filter((win) => selectedIds.includes(win.id) && !win.pinned);
  const bounds = getWindowBounds(selected);
  if (!bounds || selected.length < 2) return null;

  return (
    <div
      data-selection-outline
      style={{
        position: 'absolute',
        left: bounds.x - 10,
        top: bounds.y - 10,
        width: bounds.w + 20,
        height: bounds.h + 20,
        border: `${2 / zoom}px dashed var(--accent)`,
        borderRadius: 16 / zoom,
        background: 'oklch(var(--accent-l) var(--accent-c) var(--accent-h) / 0.04)',
        pointerEvents: 'none',
        zIndex: 18,
      }}
    >
      <span style={{
        position: 'absolute',
        top: -22 / zoom,
        left: 0,
        padding: `${2 / zoom}px ${7 / zoom}px`,
        borderRadius: 999,
        background: 'var(--accent)',
        color: 'white',
        fontSize: 10 / zoom,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}>
        {selected.length} selected · use region tools to group · right-click inside to delete
      </span>
    </div>
  );
}
