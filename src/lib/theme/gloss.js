// Shared glossy chrome treatment for floating canvas pieces (toolbar pill,
// host status, chat bubble, zoom HUD, top bars). One recipe so every piece
// matches: faint top sheen, hairline rim, bevel insets, soft drop. All
// theme-relative — no hardcoded colors, works dark and light.

export const GLOSS_SHEEN = 'linear-gradient(to bottom, oklch(1 0 0 / 0.10), oklch(0 0 0 / 0.06))';

export const GLOSS_BEVEL = 'inset 0 1px 0 oklch(1 0 0 / 0.12), inset 0 -1px 0 oklch(0 0 0 / 0.10)';

// Large floating containers (bars, cards, pills).
export function glossContainer(extra = {}) {
  return {
    background: `${GLOSS_SHEEN}, var(--surface)`,
    border: '1px solid var(--hairline)',
    boxShadow: `${GLOSS_BEVEL}, 0 4px 14px oklch(0 0 0 / 0.18)`,
    ...extra,
  };
}

// Small buttons living on glossy containers.
export function glossButton(extra = {}) {
  return {
    background: `${GLOSS_SHEEN}, var(--surface)`,
    border: '1px solid var(--hairline)',
    boxShadow: `${GLOSS_BEVEL}, 0 2px 6px oklch(0 0 0 / 0.16)`,
    ...extra,
  };
}
