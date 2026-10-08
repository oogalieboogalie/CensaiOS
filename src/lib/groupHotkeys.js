import { MIN_ZOOM, MAX_ZOOM } from './canvasMath.js';

// AoE-style control groups for canvas groups.
//
// Slot keys are '1'..'9'. Ctrl/Alt+<n> assigns the active window's group (or
// groups the current selection) to slot <n>; F<n> opens that group in a
// full-screen focus view (everything else hidden); Escape or the same F-key
// leaves it and restores the previous view.
// Bindings persist per workspace in localStorage. Pure functions live here
// so they stay unit-testable; the key listener is useGroupHotkeys.js.

export const GROUP_HOTKEY_SLOTS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9']);

const STORAGE_KEY = 'homebase.group-hotkeys.v1';

function readStore() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(all) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full / private mode — bindings just won't persist.
  }
}

/** Load { slot: groupId } for a workspace. Always returns a fresh object. */
export function loadGroupHotkeys(workspaceId) {
  if (!workspaceId) return {};
  const scoped = readStore()?.[workspaceId];
  if (!scoped || typeof scoped !== 'object') return {};
  const clean = {};
  for (const slot of GROUP_HOTKEY_SLOTS) {
    if (typeof scoped[slot] === 'string') clean[slot] = scoped[slot];
  }
  return clean;
}

/** Persist { slot: groupId } for a workspace. */
export function saveGroupHotkeys(workspaceId, bindings) {
  if (!workspaceId) return;
  const all = readStore();
  const clean = {};
  for (const slot of GROUP_HOTKEY_SLOTS) {
    if (typeof bindings?.[slot] === 'string') clean[slot] = bindings[slot];
  }
  writeStore({ ...all, [workspaceId]: clean });
}

/**
 * Which group should Ctrl/Alt+<n> bind? The active window's group — the
 * thing you're looking at is the thing you want on a hotkey.
 * Returns the groupId or null when there is nothing to bind.
 */
export function resolveAssignTarget(wins = [], activeId) {
  if (!activeId) return null;
  const win = wins.find((w) => w.id === activeId);
  return win?.groupId || null;
}

/**
 * What Ctrl/Alt+<n> should do with the current selection:
 * - { groupId } when the active window is grouped, or every selected window
 *   shares one group;
 * - { createFrom: [wins] } when the selection holds loose windows, so the key
 *   both makes the group and binds it;
 * - null when there is nothing to bind.
 */
export function resolveAssignAction(wins = [], activeId, selectedIds = []) {
  const activeGroupId = resolveAssignTarget(wins, activeId);
  const selected = wins.filter((w) => selectedIds.includes(w.id) && !w.pinned);
  if (selected.length > 1) {
    const groupIds = new Set(selected.map((w) => w.groupId || null));
    if (groupIds.size === 1 && !groupIds.has(null)) return { groupId: [...groupIds][0] };
    return { createFrom: selected };
  }
  if (activeGroupId) return { groupId: activeGroupId };
  if (selected.length === 1 && !selected[0].groupId) return { createFrom: selected };
  return null;
}

// The group tab is drawn above the group rect, so the focus view leaves room
// for it at the top.
const FOCUS_TAB_ROOM = 40;
const FOCUS_PADDING = 16;

/**
 * Pan/zoom that makes a group fill the viewport. Unlike the overview fit this
 * zooms in past 100% when the screen is bigger than the group.
 */
export function computeGroupFocusView(group, viewport = {}) {
  const W = viewport.w ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const H = viewport.h ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const availW = Math.max(1, W - FOCUS_PADDING * 2);
  const availH = Math.max(1, H - FOCUS_PADDING * 2 - FOCUS_TAB_ROOM);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, availW / Math.max(1, group.w), availH / Math.max(1, group.h)));
  const cx = group.x + group.w / 2;
  const cy = group.y + group.h / 2;
  return {
    pan: { x: W / 2 - cx * zoom, y: (H + FOCUS_TAB_ROOM) / 2 - cy * zoom },
    zoom,
  };
}

/** Nested groups (and theirs) inside `groupId`, plus the group itself. */
export function focusedGroupIds(canvasGroups = [], groupId) {
  const ids = new Set(groupId ? [groupId] : []);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of canvasGroups) {
      if (g.groupId && ids.has(g.groupId) && !ids.has(g.id)) { ids.add(g.id); grew = true; }
    }
  }
  return ids;
}

/**
 * What the canvas shows while a group is focused: only that group, its
 * nested groups and their windows. Returns the inputs unchanged otherwise.
 */
export function filterForGroupFocus(wins = [], canvasGroups = [], groupFocus) {
  const group = groupFocus && canvasGroups.find((g) => g.id === groupFocus.groupId);
  if (!group) return { wins, canvasGroups };
  const ids = focusedGroupIds(canvasGroups, group.id);
  const groups = canvasGroups.filter((g) => ids.has(g.id));
  const memberIds = new Set();
  for (const g of groups) for (const w of groupMembers(wins, g)) memberIds.add(w.id);
  return {
    wins: wins.filter((w) => memberIds.has(w.id) || w.maximized),
    canvasGroups: groups,
  };
}

/** Resolve a slot to its live group object, or null (missing/cleared). */
export function groupForSlot(canvasGroups = [], bindings = {}, slot) {
  const id = bindings?.[String(slot)];
  if (!id) return null;
  return canvasGroups.find((g) => g.id === id) || null;
}

/** Drop bindings whose group no longer exists. Returns a new object. */
export function pruneBindings(bindings = {}, canvasGroups = []) {
  const live = new Set(canvasGroups.map((g) => g.id));
  const next = {};
  for (const slot of GROUP_HOTKEY_SLOTS) {
    if (typeof bindings[slot] === 'string' && live.has(bindings[slot])) next[slot] = bindings[slot];
  }
  return next;
}

/** Invert { slot: groupId } to { groupId: slot } for badge rendering. */
export function invertBindings(bindings = {}) {
  const inverted = {};
  for (const slot of GROUP_HOTKEY_SLOTS) {
    if (typeof bindings[slot] === 'string') inverted[bindings[slot]] = slot;
  }
  return inverted;
}

/** Windows that belong to a group: explicit members + center-inside. */
export function groupMembers(wins = [], group) {
  if (!group) return [];
  return wins.filter((w) => {
    if (w.groupId === group.id) return true;
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    return cx >= group.x && cx <= group.x + group.w && cy >= group.y && cy <= group.y + group.h;
  });
}
