-- ═══════════════════════════════════════════════════════════════════
--  AGENT NETWORK RECEIPTS + RELAY GROUNDWORK
--  Part 6 of docs/architecture/ideas-catalog-and-frontier-architecture.md.
--
--  install_identity   one row per censaiOS install: its Ed25519 signing
--                     key. The install id is derived from the public key,
--                     so anyone can check a receipt or a relay pass
--                     without asking a server. The private key is stored
--                     encrypted with the install's vault secret.
--  agent_receipts     one signed receipt per help request, per side:
--                     who asked, who answered, which agent card, when,
--                     tokens and (when a price exists) money. Hashes of the
--                     question and answer only, never their text.
--                     counter_receipt keeps the other install's signed half.
--  Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS install_identity (
  id                     SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  install_id             TEXT NOT NULL,
  public_key             TEXT NOT NULL,
  private_key_encrypted  TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_receipts (
  id                UUID PRIMARY KEY,
  workspace_id      TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('asker', 'helper', 'both')),
  channel           TEXT NOT NULL CHECK (channel IN ('board', 'endpoint', 'relay')),
  request_ref       TEXT NOT NULL,
  help_request_id   UUID,
  card_id           TEXT,
  asker_label       TEXT,
  helper_label      TEXT,
  outcome           TEXT NOT NULL CHECK (outcome IN ('completed', 'failed')),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  tokens_in         INTEGER NOT NULL DEFAULT 0,
  tokens_out        INTEGER NOT NULL DEFAULT 0,
  price_cents       INTEGER,
  body              JSONB NOT NULL,
  signature         TEXT NOT NULL,
  counter_receipt   JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role, request_ref)
);

CREATE INDEX IF NOT EXISTS idx_agent_receipts_workspace
  ON agent_receipts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_receipts_help_request
  ON agent_receipts (help_request_id);

COMMIT;
