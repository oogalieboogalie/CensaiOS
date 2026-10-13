/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ThemeAppearanceContent } from '../src/components/theme/ThemeAppearanceContent.jsx';
import { MOODS } from '../src/components/Theme.jsx';
import {
  CURATED_MOOD_IDS,
} from '../src/lib/theme/curatedPresets.js';

function createPanel(overrides = {}) {
  const cream = MOODS.cream;
  return {
    theme: {
      mood: 'cream',
      hue: cream.accent.hue,
      chroma: cream.accent.chroma,
      lightness: cream.accent.lightness,
      customVars: {},
    },
    setTheme: jest.fn(),
    moodsExpanded: true,
    setMoodsExpanded: jest.fn(),
    customPresets: [],
    savingPreset: false,
    setSavingPreset: jest.fn(),
    presetName: '',
    setPresetName: jest.fn(),
    activeSurface: null,
    setActiveSurface: jest.fn(),
    resetTheme: jest.fn(),
    clearOverrides: jest.fn(),
    applyMoodPreset: jest.fn(),
    randomizeTheme: jest.fn(),
    saveCurrentPreset: jest.fn(),
    applyCustomPreset: jest.fn(),
    deleteCustomPreset: jest.fn(),
    ...overrides,
  };
}

describe('appearance settings presentation', () => {
  test('curated moods resolve to distinct library entries', () => {
    expect(new Set(CURATED_MOOD_IDS).size).toBe(CURATED_MOOD_IDS.length);
    for (const id of CURATED_MOOD_IDS) expect(MOODS[id]).toBeDefined();
  });

  test('no standalone accent picker is rendered (accent comes from the mood)', () => {
    render(<ThemeAppearanceContent panel={createPanel()} />);
    expect(screen.queryByText('Ocean')).not.toBeInTheDocument();
    expect(screen.queryByText('Accent')).not.toBeInTheDocument();
  });

  test('uses the real canvas as the preview and hides catalog noise', () => {
    render(<ThemeAppearanceContent panel={createPanel()} />);

    expect(screen.getByText(/editing the live canvas/i)).toBeInTheDocument();
    expect(screen.queryByText('Live Preview')).not.toBeInTheDocument();

    for (const id of CURATED_MOOD_IDS) {
      expect(screen.getByText(id)).toBeInTheDocument();
    }

    expect(screen.queryByText('openai')).not.toBeInTheDocument();
    expect(screen.queryByText('Python')).not.toBeInTheDocument();
  });

  test('applies a curated mood through the existing theme update path', () => {
    const panel = createPanel();
    render(<ThemeAppearanceContent panel={panel} />);

    fireEvent.click(screen.getByTitle('midnight'));

    expect(panel.applyMoodPreset).toHaveBeenCalledWith('midnight');
  });
});
