// HTTP client for /api/step-cards (server/routes/stepCards.js).

async function post(path, body) {
  const res = await fetch(`/api/step-cards${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export const stepCardsApi = {
  translate: (text) => post('/translate', { text }),
  check: (body) => post('/check', body),
};

/** A .todo file's text, from this computer's project or from GitHub (the Files window's two kinds). */
export async function readTodoFile(win) {
  const url = win.isGithub
    ? `/api/github/file?repo=${encodeURIComponent(win.githubRepo || '')}&path=${encodeURIComponent(win.filePath)}`
    : `/api/files/content?path=${encodeURIComponent(win.filePath)}`;
  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Could not open that .todo file.');
  return String(data.content || '');
}
