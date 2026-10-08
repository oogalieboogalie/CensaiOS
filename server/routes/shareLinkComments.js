// server/routes/shareLinkComments.js
//
// Members' comment pins. Registered on shareLinksRouter so the whole
// feature stays one /api mount.

import pool from '../db.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { callModel, createModelAccessContext } from '../aiGateway/index.js';
import {
  createComment,
  listMentionableAgents,
  listVisibleComments,
  setResolved,
} from '../shareLinks/comments.js';
import { answerAgentMentions } from '../shareLinks/agentReplies.js';
import { publicComment } from '../shareLinks/store.js';
import { COMMENT_ROLES, log, memberActor, requireUser, sendError } from './shareLinkHttp.js';

export function registerMemberCommentRoutes(commentsRouter) {
  commentsRouter.get('/workspaces/:workspaceId/comments', async (req, res) => {
    if (!requireUser(req, res)) return;
    try {
      const workspace = await requireWorkspaceMember(pool, {
        workspaceId: req.params.workspaceId, userId: req.session.userId,
      });
      const [comments, agents] = await Promise.all([
        listVisibleComments(pool, { workspaceId: workspace.id }),
        listMentionableAgents(pool).catch(() => []),
      ]);
      res.json({ comments, agents, canComment: COMMENT_ROLES.includes(workspace.role) });
    } catch (error) {
      sendError(res, error);
    }
  });

  commentsRouter.post('/workspaces/:workspaceId/comments', async (req, res) => {
    if (!requireUser(req, res)) return;
    try {
      const workspace = await requireWorkspaceMember(pool, {
        workspaceId: req.params.workspaceId, userId: req.session.userId, roles: COMMENT_ROLES,
      });
      const author = await memberActor(pool, req.session.userId);
      const result = await createComment(pool, { workspaceId: workspace.id, author, input: req.body || {} });
      res.status(201).json({ comment: publicComment(result.row) });
      answerAgentMentions(pool, {
        workspaceId: workspace.id, root: result.root, mentions: result.mentions,
        ownerUserId: req.session.userId, callModel, createAccessContext: createModelAccessContext,
      }).catch((error) => log.warn('agent mention failed', { error: error.message }));
    } catch (error) {
      sendError(res, error);
    }
  });

  commentsRouter.post('/workspaces/:workspaceId/comments/:commentId/resolve', async (req, res) => {
    if (!requireUser(req, res)) return;
    try {
      const workspace = await requireWorkspaceMember(pool, {
        workspaceId: req.params.workspaceId, userId: req.session.userId, roles: COMMENT_ROLES,
      });
      const author = await memberActor(pool, req.session.userId);
      const row = await setResolved(pool, {
        workspaceId: workspace.id, commentId: req.params.commentId,
        resolved: req.body?.resolved !== false, by: author.name,
      });
      res.json({ comment: publicComment(row) });
    } catch (error) {
      sendError(res, error);
    }
  });
}
