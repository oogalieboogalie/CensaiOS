// ═══════════════════════════════════════════════════════════════════
//  THE ONE GITHUB CREDENTIAL
//  Every GitHub call made for a person (the GitHub window, an agent's
//  file tools, opening a project, the access check) asks here which
//  key to send, in one order:
//    1. the key that person saved in the app (the GitHub window's
//       connect step, or Settings),
//    2. this computer's GITHUB_TOKEN, as a fallback.
//  A saved key is only ever sent for the person who saved it. The app
//  keeps one GitHub key per person, none per repo, so there is no
//  repo-scoped step in the order.
// ═══════════════════════════════════════════════════════════════════

import { AsyncLocalStorage } from 'node:async_hooks';
import { getSecret } from '../secrets.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('github-credential');
const personForRun = new AsyncLocalStorage();

/** What a person reads when no GitHub key can be used for them. */
export const CONNECT_GITHUB_MESSAGE = 'GitHub is not connected. Open the GitHub window and paste a GitHub token in its connect step. '
  + 'On your own computer, a GITHUB_TOKEN line in the .env file works too.';

/**
 * Run `fn` as work done for one person: every GitHub call inside it that
 * names nobody uses that person's saved key first. One tool call or one
 * request at a time, never the whole server.
 *
 * `computerKey: true` says this work was already allowed to use this
 * computer's key (the board's and the owner's rules ran before `fn`), so a
 * call the person's own key cannot make is tried once more with it
 * (sendWithGithubKey). Left out, the computer's key never stands in.
 */
export function runAsGithubPerson({ userId, computerKey = false } = {}, fn) {
  return personForRun.run({ userId: userId ?? null, computerKey: computerKey === true }, fn);
}

/** Whether the work running right now may fall back to this computer's key. */
export function computerKeyAllowed() {
  return personForRun.getStore()?.computerKey === true;
}

/** The person the GitHub calls running right now are made for, or null. */
export function githubPerson() {
  return personForRun.getStore()?.userId ?? null;
}

async function savedGithubKey(userId) {
  const { getUserApiKeyConfig } = await import('../security/userApiKeys.js');
  return getUserApiKeyConfig(userId, 'github');
}

/**
 * The GitHub key for one person: their own saved key ('byok') first, then
 * GITHUB_TOKEN ('server'). `{ token: '', source: null }` when there is neither.
 */
export async function resolveGithubToken(userId, { loadUserKey } = {}) {
  try {
    const userKey = userId ? await (loadUserKey || savedGithubKey)(userId) : null;
    if (userKey?.apiKey) return { token: userKey.apiKey, source: 'byok' };
  } catch (err) {
    // The saved keys could not be read: go on to this computer's key.
    log.warn('saved github key could not be read', { code: safeErrorCode(err) });
  }
  const serverToken = getSecret('GITHUB_TOKEN');
  if (serverToken) return { token: serverToken, source: 'server' };
  return { token: '', source: null };
}

/** The same, for the person the current tool call or request is made for. */
export function resolveGithubCredential({ userId = githubPerson(), loadUserKey } = {}) {
  return resolveGithubToken(userId, { loadUserKey });
}

/** A key to send, or an error whose words name the connect step. */
export async function requireGithubCredential(options = {}) {
  const credential = await resolveGithubCredential(options);
  if (credential.token) return credential;
  throw Object.assign(new Error(CONNECT_GITHUB_MESSAGE), { code: 'GITHUB_NOT_CONNECTED', status: 401 });
}

// GitHub's answers when a key may not do something: not accepted, not allowed, or "not there" for a private repo.
const KEY_CANNOT = new Set([401, 403, 404]);

/**
 * Make one GitHub call with the right key. `send(token)` makes the call and
 * answers with what fetch gave back. The person's saved key goes first. When
 * GitHub answers that key with 401, 403 or 404, and this work may use this
 * computer's key (`computerKey`, by default what runAsGithubPerson was told),
 * the call is made once more with GITHUB_TOKEN: what worked before a person
 * saved a narrower key of their own still works. It is never tried with
 * another person's saved key. Answers { res, source } for the call that counted.
 */
export async function sendWithGithubKey(send, { userId, loadUserKey, computerKey = computerKeyAllowed() } = {}) {
  const first = await requireGithubCredential({ userId, loadUserKey });
  const res = await send(first.token);
  if (first.source !== 'byok' || !computerKey || !KEY_CANNOT.has(res?.status)) return { res, source: first.source };
  const serverToken = getSecret('GITHUB_TOKEN');
  if (!serverToken || serverToken === first.token) return { res, source: first.source };
  return { res: await send(serverToken), source: 'server' };
}

/** Plain words for which key was used. */
export function credentialWords(source) {
  if (source === 'byok') return 'the saved GitHub sign-in';
  if (source === 'server') return "this computer's GitHub key (GITHUB_TOKEN)";
  return 'no GitHub key';
}
