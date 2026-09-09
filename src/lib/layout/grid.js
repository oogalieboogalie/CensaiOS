// Grid + ratio snapping primitives. (Split from layoutAlgo.js.)
import { BASE_UNIT, ALLOWED_RATIOS, SNAP_TOLERANCE } from './constants.js';

export function snapToGrid(value, mode = 'round') {
  const scaled = value / BASE_UNIT;
  if (mode === 'floor') return Math.floor(scaled) * BASE_UNIT;
  if (mode === 'ceil') return Math.ceil(scaled) * BASE_UNIT;
  return Math.round(scaled) * BASE_UNIT;
}

export function snapRatio(ratio, sizePx = 1) {
  for (const r of ALLOWED_RATIOS) {
    if (Math.abs(ratio - r) * Math.max(1, sizePx) <= SNAP_TOLERANCE) return r;
  }
  return ratio;
}
