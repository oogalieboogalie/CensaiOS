// Workflows on a board: run one, answer its Review step, stop it, turn its
// own start (schedule or board event) on or off, and list its past runs.
// The graph is always read from the board itself, never from the request,
// so a run does exactly what teammates see drawn in the window.
import express from 'express';
import pool from '../db.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { startWorkflowRun } from '../workflows/runner.js';
import { answerReview, stopWorkflowRun } from '../workflows/control.js';
import { readWorkflowWindow } from '../workflows/board.js';
import { currentWindowIds } from '../workflows/triggers.js';
import { getRun, getTrigger, listRuns, saveTrigger } from '../workflows/store.js';
import { TRIGGER_MODES } from '../../src/lib/workflow/graph.js';

const EDITORS = ['owner', 'admin', 'member'];
const KIND_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function bad(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export function triggerInput(body = {}) {
  const mode = String(body.mode || 'manual');
  if (!TRIGGER_MODES.includes(mode)) throw bad('Pick how this workflow starts.');
  if (mode === 'schedule') {
    const every = Math.round(Number(body.everyMinutes));
    if (!Number.isFinite(every) || every < 5 || every > 10080) throw bad('A schedule runs every 5 minutes up to once a week.');
    return { mode, everyMinutes: every };
  }
  if (mode === 'board') {
    const kind = String(body.windowKind || '');
    if (!KIND_PATTERN.test(kind)) throw bad('Pick which kind of window starts this workflow.');
    return { mode, windowKind: kind };
  }
  return { mode };
}

export function createWorkflowsRouter({
  db = pool, run = { startWorkflowRun, answerReview, stopWorkflowRun }, readWindow = readWorkflowWindow, seenIds = currentWindowIds,
} = {}) {
  const router = express.Router();

  const handle = (roles, work) => async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const workspace = await requireWorkspaceMember(db, {
        userId: req.session.userId, workspaceId: req.params.workspaceId, ...(roles ? { roles } : {}),
      });
      res.json(await work(req, workspace));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  };

  const base = '/workspaces/:workspaceId/workflows/:windowId';

  router.post(`${base}/run`, handle(EDITORS, async (req, workspace) => {
    const { run: started } = await run.startWorkflowRun({
      workspaceId: workspace.id, windowId: req.params.windowId, userId: req.session.userId, trigger: 'manual',
      expectGraph: req.body?.graph && typeof req.body.graph === 'object' ? req.body.graph : null,
    });
    return { ok: true, runId: started.id };
  }));

  router.post(`${base}/review`, handle(EDITORS, async (req, workspace) => {
    const runRow = await getRun(db, workspace.id, String(req.body?.runId || ''));
    if (!runRow || runRow.window_id !== req.params.windowId) throw bad('That run is not on this workflow.', 404);
    const { run: resumed } = await run.answerReview({
      workspaceId: workspace.id, windowId: req.params.windowId, runRow, approve: req.body?.approve === true,
    });
    return { ok: true, status: resumed.status };
  }));

  router.post(`${base}/stop`, handle(EDITORS, async (req, workspace) => (
    { ok: true, ...(await run.stopWorkflowRun({ workspaceId: workspace.id, windowId: req.params.windowId })) }
  )));

  router.get(`${base}/trigger`, handle(null, async (req, workspace) => {
    const row = await getTrigger(db, workspace.id, req.params.windowId);
    return { trigger: row ? { mode: row.mode, everyMinutes: row.every_minutes, windowKind: row.window_kind, armedBy: row.armed_by, nextRunAt: row.next_run_at, lastRunAt: row.last_run_at } : { mode: 'manual' } };
  }));

  router.put(`${base}/trigger`, handle(EDITORS, async (req, workspace) => {
    const input = triggerInput(req.body);
    if (input.mode !== 'manual' && !(await readWindow(workspace.id, req.params.windowId))) {
      throw bad('That workflow is not on this board.', 404);
    }
    const seenWindowIds = input.mode === 'board' ? await seenIds(workspace.id, req.params.windowId, input.windowKind) : [];
    const row = await saveTrigger(db, {
      workspaceId: workspace.id, windowId: req.params.windowId, armedBy: req.session.userId, seenWindowIds, ...input,
    });
    return { ok: true, trigger: row ? { mode: row.mode, everyMinutes: row.every_minutes, windowKind: row.window_kind, armedBy: row.armed_by, nextRunAt: row.next_run_at } : { mode: 'manual' } };
  }));

  router.get(`${base}/runs`, handle(null, async (req, workspace) => ({
    runs: await listRuns(db, workspace.id, req.params.windowId),
  })));

  return router;
}

export const workflowsRouter = createWorkflowsRouter();
