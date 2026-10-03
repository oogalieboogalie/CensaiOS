/**
 * src/lib/theme/presetEntries/moodsAcrylic.js
 *
 * Acrylic moods for PRESET_LIBRARY v0.1 — hard, vivid, high-chroma
 * colorways. No pastel washes: near-black or pure-white stages with
 * maximum-saturation accents (cobalt, crimson, venom lime, …).
 * Each value is a full colorway:
 * { label, mode, accent: { hue, chroma, lightness }, vars: {...} }.
 */

export const ACRYLIC_MOODS = {
  'acrylic-cobalt': {
    label: 'Acrylic Cobalt',
    mode: 'dark',
    accent: { hue: 260, chroma: 0.28, lightness: 0.68 },
    vars: {
      '--bg': 'oklch(0.16 0.06 265)',
      '--canvas': 'oklch(0.13 0.07 265)',
      '--surface': 'oklch(0.22 0.07 265)',
      '--surface-2': 'oklch(0.19 0.07 265)',
      '--hairline': 'oklch(0.35 0.08 265)',
      '--hairline-strong': 'oklch(0.52 0.10 265)',
      '--ink': 'oklch(0.96 0.005 265)',
      '--ink-soft': 'oklch(0.80 0.008 265)',
      '--ink-faint': 'oklch(0.62 0.010 265)',
    },
  },
  'acrylic-crimson': {
    label: 'Acrylic Crimson',
    mode: 'dark',
    accent: { hue: 25, chroma: 0.28, lightness: 0.64 },
    vars: {
      '--bg': 'oklch(0.15 0.05 25)',
      '--canvas': 'oklch(0.12 0.055 25)',
      '--surface': 'oklch(0.21 0.06 25)',
      '--surface-2': 'oklch(0.18 0.058 25)',
      '--hairline': 'oklch(0.34 0.06 25)',
      '--hairline-strong': 'oklch(0.50 0.08 25)',
      '--ink': 'oklch(0.96 0.005 25)',
      '--ink-soft': 'oklch(0.80 0.008 25)',
      '--ink-faint': 'oklch(0.62 0.010 25)',
    },
  },
  'acrylic-venom': {
    label: 'Acrylic Venom',
    mode: 'dark',
    accent: { hue: 135, chroma: 0.30, lightness: 0.72 },
    vars: {
      '--bg': 'oklch(0.14 0.05 135)',
      '--canvas': 'oklch(0.12 0.055 135)',
      '--surface': 'oklch(0.20 0.06 135)',
      '--surface-2': 'oklch(0.17 0.058 135)',
      '--hairline': 'oklch(0.33 0.06 135)',
      '--hairline-strong': 'oklch(0.50 0.08 135)',
      '--ink': 'oklch(0.96 0.005 135)',
      '--ink-soft': 'oklch(0.80 0.008 135)',
      '--ink-faint': 'oklch(0.62 0.010 135)',
    },
  },
  'acrylic-magenta': {
    label: 'Acrylic Magenta',
    mode: 'dark',
    accent: { hue: 345, chroma: 0.28, lightness: 0.66 },
    vars: {
      '--bg': 'oklch(0.15 0.05 345)',
      '--canvas': 'oklch(0.12 0.055 345)',
      '--surface': 'oklch(0.21 0.06 345)',
      '--surface-2': 'oklch(0.18 0.058 345)',
      '--hairline': 'oklch(0.34 0.06 345)',
      '--hairline-strong': 'oklch(0.51 0.08 345)',
      '--ink': 'oklch(0.96 0.005 345)',
      '--ink-soft': 'oklch(0.80 0.008 345)',
      '--ink-faint': 'oklch(0.62 0.010 345)',
    },
  },
  'acrylic-tangerine': {
    label: 'Acrylic Tangerine',
    mode: 'dark',
    accent: { hue: 55, chroma: 0.28, lightness: 0.68 },
    vars: {
      '--bg': 'oklch(0.15 0.05 55)',
      '--canvas': 'oklch(0.12 0.055 55)',
      '--surface': 'oklch(0.21 0.06 55)',
      '--surface-2': 'oklch(0.18 0.058 55)',
      '--hairline': 'oklch(0.34 0.06 55)',
      '--hairline-strong': 'oklch(0.51 0.08 55)',
      '--ink': 'oklch(0.96 0.005 55)',
      '--ink-soft': 'oklch(0.80 0.008 55)',
      '--ink-faint': 'oklch(0.62 0.010 55)',
    },
  },
  'acrylic-poppy': {
    label: 'Acrylic Poppy',
    mode: 'light',
    accent: { hue: 25, chroma: 0.26, lightness: 0.52 },
    vars: {
      '--bg': 'oklch(0.98 0.008 25)',
      '--canvas': 'oklch(0.97 0.010 25)',
      '--surface': 'oklch(1.0 0.0 25)',
      '--surface-2': 'oklch(0.96 0.010 25)',
      '--hairline': 'oklch(0.86 0.020 25)',
      '--hairline-strong': 'oklch(0.60 0.030 25)',
      '--ink': 'oklch(0.15 0.010 25)',
      '--ink-soft': 'oklch(0.35 0.010 25)',
      '--ink-faint': 'oklch(0.58 0.012 25)',
    },
  },
  'acrylic-royal': {
    label: 'Acrylic Royal',
    mode: 'light',
    accent: { hue: 260, chroma: 0.26, lightness: 0.52 },
    vars: {
      '--bg': 'oklch(0.98 0.008 260)',
      '--canvas': 'oklch(0.97 0.010 260)',
      '--surface': 'oklch(1.0 0.0 260)',
      '--surface-2': 'oklch(0.96 0.010 260)',
      '--hairline': 'oklch(0.86 0.020 260)',
      '--hairline-strong': 'oklch(0.60 0.030 260)',
      '--ink': 'oklch(0.15 0.010 260)',
      '--ink-soft': 'oklch(0.35 0.010 260)',
      '--ink-faint': 'oklch(0.58 0.012 260)',
    },
  },
  'acrylic-kelly': {
    label: 'Acrylic Kelly',
    mode: 'light',
    accent: { hue: 150, chroma: 0.26, lightness: 0.48 },
    vars: {
      '--bg': 'oklch(0.98 0.008 150)',
      '--canvas': 'oklch(0.97 0.010 150)',
      '--surface': 'oklch(1.0 0.0 150)',
      '--surface-2': 'oklch(0.96 0.010 150)',
      '--hairline': 'oklch(0.86 0.020 150)',
      '--hairline-strong': 'oklch(0.58 0.030 150)',
      '--ink': 'oklch(0.15 0.010 150)',
      '--ink-soft': 'oklch(0.35 0.010 150)',
      '--ink-faint': 'oklch(0.58 0.012 150)',
    },
  },
};
