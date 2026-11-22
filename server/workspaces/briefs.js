import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateLocalBrief,
  generateGithubBrief,
} from '../projectBrief.js';
import {
  tryGetFile as ghTryGetFile,
  putFile as ghPutFile,
  getDefaultBranch as ghGetDefaultBranch,
  ensureBranch as ghEnsureBranch,
  isRepoName,
} from '../github.js';
import {
  getSharedWorkspaceDir,
  isGithubProject,
  mapProjectPathForRuntime,
} from './shared.js';
import { getRecentActivity } from './activity.js';

// A project kept on GitHub has its brief in the app's own folder, never in
// the repo: opening or refreshing a project only reads from GitHub. A folder
// project keeps its brief in the folder, at .team/PROJECT.md, as before.

/** The branch a brief is sent to when someone asks for it in the repo and names none. */
export const BRIEF_BRANCH = 'censai/project-brief';

// The app's state folder: the one place that is kept when a Docker install is
// rebuilt (it is a volume there). CENSAI_STATE_DIR moves it for tests and sandboxes.
const stateDir = () => (process.env.CENSAI_STATE_DIR
  ? path.resolve(process.env.CENSAI_STATE_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.homebase-state'));

function briefFileName(project) {
  const repo = String(project?.repo || '').toLowerCase();
  if (!isRepoName(repo)) throw new Error('This project has no GitHub repo in the form owner/name.');
  return `${repo.replace('/', '@')}.md`;
}

/** Where the app keeps the brief of a project kept on GitHub (one file per repo, in the state folder). */
export function storedBriefPath(project) {
  return path.join(stateDir(), 'project-briefs', briefFileName(project));
}

// Where the brief was kept for a short while before: a folder a Docker rebuild throws away.
const earlierBriefPath = (project) => path.join(getSharedWorkspaceDir(), 'project-briefs', briefFileName(project));

async function readStoredBrief(project) {
  for (const file of [storedBriefPath(project), earlierBriefPath(project)]) {
    try {
      return await fs.promises.readFile(file, 'utf8');
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }
  return null;
}

/**
 * Make sure the app has its copy of a GitHub project's brief, building it
 * (reads only) when it is missing: after a move, a wiped folder, or a project
 * opened before the app kept briefs. True when it was built just now.
 */
export async function ensureProjectBrief(project) {
  if (!isGithubProject(project)) return false;
  try {
    await fs.promises.access(storedBriefPath(project));
    return false;
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  await refreshProjectBrief(project);
  return true;
}

export async function refreshProjectBrief(project) {
  if (!project) return null;
  const activity = await getRecentActivity(project.id, 10);

  if (isGithubProject(project)) {
    // Read only: the tree and a few files come from GitHub, the brief stays here.
    const briefPath = storedBriefPath(project);
    const content = await generateGithubBrief({ project, activity, existing: await readStoredBrief(project) });
    await fs.promises.mkdir(path.dirname(briefPath), { recursive: true });
    await fs.promises.writeFile(briefPath, content, 'utf8');
    return briefPath;
  }

  // Local
  const briefPath = path.join(mapProjectPathForRuntime(project.path), '.team', 'PROJECT.md');
  const content = await generateLocalBrief({ project, activity });
  await fs.promises.mkdir(path.dirname(briefPath), { recursive: true });
  await fs.promises.writeFile(briefPath, content, 'utf8');
  return briefPath;
}

export async function readProjectBrief(project) {
  if (!project) return null;
  if (isGithubProject(project)) {
    // The app's copy first; a repo that already carries a brief is still read (never written).
    const stored = await readStoredBrief(project);
    return stored ?? ghTryGetFile(project.repo, '.team/PROJECT.md');
  }
  try {
    return await fs.promises.readFile(path.join(mapProjectPathForRuntime(project.path), '.team', 'PROJECT.md'), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Put the brief in the repo as .team/PROJECT.md. Only when someone asked for
 * exactly that, and always on a branch of its own: never the default branch.
 */
export async function publishProjectBriefToRepo(project, { branch = BRIEF_BRANCH, by = '' } = {}) {
  if (!isGithubProject(project)) throw new Error('Only a project kept on GitHub has a brief to send to its repo.');
  const target = String(branch || '').trim();
  if (!target) throw new Error('Name the branch the brief goes on.');
  const base = await ghGetDefaultBranch(project.repo);
  if (target === base) {
    throw new Error(`The brief is never written straight onto ${base}. Name another branch, and open a pull request from it.`);
  }
  await ensureProjectBrief(project);
  const content = await readStoredBrief(project);
  await ghEnsureBranch(project.repo, target, base);
  await ghPutFile(project.repo, '.team/PROJECT.md', content, `Add the project brief${by ? ` (by ${by})` : ''}`, target);
  return { branch: target, base, url: `https://github.com/${project.repo}/blob/${target}/.team/PROJECT.md` };
}
