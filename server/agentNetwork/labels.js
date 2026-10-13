// server/agentNetwork/labels.js
// Readable names for the two sides of a receipt.

import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';

export function agentLabel(agentId) {
  const id = String(agentId || '').trim().toLowerCase();
  if (!id) return null;
  return FAMILY_AGENT_BY_ID[id]?.name || id.charAt(0).toUpperCase() + id.slice(1);
}

/** requester = { kind: 'agent'|'user', id } from a help request. */
export function requesterLabel(requester) {
  if (requester?.kind === 'agent') return agentLabel(requester.id);
  return 'A person on this board';
}
