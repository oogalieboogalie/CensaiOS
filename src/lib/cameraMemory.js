// Per-person camera. Pan and zoom are never part of the shared canvas: each
// browser remembers its own view per workspace, so one person panning or
// zooming never moves anyone else.
const KEY = 'homebase.camera.v1';
const MAX_ENTRIES = 20;
let pending = null;

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export function loadCamera(workspaceId) {
  if (!workspaceId) return null;
  const cam = readAll()[workspaceId];
  if (!cam || ![cam.x, cam.y, cam.zoom].every(Number.isFinite) || cam.zoom <= 0) return null;
  return { x: cam.x, y: cam.y, zoom: cam.zoom };
}

export function saveCameraNow(workspaceId, cam) {
  if (!workspaceId || !cam || ![cam.x, cam.y, cam.zoom].every(Number.isFinite)) return;
  const all = readAll();
  delete all[workspaceId];
  all[workspaceId] = { x: cam.x, y: cam.y, zoom: cam.zoom, at: Date.now() };
  const ids = Object.keys(all);
  ids.slice(0, Math.max(0, ids.length - MAX_ENTRIES)).forEach((id) => delete all[id]);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ }
}

// Pan/zoom fires on every wheel tick; write at most a few times a second.
export function saveCamera(workspaceId, cam, delayMs = 250) {
  if (pending) clearTimeout(pending.timer);
  pending = { timer: setTimeout(() => { pending = null; saveCameraNow(workspaceId, cam); }, delayMs) };
}
