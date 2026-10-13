-- Local mirror of the OSV vulnerability database (https://osv.dev).
-- Synced daily by server/osvMirror/worker.js; the dependency scanner reads it
-- before falling back to the live OSV API.
BEGIN;

CREATE TABLE IF NOT EXISTS osv_vulnerabilities (
  id TEXT PRIMARY KEY,
  modified TIMESTAMPTZ,
  withdrawn TIMESTAMPTZ,
  summary TEXT,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS osv_affected_packages (
  ecosystem TEXT NOT NULL,
  package TEXT NOT NULL,
  vuln_id TEXT NOT NULL REFERENCES osv_vulnerabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (ecosystem, package, vuln_id)
);

CREATE INDEX IF NOT EXISTS idx_osv_affected_vuln ON osv_affected_packages (vuln_id);

CREATE TABLE IF NOT EXISTS osv_sync_state (
  ecosystem TEXT PRIMARY KEY,
  last_modified TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  record_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
