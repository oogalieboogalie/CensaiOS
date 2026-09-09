import { FAMILY_AGENT_BY_ID } from '../../../src/data/family-agents.js';
import { filterToolsForAgent } from './checks.js';

export class ToolNotAvailableError extends Error {
  constructor(toolName) {
    super(`Tool ${toolName} is not active for this agent in this workspace.`);
    this.name = 'ToolNotAvailableError';
    this.code = 'TOOL_NOT_AVAILABLE';
    this.statusCode = 403;
  }
}

export async function assertFamilyToolAvailable(agentId, toolName, context = {}) {
  const canonicalId = String(agentId || '').trim().toLowerCase();
  const workspaceId = String(context.workspaceId || '').trim();
  if (!workspaceId || !FAMILY_AGENT_BY_ID[canonicalId]) {
    return { enforced: false };
  }

  const tools = await filterToolsForAgent(canonicalId, context);
  const active = tools.some(tool => tool.function?.name === toolName);
  if (!active) throw new ToolNotAvailableError(toolName);
  return { enforced: true };
}
