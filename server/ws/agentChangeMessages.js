// server/ws/agentChangeMessages.js
//
// An agent saved with another model (a chat's model chip, Auto-pick, the
// agent's own window): the browser that saved it tells the board, and
// everyone else on the board fetches the agents again
// (src/lib/collaboration/agentChanges.js), so their open copies of the chat
// show the new model at once. Only the agent's id travels; each browser reads
// the agent itself through /api/agents.
//
//   agent.changed  member -> other members   { agentId }
//
// Members only: guests hold no agents, and spectators send nothing.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { isMember } from './liveShowMessages.js';

export const AGENT_CHANGED = 'agent.changed';
const AGENT_ID = /^[a-zA-Z0-9._:-]{1,96}$/;

// One browser's changes go out at most this often. One said sooner waits
// for the gap, and only the latest of those goes out then: teammates fetch
// every agent again anyway, and the last save is never lost.
const MIN_GAP_MS = 250;
const lastSent = new Map();
const waiting = new Map();

function publish({ context, agentId }) {
  publishWorkspaceEvent(context.workspaceId, {
    type: AGENT_CHANGED, agentId, clientId: context.clientId, actor: context.actor,
  }, { excludeClientId: context.clientId, filter: isMember });
}

/** Handles agent.changed; returns false for any other type. */
export function handleAgentChangeMessage(message, context, sendJson, now = Date.now()) {
  if (message?.type !== AGENT_CHANGED) return false;
  if (context.spectator || !isMember(context)) return true;
  const agentId = String(message.agentId || '');
  if (!AGENT_ID.test(agentId)) {
    sendJson(context.ws, { type: 'error', reason: 'invalid-agent-change' });
    return true;
  }
  const key = `${context.workspaceId}:${context.clientId}`;
  const due = (lastSent.get(key) ?? -Infinity) + MIN_GAP_MS;
  if (now >= due && !waiting.has(key)) {
    if (lastSent.size > 5000) lastSent.clear();
    lastSent.set(key, now);
    publish({ context, agentId });
    return true;
  }
  if (!waiting.has(key)) {
    const entry = { latest: null };
    entry.timer = setTimeout(() => {
      waiting.delete(key);
      lastSent.set(key, due);
      publish(entry.latest);
    }, Math.max(0, due - now));
    entry.timer.unref?.();
    waiting.set(key, entry);
  }
  waiting.get(key).latest = { context, agentId };
  return true;
}

export function __resetAgentChangeRelayForTests() {
  for (const entry of waiting.values()) clearTimeout(entry.timer);
  waiting.clear();
  lastSent.clear();
}
