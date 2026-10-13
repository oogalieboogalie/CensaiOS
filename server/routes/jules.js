import express from 'express';
import { dbReady } from '../dbState.js';
import pool from '../db.js';
import { getJulesSessions, refreshSession, syncAllJulesSessions } from '../jules.js';
import { fetchGitHubPullRequestFiles, fetchGitHubPullRequestState, syncAgentTaskFromJulesSession } from '../jules-task-sync/index.js';
import { getSecret } from '../secrets.js';
import { getProject } from '../workspaces.js';
import { readJulesQueue } from '../julesQueue.js';

export const julesRouter = express.Router();

const ACTIVE_STATUSES = new Set([
  'QUEUED',
  'PLANNING',
  'IN_PROGRESS',
  'AWAITING_PLAN_APPROVAL',
  'AWAITING_USER_FEEDBACK',
]);

function present(row) {
  return {
    id: row.id,
    session: row.jules_session_name,
    title: row.title || String(row.prompt || '').slice(0, 80) || 'Untitled Jules task',
    status: row.status || 'UNKNOWN',
    branch: row.branch || null,
    projectId: row.project_id || null,
    projectName: row.project_name || row.project_repo || row.project_path || row.project_id || null,
    prNumber: row.pr_number || null,
    prUrl: row.pr_url || null,
    prState: row.pr_state || null,
    reviewState: row.review_state || null,
    reviewAuthor: row.review_author || null,
    reviewSubmittedAt: row.review_submitted_at || null,
    mergedAt: row.pr_merged_at || null,
    julesUrl: row.jules_url || null,
    agentTaskId: row.agent_task_id || null,
    agentTaskStatus: row.agent_task_status || null,
    agentTaskResult: row.agent_task_result || null,
    agentTaskError: row.agent_task_error || null,
    agentTaskCompletedAt: row.agent_task_completed_at || null,
    lastPolledAt: row.last_polled_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

julesRouter.get('/jules/queue', async (req, res) => {
  try {
    res.json(await readJulesQueue(process.env.JULES_QUEUE_PATH));
  } catch (err) {
    const status = err.code === 'ENOENT' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

julesRouter.get('/jules/sessions', async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: 'Database unavailable' });

  const activeOnly = req.query.includeCompleted !== 'true';
  const shouldRefresh = req.query.refresh === 'true';

  try {
    if (shouldRefresh && getSecret('JULES_API_KEY')) {
      try {
        await syncAllJulesSessions();
      } catch (e) {
        console.error('Failed to sync all Jules sessions:', e);
      }
    }

    let sessions = await getJulesSessions({ activeOnly });

    if (shouldRefresh && getSecret('JULES_API_KEY')) {
      const refreshed = [];
      const refreshable = sessions.filter(s =>
        ACTIVE_STATUSES.has(s.status) || (s.pr_number && (s.pr_state || 'open') !== 'merged')
      );
      for (const session of refreshable.slice(0, 20)) {
        try {
          const { db } = await refreshSession(session.jules_session_name);
          let synced = db || session;
          const githubToken = getSecret('GITHUB_TOKEN');
          if (synced.pr_number && githubToken) {
            const project = await getProject(synced.project_id);
            const prState = await fetchGitHubPullRequestState({
              repo: project?.repo,
              prNumber: synced.pr_number,
              token: githubToken,
            });
            if (prState) {
              const changedFiles = await fetchGitHubPullRequestFiles({
                repo: project?.repo,
                prNumber: synced.pr_number,
                token: githubToken,
              });
              const patched = await pool.query(
                `UPDATE jules_sessions
                 SET pr_state = $1,
                     review_state = $2,
                     review_author = $3,
                     review_submitted_at = $4,
                     pr_merged_at = $5,
                     updated_at = NOW()
                 WHERE jules_session_name = $6
                 RETURNING *`,
                [
                  prState.prState,
                  prState.reviewState,
                  prState.reviewAuthor,
                  prState.reviewSubmittedAt,
                  prState.mergedAt,
                  synced.jules_session_name,
                ]
              );
              synced = patched.rows[0] || synced;
              await syncAgentTaskFromJulesSession(synced, { changedFiles });
            }
          }
          refreshed.push(synced);
        } catch {
          refreshed.push(session);
        }
      }
      if (refreshed.length > 0) {
        sessions = await getJulesSessions({ activeOnly });
      }
    }

    res.json({
      sessions: sessions.map(present),
      refreshed: shouldRefresh,
      canRefreshRemote: Boolean(getSecret('JULES_API_KEY')),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
