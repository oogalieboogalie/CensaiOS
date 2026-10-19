-- Auction Watcher: saved searches on shopgoodwill.com and eBay that censaiOS
-- checks on a timer, and the listings each one turned up. Each person's own;
-- nothing here is shared with the rest of a board.

CREATE TABLE IF NOT EXISTS auction_watches (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site             TEXT NOT NULL CHECK (site IN ('shopgoodwill', 'ebay')),
  query            TEXT NOT NULL CHECK (length(query) BETWEEN 1 AND 120),
  max_price        NUMERIC(10, 2),
  must_words       TEXT[] NOT NULL DEFAULT '{}',
  not_words        TEXT[] NOT NULL DEFAULT '{}',
  interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (interval_minutes BETWEEN 15 AND 1440),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  status_note      TEXT,
  last_checked_at  TIMESTAMPTZ,
  -- Set by the first check that worked; what it found sends no notices.
  baseline_done    BOOLEAN NOT NULL DEFAULT FALSE,
  next_check_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auction_watches ADD COLUMN IF NOT EXISTS baseline_done BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS auction_watches_due ON auction_watches (next_check_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS auction_watches_user ON auction_watches (user_id);

-- `notify` is false for what the first check that worked finds, so a new watch does
-- not fill the Inbox with everything already listed.
CREATE TABLE IF NOT EXISTS auction_matches (
  id         SERIAL PRIMARY KEY,
  watch_id   INTEGER NOT NULL REFERENCES auction_watches(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  price      NUMERIC(10, 2),
  currency   TEXT NOT NULL DEFAULT 'USD',
  ends_at    TIMESTAMPTZ,
  image_url  TEXT,
  url        TEXT NOT NULL,
  bids       INTEGER,
  buy_now    NUMERIC(10, 2),
  red_flags  TEXT[] NOT NULL DEFAULT '{}',
  insights   JSONB,
  last_sold  JSONB,
  notify     BOOLEAN NOT NULL DEFAULT TRUE,
  found_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at    TIMESTAMPTZ,
  UNIQUE (watch_id, listing_id)
);

CREATE INDEX IF NOT EXISTS auction_matches_fresh ON auction_matches (user_id, found_at) WHERE seen_at IS NULL AND notify;

-- The listing's own description is read once (details_read_at) so lock
-- wording there raises the red flag too; a listing whose description has a
-- "must not mention" word is kept as skipped, never shown or announced.
ALTER TABLE auction_matches ADD COLUMN IF NOT EXISTS details_read_at TIMESTAMPTZ;
ALTER TABLE auction_matches ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT FALSE;
