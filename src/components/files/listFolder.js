// Lists one folder (on this computer or in a GitHub repo). A folder that
// can't be listed throws the server's reason, so the tree says why ("GitHub
// is not connected", "Access denied") instead of showing an empty folder.
export async function listFolder(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Could not open this folder (${res.status})`);
  return data.children || [];
}

// Search answers in the same way: a refusal is shown as the reason, not as
// "No matches".
export async function searchFiles(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
  return data;
}
