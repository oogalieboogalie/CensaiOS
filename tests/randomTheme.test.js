import {
  buildRandomThemeCombo,
  chromaBand,
  isTooClose,
  pickScheme,
  schemeAccentHue,
  shiftHue,
  signatureOf,
} from '../src/components/theme/randomTheme.js';

// Deterministic rand so sequences are reproducible.
function seededRand(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('shiftHue', () => {
  test.each([
    [350, 30, 20],
    [10, -30, 340],
    [0, 180, 180],
    [359, 1, 0],
  ])('shiftHue(%i, %i) === %i', (hue, deg, expected) => {
    expect(shiftHue(hue, deg)).toBe(expected);
  });
});

describe('schemeAccentHue', () => {
  const rand = () => 0.9;
  test('mono keeps the base hue', () => {
    expect(schemeAccentHue('mono', 123, rand)).toBe(123);
  });
  test('complementary opposes the base hue', () => {
    expect(schemeAccentHue('complementary', 10, rand)).toBe(190);
  });
  test('analogous/triadic/duotone move off the base hue', () => {
    for (const scheme of ['analogous', 'triadic', 'duotone']) {
      expect(schemeAccentHue(scheme, 100, rand)).not.toBe(100);
    }
  });
});

describe('signatures', () => {
  test('same mode+scheme+neighboring bin counts as too close', () => {
    expect(isTooClose('dark:mono:10', ['dark:mono:11'])).toBe(true);
    expect(isTooClose('dark:mono:10', ['dark:mono:12'])).toBe(false);
    expect(isTooClose('dark:mono:10', ['light:mono:10'])).toBe(false);
    expect(isTooClose('dark:mono:10', ['dark:triadic:10'])).toBe(false);
    expect(isTooClose('dark:mono:10', [])).toBe(false);
  });

  test('signatureOf bins the accent hue', () => {
    expect(signatureOf({ mode: 'dark', scheme: 'mono', accentHue: 149 }))
      .toBe(signatureOf({ mode: 'dark', scheme: 'mono', accentHue: 151 }));
  });
});

describe('buildRandomThemeCombo', () => {
  test('returns a complete theme patch', () => {
    const combo = buildRandomThemeCombo(seededRand());
    expect(combo.scheme).toBeTruthy();
    expect(['dark', 'light']).toContain(combo.mode);
    expect(combo.patch.mood).toBe(combo.mode === 'dark' ? 'midnight' : 'cream');
    for (const key of ['--bg', '--canvas', '--surface', '--surface-2', '--ink', '--ink-soft', '--hairline', '--hairline-strong']) {
      expect(combo.patch.customVars[key]).toMatch(/^oklch\(/);
    }
    expect(combo.patch.hue).toBeGreaterThanOrEqual(0);
    expect(combo.patch.hue).toBeLessThan(360);
  });

  test('click-through stays varied across many draws', () => {
    const rand = seededRand(7);
    const history = [];
    const schemes = new Set();
    const signatures = new Set();
    for (let i = 0; i < 60; i += 1) {
      const combo = buildRandomThemeCombo(rand, history);
      schemes.add(combo.scheme);
      signatures.add(combo.signature);
      history.push(combo.signature);
    }
    expect(schemes.size).toBeGreaterThanOrEqual(4);
    expect(signatures.size).toBeGreaterThanOrEqual(40);
  });

  test('avoids near-repeats of recent combos', () => {
    const rand = seededRand(99);
    const history = [];
    for (let i = 0; i < 12; i += 1) {
      const combo = buildRandomThemeCombo(rand, history);
      expect(isTooClose(combo.signature, history)).toBe(false);
      history.push(combo.signature);
    }
  });

  test('chroma bands cover muted to vivid', () => {
    const bands = new Set();
    const rand = seededRand(3);
    for (let i = 0; i < 40; i += 1) {
      const [lo] = chromaBand(rand);
      bands.add(lo);
    }
    expect(bands.has(0.05) && bands.has(0.14) && bands.has(0.22)).toBe(true);
  });

  test('pickScheme honors weights across draws', () => {
    const counts = {};
    const rand = seededRand(11);
    for (let i = 0; i < 200; i += 1) {
      const scheme = pickScheme(rand);
      counts[scheme] = (counts[scheme] || 0) + 1;
    }
    expect(Object.keys(counts).length).toBe(5);
    expect(counts.mono).toBeGreaterThan(counts.duotone);
  });
});
