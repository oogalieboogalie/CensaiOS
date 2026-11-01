// "Invite to this board" (server/invites/store.js).
//
// Signed in (boardInvitesRouter, behind the sign-in guard):
//   POST /api/workspaces/:workspaceId/invites   { email? } owner/admin of the board
//   GET  /api/invites/mine                      invites waiting for me
//   POST /api/invites/:id/open | /dismiss
// No account yet (boardInvitesPublicRouter, before the guard):
//   GET  /api/invites/preview?code=             which board, who asked
//   POST /api/invites/redeem    { code, name }  makes the account, signs in
//
// Join links (an invite for someone without an account) only exist on a copy
// that runs on its owner's own computer or home server (local_desktop): there
// the owner decides who joins. A private or cloud server signs people in with
// their own email, so the owner invites that email instead.

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { authSecurityRateLimiter } from '../middleware/standardRateLimits.js';
import { getAuthAccessPolicy } from '../security/authPolicy.js';
import { establishAuthenticatedSession } from '../security/authSession.js';
import {
  inviteToBoard, listMyInvites, markInvite, previewJoinCode, redeemJoinCode,
} from '../invites/store.js';

const log = createLogger('invites');
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

export const joinLinksAllowed = () => getAuthAccessPolicy().local;

function sendError(res, error, what) {
  const status = error.statusCode || 500;
  if (status >= 500) log.warn(`${what} failed`, { code: safeErrorCode(error) });
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Try again.' : error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}

function signedIn(req, res) {
  if (req.session?.userId) return true;
  res.status(401).json({ error: 'Sign in first.' });
  return false;
}

export const boardInvitesRouter = express.Router();

boardInvitesRouter.post('/workspaces/:workspaceId/invites', async (req, res) => {
  if (!signedIn(req, res)) return;
  const { workspaceId } = req.params;
  try {
    const result = await inviteToBoard(pool, {
      workspaceId, userId: req.session.userId, email: req.body?.email, allowJoinLinks: joinLinksAllowed(),
    });
    if (result.kind === 'account') {
      log.info('invite: sent to an account', { workspaceId, by: req.session.userId, to: result.member.id, notified: result.notified });
      return res.status(201).json({
        kind: 'account',
        member: { id: result.member.id, name: result.member.name, email: result.member.email },
        alreadyMember: result.alreadyMember,
        notified: result.notified,
      });
    }
    log.info('invite: join link made', { workspaceId, by: req.session.userId, expiresAt: result.expiresAt });
    // The raw code exists only in this answer; the server keeps a hash.
    res.status(201).json({ kind: 'link', code: result.code, expiresAt: result.expiresAt, workspace: result.workspace });
  } catch (error) {
    log.info('invite: refused', { workspaceId, by: req.session.userId, reason: safeErrorCode(error) || 'refused' });
    sendError(res, error, 'invite');
  }
});

boardInvitesRouter.get('/invites/mine', async (req, res) => {
  if (!signedIn(req, res)) return;
  try {
    res.json({ invites: await listMyInvites(pool, req.session.userId) });
  } catch (error) {
    sendError(res, error, 'listing invites');
  }
});

for (const [step, status] of [['open', 'opened'], ['dismiss', 'dismissed']]) {
  boardInvitesRouter.post(`/invites/:id/${step}`, async (req, res) => {
    if (!signedIn(req, res)) return;
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Unknown invite.' });
    try {
      const done = await markInvite(pool, { id: req.params.id, userId: req.session.userId, status });
      log.info(`invite: ${status}`, { id: req.params.id, userId: req.session.userId, found: Boolean(done) });
      res.json({ ok: true, workspaceId: done?.workspaceId || null });
    } catch (error) {
      sendError(res, error, `invite ${step}`);
    }
  });
}

export const boardInvitesPublicRouter = express.Router();

function ready(res) {
  if (dbReady()) return true;
  res.setHeader('Retry-After', '2');
  res.status(503).json({ error: 'censaiOS is still starting, please try again in a moment.' });
  return false;
}

boardInvitesPublicRouter.get('/preview', authSecurityRateLimiter, async (req, res) => {
  if (!ready(res)) return;
  try {
    const preview = joinLinksAllowed() ? await previewJoinCode(pool, req.query.code) : null;
    if (!preview) return res.status(410).json({ error: 'This invite was used already or has run out. Ask for a new one.' });
    res.json(preview);
  } catch (error) {
    sendError(res, error, 'invite preview');
  }
});

boardInvitesPublicRouter.post('/redeem', authSecurityRateLimiter, async (req, res) => {
  if (!ready(res)) return;
  if (!joinLinksAllowed()) {
    return res.status(403).json({ error: 'On this censaiOS people sign in with their own email. Ask the owner to invite that email.' });
  }
  try {
    const { user, workspaceId } = await redeemJoinCode(pool, { code: req.body?.code, name: req.body?.name });
    await establishAuthenticatedSession(req, user);
    log.info('invite: join link used', { workspaceId, userId: user.id });
    res.json({ ok: true, workspaceId, user: { id: user.id, name: user.name } });
  } catch (error) {
    if (error.code === 'INVITE_USED') log.info('invite: join link refused (used or run out)');
    sendError(res, error, 'joining with an invite');
  }
});
