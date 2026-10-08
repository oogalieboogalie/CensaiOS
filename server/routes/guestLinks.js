// server/routes/guestLinks.js
//
// The guest side of share links, mounted at /api/guest BEFORE the sign-in
// guard: open a link, join with a name, read the board, comment. A guest
// session never has a userId, so no other API route serves it.

import express from 'express';
import pool from '../db.js';
import { callModel, createModelAccessContext } from '../aiGateway/index.js';
import { usesProjection } from '../shareLinks/access.js';
import {
  createComment,
  listMentionableAgents,
  listVisibleComments,
  setResolved,
} from '../shareLinks/comments.js';
import { answerAgentMentions } from '../shareLinks/agentReplies.js';
import { resolveGuestSession } from '../shareLinks/guestSession.js';
import { readProjectedBoard } from '../shareLinks/projector.js';
import { findShareLinkByToken, linkIsActive, publicComment, recordShareLinkJoin } from '../shareLinks/store.js';
import {
  createGuestId,
  isShareTokenShape,
  normalizeGuestColor,
  normalizeGuestName,
  verifyPasscode,
} from '../shareLinks/tokens.js';
import { log, publishLinkState, sendError } from './shareLinkHttp.js';

export const guestRouter = express.Router();

// Failed joins (unknown token, wrong passcode) are the brute-force surface:
// tokens are unguessable but passcodes are short. Only failures count, so a
// classroom or stream audience behind one address can still all join.
const JOIN_WINDOW_MS = 60_000;
const JOIN_FAILURE_LIMIT = 10;
const joinFailures = new Map();

function recentFailures(key, now = Date.now()) {
  const list = (joinFailures.get(key) || []).filter((at) => now - at < JOIN_WINDOW_MS);
  if (list.length) joinFailures.set(key, list);
  else joinFailures.delete(key);
  return list;
}

export function joinBlocked(key, now = Date.now()) {
  return recentFailures(key, now).length >= JOIN_FAILURE_LIMIT;
}

export function recordJoinFailure(key, now = Date.now()) {
  if (joinFailures.size > 10_000) joinFailures.clear();
  joinFailures.set(key, [...recentFailures(key, now), now]);
}

export function __resetGuestJoinLimitForTests() {
  joinFailures.clear();
}

function linkPreview(link) {
  return {
    linkId: link.id,
    workspaceName: link.workspace_name,
    role: link.role,
    scopeKind: link.scope_kind,
    live: link.mode === 'live',
    needsPasscode: Boolean(link.has_passcode),
    expiresAt: link.expires_at,
  };
}

async function activeLinkForToken(token) {
  if (!isShareTokenShape(token)) return null;
  const link = await findShareLinkByToken(pool, token);
  return linkIsActive(link) ? link : null;
}

guestRouter.get('/links/:token', async (req, res) => {
  try {
    const attemptKey = String(req.ip || 'unknown');
    if (joinBlocked(attemptKey)) {
      return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.', code: 'GUEST_JOIN_RATE_LIMITED' });
    }
    const link = await activeLinkForToken(req.params.token);
    if (!link) {
      recordJoinFailure(attemptKey);
      return res.status(404).json({ error: 'This link was turned off, has expired, or never existed.', code: 'SHARE_LINK_INACTIVE' });
    }
    return res.json(linkPreview(link));
  } catch (error) {
    return sendError(res, error);
  }
});

guestRouter.post('/links/:token/join', async (req, res) => {
  try {
    const attemptKey = String(req.ip || 'unknown');
    if (joinBlocked(attemptKey)) {
      return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.', code: 'GUEST_JOIN_RATE_LIMITED' });
    }
    const link = await activeLinkForToken(req.params.token);
    if (!link) {
      recordJoinFailure(attemptKey);
      return res.status(404).json({ error: 'This link was turned off, has expired, or never existed.', code: 'SHARE_LINK_INACTIVE' });
    }
    const name = normalizeGuestName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Type the name people will see.', code: 'GUEST_NAME_REQUIRED' });
    if (!verifyPasscode(req.body?.passcode, link.passcode_hash)) {
      recordJoinFailure(attemptKey);
      return res.status(403).json({ error: 'That passcode is not right.', code: 'GUEST_PASSCODE_WRONG' });
    }
    const color = normalizeGuestColor(req.body?.color);
    const guestId = createGuestId();
    req.session.guest = {
      linkId: link.id, workspaceId: link.workspace_id, guestId, name, color, joinedAt: new Date().toISOString(),
    };
    await recordShareLinkJoin(pool, { linkId: link.id, guestId, name, color });
    publishLinkState(link.workspace_id);
    return req.session.save((error) => {
      if (error) return sendError(res, error);
      return res.status(201).json({
        guest: { id: guestId, name, color },
        workspace: { id: link.workspace_id, name: link.workspace_name },
        ...linkPreview(link),
        projected: usesProjection(link),
      });
    });
  } catch (error) {
    return sendError(res, error);
  }
});

async function guestAccess(req, res) {
  try {
    return await resolveGuestSession(pool, req.session);
  } catch (error) {
    sendError(res, error);
    return null;
  }
}

guestRouter.get('/session', async (req, res) => {
  if (!req.session?.guest) return res.json({ guest: null });
  try {
    const access = await resolveGuestSession(pool, req.session);
    return res.json({
      guest: { id: access.guest.guestId, name: access.guest.name, color: access.guest.color },
      workspace: { id: access.link.workspace_id, name: access.link.workspace_name },
      ...linkPreview(access.link),
      capabilities: access.capabilities,
      projected: usesProjection(access.link),
    });
  } catch (error) {
    return res.json({ guest: null, ended: error.statusCode === 410 });
  }
});

guestRouter.post('/leave', (req, res) => {
  if (req.session) delete req.session.guest;
  res.json({ ok: true });
});

guestRouter.get('/board', async (req, res) => {
  const access = await guestAccess(req, res);
  if (!access) return undefined;
  try {
    return res.json({ board: await readProjectedBoard(access.link.workspace_id, access.link) });
  } catch (error) {
    return sendError(res, error);
  }
});

guestRouter.get('/comments', async (req, res) => {
  const access = await guestAccess(req, res);
  if (!access) return undefined;
  if (!access.capabilities.canComment) return res.json({ comments: [], agents: [], canComment: false });
  try {
    const [comments, agents] = await Promise.all([
      listVisibleComments(pool, { workspaceId: access.link.workspace_id, link: access.link }),
      access.link.agent_budget_tokens > 0 ? listMentionableAgents(pool).catch(() => []) : [],
    ]);
    return res.json({ comments, agents, canComment: true });
  } catch (error) {
    return sendError(res, error);
  }
});

guestRouter.post('/comments', async (req, res) => {
  const access = await guestAccess(req, res);
  if (!access) return undefined;
  if (!access.capabilities.canComment) {
    return res.status(403).json({ error: 'This link can view but not comment.', code: 'GUEST_CANNOT_COMMENT' });
  }
  try {
    const workspaceId = access.link.workspace_id;
    const result = await createComment(pool, {
      workspaceId,
      link: access.link,
      author: { kind: 'guest', id: access.guest.guestId, name: access.guest.name, color: access.guest.color },
      input: req.body || {},
    });
    res.status(201).json({ comment: publicComment(result.row) });
    // A link with no agent budget never reaches the agents.
    const mentions = access.link.agent_budget_tokens > 0 ? result.mentions : [];
    answerAgentMentions(pool, {
      workspaceId, root: result.root, mentions, link: access.link,
      ownerUserId: access.link.created_by_user_id, callModel, createAccessContext: createModelAccessContext,
    }).catch((error) => log.warn('agent mention failed', { error: error.message }));
    return undefined;
  } catch (error) {
    return sendError(res, error);
  }
});

guestRouter.post('/comments/:commentId/resolve', async (req, res) => {
  const access = await guestAccess(req, res);
  if (!access) return undefined;
  if (!access.capabilities.canComment) {
    return res.status(403).json({ error: 'This link can view but not comment.', code: 'GUEST_CANNOT_COMMENT' });
  }
  try {
    const row = await setResolved(pool, {
      workspaceId: access.link.workspace_id, commentId: req.params.commentId,
      resolved: req.body?.resolved !== false, by: access.guest.name, link: access.link,
    });
    return res.json({ comment: publicComment(row) });
  } catch (error) {
    return sendError(res, error);
  }
});
