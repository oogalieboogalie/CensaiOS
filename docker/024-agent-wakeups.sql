CREATE TABLE IF NOT EXISTS agent_wakeups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE REFERENCES agent_messages(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'waiting_children', 'completed', 'failed')),
  phase TEXT NOT NULL DEFAULT 'initial'
    CHECK (phase IN ('initial', 'review')),
  response TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_wakeups_queue
  ON agent_wakeups(status, created_at);

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS wake_id UUID REFERENCES agent_wakeups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_wake ON agent_tasks(wake_id);
