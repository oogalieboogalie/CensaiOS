// Message router (server/routes/agents/agentRouter.js, diagram 03):
// read a request, cut it into parts and pick an agent, memory and template for each.
import { readConfigurationResponse } from './agentConfiguration.js';

export async function planRoute(workspaceId, text) {
  const response = await fetch('/api/agent-router/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, text }),
  });
  return readConfigurationResponse(response, 'The message router did not answer');
}
