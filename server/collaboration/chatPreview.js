// CHAT LIVE PREVIEW — the server side. An agent's chat gets one preview
// window beside it (linked with a line) that refreshes as the agent writes;
// the agent can also point a person at a window or start an app's dev
// server next to the chat. Everything goes through the live Yjs canvas doc,
// so every browser on the board sees it at once. Nothing here throws into a
// tool call: a board that is not running just means "nothing to show".
// Logs: namespace `chat-preview` in the app log.

import path from 'path';
import { randomUUID } from 'crypto';
import * as Y from 'yjs';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { transactCanvasDoc } from '../collab/liveDoc.js';
import { upsertWindowInDoc } from '../collab/serverWriter.js';
import { valueFromY, valueToY } from '../collab/seedFromSnapshot.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import { readDocWindows } from '../agent-registry/helpCards.js';
import {
  MAX_FILE_PREVIEW_BYTES, chatPreviewPosition, chatPreviewWindow, filePreviewHtml, findChatPreview,
  inlineLocalAssets, previewKindForPath, tooBigHtml,
} from './chatPreviewShape.js';

const log = createLogger('chat-preview');
export const POINT_SIZE = Object.freeze({ devServer: { w: 520, h: 420 } });

function docLinks(doc) {
  const root = doc.getMap(CANVAS_ROOT);
  let links = root.get('links');
  if (!(links instanceof Y.Array)) {
    links = new Y.Array();
    root.set('links', links);
  }
  return links;
}

/** Draw a line from one window to another unless one is already there. */
export function ensureLinkInDoc(doc, fromId, toId, makeId = randomUUID) {
  if (!fromId || !toId || fromId === toId) return false;
  const links = docLinks(doc);
  const exists = links.toArray().map(valueFromY)
    .some((link) => (link?.fromId === fromId && link?.toId === toId) || (link?.fromId === toId && link?.toId === fromId));
  if (exists) return false;
  links.push([valueToY({ id: makeId(), fromId, toId, timestamp: Date.now() })]);
  return true;
}

/** Pure on a doc: put html in the chat's preview (create once, then refresh). */
export function showInChatPreviewDoc(doc, { chatWindowId, agentId, title, fileName, html, previewType, source, makeId = randomUUID }) {
  const wins = readDocWindows(doc);
  const chatWin = wins.find((win) => win.id === chatWindowId);
  if (!chatWin) return null;
  const existing = findChatPreview(wins, chatWin.id);
  const win = chatPreviewWindow({ id: makeId(), existing, chatWin, wins, agentId, title, fileName, html, previewType, source });
  if (!upsertWindowInDoc(doc, win)) return null;
  ensureLinkInDoc(doc, chatWin.id, win.id, makeId);
  return { window: win, created: !existing };
}

export async function showInChatPreview(workspaceId, input, deps = {}) {
  const transact = deps.transact || transactCanvasDoc;
  let shown = null;
  try {
    await transact(workspaceId, (doc) => { shown = showInChatPreviewDoc(doc, input); });
  } catch (error) {
    log.warn('preview not shown', { workspaceId, chatWindowId: input?.chatWindowId, code: safeErrorCode(error) });
    return null;
  }
  if (shown) {
    log.info(shown.created ? 'preview opened' : 'preview refreshed', {
      workspaceId, chatWindowId: input.chatWindowId, windowId: shown.window.id, fileName: shown.window.fileName,
      revision: shown.window.previewRevision, bytes: Buffer.byteLength(shown.window.html, 'utf8'),
    });
  }
  return shown;
}

function sameFolder(a, b) {
  const clean = (value) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return Boolean(a) && clean(a) === clean(b);
}

/** The board's Run dev window for a project folder, if one is open. */
export function devServerWindowFor(wins, folder) {
  return (wins || []).find((win) => win?.kind === 'devServer' && sameFolder(win.folder, folder)) || null;
}

/**
 * After an agent writes `filePath` in `project`: show it live beside the
 * chat. `readFile(relPath)` returns the file's current text. A css/js file
 * refreshes the page the preview already shows (or the folder's index.html).
 * A project with Run dev open on the board already reloads itself, so the
 * chat is linked to that window instead.
 */
export async function followFileInPreview({ workspaceId, chatWindowId, agentId, project, filePath, readFile }, deps = {}) {
  const kind = previewKindForPath(filePath);
  if (!kind || !workspaceId || !chatWindowId) return null;
  const transact = deps.transact || transactCanvasDoc;
  let dev = null;
  let current = null;
  await transact(workspaceId, (doc) => {
    const wins = readDocWindows(doc);
    current = findChatPreview(wins, chatWindowId)?.previewSource || null;
    dev = project?.path ? devServerWindowFor(wins, project.path) : null;
    if (dev) ensureLinkInDoc(doc, chatWindowId, dev.id);
  }).catch(() => undefined);
  if (dev) {
    log.info('write follows Run dev', { workspaceId, chatWindowId, windowId: dev.id, filePath });
    return { status: 'dev', window: dev };
  }
  let pagePath = filePath;
  let pageKind = kind;
  if (kind === 'asset') {
    pagePath = current?.project === project?.name && current?.path ? current.path : path.posix.join(path.posix.dirname(filePath), 'index.html');
    pageKind = 'html';
  }
  const text = await readFile(pagePath).catch(() => null);
  if (typeof text !== 'string') return null;
  let html;
  if (Buffer.byteLength(text, 'utf8') > MAX_FILE_PREVIEW_BYTES) {
    html = tooBigHtml(pagePath, Buffer.byteLength(text, 'utf8'));
  } else {
    html = filePreviewHtml(pageKind, pagePath, text);
    if (pageKind === 'html') html = (await inlineLocalAssets(html, pagePath, readFile)).html;
    if (Buffer.byteLength(html, 'utf8') > MAX_FILE_PREVIEW_BYTES) html = tooBigHtml(pagePath, Buffer.byteLength(html, 'utf8'));
  }
  const fileName = path.posix.basename(pagePath);
  const shown = await showInChatPreview(workspaceId, {
    chatWindowId, agentId, title: fileName, fileName, html, previewType: pageKind,
    source: { project: project?.name || null, path: pagePath },
  }, { transact });
  return shown ? { status: shown.created ? 'opened' : 'refreshed', window: shown.window } : null;
}

/** Make a window glow for everyone and slide the asking person's view to it. */
/** Pure: a window by exact id, else the first whose title or file name contains `title`. */
export function findWindowToPoint(wins, { windowId = null, title = '' } = {}) {
  if (windowId) return (wins || []).find((win) => win.id === windowId) || null;
  const want = String(title || '').trim().toLowerCase();
  if (!want) return null;
  return (wins || []).find((win) => String(win.title || '').toLowerCase() === want)
    || (wins || []).find((win) => `${win.title || ''} ${win.fileName || ''}`.toLowerCase().includes(want)) || null;
}

export async function pointAtWindow(workspaceId, { chatWindowId, windowId, title, agentId, userId, note = '' }, deps = {}) {
  const transact = deps.transact || transactCanvasDoc;
  let target = null;
  await transact(workspaceId, (doc) => {
    const win = findWindowToPoint(readDocWindows(doc), { windowId, title });
    if (!win) return;
    target = {
      ...win,
      pointedAt: { at: Date.now(), by: agentId || null, forUserId: userId != null ? String(userId) : null, note: String(note || '').slice(0, 140) },
    };
    upsertWindowInDoc(doc, target);
    if (chatWindowId) ensureLinkInDoc(doc, chatWindowId, win.id);
  });
  if (target) log.info('pointed at window', { workspaceId, chatWindowId, windowId: target.id, kind: target.kind });
  return target;
}

/** Open Run dev for a project folder beside the chat (or point at the one already open). */
export async function openRunDevBeside(workspaceId, { chatWindowId, agentId, userId, folder, title }, deps = {}) {
  const transact = deps.transact || transactCanvasDoc;
  let result = null;
  await transact(workspaceId, (doc) => {
    const wins = readDocWindows(doc);
    const existing = devServerWindowFor(wins, folder);
    if (existing) { result = { window: existing, created: false }; return; }
    const chatWin = wins.find((win) => win.id === chatWindowId) || null;
    const at = chatWin ? chatPreviewPosition(chatWin, wins) : { x: 120, y: 120 };
    const win = {
      id: randomUUID(), kind: 'devServer', title: String(title || 'Run dev').slice(0, 120),
      ...at, ...POINT_SIZE.devServer,
      folder, autoStart: true, autoStartFor: userId != null ? String(userId) : null,
      createdBy: agentId ? `agent:${agentId}` : null, updatedAt: new Date().toISOString(),
    };
    if (!upsertWindowInDoc(doc, win)) return;
    if (chatWin) ensureLinkInDoc(doc, chatWin.id, win.id);
    result = { window: win, created: true };
  });
  if (result && !result.created) return pointAtWindow(workspaceId, { chatWindowId, windowId: result.window.id, agentId, userId }, deps).then((win) => ({ window: win || result.window, created: false }));
  if (result) log.info('run dev opened', { workspaceId, chatWindowId, windowId: result.window.id });
  return result;
}
