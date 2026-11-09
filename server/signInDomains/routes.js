import express from 'express';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { getAuthAccessPolicy } from '../security/authPolicy.js';
import { OWNER_ONLY_MESSAGE, userRole } from '../security/systemAdmin.js';
import { addSignInDomain, listSignInDomains, removeSignInDomain } from './store.js';

const log = createLogger('sign-in-domains');

/** What the settings file says, so the panel can show the whole picture. */
function settingsFileRules() {
  const policy = getAuthAccessPolicy({ allowedDomains: [] });
  return {
    allowedUsers: [...policy.allowedUsers].sort(),
    adminEmails: [...policy.adminUsers].sort(),
    // Anyone who can reach this censaiOS may already make an account, so the list adds nothing yet.
    openToEveryone: policy.publicSignups || (policy.local && policy.allowedUsers.size === 0),
  };
}

/**
 * Who can sign up (Settings, Sharing). Only an admin of this censaiOS.
 *
 * GET    /api/sign-in-domains            the domains, plus the settings-file lists
 * POST   /api/sign-in-domains            { domain }
 * DELETE /api/sign-in-domains/:domain
 */
export function createSignInDomainsRouter({ db = null, ready = dbReady } = {}) {
  const router = express.Router();
  const pool = async () => db || (await import('../db.js')).default;

  router.use(async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    if (!db && !ready()) {
      res.setHeader('Retry-After', '3');
      return res.status(503).json({ error: 'censaiOS is still starting. Try again in a moment.' });
    }
    try {
      if (await userRole(req.session.userId, { db: await pool() }) !== 'admin') {
        return res.status(403).json({ error: OWNER_ONLY_MESSAGE, reason: 'owner-only' });
      }
    } catch (err) {
      log.error('role check failed', { code: safeErrorCode(err) });
      return res.status(500).json({ error: 'Could not check who you are. It is in the app log.' });
    }
    return next();
  });

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res, await pool());
    } catch (err) {
      if (!err.statusCode) log.error('request failed', { path: req.path, code: safeErrorCode(err) });
      res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Saving who can sign up hit a problem. It is in the app log.' });
    }
  };

  const answer = async (q) => ({ domains: await listSignInDomains(q), settingsFile: settingsFileRules() });

  router.get('/', handle(async (_req, res, q) => {
    res.json(await answer(q));
  }));

  router.post('/', handle(async (req, res, q) => {
    const domain = await addSignInDomain(q, req.body?.domain, req.session.userId);
    log.info('domain allowed', { domain, by: req.session.userId });
    res.status(201).json({ domain, ...(await answer(q)) });
  }));

  router.delete('/:domain', handle(async (req, res, q) => {
    const removed = await removeSignInDomain(q, req.params.domain);
    if (removed) log.info('domain removed', { domain: req.params.domain, by: req.session.userId });
    res.json({ removed, ...(await answer(q)) });
  }));

  return router;
}

export const signInDomainsRouter = createSignInDomainsRouter();
