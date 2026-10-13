// Layout tree edits for tiled groups. A group's `root` is a binary split
// tree: { type: 'split', axis, ratio, first, second } or a leaf slot
// { type: 'leaf', windowId, stack? }. A slot holding several windows (tab
// stacking) lists them all in `stack`; `windowId` is the one showing.
// Every function here is pure and returns a new tree (or null when empty).

export const leaf = (windowId) => ({ type: 'leaf', windowId });

const SIDE_AXIS = { left: 'vertical', right: 'vertical', top: 'horizontal', bottom: 'horizontal' };
const NEW_FIRST = { left: true, top: true, right: false, bottom: false };

export function isSide(side) {
  return Object.prototype.hasOwnProperty.call(SIDE_AXIS, side);
}

export function slotIds(slot) {
  if (!slot || slot.type !== 'leaf') return [];
  if (Array.isArray(slot.stack) && slot.stack.length > 1) return [...slot.stack];
  return slot.windowId ? [slot.windowId] : [];
}

/** Every window id in the tree, in reading order (stacks expanded). */
export function treeWindowIds(node, out = []) {
  if (!node) return out;
  if (node.type === 'leaf') {
    out.push(...slotIds(node));
    return out;
  }
  treeWindowIds(node.first, out);
  treeWindowIds(node.second, out);
  return out;
}

/** Ids of windows hidden behind another tab in their slot. */
export function hiddenTabIds(node, out = new Set()) {
  if (!node) return out;
  if (node.type === 'leaf') {
    const ids = slotIds(node);
    if (ids.length > 1) {
      const active = ids.includes(node.windowId) ? node.windowId : ids[0];
      for (const id of ids) if (id !== active) out.add(id);
    }
    return out;
  }
  hiddenTabIds(node.first, out);
  hiddenTabIds(node.second, out);
  return out;
}

export function containsWindow(node, id) {
  return treeWindowIds(node).includes(id);
}

function mapSlot(node, id, fn) {
  if (!node) return node;
  if (node.type === 'leaf') return slotIds(node).includes(id) ? fn(node) : node;
  const first = mapSlot(node.first, id, fn);
  const second = mapSlot(node.second, id, fn);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function makeSlot(ids, activeId) {
  if (ids.length === 0) return null;
  if (ids.length === 1) return leaf(ids[0]);
  return { type: 'leaf', windowId: ids.includes(activeId) ? activeId : ids[0], stack: ids };
}

/** Drop a window from the tree; empty slots and splits collapse. */
export function removeWindow(node, id) {
  if (!node) return null;
  if (node.type === 'leaf') {
    const ids = slotIds(node);
    if (!ids.includes(id)) return node;
    const rest = ids.filter((x) => x !== id);
    return makeSlot(rest, node.windowId === id ? rest[0] : node.windowId);
  }
  const first = removeWindow(node.first, id);
  const second = removeWindow(node.second, id);
  if (!first) return second;
  if (!second) return first;
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

/** Split the slot holding `targetId` and put `newId` on `side` of it. */
export function splitAt(node, targetId, newId, side, ratio = 0.5) {
  if (!isSide(side)) return node;
  return mapSlot(node, targetId, (slot) => {
    const added = leaf(newId);
    const newFirst = NEW_FIRST[side];
    return {
      type: 'split',
      axis: SIDE_AXIS[side],
      ratio: newFirst ? 1 - ratio : ratio,
      first: newFirst ? added : slot,
      second: newFirst ? slot : added,
    };
  });
}

/** Put `newId` along one outer edge of the whole tree. */
export function wrapRoot(node, newId, side, ratio = 0.5) {
  const added = leaf(newId);
  if (!node) return added;
  if (!isSide(side)) return node;
  const newFirst = NEW_FIRST[side];
  return {
    type: 'split',
    axis: SIDE_AXIS[side],
    ratio: newFirst ? 1 - ratio : ratio,
    first: newFirst ? added : node,
    second: newFirst ? node : added,
  };
}

/** Add `newId` as a tab in the slot holding `targetId`, showing it. */
export function stackOnto(node, targetId, newId) {
  return mapSlot(node, targetId, (slot) => makeSlot([...slotIds(slot), newId], newId));
}

/** Show `id` in its slot. */
export function setActiveTab(node, id) {
  return mapSlot(node, id, (slot) => ({ ...slot, windowId: id }));
}

export function nodeAt(node, path = '') {
  let current = node;
  for (const step of path) {
    if (!current || current.type !== 'split') return null;
    current = step === 'f' ? current.first : current.second;
  }
  return current;
}

/** Set the ratio of the split at `path`. */
export function setRatioAt(node, path, ratio) {
  if (!node) return node;
  if (!path) return node.type === 'split' ? { ...node, ratio } : node;
  if (node.type !== 'split') return node;
  const [step, rest] = [path[0], path.slice(1)];
  return step === 'f'
    ? { ...node, first: setRatioAt(node.first, rest, ratio) }
    : { ...node, second: setRatioAt(node.second, rest, ratio) };
}

/**
 * Which corners of `rect` are corners of the group (`outer`). Only those
 * stay rounded so a group reads as one card.
 */
export function outerCorners(rect, outer, tolerance = 1) {
  const left = Math.abs(rect.x - outer.x) <= tolerance;
  const top = Math.abs(rect.y - outer.y) <= tolerance;
  const right = Math.abs(rect.x + rect.w - (outer.x + outer.w)) <= tolerance;
  const bottom = Math.abs(rect.y + rect.h - (outer.y + outer.h)) <= tolerance;
  return { tl: left && top, tr: right && top, br: right && bottom, bl: left && bottom };
}
