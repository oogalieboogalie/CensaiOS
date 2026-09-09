import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { getSecret } from '../secrets.js';
import { refreshSession as refreshJulesSession } from '../jules.js';
import { fetchGitHubPullRequestFiles, fetchGitHubPullRequestState, syncAgentTaskFromJulesSession } from '../jules-task-sync/index.js';
import { getProject, logProjectActivity } from '../workspaces.js';

const seenReviewIds = new Map();
let watcherBusy = false;

export async function tickJulesWatcher() {
  if (watcherBusy || !dbReady() || !getSecret('JULES_API_KEY')) return;
  watcherBusy = true;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM jules_sessions
       WHERE status IN ('QUEUED','PLANNING','IN_PROGRESS','AWAITING_USER_FEEDBACK','AWAITING_PLAN_APPROVAL')
          OR (pr_number IS NOT NULL AND COALESCE(pr_state, 'open') <> 'merged')
       ORDER BY updated_at ASC
       LIMIT 10`
    );
    for (const s of rows) {
      try {
        const prev = { status: s.status, pr_url: s.pr_url };
        const { db } = await refreshJulesSession(s.jules_session_name);
        if (!db) continue;

        if (db.status && db.status !== prev.status) {
          console.log(`[jules-watcher] ${s.jules_session_name}: ${prev.status} → ${db.status}`);
          await logProjectActivity(s.project_id, s.agent_id, 'jules_status', `${s.title || 'session'}: ${db.status}`);
        }
        if (db.pr_url && !prev.pr_url) {
          console.log(`[jules-watcher] PR opened: ${db.pr_url}`);
          await logProjectActivity(s.project_id, s.agent_id, 'jules_pr_opened', db.pr_url);
        }

        if (db.pr_url && db.pr_number) {
          const project = await getProject(s.project_id);
          const githubToken = getSecret('GITHUB_TOKEN');
          if (project?.repo && githubToken) {
            const prState = await fetchGitHubPullRequestState({
              repo: project.repo,
              prNumber: db.pr_number,
              token: githubToken,
            });
            if (prState) {
              const changedFiles = await fetchGitHubPullRequestFiles({
                repo: project.repo,
                prNumber: db.pr_number,
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
                  db.jules_session_name,
                ]
              );
              const syncedSession = patched.rows[0] || db;
              await syncAgentTaskFromJulesSession(syncedSession, { changedFiles });
              if (prState.prState === 'merged' && db.pr_state !== 'merged') {
                await logProjectActivity(s.project_id, s.agent_id, 'jules_pr_merged', db.pr_url);
              }
              if (prState.reviewState && prState.reviewState !== db.review_state) {
                await logProjectActivity(
                  s.project_id,
                  s.agent_id,
                  'jules_pr_review_state',
                  `${prState.reviewAuthor || 'reviewer'} on PR #${db.pr_number}: ${prState.reviewState}`
                );
              }
            }

            const res = await fetch(
              `https://api.github.com/repos/${project.repo}/pulls/${db.pr_number}/reviews`,
              { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-Agent' } }
            );
            if (res.ok) {
              const reviews = await res.json();
              if (Array.isArray(reviews)) {
                const seen = seenReviewIds.get(s.jules_session_name) || new Set();
                const initialSync = !seenReviewIds.has(s.jules_session_name);
                for (const r of reviews) {
                  if (seen.has(r.id)) continue;
                  seen.add(r.id);
                  if (!initialSync) {
                    await logProjectActivity(
                      s.project_id,
                      s.agent_id,
                      'pr_review',
                      `${r.user?.login} on PR #${db.pr_number}: ${r.state}`
                    );
                  }
                }
                seenReviewIds.set(s.jules_session_name, seen);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[jules-watcher] ${s.jules_session_name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn('[jules-watcher] tick failed:', e.message);
  } finally {
    watcherBusy = false;
  }
}
