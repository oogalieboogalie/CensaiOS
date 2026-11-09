// POST .../comments/:commentId/translate  { pair: "en-fr" | "fr-en" }
// Members who can comment use their own model key. A guest uses the board
// owner's key, and only while that share link still has agent budget left.

import pool from '../db.js';
import { callModel, createModelAccessContext, workspaceUsageSink } from '../aiGateway/index.js';
import { CommentError } from '../shareLinks/comments.js';
import { translateBoardComment } from '../shareLinks/commentTranslate.js';
import { publicComment } from '../shareLinks/commentRows.js';
import { releaseAgentBudget, reserveAgentBudget } from '../shareLinks/translateBudget.js';
import { commentTranslateLimiter } from '../shareLinks/translateLimit.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { COMMENT_ROLES, requireUser, sendError } from './shareLinkHttp.js';

const NO_OWNER = 'This board has no owner to translate with. The owner adds an AI key in Settings → Vault.';
const RATE_LIMITED = { error: 'Too many translations. Wait a minute and try again.', code: 'TRANSLATION_RATE' };

function guestTranslateBudgetLeft(link) {
  const budget = Number(link?.agent_budget_tokens);
  const used = Number(link?.agent_tokens_used);
  return Number.isFinite(budget) && Number.isFinite(used) && used < budget;
}

function budgetFor(db, linkId) {
  return {
    holdBudget: async (tokens) => Boolean(await reserveAgentBudget(db, linkId, tokens)),
    releaseBudget: (tokens) => releaseAgentBudget(db, linkId, tokens),
  };
}

async function completeWithModel({ userId, workspaceId, messages }) {
  const accessContext = createModelAccessContext({
    userId: String(userId), workspaceId: String(workspaceId), source: 'comment-translate',
  });
  const data = await callModel({
    accessContext,
    body: { messages, max_tokens: 1200, temperature: 0.2 },
    timeoutMs: 60000,
    logContext: { source: 'comment-translate' },
    usageAttribution: {
      workspaceId: String(workspaceId),
      actor: { kind: 'user', id: String(userId) },
      source: 'comment-translate',
    },
    usageSink: workspaceUsageSink,
  });
  return data?.choices?.[0]?.message?.content || '';
}

export function registerMemberCommentTranslate(router, deps = {}) {
  const db = deps.db || pool;
  const requireMember = deps.requireMember || requireWorkspaceMember;
  const complete = deps.complete || completeWithModel;
  const limiter = deps.limiter || commentTranslateLimiter;
  router.post('/workspaces/:workspaceId/comments/:commentId/translate', async (req, res) => {
    if (!requireUser(req, res)) return undefined;
    try {
      const workspace = await requireMember(db, {
        workspaceId: req.params.workspaceId, userId: req.session.userId, roles: COMMENT_ROLES,
      });
      if (!limiter.allow(`member:${req.session.userId}:${workspace.id}`)) return res.status(429).json(RATE_LIMITED);
      const row = await translateBoardComment(db, {
        workspaceId: workspace.id,
        commentId: req.params.commentId,
        pair: req.body?.pair,
        complete: (messages) => complete({ userId: req.session.userId, workspaceId: workspace.id, messages }),
      });
      return res.json({ comment: publicComment(row) });
    } catch (error) {
      return sendError(res, error);
    }
  });
}

export function registerGuestCommentTranslate(router, guestAccess, deps = {}) {
  const db = deps.db || pool;
  const complete = deps.complete || completeWithModel;
  const limiter = deps.limiter || commentTranslateLimiter;
  router.post('/comments/:commentId/translate', async (req, res) => {
    const access = await guestAccess(req, res);
    if (!access) return undefined;
    if (!access.capabilities?.canComment) {
      return res.status(403).json({ error: 'This link can view but not comment.', code: 'GUEST_CANNOT_COMMENT' });
    }
    if (!guestTranslateBudgetLeft(access.link)) {
      return res.status(403).json({
        error: 'This share link has no translation budget left. The board owner can raise it in Share.',
        code: 'GUEST_TRANSLATE_BUDGET',
      });
    }
    const ownerId = access.link?.created_by_user_id;
    if (!ownerId) return sendError(res, new CommentError(NO_OWNER, 400, 'TRANSLATION_NO_OWNER'));
    if (!limiter.allow(`link:${access.link.id}`)) return res.status(429).json(RATE_LIMITED);
    try {
      const row = await translateBoardComment(db, {
        workspaceId: access.link.workspace_id,
        commentId: req.params.commentId,
        pair: req.body?.pair,
        link: access.link,
        ...budgetFor(db, access.link.id),
        complete: (messages) => complete({ userId: ownerId, workspaceId: access.link.workspace_id, messages }),
      });
      return res.json({ comment: publicComment(row) });
    } catch (error) {
      return sendError(res, error);
    }
  });
}
