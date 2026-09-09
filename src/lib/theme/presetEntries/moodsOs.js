/**
 * src/lib/theme/presetEntries/moodsOs.js
 *
 * OS / platform moods for PRESET_LIBRARY v0.1 (brief A2). Each value
 * is a full colorway: { label, mode, accent: { hue, chroma, lightness }, vars: {...} }.
 *
 * Migrated verbatim from the original `MOODS` object in `src/components/Theme.jsx`.
 */

export const OS_MOODS = {
  google: {
    label: 'Google',
    mode: 'light',
    accent: { hue: 230, chroma: 0.18, lightness: 0.60 },
    vars: {
      '--bg': 'oklch(0.965 0.030 232)',
      '--canvas': 'oklch(0.930 0.048 232)',
      '--surface': 'oklch(0.990 0.012 232)',
      '--surface-2': 'oklch(0.945 0.032 232)',
      '--hairline': 'oklch(0.800 0.045 232)',
      '--hairline-strong': 'oklch(0.660 0.070 232)',
      '--ink': 'oklch(0.225 0.050 250)',
      '--ink-soft': 'oklch(0.405 0.045 250)',
      '--ink-faint': 'oklch(0.585 0.040 250)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.62 0.18 250) 0 25%, oklch(0.64 0.20 28) 25% 50%, oklch(0.84 0.16 85) 50% 75%, oklch(0.66 0.16 145) 75% 100%)',
      '--window-strip-height': '5px',
    },
    // Brief A5 — Google ships a brighter --surface override (Material's
    // pure-white card surface) on top of the underlying mood's slightly
    // tinted --surface, so card chrome reads cleaner against the bg.
    surface: {
      '--surface': 'oklch(0.998 0.003 232)',
    },
  },
  meta: {
    label: 'Meta',
    mode: 'light',
    accent: { hue: 245, chroma: 0.19, lightness: 0.58 },
    vars: {
      '--bg': 'oklch(0.955 0.032 255)',
      '--canvas': 'oklch(0.915 0.060 255)',
      '--surface': 'oklch(0.985 0.016 255)',
      '--surface-2': 'oklch(0.940 0.042 255)',
      '--hairline': 'oklch(0.790 0.055 255)',
      '--hairline-strong': 'oklch(0.640 0.090 255)',
      '--ink': 'oklch(0.215 0.060 258)',
      '--ink-soft': 'oklch(0.405 0.050 258)',
      '--ink-faint': 'oklch(0.590 0.042 258)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.62 0.20 255), oklch(0.74 0.16 210), oklch(0.72 0.14 188))',
      '--window-strip-height': '5px',
    },
  },
  microsoft: {
    label: 'Microsoft',
    mode: 'light',
    accent: { hue: 155, chroma: 0.15, lightness: 0.59 },
    vars: {
      '--bg': 'oklch(0.960 0.030 190)',
      '--canvas': 'oklch(0.925 0.050 190)',
      '--surface': 'oklch(0.990 0.014 190)',
      '--surface-2': 'oklch(0.940 0.035 190)',
      '--hairline': 'oklch(0.800 0.045 190)',
      '--hairline-strong': 'oklch(0.650 0.070 190)',
      '--ink': 'oklch(0.220 0.050 208)',
      '--ink-soft': 'oklch(0.410 0.042 208)',
      '--ink-faint': 'oklch(0.590 0.035 208)',
      '--window-strip-bg': 'linear-gradient(90deg, oklch(0.62 0.18 25) 0 25%, oklch(0.70 0.17 145) 25% 50%, oklch(0.64 0.16 240) 50% 75%, oklch(0.83 0.16 82) 75% 100%)',
      '--window-strip-height': '5px',
    },
  },
  apple: {
    label: 'Apple',
    mode: 'light',
    accent: { hue: 260, chroma: 0.04, lightness: 0.62 },
    vars: {
      '--bg': 'oklch(0.960 0.006 265)',
      '--canvas': 'oklch(0.920 0.012 265)',
      '--surface': 'oklch(0.990 0.002 260 / 0.62)',
      '--surface-2': 'oklch(0.970 0.004 260 / 0.44)',
      '--hairline': 'oklch(0.820 0.006 260 / 0.68)',
      '--hairline-strong': 'oklch(0.620 0.006 260 / 0.72)',
      '--ink': 'oklch(0.205 0.004 260)',
      '--ink-soft': 'oklch(0.395 0.004 260)',
      '--ink-faint': 'oklch(0.590 0.004 260)',
      '--window-bg': 'linear-gradient(145deg, oklch(1 0 0 / 0.92), oklch(0.945 0.004 260 / 0.82))',
      '--window-title-bg': 'linear-gradient(180deg, oklch(1 0 0 / 0.70), oklch(0.90 0.004 260 / 0.34))',
      '--window-title-backdrop': 'blur(12px) saturate(1.25)',
      '--window-radius': '16px',
      '--window-shadow': '0 1px 0 oklch(1 0 0 / 0.78) inset, 0 18px 50px -28px oklch(0 0 0 / 0.42), 0 5px 18px -14px oklch(0 0 0 / 0.35)',
      '--window-control-idle-opacity': '1',
      '--window-extra-controls-display': 'grid',
    },
  },
  // apple-dark — true dark-mode mirror of `apple`. Adapted to A1's
  // token-cohesion pattern: --window-title-bg dropped (derives from --surface
  // × alpha via computeTokenMap, same as apple).
  'apple-dark': {
    label: 'Apple Dark',
    mode: 'dark',
    accent: { hue: 260, chroma: 0.04, lightness: 0.62 },
    vars: {
      '--bg': 'oklch(0.180 0.005 260)',
      '--canvas': 'oklch(0.140 0.006 260)',
      '--surface': 'oklch(0.220 0.003 260 / 0.62)',
      '--surface-2': 'oklch(0.200 0.004 260 / 0.44)',
      '--hairline': 'oklch(0.320 0.005 260 / 0.68)',
      '--hairline-strong': 'oklch(0.500 0.005 260 / 0.72)',
      '--ink': 'oklch(0.955 0.003 260)',
      '--ink-soft': 'oklch(0.785 0.003 260)',
      '--ink-faint': 'oklch(0.595 0.003 260)',
      '--window-bg': 'linear-gradient(145deg, oklch(0.235 0.003 260 / 0.92), oklch(0.165 0.003 260 / 0.82))',
      '--window-title-bg': 'linear-gradient(180deg, oklch(0.245 0.003 260 / 0.70), oklch(0.160 0.004 260 / 0.34))',
      '--window-title-backdrop': 'blur(12px) saturate(1.25)',
      '--window-radius': '16px',
      '--window-shadow': '0 1px 0 oklch(1 0 0 / 0.10) inset, 0 18px 50px -28px oklch(0 0 0 / 0.62), 0 5px 18px -14px oklch(0 0 0 / 0.55)',
      '--window-control-idle-opacity': '1',
      '--window-extra-controls-display': 'grid',
    },
  },
};