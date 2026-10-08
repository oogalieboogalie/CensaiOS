BEGIN;

CREATE TABLE IF NOT EXISTS hub_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(64) UNIQUE NOT NULL,
  email_encrypted TEXT NOT NULL,
  email_hash VARCHAR(64) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  mfa_secret TEXT,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  email_confirm_token VARCHAR(64),
  email_confirm_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_accounts_username ON hub_accounts (username);
CREATE INDEX IF NOT EXISTS idx_hub_accounts_email_hash ON hub_accounts (email_hash);

COMMIT;