/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { LAUNCHER_MANIFESTS } from '../../lib/windowManifest.js';
import { CanvasLaunchpad } from './CanvasLaunchpad.jsx';

export function CanvasMarks({ zoom, pan }) {
  // Place crosses at fixed large offsets in canvas-space to suggest infinity
  const marks = [
    { x: -600, y: -400 }, { x: 800, y: -300 },
    { x: -500, y: 600 }, { x: 900, y: 500 },
    { x: -1200, y: 0 }, { x: 1400, y: -100 },
    { x: 0, y: -800 }, { x: 0, y: 900 },
  ];
  return <>{marks.map((p, i) => <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, color: 'var(--hairline-strong)', opacity: 0.5, pointerEvents: 'none', fontFamily: 'var(--font-mono)', fontSize: 18 }}>+</div>)}</>;
}

// ─── Empty State ───
export function EmptyState({ onSpawn }) {
  return <CanvasLaunchpad manifests={LAUNCHER_MANIFESTS} onSpawn={onSpawn} />;
}
