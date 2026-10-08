// Docking geometry shared by the drop targets and the state transforms:
// which groups are tiled, which corners stay rounded, and the layouts the
// layout bar offers. Pure functions of { wins, canvasGroups }.
import { TAB_STRIP_HEIGHT } from './constants.js';
import { outerCorners, leaf, treeWindowIds, hiddenTabIds } from './tree.js';

// Screen-px sizes of the drag targets; divided by zoom for canvas units.
export const EDGE_BAND_PX = 20;
export const LOOSE_EDGE_BAND_PX = 56;

// Layout bar: small layout diagrams shown at the top of the target while
// dragging. Dropping on a cell applies that layout with the dragged window
// in that cell. Cells are unit rects [x, y, w, h].
export const ZONE_PRESETS = Object.freeze([
  Object.freeze({ id: 'TWO_UP', label: '2-up', count: 2, cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] }),
  Object.freeze({ id: 'THREE_COL', label: '3 columns', count: 3, cells: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] }),
  Object.freeze({ id: 'ONE_PLUS_TWO', label: '1 + 2', count: 3, cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] }),
  Object.freeze({ id: 'GRID_2X2', label: '2 x 2', count: 4, cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] }),
  Object.freeze({ id: 'FOCUS_SIDEBAR', label: 'Focus + sidebar', count: 0, cells: [[0, 0, 0.667, 1], [0.667, 0, 0.333, 1]] }),
]);

export const LAYOUT_BAR = Object.freeze({ cellW: 44, cellH: 28, pad: 6, gap: 6, top: 12 });

/** Layouts offered when the target will hold `count` windows. */
export function zonePresetsFor(count) {
  return ZONE_PRESETS.filter((p) => p.count === count || (p.id === 'FOCUS_SIDEBAR' && count >= 2));
}

const leafOf = (id) => leaf(id);

function columns(ids, axis = 'vertical') {
  if (ids.length === 1) return leafOf(ids[0]);
  return { type: 'split', axis, ratio: 1 / ids.length, first: leafOf(ids[0]), second: columns(ids.slice(1), axis) };
}

/** Tree for a zone preset over ids in cell order. */
export function zonePresetTree(presetId, ids) {
  if (!ids.length) return null;
  if (ids.length === 1) return leafOf(ids[0]);
  switch (presetId) {
    case 'ONE_PLUS_TWO':
      return { type: 'split', axis: 'vertical', ratio: 0.5, first: leafOf(ids[0]), second: columns(ids.slice(1), 'horizontal') };
    case 'GRID_2X2': {
      const cols = Math.ceil(Math.sqrt(ids.length));
      const rows = [];
      for (let i = 0; i < ids.length; i += cols) rows.push(columns(ids.slice(i, i + cols), 'vertical'));
      const stackRows = (list) => (list.length === 1 ? list[0] : { type: 'split', axis: 'horizontal', ratio: 1 / list.length, first: list[0], second: stackRows(list.slice(1)) });
      return stackRows(rows);
    }
    case 'FOCUS_SIDEBAR':
      return { type: 'split', axis: 'vertical', ratio: 0.667, first: leafOf(ids[0]), second: columns(ids.slice(1), 'horizontal') };
    case 'TWO_UP':
    case 'THREE_COL':
    default:
      return columns(ids, 'vertical');
  }
}

export const rectOf = (w) => ({ x: w.x, y: w.y, w: w.w, h: w.h });
export const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * Members of a tiled group, or null when the group isn't tiled (no layout
 * tree, or windows in the group that the tree doesn't know about).
 */
export function tiledMembers(group, wins) {
  if (!group?.root) return null;
  const byId = new Map(wins.map((w) => [w.id, w]));
  const ids = treeWindowIds(group.root);
  if (!ids.length || ids.some((id) => !byId.has(id))) return null;
  const set = new Set(ids);
  if (wins.some((w) => w.groupId === group.id && !w.pinned && !set.has(w.id))) return null;
  return ids.map((id) => byId.get(id));
}

/** Map windowId -> { groupId, corners } for every tile in a tiled group. */
export function tileIndex(wins, canvasGroups) {
  const index = new Map();
  const hidden = new Set();
  for (const group of canvasGroups) {
    const members = tiledMembers(group, wins);
    if (!members) continue;
    const stacked = new Set();
    for (const id of hiddenTabIds(group.root)) { hidden.add(id); stacked.add(id); }
    for (const w of members) if (hidden.has(w.id) === false && isStacked(group.root, w.id)) stacked.add(w.id);
    const outer = rectOf(group);
    for (const w of members) {
      // A tab stack's strip sits above its windows and owns the slot's top corners.
      const r = stacked.has(w.id) ? { x: w.x, y: w.y - TAB_STRIP_HEIGHT, w: w.w, h: w.h + TAB_STRIP_HEIGHT } : rectOf(w);
      const c = outerCorners(r, outer);
      const corners = [
        c.tl && !stacked.has(w.id) ? 'tl' : '',
        c.tr && !stacked.has(w.id) ? 'tr' : '',
        c.br ? 'br' : '',
        c.bl ? 'bl' : '',
      ].filter(Boolean).join(' ');
      index.set(w.id, { groupId: group.id, corners });
    }
  }
  return { index, hidden };
}

function isStacked(root, id) {
  let found = false;
  const walk = (node) => {
    if (!node || found) return;
    if (node.type === 'leaf') {
      if (Array.isArray(node.stack) && node.stack.length > 1 && node.stack.includes(id)) found = true;
      return;
    }
    walk(node.first);
    walk(node.second);
  };
  walk(root);
  return found;
}

export function unionRect(rects) {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x, y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  };
}

/** Rect the layout bar occupies at the top of `host`, plus each cell's rect. */
