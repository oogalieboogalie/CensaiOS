// server/collab/agentPresence.js
//
// Agent cursors: while an agent runs on a board, everyone there sees a cursor
// with its name and colour move to the window it is working in, outline the
// window it is reading, and type its answer. It rides the canvas doc's own
// awareness (the same presence layer people's cursors use), published from
// the server's side of the room, so there is no new sync channel. The server
// holds one awareness state per board:
//
//   { agents: [{ id, agentId, name, color, home, at, phase, label, tail, total }] }
//
// `home` is the agent's own window, `at` the window it is pointing at right
// now, `tail` the last characters of its answer and `total` how many it has
// written so far (so a browser can type out only what is new). Nothing is
// published when no browser has the board open, and the cursor leaves a
// moment after the agent finishes.

import crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import { openWatchedCanvasDoc } from './liveDoc.js';
import { CANVAS_ROOT } from './ySchema.js';

const log = createLogger('agent-presence');

export const LINGER_MS = 2400;
export const SEND_EVERY_MS = 90;
export const TAIL_CHARS = 240;
// A tool call that reads a window can finish in milliseconds; the cursor
// stays on that window long enough for people to see where it went.
export const DWELL_MS = 1600;
export const ULTEM_AMBER = '#E5A83A';

/** The agent's own hue when it has one, Ultem amber otherwise. */
export function agentColor(hue) {
  const h = Number(hue);
  return Number.isFinite(h) && h > 0 ? `oklch(0.74 0.13 ${Math.round(h) % 360})` : ULTEM_AMBER;
}

function windowsMap(doc) {
  const windows = doc?.getMap?.(CANVAS_ROOT)?.get('windows');
  return windows && typeof windows.get === 'function' ? windows : null;
}

function field(win, key) {
  return typeof win?.get === 'function' ? win.get(key) : win?.[key];
}

/** The window an agent works in: the one it was started from, else its chat. */
export function homeWindowFor(doc, { windowId = null, agentId = null } = {}) {
  const windows = windowsMap(doc);
  if (!windows) return null;
  if (windowId && windows.get(String(windowId))) return String(windowId);
  if (!agentId) return null;
  let fallback = null;
  for (const [id, win] of windows.entries()) {
    if (field(win, 'agentId') !== agentId) continue;
    if (field(win, 'kind') === 'chat') return id;
    fallback ??= id;
  }
  return fallback;
}

/** A window on the board that a tool call names in its arguments, if any. */
export function windowNamedIn(doc, args) {
  const windows = windowsMap(doc);
  if (!windows || !args || typeof args !== 'object') return null;
  const seen = [args];
  for (let i = 0; i < seen.length && i < 40; i += 1) {
    for (const value of Object.values(seen[i])) {
      if (typeof value === 'string' && value.length <= 96 && windows.get(value)) return value;
      if (value && typeof value === 'object') seen.push(value);
    }
  }
  return null;
}

function windowTitle(doc, id) {
  const win = windowsMap(doc)?.get(id);
  const title = field(win, 'title') || field(win, 'fileName');
  return typeof title === 'string' && title.trim() ? title.trim() : 'a window';
}

function displayName(agentId) {
  const plain = String(agentId).replace(/[-_.:]+/g, ' ').trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

function toolLabel(detail = {}) {
  const summary = typeof detail.summary === 'string' ? detail.summary.trim() : '';
  if (summary) return summary.slice(0, 60);
  const tool = String(detail.tool || '').replace(/^mcp__[^_]+__/, '').replace(/_/g, ' ').trim();
  return tool ? `Using ${tool}`.slice(0, 60) : 'Using a tool';
}

/** Apply one run-engine event to a run's cursor state. Returns true if it changed. */
export function applyRunEvent(run, event, doc) {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'delta' && typeof event.text === 'string' && event.text) {
    run.tail = (run.tail + event.text).slice(-TAIL_CHARS);
    run.total += event.text.length;
    run.phase = 'typing';
    run.label = '';
    run.at = run.home;
    return true;
  }
  if (event.type !== 'status') return false;
  if (event.status === 'thinking') {
    Object.assign(run, { phase: 'thinking', label: '', at: run.home });
    return true;
  }
  if (event.status === 'calling_tool') {
    const reading = windowNamedIn(doc, event.detail?.args);
    const looks = /^(read|list|get|search|find|recall|canvas_read)/.test(String(event.detail?.tool || ''));
    const label = reading ? `${looks ? 'Reading' : 'Working in'} ${windowTitle(doc, reading)}`.slice(0, 60) : toolLabel(event.detail);
    Object.assign(run, { phase: reading ? 'reading' : 'tool', label, at: reading || run.home });
    return true;
  }
  if (event.status === 'completed_tool') {
    Object.assign(run, { phase: 'thinking', label: '', at: run.home });
    return true;
  }
  return false;
}

export function publicRun(run, now = Date.now()) {
  const { id, agentId, name, color, home, tail, total } = run;
  const dwell = run.dwell && run.dwell.until > now && run.phase !== 'typing' && run.phase !== 'done' ? run.dwell : null;
  return {
    id, agentId, name, color, home, tail, total,
    at: dwell ? dwell.at : run.at,
    phase: dwell ? 'reading' : run.phase,
    label: dwell ? dwell.label : run.label,
  };
}

// workspaceId -> { ready: Promise<{doc, close}|null>, live, runs: Map, timer, sentAt, pending }
const rooms = new Map();

function publish(room, { now = false } = {}) {
  if (!room.live) return;
  const send = () => {
    room.timer = null;
    room.sentAt = Date.now();
    const agents = [...room.runs.values()].map((run) => publicRun(run));
    room.live.doc.awareness?.setLocalState(agents.length ? { agents } : null);
  };
  if (now) {
    clearTimeout(room.timer);
    send();
    return;
  }
  if (room.timer) return;
  room.timer = setTimeout(send, Math.max(0, SEND_EVERY_MS - (Date.now() - room.sentAt)));
  room.timer.unref?.();
}

function closeRoomIfIdle(workspaceId, room) {
  if (room.runs.size || room.pending) return;
  rooms.delete(workspaceId);
  clearTimeout(room.timer);
  room.ready.then((live) => live?.close()).catch(() => {});
}

const NOOP = Object.freeze({ wrap: (sendEvent) => sendEvent, finish: () => {} });

/**
 * Start an agent's cursor on a board. `describe()` resolves the agent's
 * { name, hue } and is only called when someone is watching. Returns { wrap(sendEvent), finish(finalText) }:
 * wrap the run's event sender so the cursor follows the run, and call finish
 * when it ends. Never throws; a no-op when no browser has the board open.
 */
export async function beginAgentPresence({ workspaceId, agentId, windowId = null, describe = null, open = openWatchedCanvasDoc }) {
  if (!workspaceId || !agentId) return NOOP;
  try {
    let room = rooms.get(workspaceId);
    if (!room) {
      room = { ready: Promise.resolve(open(workspaceId)).catch(() => null), live: null, runs: new Map(), timer: null, sentAt: 0, pending: 0 };
      rooms.set(workspaceId, room);
    }
    room.pending += 1;
    const live = await room.ready.finally(() => { room.pending -= 1; });
    const home = live ? homeWindowFor(live.doc, { windowId, agentId }) : null;
    room.live = live;
    if (!live || !home) {
      closeRoomIfIdle(workspaceId, room);
      return NOOP;
    }
    const { name, hue } = (await Promise.resolve(describe?.()).catch(() => null)) || {};
    const run = {
      id: crypto.randomUUID().slice(0, 8), agentId: String(agentId).slice(0, 64),
      name: String(name || displayName(agentId)).slice(0, 40), color: agentColor(hue),
      home, at: home, phase: 'reading', label: '', tail: '', total: 0,
    };
    room.runs.set(run.id, run);
    publish(room, { now: true });
    let finished = false;
    return {
      wrap: (sendEvent) => (event) => {
        try {
          if (!finished && applyRunEvent(run, event, live.doc)) {
            if (run.at !== run.home) {
              run.dwell = { at: run.at, label: run.label, until: Date.now() + DWELL_MS };
              setTimeout(() => publish(room), DWELL_MS + 20).unref?.();
            }
            publish(room);
          }
        } catch (error) {
          log.warn('agent cursor event skipped', { error: error.message });
        }
        return sendEvent(event);
      },
      finish: (finalText = '') => {
        if (finished) return;
        finished = true;
        // A model that doesn't stream still gets typed out in the browser.
        if (!run.total && typeof finalText === 'string' && finalText) {
          run.tail = finalText.slice(-TAIL_CHARS);
          run.total = finalText.length;
        }
        Object.assign(run, { phase: 'done', label: '', at: run.home });
        publish(room, { now: true });
        const timer = setTimeout(() => {
          room.runs.delete(run.id);
          publish(room, { now: true });
          closeRoomIfIdle(workspaceId, room);
        }, LINGER_MS);
        timer.unref?.();
      },
    };
  } catch (error) {
    log.warn('agent cursor could not start', { workspaceId, error: error.message });
    return NOOP;
  }
}

/** Test hook: forget every room. */
export function resetAgentPresenceRooms() {
  for (const room of rooms.values()) clearTimeout(room.timer);
  rooms.clear();
}
