export function requireAgentConfigurationWorkspace(workspaceId) {
  const value = String(workspaceId || '').trim();
  if (!value) throw new Error('Open a workspace to configure this agent.');
  return value;
}

export function configurationWorkspaceQuery(workspaceId) {
  return `workspaceId=${encodeURIComponent(requireAgentConfigurationWorkspace(workspaceId))}`;
}

export async function readConfigurationResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.error || fallbackMessage), {
      status: response.status,
      code: body.code || 'AGENT_CONFIGURATION_REQUEST_FAILED',
    });
  }
  return body;
}
