// WeeWoo: choose_avatar writes the agent's avatar onto its window in the
// live canvas doc, so every teammate's WeeWoo office redraws it at once.
// The chat window the agent is talking in gets it; with no window in
// context, every window of that agent on the board does.

import { transactCanvasDoc } from '../../collab/liveDoc.js';
import { upsertWindowInDoc } from '../../collab/serverWriter.js';
import { readDocWindows } from '../../agent-registry/helpCards.js';
import { normalizeAvatar } from '../../../src/lib/weewoo/avatarParts.js';

const AGENT_KINDS = new Set(['chat', 'agent']);

/** Pure: put the avatar on the agent's windows in a doc. Returns how many changed. */
export function applyAvatarInDoc(doc, { agentId, windowId = null, avatar }) {
  const id = String(agentId || '').toLowerCase();
  const wins = readDocWindows(doc);
  const exact = windowId ? wins.filter((win) => win.id === windowId && AGENT_KINDS.has(win.kind)) : [];
  const targets = exact.length ? exact : wins.filter((win) => AGENT_KINDS.has(win.kind) && String(win.agentId || '').toLowerCase() === id);
  let changed = 0;
  for (const win of targets) if (upsertWindowInDoc(doc, { ...win, avatar })) changed += 1;
  return changed;
}

export async function handleWeewooTool(agentId, name, args = {}, context = {}) {
  return JSON.stringify(await chooseAvatar(agentId, name, args, context));
}

async function chooseAvatar(agentId, name, args, context) {
  if (name !== 'choose_avatar') return { error: `Unknown WeeWoo tool: ${name}` };
  const workspaceId = String(context?.workspaceId || '').trim();
  if (!workspaceId) return { error: 'Choosing an avatar needs a board (workspace) context.' };
  const avatar = normalizeAvatar({ ...args, by: 'agent' });
  if (!avatar) return { error: 'Pick a body from the list and a color name or #rrggbb hex color.' };
  let changed = 0;
  try {
    await transactCanvasDoc(workspaceId, (doc) => { changed = applyAvatarInDoc(doc, { agentId, windowId: context.windowId || null, avatar }); });
  } catch (error) {
    return { error: `The board could not be updated: ${error.message}` };
  }
  if (!changed) return { ok: false, avatar, note: 'You have no window on this board right now, so there was nothing to show it on.' };
  return { ok: true, avatar, windows: changed, note: 'Saved. Everyone on the board sees your new avatar in the WeeWoo office.' };
}
