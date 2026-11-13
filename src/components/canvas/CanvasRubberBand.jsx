const PREVIEW = 'oklch(var(--accent-l) calc(var(--accent-c) * 0.8) var(--accent-h))';

export function CanvasRubberBand({ band, zoom }) {
  if (!band) return null;
  if (band.mode === 'line' || band.mode === 'arrow') {
    return (
      <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <line
          x1={band.x0} y1={band.y0} x2={band.x1} y2={band.y1}
          stroke={PREVIEW} strokeWidth={1.5 / zoom} strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <div style={{
      position: 'absolute',
      left: band.x,
      top: band.y,
      width: band.w,
      height: band.h,
      border: band.isGroup
        ? `${2 / zoom}px solid var(--hairline-strong)`
        : `${1.5 / zoom}px ${band.isSelection ? 'solid' : 'dashed'} ${PREVIEW}`,
      background: band.isGroup
        ? 'oklch(0 0 0 / 0.04)'
        : 'oklch(var(--accent-l) calc(var(--accent-c) * 0.8) var(--accent-h) / 0.08)',
      borderRadius: band.mode === 'ellipse' ? '50%' : 24 / zoom,
      pointerEvents: 'none',
    }} />
  );
}
