/**
 * src/lib/theme/presetEntries/moodsNatural.js
 *
 * Natural / non-brand moods for PRESET_LIBRARY v0.1 (brief A2). Each value
 * is a full colorway: { label, mode, accent: { hue, chroma, lightness }, vars: {...} }.
 *
 * Migrated verbatim from the original `MOODS` object in `src/components/Theme.jsx`
 * so that `getMoodsView()` reproduces the exact same shape and values.
 */

export const NATURAL_MOODS = {
  cream: {
    label: 'Cream',
    mode: 'light',
    accent: { hue: 145, chroma: 0.11, lightness: 0.62 },
    vars: {
      '--bg': 'oklch(0.965 0.008 80)',
      '--canvas': 'oklch(0.955 0.012 80)',
      '--surface': 'oklch(0.99 0.005 80)',
      '--surface-2': 'oklch(0.97 0.008 80)',
      '--hairline': 'oklch(0.88 0.008 80)',
      '--hairline-strong': 'oklch(0.78 0.01 80)',
      '--ink': 'oklch(0.22 0.015 60)',
      '--ink-soft': 'oklch(0.42 0.01 60)',
      '--ink-faint': 'oklch(0.62 0.008 60)',
    },
  },
  // Cobalt-deep — the new default. Pure deep navy bg (#00041f) with a bright
  // electric-blue accent and the rest of the tokens flipped for dark mode.
  'cobalt-deep': {
    label: 'Cobalt Deep',
    mode: 'dark',
    accent: { hue: 225, chroma: 0.18, lightness: 0.66 },
    vars: {
      '--bg': '#00041f',
      '--canvas': '#00061f',
      '--surface': 'oklch(0.18 0.025 240)',
      '--surface-2': 'oklch(0.22 0.028 240)',
      '--hairline': 'oklch(0.30 0.022 240)',
      '--hairline-strong': 'oklch(0.46 0.032 240)',
      '--ink': 'oklch(0.95 0.005 240)',
      '--ink-soft': 'oklch(0.78 0.008 240)',
      '--ink-faint': 'oklch(0.58 0.012 240)',
    },
  },
  slate: {
    label: 'Slate',
    mode: 'light',
    accent: { hue: 220, chroma: 0.1, lightness: 0.61 },
    vars: {
      '--bg': 'oklch(0.965 0.006 240)',
      '--canvas': 'oklch(0.955 0.008 240)',
      '--surface': 'oklch(0.99 0.003 240)',
      '--surface-2': 'oklch(0.97 0.005 240)',
      '--hairline': 'oklch(0.88 0.006 240)',
      '--hairline-strong': 'oklch(0.74 0.008 240)',
      '--ink': 'oklch(0.22 0.012 240)',
      '--ink-soft': 'oklch(0.44 0.008 240)',
      '--ink-faint': 'oklch(0.64 0.006 240)',
    },
  },
  linen: {
    label: 'Linen',
    mode: 'light',
    accent: { hue: 35, chroma: 0.14, lightness: 0.66 },
    vars: {
      '--bg': 'oklch(0.97 0.015 95)',
      '--canvas': 'oklch(0.95 0.018 92)',
      '--surface': 'oklch(0.99 0.008 95)',
      '--surface-2': 'oklch(0.97 0.012 92)',
      '--hairline': 'oklch(0.85 0.018 90)',
      '--hairline-strong': 'oklch(0.72 0.02 88)',
      '--ink': 'oklch(0.24 0.025 60)',
      '--ink-soft': 'oklch(0.42 0.018 60)',
      '--ink-faint': 'oklch(0.62 0.012 60)',
    },
  },
  midnight: {
    label: 'Midnight',
    mode: 'dark',
    accent: { hue: 250, chroma: 0.15, lightness: 0.64 },
    vars: {
      '--bg': 'oklch(0.20 0.012 260)',
      '--canvas': 'oklch(0.17 0.014 260)',
      '--surface': 'oklch(0.245 0.014 260)',
      '--surface-2': 'oklch(0.22 0.014 260)',
      '--hairline': 'oklch(0.32 0.012 260)',
      '--hairline-strong': 'oklch(0.42 0.014 260)',
      '--ink': 'oklch(0.94 0.006 260)',
      '--ink-soft': 'oklch(0.74 0.008 260)',
      '--ink-faint': 'oklch(0.55 0.01 260)',
    },
  },
  forest: {
    label: 'Forest',
    mode: 'dark',
    accent: { hue: 150, chroma: 0.13, lightness: 0.64 },
    vars: {
      '--bg': 'oklch(0.20 0.014 155)',
      '--canvas': 'oklch(0.17 0.016 155)',
      '--surface': 'oklch(0.245 0.016 155)',
      '--surface-2': 'oklch(0.22 0.016 155)',
      '--hairline': 'oklch(0.32 0.014 155)',
      '--hairline-strong': 'oklch(0.42 0.018 155)',
      '--ink': 'oklch(0.95 0.012 100)',
      '--ink-soft': 'oklch(0.74 0.012 100)',
      '--ink-faint': 'oklch(0.55 0.012 100)',
    },
  },
  coal: {
    label: 'Coal',
    mode: 'dark',
    accent: { hue: 145, chroma: 0.07, lightness: 0.68 },
    vars: {
      '--bg': 'oklch(0.18 0.005 0)',
      '--canvas': 'oklch(0.15 0.006 0)',
      '--surface': 'oklch(0.22 0.006 0)',
      '--surface-2': 'oklch(0.20 0.006 0)',
      '--hairline': 'oklch(0.30 0.005 0)',
      '--hairline-strong': 'oklch(0.40 0.006 0)',
      '--ink': 'oklch(0.94 0.003 0)',
      '--ink-soft': 'oklch(0.72 0.004 0)',
      '--ink-faint': 'oklch(0.54 0.005 0)',
    },
  },
};