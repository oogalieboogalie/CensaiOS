// Lists one folder (on this computer or in a GitHub repo). A folder that
// can't be listed throws the server's reason, so the tree says why ("GitHub
// is not connected", "Access denied") instead of showing an empty folder.
export async function listFolder(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Could not open this folder (${res.status})`);
  return data.children || [];
}

/**
 * Lists a folder the tree already shows, again, to catch what changed outside
 * censaiOS (useCatchUp.js). Asked at /api/files/relist, which the server's
 * request log keeps below info. Answers { children }; { status, problem }, the
 * server's words, when the folder is gone or may not be opened; { status } for
 * any other refusal; or null when censaiOS itself gave no answer: a proxy in
 * front of it, or nothing readable (it may be restarting).
 */
export async function relistFolder(folder) {
  let res;
  try {
    res = await fetch(`/api/files/relist?path=${encodeURIComponent(folder)}`);
  } catch {
    return null;
  }
  const data = await res.json().catch(() => null);
  if (res.ok) return Array.isArray(data?.children) ? { children: data.children } : null;
  if (!data || res.status >= 502) return null;
  if (res.status !== 404 && res.status !== 403) return { status: res.status };
  return { status: res.status, problem: data.error || `Could not open this folder (${res.status})` };
}

// Search answers in the same way: a refusal is shown as the reason, not as
// "No matches".
export async function searchFiles(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
  return data;
}
