/**
 * src/lib/theme/presetEntries/moodsRetro.js
 *
 * Retro OS moods for PRESET_LIBRARY. Each value is a full colorway:
 * { label, mode, accent: { hue, chroma, lightness }, vars: {...} }.
 *
 * Only tokens the derivation engine leaves alone are hand-set here
 * (--window-title-bg / --window-shadow are derived from --surface by
 * computeTokenMap, so the navy title + bevel live on the matching `win98`
 * chrome variant in src/lib/theme/chromeVariants.js, which wins as inline
 * frame props). Pair them: Appearance → Windows 98 mood, then right-click
 * a window → Chrome → Windows 98.
 */

export const RETRO_MOODS = {
  win98: {
    label: 'Windows 98',
    mode: 'light',
    accent: { hue: 264, chroma: 0.10, lightness: 0.55 },
    vars: {
      // Teal desktop.
      '--bg': 'oklch(0.52 0.080 195)',
      '--canvas': 'oklch(0.47 0.075 195)',
      // Button-face silver; near-white wells / menus / text fields.
      '--surface': 'oklch(0.79 0.004 90)',
      '--surface-2': 'oklch(0.96 0.003 90)',
      // Dark bevel grays + near-black text.
      '--hairline': 'oklch(0.55 0.004 90)',
      '--hairline-strong': 'oklch(0.28 0.004 90)',
      '--ink': 'oklch(0.16 0.004 90)',
      '--ink-soft': 'oklch(0.35 0.004 90)',
      '--ink-faint': 'oklch(0.52 0.004 90)',
      // Square corners, always-on controls, no strip, no blur.
      '--window-radius': '0',
      '--window-backdrop': 'none',
      '--window-title-backdrop': 'none',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '1',
      '--window-extra-controls-display': 'none',
    },
  },
};
