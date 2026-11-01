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
 *   this module owns: --window-title-bg, --window-shadow and
 *   --window-shadow-active. Everything
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

/** Per-mood header chroma factor: the picked chroma survives intact. */
const HEADER_CHROMA_FACTOR = 1.0;

/** Header chroma floor: brand-tinted moods get a hint of accent color. */
const HEADER_CHROMA_FLOOR = {
  light: 0.012,
  dark: 0.018,
};

/** Accent blend weight: the header carries the picked accent at full
 * strength (header unification) instead of a surface-anchored whisper. */
const ACCENT_BLEND = {
  light: 0.32,
  dark: 0.38,
};

/** Window elevation (docs/ui-yardstick.md), at rest and focused: a lit top
 * edge, a hairline ring, a tight contact shadow and a wide soft one. Dark
 * adds a near-black outer ring, because a shadow alone does not show on a
 * near-black board; the focused window sits highest. */
const SHADOW_BY_MODE = {
  light: '0 1px 0 oklch(1 0 0 / 0.8) inset, 0 0 0 0.5px oklch(0 0 0 / 0.05), 0 2px 4px -2px oklch(0 0 0 / 0.08), 0 14px 32px -14px oklch(0 0 0 / 0.2)',
  dark: '0 1px 0 oklch(1 0 0 / 0.07) inset, 0 0 0 1px oklch(0 0 0 / 0.5), 0 4px 10px -4px oklch(0 0 0 / 0.5), 0 20px 44px -18px oklch(0 0 0 / 0.75)',
};
const ACTIVE_SHADOW_BY_MODE = {
  light: '0 1px 0 oklch(1 0 0 / 0.8) inset, 0 0 0 0.5px oklch(0 0 0 / 0.06), 0 4px 8px -4px oklch(0 0 0 / 0.1), 0 28px 60px -20px oklch(0 0 0 / 0.3)',
  dark: '0 1px 0 oklch(1 0 0 / 0.09) inset, 0 0 0 1px oklch(0 0 0 / 0.55), 0 8px 18px -8px oklch(0 0 0 / 0.6), 0 34px 72px -24px oklch(0 0 0 / 0.85)',
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
    h: mixHue(a.h, b.h, w),
  };
}

/** Hue interpolation along the shortest arc so far-apart hues (e.g. 330°
// and 20°) blend through the near side instead of slingshotting across
// the wheel. */
function mixHue(aH, bH, weight) {
  let delta = ((bH - aH) % 360 + 360) % 360;
  if (delta > 180) delta -= 360;
  return aH + delta * weight;
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
  // headerTint (0..1, default 1) scales how far the title rail lifts off the
  // surface and leans toward the accent. 0 = header is the body color.
  const tint = Number.isFinite(options.headerTint) ? clamp(options.headerTint, 0, 1) : 1;
  const mode = preset.mode === 'dark' ? 'dark' : 'light';
  const accent = preset.accent || { hue: 240, chroma: 0.05, lightness: 0.5 };

  // Read effective surface (post-merge with customVars) so live edits propagate.
  const surfaceStr = readVar(preset, customVars, '--surface');
  const surface = parseOklch(surfaceStr);

  // Header background: surface lifted (lightness stays anchored to surface,
  // never pulled down by accent) + chroma/hue nudged toward accent for
  // brand-tinted moods.
  const headerL = clamp(surface.l + HEADER_LIFT[mode] * tint, 0, 1);
  const chromaBlended = mix({ c: surface.c, h: surface.h }, { c: accent.chroma, h: accent.hue }, ACCENT_BLEND[mode] * tint);
  const headerC = Math.max(chromaBlended.c * HEADER_CHROMA_FACTOR, HEADER_CHROMA_FLOOR[mode] * tint);
  const headerH = tint === 0 ? surface.h : ((chromaBlended.h % 360) + 360) % 360;
  const headerBg = oklch({ l: headerL, c: headerC, h: headerH });

  // Shadow: mode-tuned, with a soft white inset.
  const shadow = SHADOW_BY_MODE[mode];
  const active = ACTIVE_SHADOW_BY_MODE[mode];
  if (tint === 0) {
    // Unified title bar: same color as the window body.
    return { '--window-title-bg': 'var(--window-bg, var(--surface))', '--window-shadow': shadow, '--window-shadow-active': active };
  }

  return {
    '--window-title-bg': headerBg,
    '--window-shadow': shadow,
    '--window-shadow-active': active,
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
