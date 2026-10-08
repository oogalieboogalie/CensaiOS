/**
 * src/lib/theme/looks.js
 *
 * A "look" is a whole-board preset: a colorway PLUS shape — corner radius,
 * density, font pair, label style, motion and glass — applied together in one
 * click. Colorways stay in presetEntries/; this file only adds the shape knobs
 * and the "Custom" colorway generator.
 *
 * Theme state (homebase.theme.v1) carries the shape fields flat next to the
 * existing { mood, hue, chroma, lightness, customVars } so older saved themes
 * keep loading: missing fields fall back to DEFAULT_SHAPE.
 *
 * Pure data + pure functions; applyTheme() in src/components/Theme.jsx turns
 * the result into CSS variables via shapeToCssVars().
 */

import { MOOD_ENTRIES } from './presetEntries/moods.js';
import { DEFAULT_HEADER_MODE, HEADER_MODES } from '../windowHeader.js';
import { GUTTER } from '../layout/constants.js';
import { GROUP_GAP_RANGE } from '../layout/gap.js';

export const DENSITIES = Object.freeze({
  compact: { label: 'Compact', value: 0.85 },
  regular: { label: 'Regular', value: 1 },
  comfortable: { label: 'Comfortable', value: 1.15 },
});

export const FONT_PAIRS = Object.freeze({
  inter: {
    label: 'Inter',
    sans: '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, "SF Mono", Menlo, monospace',
    display: '"Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
  },
  editorial: {
    label: 'Editorial',
    sans: '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, "SF Mono", Menlo, monospace',
    display: '"Fraunces", Georgia, "Times New Roman", serif',
  },
  geometric: {
    label: 'Geometric',
    sans: '"Plus Jakarta Sans", "Outfit", "Segoe UI", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, monospace',
    display: '"Outfit", "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
  },
  classic: {
    label: 'Segoe',
    sans: '"Segoe UI Variable Text", "Segoe UI", "Inter", system-ui, -apple-system, sans-serif',
    mono: '"Cascadia Code", "Cascadia Mono", Consolas, "JetBrains Mono", ui-monospace, monospace',
    display: '"Segoe UI Variable Display", "Segoe UI", "Outfit", "Inter", system-ui, sans-serif',
  },
  mono: {
    label: 'Mono',
    sans: '"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, "SF Mono", Menlo, monospace',
    mono: '"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, "SF Mono", Menlo, monospace',
    display: '"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, monospace',
  },
});

/** How small labels (section headers, chips, window titles) are set. */
export const LABEL_STYLES = Object.freeze({
  sentence: { label: 'Sentence case', font: 'var(--font-sans)', case: 'none', tracking: '0', weight: '500', size: 'var(--text-sm)' },
  caps: { label: 'Small caps', font: 'var(--font-sans)', case: 'uppercase', tracking: '0.06em', weight: '600', size: 'var(--text-xs)' },
  'mono-caps': { label: 'Mono caps', font: 'var(--font-mono)', case: 'uppercase', tracking: '0.07em', weight: '500', size: 'var(--text-xs)' },
});

export const MOTIONS = Object.freeze({
  none: { label: 'Still', value: 0 },
  snappy: { label: 'Snappy', value: 0.7 },
  standard: { label: 'Standard', value: 1 },
  calm: { label: 'Calm', value: 1.4 },
});

export const RADIUS_RANGE = Object.freeze({ min: 0, max: 2, step: 0.05 });
export const GLASS_RANGE = Object.freeze({ min: 0, max: 1, step: 0.05 });

export const SHAPE_KEYS = Object.freeze([
  'radiusScale', 'density', 'fontPair', 'labelStyle', 'motion', 'glass', 'headerTint', 'glow', 'gloss', 'headerMode', 'groupGap',
]);

export const DEFAULT_SHAPE = Object.freeze({
  radiusScale: 1,
  density: 'regular',
  fontPair: 'inter',
  labelStyle: 'sentence',
  motion: 'standard',
  glass: 0,
  headerTint: 0,
  glow: false,
  gloss: false,
  // Window header: strip (always shown), ghost (on hover) or bare (none).
  headerMode: DEFAULT_HEADER_MODE,
  // Seam between tiles in a group, in px (see src/lib/layout/gap.js).
  groupGap: GUTTER,
});

const look = (label, blurb, mood, shape) => Object.freeze({ label, blurb, mood, shape: Object.freeze({ ...DEFAULT_SHAPE, ...shape }) });

/** Curated looks, in picker order. Each sets color + shape together. */
export const LOOKS = Object.freeze({
  graphite: look('Graphite', 'Quiet dark neutral with one accent', 'graphite', {}),
  paper: look('Paper', 'Bright and calm, editorial headings', 'paper', { fontPair: 'editorial' }),
  studio: look('Studio', 'Soft corners, roomy, a little glass', 'studio', {
    radiusScale: 1.5, density: 'comfortable', motion: 'calm', glass: 0.35, fontPair: 'geometric', headerMode: 'ghost', groupGap: 8,
  }),
  terminal: look('Terminal', 'Sharp, dense, monospace everything', 'terminal', {
    radiusScale: 0.25, density: 'compact', fontPair: 'mono', labelStyle: 'mono-caps', motion: 'snappy',
  }),
  retro: look('Retro OS', 'Square bevels and a teal desktop', 'retro-os', {
    radiusScale: 0, density: 'compact', fontPair: 'classic', motion: 'none', gloss: true,
  }),
  classic: look('Classic', 'The original Homebase cobalt look', 'cobalt-deep', {
    radiusScale: 1.75, fontPair: 'classic', labelStyle: 'mono-caps', headerTint: 1, glow: true, gloss: true, groupGap: 8,
  }),
});

export const DEFAULT_LOOK_ID = 'graphite';
export const CUSTOM_LOOK_ID = 'custom';
export const CUSTOM_MOOD_ID = 'custom';

export const DEFAULT_CUSTOM_COLORS = Object.freeze({ mode: 'dark', baseHue: 265, tint: 0.006, accentHue: 265 });

const clampNum = (n, lo, hi, fallback) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const ok = (l, c, h) => `oklch(${r3(l)} ${r3(c)} ${Math.round(((h % 360) + 360) % 360)})`;

/**
 * Theme generator: derive a whole colorway from three inputs (light/dark,
 * base hue + tint for the neutrals, accent hue). The lightness ladder is fixed
 * so every result keeps text readable (4.5:1, see tests/themeContrast.test.js).
 */
export function generateCustomMood(input = {}) {
  const mode = input.mode === 'light' ? 'light' : 'dark';
  const h = clampNum(input.baseHue, 0, 360, DEFAULT_CUSTOM_COLORS.baseHue);
  const c = clampNum(input.tint, 0, 0.04, DEFAULT_CUSTOM_COLORS.tint);
  const ah = clampNum(input.accentHue, 0, 360, DEFAULT_CUSTOM_COLORS.accentHue);
  const ladder = mode === 'dark'
    ? { bg: 0.165, canvas: 0.15, surface: 0.205, surface2: 0.24, hairline: 0.29, strong: 0.39, ink: 0.95, soft: 0.77, faint: 0.6 }
    : { bg: 0.972, canvas: 0.962, surface: 0.997, surface2: 0.975, hairline: 0.915, strong: 0.83, ink: 0.21, soft: 0.43, faint: 0.58 };
  return {
    mode,
    accent: mode === 'dark' ? { hue: ah, chroma: 0.14, lightness: 0.7 } : { hue: ah, chroma: 0.16, lightness: 0.55 },
    vars: {
      '--bg': ok(ladder.bg, c, h),
      '--canvas': ok(ladder.canvas, c, h),
      '--surface': ok(ladder.surface, c * 0.8, h),
      '--surface-2': ok(ladder.surface2, c, h),
      '--hairline': ok(ladder.hairline, c, h),
      '--hairline-strong': ok(ladder.strong, c * 1.2, h),
      '--ink': ok(ladder.ink, Math.min(c, 0.01), h),
      '--ink-soft': ok(ladder.soft, Math.min(c, 0.015), h),
      '--ink-faint': ok(ladder.faint, Math.min(c, 0.015), h),
    },
  };
}

/** Resolve the active colorway, including the generated "custom" one. */
export function resolveMood(theme, moods) {
  const id = theme?.mood;
  if (id === CUSTOM_MOOD_ID) return generateCustomMood(theme.customColors || DEFAULT_CUSTOM_COLORS);
  return moods[id] || moods.cream;
}

/** Normalize the shape fields of a (possibly old / imported) theme. */
export function normalizeShape(theme = {}) {
  return {
    radiusScale: clampNum(theme.radiusScale, RADIUS_RANGE.min, RADIUS_RANGE.max, DEFAULT_SHAPE.radiusScale),
    density: DENSITIES[theme.density] ? theme.density : DEFAULT_SHAPE.density,
    fontPair: FONT_PAIRS[theme.fontPair] ? theme.fontPair : DEFAULT_SHAPE.fontPair,
    labelStyle: LABEL_STYLES[theme.labelStyle] ? theme.labelStyle : DEFAULT_SHAPE.labelStyle,
    motion: MOTIONS[theme.motion] ? theme.motion : DEFAULT_SHAPE.motion,
    glass: clampNum(theme.glass, GLASS_RANGE.min, GLASS_RANGE.max, DEFAULT_SHAPE.glass),
    headerTint: clampNum(theme.headerTint, 0, 1, DEFAULT_SHAPE.headerTint),
    glow: typeof theme.glow === 'boolean' ? theme.glow : DEFAULT_SHAPE.glow,
    gloss: typeof theme.gloss === 'boolean' ? theme.gloss : DEFAULT_SHAPE.gloss,
    headerMode: HEADER_MODES.includes(theme.headerMode) ? theme.headerMode : DEFAULT_SHAPE.headerMode,
    groupGap: Math.round(clampNum(theme.groupGap, GROUP_GAP_RANGE.min, GROUP_GAP_RANGE.max, DEFAULT_SHAPE.groupGap)),
  };
}

/** The theme patch that applies a curated look (colors + shape together). */
export function lookPatch(id) {
  const entry = LOOKS[id];
  if (!entry) return null;
  const mood = MOOD_ENTRIES[entry.mood];
  return {
    look: id,
    mood: entry.mood,
    ...(mood?.accent || {}),
    customVars: {},
    ...entry.shape,
  };
}

/** CSS variables for the shape half of a theme. */
export function shapeToCssVars(theme = {}) {
  const s = normalizeShape(theme);
  const fonts = FONT_PAIRS[s.fontPair];
  const label = LABEL_STYLES[s.labelStyle];
  const vars = {
    '--radius-scale': String(s.radiusScale),
    '--density': String(DENSITIES[s.density].value),
    '--motion-scale': String(MOTIONS[s.motion].value),
    '--font-sans': fonts.sans,
    '--font-mono': fonts.mono,
    '--font-display': fonts.display,
    '--font-label': label.font,
    '--label-case': label.case,
    '--label-tracking': label.tracking,
    '--label-weight': label.weight,
    '--label-size': label.size,
    '--gloss-sheen': s.gloss ? 'linear-gradient(to bottom, oklch(1 0 0 / 0.10), oklch(0 0 0 / 0.06))' : 'none',
    '--gloss-bevel': s.gloss ? 'inset 0 1px 0 oklch(1 0 0 / 0.12), inset 0 -1px 0 oklch(0 0 0 / 0.10)' : '0 0 0 0 transparent',
  };
  if (s.glass > 0) {
    const keep = Math.round(100 - s.glass * 45);
    vars['--window-bg'] = `color-mix(in oklab, var(--surface) ${keep}%, transparent)`;
    vars['--window-backdrop'] = `blur(${Math.round(s.glass * 24)}px) saturate(${r3(1 + s.glass * 0.4)})`;
    if (s.headerTint === 0) vars['--window-title-bg'] = 'transparent';
  }
  return vars;
}

/** Which curated look (if any) the theme exactly matches. */
export function matchLook(theme = {}) {
  const shape = normalizeShape(theme);
  for (const [id, entry] of Object.entries(LOOKS)) {
    if (entry.mood !== theme.mood) continue;
    if (SHAPE_KEYS.every((k) => entry.shape[k] === shape[k])) return id;
  }
  return theme.mood === CUSTOM_MOOD_ID ? CUSTOM_LOOK_ID : null;
}
