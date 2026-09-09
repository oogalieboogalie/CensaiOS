/**
 * src/lib/theme/presetEntries/moodsVendor.js
 *
 * Vendor / AI-lab moods for PRESET_LIBRARY v0.1 (brief A2). Each value
 * is a full colorway: { label, mode, accent: { hue, chroma, lightness }, vars: {...} }.
 *
 * Migrated verbatim from the original `MOODS` object in `src/components/Theme.jsx`.
 */

export const VENDOR_MOODS = {
  openai: {
    label: 'OpenAI',
    mode: 'dark',
    accent: { hue: 162, chroma: 0.08, lightness: 0.68 },
    vars: {
      '--bg': 'oklch(0.175 0.006 168)',
      '--canvas': 'oklch(0.145 0.007 168)',
      '--surface': 'oklch(0.245 0.007 168)',
      '--surface-2': 'oklch(0.215 0.007 168)',
      '--hairline': 'oklch(0.34 0.008 168)',
      '--hairline-strong': 'oklch(0.45 0.01 168)',
      '--ink': 'oklch(0.94 0.004 168)',
      '--ink-soft': 'oklch(0.74 0.006 168)',
      '--ink-faint': 'oklch(0.56 0.008 168)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.76 0.08 162), oklch(0.95 0.01 165))',
      '--window-strip-height': '3px',
    },
  },
  gemini: {
    label: 'Gemini',
    mode: 'dark',
    accent: { hue: 250, chroma: 0.17, lightness: 0.68 },
    vars: {
      '--bg': 'oklch(0.145 0.018 260)',
      '--canvas': 'oklch(0.115 0.024 260)',
      '--surface': 'oklch(0.235 0.018 260)',
      '--surface-2': 'oklch(0.195 0.020 260)',
      '--hairline': 'oklch(0.31 0.018 260)',
      '--hairline-strong': 'oklch(0.45 0.035 255)',
      '--ink': 'oklch(0.93 0.008 260)',
      '--ink-soft': 'oklch(0.76 0.012 260)',
      '--ink-faint': 'oklch(0.57 0.016 260)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.72 0.16 250), oklch(0.70 0.18 300), oklch(0.80 0.14 330))',
      '--window-strip-height': '4px',
    },
  },
  anthropic: {
    label: 'Anthropic',
    mode: 'light',
    accent: { hue: 26, chroma: 0.13, lightness: 0.61 },
    vars: {
      '--bg': 'oklch(0.955 0.018 70)',
      '--canvas': 'oklch(0.94 0.020 72)',
      '--surface': 'oklch(0.985 0.012 70)',
      '--surface-2': 'oklch(0.965 0.016 70)',
      '--hairline': 'oklch(0.84 0.018 68)',
      '--hairline-strong': 'oklch(0.70 0.022 66)',
      '--ink': 'oklch(0.24 0.026 45)',
      '--ink-soft': 'oklch(0.43 0.024 45)',
      '--ink-faint': 'oklch(0.62 0.018 45)',
      '--window-strip-bg': 'oklch(0.68 0.13 28)',
      '--window-strip-height': '4px',
    },
  },
  xai: {
    label: 'xAI',
    mode: 'dark',
    accent: { hue: 95, chroma: 0.07, lightness: 0.72 },
    vars: {
      '--bg': 'oklch(0.145 0.003 120)',
      '--canvas': 'oklch(0.105 0.004 120)',
      '--surface': 'oklch(0.215 0.004 120)',
      '--surface-2': 'oklch(0.185 0.004 120)',
      '--hairline': 'oklch(0.30 0.004 120)',
      '--hairline-strong': 'oklch(0.43 0.006 120)',
      '--ink': 'oklch(0.95 0.002 120)',
      '--ink-soft': 'oklch(0.75 0.004 120)',
      '--ink-faint': 'oklch(0.56 0.006 120)',
    },
  },
  moonshot: {
    label: 'Moonshot',
    mode: 'dark',
    accent: { hue: 275, chroma: 0.16, lightness: 0.66 },
    vars: {
      '--bg': 'oklch(0.17 0.020 282)',
      '--canvas': 'oklch(0.135 0.028 282)',
      '--surface': 'oklch(0.245 0.026 282)',
      '--surface-2': 'oklch(0.205 0.024 282)',
      '--hairline': 'oklch(0.33 0.028 282)',
      '--hairline-strong': 'oklch(0.46 0.040 282)',
      '--ink': 'oklch(0.94 0.010 282)',
      '--ink-soft': 'oklch(0.76 0.014 282)',
      '--ink-faint': 'oklch(0.58 0.018 282)',
    },
  },
  perplexity: {
    label: 'Perplexity',
    mode: 'dark',
    accent: { hue: 190, chroma: 0.13, lightness: 0.67 },
    vars: {
      '--bg': 'oklch(0.18 0.014 198)',
      '--canvas': 'oklch(0.145 0.018 198)',
      '--surface': 'oklch(0.245 0.016 198)',
      '--surface-2': 'oklch(0.205 0.017 198)',
      '--hairline': 'oklch(0.33 0.020 198)',
      '--hairline-strong': 'oklch(0.45 0.032 198)',
      '--ink': 'oklch(0.95 0.006 198)',
      '--ink-soft': 'oklch(0.76 0.010 198)',
      '--ink-faint': 'oklch(0.58 0.014 198)',
    },
  },
  mistral: {
    label: 'Mistral',
    mode: 'light',
    accent: { hue: 52, chroma: 0.16, lightness: 0.68 },
    vars: {
      '--bg': 'oklch(0.965 0.020 80)',
      '--canvas': 'oklch(0.948 0.026 78)',
      '--surface': 'oklch(0.99 0.012 82)',
      '--surface-2': 'oklch(0.965 0.018 80)',
      '--hairline': 'oklch(0.84 0.025 78)',
      '--hairline-strong': 'oklch(0.70 0.035 72)',
      '--ink': 'oklch(0.24 0.028 52)',
      '--ink-soft': 'oklch(0.43 0.026 52)',
      '--ink-faint': 'oklch(0.62 0.020 52)',
    },
  },
};