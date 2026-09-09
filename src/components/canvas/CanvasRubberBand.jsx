import React from 'react';

export function CanvasRubberBand({ band, zoom }) {
  if (!band) return null;
  return (
    <div style={{
      position: 'absolute',
      left: band.x,
      top: band.y,
      width: band.w,
      height: band.h,
      border: band.isGroup
        ? `${2 / zoom}px solid var(--hairline-strong)`
        : `${1.5 / zoom}px ${band.isSelection ? 'solid' : 'dashed'} oklch(var(--accent-l) calc(var(--accent-c) * 0.8) var(--accent-h))`,
      background: band.isGroup
        ? 'oklch(0 0 0 / 0.04)'
        : 'oklch(var(--accent-l) calc(var(--accent-c) * 0.8) var(--accent-h) / 0.08)',
      borderRadius: 24 / zoom,
      pointerEvents: 'none',
    }} />
  );
}
