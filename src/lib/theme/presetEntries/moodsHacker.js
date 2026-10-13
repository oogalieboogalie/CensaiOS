/**
 * src/lib/theme/presetEntries/moodsHacker.js
 *
 * Terminal / hacker moods for PRESET_LIBRARY v0.1 (brief A2). Each value
 * is a full colorway: { label, mode, accent: { hue, chroma, lightness }, vars: {...} }.
 *
 * Migrated verbatim from the original `MOODS` object in `src/components/Theme.jsx`.
 */

export const HACKER_MOODS = {
  matrix: {
    label: 'Matrix',
    mode: 'dark',
    accent: { hue: 150, chroma: 0.20, lightness: 0.80 },
    vars: {
      '--bg': 'oklch(0.16 0.02 150)',
      '--canvas': 'oklch(0.13 0.025 150)',
      '--surface': 'oklch(0.20 0.022 150)',
      '--surface-2': 'oklch(0.175 0.022 150)',
      '--hairline': 'oklch(0.30 0.03 150)',
      '--hairline-strong': 'oklch(0.42 0.06 150)',
      '--ink': 'oklch(0.92 0.10 150)',
      '--ink-soft': 'oklch(0.75 0.12 150)',
      '--ink-faint': 'oklch(0.55 0.10 150)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.55 0.18 150), oklch(0.85 0.22 150))',
      '--window-strip-height': '3px',
    },
  },
  synthwave: {
    label: 'Synthwave',
    mode: 'dark',
    accent: { hue: 330, chroma: 0.20, lightness: 0.66 },
    vars: {
      '--bg': 'oklch(0.16 0.03 300)',
      '--canvas': 'oklch(0.13 0.04 300)',
      '--surface': 'oklch(0.215 0.035 300)',
      '--surface-2': 'oklch(0.185 0.035 300)',
      '--hairline': 'oklch(0.32 0.05 300)',
      '--hairline-strong': 'oklch(0.45 0.10 320)',
      '--ink': 'oklch(0.93 0.02 320)',
      '--ink-soft': 'oklch(0.76 0.04 320)',
      '--ink-faint': 'oklch(0.58 0.06 320)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.70 0.22 330), oklch(0.78 0.15 200))',
      '--window-strip-height': '4px',
    },
  },
  cyberpunk: {
    label: 'Cyberpunk',
    mode: 'dark',
    accent: { hue: 350, chroma: 0.21, lightness: 0.64 },
    vars: {
      '--bg': 'oklch(0.15 0.02 340)',
      '--canvas': 'oklch(0.12 0.025 340)',
      '--surface': 'oklch(0.205 0.025 340)',
      '--surface-2': 'oklch(0.175 0.025 340)',
      '--hairline': 'oklch(0.30 0.04 340)',
      '--hairline-strong': 'oklch(0.44 0.10 340)',
      '--ink': 'oklch(0.93 0.02 200)',
      '--ink-soft': 'oklch(0.76 0.05 200)',
      '--ink-faint': 'oklch(0.58 0.06 340)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.66 0.24 350), oklch(0.80 0.15 200))',
      '--window-strip-height': '4px',
    },
  },
  vaporwave: {
    label: 'Vaporwave',
    mode: 'dark',
    accent: { hue: 340, chroma: 0.15, lightness: 0.74 },
    vars: {
      '--bg': 'oklch(0.18 0.03 295)',
      '--canvas': 'oklch(0.15 0.035 295)',
      '--surface': 'oklch(0.235 0.03 295)',
      '--surface-2': 'oklch(0.205 0.03 295)',
      '--hairline': 'oklch(0.34 0.045 300)',
      '--hairline-strong': 'oklch(0.48 0.08 320)',
      '--ink': 'oklch(0.94 0.02 320)',
      '--ink-soft': 'oklch(0.78 0.04 320)',
      '--ink-faint': 'oklch(0.60 0.05 320)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.80 0.14 340), oklch(0.82 0.12 200))',
      '--window-strip-height': '4px',
    },
  },
  tron: {
    label: 'Tron',
    mode: 'dark',
    accent: { hue: 205, chroma: 0.16, lightness: 0.74 },
    vars: {
      '--bg': 'oklch(0.15 0.02 230)',
      '--canvas': 'oklch(0.12 0.025 230)',
      '--surface': 'oklch(0.205 0.022 230)',
      '--surface-2': 'oklch(0.175 0.022 230)',
      '--hairline': 'oklch(0.30 0.035 215)',
      '--hairline-strong': 'oklch(0.44 0.08 205)',
      '--ink': 'oklch(0.93 0.02 205)',
      '--ink-soft': 'oklch(0.76 0.05 205)',
      '--ink-faint': 'oklch(0.58 0.06 205)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.55 0.14 230), oklch(0.85 0.16 200))',
      '--window-strip-height': '3px',
    },
  },
  hacker: {
    label: 'Hacker',
    mode: 'dark',
    accent: { hue: 145, chroma: 0.22, lightness: 0.82 },
    vars: {
      '--bg': 'oklch(0.13 0.005 150)',
      '--canvas': 'oklch(0.10 0.006 150)',
      '--surface': 'oklch(0.18 0.008 150)',
      '--surface-2': 'oklch(0.15 0.008 150)',
      '--hairline': 'oklch(0.28 0.02 150)',
      '--hairline-strong': 'oklch(0.40 0.06 145)',
      '--ink': 'oklch(0.90 0.14 145)',
      '--ink-soft': 'oklch(0.72 0.16 145)',
      '--ink-faint': 'oklch(0.52 0.12 145)',
      '--window-strip-bg': 'oklch(0.85 0.22 145)',
      '--window-strip-height': '2px',
    },
  },
};