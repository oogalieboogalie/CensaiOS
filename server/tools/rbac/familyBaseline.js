const policy = (name, risk, mode = 'autonomous') => Object.freeze({ name, risk, mode });

export const FAMILY_INTRINSIC_TOOL_POLICIES = Object.freeze([
  policy('remember', 'write', 'autonomous_internal'),
  policy('recall', 'read'),
  policy('deep_memory', 'read'),
  policy('feeling', 'write', 'autonomous_internal'),
  policy('message_to', 'write', 'autonomous_internal'),
  policy('reply_to', 'write', 'autonomous_internal'),
  policy('read_messages', 'read'),
  policy('lead_save', 'write', 'autonomous_internal'),
  policy('lead_list', 'read'),
  policy('lead_status', 'write', 'autonomous_internal'),
  policy('report', 'write', 'autonomous_internal'),
  policy('task_done', 'write', 'autonomous_internal'),
]);

export const FAMILY_ORCHESTRATION_TOOL_POLICIES = Object.freeze([
  policy('submit_agent_task', 'write', 'autonomous_internal'),
  policy('dispatch_squad', 'write', 'autonomous_internal'),
  policy('squad_status', 'read'),
]);

// Sub-agent lifecycle: every family member can provision, list, and retire
// their own workers/scouts on demand (server reuses roster first).
export const FAMILY_LIFECYCLE_TOOL_POLICIES = Object.freeze([
  policy('create_sub_agent', 'write', 'autonomous_internal'),
  policy('list_sub_agents', 'read'),
  policy('remove_sub_agent', 'write', 'autonomous_internal'),
]);

// Read-only project access: every family member can look.
export const FAMILY_PROJECT_READ_TOOL_POLICIES = Object.freeze([
  policy('project_list', 'read'),
  policy('project_read', 'read'),
  policy('project_file_outline', 'read'),
  policy('read_brief', 'read'),
]);

// Build access: write/edit/test/run scoped to authorized projects
// (handlers enforce project membership; tripwire guards secrets).
export const FAMILY_BUILD_TOOL_POLICIES = Object.freeze([
  policy('project_write', 'write', 'autonomous_internal'),
  policy('project_edit', 'write', 'autonomous_internal'),
  policy('refresh_brief', 'write', 'autonomous_internal'),
  policy('run_tests', 'write', 'autonomous_internal'),
  policy('run_linter', 'write', 'autonomous_internal'),
]);

const CORE = FAMILY_INTRINSIC_TOOL_POLICIES.map(entry => entry.name);
const ORCHESTRATION = FAMILY_ORCHESTRATION_TOOL_POLICIES.map(entry => entry.name);
const LIFECYCLE = FAMILY_LIFECYCLE_TOOL_POLICIES.map(entry => entry.name);
const PROJECT_READ = FAMILY_PROJECT_READ_TOOL_POLICIES.map(entry => entry.name);
const BUILD = FAMILY_BUILD_TOOL_POLICIES.map(entry => entry.name);

const BUILDERS = Object.freeze([...ORCHESTRATION, ...LIFECYCLE, ...PROJECT_READ, ...BUILD]);

const ROLE_ADDITIONS = Object.freeze({
  architect: BUILDERS,
  atlas: BUILDERS,
  genesis: BUILDERS,
  nexus: BUILDERS,
  phoenix: BUILDERS,
  echo: Object.freeze(['dispatch_squad', 'squad_status', ...LIFECYCLE, ...PROJECT_READ]),
  censai: Object.freeze([...LIFECYCLE, ...PROJECT_READ]),
  foundation: Object.freeze([...LIFECYCLE, ...PROJECT_READ]),
  guardian: Object.freeze([...LIFECYCLE, ...PROJECT_READ]),
});

export const FAMILY_DEFAULT_TOOL_NAMES = Object.freeze(Object.fromEntries(
  Object.entries(ROLE_ADDITIONS).map(([agentId, additions]) => [
    agentId,
    Object.freeze([...new Set([...CORE, ...additions])]),
  ]),
));

const POLICY_BY_NAME = Object.freeze(Object.fromEntries(
  [...FAMILY_INTRINSIC_TOOL_POLICIES, ...FAMILY_ORCHESTRATION_TOOL_POLICIES,
   ...FAMILY_LIFECYCLE_TOOL_POLICIES, ...FAMILY_PROJECT_READ_TOOL_POLICIES,
   ...FAMILY_BUILD_TOOL_POLICIES]
    .map(entry => [entry.name, entry]),
));

export function familyDefaultToolNames(agentId) {
  return FAMILY_DEFAULT_TOOL_NAMES[String(agentId || '').trim().toLowerCase()] || [];
}

export function familyToolPolicy(agentId, toolName) {
  return familyDefaultToolNames(agentId).includes(toolName) ? POLICY_BY_NAME[toolName] || null : null;
}
