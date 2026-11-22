// Coding workers' branches and pull requests in the database
// (docker/101-worker-pr.sql): which branch was made for which job, why none
// could be made, and the pull request opened from it.
//
// A job is { kind, id, part }: 'plan_job' with the plan's id and the job's
// number in it (a family agent's coding job from Censai, or a Kraken fix arm),
// or 'sub_agent' with the worker sub-agent's id.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/101-worker-pr.sql');
const COLUMNS = 'id, workspace_id, agent_id, job_kind, job_id, job_part, repo, branch, blocked_reason, pr_number, pr_url, pr_head_sha, pr_opened_at';

export async function ensureWorkerPrSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
}

// The table is made the first time it is needed on each database, so an
// install from before this file gets it without a step at start.
const made = new WeakMap();
function tableReady(db) {
  if (!made.has(db)) {
    made.set(db, ensureWorkerPrSchema(db).catch((error) => {
      made.delete(db);
      throw error;
    }));
  }
  return made.get(db);
}

const lower = (value) => String(value || '').trim().toLowerCase();
const jobKey = (job, repo) => [job.kind, String(job.id), Number(job.part) || 0, lower(repo)];

/**
 * The coding jobs `agentId` has in hand on this board right now: jobs of kind
 * 'code' in a running plan of Censai's, given to this agent, being worked on
 * (or, with checking: true, being checked). Only the plans of the person the
 * call is made for (userId); no person, no job. planProject: only plans for
 * that project. planId and part: only that plan, and that job in it.
 */
export async function codingJobsFor(db, { workspaceId, userId, agentId, planProject = null, planId = null, part = null, checking = false }) {
  const person = Number(userId);
  if (!workspaceId || !lower(agentId) || !Number.isInteger(person) || person <= 0) return [];
  const { rows } = await db.query(
    "SELECT id, project, jobs FROM censai_plans WHERE workspace_id = $1 AND user_id = $2 AND status = 'running' ORDER BY created_at",
    [workspaceId, person],
  );
  const states = checking ? ['working', 'checking'] : ['working'];
  const found = [];
  for (const row of rows) {
    if (planProject && String(row.project || '').trim() !== String(planProject).trim()) continue;
    if (planId && String(row.id) !== String(planId)) continue;
    for (const job of Array.isArray(row.jobs) ? row.jobs : []) {
      if (planId && part !== null && part !== undefined && Number(job?.n) !== Number(part)) continue;
      if (lower(job?.agentId) !== lower(agentId) || job.kind !== 'code' || !states.includes(job.status)) continue;
      found.push({ kind: 'plan_job', id: row.id, part: Number(job.n) || 0 });
    }
  }
  return found;
}

export async function findWorkerBranch(db, job, repo) {
  await tableReady(db);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM worker_job_branches WHERE job_kind = $1 AND job_id = $2 AND job_part = $3 AND repo = $4`,
    jobKey(job, repo),
  );
  return rows[0] || null;
}

/**
 * Note the branch made for a job, or (branch null) why none could be made. A
 * branch already noted for the job is never taken away by a later try that
 * failed: it stays, and no reason is kept beside a branch that exists.
 */
export async function saveWorkerBranch(db, { workspaceId, agentId, job, repo, branch = null, blockedReason = null }) {
  await tableReady(db);
  const { rows } = await db.query(
    `INSERT INTO worker_job_branches (workspace_id, agent_id, job_kind, job_id, job_part, repo, branch, blocked_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (job_kind, job_id, job_part, repo) DO UPDATE
       SET branch = COALESCE(EXCLUDED.branch, worker_job_branches.branch),
           blocked_reason = CASE WHEN COALESCE(EXCLUDED.branch, worker_job_branches.branch) IS NULL
                                 THEN EXCLUDED.blocked_reason ELSE NULL END,
           updated_at = NOW()
     RETURNING ${COLUMNS}`,
    [workspaceId, lower(agentId), ...jobKey(job, repo), branch, blockedReason ? String(blockedReason).slice(0, 500) : null],
  );
  return rows[0] || null;
}

/** Note the pull request opened from a job's branch: its number, link, branch and head commit. */
export async function saveWorkerPr(db, { workspaceId, agentId, job, repo, branch, pr }) {
  await tableReady(db);
  const { rows } = await db.query(
    `INSERT INTO worker_job_branches
       (workspace_id, agent_id, job_kind, job_id, job_part, repo, branch, pr_number, pr_url, pr_head_sha, pr_opened_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (job_kind, job_id, job_part, repo) DO UPDATE
       SET branch = EXCLUDED.branch, blocked_reason = NULL, pr_number = EXCLUDED.pr_number, pr_url = EXCLUDED.pr_url,
           pr_head_sha = EXCLUDED.pr_head_sha,
           pr_opened_at = CASE WHEN worker_job_branches.pr_number IS NOT DISTINCT FROM EXCLUDED.pr_number
                               THEN COALESCE(worker_job_branches.pr_opened_at, NOW()) ELSE NOW() END,
           updated_at = NOW()
     RETURNING ${COLUMNS}`,
    [workspaceId, lower(agentId), ...jobKey(job, repo), branch, pr.number, pr.url, pr.headSha || null],
  );
  return rows[0] || null;
}

/** Everything noted for one plan: each job's branch, why it was blocked, its pull request. For the plan's own screen and for Kraken. */
export async function workerBranchesOfPlan(db, planId) {
  await tableReady(db);
  const { rows } = await db.query(
    "SELECT " + COLUMNS + " FROM worker_job_branches WHERE job_kind = 'plan_job' AND job_id = $1 ORDER BY job_part, id",
    [String(planId)],
  );
  return rows;
}

export const __test__ = { SQL_PATH };
