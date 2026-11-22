import { AGENT_CAPABILITY_MODULE_BY_ID } from '../src/data/agent-capability-modules.js';
import { FAMILY_DEFAULT_TOOL_NAMES } from '../server/tools/rbac/familyBaseline.js';
import { buildFamilyToolRegistry } from '../server/tools/familyRegistry.js';

const effective = names => names.map(name => ({ type: 'function', function: { name } }));

test('registry shows intrinsic, role and module tools with exact effective state', () => {
  const writer = AGENT_CAPABILITY_MODULE_BY_ID['canvas-designer'];
  const registry = buildFamilyToolRegistry({
    agentId: 'censai',
    effectiveTools: effective(FAMILY_DEFAULT_TOOL_NAMES.censai),
    capabilities: [{ module_id: writer.id }],
    installedModuleIds: ['project-reader', 'canvas-designer'],
  });

  expect(registry.tools.find(tool => tool.name === 'message_to')).toMatchObject({
    status: 'active', source: 'intrinsic', risk: 'write', mode: 'autonomous_internal',
  });
  expect(registry.tools.find(tool => tool.name === 'canvas_update_design')).toMatchObject({
    status: 'active', source: 'role', equipped: true, approvalRequired: true,
    mode: 'execute_with_approval', module: { id: 'canvas-designer' },
  });
  // The family saves project files by role; Trust mode decides if a save waits.
  expect(registry.tools.find(tool => tool.name === 'project_write')).toMatchObject({
    status: 'active', source: 'role', approvalRequired: true, module: { id: 'project-writer' },
  });
  expect(registry.tools.find(tool => tool.name === 'project_read')).toMatchObject({
    status: 'active', source: 'role', equipped: false, approvalRequired: false,
  });
  const names = registry.tools.map(tool => tool.name);
  for (const unavailable of [
    'postgres_query', 'terminal_run', 'restart_service', 'mailcow_add_mailbox', 'vex_run',
  ]) expect(names).not.toContain(unavailable);
  expect(registry.counts).toMatchObject({
    active: FAMILY_DEFAULT_TOOL_NAMES.censai.length,
    equippedModules: 1,
  });
});

test('a role tool is active with no package installed, and one that changes things is marked ask-first', () => {
  const registry = buildFamilyToolRegistry({
    agentId: 'censai', effectiveTools: effective(FAMILY_DEFAULT_TOOL_NAMES.censai),
    capabilities: [], installedModuleIds: [],
  });
  expect(registry.tools.find(tool => tool.name === 'canvas_update_design')).toMatchObject({
    status: 'active', source: 'role', equipped: false, approvalRequired: true,
    module: { id: 'canvas-designer', packageInstalled: false },
  });
  expect(registry.tools.find(tool => tool.name === 'submit_pr')).toMatchObject({
    status: 'active', source: 'role', approvalRequired: true, mode: 'ask_first', module: null,
  });
  expect(registry.tools.find(tool => tool.name === 'web_search')).toMatchObject({
    status: 'active', source: 'role', approvalRequired: false,
  });
  expect(registry.counts.installRequired).toBe(0);
});

test('role orchestration is visible as active role policy, not a module grant', () => {
  const registry = buildFamilyToolRegistry({
    agentId: 'architect',
    effectiveTools: effective(FAMILY_DEFAULT_TOOL_NAMES.architect),
    capabilities: [],
  });
  expect(registry.tools.find(tool => tool.name === 'dispatch_squad')).toMatchObject({
    status: 'active', source: 'role', risk: 'write', mode: 'autonomous_internal',
    module: null,
  });
});
