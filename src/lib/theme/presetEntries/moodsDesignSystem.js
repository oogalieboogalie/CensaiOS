/**
 * src/lib/theme/presetEntries/moodsDesignSystem.js
 *
 * Colorways behind the design-system looks (src/lib/theme/looks.js). Muted
 * neutrals with one accent, in the family of Linear / Vercel / Raycast: the
 * surface ladder moves in small, even lightness steps and every ink token
 * clears 4.5:1 against both surfaces (tests/designSystemTheme.test.js).
 */

import { RETRO_MOODS } from './moodsRetro.js';

export const DESIGN_SYSTEM_MOODS = {
  graphite: {
    label: 'Graphite',
    mode: 'dark',
    accent: { hue: 265, chroma: 0.13, lightness: 0.68 },
    vars: {
      '--bg': 'oklch(0.16 0.004 265)',
      '--canvas': 'oklch(0.145 0.004 265)',
      '--surface': 'oklch(0.2 0.005 265)',
      '--surface-2': 'oklch(0.235 0.006 265)',
      '--hairline': 'oklch(0.285 0.006 265)',
      '--hairline-strong': 'oklch(0.38 0.008 265)',
      '--ink': 'oklch(0.95 0.003 265)',
      '--ink-soft': 'oklch(0.77 0.006 265)',
      '--ink-faint': 'oklch(0.6 0.008 265)',
    },
  },
  paper: {
    label: 'Paper',
    mode: 'light',
    accent: { hue: 255, chroma: 0.16, lightness: 0.54 },
    vars: {
      '--bg': 'oklch(0.972 0.002 90)',
      '--canvas': 'oklch(0.962 0.003 90)',
      '--surface': 'oklch(0.997 0.001 90)',
      '--surface-2': 'oklch(0.975 0.002 90)',
      '--hairline': 'oklch(0.915 0.003 90)',
      '--hairline-strong': 'oklch(0.83 0.004 90)',
      '--ink': 'oklch(0.21 0.005 90)',
      '--ink-soft': 'oklch(0.43 0.005 90)',
      '--ink-faint': 'oklch(0.58 0.005 90)',
    },
  },
  studio: {
    label: 'Studio',
    mode: 'dark',
    accent: { hue: 40, chroma: 0.12, lightness: 0.74 },
    vars: {
      '--bg': 'oklch(0.18 0.008 60)',
      '--canvas': 'oklch(0.165 0.008 60)',
      '--surface': 'oklch(0.225 0.01 60)',
      '--surface-2': 'oklch(0.26 0.011 60)',
      '--hairline': 'oklch(0.31 0.011 60)',
      '--hairline-strong': 'oklch(0.41 0.013 60)',
      '--ink': 'oklch(0.95 0.008 80)',
      '--ink-soft': 'oklch(0.79 0.01 70)',
      '--ink-faint': 'oklch(0.62 0.012 70)',
    },
  },
  terminal: {
    label: 'Terminal',
    mode: 'dark',
    accent: { hue: 150, chroma: 0.17, lightness: 0.78 },
    vars: {
      '--bg': 'oklch(0.12 0.004 150)',
      '--canvas': 'oklch(0.11 0.004 150)',
      '--surface': 'oklch(0.155 0.006 150)',
      '--surface-2': 'oklch(0.185 0.007 150)',
      '--hairline': 'oklch(0.27 0.012 150)',
      '--hairline-strong': 'oklch(0.38 0.02 150)',
      '--ink': 'oklch(0.93 0.03 150)',
      '--ink-soft': 'oklch(0.78 0.05 150)',
      '--ink-faint': 'oklch(0.6 0.05 150)',
    },
  },
  // Windows 98, with the teal desktop lifted so text on the board reads 4.5:1.
  'retro-os': {
    label: 'Retro OS',
    mode: 'light',
    accent: { ...RETRO_MOODS.win98.accent },
    vars: {
      ...RETRO_MOODS.win98.vars,
      '--bg': 'oklch(0.6 0.08 195)',
      '--canvas': 'oklch(0.58 0.075 195)',
    },
  },
};
