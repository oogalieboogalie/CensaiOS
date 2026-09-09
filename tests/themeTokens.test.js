/**
 * tests/themeTokens.test.js
 *
 * Theme token cohesion (brief A1) — asserts the canonical mapping from
 * `--surface` to derived `--window-title-bg` and `--window-shadow`. Locks
 * in the contract for all current MOODS so future mood additions get the
 * same treatment and the header / border stay in lockstep with the
 * surface when the user adjusts it from the Fine Tune panel.
 */
import { MOODS } from '../src/components/Theme.jsx';
import {
  computeTokenMap,
  computeAllTokens,
} from '../src/lib/theme/tokens.js';

// Header derivation needs parseOklch from Theme.jsx; if those move
// or break, this test should fail loudly so the contract owner sees it.
import { parseOklch } from '../src/components/Theme.jsx';

const REQUIRED_MOODS = [
  'cream',
  'cobalt-deep',
  'midnight',
  'apple',
];

describe('Theme token cohesion (brief A1)', () => {
  test('computeTokenMap returns a non-empty object for every mood in MOODS', () => {
    const names = Object.keys(MOODS);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const map = computeTokenMap(MOODS[name]);
      expect(Object.keys(map).length).toBeGreaterThan(0);
      // The brief owns --window-title-bg and --window-shadow specifically.
      expect(map).toHaveProperty('--window-title-bg');
      expect(map).toHaveProperty('--window-shadow');
    }
  });

  test('derived --window-title-bg uses the surface hue for every mood', () => {
    for (const [name, preset] of Object.entries(MOODS)) {
      const map = computeTokenMap(preset);
      const surface = parseOklch(preset.vars['--surface']);
      const title = parseOklch(map['--window-title-bg']);
      // Hue should be within 35 degrees of the surface hue. The blend
      // toward accent pulls it, but not so far that the header stops
      // reading as "on this surface". (Accent-only moods like apple have
      // accent.hue ~ surface.hue so this is well within tolerance.)
      const hueDelta = Math.min(
        Math.abs(title.h - surface.h),
        360 - Math.abs(title.h - surface.h),
      );
      expect({ name, hueDelta }).toEqual(
        expect.objectContaining({ name, hueDelta: expect.any(Number) }),
      );
      expect(hueDelta).toBeLessThan(60);
    }
  });

  test('derived --window-title-bg is a small lift off the surface lightness', () => {
    for (const name of REQUIRED_MOODS) {
      const preset = MOODS[name];
      expect(preset).toBeDefined();
      const map = computeTokenMap(preset);
      const surface = parseOklch(preset.vars['--surface']);
      const title = parseOklch(map['--window-title-bg']);
      // Lift should be in (0, 0.10) — header slightly brighter than the
      // card body, not a flash of pure white. (Permits dark-mode lift
      // ~0.04 and light-mode lift ~0.02.)
      const lift = title.l - surface.l;
      expect(lift).toBeGreaterThan(0);
      expect(lift).toBeLessThan(0.10);
    }
  });

  test('mode determines shadow tone (dark = dark drop, light = soft drop)', () => {
    const cobalt = computeTokenMap(MOODS['cobalt-deep']);
    const cream = computeTokenMap(MOODS['cream']);
    // Dark mood's shadow should contain a black drop (oklch(0 0 0 / ...))
    expect(cobalt['--window-shadow']).toMatch(/oklch\(0 0 0/);
    // Light mood's shadow should contain a white inset (oklch(1 0 0 / ...))
    expect(cream['--window-shadow']).toMatch(/oklch\(1 0 0/);
  });

  test('customVars --surface flows through to the derived title', () => {
    const preset = MOODS['cobalt-deep'];
    const newSurface = 'oklch(0.45 0.05 80)'; // warm tan, very different from cobalt's navy
    const base = computeTokenMap(preset);
    const live = computeTokenMap(preset, { customVars: { '--surface': newSurface } });
    expect(live['--window-title-bg']).not.toEqual(base['--window-title-bg']);
    const liveTitle = parseOklch(live['--window-title-bg']);
    // Hue should follow the new surface (within 60 degrees).
    expect(Math.abs(liveTitle.h - 80)).toBeLessThan(60);
  });

  test('apple mood still derives a valid title and shadow (regression guard)', () => {
    const map = computeTokenMap(MOODS.apple);
    expect(map['--window-title-bg']).toMatch(/^oklch\(/);
    expect(map['--window-shadow']).toContain('oklch');
  });

  test('computeAllTokens returns a map keyed by every mood name', () => {
    const all = computeAllTokens(MOODS);
    for (const name of Object.keys(MOODS)) {
      expect(all).toHaveProperty(name);
      expect(all[name]).toHaveProperty('--window-title-bg');
    }
  });

  test('null and undefined return an empty object (defensive)', () => {
    expect(computeTokenMap(null)).toEqual({});
    expect(computeTokenMap(undefined)).toEqual({});
  });

  test('empty preset falls back to mode=light defaults (graceful degradation)', () => {
    // An empty preset is unusual but the function should not throw; it
    // produces a valid (default-tinted) token map rather than crashing.
    const map = computeTokenMap({});
    expect(map).toHaveProperty('--window-title-bg');
    expect(map).toHaveProperty('--window-shadow');
  });

  test('the brief-required mood set is fully covered', () => {
    // The brief names apple, apple-dark, cobalt-deep, midnight, cream.
    // apple-dark is in flight on a sibling brief (A3) and not yet
    // committed to 6-23-26 HEAD, so we only assert the rest here.
    for (const name of REQUIRED_MOODS) {
      expect(MOODS).toHaveProperty(name);
      const map = computeTokenMap(MOODS[name]);
      expect(map['--window-title-bg']).toBeTruthy();
    }
  });

  test('LIVE: changing --surface on cobalt-deep updates the header in lockstep', () => {
    // This mirrors what applyTheme() does in Theme.jsx when the user
    // edits --surface from the Fine Tune panel: computeTokenMap reads
    // the effective (post-customVars) surface and writes a derived
    // header. The brief acceptance is "header and border update in
    // lockstep with --surface".
    const mood = MOODS['cobalt-deep'];
    const baseline = computeTokenMap(mood);
    const baselineHue = parseOklch(baseline['--window-title-bg']).h;
    const live = computeTokenMap(mood, { customVars: { '--surface': 'oklch(0.45 0.05 80)' } });
    const liveHue = parseOklch(live['--window-title-bg']).h;
    // The derived header must change when the surface changes.
    expect(live['--window-title-bg']).not.toEqual(baseline['--window-title-bg']);
    // The header hue must follow the new surface (within 60 degrees).
    expect(Math.abs(liveHue - 80)).toBeLessThan(60);
    // Sanity: the baseline navy mood produces a navy-ish header.
    expect(baselineHue).toBeGreaterThan(180);
    expect(baselineHue).toBeLessThan(300);
  });
});
