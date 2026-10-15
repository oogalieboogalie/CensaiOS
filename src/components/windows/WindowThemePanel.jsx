import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Icon } from '../Icons.jsx';
import { PresetButton, TERMINAL_THEME_PRESETS } from './terminalThemePresets.jsx';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

export { TERMINAL_THEME_PRESETS } from './terminalThemePresets.jsx';

// Fallback colors only (the brand's black, white and Ultem). A terminal or
// editor with no theme of its own follows the board's look instead, see
// src/components/terminal/lookCodeTheme.js.
export const DEFAULT_THEME = {
  background: '#181818',
  foreground: '#eaeaea',
  cursor: '#e5a83a',
  selectionBackground: '#3a3a3a',
  black: '#282828',
  blue: '#7aa7f0',
  cyan: '#5cc8d4',
  green: '#7ccb8f',
  magenta: '#d68ad0',
  red: '#ef7b72',
  white: '#cfcfcf',
  yellow: '#e5a83a',
  fontSize: 'var(--text-md)',
};

// The old slate-blue default background. "Reset to Default" used to save it
// into a window, so a window carrying it has not really picked a theme.
export const LEGACY_DEFAULT_BACKGROUNDS = Object.freeze(['#0b1020', '#0B1020']);

export const THEME_COLOR_LABELS = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'selectionBackground', label: 'Selection' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'blue', label: 'Blue' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'white', label: 'White' },
];

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function ColorPicker({ value, onChange, label }) {
  const [draft, setDraft] = useState(value || '#000000');

  useEffect(() => {
    setDraft(value || '#000000');
  }, [value]);

  const commit = useCallback((next) => {
    const normalized = next.toUpperCase();
    setDraft(normalized);
    onChange(normalized);
  }, [onChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => commit(e.target.value)}
        style={{
          width: 28,
          height: 28,
          padding: 0,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          background: 'transparent',
        }}
      />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', flex: 1 }}>{label}</span>
      <input
        type="text"
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (HEX_COLOR_RE.test(next)) commit(next);
        }}
        onBlur={(e) => {
          if (HEX_COLOR_RE.test(e.target.value)) {
            commit(e.target.value);
          } else {
            setDraft(value || '#000000');
          }
        }}
        style={{
          width: 80,
          padding: '4px 6px',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-label)',
          background: 'var(--surface-sunken)',
          color: 'var(--ink)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-sm)',
          textTransform: 'var(--label-case)',
        }}
      />
    </div>
  );
}

export function SettingsPanel({ title = 'Theme Settings', theme, onThemeChange, onClose }) {
  const panelRef = useRef(null);
  useEscapeDismiss(true, onClose);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleColorChange = useCallback((key) => (newColor) => {
    onThemeChange({ ...theme, [key]: newColor });
  }, [theme, onThemeChange]);

  // Drop this window's own theme so it follows the board's look again.
  const handleResetTheme = useCallback(() => {
    onThemeChange(null);
  }, [onThemeChange]);

  const handlePresetApply = useCallback((preset) => {
    onThemeChange({ ...theme, ...preset.theme, mode: 'dark', fontSize: theme.fontSize || DEFAULT_THEME.fontSize });
  }, [theme, onThemeChange]);

  const handleFontSizeChange = useCallback((e) => {
    const newSize = parseInt(e.target.value, 10);
    if (!isNaN(newSize) && newSize >= 8 && newSize <= 48) {
      onThemeChange({ ...theme, fontSize: newSize });
    }
  }, [theme, onThemeChange]);

  return (
    <div
      ref={panelRef}
      className="hb-glass"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        top: 44,
        right: 8,
        width: 220,
        maxHeight: 400,
        overflow: 'auto',
        color: 'var(--ink)',
        border: '1px solid var(--glass-line)',
        borderRadius: 'var(--radius-lg)',
        zIndex: 100,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--ink-faint)',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          <Icon.Close size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', flex: 1 }}>Font Size</span>
        <input
          type="number"
          min="8"
          max="48"
          value={theme.fontSize || 13}
          onChange={handleFontSizeChange}
          style={{
            width: 80,
            padding: '4px 6px',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            background: 'var(--surface-sunken)',
            color: 'var(--ink)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Presets</span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {TERMINAL_THEME_PRESETS.map((preset) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              active={theme.background === preset.theme.background && theme.cursor === preset.theme.cursor}
              onApply={handlePresetApply}
            />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        {THEME_COLOR_LABELS.map(({ key, label }) => (
          <ColorPicker
            key={key}
            label={label}
            value={theme[key]}
            onChange={handleColorChange(key)}
          />
        ))}
      </div>

      <button
        onClick={handleResetTheme}
        className="hb-glass-row"
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 'var(--text-xs)',
          fontWeight: 500,
          background: 'transparent',
          color: 'var(--ink)',
          border: '1px solid var(--glass-line)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'background var(--dur-fast)',
        }}
      >
        Match the board's look
      </button>
    </div>
  );
}
