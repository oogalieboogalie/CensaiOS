import {
  cleanLayout,
  fitGroupToLayout,
  getGroupInnerBounds,
  inferLayout,
  makeGroupBoundsForWindows,
} from './layoutAlgo.js';
import { createLogger } from './logger.js';

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
            return update ? { ...win, ...update.patch, groupId: id } : { ...win, groupId: id };
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
        windowUpdates.has(win.id) ? { ...win, ...windowUpdates.get(win.id) } : win
      )),
      canvasGroups: state.canvasGroups.map((group) => {
        if (group.id === id) return { ...group, ...groupPatch };
        return groupUpdates.has(group.id) ? { ...group, ...groupUpdates.get(group.id) } : group;
      }),
    }));
  },

  onCloseGroup: (id) => {
    set((state) => ({
      canvasGroups: state.canvasGroups.filter((group) => group.id !== id)
        .map((group) => group.groupId === id ? { ...group, groupId: null } : group),
      wins: state.wins.map((win) => win.groupId === id ? { ...win, groupId: null } : win),
    }));
  },

  deleteWindows: (ids) => {
    const selected = new Set(ids);
    set((state) => ({
      wins: state.wins.filter((win) => !selected.has(win.id)),
      links: state.links.filter((link) => !selected.has(link.fromId) && !selected.has(link.toId)),
      activeId: selected.has(state.activeId) ? null : state.activeId,
      selectedIds: [],
    }));
  },
});
