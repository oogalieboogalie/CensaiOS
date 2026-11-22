// ═══════════════════════════════════════════════════════════════════
//  CAN THIS WORK REACH THE REPO?
//  One check to run before starting work on a project kept on GitHub.
//  With the key the work will really use (credential.js), it reads the
//  repo at the chosen branch or commit, and says separately whether
//  that key can read, make a branch, and open a pull request. Each
//  answer is true, false or 'unknown': some keys do not say what they
//  may do until they try, and the check never guesses for them. When
//  something is missing or not known, `reason` says so in plain words.
// ═══════════════════════════════════════════════════════════════════

import { githubApiUrl } from './apiUrl.js';
import { CONNECT_GITHUB_MESSAGE, credentialWords, sendWithGithubKey } from './credential.js';
import { isRepoName } from '../github.js';

/** What a job can ask for in `needs`. */
export const GITHUB_ACCESS_NEEDS = Object.freeze(['read', 'branch', 'pull request']);

/** The answer for an ability GitHub does not tell in advance. */
export const UNKNOWN = 'unknown';

const UNKNOWN_WHY = 'this kind of key does not say what it may do until it tries.';

async function ask(pathname, token, { fetchImpl, accept = 'application/vnd.github+json' }) {
  try {
    const res = await fetchImpl(`${githubApiUrl()}${pathname}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'Homebase-Agent' },
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; /* quiet: an answer that is not JSON (a commit's id) is read as text */ }
    const header = (name) => res.headers?.get?.(name) ?? null;
    const message = typeof body?.message === 'string' ? body.message : '';
    return {
      status: res.status, ok: res.ok, body, text: text.trim(), scopes: header('x-oauth-scopes'),
      limited: header('x-ratelimit-remaining') === '0',
      // GitHub's "slow down": a 403 or 429 while there is quota left.
      slowDown: [403, 429].includes(res.status) && (header('retry-after') !== null || /secondary rate limit|abuse detection/i.test(message)),
      empty: res.status === 409 && /empty/i.test(message),
    };
  } catch {
    return { status: 0, ok: false, body: null, text: '', scopes: null, limited: false, slowDown: false, empty: false }; // quiet: shown to the caller as "could not reach GitHub"
  }
}

function whyNot(answer, { missing, withWords }) {
  if (answer.status === 0) return 'could not reach GitHub. Check the internet connection and try again.';
  if (answer.status === 401) return `GitHub did not accept ${withWords}. It may have expired: connect again in the GitHub window.`;
  if (answer.slowDown) return 'GitHub is asking this key to slow down: too many requests in a short time. Wait a minute and try again.';
  if (answer.limited || answer.status === 429) return 'GitHub is limiting requests right now. Try again in a few minutes.';
  if (answer.empty) return 'the repo has nothing in it yet.';
  if ([403, 404, 409, 422].includes(answer.status)) return missing;
  return `GitHub answered with an error (${answer.status}). Try again in a minute.`;
}

// A classic key lists what it may do in a header: without "repo" (or "public_repo" on a public
// repo) it cannot change anything. A fine-grained key sends no such list, so nobody can tell.
function keyMayWrite(scopes, isPrivate) {
  if (scopes === null || scopes === undefined) return UNKNOWN;
  const list = String(scopes).split(',').map((scope) => scope.trim()).filter(Boolean);
  return list.includes('repo') || (!isPrivate && list.includes('public_repo'));
}

const DOING = { read: 'read', branch: 'make a branch', 'pull request': 'open a pull request' };

/**
 * Check what the work can do in `repo` at `ref` (a branch or a commit; none
 * means the default branch) with the key it will really use.
 *
 *   const access = await checkGithubAccess({ repo: 'acme/shop', ref: 'main', userId, needs: ['read', 'branch', 'pull request'] });
 *   if (access.ok === false) stop(access.reason);
 *   if (access.ok === 'unknown') warn(access.reason); // it may still fail when it tries
 *
 * Answers { ok, reason, repo, ref, sha, defaultBranch, credential ('byok' | 'server' | null),
 * canRead, canBranch, canOpenPullRequest, missing: [...], unknown: [...] }.
 * `canBranch` and `canOpenPullRequest` are true, false or 'unknown'. `ok` is
 * false when anything in `needs` (default: read only) is known to be missing,
 * 'unknown' when nothing is known missing but something cannot be told up
 * front, and true only when everything asked for is known to be there.
 * A pull request needs a branch in the same repo, so it is never more than
 * `canBranch`. A word in `needs` that is not read, branch or pull request
 * throws. `computerKey` (default: what the running work was told, see
 * runAsGithubPerson) lets this computer's key stand in when the saved one
 * cannot see the repo. Makes two small reads and never changes anything.
 */
export async function checkGithubAccess({ repo, ref, userId, needs = ['read'], loadUserKey, computerKey, fetchImpl = globalThis.fetch } = {}) {
  const wanted = Array.isArray(needs) ? needs : [needs];
  const strange = wanted.filter((need) => !GITHUB_ACCESS_NEEDS.includes(need));
  if (strange.length) {
    throw new TypeError(`checkGithubAccess: unknown need ${strange.map((need) => JSON.stringify(need)).join(', ')}. Ask for "read", "branch" or "pull request".`);
  }
  const name = String(repo || '').trim();
  const result = {
    ok: false, reason: '', repo: name, ref: String(ref || '').trim() || null, sha: null, defaultBranch: null,
    credential: null, canRead: false, canBranch: false, canOpenPullRequest: false, missing: [...GITHUB_ACCESS_NEEDS], unknown: [],
  };
  if (!isRepoName(name)) return { ...result, reason: 'The repo must be written as owner/name.' };

  // The key the work itself would end up using: the saved one, or this computer's where that may stand in.
  let token = '';
  let sent;
  try {
    sent = await sendWithGithubKey((key) => {
      token = key;
      return ask(`/repos/${name}`, key, { fetchImpl });
    }, { userId, loadUserKey, ...(computerKey === undefined ? {} : { computerKey }) });
  } catch (err) {
    if (err?.code !== 'GITHUB_NOT_CONNECTED') throw err;
    return { ...result, reason: CONNECT_GITHUB_MESSAGE };
  }
  const info = sent.res;
  result.credential = sent.source;
  const withWords = credentialWords(sent.source);
  const cannot = (where, why) => `Cannot read ${where} with ${withWords}: ${why}`;

  if (!info.ok || !info.body) {
    return { ...result, reason: cannot(name, whyNot(info, { withWords, missing: 'not found or no access.' })) };
  }
  result.defaultBranch = info.body.default_branch || null;
  result.ref = result.ref || result.defaultBranch;

  // One cheap read at the chosen branch or commit: GitHub answers with just its id.
  const at = result.ref
    ? await ask(`/repos/${name}/commits/${encodeURIComponent(result.ref)}`, token, { fetchImpl, accept: 'application/vnd.github.sha' })
    : { ok: false, status: 409, empty: true };
  if (!at.ok) {
    const where = at.empty ? name : `${name} at branch or commit "${result.ref}"`;
    return { ...result, reason: cannot(where, whyNot(at, { withWords, missing: 'no such branch or commit, or no access.' })) };
  }
  result.sha = /^[0-9a-f]{7,64}$/i.test(at.text) ? at.text : null;

  const permissions = info.body.permissions || {};
  const archived = Boolean(info.body.archived);
  const keyWrites = keyMayWrite(info.scopes, Boolean(info.body.private));
  const prsOff = info.body.has_pull_requests === false;
  result.canRead = true;
  result.canBranch = !permissions.push || archived ? false : keyWrites;
  // The app opens a pull request from a branch in the same repo, so no branch means no pull request.
  result.canOpenPullRequest = result.canBranch === false || prsOff ? false : result.canBranch;
  const abilities = { read: true, branch: result.canBranch, 'pull request': result.canOpenPullRequest };
  result.missing = GITHUB_ACCESS_NEEDS.filter((need) => abilities[need] === false);
  result.unknown = GITHUB_ACCESS_NEEDS.filter((need) => abilities[need] === UNKNOWN);

  const lacking = wanted.filter((need) => result.missing.includes(need));
  const unsure = wanted.filter((need) => result.unknown.includes(need));
  result.ok = lacking.length ? false : unsure.length ? UNKNOWN : true;
  const list = (needsList) => needsList.map((need) => DOING[need]).join(' or ');
  if (lacking.length) {
    const has = ['read', ...(result.canBranch === true ? ['make a branch'] : [])];
    const why = archived
      ? 'the repo is archived, so nothing in it can change.'
      : !permissions.push
        ? 'this GitHub account has read access only. Ask the repo owner for write access, or connect a key that has it.'
        : keyWrites === false
          ? 'the key is read-only. Use a key that may write to the repo.'
          : 'pull requests are turned off for this repo.';
    result.reason = `In ${name}, ${withWords} can ${has.join(' and ')}, but cannot ${list(lacking)}: ${why}`;
  } else if (unsure.length) {
    result.reason = `In ${name}, ${withWords} can read. Whether it can ${list(unsure)} is not known yet: ${UNKNOWN_WHY}`;
  }
  return result;
}
