// server/workflows/triggers.js
//
// Workflows that start on their own. Every half minute the server looks at
// the armed ones (board_workflow_triggers):
//
//   schedule  due again: run it, then set the next time
//   board     a new window of the chosen kind landed on the board: run it,
//             handing the new window's name and text to the first step
//
// A run always goes as the teammate who turned the trigger on, and only
// while they are still a member who can edit the board. Result cards that
// any workflow made never start a workflow, so two workflows can't keep
// waking each other up.

import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { readBoardWindows } from './board.js';
import { startWorkflowRun } from './runner.js';
import { dropTrigger, listArmedTriggers, markScheduleRan, saveSeenWindows } from './store.js';

const log = createLogger('workflow-triggers');
const TICK_MS = 30 * 1000;
const MAX_SEEN = 500;
const START_TEXT_CHARS = 4000;

/** Pure: windows of this kind, minus result cards workflows made. */
export function watchedWindows(wins, row) {
  return wins.filter((win) => win.kind === row.window_kind && win.id !== row.window_id && !win.fromWorkflowId);
}

const KIND_WORDS = {
  doc: 'document', todos: 'to-do list', chat: 'agent chat', image: 'picture', browser: 'browser window', leadHound: 'LeadHound search',
};

/** Pure: the text a board trigger hands to the first step. */
export function boardStartText(kind, wins) {
  const words = KIND_WORDS[kind] || kind;
  return wins.map((win) => {
    const name = win.title || win.fileName || win.label || win.id;
    const body = String(win.text || win.content || win.description || '').slice(0, START_TEXT_CHARS);
    return [`A new ${words} was added to the board: "${name}".`, body].filter(Boolean).join('\n\n');
  }).join('\n\n---\n\n');
}

/** The ids a board trigger has already seen when it is turned on (so it only reacts to new ones). */
export async function currentWindowIds(workspaceId, windowId, kind, read = readBoardWindows) {
  const wins = await read(workspaceId);
  return wins ? watchedWindows(wins, { window_id: windowId, window_kind: kind }).map((win) => win.id).slice(-MAX_SEEN) : [];
}

// Returns 'ran', 'busy' (already running: try again next time) or 'skipped'.
async function start(row, trigger, startText, deps) {
  try {
    await deps.start({ workspaceId: row.workspace_id, windowId: row.window_id, userId: row.armed_by, trigger, startText });
    return 'ran';
  } catch (error) {
    if (error.statusCode === 409) return 'busy';
    if (error.statusCode === 404) await dropTrigger(deps.db, row.workspace_id, row.window_id);
    else log.warn('workflow did not start', { windowId: row.window_id, error: error.message });
    return 'skipped';
  }
}

export async function checkTrigger(row, deps) {
  if (row.mode === 'schedule') {
    await markScheduleRan(deps.db, row);
    return (await start(row, 'schedule', null, deps)) === 'ran';
  }
  const wins = await deps.read(row.workspace_id);
  if (!wins) return false;
  if (!wins.some((win) => win.id === row.window_id)) {
    await dropTrigger(deps.db, row.workspace_id, row.window_id);
    return false;
  }
  const seen = new Set(Array.isArray(row.seen_window_ids) ? row.seen_window_ids : []);
  const watched = watchedWindows(wins, row);
  const fresh = watched.filter((win) => !seen.has(win.id));
  const outcome = fresh.length ? await start(row, 'board', boardStartText(row.window_kind, fresh), deps) : 'none';
  // A busy workflow keeps the new windows unseen and picks them up next time.
  const unchanged = outcome === 'none' && watched.length === seen.size;
  if (outcome !== 'busy' && !unchanged) await saveSeenWindows(deps.db, row, watched.map((win) => win.id).slice(-MAX_SEEN), outcome === 'ran');
  return outcome === 'ran';
}

export async function tickWorkflowTriggers(deps = { db: pool, read: readBoardWindows, start: (input) => startWorkflowRun(input) }) {
  if (!dbReady()) return 0;
  let started = 0;
  let rows = [];
  try {
    rows = await listArmedTriggers(deps.db);
  } catch (error) {
    log.warn('workflow triggers unreadable', { error: error.message });
    return 0;
  }
  for (const row of rows) {
    try {
      if (await checkTrigger(row, deps)) started += 1;
    } catch (error) {
      log.warn('workflow trigger check failed', { windowId: row.window_id, error: error.message });
    }
  }
  return started;
}

let timer = null;
export function startWorkflowTriggerWorker() {
  if (timer) return;
  timer = setInterval(() => { tickWorkflowTriggers().catch(() => {}); }, TICK_MS);
  timer.unref?.();
}
