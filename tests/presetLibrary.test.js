/**
 * tests/presetLibrary.test.js
 *
 * Brief A2 — PRESET_LIBRARY v0.1 (`.team/handoffs/2026-06-23-a2-preset-library-unification.md`).
 */
import {
  PRESET_LIBRARY,
  SOURCES,
  getPresetSource,
  filterBySource,
  getMoodsView,
  getThemePresetsView,
  listPresetIds,
} from '../src/lib/theme/presetLibrary.js';
import { MOODS, THEME_PRESETS } from '../src/components/Theme.jsx';

describe('PRESET_LIBRARY v0.1 (brief A2)', () => {
  test('PRESET_LIBRARY is a non-empty frozen object keyed by id', () => {
    expect(Object.keys(PRESET_LIBRARY).length).toBeGreaterThan(0);
    expect(Object.isFrozen(PRESET_LIBRARY)).toBe(true);
    for (const [id, entry] of Object.entries(PRESET_LIBRARY)) {
      expect(entry.id).toBe(id);
      expect(typeof entry.label).toBe('string');
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  test('every id in original MOODS exists in PRESET_LIBRARY with source in {mood, neurodivergent}', () => {
    const moodIds = Object.keys(MOODS);
    expect(moodIds.length).toBeGreaterThan(0);
    for (const id of moodIds) {
      const entry = PRESET_LIBRARY[id];
      expect(entry).toBeDefined();
      expect([SOURCES.MOOD, SOURCES.NEURODIVERGENT]).toContain(entry.source);
      expect(entry.mood).toBeDefined();
      expect(entry.mood.mode === 'light' || entry.mood.mode === 'dark').toBe(true);
      expect(entry.mood.accent).toBeDefined();
      expect(entry.mood.vars).toBeDefined();
    }
  });

  test('every id in original THEME_PRESETS exists in PRESET_LIBRARY with source in {language, brand}', () => {
    const presetIds = Object.keys(THEME_PRESETS);
    expect(presetIds.length).toBeGreaterThan(0);
    for (const id of presetIds) {
      const entry = PRESET_LIBRARY[id];
      expect(entry).toBeDefined();
      expect([SOURCES.LANGUAGE, SOURCES.BRAND]).toContain(entry.source);
      expect(entry.accent).toBeDefined();
      expect(typeof entry.accent.hue).toBe('number');
      expect(typeof entry.accent.chroma).toBe('number');
      expect(typeof entry.accent.lightness).toBe('number');
    }
  });

  test('every PRESET_LIBRARY id is renderable (required keys per source)', () => {
    for (const entry of Object.values(PRESET_LIBRARY)) {
      if (entry.source === SOURCES.MOOD || entry.source === SOURCES.NEURODIVERGENT) {
        expect(entry.mood).toBeDefined();
        expect(entry.mood.mode).toMatch(/^(light|dark)$/);
        expect(entry.mood.accent.hue).toEqual(expect.any(Number));
        expect(entry.mood.vars['--bg']).toEqual(expect.any(String));
        expect(entry.mood.vars['--surface']).toEqual(expect.any(String));
        expect(entry.mood.vars['--ink']).toEqual(expect.any(String));
      } else {
        expect(entry.accent).toBeDefined();
        expect(entry.accent.hue).toEqual(expect.any(Number));
        expect(entry.accent.chroma).toEqual(expect.any(Number));
        expect(entry.accent.lightness).toEqual(expect.any(Number));
      }
    }
  });

  test('source tag matches the block carried by the entry (no mood+accent mix)', () => {
    for (const [id, entry] of Object.entries(PRESET_LIBRARY)) {
      // Brief A5 — surface is an OPTIONAL ADDITIVE field, not a third slot
      // in the mutually-exclusive invariant. The contract is: exactly one
      // of {mood, accent}; surface may be present in addition to mood.
      const blockCount = (entry.mood ? 1 : 0) + (entry.accent ? 1 : 0);
      expect({ id, blockCount }).toEqual({ id, blockCount: 1 });
      if (entry.source === SOURCES.MOOD || entry.source === SOURCES.NEURODIVERGENT) {
        expect(entry.mood).toBeDefined();
        expect(entry.accent).toBeUndefined();
      } else {
        expect(entry.accent).toBeDefined();
        expect(entry.mood).toBeUndefined();
      }
    }
  });

  test('round-trip: MOODS derived from PRESET_LIBRARY has the same ids as original MOODS', () => {
    const derived = getMoodsView();
    const derivedIds = Object.keys(derived).sort();
    const originalIds = Object.keys(MOODS).sort();
    expect(derivedIds).toEqual(originalIds);
  });

  test('round-trip: THEME_PRESETS derived from PRESET_LIBRARY has the same ids as original THEME_PRESETS', () => {
    const derived = getThemePresetsView();
    const derivedIds = Object.keys(derived).sort();
    const originalIds = Object.keys(THEME_PRESETS).sort();
    expect(derivedIds).toEqual(originalIds);
  });

  test('round-trip: derived mood preserves {mode, accent, vars} shape with equal values', () => {
    const derived = getMoodsView();
    for (const id of Object.keys(MOODS)) {
      const orig = MOODS[id];
      const next = derived[id];
      expect(next.mode).toBe(orig.mode);
      expect(next.accent).toEqual(orig.accent);
      expect(next.vars).toEqual(orig.vars);
    }
  });

  test('round-trip: derived THEME_PRESETS preserves {hue, chroma, lightness} with equal values', () => {
    const derived = getThemePresetsView();
    for (const id of Object.keys(THEME_PRESETS)) {
      expect(derived[id]).toEqual(THEME_PRESETS[id]);
    }
  });

  test('helpers: getPresetSource returns null for unknown ids', () => {
    expect(getPresetSource('cream')).toBe('mood');
    expect(getPresetSource('python')).toBe('language');
    expect(getPresetSource('render')).toBe('brand');
    expect(getPresetSource('gentle-contrast')).toBe('neurodivergent');
    expect(getPresetSource('does-not-exist')).toBe(null);
    expect(getPresetSource(null)).toBe(null);
    expect(getPresetSource(undefined)).toBe(null);
  });

  test('helpers: filterBySource partitions PRESET_LIBRARY correctly', () => {
    const moods = filterBySource(SOURCES.MOOD);
    const langs = filterBySource(SOURCES.LANGUAGE);
    const brands = filterBySource(SOURCES.BRAND);
    const neuro = filterBySource(SOURCES.NEURODIVERGENT);
    const moodsPlusNeuro = [...Object.keys(moods), ...Object.keys(neuro)].sort();
    expect(moodsPlusNeuro).toEqual(Object.keys(MOODS).sort());
    expect(Object.keys(langs).every((id) => PRESET_LIBRARY[id].source === 'language')).toBe(true);
    expect(Object.keys(brands).every((id) => PRESET_LIBRARY[id].source === 'brand')).toBe(true);
    expect(Object.keys(neuro).sort()).toEqual([
      'calm-focus', 'gentle-contrast', 'low-stim', 'sensory-soft',
    ]);
    expect(Object.keys(langs).length + Object.keys(brands).length).toBe(Object.keys(THEME_PRESETS).length);
    for (const id of Object.keys(neuro)) {
      expect(MOODS).toHaveProperty(id);
      expect(PRESET_LIBRARY[id].mood).toBeDefined();
    }
  });

  test('helpers: listPresetIds returns all ids (or filtered subset)', () => {
    const all = listPresetIds();
    expect(all.sort()).toEqual(Object.keys(PRESET_LIBRARY).sort());
    expect(listPresetIds('mood').sort()).toEqual(
      Object.keys(MOODS).filter((id) => PRESET_LIBRARY[id].source === 'mood').sort()
    );
    expect(listPresetIds('language').length).toBeGreaterThan(0);
    expect(listPresetIds('brand').length).toBeGreaterThan(0);
    expect(listPresetIds('neurodivergent').sort()).toEqual([
      'calm-focus', 'gentle-contrast', 'low-stim', 'sensory-soft',
    ]);
    expect(listPresetIds('bogus')).toEqual([]);
  });

  test('language ids are exactly the 13 ids from the original language stripe group', () => {
    const langIds = listPresetIds('language').sort();
    expect(langIds).toEqual([
      'bash', 'cpp', 'csharp', 'elixir', 'golang', 'java', 'javascript',
      'kotlin', 'python', 'ruby', 'rustlang', 'swift', 'typescript',
    ]);
  });

  test('the brief-required mood set is fully covered', () => {
    for (const id of ['cream', 'cobalt-deep', 'midnight', 'apple']) {
      expect(PRESET_LIBRARY).toHaveProperty(id);
      expect(PRESET_LIBRARY[id].source).toBe('mood');
    }
    for (const id of ['calm-focus', 'low-stim', 'sensory-soft', 'gentle-contrast']) {
      expect(PRESET_LIBRARY).toHaveProperty(id);
      expect(PRESET_LIBRARY[id].source).toBe('neurodivergent');
    }
  });

  test('PRESET_LIBRARY.id is always equal to its key (no orphan ids)', () => {
    for (const [key, entry] of Object.entries(PRESET_LIBRARY)) {
      expect(entry.id).toBe(key);
    }
  });
});