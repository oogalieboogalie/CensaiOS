import {
  PRESET_LIBRARY,
  SOURCES,
  getMoodsView,
} from '../src/lib/theme/presetLibrary.js';
import {
  RANDOMIZE_MOOD_IDS,
  SPOTLIGHT_MOOD_IDS,
  pickSpotlightMood,
} from '../src/lib/theme/curatedPresets.js';

function lightnessOf(oklch) {
  const match = /^oklch\(\s*([0-9.]+)/.exec(String(oklch || ''));
  return match ? Number(match[1]) : null;
}

test('spotlight lists exactly the 28 crowd-pleasers, no repeats', () => {
  expect(SPOTLIGHT_MOOD_IDS).toHaveLength(28);
  expect(new Set(SPOTLIGHT_MOOD_IDS).size).toBe(28);
});

test('every spotlight id is a full mood in the library', () => {
  const moods = getMoodsView();
  for (const id of SPOTLIGHT_MOOD_IDS) {
    const entry = PRESET_LIBRARY[id];
    expect(entry).toBeDefined();
    expect(entry.source).toBe(SOURCES.MOOD);
    expect(entry.mood.mode).toMatch(/^(light|dark)$/);
    expect(typeof entry.mood.accent.hue).toBe('number');
    for (const token of ['--bg', '--canvas', '--surface', '--ink', '--ink-soft', '--hairline']) {
      expect(typeof entry.mood.vars[token]).toBe('string');
    }
    expect(moods[id]).toBeDefined();
  }
});

test('spotlight moods keep text readable on their background', () => {
  for (const id of SPOTLIGHT_MOOD_IDS) {
    const vars = PRESET_LIBRARY[id].mood.vars;
    const bg = lightnessOf(vars['--bg']);
    const ink = lightnessOf(vars['--ink']);
    expect(bg).not.toBeNull();
    expect(ink).not.toBeNull();
    expect(Math.abs(bg - ink)).toBeGreaterThan(0.5);
  }
});

test('acrylic moods hit hard: high-chroma accents on near-black or white', () => {
  for (const id of SPOTLIGHT_MOOD_IDS.filter((entry) => entry.startsWith('acrylic-'))) {
    const mood = PRESET_LIBRARY[id].mood;
    expect(mood.accent.chroma).toBeGreaterThanOrEqual(0.26);
    const bg = lightnessOf(mood.vars['--bg']);
    const darkStage = bg < 0.2;
    const whiteStage = bg > 0.95;
    expect(darkStage || whiteStage).toBe(true);
  }
});

test('pickSpotlightMood avoids the current mood and stays in the list', () => {
  const zeroth = () => 0;
  expect(pickSpotlightMood('forest-gold', zeroth)).toBe('lagoon');
  for (let i = 0; i < 50; i += 1) {
    const pick = pickSpotlightMood('ember', Math.random);
    expect(RANDOMIZE_MOOD_IDS).toContain(pick);
    expect(pick).not.toBe('ember');
  }
});

test('randomize pool is bangers only: subset of spotlight, no near-whites', () => {
  for (const id of RANDOMIZE_MOOD_IDS) {
    expect(SPOTLIGHT_MOOD_IDS).toContain(id);
  }
  for (const quiet of ['trusty-blue', 'ink-paper', 'slate-corporate', 'ocean-calm', 'warm-cream', 'arctic', 'matcha', 'denim']) {
    expect(RANDOMIZE_MOOD_IDS).not.toContain(quiet);
    // Quiet ones stay clickable: they must still be real moods.
    expect(PRESET_LIBRARY[quiet]).toBeDefined();
  }
});
