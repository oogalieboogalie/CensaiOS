/**
 * src/lib/theme/tokens.js
 *
 * Canonical derivation of window-frame tokens from the surface family.
 *
 * Why this file exists:
 *   The theme engine has a "mood" data table (MOODS in src/components/Theme.jsx)
 *   and a parallel "preset" data table (THEME_PRESETS). Some moods hand-picked
 *   `--window-title-bg` and `--window-shadow` overrides that disagreed with
 *   their `--surface` value, so when the user adjusted `--surface` from the
 *   Fine Tune panel, the header and shadow didn't follow. This module is the
 *   single source of truth for that derivation.
 *
 * Contract:
 *   `computeTokenMap(preset, options?)` takes a mood object (the output of
 *   the `mood()` factory in Theme.jsx: { mode, accent, vars }) plus the
 *   current effective customVars (if any), and returns a plain object of
 *   CSS variable overrides. The returned object only carries the tokens
 *   this module owns: --window-title-bg and --window-shadow. Everything
 *   else (--surface, --ink, --bg, --window-strip-*, --hairline, etc.) is
 *   unchanged - the per-mood hand-picked values for those stay declarative.
 *
 * Design notes:
 *   - Pure JS, no new deps. OKLCH math reuses parseOklch/oklch from
 *     src/components/Theme.jsx to stay consistent with the rest of the
 *     theme engine.
 *   - Deterministic: same input -> same output, always. No Math.random.
 *   - Surface-anchored: the header lightness is a small offset from the
 *     effective --surface lightness, and the header chroma/hue is blended
 *     toward the accent. The function is called by applyTheme() in
 *     Theme.jsx AFTER customVars are merged, so live-edited surfaces
 *     propagate immediately.
 *   - Mode-aware: dark moods lift the surface slightly (more "lit"),
 *     light moods lift it less (whiter). Shadow opacity scales with mode.
 */

import { parseOklch, oklch, clamp } from '../../components/Theme.jsx';

/**
 * @typedef {Object} MoodPreset
 * @property {'light' | 'dark'} mode
 * @property {{ hue: number, chroma: number, lightness: number }} accent
 * @property {Record<string, string>} vars  base CSS variable values
 */

/**
 * @typedef {Object} ComputeOptions
 * @property {Record<string, string>} [customVars]  user-applied overrides
 *   (e.g. live --surface tweaks from the Fine Tune panel). When provided,
 *   they take precedence over preset.vars for any surface token read here.
 */

/** Per-mood header lightness offset (the "alpha" the brief calls out). */
const HEADER_LIFT = {
  light: 0.020, // whiten the surface for the title bar
  dark: 0.040, // lift the surface a touch so the header is visible
};

/** Per-mood header chroma factor: how much of the surface chroma survives. */
const HEADER_CHROMA_FACTOR = 0.55;

/** Header chroma floor: brand-tinted moods get a hint of accent color. */
const HEADER_CHROMA_FLOOR = {
  light: 0.012,
  dark: 0.018,
};

/** Accent blend weight: how much the accent hue pulls the header color. */
const ACCENT_BLEND = {
  light: 0.10,
  dark: 0.18,
};

/** Shadows: a soft white inset + an outer drop tuned for the mode. */
const SHADOW_BY_MODE = {
  light: '0 1px 0 oklch(1 0 0 / 0.78) inset, 0 16px 38px -28px oklch(0 0 0 / 0.32), 0 4px 14px -10px oklch(0 0 0 / 0.22)',
  dark: '0 1px 0 oklch(1 0 0 / 0.05) inset, 0 18px 44px -28px oklch(0 0 0 / 0.65)',
};

/** Read a CSS var, preferring customVars (live user edits) over the mood base. */
function readVar(preset, customVars, name) {
  if (customVars && Object.prototype.hasOwnProperty.call(customVars, name)) {
    return customVars[name];
  }
  return preset.vars && preset.vars[name];
}

/** Color-mix between two OKLCH values. `weight` is 0..1 (0 = full a, 1 = full b). */
function mix(a, b, weight) {
  const w = clamp(weight, 0, 1);
  return {
    l: a.l + (b.l - a.l) * w,
    c: a.c + (b.c - a.c) * w,
    h: a.h + (b.h - a.h) * w,
  };
}

/**
 * Derive the window-frame token map for a single mood.
 * @param {MoodPreset} preset   the mood object from MOODS[]
 * @param {ComputeOptions} [options]
 * @returns {Record<string, string>} CSS variable overrides
 */
export function computeTokenMap(preset, options = {}) {
  if (!preset || typeof preset !== 'object') {
    return {};
  }
  const { customVars } = options;
  const mode = preset.mode === 'dark' ? 'dark' : 'light';
  const accent = preset.accent || { hue: 240, chroma: 0.05, lightness: 0.5 };

  // Read effective surface (post-merge with customVars) so live edits propagate.
  const surfaceStr = readVar(preset, customVars, '--surface');
  const surface = parseOklch(surfaceStr);

  // Header background: surface lifted (lightness stays anchored to surface,
  // never pulled down by accent) + chroma/hue nudged toward accent for
  // brand-tinted moods.
  const headerL = clamp(surface.l + HEADER_LIFT[mode], 0, 1);
  const chromaBlended = mix({ c: surface.c, h: surface.h }, { c: accent.chroma, h: accent.hue }, ACCENT_BLEND[mode]);
  const headerC = Math.max(chromaBlended.c * HEADER_CHROMA_FACTOR, HEADER_CHROMA_FLOOR[mode]);
  const headerH = ((chromaBlended.h % 360) + 360) % 360;
  const headerBg = oklch({ l: headerL, c: headerC, h: headerH });

  // Shadow: mode-tuned, with a soft white inset.
  const shadow = SHADOW_BY_MODE[mode];

  return {
    '--window-title-bg': headerBg,
    '--window-shadow': shadow,
  };
}

/**
 * Convenience: compute tokens for every mood in the given map.
 * Returns `{ [moodName]: tokenMap }`. Useful for batch tests.
 * @param {Record<string, MoodPreset>} moodMap
 * @param {ComputeOptions} [options]
 */
export function computeAllTokens(moodMap, options) {
  const out = {};
  for (const [name, preset] of Object.entries(moodMap || {})) {
    out[name] = computeTokenMap(preset, options);
  }
  return out;
}
