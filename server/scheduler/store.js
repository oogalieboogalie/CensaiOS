import pool from '../db.js';
import { createLogger } from '../logger.js';
import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import { parseScheduledTime } from '../memory/schedules_utils.js';

const log = createLogger('scheduler');

const INTERNAL_PATCH_FIELDS = new Set([
  'agent_id', 'project_id', 'project_name', 'project_path', 'project_repo',
  'project_ref', 'task_text', 'document_target', 'scheduled_time', 'scheduled_date',
  'repeat_enabled', 'repeat_days', 'repeat_freq', 'status', 'next_run_at',
  'github_url', 'github_number', 'last_error', 'last_result', 'last_run_at', 'last_run_id', 'tag',
]);

/** A short label like "Maintenance" shown on the run's card; empty means none. */
export function cleanScheduleTag(value) {
  const tag = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return tag || null;
}

export class ScheduleContractError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ScheduleContractError';
    this.statusCode = statusCode;
  }
}

function scope({ userId, workspaceId, seeAgentWakeUps = false } = {}) {
  const ownerId = Number(userId);
  const workspace = String(workspaceId || '').trim();
  if (!Number.isInteger(ownerId) || ownerId <= 0 || !workspace) {
    throw new ScheduleContractError('Authenticated schedule workspace is required.', 403);
  }
  return { userId: ownerId, workspaceId: workspace, manager: Boolean(seeAgentWakeUps) };
}

// Your own runs, plus (for the board's owner or admins) every wake-up an agent set.
const MINE = '(created_by_user_id=$1 OR ($3::boolean AND set_by_agent IS NOT NULL)) AND workspace_id=$2';

function scheduleInput(input = {}) {
  const agentId = String(input.agent_id || '').trim().toLowerCase();
  const taskText = String(input.task_text || '').trim();
  if (!FAMILY_AGENT_BY_ID[agentId]) {
    throw new ScheduleContractError('Private-beta schedules target canonical family agents only.', 422);
  }
  if (!taskText) throw new ScheduleContractError('task_text is required.');
  if (taskText.length > 8000) throw new ScheduleContractError('task_text cannot exceed 8000 characters.');
  // The table only knows these two; anything else ("every 0 minutes") used to reach it and come back as a 500.
  if (input.repeat_freq != null && !['weekly', 'monthly'].includes(input.repeat_freq)) {
    throw new ScheduleContractError('A schedule repeats weekly (on the days you pick) or monthly.', 422);
  }
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
      github_url, github_number, tag, workspace_id, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',$14,$15,$16,$17,$18,$19)
    RETURNING *`,
    [
      clean.agentId, input.project_id || null, input.project_name || null, input.project_path || null,
      input.project_repo || null, input.project_ref || null, clean.taskText,
      input.document_target || null, input.scheduled_time, input.scheduled_date,
      Boolean(input.repeat_enabled), input.repeat_days || null, input.repeat_freq || null,
      clean.nextRunAt, input.github_url || null, input.github_number || null,
      cleanScheduleTag(input.tag), owner.workspaceId, owner.userId,
    ]
  );
  return rows[0];
}

export async function getSchedules(options = {}) {
  const db = options.db || pool;
  const owner = scope(options);
  const { rows } = await db.query(
    `SELECT * FROM schedules
      WHERE ${MINE}
      ORDER BY next_run_at ASC`,
    [owner.userId, owner.workspaceId, owner.manager]
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
    `UPDATE schedules SET status=$5, updated_at=NOW()
      WHERE id=$4 AND ${MINE}
      RETURNING *`,
    [owner.userId, owner.workspaceId, owner.manager, id, status]
  );
  return rows[0] || null;
}

function scheduleDeleteWhy(error, worked) {
  if (worked) return 'deleted';
  if (!error) return 'not found';
  if (error.code === '23503' || error.code === '23514') return 'still linked to a run';
  return 'could not delete';
}

export async function deleteOwnedSchedule(id, options = {}) {
  const db = options.db || pool;
  const owner = scope(options);
  const scheduleId = String(id || '');
  try {
    const result = await db.query(
      `DELETE FROM schedules WHERE id=$4 AND ${MINE} RETURNING agent_id`,
      [owner.userId, owner.workspaceId, owner.manager, id]
    );
    const worked = result.rowCount > 0;
    log.info('schedule delete', {
      scheduleId,
      agent: result.rows[0]?.agent_id || null,
      worked,
      why: scheduleDeleteWhy(null, worked),
    });
    return worked;
  } catch (error) {
    log.info('schedule delete', {
      scheduleId,
      agent: null,
      worked: false,
      why: scheduleDeleteWhy(error, false),
    });
    throw error;
  }
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
