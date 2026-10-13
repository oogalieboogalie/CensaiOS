// Shared steps of every group edit (detach, re-tile, dissolve) plus the
// small edits: seams, tabs, and reconciling after a remote change.
import { solveLayout } from './infer.js';
import { getGroupGap } from './gap.js';
import { patchWindow } from '../canvasObjectTypes.js';
import { removeWindow, setActiveTab, setRatioAt, treeWindowIds } from './tree.js';
import { tiledMembers, unionRect, rectOf } from './dockZones.js';

export function retile(group, winsById, gap) {
  const solved = solveLayout(group.root, rectOf(group), { snapBounds: false, gap });
  const patches = new Map(solved.rects.map(({ id, rect }) => [id, rect]));
  const outer = unionRect(solved.slots.map((slot) => slot.rect)) || rectOf(group);
  for (const [id, rect] of patches) {
    const win = winsById.get(id);
    if (!win) continue;
    if (win.x === rect.x && win.y === rect.y && win.w === rect.w && win.h === rect.h && win.groupId === group.id) continue;
    winsById.set(id, patchWindow(win, { ...rect, groupId: group.id, maximized: false }));
  }
  return { ...group, x: outer.x, y: outer.y, w: outer.w, h: outer.h };
}

// `keep` lists groups that must not dissolve here (a one-window group bound
// to an F-key is fine; it only dissolves when it loses a window).
export function finish(state, winsById, groupsById, touched, gap, keep = new Set()) {
  for (const id of touched) {
    const group = groupsById.get(id);
    if (!group) continue;
    const ids = group.root
      ? treeWindowIds(group.root).filter((wid) => winsById.has(wid))
      : [...winsById.values()].filter((w) => w.groupId === id).map((w) => w.id);
    if (!group.root && ids.length > 1) continue;
    if (ids.length <= 1 && !(keep.has(id) && ids.length === 1)) {
      // A group of one dissolves into a loose window; an empty one disappears.
      for (const wid of ids) winsById.set(wid, patchWindow(winsById.get(wid), { groupId: null }));
      for (const w of winsById.values()) {
        if (w.groupId === id) winsById.set(w.id, patchWindow(w, { groupId: null }));
      }
      groupsById.delete(id);
      continue;
    }
    groupsById.set(id, retile(group, winsById, gap));
  }
  return {
    wins: state.wins.map((w) => winsById.get(w.id)).filter(Boolean),
    canvasGroups: state.canvasGroups.map((g) => groupsById.get(g.id)).filter(Boolean)
      .concat([...groupsById.values()].filter((g) => !state.canvasGroups.some((old) => old.id === g.id))),
  };
}

export function detach(winId, winsById, groupsById, touched) {
  for (const group of groupsById.values()) {
    if (!group.root || !treeWindowIds(group.root).includes(winId)) continue;
    groupsById.set(group.id, { ...group, root: removeWindow(group.root, winId), presetId: null });
    touched.add(group.id);
  }
  const win = winsById.get(winId);
  if (win?.groupId) {
    touched.add(win.groupId);
    winsById.set(winId, patchWindow(win, { groupId: null }));
  }
}

/** Show tab `id` in its slot. */
export function showTab(state, groupId, id) {
  const group = state.canvasGroups.find((g) => g.id === groupId);
  if (!group?.root) return null;
  return { canvasGroups: state.canvasGroups.map((g) => (g.id === groupId ? { ...g, root: setActiveTab(g.root, id) } : g)) };
}

/** Drag a seam: set the split at `path` and re-tile in one update. */
export function setSeam(state, groupId, path, ratio, { gap = getGroupGap() } = {}) {
  const group = state.canvasGroups.find((g) => g.id === groupId);
  if (!group?.root) return null;
  const winsById = new Map(state.wins.map((w) => [w.id, w]));
  const groupsById = new Map(state.canvasGroups.map((g) => [g.id, g]));
  groupsById.set(groupId, { ...group, root: setRatioAt(group.root, path, ratio), presetId: null });
  return finish(state, winsById, groupsById, new Set([groupId]), gap, new Set([groupId]));
}

/**
 * Bring every tiled group's windows back in line with its tree and rect.
 * Two people editing at once can each write half of a change (one drags a
 * seam while the other moves the group); the CRDT merges field by field, so
 * the windows may disagree with the group. Every client runs this after a
 * remote change and computes the same answer, so they converge. Returns
 * null when everything already lines up.
 */
export function reconcileTiles(state, { gap = getGroupGap() } = {}) {
  const winsById = new Map(state.wins.map((w) => [w.id, w]));
  const groupsById = new Map(state.canvasGroups.map((g) => [g.id, g]));
  const touched = new Set();
  const keep = new Set();
  for (const group of state.canvasGroups) {
    if (!group.root) continue;
    const ids = treeWindowIds(group.root);
    const missing = ids.filter((id) => !winsById.has(id));
    let root = group.root;
    for (const id of missing) root = removeWindow(root, id);
    const next = { ...group, root };
    if (missing.length) {
      groupsById.set(group.id, next);
      touched.add(group.id);
      continue;
    }
    if (!tiledMembers(group, state.wins)) continue;
    keep.add(group.id);
    const solved = solveLayout(root, rectOf(group), { snapBounds: false, gap });
    const off = solved.rects.some(({ id, rect }) => {
      const w = winsById.get(id);
      return Math.abs(w.x - rect.x) > 0.5 || Math.abs(w.y - rect.y) > 0.5
        || Math.abs(w.w - rect.w) > 0.5 || Math.abs(w.h - rect.h) > 0.5;
    });
    const outer = unionRect(solved.slots.map((slot) => slot.rect));
    const groupOff = outer && (Math.abs(outer.w - group.w) > 0.5 || Math.abs(outer.h - group.h) > 0.5);
    if (off || groupOff) touched.add(group.id);
  }
  if (!touched.size) return null;
  return finish(state, winsById, groupsById, touched, gap, keep);
}
