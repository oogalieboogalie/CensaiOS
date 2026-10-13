import { MOODS, DEFAULT_THEME, BRAND_LOOK_VERSION, defaultTheme, migrateTheme } from '../src/components/Theme.jsx';
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

describe('brand look by default', () => {
  test('new visitors get the censaiOS look, or Paper when they browse light', () => {
    expect(DEFAULT_LOOK_ID).toBe('censai');
    expect(MOODS.censai.accent.hue).toBe(78);
    expect(matchLook(defaultTheme({ light: false }))).toBe('censai');
    expect(matchLook(defaultTheme({ light: true }))).toBe('paper');
    expect(MOODS.paper.accent.hue).toBe(78);
  });

  test('text on an Ultem fill is dark, because Ultem is bright', () => {
    expect(MOODS.censai.vars['--accent-contrast']).toBe(MOODS.censai.vars['--bg']);
  });

  test('a saved pre-brand theme moves to the brand look once, keeping board settings', () => {
    const old = { ...lookPatch('classic'), gridSnapping: false, fontScale: 1.2 };
    const migrated = migrateTheme(old, { light: false });
    expect(matchLook(migrated)).toBe('censai');
    expect(migrated.gridSnapping).toBe(false);
    expect(migrated.fontScale).toBe(1.2);
    expect(migrated.brandLook).toBe(BRAND_LOOK_VERSION);
    const picked = { ...migrated, ...lookPatch('terminal') };
    expect(matchLook(migrateTheme(picked, { light: false }))).toBe('terminal');
  });

  test('a board already on the cyan brand look takes Ultem once and keeps the rest', () => {
    const cyan = { ...lookPatch('censai'), hue: 211, chroma: 0.123, lightness: 0.755, brandLook: 1, fontScale: 1.1, customVars: { '--surface': 'oklch(0.2 0 0)' } };
    const moved = migrateTheme(cyan, { light: false });
    expect(moved.hue).toBe(78);
    expect(moved.fontScale).toBe(1.1);
    expect(moved.customVars).toEqual({ '--surface': 'oklch(0.2 0 0)' });
    expect(moved.brandLook).toBe(BRAND_LOOK_VERSION);
    const terminal = { ...lookPatch('terminal'), brandLook: 1 };
    expect(migrateTheme(terminal, { light: false })).toMatchObject({ mood: 'terminal', hue: terminal.hue, brandLook: BRAND_LOOK_VERSION });
  });

  test('on Paper, Ultem stays a fill and text and lines take a deeper amber that reads on white', () => {
    const v = MOODS.paper.vars;
    expect(contrastRatio(v['--accent-text'], v['--surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v['--accent-line'], v['--bg'])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(v['--accent-contrast'], 'oklch(0.771 0.14 78)')).toBeGreaterThanOrEqual(4.5);
  });
});
