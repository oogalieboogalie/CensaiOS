import React from 'react';
import { MOODS, oklch, parseOklch } from '../Theme.jsx';
import { resolveMood } from '../../lib/theme/looks.js';
import { SettingsButton, SettingsSlider } from './settingsKit.jsx';

/**
 * A Settings card for sections not yet on the shared pieces in settingsKit.jsx
 * (Friends). It draws the same black-glass card as SettingsSection.
 */
export function ThemePanelCard({ children, style, className, ...rest }) {
  return (
    <div {...rest} className={['hb-set-section', className].filter(Boolean).join(' ')} style={{ ...style, marginTop: 0 }}>
      {children}
    </div>
  );
}

/** One color in "Fine-tune each color": a row that opens to three sliders. */
export function SurfaceControl({ item, theme, setTheme, activeSurface, setActiveSurface }) {
  const moodVars = resolveMood(theme, MOODS).vars;
  const customVars = theme.customVars || {};
  const value = customVars[item.varName] || moodVars[item.varName];
  const color = parseOklch(value);
  const customized = Boolean(customVars[item.varName]);
  const update = (patch) => setTheme({ customVars: { ...customVars, [item.varName]: oklch({ ...color, ...patch }) } });
  const reset = () => {
    const next = { ...customVars };
    delete next[item.varName];
    setTheme({ customVars: next });
  };
  const open = activeSurface === item.previewKey;

  return (
    <div className="hb-set-row hb-set-row--stack" data-surface={item.previewKey}>
      <div className="hb-set-inline">
        <button type="button" className="hb-set-swatch-btn" aria-expanded={open}
          onClick={() => setActiveSurface?.(open ? null : item.previewKey)}>
          <span className="hb-set-swatch" style={{ background: value }} aria-hidden="true" />
          <span className="hb-set-row-text">
            <span className="hb-set-label">{item.label}{customized ? ' (changed)' : ''}</span>
            <span className="hb-set-hint">{item.hint}</span>
          </span>
        </button>
        {customized && <SettingsButton small onClick={reset} title={`Put ${item.label} back`}>Undo</SettingsButton>}
      </div>
      {open && (
        <div className="hb-set-group">
          <SettingsSlider label="Hue" value={Math.round(color.h)} min={0} max={360} step={1} onChange={(h) => update({ h })} format={(v) => `${v}°`} />
          <SettingsSlider label="Strength" value={+color.c.toFixed(3)} min={0} max={0.24} step={0.005} onChange={(c) => update({ c })} format={(v) => `${Math.round((v / 0.24) * 100)}%`} />
          <SettingsSlider label="Brightness" value={+color.l.toFixed(3)} min={0.08} max={0.99} step={0.005} onChange={(l) => update({ l })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      )}
    </div>
  );
}
