import { MOODS, DEFAULT_THEME } from '../src/components/Theme.jsx';
import {
  CUSTOM_MOOD_ID,
  LOOKS,
  DEFAULT_LOOK_ID,
  SHAPE_KEYS,
  generateCustomMood,
  lookPatch,
  matchLook,
  normalizeShape,
  resolveMood,
  shapeToCssVars,
} from '../src/lib/theme/looks.js';
import { contrastFailures, contrastRatio } from '../src/lib/theme/contrast.js';
import { exportThemeFile, parseThemeFile, serializeThemeFile } from '../src/lib/theme/themeFile.js';

describe('design-system looks', () => {
  test('offers at least six curated looks, each with a real colorway', () => {
    expect(Object.keys(LOOKS).length).toBeGreaterThanOrEqual(6);
    for (const [id, look] of Object.entries(LOOKS)) {
      expect(MOODS[look.mood]).toBeDefined();
      for (const key of SHAPE_KEYS) expect(look.shape).toHaveProperty(key);
      expect(matchLook({ ...lookPatch(id) })).toBe(id);
    }
  });

  test('looks change shape, not just color', () => {
    const shapes = Object.values(LOOKS).map((l) => JSON.stringify(l.shape));
    expect(new Set(shapes).size).toBeGreaterThanOrEqual(5);
    expect(LOOKS.terminal.shape.radiusScale).toBeLessThan(LOOKS.studio.shape.radiusScale);
    expect(LOOKS.terminal.shape.density).toBe('compact');
    expect(LOOKS.studio.shape.density).toBe('comfortable');
  });

  test('default theme is the restrained look: no glow, no gloss, sentence-case labels', () => {
    expect(DEFAULT_THEME.mood).toBe(LOOKS[DEFAULT_LOOK_ID].mood);
    expect(matchLook(DEFAULT_THEME)).toBe(DEFAULT_LOOK_ID);
    const vars = shapeToCssVars(DEFAULT_THEME);
    expect(vars['--gloss-sheen']).toBe('none');
    expect(vars['--label-case']).toBe('none');
  });

  test('shape knobs become CSS variables', () => {
    const vars = shapeToCssVars({ radiusScale: 0.5, density: 'compact', motion: 'none', glass: 0.5, fontPair: 'mono', labelStyle: 'mono-caps' });
    expect(vars['--radius-scale']).toBe('0.5');
    expect(vars['--density']).toBe('0.85');
    expect(vars['--motion-scale']).toBe('0');
    expect(vars['--label-case']).toBe('uppercase');
    expect(vars['--font-sans']).toMatch(/Mono/);
    expect(vars['--window-backdrop']).toMatch(/blur\(12px\)/);
  });

  test('normalizeShape clamps and falls back for old or hostile input', () => {
    expect(normalizeShape({ radiusScale: 'x', density: 'huge', glass: 9 })).toEqual({ ...normalizeShape({}), glass: 1 });
    expect(normalizeShape({ radiusScale: -3 }).radiusScale).toBe(0);
    expect(normalizeShape({ radiusScale: 99 }).radiusScale).toBe(2);
  });

  test('custom colorway resolves through resolveMood', () => {
    const mood = resolveMood({ mood: CUSTOM_MOOD_ID, customColors: { mode: 'light', baseHue: 30, tint: 0.02, accentHue: 300 } }, MOODS);
    expect(mood.mode).toBe('light');
    expect(mood.accent.hue).toBe(300);
    expect(resolveMood({ mood: 'nope' }, MOODS)).toBe(MOODS.cream);
  });
});

describe('contrast', () => {
  test('ratio math matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('oklch(1 0 0)', 'oklch(0 0 0)')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  test.each(Object.entries(LOOKS))('look "%s" keeps text at 4.5:1 or better', (id, look) => {
    expect(contrastFailures(MOODS[look.mood].vars)).toEqual([]);
  });

  test('every Custom combination stays readable', () => {
    for (const mode of ['dark', 'light']) {
      for (let baseHue = 0; baseHue < 360; baseHue += 30) {
        for (const tint of [0, 0.02, 0.04]) {
          const mood = generateCustomMood({ mode, baseHue, tint, accentHue: baseHue });
          expect({ mode, baseHue, tint, failures: contrastFailures(mood.vars) }).toEqual({ mode, baseHue, tint, failures: [] });
        }
      }
    }
  });
});

describe('theme file export / import', () => {
  test('round-trips a curated look', () => {
    const theme = { ...DEFAULT_THEME, ...lookPatch('studio') };
    const parsed = parseThemeFile(serializeThemeFile(theme, 'Studio copy'), MOODS);
    expect(parsed.ok).toBe(true);
    expect(parsed.name).toBe('Studio copy');
    expect(matchLook(parsed.patch)).toBe('studio');
  });

  test('round-trips a custom colorway', () => {
    const theme = { ...DEFAULT_THEME, mood: CUSTOM_MOOD_ID, customColors: { mode: 'light', baseHue: 90, tint: 0.01, accentHue: 20 } };
    const parsed = parseThemeFile(JSON.stringify(exportThemeFile(theme, 'Mine')), MOODS);
    expect(parsed.ok).toBe(true);
    expect(parsed.patch.customColors).toEqual(theme.customColors);
  });

  test('rejects junk and strips unsafe custom values', () => {
    expect(parseThemeFile('not json', MOODS).ok).toBe(false);
    expect(parseThemeFile({ format: 'other' }, MOODS).ok).toBe(false);
    expect(parseThemeFile({ format: 'homebase-theme', version: 1, colors: { mood: 'missing' } }, MOODS).ok).toBe(false);
    const parsed = parseThemeFile({
      format: 'homebase-theme',
      version: 1,
      colors: {
        mood: 'graphite',
        customVars: {
          '--surface': 'oklch(0.2 0 0)',
          '--bg': 'url(https://evil.example/x.png)',
          '--ink': 'red; } body { display:none',
          'not-a-var': 'oklch(1 0 0)',
        },
      },
      shape: { radiusScale: 50, density: 'compact' },
    }, MOODS);
    expect(parsed.ok).toBe(true);
    expect(parsed.patch.customVars).toEqual({ '--surface': 'oklch(0.2 0 0)' });
    expect(parsed.patch.radiusScale).toBe(2);
    expect(parsed.patch.density).toBe('compact');
  });
});
