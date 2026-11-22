-- A coding worker's own branch on GitHub, and the pull request opened from it.
-- One row for each job in each repo: a job Censai handed to a family agent
-- (job_kind 'plan_job': job_id is the plan in censai_plans, job_part the job's
-- number in it; a Kraken Request's fix arm is such a plan) or a worker
-- sub-agent's work (job_kind 'sub_agent': job_id is the sub-agent).
--
-- A plan's own `jobs` are written whole by the plan runner each time it saves,
-- so a branch or a pull request noted there from a tool call would be written
-- over; they are kept here instead, next to the plan by its id.
--
-- branch is set only after the branch was made on GitHub and read back.
-- blocked_reason says in plain words why no branch could be made; the worker
-- changes nothing in that repo while it is set and branch is empty.

CREATE TABLE IF NOT EXISTS worker_job_branches (
  id             BIGSERIAL PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL,
  job_kind       TEXT NOT NULL CHECK (job_kind IN ('plan_job', 'sub_agent')),
  job_id         TEXT NOT NULL,
  job_part       INTEGER NOT NULL DEFAULT 0,
  repo           TEXT NOT NULL CHECK (length(repo) BETWEEN 3 AND 200),
  branch         TEXT CHECK (branch IS NULL OR length(branch) BETWEEN 1 AND 250),
  blocked_reason TEXT,
  pr_number      INTEGER,
  pr_url         TEXT,
  pr_head_sha    TEXT,
  pr_opened_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_kind, job_id, job_part, repo)
);

CREATE INDEX IF NOT EXISTS idx_worker_job_branches_agent
  ON worker_job_branches(workspace_id, agent_id, created_at DESC);
