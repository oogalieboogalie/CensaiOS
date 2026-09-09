import { configurationWorkspaceQuery, readConfigurationResponse } from './agentConfiguration.js';

export async function getAgentCapabilities(agentId, workspaceId) {
  const scope = configurationWorkspaceQuery(workspaceId);
  return readConfigurationResponse(
    await fetch(`/api/agents/${encodeURIComponent(agentId)}/capabilities?${scope}`),
    'Agent modules could not be loaded.',
  );
}

export async function saveAgentCapabilities(agentId, modules, workspaceId) {
  return readConfigurationResponse(await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/capabilities`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, modules }),
    },
  ), 'The module selection was not saved.');
}

export async function getAgentDebugTools(agentId, workspaceId) {
  const scope = configurationWorkspaceQuery(workspaceId);
  return readConfigurationResponse(
    await fetch(`/api/agents/${encodeURIComponent(agentId)}/debug-tools?${scope}`),
    'Agent tools could not be loaded.',
  );
}
