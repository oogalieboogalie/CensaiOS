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
