// server/workflows/runner.js
//
// Runs a workflow drawn in a Workflow window. Steps run in order, each one
// starting from what the steps before it handed on:
//
//   Start   hands on its own text (or what happened on the board)
//   Agent   runs a board agent through the same run engine as its chat
//           window (server/runEngine): same model, key, memory and tools
//   Tool    calls one look-up tool directly (WORKFLOW_TOOLS)
//   Check   sends the text down its "yes" or "no" line
//   Review  pauses until a teammate approves
//   Result  drops a card with the text next to the workflow on the board
//
// Each step's status is written into the window as it changes, so everyone
// on the board watches the run, and the whole run is kept in
// board_workflow_runs.

import { randomUUID } from 'crypto';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { runAgentTurn } from '../runEngine/index.js';
import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import { placeResultCard, patchWorkflowWindow, readWorkflowWindow } from './board.js';
import { insertRun, updateRun } from './store.js';
import {
  WORKFLOW_TOOLS, branchWay, clip, graphProblem, nodeInput, nodeReached, runOrder, workflowGraph,
} from '../../src/lib/workflow/graph.js';

const log = createLogger('workflows');
const AGENT_TIMEOUT_MS = 180 * 1000;
const WINDOW_OUTPUT_CHARS = 1500;
const SYNC_TRIES = 8;
const SYNC_WAIT_MS = 250;

// Runs in flight in this server, keyed by board and window.
const active = new Map();
const keyOf = (workspaceId, windowId) => `${workspaceId}:${windowId}`;

export function fail(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function defaultRunTool(agentId, name, args, context) {
  const { executeTool } = await import('../tools.js');
  return executeTool(agentId, name, args, context);
}

export const DEFAULT_DEPS = Object.freeze({
  db: pool,
  runAgent: runAgentTurn,
  runTool: defaultRunTool,
  readWindow: readWorkflowWindow,
  patchWindow: patchWorkflowWindow,
  placeCard: placeResultCard,
});

/** Plain words for a tool the step's agent doesn't have on this board. */
export function toolMissing(node, tool) {
  const id = String(node.agentId || 'censai').toLowerCase();
  const name = FAMILY_AGENT_BY_ID[id]?.name || id;
  const fix = tool.equip ? `Equip ${tool.equip} for ${name} in the ExoSkeleton, or pick another agent for this step.` : 'Pick another agent for this step.';
  return `${name} can't use "${tool.label}" on this board yet. ${fix}`;
}

export function agentPrompt(node, input, workflowTitle) {
  const parts = [`You are one step in the workflow "${workflowTitle}". Your step: ${node.title}.`];
  if (node.instructions) parts.push(node.instructions);
  if (input) parts.push(`What the step before you handed on:\n\n${input}`);
  parts.push('Reply with your result only; the next step reads it as is.');
  return parts.join('\n\n');
}

/** What the window shows for a run: statuses plus a short piece of each output. */
export function windowRun(run) {
  const nodes = {};
  for (const [id, result] of Object.entries(run.results)) {
    nodes[id] = { ...result, output: result.output ? clip(result.output, WINDOW_OUTPUT_CHARS) : undefined };
  }
  return {
    id: run.id, status: run.status, trigger: run.trigger, startedBy: run.startedBy ?? null,
    startedAt: run.startedAt, finishedAt: run.finishedAt || null, error: run.error || null, nodes,
  };
}

export async function publish(run, deps) {
  await deps.patchWindow(run.workspaceId, run.windowId, { run: windowRun(run) });
  try {
    await updateRun(deps.db, run.id, {
      status: run.status, results: run.results, error: run.error || null, finished: Boolean(run.finishedAt),
    });
  } catch (error) {
    log.warn('run record not saved', { runId: run.id, error: error.message });
  }
}

async function runStep(node, input, run, deps) {
  if (node.type === 'agent') {
    const { finalText } = await deps.runAgent({
      origin: 'workflow', agentId: node.agentId, userId: run.startedBy, workspaceId: run.workspaceId,
      loopWorkspaceId: run.workspaceId, timeoutMs: AGENT_TIMEOUT_MS, signal: run.abort.signal,
      messages: [{ from: 'me', text: agentPrompt(node, input, run.title) }],
    });
    return { output: String(finalText || '').trim() || '(no answer)' };
  }
  if (node.type === 'tool') {
    const tool = WORKFLOW_TOOLS[node.tool];
    const result = await deps.runTool(node.agentId || 'censai', node.tool, tool.args(input),
      { userId: run.startedBy, workspaceId: run.workspaceId });
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    if (/TOOL_NOT_AVAILABLE/.test(text)) throw new Error(toolMissing(node, tool));
    if (/^Error:/.test(text)) throw new Error(text.replace(/^Error:\s*/, ''));
    return { output: text };
  }
  if (node.type === 'branch') return { output: input, way: branchWay(node, input) };
  if (node.type === 'output') {
    const card = await deps.placeCard(run.workspaceId, {
      workflowWindowId: run.windowId, title: node.title, text: input || '(nothing reached this card)', runId: run.id,
    });
    return { output: input, cardId: card?.id || null };
  }
  return { output: input };
}

/** Walk the steps from `startAt` (an index into run order). Resolves when the run stops or pauses. */
export async function walk(run, deps, startAt = 0) {
  const order = runOrder(run.graph);
  for (let i = startAt; i < order.length; i += 1) {
    const node = order[i];
    if (run.abort.signal.aborted) {
      Object.assign(run, { status: 'stopped', error: 'Stopped.', finishedAt: new Date().toISOString() });
      await publish(run, deps);
      return run;
    }
    if (node.type === 'trigger') {
      run.results[node.id] = { status: 'done', output: run.startText || node.input || '', ms: 0 };
      continue;
    }
    if (!nodeReached(run.graph, node.id, run.results)) {
      run.results[node.id] = { status: 'skipped' };
      continue;
    }
    const input = nodeInput(run.graph, node.id, run.results);
    if (node.type === 'review') {
      run.results[node.id] = { status: 'waiting', output: input };
      Object.assign(run, { status: 'awaiting_review', waitingAt: i });
      await publish(run, deps);
      return run;
    }
    const startedAt = Date.now();
    run.results[node.id] = { status: 'running' };
    await publish(run, deps);
    try {
      const step = await runStep(node, input, run, deps);
      run.results[node.id] = { status: 'done', ms: Date.now() - startedAt, ...step, output: clip(step.output) };
    } catch (error) {
      const message = run.abort.signal.aborted ? 'Stopped.' : (error?.message || 'This step failed.');
      run.results[node.id] = { status: 'failed', ms: Date.now() - startedAt, error: clip(message, 500) };
      Object.assign(run, { status: run.abort.signal.aborted ? 'stopped' : 'failed', error: `${node.title}: ${clip(message, 300)}`, finishedAt: new Date().toISOString() });
      await publish(run, deps);
      return run;
    }
  }
  Object.assign(run, { status: 'complete', finishedAt: new Date().toISOString() });
  await publish(run, deps);
  return run;
}

export function track(run, deps, startAt) {
  const key = keyOf(run.workspaceId, run.windowId);
  active.set(key, run);
  const done = walk(run, deps, startAt)
    .catch((error) => log.warn('workflow run crashed', { runId: run.id, error: error.message }))
    .finally(() => { if (active.get(key) === run) active.delete(key); });
  return done;
}

/**
 * Start a run. Returns { run, done } at once; `done` settles when the run
 * finishes or pauses. Throws with a statusCode when it cannot start.
 */
/**
 * The window as the board has it. When the person pressing Run has edits
 * still on their way to the board, wait a moment for them to land; the run
 * always uses the board's copy.
 */
async function boardCopy(workspaceId, windowId, expectGraph, deps) {
  let win = await deps.readWindow(workspaceId, windowId);
  const want = expectGraph ? JSON.stringify(expectGraph) : null;
  for (let tries = 0; want && tries < SYNC_TRIES && JSON.stringify(win?.graph ?? null) !== want; tries += 1) {
    await new Promise((resolve) => { setTimeout(resolve, SYNC_WAIT_MS); });
    win = await deps.readWindow(workspaceId, windowId);
  }
  return win;
}

export async function startWorkflowRun({ workspaceId, windowId, userId, trigger = 'manual', startText = null, expectGraph = null }, deps = DEFAULT_DEPS) {
  if (active.has(keyOf(workspaceId, windowId))) throw fail('This workflow is already running.', 409);
  const win = await boardCopy(workspaceId, windowId, expectGraph, deps);
  if (!win) throw fail('That workflow is not on this board.', 404);
  const graph = workflowGraph(win);
  const problem = graphProblem(graph);
  if (problem) throw fail(problem, 400);
  const results = Object.fromEntries(graph.nodes.map((node) => [node.id, { status: 'pending' }]));
  const run = {
    id: randomUUID(), workspaceId, windowId, startedBy: userId, trigger, status: 'running', graph, results,
    title: win.title || 'Workflow', startText, startedAt: new Date().toISOString(), abort: new AbortController(),
  };
  await insertRun(deps.db, run);
  await publish(run, deps);
  return { run, done: track(run, deps, 0) };
}

/** The run in flight for a workflow window in this server, or null. */
export function activeRun(workspaceId, windowId) {
  return active.get(keyOf(workspaceId, windowId)) || null;
}

export function resetWorkflowRuns() {
  active.clear();
}
