import React from 'react';
import { MOODS } from '../Theme.jsx';
import { SettingsButton } from './settingsKit.jsx';
import { WindowPreview, moodColors } from './settingsPreview.jsx';

/** A small square of a color set: its board with one window and its accent. */
export function MoodSwatch({ name, mood, active, onClick }) {
  const swatch = (
    <span aria-hidden="true" className="hb-pv hb-pv--swatch" style={moodColors(mood)}>
      <span className="hb-pv-win"><span className="hb-pv-btn" /></span>
    </span>
  );
  if (!onClick) return swatch;
  return (
    <button type="button" className="hb-set-swatch-pick" onClick={onClick} title={name} aria-label={`${name} ${mood.mode}`} aria-pressed={Boolean(active)}>
      {swatch}
    </button>
  );
}

/** The same color set as a card with its name, when names are shown. */
export function MoodChip({ name, mood, active, onClick }) {
  return (
    <button type="button" className="hb-set-tile" onClick={onClick} title={name} aria-pressed={Boolean(active)}>
      <WindowPreview colors={moodColors(mood)} />
      <span className="hb-set-tile-name">{name}</span>
      <span className="hb-set-tile-hint">{mood.mode}</span>
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
    <li className="hb-set-item" aria-current={active ? 'true' : undefined}>
      <button type="button" className="hb-set-swatch-btn" onClick={onApply} title={`Use ${preset.name}`}>
        <MoodSwatch name={preset.name} mood={mood} />
        <span className="hb-set-item-main">
          <span className="hb-set-label">{preset.name}{active ? ' (in use)' : ''}</span>
          <span className="hb-set-hint">{preset.theme?.mood || 'custom'}</span>
        </span>
      </button>
      <SettingsButton small onClick={onDelete} title={`Delete ${preset.name}`}>Delete</SettingsButton>
    </li>
  );
}
