import { PEN_COLOR_NAMES, PEN_COLORS, PEN_SIZES } from '../toolbarDefs.jsx';
import { DOCK } from './dockMetrics.js';

// Colour dots and thickness stay smaller than a tool button. The row uses
// the same tight padding as the dock so it does not tower over the pill.
export function PenOptions({ penColor, setPenColor, penSize, setPenSize }) {
  return (
    <div
      className="flex items-center hb-glass"
      data-testid="dock-pen-options"
      style={{ gap: DOCK.gap, padding: `${DOCK.padY}px 8px`, border: '1px solid var(--glass-line)', borderRadius: 'var(--radius-float)' }}
    >
      <div className="flex items-center" style={{ gap: DOCK.gap }}>
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={`Pen color ${PEN_COLOR_NAMES[c] || c}`}
            onClick={() => setPenColor(c)}
            style={{
              all: 'unset', cursor: 'pointer',
              width: DOCK.button, height: DOCK.button, borderRadius: '50%',
              display: 'grid', placeItems: 'center',
            }}
          >
            <span
              data-pen-swatch
              style={{
                width: 16, height: 16, borderRadius: '50%', background: c,
                boxShadow: penColor === c ? '0 0 0 1px var(--ink-soft)' : 'inset 0 0 0 1px oklch(0 0 0 / 0.12)',
              }}
            />
          </button>
        ))}
      </div>
      <div data-dock-divider style={{ width: 1, height: DOCK.divider, background: 'var(--hairline)' }} />
      <div className="flex items-center" style={{ gap: DOCK.gap }}>
        {PEN_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            title={`Pen size ${s}`}
            onClick={() => setPenSize(s)}
            style={{
              all: 'unset', cursor: 'pointer',
              width: DOCK.button, height: DOCK.button, borderRadius: 'var(--radius-float-sm)',
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
