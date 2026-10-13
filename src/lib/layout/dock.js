// Docking: what happens when a window is dropped onto a group, onto another
// window, or pulled out of a group. Everything here is a pure function of
// { wins, canvasGroups } so the store, the drag overlay (to preview where a
// window will land) and the tests all share one implementation.
import { getGroupGap } from './gap.js';
import { patchWindow } from '../canvasObjectTypes.js';
import { leaf, isSide, splitAt, wrapRoot, stackOnto, removeWindow, treeWindowIds } from './tree.js';
import { zonePresetTree, rectOf } from './dockZones.js';
import { isDockAction } from './dockTargets.js';
import { finish, detach } from './dockApply.js';

export {
  EDGE_BAND_PX, LOOSE_EDGE_BAND_PX, ZONE_PRESETS, LAYOUT_BAR, zonePresetsFor, zonePresetTree,
  tiledMembers, tileIndex, unionRect,
} from './dockZones.js';
export { layoutBarGeometry, resolveDockTarget, isDockAction } from './dockTargets.js';
export { showTab, setSeam, reconcileTiles } from './dockApply.js';

/**
 * Drop `winId` on `target`. Returns the next { wins, canvasGroups } (only
 * those two keys) or null when nothing changes. `makeGroup` supplies id/hue
 * for a group created by docking two loose windows.
 */
export function applyDock(state, winId, target, { gap = getGroupGap(), makeGroup } = {}) {
  const dragged = state.wins.find((w) => w.id === winId);
  if (!dragged || !isDockAction(target)) return null;
  const winsById = new Map(state.wins.map((w) => [w.id, w]));
  const groupsById = new Map(state.canvasGroups.map((g) => [g.id, g]));
  const touched = new Set();
  detach(winId, winsById, groupsById, touched);
  const size = { w: dragged.w, h: dragged.h };

  const newGroupAround = (host, rect, root) => {
    const made = makeGroup ? makeGroup() : { id: `group-${winId}`, hue: 240 };
    const group = { id: made.id, label: made.label || 'Group', hue: made.hue ?? 240, root, ...rect };
    groupsById.set(group.id, group);
    winsById.set(host.id, patchWindow(winsById.get(host.id), { groupId: group.id }));
    winsById.set(winId, patchWindow(winsById.get(winId), { groupId: group.id, pinned: false }));
    touched.add(group.id);
  };

  const extend = (rect, side) => {
    if (side === 'left') return { x: rect.x - size.w - gap, y: rect.y, w: rect.w + size.w + gap, h: rect.h };
    if (side === 'right') return { x: rect.x, y: rect.y, w: rect.w + size.w + gap, h: rect.h };
    if (side === 'top') return { x: rect.x, y: rect.y - size.h - gap, w: rect.w, h: rect.h + size.h + gap };
    return { x: rect.x, y: rect.y, w: rect.w, h: rect.h + size.h + gap };
  };
  const shareOf = (rect, side) => (side === 'left' || side === 'right'
    ? rect.w / Math.max(1, rect.w + size.w)
    : rect.h / Math.max(1, rect.h + size.h));

  if (target.kind === 'tile') {
    const host = winsById.get(target.targetId);
    if (!host || host.id === winId) return null;
    const group = target.groupId ? groupsById.get(target.groupId) : null;
    if (group?.root && treeWindowIds(group.root).includes(host.id)) {
      const root = target.side === 'center'
        ? stackOnto(group.root, host.id, winId)
        : splitAt(group.root, host.id, winId, target.side, 0.5);
      groupsById.set(group.id, { ...group, root, presetId: null });
      winsById.set(winId, patchWindow(winsById.get(winId), { groupId: group.id, pinned: false }));
      touched.add(group.id);
    } else {
      if (!isSide(target.side)) return null;
      const rect = rectOf(host);
      const root = splitAt(leaf(host.id), host.id, winId, target.side, shareOf(rect, target.side));
      newGroupAround(host, extend(rect, target.side), root);
    }
  } else if (target.kind === 'edge') {
    const group = groupsById.get(target.groupId);
    if (!group?.root || !isSide(target.side)) return null;
    const rect = rectOf(group);
    groupsById.set(group.id, {
      ...group,
      ...extend(rect, target.side),
      root: wrapRoot(group.root, winId, target.side, shareOf(rect, target.side)),
      presetId: null,
    });
    winsById.set(winId, patchWindow(winsById.get(winId), { groupId: group.id, pinned: false }));
    touched.add(group.id);
  } else if (target.kind === 'preset') {
    const group = target.groupId ? groupsById.get(target.groupId) : null;
    const hostIds = group?.root ? treeWindowIds(group.root) : (target.hostId ? [target.hostId] : []);
    if (!hostIds.length) return null;
    const ids = [...hostIds];
    const at = target.presetId === 'FOCUS_SIDEBAR' && target.cell > 0 ? ids.length : Math.min(ids.length, Math.max(0, target.cell));
    ids.splice(at, 0, winId);
    const root = zonePresetTree(target.presetId, ids);
    if (group) {
      groupsById.set(group.id, { ...group, root, presetId: null });
      winsById.set(winId, patchWindow(winsById.get(winId), { groupId: group.id, pinned: false }));
      touched.add(group.id);
    } else {
      const host = winsById.get(target.hostId);
      if (!host) return null;
      const rect = rectOf(host);
      newGroupAround(host, { x: rect.x, y: rect.y, w: rect.w + size.w + gap, h: Math.max(rect.h, size.h) }, root);
    }
  }
  return finish(state, winsById, groupsById, touched, gap);
}

/** Pull a window out of its group; the rest of the group re-tiles. */
export function undockWindow(state, winId, { gap = getGroupGap() } = {}) {
  const win = state.wins.find((w) => w.id === winId);
  if (!win) return null;
  const winsById = new Map(state.wins.map((w) => [w.id, w]));
  const groupsById = new Map(state.canvasGroups.map((g) => [g.id, g]));
  const touched = new Set();
  detach(winId, winsById, groupsById, touched);
  if (!touched.size) return null;
  return finish(state, winsById, groupsById, touched, gap);
}

/**
 * `removedWins` are gone (closed or deleted; `state.wins` already excludes
 * them): take them out of their groups, re-tile what is left, and dissolve
 * groups that end up with one window or none. Returns null if no group
 * was affected.
 */
export function pruneAfterRemoval(state, removedWins = [], { gap = getGroupGap() } = {}) {
  const removed = new Set(removedWins.map((w) => w.id));
  const winsById = new Map(state.wins.map((w) => [w.id, w]));
  const groupsById = new Map(state.canvasGroups.map((g) => [g.id, g]));
  const touched = new Set();
  for (const group of state.canvasGroups) {
    const treeIds = group.root ? treeWindowIds(group.root) : [];
    const lost = treeIds.some((id) => removed.has(id)) || removedWins.some((w) => w.groupId === group.id);
    if (!lost) continue;
    if (group.root) {
      let root = group.root;
      for (const id of treeIds) if (removed.has(id)) root = removeWindow(root, id);
      groupsById.set(group.id, { ...group, root });
      touched.add(group.id);
      continue;
    }
    // Groups without a tree (manual layouts) never re-tile; they only dissolve.
    const members = state.wins.filter((w) => w.groupId === group.id);
    if (members.length <= 1) {
      for (const w of members) winsById.set(w.id, patchWindow(w, { groupId: null }));
      groupsById.delete(group.id);
      touched.add(group.id);
    }
  }
  if (!touched.size) return null;
  return finish(state, winsById, groupsById, touched, gap);
}
