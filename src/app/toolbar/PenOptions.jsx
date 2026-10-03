import React from 'react';
import { PEN_COLORS, PEN_SIZES } from '../toolbarDefs.jsx';

export function PenOptions({ penColor, setPenColor, penSize, setPenSize }) {
  return (
    <div
      className="flex items-center backdrop-blur-xl"
      style={{ gap: 8, padding: '8px 12px', background: 'color-mix(in oklab, var(--surface) 88%, transparent)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-float)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center" style={{ gap: 4 }}>
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={`Pen color ${c}`}
            onClick={() => setPenColor(c)}
            style={{
              all: 'unset', cursor: 'pointer',
              width: 22, height: 22, borderRadius: '50%',
              background: c,
              border: '2px solid transparent',
              boxShadow: penColor === c ? '0 0 0 1px var(--ink-soft)' : 'inset 0 0 0 1px oklch(0 0 0 / 0.12)',
              transform: penColor === c ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 0.1s',
            }}
          />
        ))}
      </div>
      <div style={{ width: 1, height: 20, background: 'var(--hairline)' }} />
      <div className="flex items-center" style={{ gap: 4 }}>
        {PEN_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            title={`Pen size ${s}`}
            onClick={() => setPenSize(s)}
            style={{
              all: 'unset', cursor: 'pointer',
              width: 24, height: 24, borderRadius: 'var(--radius-float-sm)',
              display: 'grid', placeItems: 'center',
              background: penSize === s ? 'var(--surface-2)' : 'transparent',
            }}
          >
            <div style={{ width: s * 1.5, height: s * 1.5, borderRadius: '50%', background: 'var(--ink)' }} />
          </button>
        ))}
      </div>
    </div>
  );
}
