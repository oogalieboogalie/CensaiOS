import pool from '../db.js';
import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import { parseScheduledTime } from '../memory/schedules_utils.js';

const INTERNAL_PATCH_FIELDS = new Set([
  'agent_id', 'project_id', 'project_name', 'project_path', 'project_repo',
  'project_ref', 'task_text', 'document_target', 'scheduled_time', 'scheduled_date',
  'repeat_enabled', 'repeat_days', 'repeat_freq', 'status', 'next_run_at',
  'github_url', 'github_number', 'last_error', 'last_run_id',
]);

export class ScheduleContractError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ScheduleContractError';
    this.statusCode = statusCode;
  }
}

function scope({ userId, workspaceId } = {}) {
  const ownerId = Number(userId);
  const workspace = String(workspaceId || '').trim();
  if (!Number.isInteger(ownerId) || ownerId <= 0 || !workspace) {
    throw new ScheduleContractError('Authenticated schedule workspace is required.', 403);
  }
  return { userId: ownerId, workspaceId: workspace };
}

function scheduleInput(input = {}) {
  const agentId = String(input.agent_id || '').trim().toLowerCase();
  const taskText = String(input.task_text || '').trim();
  if (!FAMILY_AGENT_BY_ID[agentId]) {
    throw new ScheduleContractError('Private-beta schedules target canonical family agents only.', 422);
  }
  if (!taskText) throw new ScheduleContractError('task_text is required.');
  if (taskText.length > 8000) throw new ScheduleContractError('task_text cannot exceed 8000 characters.');
  return { agentId, taskText, nextRunAt: parseScheduledTime(input.scheduled_date, input.scheduled_time) };
}

export async function createSchedule(input, options = {}) {
  const db = options.db || pool;
  const owner = scope(options);
  const clean = scheduleInput(input);
  const { rows } = await db.query(
    `INSERT INTO schedules (
      agent_id, project_id, project_name, project_path, project_repo, project_ref,
      task_text, document_target, scheduled_time, scheduled_date,
      repeat_enabled, repeat_days, repeat_freq, status, next_run_at,
      github_url, github_number, workspace_id, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',$14,$15,$16,$17,$18)
    RETURNING *`,
    [
      clean.agentId, input.project_id || null, input.project_name || null, input.project_path || null,
      input.project_repo || null, input.project_ref || null, clean.taskText,
      input.document_target || null, input.scheduled_time, input.scheduled_date,
      Boolean(input.repeat_enabled), input.repeat_days || null, input.repeat_freq || null,
      clean.nextRunAt, input.github_url || null, input.github_number || null,
      owner.workspaceId, owner.userId,
    ]
  );
  return rows[0];
}

export async function getSchedules(options = {}) {
  const db = options.db || pool;
  const owner = scope(options);
  const { rows } = await db.query(
    `SELECT * FROM schedules
      WHERE created_by_user_id=$1 AND workspace_id=$2
      ORDER BY next_run_at ASC`,
    [owner.userId, owner.workspaceId]
  );
  return rows;
}

export async function updateOwnedSchedule(id, patch, options = {}) {
  const db = options.db || pool;
  const owner = scope(options);
  const status = String(patch?.status || '').trim();
  if (!['active', 'inactive'].includes(status)) {
    throw new ScheduleContractError('Schedules can only be activated or paused from this endpoint.');
  }
  const { rows } = await db.query(
    `UPDATE schedules SET status=$1, updated_at=NOW()
      WHERE id=$2 AND created_by_user_id=$3 AND workspace_id=$4
      RETURNING *`,
    [status, id, owner.userId, owner.workspaceId]
  );
  return rows[0] || null;
}

export async function deleteOwnedSchedule(id, options = {}) {
  const db = options.db || pool;
  const owner = scope(options);
  const result = await db.query(
    'DELETE FROM schedules WHERE id=$1 AND created_by_user_id=$2 AND workspace_id=$3',
    [id, owner.userId, owner.workspaceId]
  );
  return result.rowCount > 0;
}

export async function updateSchedule(id, patch, { db = pool } = {}) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(patch || {})) {
    if (!INTERNAL_PATCH_FIELDS.has(key)) continue;
    values.push(value);
    fields.push(`${key}=$${values.length}`);
  }
  if (!fields.length) return null;
  values.push(id);
  const { rows } = await db.query(
    `UPDATE schedules SET ${fields.join(', ')}, updated_at=NOW()
      WHERE id=$${values.length} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function getScheduleOwnershipSummary({ db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT
       count(*) FILTER (WHERE workspace_id IS NULL OR created_by_user_id IS NULL)::int AS legacy_unowned_count,
       count(*) FILTER (WHERE status IN ('active','running')
         AND (workspace_id IS NULL OR created_by_user_id IS NULL))::int AS blocking_unowned_count
     FROM schedules`
  );
  const row = rows[0] || {};
  return {
    ready: Number(row.blocking_unowned_count || 0) === 0,
    legacyUnownedCount: Number(row.legacy_unowned_count || 0),
    blockingUnownedCount: Number(row.blocking_unowned_count || 0),
  };
}

export async function getDueSchedules({ db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM schedules WHERE status='active' AND next_run_at<=NOW()
       AND workspace_id IS NOT NULL AND created_by_user_id IS NOT NULL
     FOR UPDATE SKIP LOCKED`
  );
  return rows;
}

export async function claimNextDueSchedule({ db = pool } = {}) {
  const { rows } = await db.query(
    `UPDATE schedules SET status='running', updated_at=NOW(), last_error=NULL
     WHERE id=(SELECT id FROM schedules WHERE status='active' AND next_run_at<=NOW()
       AND workspace_id IS NOT NULL AND created_by_user_id IS NOT NULL
       ORDER BY next_run_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING *`
  );
  return rows[0] || null;
}

export async function getRunningScheduleRuns({ db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT s.*, r.status AS run_status,
       (SELECT error->>'message' FROM run_steps WHERE run_id=r.id AND status='failed'
        ORDER BY created_at DESC LIMIT 1) AS run_error
     FROM schedules s JOIN runs r ON r.id=s.last_run_id
     WHERE s.status='running' AND s.last_run_id IS NOT NULL
       AND s.workspace_id IS NOT NULL AND s.created_by_user_id IS NOT NULL
     ORDER BY s.updated_at ASC`
  );
  return rows;
}
