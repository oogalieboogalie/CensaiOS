// One-time invite tokens (server/tokens/store.js).
//
// Signed in (tokensRouter, behind the sign-in guard):
//   POST /api/tokens/create  { scope, targetId?, expiresInHours? }
//        friend: anyone; board: owner/admin of that board;
//        workshop_seat: only this computer's owner
//   POST /api/tokens/redeem  { token }  claims it; it then never works again
//   GET  /api/tokens/mine               the tokens I made
// Public (tokensPublicRouter, before the guard, rate limited):
//   GET  /api/tokens/preview?token=     what it is for; never burns it
//
// Log lines carry the scope and the outcome only: never the token or a name.

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { authSecurityRateLimiter } from '../middleware/standardRateLimits.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import { createToken, listMine, previewToken, redeemToken, TOKEN_SCOPES } from '../tokens/store.js';

const log = createLogger('tokens');

const REDEEM_ERRORS = {
  claimed: [409, 'Token already claimed'],
  expired: [410, 'Token expired'],
  own: [400, 'This is your own token. Send it to someone else.'],
  not_found: [404, 'Token not found'],
};

function sendError(res, error, what) {
  const status = error.statusCode || 500;
  if (status >= 500) log.warn(`${what} failed`, { code: safeErrorCode(error) });
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Try again.' : error.message,
    ...(error.code && status < 500 ? { code: error.code } : {}),
  });
}

function signedIn(req, res) {
  if (req.session?.userId) return true;
  res.status(401).json({ error: 'Sign in first.' });
  return false;
}

export const tokensRouter = express.Router();

tokensRouter.post('/create', async (req, res) => {
  if (!signedIn(req, res)) return;
  const scope = TOKEN_SCOPES.includes(req.body?.scope) ? req.body.scope : 'unknown';
  try {
    if (scope === 'workshop_seat') await assertSystemAdmin(req);
    const made = await createToken(pool, {
      creatorId: req.session.userId,
      scope: req.body?.scope,
      targetId: req.body?.targetId,
      expiresInHours: req.body?.expiresInHours,
    });
    log.info('token: made', { scope, outcome: 'made' });
    // The plain token exists only in this answer; the server keeps a hash.
    res.status(201).json({ id: made.id, token: made.token, url: `/claim/${made.token}`, expiresAt: made.expiresAt });
  } catch (error) {
    log.info('token: not made', { scope, outcome: safeErrorCode(error) || `status_${error.statusCode || 500}` });
    sendError(res, error, 'making a token');
  }
});

tokensRouter.post('/redeem', async (req, res) => {
  if (!signedIn(req, res)) return;
  try {
    const result = await redeemToken(pool, { token: req.body?.token, userId: req.session.userId });
    if (result.error) {
      log.info('token: claim refused', { outcome: result.error });
      const [status, message] = REDEEM_ERRORS[result.error] || REDEEM_ERRORS.not_found;
      return res.status(status).json({ error: message, code: result.error });
    }
    log.info('token: claimed', { scope: result.scope, outcome: 'claimed' });
    res.json({ scope: result.scope, targetId: result.targetId });
  } catch (error) {
    sendError(res, error, 'claiming a token');
  }
});

tokensRouter.get('/mine', async (req, res) => {
  if (!signedIn(req, res)) return;
  try {
    res.json({ tokens: await listMine(pool, req.session.userId) });
  } catch (error) {
    sendError(res, error, 'listing tokens');
  }
});

export const tokensPublicRouter = express.Router();

tokensPublicRouter.get('/preview', authSecurityRateLimiter, async (req, res) => {
  if (!dbReady()) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'censaiOS is still starting, please try again in a moment.' });
  }
  try {
    const preview = await previewToken(pool, typeof req.query.token === 'string' ? req.query.token : '');
    if (!preview) return res.status(404).json({ error: 'Token not found' });
    res.json(preview);
  } catch (error) {
    sendError(res, error, 'token preview');
  }
});
