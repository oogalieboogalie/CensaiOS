// Versions for a project folder (Files window) and "New project".
async function call(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const post = (url, body) => call(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const createNewProject = (name) => post('/api/project-git/new', { name });
export const projectVersionStatus = (path) => call(`/api/project-git/status?path=${encodeURIComponent(path)}`);
export const startProjectVersions = (path) => post('/api/project-git/start', { path });
export const saveProjectVersion = (path, message) => post('/api/project-git/save', { path, message });
export const sendProjectToGithub = (path, title, body) => post('/api/project-git/send', { path, title, body });
