import { FAMILY_AGENT_BY_ID } from '../../../src/data/family-agents.js';

export const CANONICAL_AGENT_IMMUTABLE = 'CANONICAL_AGENT_IMMUTABLE';

export function canonicalAgentId(value) {
  const id = String(value || '').trim().toLowerCase();
  return Object.hasOwn(FAMILY_AGENT_BY_ID, id) ? id : null;
}

export function rejectCanonicalAgentMutation(res, candidateId) {
  const agentId = canonicalAgentId(candidateId);
  if (!agentId) return false;

  res.status(409).json({
    error: 'Canonical family agents are product-owned and cannot be modified at runtime.',
    code: CANONICAL_AGENT_IMMUTABLE,
    agentId,
  });
  return true;
}
