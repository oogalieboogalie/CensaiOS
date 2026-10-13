// server/social/activity.js
//
// "Sam added PDF and Notes to Launch board": what people did on a board
// that is shown on a profile, read from the canvas update log (the same log
// Board history uses). Every board state is filtered the way a view link
// filters it before it is compared, so a window a guest could not see
// (terminal, files, settings) never shows up in anyone's feed, even by name.

import * as Y from 'yjs';
import { docToSnapshot } from '../collab/seedFromSnapshot.js';
import { describeChange, parseActor } from '../collab/boardHistory.js';
import { liveUpdateLog } from '../collab/liveDoc.js';
import { createYUpdateLog } from '../collab/yUpdateLog.js';
import { projectBoardForLink } from '../shareLinks/access.js';
import { readProjectedBoard } from '../shareLinks/projector.js';

export const ACTIVITY_GAP_MS = 5 * 60 * 1000;
export const ACTIVITY_DAYS = 14;
const VIEW_LINK = Object.freeze({ role: 'view', scope_kind: 'board', stage: false });
const PREVIEW_WINDOWS = 40;

// Looking at your feed is not building, so the Social window itself never counts.
const NOT_BUILDING = new Set(['social']);

function viewOf(doc) {
  const board = projectBoardForLink(docToSnapshot(doc), VIEW_LINK);
  return { ...board, wins: board.wins.filter((win) => !NOT_BUILDING.has(String(win.kind || win.type || ''))) };
}

function list(titles) {
  const names = titles.slice(0, 3);
  const rest = titles.length - names.length;
  if (rest > 0) return `${names.join(', ')} and ${rest} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

/** One readable line for a change, or null when nothing worth telling happened. */
export function describeBuild(change) {
  const parts = [];
  if (change.added.length) parts.push(`added ${list(change.added)}`);
  if (change.edited) parts.push(`worked on ${change.edited === 1 ? 'a window' : `${change.edited} windows`}`);
  if (change.inkAdded) parts.push('drew on it');
  return parts.length ? parts.join(', ') : null;
}

async function namesFor(db, userIds) {
  const ids = [...new Set(userIds)].filter((id) => /^\d+$/.test(id)).map(Number);
  const names = new Map();
  if (!ids.length) return names;
  try {
    const { rows } = await db.query(
      `SELECT u.id, COALESCE(p.display_name, u.name, split_part(u.email, '@', 1)) AS name
         FROM users u LEFT JOIN social_profiles p ON p.user_id = u.id WHERE u.id = ANY($1::int[])`,
      [ids],
    );
    for (const row of rows) names.set(String(row.id), row.name);
  } catch { /* names are a nicety */ }
  return names;
}

/**
 * What changed on one board lately, newest first:
 * [{ at, who: { kind, name, userId? }, text, added }]
 */
export async function boardActivity(db, workspaceId, { updateLog = null, now = Date.now(), limit = 20 } = {}) {
  const log = updateLog ?? liveUpdateLog() ?? createYUpdateLog(db);
  let entries;
  try { entries = await log.entries(String(workspaceId)); } catch { return []; }
  const since = now - ACTIVITY_DAYS * 24 * 3600_000;
  const groups = [];
  for (const row of entries.rows) {
    const last = groups.at(-1);
    if (last && last.actor === row.actor && row.createdAt - last.at <= ACTIVITY_GAP_MS) {
      last.rows.push(row);
      last.at = row.createdAt;
    } else {
      groups.push({ actor: row.actor, at: row.createdAt, rows: [row] });
    }
  }
  const doc = new Y.Doc();
  if (entries.baseUpdate) Y.applyUpdate(doc, entries.baseUpdate);
  let before = viewOf(doc);
  const found = [];
  for (const group of groups) {
    for (const row of group.rows) Y.applyUpdate(doc, row.update);
    const after = viewOf(doc);
    const change = describeChange(before, after);
    before = after;
    const who = parseActor(group.actor);
    const text = describeBuild(change);
    // Only people build in the feed; agents get their own lines (agentNotes.js).
    if (!text || group.at < since || (who.kind !== 'user' && who.kind !== 'guest')) continue;
    found.push({
      at: new Date(group.at).toISOString(), seq: group.rows.at(-1).seq, who, text,
      added: change.added.slice(0, 6), onlyAdded: !change.edited && !change.inkAdded,
    });
  }
  doc.destroy();
  const names = await namesFor(db, found.filter((item) => item.who.kind === 'user').map((item) => item.who.id));
  return found.reverse().slice(0, limit).map((item) => ({
    ...item,
    who: item.who.kind === 'user'
      ? { kind: 'person', userId: Number(item.who.id), name: names.get(String(item.who.id)) || 'Member' }
      : { kind: 'guest', name: 'A guest' },
  }));
}

/** A small picture of a board: window boxes and titles, view-link filtered. */
export async function boardPreview(workspaceId) {
  let board;
  try { board = await readProjectedBoard(String(workspaceId), VIEW_LINK); } catch { return { windows: [] }; }
  const windows = (board?.wins || [])
    .filter((win) => !win.minimized && Number.isFinite(Number(win.x)) && Number.isFinite(Number(win.y)))
    .slice(0, PREVIEW_WINDOWS)
    .map((win) => ({
      x: Math.round(Number(win.x)), y: Math.round(Number(win.y)),
      w: Math.max(40, Math.round(Number(win.w) || 320)), h: Math.max(30, Math.round(Number(win.h) || 240)),
      kind: String(win.kind || win.type || 'window').slice(0, 40),
      title: String(win.title || win.name || win.kind || 'Window').slice(0, 60),
    }));
  return { windows };
}
