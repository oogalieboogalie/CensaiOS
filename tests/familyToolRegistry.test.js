import { AGENT_CAPABILITY_MODULE_BY_ID } from '../src/data/agent-capability-modules.js';
import { FAMILY_DEFAULT_TOOL_NAMES } from '../server/tools/rbac/familyBaseline.js';
import { buildFamilyToolRegistry } from '../server/tools/familyRegistry.js';

const effective = names => names.map(name => ({ type: 'function', function: { name } }));

test('registry exposes only intrinsic and reviewed module tools with exact effective state', () => {
  const writer = AGENT_CAPABILITY_MODULE_BY_ID['project-writer'];
  const registry = buildFamilyToolRegistry({
    agentId: 'censai',
    effectiveTools: effective([...FAMILY_DEFAULT_TOOL_NAMES.censai, ...writer.toolNames]),
    capabilities: [{ module_id: writer.id }],
    installedModuleIds: ['project-reader', 'project-writer'],
  });

  expect(registry.tools.find(tool => tool.name === 'message_to')).toMatchObject({
    status: 'active', source: 'intrinsic', risk: 'write', mode: 'autonomous_internal',
  });
  expect(registry.tools.find(tool => tool.name === 'project_write')).toMatchObject({
    status: 'active', source: 'module', equipped: true, approvalRequired: true,
    mode: 'execute_with_approval', module: { id: 'project-writer' },
  });
  expect(registry.tools.find(tool => tool.name === 'project_read')).toMatchObject({
    status: 'active', source: 'role', equipped: false, approvalRequired: false,
  });
  const names = registry.tools.map(tool => tool.name);
  for (const unavailable of [
    'postgres_query', 'terminal_run', 'restart_service', 'mailcow_add_mailbox', 'vex_run',
  ]) expect(names).not.toContain(unavailable);
  expect(registry.counts).toMatchObject({
    active: FAMILY_DEFAULT_TOOL_NAMES.censai.length + writer.toolNames.length,
    equippedModules: 1,
  });
});

test('reviewed tools stay unavailable until their package is installed', () => {
  const registry = buildFamilyToolRegistry({
    agentId: 'censai', effectiveTools: effective(FAMILY_DEFAULT_TOOL_NAMES.censai),
    capabilities: [], installedModuleIds: [],
  });
  // project_read is baseline now; project_write still needs the module package.
  expect(registry.tools.find(tool => tool.name === 'project_write')).toMatchObject({
    status: 'install_required', source: 'module', equipped: false,
    module: { id: 'project-writer', packageInstalled: false },
  });
  expect(registry.counts.installRequired).toBeGreaterThan(0);
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
