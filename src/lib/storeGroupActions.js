import {
  cleanLayout,
  fitGroupToLayout,
  getGroupInnerBounds,
  inferLayout,
  makeGroupBoundsForWindows,
} from './layoutAlgo.js';
import { createLogger } from './logger.js';
import { patchWindow } from './canvasObjectTypes.js';
import {
  applyDock, undockWindow, pruneAfterRemoval, setSeam, showTab, reconcileTiles,
} from './layout/dock.js';

const log = createLogger('canvas-groups');

export const createGroupActions = (set, get) => ({
  spawnGroup: (pos, size) => {
    const id = crypto.randomUUID();
    const hue = Math.floor(Math.random() * 360);
    const inside = get().wins.filter((win) => {
      const centerX = win.x + win.w / 2;
      const centerY = win.y + win.h / 2;
      return centerX >= pos.x && centerX <= pos.x + size.w
        && centerY >= pos.y && centerY <= pos.y + size.h;
    });
    let rect = { x: pos.x, y: pos.y, w: size.w, h: size.h };
    let root = null;

    if (inside.length > 0) {
      root = inferLayout(inside);
      rect = makeGroupBoundsForWindows(inside) || rect;
      if (root) {
        rect = fitGroupToLayout(rect, root);
        const updates = cleanLayout(root, getGroupInnerBounds(rect));
        set((state) => ({
          wins: state.wins.map((win) => {
            if (!inside.some((member) => member.id === win.id)) return win;
            const update = updates.find((item) => item.id === win.id);
            return patchWindow(win, { ...(update?.patch || {}), groupId: id });
          }),
        }));
      }
    }
    set((state) => ({
      wins: root ? state.wins : state.wins.map((win) => (
        inside.some((member) => member.id === win.id) ? { ...win, groupId: id } : win
      )),
      canvasGroups: [...state.canvasGroups, { id, label: 'New Group', hue, root, ...rect }],
      selectedIds: [],
    }));
    return id;
  },

  onUpdateGroup: (id, patch) => {
    set((state) => ({
      canvasGroups: state.canvasGroups.map((group) => {
        if (group.id !== id) return group;
        if (('w' in patch || 'h' in patch) && (patch.w !== group.w || patch.h !== group.h)) {
          log.debug('group size change', { id, w: patch.w ?? group.w, h: patch.h ?? group.h });
        }
        return { ...group, ...patch };
      }),
    }));
  },

  resizeGroup: (id, { groupPatch, windowPatches = [], groupPatches = [] }) => {
    const windowUpdates = new Map(windowPatches.map((item) => [item.id, item.patch]));
    const groupUpdates = new Map(groupPatches.map((item) => [item.id, item.patch]));
    set((state) => ({
      wins: state.wins.map((win) => (
        windowUpdates.has(win.id) ? patchWindow(win, windowUpdates.get(win.id)) : win
      )),
      canvasGroups: state.canvasGroups.map((group) => {
        if (group.id === id) return { ...group, ...groupPatch };
        return groupUpdates.has(group.id) ? { ...group, ...groupUpdates.get(group.id) } : group;
      }),
    }));
  },

  // Full-screen focus on one group (F1..F9). Session-only: never persisted,
  // so a reload always lands on the normal canvas. Switching straight from
  // one focused group to another keeps the original view to return to.
  groupFocus: null,

  enterGroupFocus: (groupId, view) => {
    set((state) => ({
      groupFocus: {
        groupId,
        prevPan: state.groupFocus?.prevPan ?? state.pan,
        prevZoom: state.groupFocus?.prevZoom ?? state.zoom,
      },
      pan: view.pan,
      zoom: view.zoom,
    }));
  },

  exitGroupFocus: () => {
    const focus = get().groupFocus;
    if (!focus) return false;
    set({ groupFocus: null, pan: focus.prevPan, zoom: focus.prevZoom });
    return true;
  },

  onCloseGroup: (id) => {
    if (get().groupFocus?.groupId === id) get().exitGroupFocus();
    set((state) => ({
      canvasGroups: state.canvasGroups.filter((group) => group.id !== id)
        .map((group) => group.groupId === id ? { ...group, groupId: null } : group),
      wins: state.wins.map((win) => win.groupId === id ? { ...win, groupId: null } : win),
    }));
  },

  deleteWindows: (ids) => {
    const selected = new Set(ids);
    set((state) => {
      const removed = state.wins.filter((win) => selected.has(win.id));
      const wins = state.wins.filter((win) => !selected.has(win.id));
      const pruned = pruneAfterRemoval({ wins, canvasGroups: state.canvasGroups }, removed);
      return {
        wins: pruned?.wins || wins,
        ...(pruned ? { canvasGroups: pruned.canvasGroups } : {}),
        links: state.links.filter((link) => !selected.has(link.fromId) && !selected.has(link.toId)),
        activeId: selected.has(state.activeId) ? null : state.activeId,
        selectedIds: [],
      };
    });
  },

  // ── Tiled groups (spec 4) ──
  // Drop a window on a dock target (see layout/dock.js resolveDockTarget).
  dockWindow: (winId, target) => {
    const next = applyDock(get(), winId, target, {
      makeGroup: () => ({ id: crypto.randomUUID(), hue: Math.floor(Math.random() * 360), label: 'Group' }),
    });
    if (!next) return false;
    set({ ...next, activeId: winId });
    log.info('window docked', { winId, kind: target.kind, side: target.side || null, presetId: target.presetId || null });
    return true;
  },

  undockWindow: (winId) => {
    const next = undockWindow(get(), winId);
    if (!next) return false;
    set(next);
    return true;
  },

  setGroupSeam: (groupId, path, ratio) => {
    const next = setSeam(get(), groupId, path, ratio);
    if (next) set(next);
  },

  showGroupTab: (groupId, winId) => {
    const next = showTab(get(), groupId, winId);
    if (next) set({ ...next, activeId: winId });
  },

  reconcileGroupTiles: () => {
    const next = reconcileTiles(get());
    if (next) set(next);
    return !!next;
  },
});
