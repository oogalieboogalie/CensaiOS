// Normalized default window sizes. Manifests used to pick an opening size
// per window (dozens of one-off sizes like 340x460, 380x520, 420x540), so
// nothing on the canvas lined up and groups tiled unevenly. Every window now
// opens at one of a few size classes. A manifest can name its class with
// `sizeClass`; otherwise its authored defaultSize snaps to the nearest class.
// `sizeClass: 'fixed'` keeps the authored size for windows with a bespoke
// shape. Sizes sit on the 16px layout grid (src/lib/layout/constants.js).

export const WINDOW_SIZE_CLASSES = Object.freeze({
  compact: Object.freeze({ w: 368, h: 480 }),
  tall: Object.freeze({ w: 480, h: 640 }),
  standard: Object.freeze({ w: 560, h: 448 }),
  wide: Object.freeze({ w: 768, h: 528 }),
  large: Object.freeze({ w: 960, h: 640 }),
  xl: Object.freeze({ w: 1200, h: 720 }),
});

export const FIXED_SIZE_CLASS = 'fixed';

// Smallest a window may get, by hand or as a tile in a group. Resizing a
// window, dragging a seam between grouped windows and re-solving a group
// layout all stop here.
export const MIN_WINDOW_SIZE = Object.freeze({ w: 240, h: 160 });

/**
 * Nearest size class to an authored size. Shape counts double so a small
 * landscape window stays landscape instead of snapping to the portrait
 * compact class just because it is closer in area.
 */
export function nearestSizeClass(size) {
  if (!size || !(size.w > 0) || !(size.h > 0)) return 'standard';
  let best = 'standard';
  let bestScore = Infinity;
  for (const [name, cls] of Object.entries(WINDOW_SIZE_CLASSES)) {
    const area = Math.abs(Math.log((size.w * size.h) / (cls.w * cls.h)));
    const shape = Math.abs(Math.log((size.w / size.h) / (cls.w / cls.h)));
    const score = area + 2 * shape;
    if (score < bestScore) { bestScore = score; best = name; }
  }
  return best;
}

/** Opening size for a window given its authored size and optional class. */
export function normalizeDefaultSize(size, sizeClass) {
  if (sizeClass === FIXED_SIZE_CLASS && size) return { w: size.w, h: size.h };
  const name = WINDOW_SIZE_CLASSES[sizeClass] ? sizeClass : nearestSizeClass(size);
  return { ...WINDOW_SIZE_CLASSES[name] };
}
