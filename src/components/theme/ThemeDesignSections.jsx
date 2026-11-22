import React from 'react';
import { MoodChip, MoodSwatch, SavedPresetRow } from './ThemePresets.jsx';
import { SurfaceControl } from './ThemeControls.jsx';
import { MOODS, SURFACE_CONTROLS } from '../Theme.jsx';
import { CURATED_MOOD_IDS, SPOTLIGHT_MOOD_IDS } from '../../lib/theme/curatedPresets.js';
import { resolveMood } from '../../lib/theme/looks.js';
import { SettingsButton, SettingsGroup, SettingsNote, SettingsRows, SettingsSection } from './settingsKit.jsx';

const DISPLAY_MOOD_IDS = [...SPOTLIGHT_MOOD_IDS, ...CURATED_MOOD_IDS.filter((id) => !SPOTLIGHT_MOOD_IDS.includes(id))];

function SavedColors({ theme, customPresets, applyCustomPreset, deleteCustomPreset, savingPreset, setSavingPreset, presetName, setPresetName, saveCurrentPreset }) {
  const cancel = () => { setSavingPreset(false); setPresetName(''); };
  return (
    <SettingsGroup
      title="Saved colors"
      hint="Keep the colors you have now, and come back to them in one click."
      actions={!savingPreset && (
        <SettingsButton small onClick={() => { setPresetName(`${theme.mood} ${customPresets.length + 1}`); setSavingPreset(true); }}>Save these colors</SettingsButton>
      )}
    >
      {savingPreset && (
        <form className="hb-set-inline" onSubmit={(e) => { e.preventDefault(); saveCurrentPreset(); }}>
          <input autoFocus className="hb-set-input" aria-label="Name for these colors" value={presetName} placeholder="A name for these colors"
            onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }} />
          <SettingsButton type="submit" variant="primary">Save</SettingsButton>
          <SettingsButton onClick={cancel}>Cancel</SettingsButton>
        </form>
      )}
      {customPresets.length > 0 ? (
        <ul className="hb-set-list">
          {customPresets.map((preset) => (
            <SavedPresetRow
              key={preset.id}
              preset={preset}
              active={preset.theme?.mood === theme.mood && preset.theme?.hue === theme.hue && preset.theme?.chroma === theme.chroma && preset.theme?.lightness === theme.lightness}
              onApply={() => applyCustomPreset(preset)}
              onDelete={() => deleteCustomPreset(preset.id)}
            />
          ))}
        </ul>
      ) : <SettingsNote>Nothing saved yet.</SettingsNote>}
    </SettingsGroup>
  );
}

/** Appearance > Colors: color sets, saved colors, and one color at a time. */
export function ColorsSection(props) {
  const { theme, setTheme, randomizeTheme, applyMoodPreset, moodsExpanded, setMoodsExpanded, clearOverrides, activeSurface, setActiveSurface, presetNote } = props;
  const current = resolveMood(theme, MOODS);
  const changed = Object.keys(theme.customVars || {}).length > 0;
  return (
    <SettingsSection
      title="Colors"
      hint={`Change only the colors. The look's corners, spacing and type stay. Now: ${theme.mood}, ${current.mode}.`}
      data-testid="theme-colors-section"
      actions={(
        <>
          <SettingsButton small aria-expanded={moodsExpanded} onClick={() => setMoodsExpanded((v) => !v)}>{moodsExpanded ? 'Hide names' : 'Show names'}</SettingsButton>
          {randomizeTheme && <SettingsButton small onClick={randomizeTheme}>Surprise me</SettingsButton>}
        </>
      )}
    >
      {moodsExpanded ? (
        <div className="hb-set-tiles hb-set-tiles--small">
          {DISPLAY_MOOD_IDS.map((name) => (
            <MoodChip key={name} name={name} mood={MOODS[name]} active={theme.mood === name} onClick={() => applyMoodPreset(name)} />
          ))}
        </div>
      ) : (
        <div className="hb-set-swatches">
          {DISPLAY_MOOD_IDS.map((name) => (
            <MoodSwatch key={name} name={name} mood={MOODS[name]} active={theme.mood === name} onClick={() => applyMoodPreset(name)} />
          ))}
        </div>
      )}
      <SavedColors {...props} />
      <SettingsNote note={presetNote} />
      <SettingsGroup
        title="Fine-tune each color"
        hint="Open one to change just that color."
        actions={changed && <SettingsButton small onClick={clearOverrides}>Undo all</SettingsButton>}
      >
        <SettingsRows>
          {SURFACE_CONTROLS.map((item) => (
            <SurfaceControl key={item.varName} item={item} theme={theme} setTheme={setTheme} activeSurface={activeSurface} setActiveSurface={setActiveSurface} />
          ))}
        </SettingsRows>
      </SettingsGroup>
    </SettingsSection>
  );
}
