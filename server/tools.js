import { TOOL_REGISTRY } from './tools/handlers/index.js';
import { createLogger } from './logger.js';
import { initializeDynamicTools } from './tools/dynamicRegistry.js';
import { initializeMcpTools, shutdownMcpTools } from './tools/mcpClient.js';
import pool from './db.js';
import { assertAgentRepoAccess } from './workspaces/projectMemberships.js';
import { getSubAgentById } from './memory.js';
import { safeToolLogMetadata } from './operational-intelligence/tracePrivacy.js';
import { authorizeToolInvocation } from './tools/rbac/runtimeAccess.js';
import { requestToolApprovalIfRequired } from './approvals/requests.js';
import { assertApprovedToolExecution } from './approvals/decisions.js';
import { assertFamilyToolAvailable } from './tools/rbac/executionBoundary.js';

export { TOOL_DEFINITIONS, filterToolsForAgent, listToolCatalog } from './tools/definitions.js';
export { initializeDynamicTools, initializeMcpTools, shutdownMcpTools };

const log = createLogger('tools');

const RESTRICTED_FILES = ['.env', '.git', 'secrets.json'];
const PROJECT_WORK_TOOLS = new Set([
  'open_project', 'refresh_brief', 'project_write', 'project_edit', 'project_multi_edit',
  'report', 'submit_pr', 'jules_submit', 'merge_pr', 'local_write_file', 'sandbox_exec',
  'run_tests', 'run_linter', 'local_git_fetch', 'local_git_pull_ff_only',
  'local_git_checkpoint', 'local_git_verify', 'github_write_file', 'github_create_issue',
  'github_comment_issue',
]);
const DIRECT_REPO_TOOLS = new Set([
  'github_read_file', 'github_write_file', 'github_list_issues',
  'github_create_issue', 'github_comment_issue',
]);

// ═══════════════════════════════════════════════════════════════════
//  TOOL EXECUTOR ORCHESTRATOR
//  Dynamic entry point routing calls to specialized domain handlers.
// ═══════════════════════════════════════════════════════════════════

function securityTripwire(agentId, name, args) {
  // SECURITY TRIPWIRE
  const isWriteTool = ['local_write_file', 'project_write', 'project_edit', 'project_multi_edit', 'github_write_file', 'run_shell_command', 'run_host_script'].includes(name);
  if (isWriteTool) {
    const rawTarget = args?.file_path || args?.path || args?.command || '';
    const targetLower = String(rawTarget).toLowerCase();
    const isRestricted = RESTRICTED_FILES.some(restricted => targetLower.includes(restricted));

    if (isRestricted) {
      log.warn('security tripwire blocked tool execution', {
        agentId, name, ...safeToolLogMetadata(name, args),
      });
      return `SECURITY VIOLATION: You are strictly forbidden from modifying or accessing ${rawTarget}. Tell the user to do this manually.`;
    }
  }
  return null;
}

async function executeRegisteredTool(agentId, name, args, context) {
  const handler = TOOL_REGISTRY[name];
  if (!handler) {
    log.warn('unknown tool requested', { agentId, name });
    return `Unknown tool: ${name}`;
  }

  const done = log.startTimer();
  try {
    await authorizeToolInvocation(pool, { name, context });
    log.debug('tool call', { agentId, name, ...safeToolLogMetadata(name, args) });
    const requiredProjectPermission = PROJECT_WORK_TOOLS.has(name) ? 'work' : 'read';
    if (context.workspaceId && DIRECT_REPO_TOOLS.has(name)) {
      const sub = await getSubAgentById(agentId, context);
      await assertAgentRepoAccess(pool, {
        workspaceId: context.workspaceId,
        repo: args?.repo,
        agentId: sub?.parent_id || agentId,
        requiredPermission: requiredProjectPermission,
      });
    }
    const result = await handler(agentId, name, args, {
      ...context,
      requiredProjectPermission,
    });
    const resultLength = typeof result === 'string' ? result.length : undefined;
    log.info('tool ok', { agentId, name, ms: done(), resultLength });
    return result;
  } catch (err) {
    log.error('tool failed', { agentId, name, ms: done(), failed: true });
    const code = err?.code === 'TOOL_ACCESS_DENIED' || err?.code === 'TOOL_ACCESS_UNAVAILABLE'
      ? `${err.code}: `
      : '';
    return `Error: ${code}${err.message}`;
  }
}

export async function executeTool(agentId, name, args, context = {}) {
  const blocked = securityTripwire(agentId, name, args);
  if (blocked) return blocked;
  try {
    await assertFamilyToolAvailable(agentId, name, context);
    const gate = await requestToolApprovalIfRequired(pool, { agentId, toolName: name, args, context });
    if (gate.required) {
      return `APPROVAL_REQUIRED: ${gate.approval.id} is pending owner/admin review. No action was executed.`;
    }
  } catch (error) {
    return `Error: ${error.code ? `${error.code}: ` : ''}${error.message}`;
  }
  return executeRegisteredTool(agentId, name, args, context);
}

export async function executeApprovedTool(agentId, name, args, context = {}, approvalId) {
  const blocked = securityTripwire(agentId, name, args);
  if (blocked) return blocked;
  try {
    await assertApprovedToolExecution(pool, { approvalId, agentId, toolName: name, args, context });
  } catch (error) {
    return `Error: ${error.code ? `${error.code}: ` : ''}${error.message}`;
  }
  return executeRegisteredTool(agentId, name, args, context);
}
