import pool from '../../db.js';
import { getAgent, getSubAgentById } from '../../memory.js';
import { TOOL_DEFINITIONS } from '../definitions.js';
import { loadWorkspaceCapabilityToolNames } from '../../capabilities/workspaceCapabilities.js';
import { TOOL_DISCOVERY_NAMES } from '../definitions/discovery.js';
import { 
  AGENT_CLASS_TOOL_WHITELIST, 
  SUB_AGENT_TOOL_WHITELIST, 
  FULL_TOOL_ACCESS_AGENT_IDS, 
  CORE_AGENT_TOOL_WHITELIST,
  TASK_SUBMISSION_GATED_TOOLS 
} from './constants.js';
import { canExposeRawDatabaseTools, isRawDatabaseTool } from './runtimeAccess.js';
import { FAMILY_AGENT_BY_ID } from '../../../src/data/family-agents.js';

export async function hasUnreadTaskSubmission(agentId, context = {}) {
  if (!context.workspaceId) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM agent_messages WHERE to_agent = $1 AND read_at IS NULL
       AND workspace_id = $2
       AND (message_type = 'task_submission' OR subject ILIKE 'Task submitted:%' OR subject ILIKE 'Squad complete:%')
     LIMIT 1`,
    [agentId, context.workspaceId]
  );
  return rows.length > 0;
}

export function appendToolsByName(tools, names) {
  const seen = new Set(tools.map(tool => tool.function.name));
  const additions = TOOL_DEFINITIONS.filter(tool => names.includes(tool.function.name) && !seen.has(tool.function.name));
  return [...tools, ...additions];
}

export async function filterToolsForAgent(agentId, context = {}) {
  let matched = [];
  try {
    const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
    const scopedCanonical = Boolean(context.workspaceId && !sub && FAMILY_AGENT_BY_ID[agentId]);
    let toolScopes = null;
    let allowedDefaults = [];

    if (sub) {
      const classList = sub.class ? AGENT_CLASS_TOOL_WHITELIST[sub.class] : null;
      const tierList = SUB_AGENT_TOOL_WHITELIST[sub.permission || 'worker'];
      allowedDefaults = classList || tierList || [];
      toolScopes = sub.tool_scopes;
    } else if (FULL_TOOL_ACCESS_AGENT_IDS.has(agentId)) {
      allowedDefaults = TOOL_DEFINITIONS.map(t => t.function.name);
    } else if (CORE_AGENT_TOOL_WHITELIST[agentId]) {
      allowedDefaults = CORE_AGENT_TOOL_WHITELIST[agentId];
      const agent = await getAgent(agentId);
      toolScopes = agent?.tool_scopes;
    } else {
      const agent = await getAgent(agentId);
      toolScopes = agent?.tool_scopes;
      allowedDefaults = [
        'remember', 'recall', 'feeling', 'message_to', 'reply_to', 'read_messages',
        'lead_save', 'lead_list', 'lead_status',
        'project_read', 'project_list', 'read_brief', 'report'
      ];
    }

    // Add only capability modules owned by the authenticated runtime workspace.
    // Legacy global agent_capabilities rows are intentionally quarantined.
    let additionalTools = [];
    if (scopedCanonical) {
      try {
        additionalTools = await loadWorkspaceCapabilityToolNames(pool, {
          workspaceId: context.workspaceId,
          agentId,
        });
      } catch (dbErr) {
        console.warn(`[Capabilities] Failed to fetch scoped capabilities for agent ${agentId}:`, dbErr.message);
      }
    }

    const allowed = new Set([...allowedDefaults, ...additionalTools]);
    matched = TOOL_DEFINITIONS.filter(t => allowed.has(t.function.name));

    // Global legacy scopes are not workspace grants. In a signed canonical
    // workspace, the reviewed module rows above are the only additive path.
    if (!scopedCanonical) {
      const selectedTools = Array.isArray(toolScopes?.tools) ? toolScopes.tools.filter(Boolean) : [];
      if (toolScopes?.mode === 'custom' && selectedTools.length > 0) {
        const selected = new Set(selectedTools);
        matched = TOOL_DEFINITIONS.filter(t => selected.has(t.function.name));
      } else if (selectedTools.length > 0) {
        const selected = new Set(selectedTools);
        matched = matched.filter(t => selected.has(t.function.name));
      }
    }

    if (!sub && await hasUnreadTaskSubmission(agentId, context)) {
      matched = appendToolsByName(matched, TASK_SUBMISSION_GATED_TOOLS);
    }

    if (matched.some(tool => isRawDatabaseTool(tool.function.name))
      && !await canExposeRawDatabaseTools(pool, context)) {
      matched = matched.filter(tool => !isRawDatabaseTool(tool.function.name));
    }
  } catch (error) {
    console.warn(`[Tools] Failed closed while resolving permissions for ${agentId}:`, error.message);
  }

  matched = appendToolsByName(matched, TOOL_DISCOVERY_NAMES);
  return matched.map(({ type, function: fn }) => ({ type, function: fn }));
}
