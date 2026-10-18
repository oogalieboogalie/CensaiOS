-- ═══════════════════════════════════════════════════════════════════
--  API BAR — one front door for censaiOS's APIs. A bar key is the one
--  key a script, another app or an agent holds; it opens only the
--  branches its owner picked, and "look only" keys cannot spend or
--  change anything. Only the key's SHA-256 is stored. Every knock is
--  logged (who, which branch and action, how it went), never the notes
--  themselves. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS api_bar_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  branches      TEXT[] NOT NULL DEFAULT '{}',
  look_only     BOOLEAN NOT NULL DEFAULT TRUE,
  token_hash    TEXT NOT NULL UNIQUE,
  token_hint    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_bar_keys_user ON api_bar_keys (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_bar_calls (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_id        UUID REFERENCES api_bar_keys(id) ON DELETE SET NULL,
  branch        TEXT NOT NULL,
  action        TEXT NOT NULL,
  method        TEXT NOT NULL,
  status        INTEGER NOT NULL,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  note_in_chars INTEGER NOT NULL DEFAULT 0,
  note_out_chars INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_bar_calls_user ON api_bar_calls (user_id, created_at DESC);

COMMIT;
