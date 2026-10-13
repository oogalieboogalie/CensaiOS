// Shared glossy chrome treatment for floating canvas pieces (toolbar pill,
// host status, chat bubble, zoom HUD, top bars). One recipe so every piece
// matches. Sheen and bevel are theme knobs (--gloss-sheen / --gloss-bevel,
// set by the look's "gloss" flag in src/lib/theme/looks.js).

export const GLOSS_SHEEN = 'var(--gloss-sheen)';

export const GLOSS_BEVEL = 'var(--gloss-bevel)';

// Frosted glass blur for a glossContainer (src/styles/glass.css). Put it on the
// same element: <div className={GLASS_HOST} style={glossContainer()}>.
export const GLASS_HOST = 'hb-glass-host';

// Large floating containers (bars, cards, pills). Frosted glass tint; pair
// with className={GLASS_HOST} for the blur.
export function glossContainer(extra = {}) {
  return {
    background: `${GLOSS_SHEEN}, var(--glass-bg)`,
    border: '1px solid var(--glass-line)',
    boxShadow: `${GLOSS_BEVEL}, var(--glass-shadow)`,
    ...extra,
  };
}

// Small buttons living on glossy containers.
export function glossButton(extra = {}) {
  return {
    background: `${GLOSS_SHEEN}, var(--surface)`,
    border: '1px solid var(--hairline)',
    boxShadow: `${GLOSS_BEVEL}, var(--elevation-1)`,
    ...extra,
  };
}
