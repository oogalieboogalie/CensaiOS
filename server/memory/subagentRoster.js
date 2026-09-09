import { getSubAgents } from './subagents.js';

export function formatSubAgentRoster(subAgents) {
  if (!subAgents.length) {
    return [
      '## Your sub-agent roster',
      'You have no active sub-agents.',
    ].join('\n');
  }
  const lines = [
    '## Your sub-agent roster',
    `You already have ${subAgents.length} active sub-agent(s). Reuse them before creating another.`,
    'Call `list_sub_agents` when you need fuller details. Do not create a one-off agent when an existing role can do the work.',
  ];
  for (const sub of subAgents) {
    const type = sub.class || sub.permission || 'worker';
    const project = sub.project_id ? ` @ ${sub.project_id}` : '';
    const purpose = sub.specialty || sub.role || 'general work';
    lines.push(`- ${sub.name} [${type}${project}]: ${purpose}`);
  }
  return lines.join('\n');
}

export async function buildSubAgentRosterPrompt(agentId, scope = {}) {
  if (!String(scope.workspaceId ?? scope.workspace_id ?? '').trim()) return formatSubAgentRoster([]);
  return formatSubAgentRoster(await getSubAgents(agentId, scope));
}
