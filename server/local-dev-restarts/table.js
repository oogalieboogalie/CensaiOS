import pool from '../db.js';

let localDevRestartsReady = null;

export async function ensureLocalDevRestartsTable() {
  if (!localDevRestartsReady) {
    localDevRestartsReady = (async () => {
      await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS local_dev_restarts (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          initiated_by          TEXT NOT NULL,
          reason                TEXT,
          window_id             TEXT,
          status                TEXT NOT NULL DEFAULT 'queued'
            CHECK (status IN ('queued', 'restarting', 'completed', 'failed')),
          notice_seconds        INTEGER NOT NULL DEFAULT 5,
          requested_at          TIMESTAMPTZ DEFAULT NOW(),
          restart_started_at    TIMESTAMPTZ,
          restart_completed_at  TIMESTAMPTZ,
          completion_message    TEXT,
          delivered_at          TIMESTAMPTZ,
          error                 TEXT
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_local_dev_restarts_window
        ON local_dev_restarts(window_id, delivered_at, restart_completed_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_local_dev_restarts_status
        ON local_dev_restarts(status, requested_at DESC)
      `);
    })().catch(err => {
      localDevRestartsReady = null;
      throw err;
    });
  }
  return localDevRestartsReady;
}
