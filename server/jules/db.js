import pool from '../db.js';
import { syncAgentTaskFromJulesSession } from '../jules-task-sync/index.js';
import { ACTIVE_SESSION_STATUSES, TERMINAL_SESSION_STATUSES } from './shared.js';
import { getSession, listActivities } from './api.js';
import { getSecret } from '../secrets.js';
import { fetchJules } from './shared.js';

export async function recordSession({ julesSessionName, agentId, projectId, branch, prompt, title, julesUrl, agentTaskId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO jules_sessions (jules_session_name, agent_id, project_id, branch, prompt, title, jules_url, agent_task_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED')
     ON CONFLICT (jules_session_name) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [julesSessionName, agentId, projectId, branch || null, prompt, title || null, julesUrl || null, agentTaskId]
  );
  await syncAgentTaskFromJulesSession(rows[0]);
  return rows[0];
}

export async function updateSessionStatus(julesSessionName, patch) {
  const fields = [];
  const values = [];
  let pi = 1;
  for (const [key, val] of Object.entries(patch)) {
    if (['status', 'pr_number', 'pr_url', 'last_polled_at', 'agent_task_id', 'pr_state', 'review_state', 'review_author', 'review_submitted_at', 'pr_merged_at'].includes(key)) {
      fields.push(`${key} = $${pi++}`);
      values.push(val);
    }
  }
  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()');
  values.push(julesSessionName);
  const { rows } = await pool.query(
    `UPDATE jules_sessions SET ${fields.join(', ')} WHERE jules_session_name = $${pi} RETURNING *`,
    values
  );
  return rows[0];
}

export async function getSessionsForProject(projectId, { activeOnly = false } = {}) {
  const sql = activeOnly
    ? `SELECT * FROM jules_sessions WHERE project_id = $1 AND status IN ('QUEUED','PLANNING','IN_PROGRESS','AWAITING_PLAN_APPROVAL','AWAITING_USER_FEEDBACK') ORDER BY created_at DESC`
    : `SELECT * FROM jules_sessions WHERE project_id = $1 ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, [projectId]);
  return rows;
}

export async function getJulesSessions({ activeOnly = true, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const activeSql = activeOnly
    ? `WHERE js.status IN ('QUEUED','PLANNING','IN_PROGRESS','AWAITING_PLAN_APPROVAL','AWAITING_USER_FEEDBACK')
        OR (js.pr_number IS NOT NULL AND COALESCE(js.pr_state, 'open') <> 'merged')`
    : '';
  const { rows } = await pool.query(
    `SELECT js.*, p.name AS project_name, p.repo AS project_repo, p.path AS project_path,
            at.status AS agent_task_status, at.result AS agent_task_result, at.error AS agent_task_error,
            at.completed_at AS agent_task_completed_at
     FROM jules_sessions js
     LEFT JOIN projects p ON p.id = js.project_id
     LEFT JOIN agent_tasks at ON at.id = js.agent_task_id
     ${activeSql}
     ORDER BY js.updated_at DESC, js.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

export async function getDbSession(julesSessionName) {
  const { rows } = await pool.query('SELECT * FROM jules_sessions WHERE jules_session_name = $1', [julesSessionName]);
  return rows[0] || null;
}

export async function getLiveSessionForAgentTask(agentTaskId) {
  if (!agentTaskId) return null;
  const { rows } = await pool.query(
    `SELECT *
     FROM jules_sessions
     WHERE agent_task_id = $1
       AND COALESCE(status, '') <> ALL($2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [agentTaskId, TERMINAL_SESSION_STATUSES]
  );
  return rows[0] || null;
}

export async function findRecentMatchingSession({ agentId, projectId, branch, prompt, withinMinutes = 30 }) {
  const { rows } = await pool.query(
    `SELECT *
     FROM jules_sessions
     WHERE agent_id = $1
       AND project_id = $2
       AND COALESCE(branch, '') = COALESCE($3, '')
       AND prompt = $4
       AND (
         status = ANY($5)
         OR created_at > NOW() - ($6::int * INTERVAL '1 minute')
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [agentId, projectId, branch || null, prompt, ACTIVE_SESSION_STATUSES, withinMinutes]
  );
  return rows[0] || null;
}

export async function refreshSession(julesSessionName) {
  const remote = await getSession(julesSessionName);
  const status = remote?.state || remote?.status || 'UNKNOWN';

  let prUrl = null;
  let prNumber = null;
  try {
    const acts = await listActivities(julesSessionName);
    const list = acts?.activities || [];
    for (const a of list) {
      const blob = JSON.stringify(a);
      const m = blob.match(/https:\/\/github\.com\/[^\s"]+\/pull\/(\d+)/);
      if (m) {
        prUrl = m[0];
        prNumber = parseInt(m[1], 10);
        break;
      }
    }
  } catch {}

  const patch = { status, last_polled_at: new Date().toISOString() };
  if (prUrl) { patch.pr_url = prUrl; patch.pr_number = prNumber; }

  const updated = await updateSessionStatus(julesSessionName, patch);
  await syncAgentTaskFromJulesSession(updated);
  return { remote, db: updated };
}

export async function syncAllJulesSessions() {
  const key = getSecret('JULES_API_KEY');
  if (!key) return [];

  const res = await fetchJules('/sessions');
  const remoteSessions = res?.sessions || [];
  if (remoteSessions.length === 0) return [];

  const { rows: projects } = await pool.query('SELECT * FROM projects');

  const synced = [];
  for (const remote of remoteSessions) {
    const julesSessionName = remote.name;
    const status = remote.state || remote.status || 'UNKNOWN';
    const prompt = remote.prompt || '';
    const title = remote.title || prompt.slice(0, 80) || 'Untitled Jules task';
    const julesUrl = remote.url || null;

    const source = remote.sourceContext?.source || '';
    const startingBranch = remote.sourceContext?.githubRepoContext?.startingBranch || null;
    const project = projects.find(p => p.repo && source.toLowerCase().includes(p.repo.toLowerCase()));
    const projectId = project ? project.id : null;

    let prUrl = null;
    let prNumber = null;
    if (remote.outputs && Array.isArray(remote.outputs)) {
      for (const out of remote.outputs) {
        if (out.pullRequest?.url) {
          prUrl = out.pullRequest.url;
          const m = prUrl.match(/\/pull\/(\d+)/);
          if (m) prNumber = parseInt(m[1], 10);
          break;
        }
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO jules_sessions (jules_session_name, project_id, branch, prompt, title, jules_url, status, pr_url, pr_number, last_polled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (jules_session_name) DO UPDATE SET
         status = EXCLUDED.status,
         pr_url = COALESCE(EXCLUDED.pr_url, jules_sessions.pr_url),
         pr_number = COALESCE(EXCLUDED.pr_number, jules_sessions.pr_number),
         last_polled_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [julesSessionName, projectId, startingBranch, prompt, title, julesUrl, status, prUrl, prNumber]
    );

    const sessionRow = rows[0];
    if (sessionRow) {
      await syncAgentTaskFromJulesSession(sessionRow);
      synced.push(sessionRow);
    }
  }

  return synced;
}
