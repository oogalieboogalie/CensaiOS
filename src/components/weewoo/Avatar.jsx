/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { avatarCells, cellFill } from '../../lib/weewoo/avatarParts.js';

const ANIM = { working: 'busy', waiting: 'idle', error: 'shake', idle: 'idle', napping: 'nap' };

// One agent's pixel avatar, drawn as SVG cells. `px` is the size of one
// cell; the WeeWoo design keeps it at 10 or below so pixels stay crisp.
export function Avatar({ avatar, status = 'idle', px = 3, title, bubble = null }) {
  const cells = React.useMemo(() => avatarCells(avatar), [avatar]);
  const rects = [];
  cells.forEach((row, y) => row.forEach((cell, x) => {
    if (cell !== '.') rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={cellFill(cell, avatar)} />);
  }));
  const size = px * 14;
  return (
    <span className="ww-avatar" data-anim={ANIM[status] || 'idle'} style={{ width: size, height: size }} title={title}>
      {bubble && <span className="ww-avatar-bubble">{bubble}</span>}
      <svg className="ww-avatar-pix" viewBox="0 0 14 14" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">{rects}</svg>
    </span>
  );
}

export function EnergyBar({ value = 0.7, width = 42 }) {
  const level = value < 0.25 ? 'crit' : value < 0.5 ? 'lo' : 'ok';
  return (
    <span className="ww-energy" data-level={level} style={{ width }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Energy">
      <i style={{ width: `${Math.max(4, value * 100)}%` }} />
    </span>
  );
}

export const STATUS_LABEL = { working: 'working', waiting: 'waiting', error: 'needs help', idle: 'idle', napping: 'napping' };

export function StatusPill({ status }) {
  return <span className="ww-pill" data-status={status}><span className="ww-dot" />{STATUS_LABEL[status] || status}</span>;
}
