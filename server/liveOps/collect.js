// server/liveOps/collect.js
//
// What the Live Operations window needs from the server that is not already
// on the board itself: recent workflow runs (with why a failed one failed),
// workflows that start on their own and when they run next, and the
// terminals open on this board (Alt-hotkey Claude Code, Codex and friends).
// Everything is scoped to one board, so every member sees the same list.

import { sessions } from '../terminal/shared.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RUNS = 40;
const MAX_TRIGGERS = 40;

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Workflow runs on this board from the last day, newest first. */
export async function recentWorkflowRuns(db, workspaceId, { now = Date.now() } = {}) {
  const { rows } = await db.query(
    `SELECT r.id, r.window_id, r.trigger, r.status, r.error, r.started_at, r.finished_at,
            COALESCE(u.name, split_part(u.email, '@', 1)) AS started_by_name
       FROM board_workflow_runs r
       LEFT JOIN users u ON u.id = r.started_by
      WHERE r.workspace_id = $1 AND (r.started_at > $2 OR r.status IN ('running', 'awaiting_review'))
      ORDER BY r.started_at DESC
      LIMIT $3`,
    [workspaceId, new Date(now - DAY_MS), MAX_RUNS],
  );
  return rows.map((row) => ({
    id: row.id,
    windowId: row.window_id,
    trigger: row.trigger,
    status: row.status,
    error: row.error || null,
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at),
    startedBy: row.started_by_name || null,
  }));
}

/** Workflows that start on their own, with their next scheduled run. */
export async function armedWorkflowTriggers(db, workspaceId) {
  const { rows } = await db.query(
    `SELECT window_id, mode, every_minutes, window_kind, next_run_at, last_run_at
       FROM board_workflow_triggers
      WHERE workspace_id = $1
      ORDER BY next_run_at ASC NULLS LAST
      LIMIT $2`,
    [workspaceId, MAX_TRIGGERS],
  );
  return rows.map((row) => ({
    windowId: row.window_id,
    mode: row.mode,
    everyMinutes: row.every_minutes ?? null,
    windowKind: row.window_kind || null,
    nextRunAt: iso(row.next_run_at),
    lastRunAt: iso(row.last_run_at),
  }));
}

/** Terminals open on this board right now. No output, only who and what. */
export function boardTerminals(workspaceId, { live = sessions } = {}) {
  const out = [];
  for (const session of live.values()) {
    if (!session?.alive || String(session.owner?.workspaceId || '') !== String(workspaceId)) continue;
    out.push({
      id: String(session.clientSessionId || session.id).slice(0, 96),
      cli: session.cli?.id || session.cli || null,
      label: session.cli ? session.backendLabel || 'Terminal' : 'Terminal',
      ownerUserId: session.owner?.userId ?? null,
      agentRun: Boolean(session.agentRun),
      busy: Boolean(session.busy),
      createdAt: iso(session.createdAt),
      lastActivityAt: iso(session.lastActivity),
      lastInputAt: iso(session.lastInputAt),
    });
  }
  return out.sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
}

/** Everything at once. A missing table or a slow query never hides the rest. */
export async function collectLiveOps(db, workspaceId, { now = Date.now(), live } = {}) {
  const errors = {};
  const safe = async (key, work, fallback) => {
    try {
      return await work();
    } catch (error) {
      errors[key] = error.message || 'Could not load';
      return fallback;
    }
  };
  const [workflowRuns, workflowTriggers] = await Promise.all([
    safe('workflowRuns', () => recentWorkflowRuns(db, workspaceId, { now }), []),
    safe('workflowTriggers', () => armedWorkflowTriggers(db, workspaceId), []),
  ]);
  const terminals = boardTerminals(workspaceId, live ? { live } : undefined);
  const ownerIds = [...new Set(terminals.map((t) => Number(t.ownerUserId)).filter(Number.isInteger))];
  if (ownerIds.length) {
    const names = await safe('terminals', async () => {
      const { rows } = await db.query(
        "SELECT id, COALESCE(name, split_part(email, '@', 1)) AS name FROM users WHERE id = ANY($1::int[])", [ownerIds],
      );
      return new Map(rows.map((row) => [String(row.id), row.name]));
    }, new Map());
    for (const terminal of terminals) terminal.owner = names.get(String(terminal.ownerUserId)) || null;
  }
  return { workflowRuns, workflowTriggers, terminals, errors, at: new Date(now).toISOString() };
}
