import React from 'react';
import { Icon } from '../Icons.jsx';
import { MOODS, oklch } from '../Theme.jsx';

export function MoodSwatch({ name, mood, active, onClick, size = 30 }) {
  const bg = mood.vars['--canvas'];
  const surface = mood.vars['--surface'];
  const hairline = mood.vars['--hairline'];
  const accent = mood.accent ? oklch({ l: mood.accent.lightness, c: mood.accent.chroma, h: mood.accent.hue }) : 'var(--accent)';
  const strip = mood.vars['--window-strip-bg'];
  const swatch = (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'block',
        width: size,
        height: size,
        borderRadius: 7,
        background: `linear-gradient(135deg, ${surface} 0 52%, ${bg} 52% 100%)`,
        boxShadow: active ? `inset 0 0 0 2px ${accent}, 0 0 0 2px var(--surface)` : `inset 0 0 0 1px ${hairline}`,
        overflow: 'hidden',
      }}
    >
      <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(4, size * 0.16), background: strip && strip !== 'transparent' ? strip : accent }} />
    </span>
  );

  if (!onClick) return swatch;
  return (
    <button onClick={onClick} title={`${name} ${mood.mode}`} aria-label={`${name} ${mood.mode}`} style={{ all: 'unset', cursor: 'pointer', display: 'block', borderRadius: 8 }}>
      {swatch}
    </button>
  );
}

export function MoodChip({ name, mood, active, onClick }) {
  const bg = mood.vars['--canvas'];
  const surface = mood.vars['--surface'];
  const ink = mood.vars['--ink'];
  const hairline = mood.vars['--hairline'];
  const accent = mood.accent ? oklch({ l: mood.accent.lightness, c: mood.accent.chroma, h: mood.accent.hue }) : 'var(--accent)';
  const mode = mood.mode;
  return (
    <button
      onClick={onClick}
      title={name}
      style={{ all: 'unset', cursor: 'pointer', position: 'relative', display: 'flex', flexDirection: 'column', padding: 9, borderRadius: 8, background: bg, color: ink, boxShadow: active ? `inset 0 0 0 2px ${accent}` : `inset 0 0 0 1px ${hairline}`, minHeight: 64, overflow: 'hidden' }}
    >
      <div style={{ height: 18, borderRadius: 5, background: mood.vars['--window-strip-bg'] && mood.vars['--window-strip-bg'] !== 'transparent' ? mood.vars['--window-strip-bg'] : `linear-gradient(90deg, ${surface}, ${accent})`, boxShadow: 'inset 0 0 0 1px oklch(0 0 0 / 0.10)', marginBottom: 9 }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase', color: ink, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ fontSize: 10, color: ink, opacity: 0.55, marginTop: 2 }}>{mode}</div>
    </button>
  );
}

function getPresetMood(preset) {
  const savedTheme = preset.theme || {};
  const base = MOODS[savedTheme.mood] || MOODS.cream;
  return {
    ...base,
    accent: {
      hue: savedTheme.hue ?? base.accent?.hue ?? 145,
      chroma: savedTheme.chroma ?? base.accent?.chroma ?? 0.11,
      lightness: savedTheme.lightness ?? base.accent?.lightness ?? 0.62,
    },
    vars: { ...base.vars, ...(savedTheme.customVars || {}) },
  };
}

export function SavedPresetRow({ preset, active, onApply, onDelete }) {
  const mood = getPresetMood(preset);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 7, borderRadius: 8, background: active ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}` }}>
      <button onClick={onApply} title={`Apply ${preset.name}`} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
        <MoodSwatch name={preset.name} mood={mood} active={active} size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>{preset.theme?.mood || 'custom'}</div>
        </div>
      </button>
      <button onClick={onDelete} title={`Delete ${preset.name}`} style={{ all: 'unset', cursor: 'pointer', width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', background: 'var(--surface-2)' }}>
        <Icon.Close size={12} />
      </button>
    </div>
  );
}
