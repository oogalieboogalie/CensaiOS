-- Each person's own calendar: the events they add in the Calendar window, or
-- an agent adds for them, without Google. Only the person who owns an event
-- reads or changes it; nothing here is shared with the rest of a board.
-- Applied at start-up by server/ownCalendar/schema.js. Safe to run twice.

CREATE TABLE IF NOT EXISTS own_calendar_events (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  notes      TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS own_calendar_events_user_start ON own_calendar_events (user_id, starts_at);
