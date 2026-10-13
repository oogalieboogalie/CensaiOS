/**
 * src/lib/theme/presetEntries/neurodivergent.js
 *
 * Neurodivergent-friendly colorways for PRESET_LIBRARY v0.1
 * (brief A4 — `.team/handoffs/2026-06-23-a4-adhd-neurodivergent-palettes.md`).
 */

export const NEURODIVERGENT_MOODS = {
  'calm-focus': {
    label: 'Calm Focus',
    mode: 'light',
    accent: { hue: 50, chroma: 0.08, lightness: 0.55 },
    vars: {
      '--bg': 'oklch(0.92 0.018 80)',
      '--canvas': 'oklch(0.90 0.022 80)',
      '--surface': 'oklch(0.95 0.012 80)',
      '--surface-2': 'oklch(0.93 0.016 80)',
      '--hairline': 'oklch(0.82 0.014 80)',
      '--hairline-strong': 'oklch(0.70 0.018 80)',
      '--ink': 'oklch(0.35 0.020 60)',
      '--ink-soft': 'oklch(0.50 0.014 60)',
      '--ink-faint': 'oklch(0.66 0.010 60)',
    },
  },
  'low-stim': {
    label: 'Low Stim',
    mode: 'light',
    accent: { hue: 245, chroma: 0.04, lightness: 0.55 },
    vars: {
      '--bg': 'oklch(0.90 0.005 245)',
      '--canvas': 'oklch(0.88 0.006 245)',
      '--surface': 'oklch(0.94 0.004 245)',
      '--surface-2': 'oklch(0.92 0.005 245)',
      '--hairline': 'oklch(0.80 0.004 245)',
      '--hairline-strong': 'oklch(0.68 0.006 245)',
      '--ink': 'oklch(0.32 0.008 245)',
      '--ink-soft': 'oklch(0.48 0.006 245)',
      '--ink-faint': 'oklch(0.64 0.005 245)',
    },
  },
  'sensory-soft': {
    label: 'Sensory Soft',
    mode: 'light',
    accent: { hue: 30, chroma: 0.10, lightness: 0.60 },
    vars: {
      '--bg': 'oklch(0.94 0.020 30)',
      '--canvas': 'oklch(0.92 0.024 30)',
      '--surface': 'oklch(0.96 0.014 30)',
      '--surface-2': 'oklch(0.95 0.018 30)',
      '--hairline': 'oklch(0.85 0.018 30)',
      '--hairline-strong': 'oklch(0.74 0.022 30)',
      '--ink': 'oklch(0.34 0.025 30)',
      '--ink-soft': 'oklch(0.50 0.018 30)',
      '--ink-faint': 'oklch(0.66 0.014 30)',
    },
  },
  'gentle-contrast': {
    label: 'Gentle Contrast',
    mode: 'light',
    accent: { hue: 220, chroma: 0.05, lightness: 0.55 },
    vars: {
      '--bg': 'oklch(0.985 0.003 220)',
      '--canvas': 'oklch(0.97 0.004 220)',
      '--surface': 'oklch(0.99 0.002 220)',
      '--surface-2': 'oklch(0.98 0.003 220)',
      '--hairline': 'oklch(0.88 0.005 220)',
      '--hairline-strong': 'oklch(0.74 0.008 220)',
      '--ink': 'oklch(0.16 0.012 220)',
      '--ink-soft': 'oklch(0.34 0.008 220)',
      '--ink-faint': 'oklch(0.52 0.006 220)',
    },
  },
};