import { isPointInRect } from './canvasMath.js';

// Multi-project board: every project-aware window carries its own project.
//
// The board default (top-left project menu, store `currentProject`) is only
// what a NEW window starts with. Once a window has a project it keeps it, so
// two file trees, two terminals or two chats can work in two different
// projects side by side. Switching the default never moves an open window.

/** Windows that keep their folder in a field of their own. */
export const PROJECT_FOLDER_FIELD = {
  files: 'dirPath',
  terminal: 'cwd',
  devServer: 'folder',
  agentConsole: 'folder',
};

/** Every window kind that works inside a project. */
export const PROJECT_AWARE_KINDS = new Set([
  ...Object.keys(PROJECT_FOLDER_FIELD),
  'chat',
  'githubConsole',
  'idea',
  'todos',
  'scheduler',
  'finderFiles',
]);

export function isProjectAware(win) {
  return Boolean(win && PROJECT_AWARE_KINDS.has(win.kind));
}

function pathKey(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function samePath(a, b) {
  return Boolean(a) && Boolean(b) && pathKey(a) === pathKey(b);
}

/** True when `child` is `root` or a folder inside it. */
export function pathInside(child, root) {
  const c = pathKey(child);
  const r = pathKey(root);
  return Boolean(c) && Boolean(r) && (c === r || c.startsWith(`${r}/`));
}

export function folderName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
}

/** The small project record a window stores (no server bookkeeping). */
export function slimProject(project) {
  if (!project?.path) return null;
  const slim = { type: 'local', name: project.name || folderName(project.path), path: project.path };
  if (project.projectId) slim.projectId = project.projectId;
  if (project.repo) slim.repo = project.repo;
  return slim;
}

/**
 * The project this window works in: its own project, else the folder it is
 * rooted at, else the board default.
 */
export function windowProject(win, boardDefault = null) {
  if (!win) return boardDefault || null;
  const field = PROJECT_FOLDER_FIELD[win.kind];
  const folder = field ? win[field] : '';
  if (win.project?.path && (!folder || pathInside(folder, win.project.path))) return win.project;
  if (folder) {
    const fromDefault = boardDefault?.path && pathInside(folder, boardDefault.path) ? boardDefault : null;
    return fromDefault || { type: 'local', name: folderName(folder), path: folder };
  }
  return boardDefault || null;
}

function insideGroup(win, group) {
  return isPointInRect(win.x + win.w / 2, win.y + win.h / 2, group.x, group.y, group.w, group.h);
}

/**
 * Full resolution for a window on the board. A project picked by hand wins.
 * A chat inside a canvas group then follows the group's file tree, so a
 * group of windows works in one folder. Otherwise: windowProject().
 */
export function resolveWindowProject(win, { wins = [], canvasGroups = [], boardDefault = null } = {}) {
  if (!win) return boardDefault || null;
  if (win.project?.chosen || win.kind !== 'chat') return windowProject(win, boardDefault);
  const agentId = win.agentId;
  for (const group of canvasGroups) {
    const inside = wins.filter((item) => insideGroup(item, group));
    const member = (group.attachedAgents || []).includes(agentId)
      || inside.some((item) => item.id === win.id)
      || inside.some((item) => item.kind === 'agent' && item.agentId === agentId);
    if (!member) continue;
    const filesWin = inside.find((item) => item.kind === 'files' && item.dirPath);
    if (filesWin) {
      return {
        type: 'local',
        name: folderName(filesWin.dirPath),
        path: filesWin.dirPath,
        scopeType: 'canvas_group',
        scopeId: group.id,
        scopeLabel: group.label || 'Canvas Group',
      };
    }
  }
  return windowProject(win, boardDefault);
}

/** True when the window already names its own project or folder. */
export function hasOwnProject(win) {
  if (!win) return false;
  const field = PROJECT_FOLDER_FIELD[win.kind];
  return Boolean(win.project?.path || (field && win[field]));
}

/** The patch that ties one window to a project. */
export function projectPatch(win, project) {
  const slim = slimProject(project);
  if (!slim) return {};
  // `chosen`: picked by hand from the window's project menu, so it beats
  // anything inferred (a chat inside a canvas group follows the group's
  // file tree until someone picks a project for it).
  const patch = { project: { ...slim, chosen: true } };
  const field = PROJECT_FOLDER_FIELD[win?.kind];
  if (field) patch[field] = slim.path;
  if (win?.kind === 'files') {
    patch.mode = 'local';
    patch.githubRepo = null;
  }
  if (win?.kind === 'terminal') patch.title = `Terminal · ${slim.name}`;
  return patch;
}

/**
 * Before the board default changes, tie every project-aware window that was
 * following it to that old default, so nothing on the board moves.
 */
export function pinWindowsToProject(wins, project) {
  const slim = slimProject(project);
  if (!slim || !Array.isArray(wins)) return wins;
  let changed = false;
  const next = wins.map((w) => {
    if (!isProjectAware(w) || hasOwnProject(w)) return w;
    changed = true;
    return { ...w, project: slim };
  });
  return changed ? next : wins;
}

/** Projects open on the board right now, with how many windows use each. */
export function boardProjects(wins, boardDefault = null) {
  const byKey = new Map();
  const add = (project, countIt) => {
    const slim = slimProject(project);
    if (!slim) return;
    const key = pathKey(slim.path);
    const entry = byKey.get(key) || { ...slim, windows: 0 };
    if (countIt) entry.windows += 1;
    byKey.set(key, entry);
  };
  if (boardDefault?.path) add(boardDefault, false);
  for (const w of wins || []) {
    if (isProjectAware(w)) add(windowProject(w, boardDefault), true);
  }
  return [...byKey.values()];
}

/**
 * The folder a hotkey terminal starts in: the project of the window you are
 * working in (its file tree, terminal or chat), else the board default.
 */
export function hotkeyFolder({ wins = [], canvasGroups = [], activeId = null, currentProject = null } = {}) {
  const active = wins.find((w) => w.id === activeId);
  if (active && isProjectAware(active)) {
    const project = resolveWindowProject(active, { wins, canvasGroups, boardDefault: currentProject });
    if (project?.path) return project.path;
  }
  return currentProject?.path || '';
}
