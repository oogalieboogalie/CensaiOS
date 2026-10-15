// server/workflows/control.js
//
// Steering a workflow run that already started: answering its Review step
// (approve carries on from the next step, stop ends the run) and stopping it.

import { updateRun } from './store.js';
import { DEFAULT_DEPS, activeRun, fail, publish, track } from './runner.js';
import { runOrder } from '../../src/lib/workflow/graph.js';

/** Approve or stop a run paused at a Review step. */
export async function answerReview({ workspaceId, windowId, runRow, approve }, deps = DEFAULT_DEPS) {
  if (!runRow || runRow.status !== 'awaiting_review') throw fail('This run is not waiting for a review.', 409);
  if (activeRun(workspaceId, windowId)) throw fail('This workflow is already running.', 409);
  const graph = runRow.graph;
  const order = runOrder(graph);
  const results = { ...runRow.results };
  const at = order.findIndex((node) => results[node.id]?.status === 'waiting');
  if (at < 0) throw fail('This run is not waiting for a review.', 409);
  const win = await deps.readWindow(workspaceId, windowId);
  const run = {
    id: runRow.id, workspaceId, windowId, startedBy: runRow.started_by, trigger: runRow.trigger, graph, results,
    title: win?.title || 'Workflow', startedAt: new Date(runRow.started_at).toISOString(), abort: new AbortController(),
  };
  const node = order[at];
  if (!approve) {
    results[node.id] = { ...results[node.id], status: 'failed', error: 'Not approved.' };
    Object.assign(run, { status: 'stopped', error: `${node.title}: not approved.`, finishedAt: new Date().toISOString() });
    await publish(run, deps);
    return { run, done: Promise.resolve(run) };
  }
  results[node.id] = { ...results[node.id], status: 'done' };
  run.status = 'running';
  await publish(run, deps);
  return { run, done: track(run, deps, at + 1) };
}

/** Stop a run in flight, or clear one that was cut off (the server restarted mid-run). */
export async function stopWorkflowRun({ workspaceId, windowId }, deps = DEFAULT_DEPS) {
  const run = activeRun(workspaceId, windowId);
  if (run) {
    run.abort.abort();
    return { stopped: true };
  }
  const win = await deps.readWindow(workspaceId, windowId);
  if (win?.run && ['running', 'awaiting_review'].includes(win.run.status)) {
    await deps.patchWindow(workspaceId, windowId, {
      run: { ...win.run, status: 'stopped', error: 'Stopped.', finishedAt: new Date().toISOString() },
    });
    try { await updateRun(deps.db, win.run.id, { status: 'stopped', error: 'Stopped.', finished: true }); } catch { /* record is best effort */ }
  }
  return { stopped: Boolean(win?.run) };
}
