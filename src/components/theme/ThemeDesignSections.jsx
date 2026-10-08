import React from 'react';
import { Icon } from '../Icons.jsx';
import { ThemePanelCard } from './ThemeControls.jsx';
import { MoodChip, MoodSwatch, SavedPresetRow } from './ThemePresets.jsx';
import { MOODS } from '../Theme.jsx';
import { CURATED_MOOD_IDS, SPOTLIGHT_MOOD_IDS } from '../../lib/theme/curatedPresets.js';
import { resolveMood } from '../../lib/theme/looks.js';

const DISPLAY_MOOD_IDS = [...SPOTLIGHT_MOOD_IDS, ...CURATED_MOOD_IDS.filter((id) => !SPOTLIGHT_MOOD_IDS.includes(id))];

export function MoodSection({ theme, resetTheme, randomizeTheme, applyMoodPreset, moodsExpanded, setMoodsExpanded }) {
  const selectedMood = resolveMood(theme, MOODS);
  return (
    <ThemePanelCard style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setMoodsExpanded(v => !v)}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}
        >
          <MoodSwatch name={theme.mood} mood={selectedMood} active size={28} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--ink)' }}>Colorway</div>
              <span style={{ color: 'var(--ink-faint)', transform: moodsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-flex' }}>
                <Icon.Down size={12} />
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>{theme.mood} · {selectedMood.mode}</div>
          </div>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <button onClick={() => setMoodsExpanded(v => !v)} style={{ all: 'unset', cursor: 'pointer', padding: '6px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 'var(--text-xs)', fontWeight: 650 }}>
            {moodsExpanded ? 'Collapse' : 'Expand'}
          </button>
          {randomizeTheme && (
            <button onClick={randomizeTheme} style={{ all: 'unset', cursor: 'pointer', padding: '6px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 'var(--text-xs)', fontWeight: 650 }}>
              Randomize
            </button>
          )}
          <button onClick={resetTheme} style={{ all: 'unset', cursor: 'pointer', padding: '6px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 'var(--text-xs)', fontWeight: 650 }}>Reset</button>
        </div>
      </div>
      {moodsExpanded ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 7 }}>
          {DISPLAY_MOOD_IDS.map(name => (
            <MoodChip key={name} name={name} mood={MOODS[name]} active={theme.mood === name} onClick={() => applyMoodPreset(name)} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {DISPLAY_MOOD_IDS.map(name => (
            <MoodSwatch key={name} name={name} mood={MOODS[name]} active={theme.mood === name} onClick={() => applyMoodPreset(name)} />
          ))}
        </div>
      )}
    </ThemePanelCard>
  );
}

export function SavedPresetsSection({
  theme,
  customPresets,
  applyCustomPreset,
  deleteCustomPreset,
  savingPreset,
  setSavingPreset,
  presetName,
  setPresetName,
  saveCurrentPreset
}) {
  return (
    <ThemePanelCard style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--ink)' }}>Saved Presets</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>Save this exact color setup</div>
        </div>
        {!savingPreset && (
          <button onClick={() => { setPresetName(`${theme.mood} ${customPresets.length + 1}`); setSavingPreset(true); }} style={{ all: 'unset', cursor: 'pointer', padding: '6px 9px', borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Save</button>
        )}
      </div>
      {savingPreset && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
          <input
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCurrentPreset();
              if (e.key === 'Escape') { setSavingPreset(false); setPresetName(''); }
            }}
            placeholder="Preset name"
            style={{ minWidth: 0, flex: 1, border: '1px solid var(--hairline)', background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: '6px 8px', font: '12px var(--font-sans)', color: 'var(--ink)', outline: 'none' }}
          />
          <button onClick={saveCurrentPreset} style={{ all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Save</button>
          <button onClick={() => { setSavingPreset(false); setPresetName(''); }} title="Cancel" style={{ all: 'unset', cursor: 'pointer', width: 28, borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-faint)', display: 'grid', placeItems: 'center' }}><Icon.Close size={12} /></button>
        </div>
      )}
      {customPresets.length > 0 ? (
        <div style={{ display: 'grid', gap: 7 }}>
          {customPresets.map(preset => (
            <SavedPresetRow
              key={preset.id}
              preset={preset}
              active={preset.theme?.mood === theme.mood && preset.theme?.hue === theme.hue && preset.theme?.chroma === theme.chroma && preset.theme?.lightness === theme.lightness}
              onApply={() => applyCustomPreset(preset)}
              onDelete={() => deleteCustomPreset(preset.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', border: '1px dashed var(--hairline)', color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>
          No saved presets yet.
        </div>
      )}
    </ThemePanelCard>
  );
}
