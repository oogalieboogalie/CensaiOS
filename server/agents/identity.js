import {
  FAMILY_AGENT_BY_ID,
  FAMILY_AGENT_IDS,
  familyAgentCardId,
} from '../../src/data/family-agents.js';

const DEVELOPMENT_ID = /(^|[-_])(test|dev|fixture|sandbox|tmp)([-_]|$)/i;

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

export function classifyAgentIdentity(agent = {}) {
  const id = normalized(agent.id);
  const core = FAMILY_AGENT_BY_ID[id];
  if (core) {
    return { class: 'family', betaVisible: true, canonicalId: id, cardId: familyAgentCardId(id) };
  }
  if (DEVELOPMENT_ID.test(id) || DEVELOPMENT_ID.test(agent.name)) {
    return { class: 'development', betaVisible: false, canonicalId: null, cardId: null };
  }
  const nameMatch = FAMILY_AGENT_IDS.find((familyId) => {
    const family = FAMILY_AGENT_BY_ID[familyId];
    return normalized(agent.name) === normalized(family.name)
      || normalized(agent.name) === normalized(family.name).replace(/^the /, '');
  });
  if (nameMatch || FAMILY_AGENT_IDS.some((familyId) => id.startsWith(`${familyId}-`))) {
    return { class: 'duplicate', betaVisible: false, canonicalId: nameMatch || id.split('-')[0], cardId: null };
  }
  return { class: 'unregistered', betaVisible: false, canonicalId: null, cardId: null };
}

export function withIdentityClassification(agent) {
  return { ...agent, identity: classifyAgentIdentity(agent) };
}

export function betaVisibleAgents(agents = []) {
  return agents.map(withIdentityClassification).filter((agent) => agent.identity.betaVisible);
}
