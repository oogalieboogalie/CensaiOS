import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { findApprovalGrant } from './grants.js';
import { approvalRequestHash, sanitizeApprovalArguments } from './requestContract.js';
import { toolHasApprovalModule } from '../../src/data/agent-capability-modules.js';
import { toolPackageLockKey } from '../capabilities/packageCatalog.js';
import { agentIsTrusted, TRUSTED_ROLES } from './trustMode.js';
import { assertHelperTrusted } from './helperTrust.js';

export class ToolApprovalError extends Error {
  constructor(message, statusCode = 400, code = 'TOOL_APPROVAL_INVALID') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function canonicalAgentId(value) {
  const agentId = String(value || '').trim().toLowerCase();
  if (!FAMILY_AGENT_BY_ID[agentId]) {
    throw new ToolApprovalError('Only canonical family agents can request tool approval.', 422,
      'TOOL_APPROVAL_UNSUPPORTED_AGENT');
  }
  return agentId;
}

export async function requestToolApprovalIfRequired(db, { agentId, toolName, args, context = {} }) {
  const workspaceId = String(context.workspaceId || '').trim();
  // Helper agents have no approval card; with Trust mode off their writes and
  // commands refuse instead (server/approvals/helperTrust.js).
  if (!FAMILY_AGENT_BY_ID[String(agentId || '').trim().toLowerCase()]) {
    return assertHelperTrusted(db, {
      agentId, toolName, workspaceId, approvalTool: toolHasApprovalModule(toolName),
    });
  }
  if (!toolHasApprovalModule(toolName)) return { required: false };
  if (!workspaceId) {
    throw new ToolApprovalError(
      'Approval-controlled family tools require a signed workspace.',
      403,
      'TOOL_APPROVAL_SCOPE_REQUIRED',
    );
  }
  const canonicalId = canonicalAgentId(agentId);
  const grant = await findApprovalGrant(db, { workspaceId, agentId: canonicalId, toolName });
  if (!grant) {
    throw new ToolApprovalError(
      'The approval module for this tool is not equipped.',
      403,
      'TOOL_APPROVAL_GRANT_REQUIRED',
    );
  }
  const userId = Number(context.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ToolApprovalError('Signed user context is required for an approval request.', 403,
      'TOOL_APPROVAL_USER_REQUIRED');
  }
  const member = await requireWorkspaceMember(db, { workspaceId, userId });
  // Trust mode (on unless an owner turns it off in
  // Settings): when the person asking could approve it themselves (owner or
  // admin), the agent acts now instead of waiting for that same person's click.
  if (TRUSTED_ROLES.includes(member?.role)
    && await agentIsTrusted(db, { workspaceId, agentId: canonicalId })) {
    await createWorkspaceEvent({ db }, {
      workspaceId, type: 'agent.tool.trusted', actor: { kind: 'agent', id: canonicalId },
      payload: { moduleId: grant.moduleId, toolName, requestedByUserId: userId },
    });
    return { required: false, trusted: true };
  }
  const cleanArgs = sanitizeApprovalArguments(args);
  const requestHash = approvalRequestHash({ moduleId: grant.moduleId, toolName, args: cleanArgs });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      toolPackageLockKey(workspaceId, grant.moduleId),
    ]);
    const currentGrant = await findApprovalGrant(client, {
      workspaceId, agentId: canonicalId, toolName,
    });
    if (!currentGrant || currentGrant.moduleId !== grant.moduleId) {
      throw new ToolApprovalError(
        'The approval module for this tool is not equipped.', 403, 'TOOL_APPROVAL_GRANT_REQUIRED',
      );
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `tool-approval:${workspaceId}:${canonicalId}:${requestHash}`,
    ]);
    const existing = await client.query(`SELECT * FROM workspace_tool_approvals
      WHERE workspace_id=$1 AND agent_id=$2 AND request_hash=$3 AND status IN ('pending','executing')
      ORDER BY created_at LIMIT 1`, [workspaceId, canonicalId, requestHash]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { required: true, created: false, approval: existing.rows[0] };
    }
    const { rows: [approval] } = await client.query(`INSERT INTO workspace_tool_approvals
      (workspace_id,agent_id,module_id,tool_name,arguments,request_hash,requested_by_user_id)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
    [workspaceId, canonicalId, grant.moduleId, toolName, JSON.stringify(cleanArgs), requestHash, userId]);
    await createWorkspaceEvent({ db: client }, {
      workspaceId, type: 'agent.tool_approval.requested', actor: { kind: 'agent', id: canonicalId },
      payload: { approvalId: approval.id, moduleId: grant.moduleId, toolName, requestedByUserId: userId },
    });
    await client.query('COMMIT');
    return { required: true, created: true, approval };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listToolApprovals(db, { workspaceId, statuses, limit = 100 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const statusList = Array.isArray(statuses) ? statuses.filter(Boolean) : [];
  const params = [workspaceId, safeLimit];
  const filter = statusList.length ? 'AND status=ANY($3)' : '';
  if (statusList.length) params.push(statusList);
  const { rows } = await db.query(`SELECT * FROM workspace_tool_approvals
    WHERE workspace_id=$1 ${filter} ORDER BY created_at DESC LIMIT $2`, params);
  return rows;
}
