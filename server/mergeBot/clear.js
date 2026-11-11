// A clear is one signed line. Who posts it does not matter.
//   gatekeeper-clear: <40-character commit> pr=<number> sig=<base64>
// Once a commit is revoked, a later clear cannot bring it back.
import {
  GITHUB_ACTIONS_APP_ID,
  clearMessage,
  publicKeyFrom,
  revokeMessage,
  signatureMatches,
} from './signature.js';

export const CI_CHECK_NAME = 'ci (22.x)';
export { GITHUB_ACTIONS_APP_ID };

const CLEAR_LINE = /^gatekeeper-clear:\s*([0-9a-f]{40})\s+pr=(\d+)\s+sig=([A-Za-z0-9+/]+=*)\s*$/i;
const REVOKE_LINE = /^gatekeeper-revoke:\s*([0-9a-f]{40})\s+pr=(\d+)\s+sig=([A-Za-z0-9+/]+=*)\s*$/i;
const NEEDS_CHANGES = /\bneeds[-_\s]*changes\b/i;
const NOT_CLEARED = /\bnot[-_\s]+cleared\b/i;

function linesOf(body) {
  return String(body || '').replace(/\u00a0/g, ' ').split(/\r?\n/);
}

function signedLine(line, pattern) {
  const match = String(line || '').trim().match(pattern);
  if (!match) return null;
  return { sha: match[1].toLowerCase(), pr: Number(match[2]), sig: match[3] };
}

function knownCommits(head, commits) {
  const known = new Set();
  const add = (value) => {
    const sha = String(value || '').trim().toLowerCase();
    if (/^[0-9a-f]{40}$/.test(sha)) known.add(sha);
  };
  add(head);
  for (const item of commits || []) add(item.sha || item);
  return known;
}

function namedShas(body, head, commits) {
  const found = new Set();
  const text = String(body || '').replace(/\u00a0/g, ' ');
  const needs = NEEDS_CHANGES.test(text);
  const notCleared = NOT_CLEARED.test(text);
  if (!needs && !notCleared) return found;
  const known = knownCommits(head, commits);
  let named = false;
  for (const match of text.matchAll(/\b([0-9a-f]{7,40})\b/gi)) {
    const token = match[1].toLowerCase();
    for (const sha of known) {
      if (sha.startsWith(token)) {
        named = true;
        found.add(sha);
      }
    }
  }
  if (!named) found.add(head);
  return found;
}

function reviewCommit(comment, head) {
  const commit = String(comment?.commitId || '').trim().toLowerCase();
  if (/^[0-9a-f]{40}$/.test(commit)) return commit;
  if (/^[0-9a-f]{7,39}$/.test(commit) && head.startsWith(commit)) return head;
  if (!commit) return head;
  return '';
}

function hits(token, head) {
  const sha = String(token || '').toLowerCase();
  return sha === head || (sha.length >= 7 && sha.length <= 40 && head.startsWith(sha));
}

// clear is { sha } or null. remember is every full commit that must stay revoked.
export function reviewClear(comments, { publicKey, repo, number, sha, revoked = [], commits = [] } = {}) {
  const key = publicKeyFrom(publicKey);
  const wantRepo = String(repo || '').trim();
  const wantPr = Number(number);
  const wantSha = String(sha || '').trim().toLowerCase();
  const empty = { clear: null, remember: [] };
  if (!wantRepo || !Number.isInteger(wantPr) || wantPr <= 0 || !/^[0-9a-f]{40}$/.test(wantSha)) {
    return empty;
  }

  const blocked = new Set((revoked || []).map((item) => String(item || '').toLowerCase()).filter((item) => hits(item, wantSha) || /^[0-9a-f]{40}$/.test(item)));
  const events = [];
  for (const comment of comments || []) {
    const at = String(comment?.updatedAt || comment?.createdAt || '');
    const body = String(comment?.body || '');
    const state = String(comment?.state || '').toUpperCase();
    if (state === 'CHANGES_REQUESTED') {
      const commit = reviewCommit(comment, wantSha);
      if (commit) events.push({ at, kind: 'revoke', sha: commit });
    }
    for (const line of linesOf(body)) {
      const clear = signedLine(line, CLEAR_LINE);
      if (clear && clear.pr === wantPr && signatureMatches(key, clearMessage(wantRepo, clear.pr, clear.sha), clear.sig)) {
        events.push({ at, kind: 'clear', sha: clear.sha });
      }
      const revoke = signedLine(line, REVOKE_LINE);
      if (revoke && revoke.pr === wantPr && signatureMatches(key, revokeMessage(wantRepo, revoke.pr, revoke.sha), revoke.sig)) {
        events.push({ at, kind: 'revoke', sha: revoke.sha });
      }
    }
    for (const found of namedShas(body, wantSha, commits)) events.push({ at, kind: 'revoke', sha: found });
  }

  const open = new Set();
  for (const event of events) {
    if (event.kind === 'revoke') blocked.add(event.sha);
    else if (!blocked.has(event.sha) && ![...blocked].some((item) => hits(item, event.sha))) open.add(event.sha);
  }
  if ([...blocked].some((item) => hits(item, wantSha))) blocked.add(wantSha);
  const remember = [...blocked].filter((item) => /^[0-9a-f]{40}$/.test(item));
  const clear = blocked.has(wantSha) || !open.has(wantSha) ? null : { sha: wantSha };
  return { clear, remember };
}

export function activeClear(comments, options) {
  return reviewClear(comments, options).clear;
}

// The latest completed Actions run of this check on this commit.
// A run that has not finished, including a queued rerun, means it is not green.
export function matchingCi(checks, { name = CI_CHECK_NAME, sha, appId = GITHUB_ACTIONS_APP_ID } = {}) {
  const want = String(sha || '').trim().toLowerCase();
  if (!want) return null;
  const rows = (checks || []).filter((check) => check
    && check.name === name
    && String(check.sha || '').trim().toLowerCase() === want
    && Number(check.appId) === Number(appId));
  if (!rows.length) return null;
  const openRun = rows.find((check) => check.status !== 'completed');
  if (openRun) return { sha: want, conclusion: '', status: openRun.status || 'queued' };
  rows.sort((a, b) => String(a.completedAt || '').localeCompare(String(b.completedAt || '')));
  const last = rows[rows.length - 1];
  return { sha: want, conclusion: last.conclusion || '', status: last.status || '' };
}
