import React from 'react';
import { MOODS, useTheme } from './Theme.jsx';

// In-canvas color settings drawer (Automation bullet 3). Mounted from a
// board control — NOT a window. Pick a mood preset, preview it, then Apply
// (writes via the same setTheme path as the Theme panel), Reset the pick,
// or Cancel without writing anything.
export function ColorSettingsPanel({ onClose }) {
  const { theme, setTheme } = useTheme();
  const [staged, setStaged] = React.useState(theme.mood);

  const entries = React.useMemo(() => Object.entries(MOODS), []);
  const stagedMood = MOODS[staged] || MOODS[theme.mood] || {};
  const stagedAccent = stagedMood.accent || {};
  const swatch = (a) => `oklch(${a.lightness ?? 0.66} ${a.chroma ?? 0.18} ${a.hue ?? 225})`;

  const apply = () => {
    const next = MOODS[staged] || MOODS.cream;
    setTheme({ mood: staged, customVars: {}, ...(next.accent || {}) });
  };
  const reset = () => setStaged(theme.mood);
  const cancel = () => onClose?.();

  return (
    <div
      data-testid="color-settings-panel"
      role="dialog"
      aria-label="Color settings"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300, zIndex: 1200,
        background: 'var(--surface)', borderLeft: '1px solid var(--hairline)',
        boxShadow: 'var(--shadow-pop)', display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--hairline)' }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--ink)' }}>Theme</span>
        <button type="button" onClick={cancel} title="Close color settings" aria-label="Close color settings" style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-md)', color: 'var(--ink-faint)', padding: '2px 6px' }}>✕</button>
      </div>

      <div style={{ padding: 12, borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginBottom: 6 }}>Preview{staged !== theme.mood ? ' (not applied yet)' : ''}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', background: swatch(stagedAccent), flexShrink: 0, border: '1px solid var(--hairline)' }} />
          <span>
            <span style={{ display: 'block', fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--ink)' }}>{staged}</span>
            <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>{stagedMood.mode || 'custom'} mode</span>
          </span>
        </div>
      </div>

      <div role="listbox" aria-label="Theme presets" style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.map(([id, mood]) => {
          const selected = id === staged;
          const applied = id === theme.mood;
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={selected}
              title={`${id}${applied ? ' (current)' : ''}`}
              onClick={() => setStaged(id)}
              style={{
                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 'var(--radius-lg)',
                background: selected ? 'var(--accent-soft)' : 'transparent',
                outline: selected ? '1px solid var(--accent)' : '1px solid transparent',
              }}
            >
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: swatch(mood.accent || {}), flexShrink: 0, border: '1px solid var(--hairline)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: selected ? 700 : 500, color: 'var(--ink)', flex: 1 }}>{id}</span>
              {applied && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>current</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--hairline)' }}>
        <button type="button" onClick={apply} disabled={staged === theme.mood} style={{ all: 'unset', cursor: staged === theme.mood ? 'not-allowed' : 'pointer', flex: 1, textAlign: 'center', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 'var(--radius-lg)', padding: '8px 0', opacity: staged === theme.mood ? 0.5 : 1 }}>Apply</button>
        <button type="button" onClick={reset} disabled={staged === theme.mood} style={{ all: 'unset', cursor: staged === theme.mood ? 'not-allowed' : 'pointer', flex: 1, textAlign: 'center', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)', padding: '8px 0', opacity: staged === theme.mood ? 0.5 : 1 }}>Reset</button>
        <button type="button" onClick={cancel} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink-soft)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '8px 0' }}>Cancel</button>
      </div>
    </div>
  );
}
