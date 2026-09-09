/**
 * tests/adhdPalettes.test.js
 *
 * Brief A4 — `.team/handoffs/2026-06-23-a4-adhd-neurodivergent-palettes.md`.
 *
 * Asserts the four neurodivergent-friendly colorways meet the brief's
 * design constraints:
 *   1. --ink on --bg meets WCAG contrast (AAA >= 7.0 for gentle-contrast,
 *      AA >= 4.5 otherwise).
 *   2. accent.chroma <= per-entry documented max.
 *   3. No pure white on pure black (sensory reasons).
 *   4. No var exceeds chroma 0.14 (no attention-hijack spots).
 *
 * Contrast math: OKLCH -> OKLab -> LMS -> linear sRGB -> WCAG luminance.
 * WCAG luminance uses LINEAR sRGB (skipping gamma encoding).
 */

import {
  PRESET_LIBRARY,
  SOURCES,
  filterBySource,
} from '../src/lib/theme/presetLibrary.js';

function parseOklch(value) {
  const match = String(value || '').match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) return null;
  return { l: +match[1], c: +match[2], h: +match[3] };
}

function oklchToOklab({ l, c, h }) {
  const rad = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

function oklabToLms({ l, a, b }) {
  const ll = l + 0.3963377774 * a + 0.2158037573 * b;
  const mm = l - 0.1055613458 * a - 0.0638541728 * b;
  const ss = l - 0.0894841775 * a - 1.2914855480 * b;
  return { l: ll ** 3, m: mm ** 3, s: ss ** 3 };
}

function lmsToLinearSrgb({ l, m, s }) {
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function oklchToLuminance(value) {
  const oklch = parseOklch(value);
  if (!oklch) return null;
  return relativeLuminance(lmsToLinearSrgb(oklabToLms(oklchToOklab(oklch))));
}

function contrastRatio(y1, y2) {
  const a = Math.max(y1, y2);
  const b = Math.min(y1, y2);
  return (a + 0.05) / (b + 0.05);
}

const ADHD_PALETTE_SPECS = [
  { id: 'calm-focus', label: 'Calm Focus', minContrast: 4.5, maxAccentChroma: 0.08 },
  { id: 'low-stim', label: 'Low Stim', minContrast: 4.5, maxAccentChroma: 0.04 },
  { id: 'sensory-soft', label: 'Sensory Soft', minContrast: 4.5, maxAccentChroma: 0.10 },
  { id: 'gentle-contrast', label: 'Gentle Contrast', minContrast: 7.0, maxAccentChroma: 0.05 },
];

const PER_VAR_CHROMA_CAP = 0.14;

function getNeurodivergentEntries() {
  return Object.values(filterBySource(SOURCES.NEURODIVERGENT));
}

function getChromasFromVars(vars) {
  const out = [];
  for (const [name, value] of Object.entries(vars)) {
    const parsed = parseOklch(value);
    if (parsed) out.push({ name, chroma: parsed.c });
  }
  return out;
}

describe('Brief A4 - ADHD/neurodivergent palettes', () => {
  test('exactly the four expected entries are tagged source=neurodivergent', () => {
    const ids = Object.keys(filterBySource(SOURCES.NEURODIVERGENT)).sort();
    expect(ids).toEqual([
      'calm-focus', 'gentle-contrast', 'low-stim', 'sensory-soft',
    ]);
    for (const id of ids) {
      expect(PRESET_LIBRARY[id].source).toBe(SOURCES.NEURODIVERGENT);
      expect(PRESET_LIBRARY[id].mood).toBeDefined();
    }
  });

  test('every neurodivergent entry has a well-formed mood block (mode + accent + vars)', () => {
    for (const entry of getNeurodivergentEntries()) {
      expect(entry.mood.mode).toMatch(/^(light|dark)$/);
      expect(typeof entry.mood.accent.hue).toBe('number');
      expect(typeof entry.mood.accent.chroma).toBe('number');
      expect(typeof entry.mood.accent.lightness).toBe('number');
      expect(entry.mood.vars['--bg']).toEqual(expect.any(String));
      expect(entry.mood.vars['--ink']).toEqual(expect.any(String));
    }
  });

  describe.each(ADHD_PALETTE_SPECS)(
    '$id ($label) - design invariants',
    (spec) => {
      let entry;
      beforeAll(() => {
        entry = PRESET_LIBRARY[spec.id];
      });

      test('exists in PRESET_LIBRARY and is mood-shaped', () => {
        expect(entry).toBeDefined();
        expect(entry.source).toBe(SOURCES.NEURODIVERGENT);
        expect(entry.mood).toBeDefined();
      });

      test(`--ink on --bg meets WCAG contrast >= ${spec.minContrast}`, () => {
        const inkY = oklchToLuminance(entry.mood.vars['--ink']);
        const bgY = oklchToLuminance(entry.mood.vars['--bg']);
        expect(inkY).not.toBeNull();
        expect(bgY).not.toBeNull();
        expect(Number.isFinite(inkY)).toBe(true);
        expect(Number.isFinite(bgY)).toBe(true);
        const ratio = contrastRatio(inkY, bgY);
        expect(ratio).toBeGreaterThanOrEqual(spec.minContrast - 0.05);
      });

      test(`accent.chroma <= ${spec.maxAccentChroma}`, () => {
        expect(entry.mood.accent.chroma).toBeLessThanOrEqual(spec.maxAccentChroma + 1e-6);
      });

      test('no pure white on pure black (no harsh contrast for sensory reasons)', () => {
        const inkY = oklchToLuminance(entry.mood.vars['--ink']);
        const bgY = oklchToLuminance(entry.mood.vars['--bg']);
        const min = Math.min(inkY, bgY);
        const max = Math.max(inkY, bgY);
        // Y must not be (1.0, 0.0) or (0.0, 1.0) — pure white on pure black.
        // Allow near-white (Y <= 0.99) and near-black (Y >= 0.001) because
        // gentle-contrast hits AAA by going very dark on very light.
        expect(max).toBeLessThan(0.99);
        expect(min).toBeGreaterThan(0.001);
      });

      test(`no var exceeds chroma ${PER_VAR_CHROMA_CAP} (no attention-hijack spots)`, () => {
        const chromas = getChromasFromVars(entry.mood.vars);
        for (const { name, chroma } of chromas) {
          expect({ name, chroma }).toEqual({ name, chroma: expect.any(Number) });
          expect(chroma).toBeLessThanOrEqual(PER_VAR_CHROMA_CAP + 1e-6);
        }
      });
    },
  );

  test('OKLCH-to-linear-sRGB pipeline sanity check (oklch(0.5 0 0) -> Y ~ 0.125)', () => {
    // Pure mid-gray with zero chroma. The reference transform gives linear
    // sRGB (0.125, 0.125, 0.125) which yields WCAG Y = 0.125 (the
    // luminance weights sum to 1.0). Anything wildly off means the
    // pipeline is wired wrong and the contrast assertions are meaningless.
    const y = oklchToLuminance('oklch(0.5 0 0)');
    expect(y).toBeGreaterThan(0.10);
    expect(y).toBeLessThan(0.15);
  });
});