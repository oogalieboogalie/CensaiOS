// Censai the orchestrator: a project pin. Work that is looked at first and
// released after (a Kraken Request, server/kraken) is tied to one exact
// project at the look, so nothing that happens between the look and the
// release, or while its arms wait their turn, can move it somewhere else.
//
// A pin is { projectId, name, kind, source, branch, commit }:
//   projectId  the project's id, taken as it is (never read for meaning)
//   kind       'github' (the code is on GitHub) or 'folder' (a folder on this computer)
//   source     the full owner/repo, or the folder's path
//   branch     the branch it was on at the look, or null when not known
//   commit     the commit it was at, or null when not known
//
// The project is found the way Censai's chat finds one before a hand-off
// (planProject.js): the board's rule, then the owner rule; a fix keeps (or
// finds) the project kept on GitHub, where its pull request goes (resolvePin).
// checkPin then asks, each time before work goes out: is that id
// still the same code, may this person still use it here, and is the folder
// still on the branch they saw?

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { folderHead, folderRepos, repoKey } from './folderRepo.js';
import { planProject, reachableProject } from './planProject.js';
import { clip } from './shape.js';

const log = createLogger('censai-orchestrator');
const GITHUB_WAIT_MS = 4000;

/** A GitHub repo's main branch and the commit it is at, each null when GitHub did not say in time. */
async function repoHead(repo) {
  let timer;
  try {
    const { fetchGithub } = await import('../tools/helpers.js');
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('late'), { code: 'ETIMEDOUT' })), GITHUB_WAIT_MS); });
    const read = async () => {
      const branch = (await fetchGithub(`/repos/${repo}`))?.default_branch || null;
      const commit = branch ? (await fetchGithub(`/repos/${repo}/commits/${encodeURIComponent(branch)}`))?.sha || null : null;
      return { branch, commit };
    };
    return await Promise.race([read(), late]);
  } catch (error) {
    log.warn('branch of a GitHub project not read for its pin', { code: safeErrorCode(error) });
    return { branch: null, commit: null };
  } finally {
    clearTimeout(timer);
  }
}

const DEFAULTS = Object.freeze({ planProject, reachableProject, folderHead, repoHead });

const folderKey = (value) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const text = (value, max) => (typeof value === 'string' ? clip(value, max) : '') || null;

/** Where a project row's code is: { kind, source }. */
export function sourceOf(row) {
  return row?.repo ? { kind: 'github', source: String(row.repo) } : { kind: 'folder', source: String(row?.path || '') };
}

function sameSource(pin, row) {
  const now = sourceOf(row);
  if (now.kind !== pin.kind || !now.source) return false;
  return pin.kind === 'github'
    ? (repoKey(now.source) || now.source.toLowerCase()) === (repoKey(pin.source) || pin.source.toLowerCase())
    : folderKey(now.source) === folderKey(pin.source);
}

/** The pin for a project row as it is right now. */
export async function pinOf(row, deps = {}) {
  const all = { ...DEFAULTS, ...deps };
  const { kind, source } = sourceOf(row);
  const head = (kind === 'github' ? await all.repoHead(source) : await all.folderHead(source)) || {};
  return {
    projectId: String(row.id), name: clip(row.name || row.id, 120), kind, source: clip(source, 400),
    branch: text(head.branch, 200), commit: text(head.commit, 64),
  };
}

/**
 * Find the project once and pin it. project: an id or a name, or none for Censai's own
 * project on this board. tests: the work is a fix. A fix ends in a pull request on GitHub
 * (jobPr.js) and is never written into a folder on this computer, so it keeps a project kept
 * on GitHub as it is, and a folder here that is a checkout of a GitHub repo gives way to that
 * repo's GitHub project when this person can use it here. Null when there is no such project
 * for this person here.
 */
export async function resolvePin(db, scope, { project = null, tests = false } = {}, deps = {}) {
  const all = { ...DEFAULTS, ...deps };
  const where = { workspaceId: scope.workspaceId, userId: scope.userId };
  let row = await all.planProject(db, { ...where, project, testsHere: false, keepGithub: tests }, deps);
  if (tests && row?.id && !row.repo && row.path) {
    const [repo] = [...await (deps.folderRepos || folderRepos)(row.path, { keepCase: true })];
    const github = repo ? await all.planProject(db, { ...where, project: repo, testsHere: false, keepGithub: true }, deps) : null;
    if (github?.id && repoKey(github.repo) === repoKey(repo)) row = github;
  }
  return row?.id && sourceOf(row).source ? pinOf(row, deps) : null;
}

/** A pin the browser sent back, cut to size, or null when it is not one. It is checked with checkPin before use. */
export function readPin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const projectId = text(raw.projectId, 200);
  const source = text(raw.source, 400);
  if (!projectId || !source || !['github', 'folder'].includes(raw.kind)) return null;
  return { projectId, name: text(raw.name, 120) || projectId, kind: raw.kind, source, branch: text(raw.branch, 200), commit: text(raw.commit, 64) };
}

/** A pin in plain words: 'the folder D:\Repos\shop, on the branch "main"'. */
export function pinWords(pin) {
  const where = pin.kind === 'github' ? `${pin.source} on GitHub` : `the folder ${pin.source}`;
  return pin.branch ? `${where}, on the branch "${pin.branch}"` : where;
}

/**
 * Why work pinned to `pin` must not go out for this person right now, as { why, fix } in
 * plain words, or null while the pin still holds.
 */
export async function checkPin(db, scope, pin, deps = {}) {
  const all = { ...DEFAULTS, ...deps };
  const again = 'Stop this request, look at the report again, and release it from the project you mean.';
  // Whether the person may use it comes first, and a project that is gone reads the same as one
  // that is closed to them: a made-up pin must not tell anyone which projects are on this computer.
  const row = await all.reachableProject(db, { workspaceId: scope.workspaceId, userId: scope.userId, id: pin.projectId }, deps);
  if (!row) {
    return {
      why: `The project "${pin.name}" is no longer open to you on this board.`,
      fix: 'Open it on this board again (or ask the board\'s owner to). It is checked again each time you look.',
    };
  }
  if (!sameSource(pin, row)) {
    return { why: `The project "${pin.name}" no longer points at ${pinWords({ ...pin, branch: null })}: it was changed after you looked.`, fix: again };
  }
  if (pin.kind !== 'folder' || !pin.branch) return null;
  const now = (await all.folderHead(row.path))?.branch || null;
  if (now === pin.branch) return null;
  return {
    why: now
      ? `The folder of "${pin.name}" is on the branch "${now}" now. You looked at it on "${pin.branch}".`
      : `The folder of "${pin.name}" is no longer on the branch "${pin.branch}".`,
    fix: `Switch the folder back to "${pin.branch}" and it goes out the next time you look. Or stop this request and release it again.`,
  };
}
