-- Which docker/*.sql setup files this database has. One row per file:
-- "applied" when censaiOS ran it on this database, "found already there"
-- when the ledger arrived on an existing install and recorded what it found
-- instead of running anything. Written by server/boot/setupLedger.js.
CREATE TABLE IF NOT EXISTS censai_setup_ledger (
  file TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  how TEXT NOT NULL CHECK (how IN ('applied', 'found already there')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
