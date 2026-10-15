// server/workflows/store.js
//
// The two workflow tables (docker/060-board-workflows.sql): run records and
// the workflows that start on their own.

export async function insertRun(db, run) {
  await db.query(
    `INSERT INTO board_workflow_runs (id, workspace_id, window_id, started_by, trigger, status, graph, results)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [run.id, run.workspaceId, run.windowId, run.startedBy ?? null, run.trigger, run.status,
      JSON.stringify(run.graph), JSON.stringify(run.results || {})],
  );
}

export async function updateRun(db, id, { status, results, error = null, finished = false }) {
  await db.query(
    `UPDATE board_workflow_runs
        SET status = $2, results = COALESCE($3::jsonb, results), error = $4, finished_at = CASE WHEN $5 THEN NOW() ELSE finished_at END
      WHERE id = $1`,
    [id, status, results === undefined ? null : JSON.stringify(results), error, finished],
  );
}

export async function getRun(db, workspaceId, id) {
  const { rows } = await db.query(
    'SELECT * FROM board_workflow_runs WHERE workspace_id = $1 AND id = $2', [workspaceId, id],
  );
  return rows[0] || null;
}

export async function listRuns(db, workspaceId, windowId, limit = 20) {
  const { rows } = await db.query(
    `SELECT id, trigger, status, started_by, error, started_at, finished_at
       FROM board_workflow_runs WHERE workspace_id = $1 AND window_id = $2
      ORDER BY started_at DESC LIMIT $3`,
    [workspaceId, windowId, limit],
  );
  return rows;
}

/** Turn a workflow's own start on (schedule or board event) or off (mode manual). */
export async function saveTrigger(db, { workspaceId, windowId, mode, everyMinutes = null, windowKind = null, armedBy, seenWindowIds = [] }) {
  if (mode !== 'schedule' && mode !== 'board') {
    await db.query('DELETE FROM board_workflow_triggers WHERE workspace_id = $1 AND window_id = $2', [workspaceId, windowId]);
    return null;
  }
  const { rows } = await db.query(
    `INSERT INTO board_workflow_triggers (workspace_id, window_id, mode, every_minutes, window_kind, armed_by, next_run_at, seen_window_ids)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $3 = 'schedule' THEN NOW() + make_interval(mins => $4) ELSE NULL END, $7)
     ON CONFLICT (workspace_id, window_id) DO UPDATE
       SET mode = EXCLUDED.mode, every_minutes = EXCLUDED.every_minutes, window_kind = EXCLUDED.window_kind,
           armed_by = EXCLUDED.armed_by, next_run_at = EXCLUDED.next_run_at, seen_window_ids = EXCLUDED.seen_window_ids
     RETURNING *`,
    [workspaceId, windowId, mode, mode === 'schedule' ? everyMinutes : null, mode === 'board' ? windowKind : null,
      armedBy, JSON.stringify(seenWindowIds)],
  );
  return rows[0];
}

export async function getTrigger(db, workspaceId, windowId) {
  const { rows } = await db.query(
    'SELECT * FROM board_workflow_triggers WHERE workspace_id = $1 AND window_id = $2', [workspaceId, windowId],
  );
  return rows[0] || null;
}

export async function listArmedTriggers(db) {
  const { rows } = await db.query(
    `SELECT t.* FROM board_workflow_triggers t
       JOIN workspace_members m ON m.workspace_id = t.workspace_id AND m.user_id = t.armed_by
      WHERE m.role IN ('owner', 'admin', 'member')
        AND (t.mode = 'board' OR t.next_run_at <= NOW())`,
  );
  return rows;
}

export async function markScheduleRan(db, row) {
  await db.query(
    `UPDATE board_workflow_triggers
        SET last_run_at = NOW(), next_run_at = NOW() + make_interval(mins => every_minutes)
      WHERE workspace_id = $1 AND window_id = $2`,
    [row.workspace_id, row.window_id],
  );
}

export async function saveSeenWindows(db, row, ids, ran) {
  await db.query(
    `UPDATE board_workflow_triggers
        SET seen_window_ids = $3, last_run_at = CASE WHEN $4 THEN NOW() ELSE last_run_at END
      WHERE workspace_id = $1 AND window_id = $2`,
    [row.workspace_id, row.window_id, JSON.stringify(ids), ran],
  );
}

export async function dropTrigger(db, workspaceId, windowId) {
  await db.query('DELETE FROM board_workflow_triggers WHERE workspace_id = $1 AND window_id = $2', [workspaceId, windowId]);
}
