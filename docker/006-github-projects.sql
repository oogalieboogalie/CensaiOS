-- ═══════════════════════════════════════════════════════════════════
--  GITHUB-FIRST PROJECTS
--  Sub-agents bound to a GitHub project get their own branch to work on.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE sub_agents
  ADD COLUMN IF NOT EXISTS github_branch TEXT;

-- `path` is now optional (only used for local/Tauri projects).
ALTER TABLE projects
  ALTER COLUMN path DROP NOT NULL;
