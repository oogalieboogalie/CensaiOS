import React from 'react';

// Terminal theme presets captured from the .team ideas palette
// (.team/ideas/color-codes-4-windows). Pure data + the preset picker button —
// kept out of WindowThemePanel.jsx so the panel stays within its size budget.
export const TERMINAL_THEME_PRESETS = [
  {
    id: 'render',
    name: 'Render',
    description: 'Modern / Cloud',
    theme: {
      background: '#0F172A',
      foreground: '#FFFFFF',
      cursor: '#46E3B7',
      selectionBackground: '#164E63',
      black: '#0F172A',
      red: '#FB7185',
      green: '#46E3B7',
      yellow: '#FBBF24',
      blue: '#38BDF8',
      magenta: '#A78BFA',
      cyan: '#2DD4BF',
      white: '#FFFFFF',
    },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Minimalist / High Contrast',
    theme: {
      background: '#000000',
      foreground: '#FFFFFF',
      cursor: '#0070F3',
      selectionBackground: '#1F2937',
      black: '#000000',
      red: '#FF5C5C',
      green: '#50E3C2',
      yellow: '#F5A623',
      blue: '#0070F3',
      magenta: '#BD10E0',
      cyan: '#50E3C2',
      white: '#FFFFFF',
    },
  },
  {
    id: 'envoy',
    name: 'Envoy',
    description: 'Technical / Service Mesh',
    theme: {
      background: '#2B2B2B',
      foreground: '#F9F9F9',
      cursor: '#FF008C',
      selectionBackground: '#4B5563',
      black: '#2B2B2B',
      red: '#FF4D6D',
      green: '#6EE7B7',
      yellow: '#FDE047',
      blue: '#60A5FA',
      magenta: '#FF008C',
      cyan: '#67E8F9',
      white: '#F9F9F9',
    },
  },
  {
    id: 'kali',
    name: 'Kali Linux',
    description: 'Terminal / Security',
    theme: {
      background: '#1F2229',
      foreground: '#F8F8F2',
      cursor: '#268BD2',
      selectionBackground: '#374151',
      black: '#1F2229',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#EEE8D5',
    },
  },
  {
    id: 'arch',
    name: 'Arch Linux',
    description: 'Minimal / System',
    theme: {
      background: '#000000',
      foreground: '#D7DEEA',
      cursor: '#1793D1',
      selectionBackground: '#333333',
      black: '#000000',
      red: '#CC241D',
      green: '#98971A',
      yellow: '#D79921',
      blue: '#1793D1',
      magenta: '#B16286',
      cyan: '#689D6A',
      white: '#EBDBB2',
    },
  },
  {
    id: 'jules',
    name: 'Jules',
    description: 'AI Agent / Cyberpunk',
    theme: {
      background: '#0D0D0D',
      foreground: '#00FFFF',
      cursor: '#8A2BE2',
      selectionBackground: '#312E81',
      black: '#0D0D0D',
      red: '#FF006E',
      green: '#39FF14',
      yellow: '#F9F871',
      blue: '#8A2BE2',
      magenta: '#FF00FF',
      cyan: '#00FFFF',
      white: '#F8FAFC',
    },
  },
];

export function PresetButton({ preset, active, onApply }) {
  const swatches = [preset.theme.background, preset.theme.cursor, preset.theme.foreground];

  return (
    <button
      type="button"
      onClick={() => onApply(preset)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 8,
        padding: '8px 9px',
        borderRadius: 7,
        border: `1px solid ${active ? preset.theme.cursor : 'rgba(148,163,184,0.2)'}`,
        background: active ? 'rgba(148,163,184,0.12)' : '#111827',
        color: '#e2e8f0',
      }}
      title={preset.description}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 700 }}>{preset.name}</span>
        <span style={{ display: 'block', marginTop: 2, fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.description}</span>
      </span>
      <span style={{ display: 'flex', gap: 3 }}>
        {swatches.map((color) => (
          <span
            key={color}
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: color,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
            }}
          />
        ))}
      </span>
    </button>
  );
}
