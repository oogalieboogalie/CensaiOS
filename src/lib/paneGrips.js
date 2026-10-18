// Resize grips the desktop Browser page must leave uncovered.
//
// The desktop app shows real sites in a native view that always paints above
// the canvas and takes every click over it, so a window's resize corner and
// edges (and a group's resize corner) that sit over the page could not be
// grabbed. Grips are marked `data-resize-grip`; the page is trimmed back from
// whichever side each overlapping grip needs the least taken off, so the
// corner takes a short strip off the bottom and the side edges a sliver.

export function trimForGrips(rect, grips) {
  const cut = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const g of grips) {
    if (!g || g.width <= 0 || g.height <= 0) continue;
    const overlaps = g.left < rect.right && g.right > rect.left && g.top < rect.bottom && g.bottom > rect.top;
    if (!overlaps) continue;
    // Prefer the bottom, then the sides: a strip under the page reads like a
    // status bar, a strip on top would eat the address bar's neighbor.
    const options = [
      ['bottom', rect.bottom - g.top],
      ['right', rect.right - g.left],
      ['left', g.right - rect.left],
      ['top', g.bottom - rect.top],
    ];
    let best = options[0];
    for (const option of options) if (option[1] < best[1]) best = option;
    // A corner is about as deep as it is wide; rounding must not flip it to a
    // strip down the side.
    if (best !== options[0] && options[0][1] <= best[1] * 1.5 + 1) best = options[0];
    cut[best[0]] = Math.max(cut[best[0]], best[1]);
  }
  const left = rect.left + cut.left;
  const top = rect.top + cut.top;
  const width = Math.max(0, rect.right - cut.right - left);
  const height = Math.max(0, rect.bottom - cut.bottom - top);
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function gripRects(doc = typeof document === 'undefined' ? null : document) {
  if (!doc?.querySelectorAll) return [];
  return Array.from(doc.querySelectorAll('[data-resize-grip]'), (node) => node.getBoundingClientRect());
}
