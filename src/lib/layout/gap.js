// Group seam width. Layout math is plain JS, but the gap is a theme choice,
// so Theme.jsx pushes the current look's `groupGap` here and every layout
// solve reads it. Defaults to GUTTER when no theme has loaded (tests, SSR).
import { GUTTER } from './constants.js';

export const GROUP_GAP_RANGE = Object.freeze({ min: 0, max: 16, step: 1 });

let current = GUTTER;

export function getGroupGap() {
  return current;
}

export function setGroupGap(value) {
  const n = Number(value);
  current = Number.isFinite(n)
    ? Math.max(GROUP_GAP_RANGE.min, Math.min(GROUP_GAP_RANGE.max, Math.round(n)))
    : GUTTER;
  return current;
}
