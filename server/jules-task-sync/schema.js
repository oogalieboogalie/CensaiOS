import pool from '../db.js';

export async function ensureJulesTaskSyncSchema() {
  await pool.query(`
    ALTER TABLE jules_sessions
      ADD COLUMN IF NOT EXISTS agent_task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS pr_state TEXT,
      ADD COLUMN IF NOT EXISTS review_state TEXT,
      ADD COLUMN IF NOT EXISTS review_author TEXT,
      ADD COLUMN IF NOT EXISTS review_submitted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS pr_merged_at TIMESTAMPTZ
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jules_agent_task ON jules_sessions(agent_task_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jules_pr_state ON jules_sessions(pr_state)');
  await pool.query(`
    ALTER TABLE agent_tasks
      ADD COLUMN IF NOT EXISTS completion_receipt JSONB
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_tasks_receipts ON agent_tasks(completed_at DESC) WHERE completion_receipt IS NOT NULL');
}
