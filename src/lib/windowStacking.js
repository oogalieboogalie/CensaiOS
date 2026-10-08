// Shared window stacking order. Each window may carry a numeric `zIndex`
// (synced through the CRDT like any other window field, so every person sees
// the same window on top). Windows without one stack above all numbered ones
// in array order, which matches how the canvas painted them before.

function hasZ(win) {
  return Number.isFinite(win?.zIndex);
}

// id -> 0-based stack level (0 = bottom). Ties break by array order.
export function stackLevels(wins) {
  const order = (wins || []).map((win, index) => ({ win, index }));
  order.sort((a, b) => {
    const az = hasZ(a.win), bz = hasZ(b.win);
    if (az && bz && a.win.zIndex !== b.win.zIndex) return a.win.zIndex - b.win.zIndex;
    if (az !== bz) return az ? -1 : 1;
    return a.index - b.index;
  });
  const levels = new Map();
  order.forEach(({ win }, level) => levels.set(win.id, level));
  return levels;
}

// Bring one window to the front. Returns the same array when it is already
// on top, so selecting the front window never writes to the shared doc.
// Only the raised window gets a new zIndex; an unnumbered window behind it
// gets frozen first so it does not jump above the one just raised.
export function raiseWindow(wins, id) {
  const list = wins || [];
  const target = list.find((win) => win.id === id);
  if (!target) return list;
  const levels = stackLevels(list);
  if (levels.get(id) === list.length - 1) return list;

  let top = list.reduce((max, win) => (hasZ(win) ? Math.max(max, win.zIndex) : max), 0);
  const frozen = new Map();
  [...list]
    .filter((win) => !hasZ(win) && win.id !== id)
    .sort((a, b) => levels.get(a.id) - levels.get(b.id))
    .forEach((win) => { top += 1; frozen.set(win.id, top); });

  return list.map((win) => {
    if (win.id === id) return { ...win, zIndex: top + 1 };
    if (frozen.has(win.id)) return { ...win, zIndex: frozen.get(win.id) };
    return win;
  });
}
