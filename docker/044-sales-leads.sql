BEGIN;

CREATE TABLE IF NOT EXISTS sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  team TEXT,
  brokerage TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  facebook TEXT,
  instagram TEXT,
  linkedin TEXT,
  buying_signals TEXT[] NOT NULL DEFAULT '{}',
  icp_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'new',
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_workspace
  ON sales_leads (workspace_id, status, icp_score DESC);

CREATE INDEX IF NOT EXISTS idx_sales_leads_contact
  ON sales_leads (workspace_id, email, phone);

COMMIT;
