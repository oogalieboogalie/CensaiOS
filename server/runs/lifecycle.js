// ═══════════════════════════════════════════════════════════════════
//  EXECUTION LEDGER — LIFECYCLE API
//  P1-4 skeleton. 5 functions: createRun, startRun, completeRun,
//  failRun, attachArtifactToRun. Each takes `db = pool` as the first
//  parameter so it is testable with a mock db (see tests/runsLifecycle.test.js).
//
//  This module is the public surface for the durable-runs foundation.
//  It is NOT yet wired into server/task-worker/* — that integration
//  is a separate follow-up brief.
//
//  Brief: .team/handoffs/2026-06-24-p1-execution-ledger-skeleton.md
// ═══════════════════════════════════════════════════════════════════

import pool from '../db.js';
import {
  createRunCause,
  loadRunCausalChain,
  normalizeRunCause,
  withRunTransaction,
} from './causality.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

function normalizeError(error) {
  if (error == null) return { message: 'unknown error' };
  if (typeof error === 'string') return { message: error };
  if (error instanceof Error) {
    return {
      message: error.message || 'unknown error',
      name: error.name,
      stack: error.stack,
    };
  }
  // Already an object — pass through, but always have a message field.
  const message = error.message || error.error || JSON.stringify(error);
  return { ...error, message };
}

export async function createRun({
  db = pool,
  tenantId = null,
  workspaceId = null,
  actor = null,
  principal = null,
  runtimeMode = 'sync',
  metadata = {},
  cause,
} = {}) {
  const normalizedCause = normalizeRunCause(cause);
  return withRunTransaction(db, async (transactionDb) => {
    const { rows } = await transactionDb.query(
      `INSERT INTO runs (tenant_id, workspace_id, actor, principal, runtime_mode, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING id`,
      [tenantId, workspaceId, actor, principal, runtimeMode, metadata]
    );
    const runId = rows[0].id;
    await createRunCause({ db: transactionDb, runId, cause: normalizedCause });
    return { runId };
  });
}

export async function startRun({ db = pool, runId } = {}) {
  await db.query(
    `UPDATE runs
        SET status = 'running',
            started_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [runId]
  );
}

export async function completeRun({ db = pool, runId, metadata } = {}) {
  if (metadata && Object.keys(metadata).length > 0) {
    await db.query(
      `UPDATE runs
          SET status = 'succeeded',
              completed_at = NOW(),
              updated_at = NOW(),
              metadata = metadata || $2::jsonb
        WHERE id = $1`,
      [runId, metadata]
    );
  } else {
    await db.query(
      `UPDATE runs
          SET status = 'succeeded',
              completed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [runId]
    );
  }
}

export async function failRun({ db = pool, runId, error } = {}) {
  const errorPayload = normalizeError(error);
  // Persist the error to a run_step so future reads can reconstruct what
  // went wrong without having to scrape the runs table. Sequence 0 makes
  // this the canonical "system.failure" step at the head of the run.
  await db.query(
    `INSERT INTO run_steps (run_id, sequence, name, status, completed_at, error)
     VALUES ($1, 0, 'system.failure', 'failed', NOW(), $2::jsonb)`,
    [runId, errorPayload]
  );
  await db.query(
    `UPDATE runs
        SET status = 'failed',
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [runId]
  );
}

export async function recordRunAction({
  db = pool,
  runId,
  sequence,
  name,
  status = 'succeeded',
  metadata = {},
} = {}) {
  await db.query(
    `INSERT INTO run_steps
       (run_id, sequence, name, status, started_at, completed_at, metadata)
     VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)`,
    [runId, sequence, name, status, metadata]
  );
}

export async function attachArtifactToRun({
  db = pool,
  runId,
  stepId = null,
  kind,
  ref,
  metadata = {},
} = {}) {
  const { rows } = await db.query(
    `INSERT INTO run_artifacts (run_id, step_id, kind, ref, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [runId, stepId, kind, ref, metadata]
  );
  return { artifactId: rows[0].id };
}

export { TERMINAL_STATUSES, loadRunCausalChain };
