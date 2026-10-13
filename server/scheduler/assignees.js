function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function findExactOrName(requested, agents) {
  const exact = agents.find((agent) => normalize(agent.id) === requested);
  if (exact) return exact;
  return agents.find((agent) => normalize(agent.name) === requested) || null;
}

export function resolveScheduledAssignee(requestedAgentId, coreAgents = [], subAgents = []) {
  const requested = normalize(requestedAgentId);
  if (!requested) return null;

  const core = findExactOrName(requested, coreAgents);
  if (core) return { kind: 'core_agent', id: core.id };

  const subAgent = findExactOrName(requested, subAgents)
    || subAgents.find((agent) => normalize(agent.id).startsWith(`${requested}-`));
  return subAgent ? { kind: 'sub_agent', id: subAgent.id } : null;
}

export function resolveScheduledAssigneeId(requestedAgentId, subAgents = []) {
  return resolveScheduledAssignee(requestedAgentId, [], subAgents)?.id || null;
}
