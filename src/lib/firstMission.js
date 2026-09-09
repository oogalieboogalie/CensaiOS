export const FIRST_MISSION_VERSION = 1;
export const FIRST_MISSION_DRAG_EVENT = 'censai:first-mission-window-drag';

export function firstMissionStorageKey(workspaceId) {
  return `censai.firstMission.v${FIRST_MISSION_VERSION}:${workspaceId || 'unknown'}`;
}

export function readFirstMission(workspaceId, storage = globalThis.localStorage) {
  if (!workspaceId || !storage) return null;
  try {
    const value = JSON.parse(storage.getItem(firstMissionStorageKey(workspaceId)) || 'null');
    return ['completed', 'dismissed'].includes(value?.state) ? value : null;
  } catch {
    return null;
  }
}

export function writeFirstMission(workspaceId, state, storage = globalThis.localStorage) {
  if (!workspaceId || !storage) return;
  storage.setItem(firstMissionStorageKey(workspaceId), JSON.stringify({
    state,
    version: FIRST_MISSION_VERSION,
    updatedAt: new Date().toISOString(),
  }));
}

export function clearFirstMission(workspaceId, storage = globalThis.localStorage) {
  if (!workspaceId || !storage) return;
  storage.removeItem(firstMissionStorageKey(workspaceId));
}

export function findAddedWindow(wins, baselineIds) {
  return (wins || []).find((win) => !baselineIds.has(win.id)) || null;
}

function rectFor(win) {
  return {
    left: Number(win?.x) || 0,
    top: Number(win?.y) || 0,
    right: (Number(win?.x) || 0) + (Number(win?.w ?? win?.width) || 0),
    bottom: (Number(win?.y) || 0) + (Number(win?.h ?? win?.height) || 0),
  };
}

export function areWindowsAdjacent(first, second, maxGap = 96) {
  if (!first || !second || first.id === second.id) return false;
  const a = rectFor(first);
  const b = rectFor(second);
  const horizontalGap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const verticalGap = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  const verticalOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const horizontalOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  return (horizontalGap <= maxGap && verticalOverlap > 24)
    || (verticalGap <= maxGap && horizontalOverlap > 24);
}

export function todoIds(wins) {
  return new Set((wins || [])
    .filter((win) => win.kind === 'todos')
    .flatMap((win) => (win.items || []).map((item) => `${win.id}:${item.id}`)));
}

export function hasNewTodo(wins, baselineIds) {
  return [...todoIds(wins)].some((id) => !baselineIds.has(id));
}
