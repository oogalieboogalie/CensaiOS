/**
 * A3 — Black apple variant parity
 *
 * Verifies that `apple` and `apple-dark` are a true light/dark pair.
 *
 *   1. Both entries are valid MOODS with all required chrome tokens.
 *   2. Same chrome shape: --window-radius, --window-title-backdrop,
 *      --window-bg structure, control flags all identical.
 *   3. Same brand voice: hue 260, identical chroma.
 *   4. Inverted lightness bands: dark surface L < light surface L (mirror).
 *   5. Dark mode marker (mode === 'dark'), light marker (mode === 'light').
 *
 * The mood picker auto-wires via Object.keys(MOODS) in
 * src/components/theme/ThemeDesignSections.jsx, so adding the entry is
 * sufficient — no hand-wiring.
 *
 * Compatibility note: this test asserts the MOOD DATA contract only
 * (no import of src/lib/theme/tokens.js). That means it passes whether
 * A1's token-cohesion computeTokenMap derivation is wired or not —
 * apple-dark's hand-picked --window-title-bg and --window-shadow are
 * either the runtime values (A1 absent) or get transparently overridden
 * by the derivation (A1 present). Both paths produce a dark glass header.
 */
import { describe, it, expect } from '@jest/globals';
import { MOODS, parseOklch } from '../src/components/Theme.jsx';

const SURFACE_KEYS = ['--bg', '--canvas', '--surface', '--surface-2', '--hairline', '--hairline-strong', '--ink', '--ink-soft', '--ink-faint'];
const CHROME_KEYS = ['--window-bg', '--window-title-bg', '--window-radius', '--window-shadow', '--window-title-backdrop'];

describe('themeApples — apple / apple-dark pair', () => {
  it('exposes both apple and apple-dark in MOODS', () => {
    expect(MOODS.apple).toBeDefined();
    expect(MOODS['apple-dark']).toBeDefined();
  });

  it('apple is the light-mode variant', () => {
    expect(MOODS.apple.mode).toBe('light');
  });

  it('apple-dark is the dark-mode variant', () => {
    expect(MOODS['apple-dark'].mode).toBe('dark');
  });

  it('apple and apple-dark share the same accent brand voice (hue 260, identical chroma)', () => {
    expect(MOODS.apple.accent.hue).toBe(260);
    expect(MOODS['apple-dark'].accent.hue).toBe(260);
    expect(MOODS['apple-dark'].accent.chroma).toBeCloseTo(MOODS.apple.accent.chroma, 6);
    expect(MOODS['apple-dark'].accent.lightness).toBeCloseTo(MOODS.apple.accent.lightness, 6);
  });

  it('chrome shape is identical between apple and apple-dark (radius, backdrop, control flags)', () => {
    // These four define the "frosted glass, 16px, blur(12px) saturate(1.25)" chrome —
    // the brief's acceptance criterion: "chrome shape matches, only lightness bands differ".
    expect(MOODS['apple-dark'].vars['--window-radius']).toBe(MOODS.apple.vars['--window-radius']);
    expect(MOODS['apple-dark'].vars['--window-title-backdrop']).toBe(MOODS.apple.vars['--window-title-backdrop']);
    expect(MOODS['apple-dark'].vars['--window-control-idle-opacity']).toBe(MOODS.apple.vars['--window-control-idle-opacity']);
    expect(MOODS['apple-dark'].vars['--window-extra-controls-display']).toBe(MOODS.apple.vars['--window-extra-controls-display']);
  });

  it('every chrome token is present on apple-dark', () => {
    for (const key of CHROME_KEYS) {
      expect(MOODS['apple-dark'].vars[key]).toBeDefined();
    }
  });

  it('every base surface token is present on apple-dark', () => {
    for (const key of SURFACE_KEYS) {
      expect(MOODS['apple-dark'].vars[key]).toBeDefined();
    }
  });

  it('apple and apple-dark window-bg both use linear-gradient (frosted-glass card body)', () => {
    // Both light and dark variants render the window card as a linear-gradient surface —
    // only the lightness bands differ. apple-dark's gradient must not be a flat fill.
    expect(MOODS.apple.vars['--window-bg']).toMatch(/linear-gradient/);
    expect(MOODS['apple-dark'].vars['--window-bg']).toMatch(/linear-gradient/);
  });

  it('apple-dark lightness bands are inverted relative to apple (true dark mirror)', () => {
    // Surface and ink must flip: in light mode the surface is high-L and ink is low-L;
    // in dark mode the surface is low-L and ink is high-L. The relative ordering of
    // bg/canvas/surface must also invert (canvas darker than bg in both modes).
    const lightSurface = parseOklch(MOODS.apple.vars['--surface']);
    const darkSurface = parseOklch(MOODS['apple-dark'].vars['--surface']);
    const lightInk = parseOklch(MOODS.apple.vars['--ink']);
    const darkInk = parseOklch(MOODS['apple-dark'].vars['--ink']);

    // Light surface > dark surface (mirror)
    expect(lightSurface.l).toBeGreaterThan(0.85);
    expect(darkSurface.l).toBeLessThan(0.30);
    expect(lightSurface.l - darkSurface.l).toBeGreaterThan(0.60);

    // Light ink < dark ink (mirror)
    expect(lightInk.l).toBeLessThan(0.30);
    expect(darkInk.l).toBeGreaterThan(0.85);
    expect(darkInk.l - lightInk.l).toBeGreaterThan(0.60);

    // bg/canvas/surface ordering preserved across modes: surface > bg > canvas
    const lightBg = parseOklch(MOODS.apple.vars['--bg']);
    const lightCanvas = parseOklch(MOODS.apple.vars['--canvas']);
    expect(lightSurface.l).toBeGreaterThan(lightBg.l);
    expect(lightBg.l).toBeGreaterThan(lightCanvas.l);

    const darkBg = parseOklch(MOODS['apple-dark'].vars['--bg']);
    const darkCanvas = parseOklch(MOODS['apple-dark'].vars['--canvas']);
    expect(darkSurface.l).toBeGreaterThan(darkBg.l);
    expect(darkBg.l).toBeGreaterThan(darkCanvas.l);
  });

  it('apple-dark preserves the same low chroma character as apple (chroma ≤ 0.012)', () => {
    // Brief: "same chroma and lightness relationship". Apple uses chroma 0.003-0.006 across
    // its neutral tokens. apple-dark must stay in that band (the cool violet tint of 260° is
    // barely visible — a true neutral frosted-glass surface, not a saturated dark mode).
    for (const key of ['--bg', '--canvas', '--surface', '--surface-2', '--hairline', '--ink', '--ink-soft']) {
      const c = parseOklch(MOODS['apple-dark'].vars[key]).c;
      expect(c).toBeLessThanOrEqual(0.012);
    }
  });

  it('apple and apple-dark surface-alpha are identical (the glass layer)', () => {
    // Both surfaces use /0.62 alpha — the frosted-glass transparency is a brand mark,
    // not a light/dark variant. If the alpha flipped, the backdrop-filter blur effect
    // would look dramatically different between modes.
    expect(MOODS['apple-dark'].vars['--surface']).toMatch(/\/ 0\.62\)/);
    expect(MOODS.apple.vars['--surface']).toMatch(/\/ 0\.62\)/);
  });

  it('apple-dark title-bg reads as dark glass (low L, low C, near-black)', () => {
    // Whether A1's derivation overrides this or not at runtime, the mood.vars hand-pick
    // (which A3 ships as a fallback) must itself be a dark glass value — not a light or
    // saturated fill. If anyone later changes apple-dark, they shouldn't be able to swap
    // in a white title bar by accident.
    const titleBg = MOODS['apple-dark'].vars['--window-title-bg'];
    expect(titleBg).toBeDefined();
    // Title-bg is a linear-gradient: parse the first stop's lightness.
    const firstStop = titleBg.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    expect(firstStop).not.toBeNull();
    const l = parseFloat(firstStop[1]);
    const c = parseFloat(firstStop[2]);
    expect(l).toBeLessThan(0.30); // dark — not white
    expect(c).toBeLessThan(0.04); // neutral — not saturated
  });

  it('apple-dark shadow stack is dark-mode-tuned (stronger outer drop than apple)', () => {
    const lightShadow = MOODS.apple.vars['--window-shadow'];
    const darkShadow = MOODS['apple-dark'].vars['--window-shadow'];
    expect(darkShadow).toBeDefined();
    expect(lightShadow).toBeDefined();
    // Both should contain an inset highlight + an outer drop, but dark variant's outer
    // drop should be stronger (more opaque black) than light's — typical dark-mode shadow.
    expect(darkShadow).toMatch(/inset/);
    expect(darkShadow).toMatch(/oklch\(0 0 0/);
    expect(lightShadow).toMatch(/inset/);
    expect(lightShadow).toMatch(/oklch\(0 0 0/);
    // Specifically: dark outer drop opacity should be ≥ 0.50; light outer drop ≤ 0.45.
    const darkOuter = darkShadow.match(/oklch\(0 0 0 \/ ([\d.]+)/);
    const lightOuter = lightShadow.match(/oklch\(0 0 0 \/ ([\d.]+)/);
    expect(parseFloat(darkOuter[1])).toBeGreaterThanOrEqual(0.50);
    expect(parseFloat(lightOuter[1])).toBeLessThanOrEqual(0.45);
  });

  it('apple-dark preserves the same hue family as apple (260°) across all neutral tokens', () => {
    // Brand voice: same hue 260. The whole surface family should resolve to the same
    // hue within rounding — the visual difference between apple and apple-dark is
    // lightness only, not hue rotation.
    for (const key of ['--bg', '--canvas', '--surface', '--surface-2', '--hairline', '--ink', '--ink-soft']) {
      const lightH = parseOklch(MOODS.apple.vars[key]).h;
      const darkH = parseOklch(MOODS['apple-dark'].vars[key]).h;
      // Some tokens may have near-zero chroma where hue is meaningless; only assert
      // when the chroma is high enough that hue has visible effect.
      const lightC = parseOklch(MOODS.apple.vars[key]).c;
      if (lightC > 0.005) {
        expect(Math.abs(lightH - darkH)).toBeLessThan(6);
      }
    }
  });

  it('apple-dark has no surprise keys — only the documented surface + chrome tokens', () => {
    // Defensive: if someone later adds a stray token to apple-dark that breaks the
    // mirror, this test will flag it. Allowed keys: the standard surface family +
    // the chrome tokens that apple defines.
    const allowed = new Set([
      ...SURFACE_KEYS,
      '--window-bg',
      '--window-title-bg',
      '--window-title-backdrop',
      '--window-radius',
      '--window-shadow',
      '--window-control-idle-opacity',
      '--window-extra-controls-display',
    ]);
    const unexpected = Object.keys(MOODS['apple-dark'].vars).filter(k => !allowed.has(k));
    if (unexpected.length > 0) {
      throw new Error(`apple-dark has unexpected keys: ${unexpected.join(', ')}`);
    }
    expect(unexpected).toEqual([]);
  });
});