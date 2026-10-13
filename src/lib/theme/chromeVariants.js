/**
 * src/lib/theme/chromeVariants.js
 *
 * Alternate window-chrome styles for WindowFrame
 * (src/components/windows/WindowFrame.jsx) + WindowTitle
 * (src/components/windows/WindowTitle.jsx).
 *
 * Every variant is PURE DATA: a map of the window-token CSS vars the frame
 * already reads. No hardcoded hues — everything is derived from the semantic
 * tokens (--surface, --accent, --hairline, ...) so variants follow any mood.
 *
 * Tokens the frame reads (see Theme.jsx THEME_VAR_DEFAULTS + WindowFrame.jsx):
 *   --window-bg, --window-title-bg, --window-backdrop, --window-title-backdrop,
 *   --window-radius, --window-shadow, --window-shadow-active,
 *   --window-control-idle-opacity, --window-extra-controls-display,
 *   --window-strip-bg, --window-strip-height
 *
 * Preview any variant globally in seconds (no code change to the frame):
 *
 *   import { applyChromeVariantToCustomVars } from './chromeVariants.js';
 *   setTheme({ customVars: applyChromeVariantToCustomVars(theme.customVars, 'glass') });
 *
 * Per-window (persists on the win object like hue/opacity/frameless):
 *   `win.chromeVariant = 'glass'` → WindowFrame.jsx scopes the variant's vars
 *   as inline custom props on that frame only, and offers the rail layout via
 *   WindowChromeContext so WindowTitle.jsx clears traffic-light controls.
 *   Set from the right-click WindowStyleMenu.jsx picker. Unknown ids fall
 *   back to stock chrome.
 *
 * Or paste a variant's `vars` block into the Fine Tune panel's customVars,
 * or into window-lab (`?kind=todos`) via localStorage `homebase.theme.v1`.
 */

export const CHROME_VARIANT_IDS = Object.freeze([
  'low-profile',
  'glass',
  'pill-tab',
  'traffic-mac',
  'brutalist',
  'ring',
  'flat',
  'clean',
  'win98',
]);

function freezeVariant(v) {
  return Object.freeze({ ...v, vars: Object.freeze({ ...v.vars }) });
}

export const CHROME_VARIANTS = Object.freeze({
  // Current default — the baseline everything else remixes. Kept here so the
  // menu / lab can offer a one-click "reset to stock" entry.
  'low-profile': freezeVariant({
    id: 'low-profile',
    label: 'Low Profile',
    description: 'Stock chrome: 14px radius, hairline border, controls fade until hover.',
    vars: {
      '--window-radius': 'var(--radius-card)',
      '--window-shadow': 'var(--shadow-card)',
      '--window-backdrop': 'none',
      '--window-title-backdrop': 'none',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '0.35',
      '--window-extra-controls-display': 'none',
    },
  }),

  // Frosted card with a lit edge: an accent ring + top highlight for
  // presence, heavier blur/saturation so the frost reads, and a dedicated
  // --window-shadow-active so the FOCUSED window glows while the rest stay
  // calm. No gradient fills — the pop comes from the edge light.
  glass: freezeVariant({
    id: 'glass',
    label: 'Glass',
    description: 'Frosted card with a lit edge and a glowing focus state. Follows your corner radius.',
    vars: {
      '--window-bg': 'color-mix(in oklab, var(--surface) 68%, transparent)',
      '--window-title-bg': 'color-mix(in oklab, var(--accent-soft) 30%, transparent)',
      '--window-backdrop': 'blur(22px) saturate(1.6)',
      '--window-title-backdrop': 'blur(22px)',
      '--window-radius': 'var(--radius-card)',
      '--window-shadow':
        '0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent), 0 1px 0 oklch(1 0 0 / 0.35) inset, 0 24px 64px -24px oklch(0 0 0 / 0.5)',
      '--window-shadow-active':
        '0 0 0 1px color-mix(in oklab, var(--accent) 70%, transparent), 0 1px 0 oklch(1 0 0 / 0.4) inset, 0 24px 70px -18px color-mix(in oklab, var(--accent) 35%, black)',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '0',
      '--window-extra-controls-display': 'none',
    },
  }),

  // Hard offset shadow off --ink so it inverts between light/dark moods.
  // Inherits var(--radius-card) — never stomps the theme's corner shape.
  // Accent strip is a flat fill, no gradient.
  brutalist: freezeVariant({
    id: 'brutalist',
    label: 'Brutalist',
    description: 'Hard offset shadow + flat accent strip. Follows your corner radius.',
    vars: {
      '--window-radius': 'var(--radius-card)',
      '--window-shadow': '4px 4px 0 var(--ink)',
      '--window-backdrop': 'none',
      '--window-title-backdrop': 'none',
      '--window-title-bg': 'var(--surface-2)',
      '--window-strip-height': '4px',
      '--window-strip-bg': 'var(--accent)',
      '--window-control-idle-opacity': '1',
      '--window-extra-controls-display': 'none',
    },
  }),

  // Soft oversized radius + tinted title wash reads as a "pill tab" header.
  // Title wash reuses --accent-soft so it tracks the active accent hue.
  'pill-tab': freezeVariant({
    id: 'pill-tab',
    label: 'Pill Tab',
    description: 'Accent-tinted title pill. Follows your corner radius.',
    vars: {
      '--window-radius': 'var(--radius-card)',
      '--window-shadow': 'var(--shadow-card)',
      '--window-backdrop': 'none',
      '--window-title-bg': 'var(--accent-soft)',
      '--window-title-backdrop': 'none',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '0.6',
      '--window-extra-controls-display': 'none',
    },
  }),

  // macOS-style left traffic lights. WindowFrame.jsx switches the close /
  // pin layout when --window-extra-controls-display is anything but `none`
  // (see the `usesTrafficLights` check), and WindowTitle.jsx widens its
  // left padding to clear the dots.
  'traffic-mac': freezeVariant({
    id: 'traffic-mac',
    label: 'Traffic Mac',
    description: 'Left-side traffic-light dots, 14px radius, controls always visible.',
    vars: {
      '--window-radius': '14px',
      '--window-shadow': 'var(--shadow-card)',
      '--window-backdrop': 'none',
      '--window-title-backdrop': 'none',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '1',
      '--window-extra-controls-display': 'block',
    },
  }),

  // Quiet accent outline: 1px ring + the stock shadow, everything else
  // inherited. The anti-neon-strip.
  ring: freezeVariant({
    id: 'ring',
    label: 'Ring',
    description: 'Thin accent outline over the stock shadow. Quiet.',
    vars: {
      '--window-radius': 'var(--radius-card)',
      '--window-shadow':
        '0 0 0 1px var(--accent), var(--shadow-card)',
      '--window-backdrop': 'none',
      '--window-title-backdrop': 'none',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '0.35',
      '--window-extra-controls-display': 'none',
    },
  }),

  // Shadowless paper: no drop shadow, soft title wash for definition.
  // Sits calm on dense canvases.
  flat: freezeVariant({
    id: 'flat',
    label: 'Flat',
    description: 'No shadow, soft title wash. Calm on crowded boards.',
    vars: {
      '--window-radius': 'var(--radius-card)',
      '--window-shadow': 'none',
      '--window-backdrop': 'none',
      '--window-title-bg': 'var(--surface-2)',
      '--window-title-backdrop': 'none',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '0.35',
      '--window-extra-controls-display': 'none',
    },
  }),

  // Stock look, shy chrome: controls fully hidden until hover.
  // For people who find even 0.35 idle opacity noisy.
  clean: freezeVariant({
    id: 'clean',
    label: 'Clean',
    description: 'Stock frame, controls appear only on hover.',
    vars: {
      '--window-radius': 'var(--radius-card)',
      '--window-shadow': 'var(--shadow-card)',
      '--window-backdrop': 'none',
      '--window-title-backdrop': 'none',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '0',
      '--window-extra-controls-display': 'none',
    },
  }),

  // Windows 98 module skin — pair with the win98 mood (teal desktop, silver
  // surfaces). Square corners, stepped bevel frame, flat navy title bar,
  // hard offset drop. No gradients, no blur: the bevel IS the decoration.
  win98: freezeVariant({
    id: 'win98',
    label: 'Windows 98',
    description: 'Square beveled frame, navy title bar. Pair with the Windows 98 mood.',
    vars: {
      '--window-radius': '0',
      '--window-title-bg': 'oklch(0.38 0.095 264)',
      '--window-backdrop': 'none',
      '--window-title-backdrop': 'none',
      '--window-shadow':
        'inset -1px -1px 0 oklch(0.25 0 0), inset 1px 1px 0 oklch(1 0 0), inset -2px -2px 0 var(--hairline-strong), inset 2px 2px 0 oklch(0.97 0 0), 5px 5px 0 oklch(0 0 0 / 0.20)',
      '--window-strip-height': '0px',
      '--window-strip-bg': 'transparent',
      '--window-control-idle-opacity': '1',
      '--window-extra-controls-display': 'none',
    },
  }),
});

export function getChromeVariant(id) {
  return CHROME_VARIANTS[id] || null;
}

export function listChromeVariantIds() {
  return [...CHROME_VARIANT_IDS];
}

/**
 * Merge a variant's vars into an existing customVars object (e.g.
 * theme.customVars from the Fine Tune panel). Passing 'low-profile'
 * restores stock values for every token the variants touch.
 */
export function applyChromeVariantToCustomVars(customVars, id) {
  const variant = getChromeVariant(id);
  if (!variant) return { ...(customVars || {}) };
  return { ...(customVars || {}), ...variant.vars };
}
