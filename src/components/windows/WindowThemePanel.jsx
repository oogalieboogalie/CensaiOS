import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Icon } from '../Icons.jsx';
import { PresetButton, TERMINAL_THEME_PRESETS } from './terminalThemePresets.jsx';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

export { TERMINAL_THEME_PRESETS } from './terminalThemePresets.jsx';

export const DEFAULT_THEME = {
  background: '#0b1020',
  foreground: '#d7deea',
  cursor: '#f8fafc',
  selectionBackground: '#475569',
  black: '#111827',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  green: '#34d399',
  magenta: '#c084fc',
  red: '#fb7185',
  white: '#e5e7eb',
  yellow: '#fbbf24',
  fontSize: 13,
};

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
          borderRadius: 4,
          cursor: 'pointer',
          background: 'transparent',
        }}
      />
      <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{label}</span>
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
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          background: '#1e293b',
          color: '#d7deea',
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: 4,
          textTransform: 'uppercase',
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

  const handleResetTheme = useCallback(() => {
    onThemeChange({ ...DEFAULT_THEME });
  }, [onThemeChange]);

  const handlePresetApply = useCallback((preset) => {
    onThemeChange({ ...theme, ...preset.theme, fontSize: theme.fontSize || DEFAULT_THEME.fontSize });
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
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        top: 44,
        right: 8,
        width: 220,
        maxHeight: 400,
        overflow: 'auto',
        background: '#0f172a',
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: 8,
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        zIndex: 100,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{title}</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          <Icon.Close size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>Font Size</span>
        <input
          type="number"
          min="8"
          max="48"
          value={theme.fontSize || 13}
          onChange={handleFontSizeChange}
          style={{
            width: 80,
            padding: '4px 6px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            background: '#1e293b',
            color: '#d7deea',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 4,
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Presets</span>
          <span style={{ fontSize: 9, color: '#64748b' }}>.team ideas</span>
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
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 500,
          background: '#1e293b',
          color: '#94a3b8',
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: 6,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.target.style.background = '#334155';
          e.target.style.color = '#d7deea';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = '#1e293b';
          e.target.style.color = '#94a3b8';
        }}
      >
        Reset to Default
      </button>
    </div>
  );
}
