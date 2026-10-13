import pool from '../db.js';
import { syncTodoArtifactsForAgentTask } from '../operational-intelligence/todoSync.js';
import { TERMINAL_TASK_STATUSES, ACTIVE_JULES_STATUSES } from './constants.js';
import { checkLinkedTodoPrContract } from './steward.js';
import { buildJulesCompletionReceipt } from './receipt.js';

function upper(value) {
  return String(value || '').trim().toUpperCase();
}

function resultLine(label, value) {
  return value ? `${label}: ${value}` : null;
}

export function summarizeJulesTaskState(state = {}) {
  const lines = [
    `Jules session: ${state.session || state.julesSessionName || 'unknown'}`,
    resultLine('Status', state.julesStatus || state.status),
    resultLine('PR', state.prUrl || (state.prNumber ? `#${state.prNumber}` : null)),
    resultLine('PR state', state.prState),
    resultLine('Review', state.reviewState ? `${state.reviewState}${state.reviewAuthor ? ` by ${state.reviewAuthor}` : ''}` : null),
    resultLine('Merged', state.mergedAt),
  ].filter(Boolean);
  return lines.join('\n');
}

export function deriveAgentTaskPatch(state = {}) {
  const julesStatus = upper(state.julesStatus || state.status);
  const prState = String(state.prState || '').toLowerCase();
  const reviewState = upper(state.reviewState);
  const merged = Boolean(state.merged || state.mergedAt || prState === 'merged');
  const summary = summarizeJulesTaskState(state);

  if (merged) {
    return {
      status: 'completed',
      result: summary || 'Jules PR merged.',
      error: null,
    };
  }

  if (julesStatus.includes('CANCEL')) {
    return {
      status: 'cancelled',
      result: summary || 'Jules session cancelled.',
      error: null,
    };
  }

  if (julesStatus.includes('FAIL') || julesStatus.includes('ERROR')) {
    return {
      status: 'failed',
      result: summary || 'Jules session failed.',
      error: state.error || state.failureReason || 'Jules session failed.',
    };
  }

  if (prState === 'closed') {
    return {
      status: 'cancelled',
      result: summary || 'Jules PR closed without merge.',
      error: null,
    };
  }

  if (reviewState === 'CHANGES_REQUESTED') {
    return {
      status: 'blocked',
      result: summary || 'Jules PR has requested changes.',
      error: null,
    };
  }

  if (julesStatus === 'AWAITING_PLAN_APPROVAL' || julesStatus === 'AWAITING_USER_FEEDBACK') {
    return {
      status: 'blocked',
      result: summary || 'Jules is waiting for input.',
      error: null,
    };
  }

  if (state.prUrl || state.prNumber || reviewState === 'APPROVED' || reviewState === 'COMMENTED') {
    return {
      status: 'in_progress',
      result: summary || 'Jules PR is open.',
      error: null,
    };
  }

  if (ACTIVE_JULES_STATUSES.has(julesStatus)) {
    return {
      status: julesStatus === 'QUEUED' ? 'queued' : 'in_progress',
      result: summary || 'Jules session is active.',
      error: null,
    };
  }

  return null;
}

export async function findAgentTaskForJulesSession(session) {
  if (session?.agent_task_id) return session.agent_task_id;
  if (!session?.agent_id) return null;

  const { rows } = await pool.query(
    `SELECT id
     FROM agent_tasks
     WHERE assignee_id = $1
       AND ($2::text IS NULL OR project_id = $2)
       AND status NOT IN ('completed', 'failed', 'cancelled')
     ORDER BY started_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [session.agent_id, session.project_id || null]
  );
  return rows[0]?.id || null;
}

export async function syncAgentTaskFromJulesSession(session, extraState = {}) {
  const taskId = await findAgentTaskForJulesSession(session);
  if (!taskId) return null;

  const { rows } = await pool.query('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
  const current = rows[0];
  if (!current || TERMINAL_TASK_STATUSES.has(current.status)) return null;

  let patch = deriveAgentTaskPatch({
    session: session.jules_session_name,
    julesStatus: session.status,
    prNumber: session.pr_number,
    prUrl: session.pr_url,
    prState: session.pr_state,
    reviewState: session.review_state,
    reviewAuthor: session.review_author,
    mergedAt: session.pr_merged_at,
    ...extraState,
  });
  if (!patch) return null;
  if (patch.status === 'completed') {
    const steward = await checkLinkedTodoPrContract(pool, taskId, extraState.changedFiles);
    if (steward && !steward.ok) {
      patch = {
        status: 'blocked',
        result: steward.message,
        error: null,
      };
    }
  }

  const fields = ['status = $1', 'result = $2', 'error = $3', 'updated_at = NOW()'];
  const values = [patch.status, patch.result || null, patch.error || null];
  if (TERMINAL_TASK_STATUSES.has(patch.status)) {
    fields.push('completed_at = NOW()');
    fields.push('completion_receipt = $4');
    values.push(buildJulesCompletionReceipt(current, patch, session, extraState.changedFiles));
  }
  values.push(taskId);

  const updated = await pool.query(
    `UPDATE agent_tasks SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  const updatedTask = updated.rows[0] || null;
  if (updatedTask) {
    await syncTodoArtifactsForAgentTask(pool, {
      taskId,
      taskStatus: updatedTask.status,
      result: updatedTask.result,
      error: updatedTask.error,
      session,
    });
  }

  if (!session.agent_task_id) {
    await pool.query(
      'UPDATE jules_sessions SET agent_task_id = $1, updated_at = NOW() WHERE jules_session_name = $2',
      [taskId, session.jules_session_name]
    );
  }

  return updatedTask;
}
