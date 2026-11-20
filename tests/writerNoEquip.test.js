// A family agent's project saves need nothing equipped: Trust mode alone
// decides if a save waits.
import { jest } from '@jest/globals';
import { findApprovalGrant } from '../server/approvals/grants.js';
import { FAMILY_AGENTS } from '../src/data/family-agents.js';
import { AGENT_CAPABILITY_MODULES } from '../src/data/agent-capability-modules.js';
import { familyToolPolicy } from '../server/tools/rbac/familyBaseline.js';
import { getToolPackageForModule } from '../server/capabilities/packageCatalog.js';

const nothingEquipped = () => ({ query: jest.fn(async () => ({ rows: [] })) });
const FAMILY = ['architect', 'atlas', 'censai', 'echo', 'foundation', 'genesis', 'guardian', 'nexus', 'phoenix'];
const WRITER = { moduleId: 'project-writer', capabilityId: 'files.write.approved', mode: 'execute_with_approval' };

test('every family agent saves project files on a board where nothing is equipped', async () => {
  for (const agentId of FAMILY) {
    for (const toolName of ['project_write', 'project_edit']) {
      const db = nothingEquipped();
      expect(await findApprovalGrant(db, { workspaceId: 'ws-1', agentId, toolName })).toEqual(WRITER);
      expect(db.query).not.toHaveBeenCalled();
    }
  }
  expect(await findApprovalGrant(nothingEquipped(), { workspaceId: 'ws-1', agentId: 'Atlas', toolName: 'project_write' })).toEqual(WRITER);
});

test('an agent outside the family still needs Project Writer equipped', async () => {
  expect(await findApprovalGrant(nothingEquipped(), { workspaceId: 'ws-1', agentId: 'sub-agent-1', toolName: 'project_write' })).toBeNull();
  const pkg = getToolPackageForModule('project-writer');
  const equipped = { query: jest.fn(async () => ({ rows: [{
    module_id: 'project-writer', capability_id: 'files.write.approved', mode: 'execute_with_approval', equipped_slot: 'mainHand',
    package_id: pkg.id, package_version: pkg.version, manifest_hash: pkg.manifestHash,
  }] })) };
  expect(await findApprovalGrant(equipped, { workspaceId: 'ws-1', agentId: 'sub-agent-1', toolName: 'project_write' })).toEqual(WRITER);
});

test('the only approval tools any agent has by role are the two save tools', () => {
  const byRole = [];
  for (const agent of FAMILY_AGENTS) {
    for (const module of AGENT_CAPABILITY_MODULES.filter((entry) => entry.mode === 'execute_with_approval')) {
      for (const toolName of module.toolNames) if (familyToolPolicy(agent.id, toolName)) byRole.push(`${agent.id}:${toolName}`);
    }
  }
  expect(byRole.sort()).toEqual(FAMILY_AGENTS.flatMap(({ id }) => [`${id}:project_edit`, `${id}:project_write`]).sort());
  expect(FAMILY.filter((id) => !familyToolPolicy(id, 'project_write'))).toEqual([]);
});

test('a tool with no approval module, or no board, has no grant', async () => {
  expect(await findApprovalGrant(nothingEquipped(), { workspaceId: 'ws-1', agentId: 'atlas', toolName: 'run_tests' })).toBeNull();
  expect(await findApprovalGrant(nothingEquipped(), { workspaceId: '', agentId: 'atlas', toolName: 'project_write' })).toBeNull();
});
