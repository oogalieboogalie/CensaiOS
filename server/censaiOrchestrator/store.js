// Censai the orchestrator: plans in the database (docker/073-censai-plans.sql).
// Every read a person makes is scoped to their own plans on that board.

import { randomUUID } from 'node:crypto';

const COLUMNS = 'id, workspace_id, user_id, goal, project, status, summary, jobs, created_at, updated_at, finished_at, reported_at';
export const MAX_OPEN_PLANS = 3;
const LONE_HALF = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Text Postgres takes as is: no NUL, no half of an emoji (an agent's answer can hold either). */
export function storable(value) {
  if (typeof value === 'string') return value.replaceAll('\u0000', '').replace(LONE_HALF, '\ufffd');
  if (Array.isArray(value)) return value.map(storable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, storable(item)]));
  return value;
}

export async function insertPlan(db, { workspaceId, userId, goal, project, jobs, id = randomUUID() }) {
  const { rows } = await db.query(
    `INSERT INTO censai_plans (id, workspace_id, user_id, goal, project, status, jobs)
     VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb) RETURNING ${COLUMNS}`,
    [id, workspaceId, userId, storable(goal), storable(project), JSON.stringify(storable(jobs))],
  );
  return rows[0];
}

/** Unscoped: only for the runner, which already owns the plan. */
export async function loadPlan(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM censai_plans WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function getPlan(db, { id, workspaceId, userId }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM censai_plans WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [id, workspaceId, userId],
  );
  return rows[0] || null;
}

/** The person's plans on this board, newest first. open: still running, or finished and not yet told. */
export async function listPlans(db, { workspaceId, userId, open = false, limit = 10 }) {
  const where = open ? " AND (status IN ('queued', 'running') OR reported_at IS NULL)" : '';
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM censai_plans WHERE workspace_id = $1 AND user_id = $2${where}
     ORDER BY created_at DESC LIMIT $3`,
    [workspaceId, userId, Math.max(1, Math.min(Math.trunc(Number(limit)) || 10, 25))],
  );
  return rows;
}

export async function countOpenPlans(db, { workspaceId, userId }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS open FROM censai_plans
     WHERE workspace_id = $1 AND user_id = $2 AND status IN ('queued', 'running')`,
    [workspaceId, userId],
  );
  return rows[0]?.open || 0;
}

/** Save a plan that is still open. A finished plan is never written over (null), so a late save cannot undo a stop. */
export async function savePlan(db, plan) {
  const finished = ['done', 'stuck', 'stopped'].includes(plan.status);
  const { rows } = await db.query(
    `UPDATE censai_plans SET status = $2, summary = $3, jobs = $4::jsonb, updated_at = NOW(),
       finished_at = CASE WHEN $5::boolean THEN COALESCE(finished_at, NOW()) ELSE NULL END
     WHERE id = $1 AND status IN ('queued', 'running') RETURNING ${COLUMNS}`,
    [plan.id, plan.status, storable(plan.summary) || null, JSON.stringify(storable(plan.jobs || [])), finished],
  );
  return rows[0] || null;
}

/** The first caller after a plan finished gets first: true and posts the result line; the rest do not. */
export async function claimReport(db, { id, workspaceId, userId }) {
  const { rows } = await db.query(
    `UPDATE censai_plans SET reported_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND user_id = $3
       AND reported_at IS NULL AND status IN ('done', 'stuck', 'stopped')
     RETURNING id`,
    [id, workspaceId, userId],
  );
  return rows.length > 0;
}

/** Plans a previous run of the app left unfinished (for recovery after a restart). */
export async function listUnfinished(db) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM censai_plans WHERE status IN ('queued', 'running') ORDER BY created_at LIMIT 50`,
  );
  return rows;
}
