// The class link and invite codes are permissions, so the server keeps only
// their hashes and hands the raw values back once. Like share links (spec
// 5), they are remembered in the browser that created the class, never in
// the board, where every member and edit guest could read them.
const KEY = 'homebase.classTokens.v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function readClassTokens(classId) {
  const entry = readAll()[classId];
  return entry ? { token: entry.token || null, codes: Array.isArray(entry.codes) ? entry.codes : [] } : { token: null, codes: [] };
}

export function saveClassTokens(classId, { token, codes = [] }) {
  const all = readAll();
  const current = all[classId] || {};
  all[classId] = { token: token || current.token || null, codes: [...(current.codes || []), ...codes].slice(-64) };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
}
