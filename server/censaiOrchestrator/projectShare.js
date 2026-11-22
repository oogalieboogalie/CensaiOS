// Censai the orchestrator: a family member Censai hands a job to works in the
// plan's project with Censai's own access to it on this board, for as long as
// the plan runs.
//
// A board gives a project only to the agents whose windows are on it
// (src/lib/projectPrewarm.js), so before this, Censai could hand Atlas a job
// in a project Atlas was never given there, and every one of Atlas's project
// tools was refused ("This agent is not authorized for that project in the
// current workspace"). The one rule now: the receiver gets the same access
// Censai has to that one project on that board ('work' or 'read'), nothing
// more, and loses it when the plan ends. A project Censai cannot reach is
// never shared. The rows are ordinary board memberships with source_kind
// 'task', so every project tool, test run and folder lookup sees them.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { assertAgentProjectAccess } from '../workspaces/projectMemberships.js';
import { resolveAuthorizedWorkspaceProject } from '../workspaces/projectAccess.js';

const log = createLogger('censai-orchestrator');

/** Who hands the work out, and whose access the receivers get. */
export const HANDOFF_GIVER = 'censai';
const SOURCE = 'censai-plan:';

export const shareSource = (planId) => `${SOURCE}${planId}`;

const agentKey = (id) => String(id || '').trim().toLowerCase();

/** Censai's own access to the project on this board: { projectId, permission }, or null when it has none. */
export async function giverAccess(db, { workspaceId, project }) {
  const name = String(project || '').trim();
  if (!workspaceId || !name) return null;
  try {
    const row = await resolveAuthorizedWorkspaceProject(db, {
      workspaceId, agentId: HANDOFF_GIVER, projectIdentifier: name,
    });
    const { permission } = await assertAgentProjectAccess(db, {
      workspaceId, projectId: row.id, agentId: HANDOFF_GIVER,
    });
    return { projectId: row.id, permission };
  } catch (error) {
    if (error?.code === 'PROJECT_ACCESS_DENIED') return null;
    throw error;
  }
}

/**
 * Give each of the plan's agents Censai's access to the plan's project on its board.
 * Returns { projectId, permission, workspaceId, agentIds } or null when there is nothing to share.
 */
export async function shareProject(db, { planId, workspaceId, userId = null, project, agentIds = [] }) {
  const access = await giverAccess(db, { workspaceId, project });
  if (!access) return null;
  const agents = [...new Set(agentIds.map(agentKey))].filter((id) => id && id !== HANDOFF_GIVER);
  const done = [];
  for (const agentId of agents) {
    try {
      await db.query(
        `INSERT INTO workspace_agent_projects
           (workspace_id, project_id, agent_id, permission, source_kind, source_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, 'task', $5, $6)
         ON CONFLICT (workspace_id, project_id, agent_id, source_kind) DO UPDATE SET
           permission = EXCLUDED.permission, source_id = EXCLUDED.source_id,
           created_by_user_id = EXCLUDED.created_by_user_id, updated_at = NOW()`,
        [workspaceId, access.projectId, agentId, access.permission, shareSource(planId), Number(userId) || null],
      );
    } catch (error) {
      // What was shared before the failure, so it can still be taken back.
      error.partialShare = { ...access, workspaceId, agentIds: done };
      throw error;
    }
    done.push(agentId);
  }
  return { ...access, workspaceId, agentIds: agents };
}

/** Take back what a plan was given, except for agents a plan still running here also gave it to. */
export async function unshareProject(db, { workspaceId, projectId, agentIds = [], keep = [] }) {
  const kept = new Set(keep.map(agentKey));
  const drop = agentIds.map(agentKey).filter((id) => id && !kept.has(id));
  if (!workspaceId || !projectId || drop.length === 0) return 0;
  const { rowCount } = await db.query(
    `DELETE FROM workspace_agent_projects
      WHERE workspace_id = $1 AND project_id = $2 AND source_kind = 'task'
        AND source_id LIKE 'censai-plan:%' AND agent_id = ANY($3::text[])`,
    [workspaceId, projectId, drop],
  );
  return rowCount || 0;
}

/** Take back every plan's share. Only while no plan runs here: at start, and before plans carry on after a restart. */
export async function sweepShares(db) {
  const { rowCount } = await db.query(
    `DELETE FROM workspace_agent_projects
      WHERE source_kind = 'task' AND source_id LIKE 'censai-plan:%'`,
  );
  return rowCount || 0;
}

/** As a plan starts: share its project with its agents. The share (what got shared, on a failure), or null; a failure is logged, and each tool then says why. */
export async function sharePlanProject(db, plan) {
  if (!plan?.project) return null;
  try {
    const shared = await shareProject(db, {
      planId: plan.id, workspaceId: plan.workspaceId, userId: plan.userId, project: plan.project,
      agentIds: plan.jobs.map((job) => job.agentId),
    });
    if (shared) log.info('project shared with the plan\'s agents', { planId: plan.id, agents: shared.agentIds.length, permission: shared.permission });
    return shared;
  } catch (error) {
    log.warn('project not shared with the plan\'s agents', { planId: plan.id, code: safeErrorCode(error) });
    return error?.partialShare?.agentIds?.length ? error.partialShare : null;
  }
}

/** As a plan ends: take its share back, except what `others` (the shares of plans still running) also give. */
export async function takeBackPlanProject(db, plan, shared, others = []) {
  if (!shared) return;
  const keep = others
    .filter((other) => other?.projectId === shared.projectId && other.workspaceId === plan.workspaceId)
    .flatMap((other) => other.agentIds);
  try {
    await unshareProject(db, { workspaceId: plan.workspaceId, projectId: shared.projectId, agentIds: shared.agentIds, keep });
  } catch (error) {
    log.warn('project share not taken back', { planId: plan.id, code: safeErrorCode(error) });
  }
}

// ── A to-do handed to a board agent ──────────────────────────────────────
// The to-do becomes a task for one of the agent's helpers, and a helper
// reaches projects through its parent agent's access on the board. So while
// the task is open, the agent has the to-do's one project with the access of
// the person who handed it off (worked out in server/routes/projects/handoffs.js).
//
// A board keeps one row per agent, project and kind, so a to-do's loan is a
// row of kind 'manual' (a person gave it), never the 'task' row a plan of
// Censai lends on: the two never cut each other off or widen each other.
// Its source_id lists the tasks that lent it ("agent-task:<id>,<id>"), and the
// row goes once every one of them has ended; any other task of the agent in
// that project keeps nothing alive. A project the agent was given for good
// (open_project) is never turned into a loan.

const TASK_LOAN = 'agent-task:';
// server/memory/tasks/receipts.js TERMINAL_TASK_STATUSES: a task in one of these has ended.
const ENDED_TASK = ['completed', 'failed', 'cancelled'];

/**
 * Lend `agentId` the project for task `taskId` with `permission`. True when the
 * row is the to-do's loan (new, or another open to-do's that now lists this
 * task too); false when there was nothing to lend or the agent has it for good.
 */
export async function shareTaskProject(db, { taskId, workspaceId, projectId, agentId, permission, userId = null }) {
  if (!taskId || !workspaceId || !projectId || !agentId || !['read', 'work'].includes(permission)) return false;
  const { rowCount } = await db.query(
    `INSERT INTO workspace_agent_projects AS wap
       (workspace_id, project_id, agent_id, permission, source_kind, source_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, 'manual', $5, $6)
     ON CONFLICT (workspace_id, project_id, agent_id, source_kind) DO UPDATE SET
       permission = CASE WHEN wap.permission = 'work' THEN 'work' ELSE EXCLUDED.permission END,
       source_id = wap.source_id || ',' || $7, updated_at = NOW()
     WHERE wap.source_id LIKE '${TASK_LOAN}%'`,
    [workspaceId, projectId, agentId, permission, `${TASK_LOAN}${taskId}`, Number(userId) || null, String(taskId)],
  );
  return rowCount > 0;
}

const loanTaskIds = (sourceId) => String(sourceId).slice(TASK_LOAN.length).split(',').filter(Boolean);

/**
 * Take back each to-do loan whose tasks have all ended (or are gone), and
 * drop ended tasks from the rest. A row a new to-do changed meanwhile is left
 * for the next pass. Returns how many loans were taken back. Safe at any time.
 */
export async function takeBackEndedTaskShares(db) {
  const { rows } = await db.query(
    `SELECT workspace_id, project_id, agent_id, source_id FROM workspace_agent_projects
      WHERE source_kind = 'manual' AND source_id LIKE '${TASK_LOAN}%'`,
  );
  if (rows.length === 0) return 0;
  const ids = [...new Set(rows.flatMap((row) => loanTaskIds(row.source_id)))];
  const { rows: open } = await db.query(
    'SELECT id::text AS id FROM agent_tasks WHERE id::text = ANY($1::text[]) AND NOT (status = ANY($2::text[]))',
    [ids, ENDED_TASK],
  );
  const stillOpen = new Set(open.map((row) => row.id));
  const where = `WHERE workspace_id = $1 AND project_id = $2 AND agent_id = $3
                   AND source_kind = 'manual' AND source_id = $4`;
  let takenBack = 0;
  for (const row of rows) {
    const held = loanTaskIds(row.source_id);
    const keep = held.filter((id) => stillOpen.has(id));
    if (keep.length === held.length) continue;
    const key = [row.workspace_id, row.project_id, row.agent_id, row.source_id];
    if (keep.length === 0) {
      const { rowCount } = await db.query(`DELETE FROM workspace_agent_projects ${where}`, key);
      takenBack += rowCount || 0;
    } else {
      await db.query(`UPDATE workspace_agent_projects SET source_id = $5, updated_at = NOW() ${where}`,
        [...key, `${TASK_LOAN}${keep.join(',')}`]);
    }
  }
  return takenBack;
}

/** takeBackEndedTaskShares, for a caller that carries on whatever happens; a failure is logged. */
export async function takeBackEndedTaskSharesQuietly(db) {
  try {
    return await takeBackEndedTaskShares(db);
  } catch (error) {
    log.warn('to-do project loans not taken back', { code: safeErrorCode(error) });
    return 0;
  }
}
