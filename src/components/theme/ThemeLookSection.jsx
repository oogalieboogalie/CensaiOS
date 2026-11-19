import React from 'react';
import { MOODS } from '../Theme.jsx';
import {
  CUSTOM_LOOK_ID,
  DEFAULT_CUSTOM_COLORS,
  DENSITIES,
  FONT_PAIRS,
  GLASS_RANGE,
  LABEL_STYLES,
  LOOKS,
  RADIUS_RANGE,
  matchLook,
  normalizeShape,
} from '../../lib/theme/looks.js';
import {
  SettingsButton, SettingsChoice, SettingsGroup, SettingsNote, SettingsRow, SettingsSection, SettingsSlider,
} from './settingsKit.jsx';
import { WindowPreview, moodColors } from './settingsPreview.jsx';

// A look's card: one window on the look's own board, in its colors and corners.
function LookCard({ id, label, blurb, mood, radiusScale, headerMode, active, onClick }) {
  return (
    <button type="button" className="hb-set-tile" data-testid={`look-${id}`} aria-pressed={active} onClick={onClick} title={blurb}>
      <WindowPreview colors={moodColors(mood)} radiusScale={radiusScale} header={headerMode} />
      <span className="hb-set-tile-name">{label}</span>
      <span className="hb-set-tile-hint">{blurb}</span>
    </button>
  );
}

function CustomPanel({ theme, shape, setShape, setCustomColors }) {
  const colors = { ...DEFAULT_CUSTOM_COLORS, ...(theme.customColors || {}) };
  return (
    <SettingsGroup title="Your own look" hint="Every window follows as you move these." data-testid="look-custom-panel">
      <SettingsRow label="Mode">
        <SettingsChoice label="Mode" value={colors.mode} options={{ dark: { label: 'Dark' }, light: { label: 'Light' } }} onChange={(mode) => setCustomColors({ mode })} />
      </SettingsRow>
      <SettingsSlider label="Base color" value={colors.baseHue} min={0} max={360} step={1} onChange={(baseHue) => setCustomColors({ baseHue })} format={(v) => `${Math.round(v)}°`} />
      <SettingsSlider label="Base color strength" value={colors.tint} min={0} max={0.04} step={0.002} onChange={(tint) => setCustomColors({ tint })} format={(v) => `${Math.round(v * 2500)}%`} />
      <SettingsSlider label="Accent color" value={colors.accentHue} min={0} max={360} step={1} onChange={(accentHue) => setCustomColors({ accentHue })} format={(v) => `${Math.round(v)}°`} />
      <SettingsSlider label="Corner roundness" value={shape.radiusScale} min={RADIUS_RANGE.min} max={RADIUS_RANGE.max} step={RADIUS_RANGE.step} onChange={(radiusScale) => setShape({ radiusScale })} format={(v) => `${Math.round(v * 8)}px`} />
      <SettingsSlider label="See-through windows" value={shape.glass} min={GLASS_RANGE.min} max={GLASS_RANGE.max} step={GLASS_RANGE.step} onChange={(glass) => setShape({ glass })} format={(v) => `${Math.round(v * 100)}%`} />
      <SettingsRow label="Spacing">
        <SettingsChoice label="Spacing" value={shape.density} options={DENSITIES} onChange={(density) => setShape({ density })} />
      </SettingsRow>
      <SettingsRow label="Font">
        <SettingsChoice label="Font" value={shape.fontPair} options={FONT_PAIRS} onChange={(fontPair) => setShape({ fontPair })} />
      </SettingsRow>
      <SettingsRow label="Small labels">
        <SettingsChoice label="Small labels" value={shape.labelStyle} options={LABEL_STYLES} onChange={(labelStyle) => setShape({ labelStyle })} />
      </SettingsRow>
    </SettingsGroup>
  );
}

/** Appearance > Look: the ready-made looks, your own look, and a look file to share. */
export function LookSection({ theme, applyLook, setShape, setCustomColors, exportTheme, importTheme, resetTheme }) {
  const activeLook = matchLook(theme);
  const shape = normalizeShape(theme);
  const [customOpen, setCustomOpen] = React.useState(activeLook === CUSTOM_LOOK_ID);
  const [note, setNote] = React.useState(null);
  const fileRef = React.useRef(null);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !importTheme) return;
    const result = await importTheme(file);
    setNote(result.ok ? { tone: 'ok', text: `Loaded “${result.name}”.` } : { tone: 'error', text: result.error });
  };

  return (
    <SettingsSection
      title="Look"
      hint="Colors, corners, spacing and type, chosen together. Pick one, then change any part below."
      data-testid="theme-look-section"
      actions={(
        <>
          <SettingsButton small onClick={() => fileRef.current?.click()} title="Load a look someone saved to a file">Load file</SettingsButton>
          <SettingsButton small onClick={() => exportTheme?.()} title="Save this look to a file you can share">Save to file</SettingsButton>
          {resetTheme && <SettingsButton small onClick={() => { resetTheme(); setCustomOpen(false); }} title="Put the whole appearance back to how censaiOS starts">Reset</SettingsButton>}
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImport} hidden data-testid="theme-import-input" />
        </>
      )}
    >
      <div className="hb-set-tiles">
        {Object.entries(LOOKS).map(([id, entry]) => (
          <LookCard
            key={id}
            id={id}
            label={entry.label}
            blurb={entry.blurb}
            mood={MOODS[entry.mood]}
            radiusScale={entry.shape.radiusScale}
            headerMode={entry.shape.headerMode}
            active={activeLook === id}
            onClick={() => { applyLook(id); setCustomOpen(false); setNote(null); }}
          />
        ))}
      </div>
      <SettingsButton
        wide
        data-testid="look-custom"
        aria-expanded={customOpen}
        aria-pressed={activeLook === CUSTOM_LOOK_ID}
        onClick={() => setCustomOpen((v) => !v)}
      >
        {customOpen ? 'Hide your own look' : 'Make your own look'}
      </SettingsButton>
      {customOpen && <CustomPanel theme={theme} shape={shape} setShape={setShape} setCustomColors={setCustomColors} />}
      <SettingsNote note={note} />
    </SettingsSection>
  );
}
