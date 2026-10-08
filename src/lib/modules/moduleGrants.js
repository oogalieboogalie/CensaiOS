// What each person allowed a module to do. Grants are per person and per
// browser (a collaborator's "allow" never spends your model key), keyed by
// the module window, and only cover permissions the manifest declares.

const KEY = 'homebase.moduleGrants.v1';

// Used only when the browser refuses localStorage (private mode).
let fallback = {};

function readAll() {
  try { return JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch { return fallback; }
}

function writeAll(all) {
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { fallback = all; }
}

export function getModuleGrants(windowId) {
  return { ...(readAll()[windowId] || {}) };
}

/** decision: true (allow) or false (deny). */
export function setModuleGrant(windowId, permission, decision) {
  const all = readAll();
  all[windowId] = { ...(all[windowId] || {}), [permission]: Boolean(decision) };
  writeAll(all);
  return { ...all[windowId] };
}

/** Permissions the manifest asks for that this person hasn't answered yet. */
export function pendingPermissions(manifest, grants) {
  const asked = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  return asked.filter(p => grants[p] === undefined);
}
