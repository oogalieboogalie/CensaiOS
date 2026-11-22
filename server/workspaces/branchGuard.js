// The one rule for changing a project kept on GitHub: work goes on a branch of
// its own, made and read back before the first change, and never on the
// project's main branch. Every tool that writes to GitHub asks here first, so
// "no branch" can never come to mean "the main branch".

import { branchExists, createBranch, getDefaultBranch } from '../github.js';

// Never written to directly, whatever the repo calls its main branch.
const PROTECTED = new Set(['master', 'main', 'trunk', 'develop', 'production', 'release', 'head']);
// A name GitHub takes and that is safe to put in a link as it is: letters,
// digits, "_", "-" and "." in parts split by single slashes. No part is "." or
// "..", starts or ends with a dot, or ends in ".lock"; and the name does not
// start with "refs/" or "heads/", which would point at another ref.
const PART = /^[A-Za-z0-9_-][\w.-]*$/;
function takenName(branch) {
  const parts = branch.split('/');
  if (branch.length > 200 || /^(?:refs|heads)$/i.test(parts[0])) return false;
  return parts.every((part) => PART.test(part) && !part.includes('..') && !/(?:\.|\.lock)$/i.test(part));
}

/** Thrown with plain words when there is no branch a worker may write on. */
export class BranchBlocked extends Error {
  constructor(message, options) {
    super(message, options);
    this.code = 'JOB_BRANCH_BLOCKED';
  }
}

export function branchName(value) {
  return String(value ?? '').trim().replace(/^refs\/heads\//i, '');
}

/**
 * The parts of a file's path inside a repo, or null when it is not a plain
 * path there: empty, starting with a slash, holding a backslash, "?" or "#",
 * or a part that is empty, "." or "..". Such a path could point a GitHub call
 * at another repo or at something that is not a file.
 */
export function repoPathParts(value) {
  const text = String(value ?? '');
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused here
  if (!text || text.startsWith('/') || /[\\?#\u0000-\u001f]/.test(text)) return null;
  const parts = text.split('/');
  return parts.some((part) => !part || part === '.' || part === '..') ? null : parts;
}

export const BAD_PATH = 'That is not a plain path to a file inside the project (no "..", no leading slash, no backslash).';

const OWN_BRANCH = 'Changes go on a branch of their own and reach the main branch through a pull request.';

async function check(repo, value) {
  const branch = branchName(value);
  if (!branch) {
    return { refusal: 'There is no branch for this work, and a change to a project on GitHub never goes in without one.' };
  }
  if (!takenName(branch)) return { refusal: 'That is not a branch name that can be used here. Use letters, digits, "-", "_", "." and single slashes, like "fix/readme-typo".' };
  if (PROTECTED.has(branch.toLowerCase())) return { refusal: `"${branch}" is a main branch. ${OWN_BRANCH}` };
  let main;
  try {
    main = branchName(await getDefaultBranch(repo));
  } catch (error) {
    return { refusal: `GitHub did not say which branch is the project's main one (${status(error)}), so no change was let through.` };
  }
  if (!main) return { refusal: 'GitHub did not say which branch is the project\'s main one, so no change was let through.' };
  if (main.toLowerCase() === branch.toLowerCase()) return { refusal: `"${branch}" is the project's main branch. ${OWN_BRANCH}` };
  return { branch, main };
}

function status(error) {
  const code = /GitHub (\d{3})/.exec(error?.message || '')?.[1];
  return code ? `it answered ${code}` : 'it could not be reached';
}

function whyNotMade(error) {
  const code = Number(/GitHub (\d{3})/.exec(error?.message || '')?.[1]) || 0;
  if (code === 401 || code === 403) return `GitHub would not let this computer's key make a branch in that repo (it answered ${code}).`;
  if (code === 404) return 'GitHub could not find that repo with this computer\'s key (it answered 404).';
  if (code === 422) return 'GitHub would not take the branch name, or it is already taken (it answered 422).';
  if (code) return `GitHub answered ${code} when asked to make the branch.`;
  return 'GitHub could not be reached to make the branch.';
}

/**
 * Why `branch` may not be written to in `repo`, in plain words, or null when
 * it may: it has a name, and it is not the repo's main branch or a protected one.
 */
export async function writeBranchRefusal(repo, branch) {
  return (await check(repo, branch)).refusal || null;
}

/**
 * Make `branch` in `repo` if it is not there, then read it back. Returns the
 * branch name only once GitHub shows it; throws BranchBlocked with the plain
 * reason otherwise (refused, name taken, GitHub down, or a main branch).
 */
export async function makeVerifiedBranch(repo, value) {
  const { refusal, branch, main } = await check(repo, value);
  if (refusal) throw new BranchBlocked(refusal);
  if (await branchExists(repo, branch)) return branch;
  try {
    await createBranch(repo, branch, main);
  } catch (error) {
    // Two calls at once can both try to make it: the one that lost still has its branch.
    if (await branchExists(repo, branch)) return branch;
    throw new BranchBlocked(`No branch could be made for this work. ${whyNotMade(error)}`, { cause: error });
  }
  if (!(await branchExists(repo, branch))) {
    throw new BranchBlocked('No branch could be made for this work. GitHub took the request, but the branch is not there when read back.');
  }
  return branch;
}
