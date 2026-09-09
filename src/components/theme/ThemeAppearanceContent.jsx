import React from 'react';
import { MoodSection, SavedPresetsSection } from './ThemeDesignSections.jsx';
import { FineTuneSection } from './ThemeWorkspaceSection.jsx';

export function ThemeAppearanceContent({ panel }) {
  const {
    theme,
    setTheme,
    moodsExpanded,
    setMoodsExpanded,
    customPresets,
    savingPreset,
    setSavingPreset,
    presetName,
    setPresetName,
    activeSurface,
    setActiveSurface,
    resetTheme,
    clearOverrides,
    applyMoodPreset,
    randomizeTheme,
    saveCurrentPreset,
    applyCustomPreset,
    deleteCustomPreset,
  } = panel;

  return (
    <div
      data-testid="theme-appearance-content"
      style={{ overflowY: 'auto', paddingRight: 6, display: 'grid', gap: 14, alignContent: 'start', flex: 1, minHeight: 0, height: '100%' }}
    >
      <div style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent-ink)', fontSize: 11, lineHeight: 1.45 }}>
        You are editing the live canvas. Every open window updates as you make changes.
      </div>
      <MoodSection
        theme={theme}
        resetTheme={resetTheme}
        randomizeTheme={randomizeTheme}
        applyMoodPreset={applyMoodPreset}
        moodsExpanded={moodsExpanded}
        setMoodsExpanded={setMoodsExpanded}
      />
      <SavedPresetsSection
        theme={theme}
        customPresets={customPresets}
        applyCustomPreset={applyCustomPreset}
        deleteCustomPreset={deleteCustomPreset}
        savingPreset={savingPreset}
        setSavingPreset={setSavingPreset}
        presetName={presetName}
        setPresetName={setPresetName}
        saveCurrentPreset={saveCurrentPreset}
      />
      <FineTuneSection
        theme={theme}
        setTheme={setTheme}
        clearOverrides={clearOverrides}
        activeSurface={activeSurface}
        setActiveSurface={setActiveSurface}
      />
    </div>
  );
}
