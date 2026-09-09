import { configurationWorkspaceQuery, readConfigurationResponse } from './agentConfiguration.js';

export async function getMindsets() {
  return readConfigurationResponse(await fetch('/api/mindsets'), 'Mindset request failed');
}

export async function getAgentMindsets(agentId, workspaceId) {
  const scope = configurationWorkspaceQuery(workspaceId);
  return readConfigurationResponse(
    await fetch(`/api/agents/${encodeURIComponent(agentId)}/mindsets?${scope}`),
    'Mindset request failed',
  );
}

export async function saveAgentMindsets(agentId, mindsetIds, workspaceId) {
  try {
    return await readConfigurationResponse(await fetch(`/api/agents/${encodeURIComponent(agentId)}/mindsets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mindsets: mindsetIds, workspaceId }),
    }), 'Mindset request failed');
  } catch (error) {
    return { ok: false, error: error.message, code: error.code || 'MINDSET_SAVE_FAILED' };
  }
}
