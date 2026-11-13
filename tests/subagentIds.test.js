import { jest } from '@jest/globals';

const query = jest.fn(async () => ({ rows: [{ id: 'stored' }] }));
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query, on: jest.fn(), end: jest.fn() },
}));

const { createSubAgent } = await import('../server/memory/subagents.js');
const { scopedSubAgentId } = await import('../server/memory/subagentTenancy.js');
const { SUB_AGENT_DATABASE_TOOLS } = await import('../server/tools/rbac/subagentToolScopes.js');
const { RAW_DATABASE_TOOL_NAMES } = await import('../server/tools/rbac/runtimeAccess.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('new sub-agent ids', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a new sub-agent id cannot be guessed from its name, and an old id is left as it is', async () => {
    const scope = { workspaceId: 'ws-1', userId: 7 };
    await createSubAgent('atlas', { name: 'Builder' }, scope);
    await createSubAgent('atlas', { name: 'Builder' }, scope);
    const ids = query.mock.calls.map((call) => call[1][0]);
    const legacy = scopedSubAgentId('Builder', 'atlas', 'ws-1');

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).not.toBe(legacy);
    expect(ids[0]).toMatch(UUID);
    expect(legacy).toBe(scopedSubAgentId('Builder', 'atlas', 'ws-1'));
    expect(legacy).toMatch(/^builder-atlas-[a-f0-9]{12}$/);
    expect([...SUB_AGENT_DATABASE_TOOLS]).toEqual([...RAW_DATABASE_TOOL_NAMES]);
  });
});
