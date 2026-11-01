// server/workflows/board.js
//
// A workflow's own window on the board: reading its graph, writing each
// step's live status back into it, and dropping result cards next to it.
// Everything goes through the live canvas document, so every teammate with
// the board open watches the run happen. None of these throw.

import { randomUUID } from 'crypto';
import * as Y from 'yjs';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { openCanvasDocReader, transactCanvasDoc } from '../collab/liveDoc.js';
import { upsertWindowInDoc } from '../collab/serverWriter.js';
import { valueToY } from '../collab/seedFromSnapshot.js';
import { CANVAS_ROOT } from '../collab/ySchema.js';
import { readDocWindows } from '../agent-registry/helpCards.js';
import { clip } from '../../src/lib/workflow/graph.js';

const log = createLogger('workflows');

export const CARD_SIZE = Object.freeze({ w: 420, h: 340 });
const CARD_GAP = 40;

export async function readBoardWindows(workspaceId) {
  let reader = null;
  try {
    reader = await openCanvasDocReader(workspaceId);
    return reader ? readDocWindows(reader.doc) : null;
  } catch (error) {
    log.warn('board not readable', { workspaceId, code: safeErrorCode(error) });
    return null;
  } finally {
    try { await reader?.close(); } catch { /* already closed */ }
  }
}

export async function readWorkflowWindow(workspaceId, windowId) {
  const wins = await readBoardWindows(workspaceId);
  return wins?.find((win) => win.id === windowId && win.kind === 'workflow') || null;
}

/** Merge a patch into the workflow window (run status lives in `run`). */
export async function patchWorkflowWindow(workspaceId, windowId, patch) {
  try {
    let found = false;
    await transactCanvasDoc(workspaceId, (doc) => {
      const current = readDocWindows(doc).find((win) => win.id === windowId);
      if (!current) return;
      found = true;
      upsertWindowInDoc(doc, { ...current, ...patch });
    });
    return found;
  } catch (error) {
    log.warn('workflow window not updated', { workspaceId, windowId, code: safeErrorCode(error) });
    return false;
  }
}

function slug(text) {
  return String(text || 'result').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'result';
}

/** Pure: where the next result card goes, to the right of the workflow, below earlier cards. */
export function cardSpot(flow, wins) {
  const x = Number(flow.x) + Number(flow.w) + CARD_GAP;
  const mine = wins.filter((win) => win.fromWorkflowId === flow.id);
  const lowest = mine.reduce((max, win) => Math.max(max, Number(win.y) + Number(win.h)), Number(flow.y) - CARD_GAP / 2);
  return { x, y: mine.length ? lowest + CARD_GAP / 2 : Number(flow.y) };
}

/** Pure: put a result card (a document) next to the workflow, joined by a line. */
export function placeResultCardInDoc(doc, { workflowWindowId, title, text, runId, makeId = randomUUID }) {
  const wins = readDocWindows(doc);
  const flow = wins.find((win) => win.id === workflowWindowId);
  if (!flow) return null;
  const spot = cardSpot(flow, wins);
  const card = {
    id: `wfcard-${makeId()}`,
    kind: 'doc',
    x: spot.x,
    y: spot.y,
    ...CARD_SIZE,
    fileName: `${slug(title)}.md`,
    text: clip(text, 20000),
    fromWorkflowId: flow.id,
    fromWorkflowRun: runId,
    createdBy: `workflow:${flow.id}`,
    createdAt: new Date().toISOString(),
  };
  if (!upsertWindowInDoc(doc, card)) return null;
  const root = doc.getMap(CANVAS_ROOT);
  let links = root.get('links');
  if (!(links instanceof Y.Array)) {
    links = new Y.Array();
    root.set('links', links);
  }
  links.push([valueToY({ id: makeId(), fromId: flow.id, toId: card.id, timestamp: Date.now() })]);
  return card;
}

export async function placeResultCard(workspaceId, input) {
  let card = null;
  try {
    await transactCanvasDoc(workspaceId, (doc) => { card = placeResultCardInDoc(doc, input); });
  } catch (error) {
    log.warn('result card not placed', { workspaceId, code: safeErrorCode(error) });
  }
  return card;
}
