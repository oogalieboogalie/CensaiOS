import express from 'express';
import pool from '../db.js';
import { decideToolApproval, finishToolApproval } from '../approvals/decisions.js';
import { listToolApprovals, ToolApprovalError } from '../approvals/requests.js';
import { executeApprovedTool } from '../tools.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { toolCallOk } from './chat/toolOutcome.js';

const STATUSES = new Set(['pending', 'executing', 'succeeded', 'failed', 'denied', 'cancelled']);
export const approvalsRouter = express.Router();

function requestedWorkspaceId(req) {
  const queryId = String(req.query?.workspaceId || '').trim();
  const bodyId = String(req.body?.workspaceId || '').trim();
  if (queryId && bodyId && queryId !== bodyId) {
    throw new ToolApprovalError('Conflicting workspace IDs are not allowed.', 400,
      'TOOL_APPROVAL_SCOPE_CONFLICT');
  }
  const workspaceId = queryId || bodyId;
  if (!workspaceId) throw new ToolApprovalError('Open a workspace to view approvals.', 400,
    'TOOL_APPROVAL_SCOPE_REQUIRED');
  return workspaceId;
}

async function scope(req, write = false) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ToolApprovalError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
  }
  const workspaceId = requestedWorkspaceId(req);
  const workspace = await requireWorkspaceMember(pool, {
    workspaceId, userId, ...(write ? { roles: ['owner', 'admin'] } : {}),
  });
  return { workspaceId, userId, role: workspace.role };
}

function sendError(res, error) {
  const status = Number(error?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: 'Tool approval is temporarily unavailable.' });
}

approvalsRouter.get('/tool-approvals', async (req, res) => {
  try {
    const auth = await scope(req);
    const statuses = String(req.query.status || '').split(',').map(value => value.trim()).filter(Boolean);
    if (statuses.some(status => !STATUSES.has(status))) {
      throw new ToolApprovalError('Unknown approval status filter.');
    }
    const approvals = await listToolApprovals(pool, { ...auth, statuses, limit: req.query.limit });
    res.json({
      workspaceId: auth.workspaceId,
      canDecide: ['owner', 'admin'].includes(auth.role),
      approvals,
    });
  } catch (error) {
    sendError(res, error);
  }
});

approvalsRouter.post('/tool-approvals/:id/decision', async (req, res) => {
  try {
    const auth = await scope(req, true);
    const decision = await decideToolApproval(pool, {
      ...auth, approvalId: req.params.id, decision: req.body?.decision, revision: req.body?.revision,
    });
    if (decision.cancelled) return res.status(409).json({
      error: 'The module was removed before approval.', code: 'TOOL_APPROVAL_MODULE_REMOVED',
      approval: decision.approval,
    });
    if (!decision.execute) return res.json({ ok: true, approval: decision.approval });
    const approval = decision.approval;
    const result = await executeApprovedTool(
      approval.agent_id, approval.tool_name, approval.arguments, auth, approval.id,
    );
    const ok = toolCallOk(result);
    const finished = await finishToolApproval(pool, {
      approval, userId: auth.userId, ok, result,
      errorCode: ok ? null : String(result).split(':', 1)[0].slice(0, 80),
    });
    res.json({ ok, approval: finished, result });
  } catch (error) {
    sendError(res, error);
  }
});
