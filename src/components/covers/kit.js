// Shared pen settings for the Add palette cover pictures (ModuleCover.jsx).
// Every cover is drawn on a 44 x 24 card in the board's own ink, with one
// Ultem accent detail, so it reads the same on the light and dark looks.

const round = { fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round' };

/** Main lines. */
export const S = { ...round, stroke: 'var(--ink-soft)', strokeWidth: 1 };
/** Quiet lines: grids, text, backgrounds. */
export const F = { ...round, stroke: 'var(--ink-faint)', strokeWidth: 1 };
/** The one accent line. */
export const A = { ...round, stroke: 'var(--accent-line)', strokeWidth: 1.2 };
/** Hairlines. */
export const H = { ...round, stroke: 'var(--hairline)', strokeWidth: 0.8 };

export const INK = 'var(--ink)';
export const SOFT = 'var(--ink-soft)';
export const FAINT = 'var(--ink-faint)';
export const ACCENT = 'var(--accent)';
