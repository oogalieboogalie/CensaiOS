import { AGENT_CAPABILITY_MODULES } from '../src/data/agent-capability-modules.js';
import { listToolCatalog } from '../server/tools/catalog.js';
import { CAPABILITY_TO_TOOLS } from '../server/tools/rbac/capabilities.js';
import { validateCapabilityModuleCatalog } from '../server/capabilities/workspaceCapabilities.js';

test('tool modules have unique identities and only safe read or approved-write modes', () => {
  const ids = AGENT_CAPABILITY_MODULES.map(module => module.id);
  const capabilities = AGENT_CAPABILITY_MODULES.map(module => module.capabilityId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(capabilities).size).toBe(capabilities.length);
  expect(validateCapabilityModuleCatalog(listToolCatalog().tools)).toEqual([]);
  expect(AGENT_CAPABILITY_MODULES.every(module => {
    const validMode = (module.risk === 'read' && module.mode === 'autonomous')
      || (module.risk === 'write' && module.mode === 'execute_with_approval');
    return validMode && module.toolNames.length > 0;
  })).toBe(true);
});

test('the executable mapping derives exactly from the reviewed module catalog', () => {
  expect(CAPABILITY_TO_TOOLS).toEqual(Object.fromEntries(
    AGENT_CAPABILITY_MODULES.map(module => [module.capabilityId, [...module.toolNames]]),
  ));
  expect(Object.keys(CAPABILITY_TO_TOOLS)).not.toEqual(expect.arrayContaining([
    'terminal.execute', 'github.write', 'files.write', 'calendar.write', 'deploy.execute',
  ]));
});

test('module copy is truthful about read boundaries and approved writes', () => {
  const copy = JSON.stringify(AGENT_CAPABILITY_MODULES).toLowerCase();
  expect(copy).not.toMatch(/unrestricted|dom manipulation|read\/write access/);
  expect(copy).toContain('does not control a browser');
  expect(copy).toContain('cannot add or change entries');
  expect(copy).toContain('every call waits for owner/admin approval');
  expect(AGENT_CAPABILITY_MODULES.filter(module => module.risk === 'write'))
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'project-writer', mode: 'execute_with_approval' }),
      expect.objectContaining({ id: 'canvas-collaborator', mode: 'execute_with_approval' }),
    ]));
});
