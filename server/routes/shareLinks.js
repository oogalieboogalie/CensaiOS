// server/routes/shareLinks.js
//
// Guest links (spec 5), owner side, behind the normal sign-in guard:
// create, list and revoke links, audit joins, Go live, mark windows public.
// Members' comment pins register on the same router (shareLinkComments.js);
// the guest side is guestLinks.js, mounted before the guard.

import express from 'express';
import pool from '../db.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { WORKSPACE_STATE_KEY, getWorkspaceState } from '../state/clientStateStore.js';
import { countWorkspaceSpectators } from '../collaboration/workspaceHub.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import * as Y from 'yjs';
import { CommentError } from '../shareLinks/comments.js';
import { countGuestSockets, disconnectShareLink } from '../shareLinks/liveGuests.js';
import { configureProjector, refreshProjection, updateProjectionLink } from '../shareLinks/projector.js';
import {
  ShareLinkError,
  createShareLink,
  listShareLinkJoins,
  listShareLinks,
  publicShareLink,
  revokeLiveLinks,
  revokeShareLink,
  setLinkStage,
} from '../shareLinks/store.js';
import { registerMemberCommentRoutes } from './shareLinkComments.js';
import { ID_PATTERN, MANAGE_ROLES, publishLinkState, requireUser, sendError } from './shareLinkHttp.js';

// Fallback board source when the live Yjs server isn't running (tests,
// scripts): the last saved snapshot.
configureProjector({
  fallback: async (workspaceId) => {
    const state = await getWorkspaceState({ db: pool, workspaceId, key: WORKSPACE_STATE_KEY });
    if (!state?.found || !state.value) return null;
    return {
      wins: state.value.wins || [],
      canvasGroups: state.value.canvasGroups || [],
      paths: state.value.paths || [],
      links: state.value.links || [],
    };
  },
});

// ─── owner side ────────────────────────────────────────────────────────

export const shareLinksRouter = express.Router();

shareLinksRouter.get('/workspaces/:workspaceId/share-links', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    const links = await listShareLinks(pool, { workspaceId: workspace.id });
    res.json({
      links: links.map((row) => ({ ...publicShareLink(row), connected: countGuestSockets(row.id) })),
      spectators: countWorkspaceSpectators(workspace.id),
    });
  } catch (error) {
    sendError(res, error);
  }
});

shareLinksRouter.post('/workspaces/:workspaceId/share-links', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    const { link, token } = await createShareLink(pool, {
      workspaceId: workspace.id, userId: req.session.userId, input: req.body || {},
    });
    publishLinkState(workspace.id);
    // The raw token exists only in this response; the server keeps a hash.
    res.status(201).json({ link: publicShareLink(link), token });
  } catch (error) {
    sendError(res, error);
  }
});

shareLinksRouter.delete('/workspaces/:workspaceId/share-links/:linkId', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    const link = await revokeShareLink(pool, { workspaceId: workspace.id, linkId: req.params.linkId });
    if (!link) return res.status(404).json({ error: 'That link no longer exists.' });
    const disconnected = disconnectShareLink(link.id);
    publishLinkState(workspace.id);
    return res.json({ link: publicShareLink(link), disconnected });
  } catch (error) {
    return sendError(res, error);
  }
});

shareLinksRouter.get('/workspaces/:workspaceId/share-links/:linkId/joins', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    const joins = await listShareLinkJoins(pool, { workspaceId: workspace.id, linkId: req.params.linkId });
    res.json({
      joins: joins.map((row) => ({
        guestId: row.guest_id, name: row.display_name, color: row.color, joinedAt: row.joined_at,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Go live: a Watch link that ends with the show. Ending revokes every live
// link on the board, which disconnects the audience.
shareLinksRouter.post('/workspaces/:workspaceId/live', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    const action = req.body?.action;
    if (action === 'end') {
      const ended = await revokeLiveLinks(pool, { workspaceId: workspace.id });
      for (const linkId of ended) disconnectShareLink(linkId, { reason: 'The show has ended' });
      publishLinkState(workspace.id);
      return res.json({ ended: ended.length });
    }
    if (action === 'stage') {
      const link = await setLinkStage(pool, {
        workspaceId: workspace.id, linkId: req.body?.linkId, stage: req.body?.stage,
      });
      if (!link) return res.status(404).json({ error: 'That show is no longer live.' });
      updateProjectionLink(workspace.id, link);
      publishLinkState(workspace.id);
      return res.json({ link: publicShareLink(link) });
    }
    if (action !== 'start') return res.status(400).json({ error: 'Use start, stage or end.' });
    const { link, token } = await createShareLink(pool, {
      workspaceId: workspace.id,
      userId: req.session.userId,
      input: { role: 'view', mode: 'live', stage: req.body?.stage !== false, label: 'Live show', expiresInHours: 12 },
    });
    publishLinkState(workspace.id);
    return res.status(201).json({ link: publicShareLink(link), token });
  } catch (error) {
    return sendError(res, error);
  }
});

// Mark a window public (shown on stage and to links even if its kind is
// private). Written into the live doc so every replica agrees.
shareLinksRouter.post('/workspaces/:workspaceId/windows/:windowId/public', async (req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const workspace = await requireWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId, userId: req.session.userId, roles: MANAGE_ROLES,
    });
    const windowId = String(req.params.windowId);
    if (!ID_PATTERN.test(windowId)) return res.status(400).json({ error: 'Bad window id' });
    const isPublic = Boolean(req.body?.public);
    let found = false;
    const live = await transactCanvasDoc(workspace.id, (doc) => {
      const windows = doc.getMap(CANVAS_ROOT).get('windows');
      const win = windows instanceof Y.Map ? windows.get(windowId) : null;
      if (win instanceof Y.Map) {
        found = true;
        win.set('public', isPublic);
      }
    });
    if (!live) return res.status(409).json({ error: 'Live collaboration is not running on this server.' });
    if (!found) return res.status(404).json({ error: 'That window is not on the board.' });
    refreshProjection(workspace.id);
    return res.json({ windowId, public: isPublic });
  } catch (error) {
    return sendError(res, error);
  }
});

registerMemberCommentRoutes(shareLinksRouter);

export { guestRouter, joinBlocked, recordJoinFailure, __resetGuestJoinLimitForTests } from './guestLinks.js';
export { CommentError, ShareLinkError };
