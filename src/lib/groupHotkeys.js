// AoE-style control groups for canvas groups.
//
// Slot keys are '1'..'9'. Ctrl/Alt+<n> assigns the active window's group to
// slot <n>; F<n> focuses it (fits the viewport to the group bounds).
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
