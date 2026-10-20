import { assertSystemAdmin, OWNER_ONLY_MESSAGE } from '../security/systemAdmin.js';
import { logOwnerRefusal, ownerNamesFor, ownerNamesSentence } from '../security/ownerNames.js';
import { deskError, resolveGithubToken } from './mergeDesk.js';

// The GitHub key saved on this computer (GITHUB_TOKEN in .env) belongs to the
// computer's owner. Anyone signed in may look with it, but merging, pushing,
// posting a review or starting a fix with it is the owner's call. A teammate
// with their own GitHub key in the window or in Settings uses that instead.

/** The token to change something on GitHub for this request, or a 403 naming the owner. */
export async function resolveGithubWriteToken(req, { feature = 'GitHub changes', loadUserKey, checkOwner = assertSystemAdmin } = {}) {
  const resolved = await resolveGithubToken(req?.session?.userId, { loadUserKey });
  if (resolved.source !== 'server') return resolved;
  try {
    await checkOwner(req);
    return resolved;
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : 403;
    logOwnerRefusal(feature, status);
    if (status === 401) throw deskError('Sign in first.', 401);
    const names = await ownerNamesFor(req?.session?.userId, { req }).catch(() => null);
    const sentence = ownerNamesSentence(names);
    throw deskError(`${OWNER_ONLY_MESSAGE}${sentence ? ` ${sentence}` : ''} Paste your own GitHub token in this window to use your account.`, 403);
  }
}

/** Express middleware: req.githubToken for the GitHub window's plain routes (own key first). */
export function githubToken({ write = '', loadUserKey } = {}) {
  return async (req, res, next) => {
    try {
      req.githubToken = write
        ? (await resolveGithubWriteToken(req, { feature: write, loadUserKey })).token
        : (await resolveGithubToken(req.session?.userId, { loadUserKey })).token;
      return next();
    } catch (err) {
      return res.status(err?.status || 500).json({ error: err?.message || 'GitHub request failed.' });
    }
  };
}
