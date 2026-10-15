// Spec 7: board templates on the client. The server creates the template's
// agents on this board and returns its windows, groups and layout trees;
// this file lays them out with the canvas's own layout code (so they follow
// whatever group style the board uses) and adds them to the board, to the
// right of anything already there. Nothing on the board is replaced.

import { addAgent, getAgentById, updateAgent } from '../agentStore.js';
import { canvasObjectToLegacyWindow, getCanvasObjectType, patchWindow } from '../canvasObjectTypes.js';
import { cleanLayout, fitGroupToLayout, getGroupInnerBounds } from '../layoutAlgo.js';
import { PROPS_BY_KIND } from '../modules/addPaletteItems.js';

export const TEMPLATE_GAP = 240;

async function jsonOrThrow(res, fallback) {
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = new Error(body?.error || fallback);
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return body;
}

export async function fetchBoardTemplates() {
  const body = await jsonOrThrow(await fetch('/api/board-templates', { credentials: 'include' }), 'Templates are unavailable.');
  return body.templates || [];
}

export async function requestBoardTemplate(templateId, { workspaceId, models = 'default', ollamaModel = '' } = {}) {
  const res = await fetch(`/api/board-templates/${encodeURIComponent(templateId)}/apply`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, models, ollamaModel }),
  });
  const body = await jsonOrThrow(res, 'The template could not be set up.');
  return body.board;
}

/** Right edge and top of what is on the board already (null when empty). */
export function contentEdge(wins = [], groups = []) {
  const items = [...wins, ...groups].filter(i => [i?.x, i?.y, i?.w, i?.h].every(Number.isFinite));
  if (!items.length) return null;
  return {
    right: Math.max(...items.map(i => i.x + i.w)),
    top: Math.min(...items.map(i => i.y)),
  };
}

/**
 * Turn the server's board into canvas records: groups moved next to the
 * existing content and fitted to their layout trees, windows placed in
 * their tiles. Pure, so it can be tested.
 */
export function layoutTemplateBoard(board, { wins = [], canvasGroups = [], now = new Date().toISOString() } = {}) {
  const edge = contentEdge(wins, canvasGroups);
  const origin = edge ? { x: Math.round(edge.right + TEMPLATE_GAP), y: Math.round(edge.top) } : { x: 0, y: 0 };
  const placements = new Map();
  const groups = (board.groups || []).map((raw) => {
    const { hotkey, root, ...rest } = raw;
    const fitted = fitGroupToLayout({ ...rest, x: raw.x + origin.x, y: raw.y + origin.y }, root);
    cleanLayout(root, getGroupInnerBounds(fitted)).forEach(update => placements.set(update.id, update.patch));
    // Agent records ride on the groups (which every collaborator syncs), so
    // a teammate opening the board sees the agents' names and starters too.
    return { ...fitted, root, hotkey, templateId: board.templateId, templateAgents: board.agents || [] };
  });
  const windows = (board.windows || []).map((raw) => {
    const place = placements.get(raw.id) || { x: origin.x, y: origin.y, w: 480, h: 420 };
    return canvasObjectToLegacyWindow(patchWindow({
      type: getCanvasObjectType({ type: raw.kind }),
      zIndex: null,
      state: {},
      metadata: {},
      createdBy: null,
      lockedBy: null,
      createdAt: now,
      updatedAt: now,
      // Windows the server only names (a blank sheet, a vector artwork) get
      // the same starter document the Add menu gives them.
      ...(PROPS_BY_KIND[raw.kind] || {}),
      ...raw,
    }, { x: place.x, y: place.y, w: place.w, h: place.h }));
  });
  return { windows, groups };
}

/** Register the template's agents so chat windows show their names and starters. */
export function registerTemplateAgents(agents = [], createAgentRecord) {
  for (const agent of agents) {
    if (getAgentById(agent.id)) updateAgent(agent);
    else addAgent(agent);
    createAgentRecord?.(agent);
  }
}

/** Every template agent named on the board's groups, deduplicated by id. */
export function templateAgentsOnBoard(canvasGroups = []) {
  const byId = new Map();
  for (const group of canvasGroups) {
    for (const agent of Array.isArray(group?.templateAgents) ? group.templateAgents : []) {
      if (agent?.id && !byId.has(agent.id)) byId.set(agent.id, agent);
    }
  }
  return [...byId.values()];
}
