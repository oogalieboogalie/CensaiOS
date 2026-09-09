import React from 'react';
import { useTheme } from '../Theme.jsx';

const PAN_OPTIONS = [
  { value: 'both', label: 'Space drag or middle mouse' },
  { value: 'space', label: 'Space + left drag' },
  { value: 'middle', label: 'Middle mouse drag' },
  { value: 'alt', label: 'Alt/Option + left drag' },
];

export function CanvasInteractionSettings() {
  const { theme, setTheme } = useTheme();
  return (
    <div style={{ display: 'grid', gap: 13 }}>
      <label style={{ display: 'grid', gap: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Canvas pan control</span>
        <select
          aria-label="Canvas pan control"
          value={theme.canvasPanMode || 'both'}
          onChange={(event) => setTheme({ canvasPanMode: event.target.value })}
          style={{
            width: '100%',
            border: '1px solid var(--hairline)',
            borderRadius: 8,
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          {PAN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Snap group layouts</div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Keep role-based slots when windows enter or move inside a group</div>
        </div>
        <button
          type="button"
          aria-label="Snap group layouts"
          aria-pressed={theme.groupSnapping !== false}
          onClick={() => setTheme({ groupSnapping: theme.groupSnapping === false })}
          style={{
            position: 'relative',
            width: 44,
            height: 24,
            borderRadius: 999,
            border: 0,
            padding: 0,
            background: theme.groupSnapping !== false ? 'var(--accent)' : 'oklch(0.5 0 0 / 0.22)',
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: theme.groupSnapping !== false ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>
    </div>
  );
}
