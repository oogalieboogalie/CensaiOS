import React from 'react';
import { strokeBounds } from '../../lib/ink/stroke.js';

// Spec 9 "Make real": a quiet dashed line from a sketch (strokes on the
// board, or a Sketchpad window) to the module built from it.
export function sketchSourceBounds(sketch, wins, paths) {
  if (!sketch) return null;
  if (sketch.windowId) {
    const w = wins.find((win) => win.id === sketch.windowId);
    return w ? { x: w.x, y: w.y, w: w.w, h: w.h } : null;
  }
  if (Array.isArray(sketch.pathIds)) {
    const ids = new Set(sketch.pathIds);
    return strokeBounds(paths.filter((p) => ids.has(p.id)));
  }
  return null;
}

export function SketchLinks({ wins, paths, zoom }) {
  const lines = [];
  for (const win of wins) {
    if (!win.sketch) continue;
    const from = sketchSourceBounds(win.sketch, wins, paths);
    if (!from) continue;
    const x1 = from.x + from.w + 8 / zoom;
    const y1 = from.y + from.h / 2;
    const x2 = win.x - 8 / zoom;
    const y2 = win.y + Math.min(win.h / 2, 60);
    const dx = Math.max(24, Math.abs(x2 - x1) * 0.45);
    lines.push(
      <g key={`sketch-${win.id}`} data-sketch-link={win.id} pointerEvents="none">
        <path d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} fill="none" stroke="var(--ink-faint)" strokeWidth={1.25 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} />
        <circle cx={x1} cy={y1} r={3 / zoom} fill="var(--ink-faint)" />
        <circle cx={x2} cy={y2} r={3 / zoom} fill="var(--ink-faint)" />
      </g>,
    );
  }
  return lines;
}
