// The list of projects people pick from: the File menu's "Default for new
// windows" menu and the Scheduler's project menu (each sits next to a + that
// adds a folder). The server tidies GET /api/projects with this, and each
// menu tidies again so it never shows a project twice.
//
// Tidy means: each folder once, no helper copies (agent worktrees, the
// computer's temp folders, caches), the current project first, then the most
// recently used, and a name a person can read.

/** One spelling for a folder: forward slashes, no trailing slash, lower case. */
export function projectFolderKey(folder) {
  return String(folder || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

const repoKey = (repo) => String(repo || '').trim().toLowerCase();

// Folder names that only ever hold copies or throwaway work, never a project
// someone chose: agent worktrees (some-repo-worktrees/x, .cache/agent-worktrees/x,
// .claude/worktrees/x), an agent's scratchpad, caches and installed packages.
const HELPER_FOLDER = /^(\.?worktrees|.*-worktrees|\.cache|scratchpad|node_modules|\.git|\.homebase-state)$/;
// The computer's own temp folders. A folder someone named "temp" or
// "scratch" for their own work is left alone.
const SYSTEM_TEMP = /^(\/tmp|\/var\/tmp|\/private\/tmp|\/private\/var\/folders)(\/|$)|(^|\/)appdata\/local\/temp(\/|$)|^[a-z]:\/windows\/temp(\/|$)/;

/** True for a folder no one picks as a project: a helper's copy or a system temp folder. */
export function isHelperFolder(folder) {
  const key = projectFolderKey(folder);
  if (SYSTEM_TEMP.test(key)) return true;
  return key.split('/').filter(Boolean).some((part) => HELPER_FOLDER.test(part));
}

function lastFolder(folder) {
  return String(folder || '').replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean).at(-1) || '';
}

function parentFolder(folder) {
  const parts = String(folder || '').replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.length > 1 ? parts.at(-2).replace(/:$/, '') : '';
}

/** The name to show: the project's own name, or its folder's when the name is empty or a whole path. */
export function readableProjectName(project) {
  const name = String(project?.name || '').trim();
  if (name && !/[\\/]/.test(name)) return name;
  const folder = lastFolder(project?.path) || lastFolder(name);
  if (folder) return folder;
  const repo = String(project?.repo || '').trim();
  return repo ? repo.split('/').at(-1) : 'Unnamed project';
}

function stamp(project) {
  const t = Date.parse(project?.updatedAt || project?.updated_at || '');
  return Number.isFinite(t) ? t : 0;
}

// 2: the row the default names by id, 1: another row for the same folder, 0: neither.
function currentRank(project, current) {
  if (!project || !current) return 0;
  const currentId = current.projectId || current.id;
  if (currentId && project.id && project.id === currentId) return 2;
  return current.path && project.path && projectFolderKey(project.path) === projectFolderKey(current.path) ? 1 : 0;
}

/**
 * The projects to offer, tidied.
 *   projects     rows from GET /api/projects ({ id, name, path, repo, updatedAt })
 *   current      the board's default project ({ projectId, name, path }), or null
 *   localOnly    true drops GitHub-only rows (no folder to work in)
 *   keepFolders  folders someone opened on the board: listed even when they
 *                look like a helper's (a row the server sends with `opened`
 *                counts too)
 * Each row comes back once, with `label` (what to show) and `isCurrent`.
 * The current project is kept even when its folder looks like a helper's,
 * since someone chose it. A helper folder's row that also has a GitHub repo
 * stays as that repo, without the folder.
 */
export function tidyProjectList(projects, current = null, { localOnly = false, keepFolders = [] } = {}) {
  const keep = new Set((keepFolders || []).map(projectFolderKey).filter(Boolean));
  const kept = new Map();
  for (const raw of Array.isArray(projects) ? projects : []) {
    if (!raw || typeof raw !== 'object') continue;
    let project = raw;
    const rank = currentRank(project, current);
    if (project.path && !rank && !project.opened && !keep.has(projectFolderKey(project.path)) && isHelperFolder(project.path)) {
      if (!project.repo) continue;
      project = { ...project, path: null };
    }
    let key;
    if (project.path) {
      key = `folder:${projectFolderKey(project.path)}`;
    } else if (project.repo && !localOnly) {
      key = `repo:${repoKey(project.repo)}`;
    } else {
      continue;
    }
    const before = kept.get(key);
    // Keep the row the board's default names, else the most recently used.
    if (!before || rank > before.rank || (rank === before.rank && stamp(project) > stamp(before))) {
      kept.set(key, { ...project, rank });
    }
  }

  const list = [...kept.values()]
    .map(({ rank, ...p }) => ({ ...p, isCurrent: rank > 0 }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || stamp(b) - stamp(a));

  // Two folders with the same name say where each one is.
  const names = new Map();
  for (const p of list) {
    const name = readableProjectName(p).toLowerCase();
    names.set(name, (names.get(name) || 0) + 1);
  }
  return list.map((p) => {
    const name = readableProjectName(p);
    const where = p.path ? parentFolder(p.path) : '';
    const label = names.get(name.toLowerCase()) > 1 && where ? `${name} (in ${where})` : name;
    return { ...p, label };
  });
}
