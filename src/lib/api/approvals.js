import { configurationWorkspaceQuery, readConfigurationResponse } from './agentConfiguration.js';

export async function getToolApprovals(workspaceId, { status = '', limit = 100 } = {}) {
  const scope = configurationWorkspaceQuery(workspaceId);
  const query = new URLSearchParams({ limit: String(limit) });
  if (status) query.set('status', status);
  return readConfigurationResponse(
    await fetch(`/api/tool-approvals?${scope}&${query}`),
    'Tool approvals could not be loaded.',
  );
}

export async function decideToolApproval(approvalId, { workspaceId, decision, revision }) {
  return readConfigurationResponse(await fetch(
    `/api/tool-approvals/${encodeURIComponent(approvalId)}/decision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, decision, revision }),
    },
  ), 'The approval decision was not saved.');
}

export async function getAgentTrust(workspaceId) {
  return readConfigurationResponse(
    await fetch(`/api/agent-trust?${configurationWorkspaceQuery(workspaceId)}`),
    'Trust mode could not be loaded.',
  );
}

/** agentId omitted = the whole board; trusted null = that agent follows the board. */
export async function setAgentTrust({ workspaceId, agentId, trusted }) {
  return readConfigurationResponse(await fetch('/api/agent-trust', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, agentId, trusted }),
  }), 'Trust mode was not saved.');
}

export async function getAgentSpeakUp(workspaceId) {
  return readConfigurationResponse(
    await fetch(`/api/agent-speak-up?${configurationWorkspaceQuery(workspaceId)}`),
    'Speak up could not be loaded.',
  );
}

export async function setAgentSpeakUp({ workspaceId, agentId, enabled }) {
  return readConfigurationResponse(await fetch('/api/agent-speak-up', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, agentId, enabled }),
  }), 'Speak up was not saved.');
}

export async function getAgentWakeUps(workspaceId) {
  return readConfigurationResponse(
    await fetch(`/api/agent-wake-ups?${configurationWorkspaceQuery(workspaceId)}`),
    'Wake-ups could not be loaded.',
  );
}

export async function setAgentWakeUps({ workspaceId, agentId, enabled }) {
  return readConfigurationResponse(await fetch('/api/agent-wake-ups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, agentId, enabled }),
  }), 'Wake-ups were not saved.');
}
