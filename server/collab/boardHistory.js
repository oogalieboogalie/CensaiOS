// server/collab/boardHistory.js
//
// Board history, read from the canvas update log (yUpdateLog.js).
//
// listBoardHistory groups log rows into entries a person can read ("Alma
// added Notes and moved 2 windows, 3:04 pm"): consecutive rows by the same
// person within HISTORY_GAP_MS are one entry. boardAt returns the board as it
// stood after an entry, for the preview. restoreBoard rolls the live board
// back to that point by writing the difference into the shared doc, so the
// roll-back is itself a new entry and nothing after it is lost.

import * as Y from 'yjs';
import { writeStateToDoc } from '../../src/lib/collaboration/yCanvasSync.js';
import { docToSnapshot } from './seedFromSnapshot.js';
import { liveUpdateLog, transactCanvasDoc } from './liveDoc.js';

export const HISTORY_GAP_MS = 2 * 60 * 1000;
export const HISTORY_LIMIT = 200;

const GEOMETRY = ['x', 'y', 'w', 'h'];
// Fields that change when a window is only raised or touched, not edited.
const QUIET_FIELDS = new Set(['zIndex', 'updatedAt', 'lastActiveAt']);

function historyError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function titleOf(win) {
  return String(win?.title || win?.name || win?.kind || 'window').slice(0, 60);
}

function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function boardOf(doc) {
  const { meta: _meta, ...board } = docToSnapshot(doc);
  return board;
}

/** What changed between two boards, in counts and window titles. */
export function describeChange(before, after) {
  const prev = new Map((before?.wins || []).map((win) => [String(win.id), win]));
  const next = new Map((after?.wins || []).map((win) => [String(win.id), win]));
  const added = [];
  const removed = [];
  let moved = 0;
  let edited = 0;
  for (const [id, win] of next) {
    const old = prev.get(id);
    if (!old) { added.push(titleOf(win)); continue; }
    if (GEOMETRY.some((field) => old[field] !== win[field])) moved += 1;
    const fields = new Set([...Object.keys(old), ...Object.keys(win)]);
    if ([...fields].some((field) => !GEOMETRY.includes(field) && !QUIET_FIELDS.has(field) && !same(old[field], win[field]))) edited += 1;
  }
  for (const [id, win] of prev) if (!next.has(id)) removed.push(titleOf(win));
  const ids = (list) => new Set((list || []).map((item, i) => String(item?.id ?? `#${i}`)));
  const prevInk = ids(before?.paths);
  const nextInk = ids(after?.paths);
  const inkAdded = [...nextInk].filter((id) => !prevInk.has(id)).length;
  const inkRemoved = [...prevInk].filter((id) => !nextInk.has(id)).length;
  const groups = same(before?.canvasGroups || [], after?.canvasGroups || []) ? 0 : 1;
  const links = same(before?.links || [], after?.links || []) ? 0 : 1;
  return { added, removed, moved, edited, inkAdded, inkRemoved, groups, links };
}

/** The person (or part of the system) behind a log row's actor tag. */
export function parseActor(actor) {
  const text = String(actor || '');
  const restore = /^restore:(\d+):(.*)$/.exec(text);
  if (restore) return { ...parseActor(restore[2]), restoredTo: Number(restore[1]) };
  if (text.startsWith('user:')) return { kind: 'user', id: text.slice(5) };
  if (text.startsWith('guest:')) return { kind: 'guest', id: text.slice(6) };
  if (text === 'server') return { kind: 'system', name: 'censaiOS' };
  if (text === 'migration') return { kind: 'system', name: 'Moved from the old save' };
  return { kind: 'unknown', name: 'Someone' };
}

async function namesFor(db, parsed) {
  const names = new Map();
  const userIds = [...new Set(parsed.filter((p) => p.kind === 'user').map((p) => p.id))]
    .filter((id) => /^\d+$/.test(id)).map(Number);
  const guestIds = [...new Set(parsed.filter((p) => p.kind === 'guest').map((p) => p.id))];
  try {
    if (userIds.length) {
      const result = await db.query('SELECT id, name, email FROM users WHERE id = ANY($1::int[])', [userIds]);
      for (const row of result.rows) names.set(`user:${row.id}`, row.name || String(row.email || '').split('@')[0] || 'Member');
    }
  } catch { /* names are a nicety; the list still works without them */ }
  try {
    if (guestIds.length) {
      const result = await db.query('SELECT DISTINCT ON (guest_id) guest_id, display_name FROM share_link_joins WHERE guest_id = ANY($1::text[]) ORDER BY guest_id, joined_at DESC', [guestIds]);
      for (const row of result.rows) names.set(`guest:${row.guest_id}`, row.display_name);
    }
  } catch { /* same */ }
  return names;
}

function requireLog(updateLog) {
  const log = updateLog ?? liveUpdateLog();
  if (!log) throw historyError('Live collaboration is not running on this server.', 409);
  return log;
}

/**
 * Readable history, newest first. Each entry: { seq, firstSeq, at, startedAt,
 * steps, who: { kind, name }, restoredTo?, change }.
 */
export async function listBoardHistory(db, workspaceId, { updateLog = null, limit = HISTORY_LIMIT, gapMs = HISTORY_GAP_MS } = {}) {
  const log = requireLog(updateLog);
  const { baseUpdate, compactedSeq, rows } = await log.entries(workspaceId);
  const groups = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.actor === row.actor && !String(row.actor || '').startsWith('restore:') && row.createdAt - last.at <= gapMs) {
      last.rows.push(row);
      last.at = row.createdAt;
    } else {
      groups.push({ actor: row.actor, at: row.createdAt, startedAt: row.createdAt, rows: [row] });
    }
  }
  const doc = new Y.Doc();
  if (baseUpdate) Y.applyUpdate(doc, baseUpdate);
  let before = boardOf(doc);
  const parsed = groups.map((group) => parseActor(group.actor));
  const names = await namesFor(db, parsed);
  const entries = groups.map((group, index) => {
    for (const row of group.rows) Y.applyUpdate(doc, row.update);
    const after = boardOf(doc);
    const change = describeChange(before, after);
    before = after;
    const who = parsed[index];
    const key = who.kind === 'user' || who.kind === 'guest' ? `${who.kind}:${who.id}` : null;
    return {
      seq: group.rows.at(-1).seq,
      firstSeq: group.rows[0].seq,
      at: new Date(group.at).toISOString(),
      startedAt: new Date(group.startedAt).toISOString(),
      steps: group.rows.length,
      who: { kind: who.kind, name: (key && names.get(key)) || who.name || (who.kind === 'guest' ? 'Guest' : 'Member') },
      ...(who.restoredTo ? { restoredTo: who.restoredTo } : {}),
      change,
    };
  });
  doc.destroy();
  return {
    entries: entries.reverse().slice(0, limit),
    latestSeq: rows.at(-1)?.seq ?? compactedSeq,
    // Changes older than this were folded together and can't be picked one by one.
    oldestSeq: rows[0]?.seq ?? null,
  };
}

/** The board as it stood right after `seq` (windows, groups, ink, links, dock). */
export async function boardAt(workspaceId, seq, { updateLog = null } = {}) {
  const log = requireLog(updateLog);
  const doc = await log.rebuild(workspaceId, { untilSeq: Number(seq) });
  if (!doc) throw historyError('That point is too old to open; older changes were folded together.', 410);
  const board = boardOf(doc);
  doc.destroy();
  return board;
}

/**
 * Roll the live board back to how it stood right after `seq`. Only the
 * difference is written, as one new change tagged restore:<seq>:<who>.
 */
export async function restoreBoard(workspaceId, seq, { actor, updateLog = null, transact = transactCanvasDoc } = {}) {
  const target = await boardAt(workspaceId, seq, { updateLog });
  const written = await transact(workspaceId, (doc) => {
    writeStateToDoc(doc, boardOf(doc), target, 'history-restore');
  }, { actor: `restore:${Number(seq)}:${actor || 'server'}` });
  if (!written) throw historyError('Live collaboration is not running on this server.', 409);
  return { restoredTo: Number(seq), windows: target.wins.length };
}
