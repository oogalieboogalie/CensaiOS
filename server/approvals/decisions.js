import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { findApprovalGrant } from './grants.js';
import { approvalRequestHash, sanitizeApprovalArguments } from './requestContract.js';
import { ToolApprovalError } from './requests.js';
import { toolPackageLockKey } from '../capabilities/packageCatalog.js';

function expectedRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new ToolApprovalError('A non-negative expected revision is required.', 400,
      'TOOL_APPROVAL_REVISION_REQUIRED');
  }
  return revision;
}

async function event(db, approval, type, userId, payload = {}) {
  return createWorkspaceEvent({ db }, {
    workspaceId: approval.workspace_id,
    type,
    actor: { kind: 'user', id: String(userId) },
    payload: { approvalId: approval.id, agentId: approval.agent_id, toolName: approval.tool_name, ...payload },
  });
}

export async function decideToolApproval(db, {
  workspaceId, userId, approvalId, decision, revision,
}) {
  if (!['approve', 'deny'].includes(decision)) {
    throw new ToolApprovalError('Decision must be approve or deny.');
  }
  const wantedRevision = expectedRevision(revision);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [candidate] } = await client.query(
      'SELECT * FROM workspace_tool_approvals WHERE id=$1 AND workspace_id=$2',
      [approvalId, workspaceId],
    );
    if (!candidate) throw new ToolApprovalError('Approval request not found.', 404, 'TOOL_APPROVAL_NOT_FOUND');
    const lockKey = toolPackageLockKey(workspaceId, candidate.module_id);
    if (lockKey) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [lockKey]);
    }
    const { rows: [current] } = await client.query(
      'SELECT * FROM workspace_tool_approvals WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
      [approvalId, workspaceId],
    );
    if (!current) throw new ToolApprovalError('Approval request not found.', 404, 'TOOL_APPROVAL_NOT_FOUND');
    if (current.status !== 'pending' || current.revision !== wantedRevision) {
      throw new ToolApprovalError('Approval request changed; refresh before deciding.', 409,
        'TOOL_APPROVAL_STALE');
    }
    if (decision === 'deny') {
      const { rows: [denied] } = await client.query(`UPDATE workspace_tool_approvals SET
        status='denied',revision=revision+1,decided_by_user_id=$3,decision_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND workspace_id=$2 RETURNING *`, [approvalId, workspaceId, userId]);
      await event(client, denied, 'agent.tool_approval.denied', userId);
      await client.query('COMMIT');
      return { execute: false, approval: denied };
    }
    const grant = await findApprovalGrant(client, {
      workspaceId, agentId: current.agent_id, toolName: current.tool_name,
    });
    if (!grant || grant.moduleId !== current.module_id) {
      const { rows: [cancelled] } = await client.query(`UPDATE workspace_tool_approvals SET
        status='cancelled',revision=revision+1,decided_by_user_id=$3,decision_at=NOW(),
        cancellation_reason='module_removed',updated_at=NOW()
        WHERE id=$1 AND workspace_id=$2 RETURNING *`, [approvalId, workspaceId, userId]);
      await event(client, cancelled, 'agent.tool_approval.cancelled', userId, { reason: 'module_removed' });
      await client.query('COMMIT');
      return { execute: false, cancelled: true, approval: cancelled };
    }
    const { rows: [claimed] } = await client.query(`UPDATE workspace_tool_approvals SET
      status='executing',revision=revision+1,decided_by_user_id=$3,decision_at=NOW(),
      execution_started_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND workspace_id=$2 RETURNING *`, [approvalId, workspaceId, userId]);
    await event(client, claimed, 'agent.tool_approval.approved', userId);
    await client.query('COMMIT');
    return { execute: true, approval: claimed };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assertApprovedToolExecution(db, {
  approvalId, agentId, toolName, args, context = {},
}) {
  const workspaceId = String(context.workspaceId || '').trim();
  const userId = Number(context.userId);
  await requireWorkspaceMember(db, { workspaceId, userId, roles: ['owner', 'admin'] });
  const { rows: [approval] } = await db.query(
    `SELECT * FROM workspace_tool_approvals WHERE id=$1 AND workspace_id=$2 AND agent_id=$3
      AND tool_name=$4 AND status='executing' AND decided_by_user_id=$5`,
    [approvalId, workspaceId, String(agentId).toLowerCase(), toolName, userId],
  );
  if (!approval) throw new ToolApprovalError('Approved execution proof is invalid.', 403,
    'TOOL_APPROVAL_EXECUTION_DENIED');
  const cleanArgs = sanitizeApprovalArguments(args);
  const hash = approvalRequestHash({ moduleId: approval.module_id, toolName, args: cleanArgs });
  const grant = await findApprovalGrant(db, { workspaceId, agentId, toolName });
  if (hash !== approval.request_hash || !grant || grant.moduleId !== approval.module_id) {
    throw new ToolApprovalError('Approved execution no longer matches its request.', 409,
      'TOOL_APPROVAL_EXECUTION_STALE');
  }
  return approval;
}

export async function finishToolApproval(db, {
  approval, userId, ok, result, errorCode = null,
}) {
  const status = ok ? 'succeeded' : 'failed';
  const preview = String(result ?? '').slice(0, 4000);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [finished] } = await client.query(`UPDATE workspace_tool_approvals SET
      status=$3,revision=revision+1,execution_finished_at=NOW(),result_preview=$4,error_code=$5,updated_at=NOW()
      WHERE id=$1 AND workspace_id=$2 AND status='executing' AND revision=$6 RETURNING *`,
    [approval.id, approval.workspace_id, status, preview, errorCode, approval.revision]);
    if (!finished) throw new ToolApprovalError('Approval execution receipt changed unexpectedly.', 409,
      'TOOL_APPROVAL_FINISH_STALE');
    await event(client, finished, `agent.tool_approval.${status}`, userId);
    await client.query('COMMIT');
    return finished;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
