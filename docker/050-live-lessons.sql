-- ═══════════════════════════════════════════════════════════════════
--  LIVE LESSONS (spec 12) — an instructor teaches paying students live
--  A class hangs off the instructor's lesson board. Each student who
--  joins gets their own copy of the starter board (a workspace the
--  instructor owns) and an edit share link to it; the class's watch link
--  lets students follow the instructor's board. Access comes from an
--  invite code or a paid subscription (Stripe webhooks keep it current);
--  when a membership lapses the student's links are revoked, which
--  disconnects them. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS lesson_classes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  checkpoints          JSONB NOT NULL DEFAULT '[]'::jsonb,
  template             JSONB NOT NULL DEFAULT '{}'::jsonb,
  seat_limit           INTEGER NOT NULL DEFAULT 16 CHECK (seat_limit BETWEEN 1 AND 16),
  gate                 TEXT NOT NULL DEFAULT 'invite' CHECK (gate IN ('invite', 'stripe')),
  stripe_price_id      TEXT,
  agent_mode           TEXT NOT NULL DEFAULT 'own' CHECK (agent_mode IN ('own', 'instructor')),
  agent_budget_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (agent_budget_tokens >= 0),
  stream_url           TEXT,
  join_token_hash      TEXT NOT NULL UNIQUE,
  teacher_link_id      UUID REFERENCES share_links(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lesson_classes_workspace
  ON lesson_classes (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lesson_invite_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES lesson_classes(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL UNIQUE,
  max_uses    INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  uses        INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lesson_enrollments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            UUID NOT NULL REFERENCES lesson_classes(id) ON DELETE CASCADE,
  display_name        TEXT NOT NULL,
  color               TEXT,
  guest_id            TEXT NOT NULL,
  board_workspace_id  TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  board_link_id       UUID REFERENCES share_links(id) ON DELETE SET NULL,
  rejoin_token_hash   TEXT NOT NULL UNIQUE,
  access_source       TEXT NOT NULL CHECK (access_source IN ('invite', 'stripe')),
  access_ref          TEXT,
  checkout_id         TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'lapsed', 'removed')),
  hand_raised_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_enrollments_class
  ON lesson_enrollments (class_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lesson_enrollments_access
  ON lesson_enrollments (access_source, access_ref);

CREATE TABLE IF NOT EXISTS lesson_checkpoint_marks (
  enrollment_id  UUID NOT NULL REFERENCES lesson_enrollments(id) ON DELETE CASCADE,
  checkpoint_id  TEXT NOT NULL,
  done_at        TIMESTAMPTZ,
  approved_at    TIMESTAMPTZ,
  approved_by    TEXT,
  note           TEXT,
  PRIMARY KEY (enrollment_id, checkpoint_id)
);

-- Class watch links and students' board links are marked so "End show"
-- on a live stream leaves running classes alone.
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS class_id UUID;

COMMIT;
