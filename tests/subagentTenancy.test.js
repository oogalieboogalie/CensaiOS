import { scopedSubAgentId, resolveSubAgentScope } from '../server/memory/subagentTenancy.js';

describe('sub-agent tenancy contract', () => {
  test('same family role receives different stable ids in different workspaces', () => {
    const owner = scopedSubAgentId('Builder', 'atlas', 'workspace-owner');
    const other = scopedSubAgentId('Builder', 'atlas', 'workspace-other');
    expect(owner).toBe(scopedSubAgentId('Builder', 'atlas', 'workspace-owner'));
    expect(owner).not.toBe(other);
    expect(owner).toMatch(/^builder-atlas-[a-f0-9]{12}$/);
  });

  test('reads require workspace and writes also require originating user', () => {
    expect(() => resolveSubAgentScope({})).toThrow(/authorized workspace/i);
    expect(() => resolveSubAgentScope({ workspaceId: 'workspace-owner' }, { requireUser: true }))
      .toThrow(/originating user/i);
    expect(resolveSubAgentScope({ workspaceId: 'workspace-owner', userId: 7 }, { requireUser: true }))
      .toEqual({ workspaceId: 'workspace-owner', userId: 7 });
  });
});
