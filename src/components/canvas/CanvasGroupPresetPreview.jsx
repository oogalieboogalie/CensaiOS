import React from 'react';

const SHAPES = {
  semantic: [[2, 2, 3, 5], [6, 2, 7, 5], [14, 2, 3, 5], [6, 8, 11, 2]],
  columns: [[2, 2, 7, 8], [10, 2, 7, 8]],
  rows: [[2, 2, 15, 3], [2, 6, 15, 4]],
  columns3: [[2, 2, 4, 8], [7, 2, 5, 8], [13, 2, 4, 8]],
  leftStack: [[2, 2, 5, 3], [2, 6, 5, 4], [8, 2, 9, 8]],
  rightStack: [[2, 2, 9, 8], [12, 2, 5, 3], [12, 6, 5, 4]],
  quad: [[2, 2, 7, 3], [10, 2, 7, 3], [2, 6, 7, 4], [10, 6, 7, 4]],
  dashboard: [[2, 2, 3, 3], [6, 2, 3, 3], [2, 6, 7, 4], [10, 2, 7, 8]],
  sideStacks: [[2, 2, 3, 3], [2, 6, 3, 4], [6, 2, 7, 8], [14, 2, 3, 3], [14, 6, 3, 4]],
  mainQuad: [[2, 2, 9, 8], [12, 2, 2, 3], [15, 2, 2, 3], [12, 6, 2, 4], [15, 6, 2, 4]],
};

export function CanvasGroupPresetPreview({ kind = 'columns' }) {
  return (
    <svg width="42" height="28" viewBox="0 0 19 12" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <rect x="0.5" y="0.5" width="18" height="11" rx="1.5" fill="var(--surface-2)" stroke="var(--hairline)" />
      {(SHAPES[kind] || SHAPES.columns).map(([x, y, width, height], index) => (
        <rect
          key={`${x}-${y}-${index}`}
          x={x}
          y={y}
          width={width}
          height={height}
          rx="0.7"
          fill={kind === 'semantic' && index === 1 ? 'var(--accent)' : 'var(--accent-soft)'}
          stroke="var(--accent)"
          strokeWidth="0.45"
        />
      ))}
    </svg>
  );
}
