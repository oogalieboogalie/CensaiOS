import { HOST_CHANGING_TOOL_NAMES } from './hostOwnerOnly.js';

// Kept in step with RAW_DATABASE_TOOL_NAMES in runtimeAccess.js. Importing
// that module here would pull the workspace lookup into every sub-agent route
// test that replaces the lookup.
export const SUB_AGENT_DATABASE_TOOLS = Object.freeze([
  'postgres_query',
  'postgres_exec_file',
]);

const OWNER_ONLY_TOOLS = new Set([
  ...HOST_CHANGING_TOOL_NAMES,
  ...SUB_AGENT_DATABASE_TOOLS,
]);

function denied() {
  const error = new Error('Those tools are not allowed for this role.');
  error.statusCode = 403;
  error.code = 'SUB_AGENT_TOOL_SCOPE_DENIED';
  return error;
}

async function definedToolNames() {
  const { TOOL_DEFINITIONS } = await import('../definitions.js');
  return new Set(TOOL_DEFINITIONS.map((tool) => tool.function?.name).filter(Boolean));
}

/** Tool names this editor may store on a sub-agent. Anything else is refused. */
export async function subAgentToolAllowlist({ systemRole } = {}) {
  const defined = await definedToolNames();
  if (String(systemRole || '').trim().toLowerCase() === 'admin') return defined;
  return new Set([...defined].filter((name) => !OWNER_ONLY_TOOLS.has(name)));
}

/**
 * Refuse a tool_scopes value that names a tool outside the editor's allowlist.
 * A missing list is the default set and is allowed. A list is kept only when
 * every name is allowed; nothing is silently dropped.
 */
export async function assertSubAgentToolScopes(scopes, editor = {}) {
  if (scopes == null) return;
  if (typeof scopes !== 'object' || Array.isArray(scopes)) throw denied();
  if (!Object.prototype.hasOwnProperty.call(scopes, 'tools') || scopes.tools == null) return;
  if (!Array.isArray(scopes.tools)) throw denied();
  const allowed = await subAgentToolAllowlist(editor);
  for (const name of scopes.tools) {
    if (typeof name !== 'string' || !allowed.has(name)) throw denied();
  }
}
