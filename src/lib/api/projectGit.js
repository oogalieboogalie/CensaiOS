// Versions for a project folder (Files window) and "New project".
async function call(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  // A refused send names the files that hold keys (keptOut; githubHas, those GitHub's versions hold; onMain, those its main branch holds) and counts the versions.
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { keptOut: data?.keptOut, githubHas: data?.githubHas, onMain: data?.onMain, versions: data?.versions });
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
export const makeProjectVersionsAgain = (path) => post('/api/project-git/make-again', { path });
export const markProjectNewKeys = (path, names) => post('/api/project-git/new-keys', { path, names });
