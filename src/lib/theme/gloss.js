// Shared glossy chrome treatment for floating canvas pieces (toolbar pill,
// host status, chat bubble, zoom HUD, top bars). One recipe so every piece
// matches. Sheen and bevel are theme knobs (--gloss-sheen / --gloss-bevel,
// set by the look's "gloss" flag in src/lib/theme/looks.js).

export const GLOSS_SHEEN = 'var(--gloss-sheen)';

export const GLOSS_BEVEL = 'var(--gloss-bevel)';

// Large floating containers (bars, cards, pills).
export function glossContainer(extra = {}) {
  return {
    background: `${GLOSS_SHEEN}, var(--surface)`,
    border: '1px solid var(--hairline)',
    boxShadow: `${GLOSS_BEVEL}, var(--elevation-2)`,
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
