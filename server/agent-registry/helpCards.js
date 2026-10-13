// AGENT NETWORK — server side of the canvas cards.
// When an agent asks another agent for help (request_agent_help), a card is
// written into the live canvas CRDT between the asking window and the
// helper's window, with link lines to both, so the whole team watches the
// request happen. Discovery also says which agents have a window on this
// board. Neither path ever throws: the network works without a live canvas.

import { randomUUID } from 'crypto';
import * as Y from 'yjs';
import { createLogger } from '../logger.js';
import { openCanvasDocReader, transactCanvasDoc } from '../collab/liveDoc.js';
import { upsertWindowInDoc } from '../collab/serverWriter.js';
import { valueFromY, valueToY } from '../collab/seedFromSnapshot.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import {
  AGENT_WINDOW_KINDS, HELP_CARD_KIND, clipResult, findHelperWindow, helpCardLinks, helpCardWindow,
} from './helpCardShape.js';

const log = createLogger('agent-help-cards');

export function readDocWindows(doc) {
  const windows = doc.getMap(CANVAS_ROOT).get('windows');
  if (!(windows instanceof Y.Map)) return [];
  return [...windows.values()].map(valueFromY).filter((win) => win && typeof win === 'object');
}

function agentName(agentId) {
  const id = String(agentId || '').toLowerCase();
  return FAMILY_AGENT_BY_ID[id]?.name || (id ? `${id[0].toUpperCase()}${id.slice(1)}` : 'Agent');
}

function windowLabel(win) {
  if (!win) return null;
  if (win.kind === 'chat' || win.kind === 'agent') return agentName(win.agentId);
  return win.title || win.kind;
}

/** Pure: add the card + its two link lines to a doc. Returns the card. */
export function placeHelpCardInDoc(doc, {
  request, fromWindowId = null, toWindowId = null, executor = 'network', id = null,
  requesterAgentId = null, awaitingTool = false, makeId = randomUUID,
}) {
  const wins = readDocWindows(doc);
  const fromWin = wins.find((win) => win.id === fromWindowId) || null;
  const toWin = toWindowId
    ? wins.find((win) => win.id === toWindowId) || null
    : findHelperWindow(wins, request.cardId, fromWin);
  const busy = wins.filter((win) => win.kind === HELP_CARD_KIND && win.toWindowId && win.toWindowId === toWin?.id).length;
  const card = helpCardWindow({
    id: id || `help-${request.id}`,
    request,
    executor,
    fromWin,
    toWin,
    others: wins,
    fromLabel: windowLabel(fromWin) || (requesterAgentId ? agentName(requesterAgentId) : null),
    toLabel: toWin ? windowLabel(toWin) : request.cardName,
    createdBy: requesterAgentId ? `agent:${requesterAgentId}` : null,
  });
  if (busy) card.y += busy * 28;
  // The asking agent is still waiting inside its tool call: it gets the
  // answer there, so browsers must not also post it into its chat.
  if (awaitingTool) card.awaitingTool = true;
  if (!upsertWindowInDoc(doc, card)) return null;
  const root = doc.getMap(CANVAS_ROOT);
  let links = root.get('links');
  if (!(links instanceof Y.Array)) {
    links = new Y.Array();
    root.set('links', links);
  }
  const fresh = helpCardLinks(card, makeId);
  if (fresh.length) links.push(fresh.map((link) => valueToY(link)));
  return card;
}

export async function placeHelpCard(workspaceId, input) {
  let card = null;
  try {
    await transactCanvasDoc(workspaceId, (doc) => { card = placeHelpCardInDoc(doc, input); });
  } catch (error) {
    log.warn('help card not placed', { workspaceId, requestId: input?.request?.id, error: error.message });
  }
  return card;
}

/** Merge a patch into a card that is already on the board. */
export async function patchHelpCard(workspaceId, cardId, patch) {
  try {
    let found = false;
    await transactCanvasDoc(workspaceId, (doc) => {
      const current = readDocWindows(doc).find((win) => win.id === cardId);
      if (!current) return;
      found = true;
      upsertWindowInDoc(doc, { ...current, ...patch, updatedAt: new Date().toISOString() });
    });
    return found;
  } catch (error) {
    log.warn('help card not updated', { workspaceId, cardId, error: error.message });
    return false;
  }
}

/** Read one card off the board (null when it is gone or there is no board). */
export async function readHelpCard(workspaceId, cardId) {
  let reader = null;
  try {
    reader = await openCanvasDocReader(workspaceId);
    return reader ? readDocWindows(reader.doc).find((win) => win.id === cardId) || null : null;
  } catch {
    return null;
  } finally {
    try { await reader?.close(); } catch { /* already closed */ }
  }
}

/** After the tool call returns: record the outcome the agent already received. */
export async function settleHelpCard(workspaceId, card, request) {
  if (!card || !request) return false;
  const answered = request.status === 'completed';
  return patchHelpCard(workspaceId, card.id, {
    awaitingTool: false,
    status: request.status || card.status,
    result: clipResult(request.result),
    error: request.error ? String(request.error).slice(0, 500) : null,
    ...(Array.isArray(request.tools) && request.tools.length ? { tools: request.tools } : {}),
    ...(request.receipt ? { receipt: request.receipt } : {}),
    ...(answered ? { deliveredAt: new Date().toISOString() } : {}),
  });
}

/** cardId -> windows on this board running that agent, e.g. { "agent:sage": [{ window_id, kind }] }. */
export function boardAgentsFromWindows(wins) {
  const byCard = {};
  for (const win of wins) {
    if (!AGENT_WINDOW_KINDS.has(win.kind) || !win.agentId) continue;
    const cardId = `agent:${String(win.agentId).toLowerCase()}`;
    (byCard[cardId] ||= []).push({ window_id: win.id, kind: win.kind });
  }
  return byCard;
}

export async function boardAgents(workspaceId) {
  let reader = null;
  try {
    reader = await openCanvasDocReader(workspaceId);
    return reader ? boardAgentsFromWindows(readDocWindows(reader.doc)) : {};
  } catch (error) {
    log.warn('board agents unavailable', { workspaceId, error: error.message });
    return {};
  } finally {
    try { await reader?.close(); } catch { /* already closed */ }
  }
}
