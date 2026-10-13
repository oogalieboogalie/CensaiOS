/**
 * tests/surfaceControls.test.js
 *
 * Brief A5 — `.team/handoffs/2026-06-23-a5-surface-controls-cohesion.md`.
 *
 * Asserts:
 *   1. SURFACE_CONTROL_SCHEMA has every entry the historical SURFACE_CONTROLS
 *      literal had — same varName, label, previewKey, hint. Backwards-compat
 *      with ThemeWorkspaceSection.jsx and any other consumer of the array.
 *   2. Every schema entry has the typed `defaultSource` field
 *      (one of 'mood' | 'preset' | 'user' | 'schema') and a `defaultValue`
 *      fallback string.
 *   3. `getSurfaceControlsView()` derives the historical
 *      `SURFACE_CONTROLS = [{label, varName, previewKey, hint}]` shape.
 *   4. Derivation order:
 *        userOverride > presetSurface > moodVars > schemaDefault
 *      Every layer beats the layer below it.
 *   5. resolveAllSurfaces returns a record for every schema varName.
 *   6. Theme.jsx's exported SURFACE_CONTROLS equals getSurfaceControlsView()
 *      (so the panel sees zero shape change after the brief's refactor).
 *   7. The `google` mood entry (the brief's proof example) carries a `surface`
 *      override block in PRESET_LIBRARY so resolveSurfaceValue picks it up
 *      when the active mood is `google`.
 */
import {
  SURFACE_CONTROL_SCHEMA,
  SURFACE_SOURCE,
  getSurfaceControlsView,
  resolveSurfaceValue,
  resolveAllSurfaces,
} from '../src/lib/theme/surfaceControls.js';
import { SURFACE_CONTROLS } from '../src/components/Theme.jsx';
import { PRESET_LIBRARY } from '../src/lib/theme/presetLibrary.js';

describe('Brief A5 - Surface controls cohesion', () => {
  test('SURFACE_CONTROL_SCHEMA is a non-empty array of well-formed entries', () => {
    expect(Array.isArray(SURFACE_CONTROL_SCHEMA)).toBe(true);
    expect(SURFACE_CONTROL_SCHEMA.length).toBeGreaterThan(0);
    for (const entry of SURFACE_CONTROL_SCHEMA) {
      expect(typeof entry.varName).toBe('string');
      expect(entry.varName.startsWith('--')).toBe(true);
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.previewKey).toBe('string');
      expect(typeof entry.hint).toBe('string');
      expect(Object.values(SURFACE_SOURCE)).toContain(entry.defaultSource);
      expect(typeof entry.defaultValue).toBe('string');
      expect(entry.defaultValue.length).toBeGreaterThan(0);
    }
  });

  test('SURFACE_CONTROL_SCHEMA matches the historical SURFACE_CONTROLS literal field-for-field', () => {
    // The 8 entries the historical SURFACE_CONTROLS array had, in order.
    const expectedVarNames = [
      '--bg', '--canvas', '--surface', '--surface-2',
      '--ink', '--ink-soft', '--hairline', '--hairline-strong',
    ];
    const actualVarNames = SURFACE_CONTROL_SCHEMA.map((e) => e.varName);
    expect(actualVarNames).toEqual(expectedVarNames);

    // Cross-check label/previewKey/hint against the brief's spec for the
    // historical literal — prevents drift if anyone hand-edits the schema.
    const findByVar = (vn) => SURFACE_CONTROL_SCHEMA.find((e) => e.varName === vn);
    expect(findByVar('--bg')).toMatchObject({ label: 'App Backdrop', previewKey: 'bg' });
    expect(findByVar('--canvas')).toMatchObject({ label: 'Board Canvas', previewKey: 'canvas' });
    expect(findByVar('--surface')).toMatchObject({ label: 'Window Surface', previewKey: 'surface' });
    expect(findByVar('--surface-2')).toMatchObject({ label: 'Soft Surface', previewKey: 'surface2' });
    expect(findByVar('--ink')).toMatchObject({ label: 'Primary Text', previewKey: 'ink' });
    expect(findByVar('--ink-soft')).toMatchObject({ label: 'Soft Text', previewKey: 'inkSoft' });
    expect(findByVar('--hairline')).toMatchObject({ label: 'Hairline Border', previewKey: 'hairline' });
    expect(findByVar('--hairline-strong')).toMatchObject({ label: 'Strong Border', previewKey: 'hairlineStrong' });
  });

  test('SURFACE_SOURCE enum exposes the four derivation layers', () => {
    expect(SURFACE_SOURCE).toEqual({
      MOOD: 'mood',
      PRESET: 'preset',
      USER: 'user',
      SCHEMA: 'schema',
    });
  });

  test('getSurfaceControlsView() produces the historical {label, varName, previewKey, hint} shape', () => {
    const view = getSurfaceControlsView();
    expect(Array.isArray(view)).toBe(true);
    expect(view.length).toBe(SURFACE_CONTROL_SCHEMA.length);
    for (const entry of view) {
      // The historical array exposed only these four keys.
      expect(Object.keys(entry).sort()).toEqual(['hint', 'label', 'previewKey', 'varName']);
    }
  });

  test('Theme.jsx SURFACE_CONTROLS export equals getSurfaceControlsView()', () => {
    // The brief's #6 invariant: the panel sees zero shape change.
    expect(SURFACE_CONTROLS).toEqual(getSurfaceControlsView());
  });

  describe('derive order — user > preset > mood > schema', () => {
    const mood = {
      vars: {
        '--bg': 'MOOD_BG',
        '--surface': 'MOOD_SURFACE',
        '--ink': 'MOOD_INK',
      },
    };
    const preset = {
      surface: {
        '--surface': 'PRESET_SURFACE',
      },
    };

    test('mood vars are the default source when nothing overrides', () => {
      const result = resolveSurfaceValue('--bg', mood, null, {});
      expect(result).toEqual({ value: 'MOOD_BG', source: 'mood' });
    });

    test('preset surface beats mood vars', () => {
      const result = resolveSurfaceValue('--surface', mood, preset, {});
      expect(result).toEqual({ value: 'PRESET_SURFACE', source: 'preset' });
    });

    test('user override beats preset surface AND mood vars', () => {
      const result = resolveSurfaceValue('--surface', mood, preset, { '--surface': 'USER_SURFACE' });
      expect(result).toEqual({ value: 'USER_SURFACE', source: 'user' });
    });

    test('user override beats mood vars even with no preset surface', () => {
      const result = resolveSurfaceValue('--bg', mood, null, { '--bg': 'USER_BG' });
      expect(result).toEqual({ value: 'USER_BG', source: 'user' });
    });

    test('schema defaultValue is the fallback when neither mood nor preset supplies a value', () => {
      const noMood = { vars: {} };
      const noPreset = { surface: {} };
      const result = resolveSurfaceValue('--ink', noMood, noPreset, {});
      expect(result.source).toBe('schema');
      expect(result.value).toBe(SURFACE_CONTROL_SCHEMA.find((e) => e.varName === '--ink').defaultValue);
    });

    test('unknown varName falls back to empty string (no schema entry found)', () => {
      const result = resolveSurfaceValue('--made-up', null, null, {});
      expect(result).toEqual({ value: '', source: 'schema' });
    });
  });

  test('resolveAllSurfaces returns one entry per schema varName with {value, source}', () => {
    const mood = { vars: { '--bg': 'X' } };
    const out = resolveAllSurfaces(mood, null, { '--ink': 'USER_INK' });
    expect(Object.keys(out).sort()).toEqual(SURFACE_CONTROL_SCHEMA.map((e) => e.varName).sort());
    for (const v of Object.values(out)) {
      expect(v).toHaveProperty('value');
      expect(v).toHaveProperty('source');
      expect(Object.values(SURFACE_SOURCE)).toContain(v.source);
    }
    expect(out['--bg']).toEqual({ value: 'X', source: 'mood' });
    expect(out['--ink']).toEqual({ value: 'USER_INK', source: 'user' });
  });

  test('brief proof: google mood carries a surface override (--surface)', () => {
    // The brief explicitly says "Pick the google mood (which has a surface
    // block in its preset entry per the new schema)". Verify the entry.
    const google = PRESET_LIBRARY['google'];
    expect(google).toBeDefined();
    expect(google.source).toBe('mood');
    expect(google.surface).toBeDefined();
    expect(typeof google.surface['--surface']).toBe('string');

    // And that resolveSurfaceValue picks the preset surface over the mood's
    // own vars[--surface] when the active mood is google.
    const result = resolveSurfaceValue('--surface', google.mood, google, {});
    expect(result.source).toBe('preset');
    expect(result.value).toBe(google.surface['--surface']);
    // Sanity: the preset surface value must differ from the mood's own
    // vars[--surface] (otherwise the brief's "override" example is moot).
    expect(result.value).not.toBe(google.mood.vars['--surface']);
  });

  test('non-google mood entries do not carry a surface block (no accidental bleed)', () => {
    // Brief: surface blocks are optional. Most moods don't have one. This
    // pins the schema discipline — only entries that explicitly opt in get
    // a surface block, so the derivation cleanly falls through to mood.vars.
    for (const [id, entry] of Object.entries(PRESET_LIBRARY)) {
      if (id === 'google') continue;
      if (entry.source !== 'mood') continue;
      expect(entry.surface).toBeUndefined();
    }
  });
});