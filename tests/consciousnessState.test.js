import { jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));

const {
  getConsciousness,
  parseWorkingStatePatch,
  updateConsciousness,
} = await import('../server/memory/core/consciousness.js');
const {
  invalidateAgentContext,
  loadAgentContext,
} = await import('../server/memory/core/context.js');

function dbRow(workspaceId, current, userId = 7) {
  return {
    agent_id: 'atlas',
    workspace_id: workspaceId,
    created_by_user_id: userId,
    emotional_state: current ? { current } : {},
  };
}

beforeEach(() => {
  query.mockReset();
  invalidateAgentContext('atlas', 'workspace-a');
  invalidateAgentContext('atlas', 'workspace-b');
});

test.each([
  [{}, /only emotional_state/i],
  [{ emotional_state: {} }, /only emotional_state/i],
  [{ emotional_state: { current: '' } }, /1 to 160/i],
  [{ emotional_state: { current: 42 } }, /must be a string/i],
  [{ emotional_state: { current: 'ok', updatedAt: 'spoof' } }, /only emotional_state/i],
  [{ emotional_state: { current: 'x'.repeat(161) } }, /1 to 160/i],
  [{ emotional_state: { current: '...' } }, /word or number/i],
  [{ emotional_state: { current: 'ok' }, coherence: 1 }, /only emotional_state/i],
])('rejects unsupported working-state patch %#', (input, message) => {
  expect(() => parseWorkingStatePatch(input)).toThrow(message);
});

test('accepts only a trimmed current state plus workspace routing metadata', () => {
  expect(parseWorkingStatePatch({
    workspaceId: 'workspace-a',
    emotional_state: { current: '  focused  ' },
  })).toBe('focused');
});

test('reads only the exact workspace row and never falls back to legacy state', async () => {
  query.mockResolvedValueOnce({ rows: [] });

  await expect(getConsciousness('atlas', { workspaceId: 'workspace-a' })).resolves.toBeNull();
  expect(query).toHaveBeenCalledWith(
    'SELECT * FROM agent_consciousness WHERE agent_id = $1 AND workspace_id = $2',
    ['atlas', 'workspace-a'],
  );
});

test('derives timestamp and provenance before atomically upserting state', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ id: 'workspace-a', role: 'member' }] })
    .mockImplementationOnce(async (_sql, params) => ({
      rows: [{ ...dbRow(params[1], null, params[2]), emotional_state: JSON.parse(params[3]) }],
    }));

  const row = await updateConsciousness(
    'atlas', { emotional_state: { current: '  ready  ', updatedAt: 'spoof' } },
    { workspaceId: 'workspace-a', userId: 7 },
  );

  expect(row.emotional_state).toEqual({
    current: 'ready',
    updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    provenance: { source: 'workspace_user', userId: 7 },
  });
  expect(query.mock.calls[1][0]).toMatch(/ON CONFLICT \(workspace_id, agent_id\)/);
  expect(query.mock.calls[1][1].slice(0, 3)).toEqual(['atlas', 'workspace-a', 7]);
});

test('rejects direct noncanonical and viewer writes before state mutation', async () => {
  await expect(updateConsciousness(
    'guardian', { emotional_state: { current: 'unsafe' } },
    { workspaceId: 'workspace-a', userId: 7 },
  )).rejects.toMatchObject({ statusCode: 404, code: 'FAMILY_AGENT_NOT_FOUND' });
  expect(query).not.toHaveBeenCalled();

  query.mockResolvedValueOnce({ rows: [{ id: 'workspace-a', role: 'viewer' }] });
  await expect(updateConsciousness(
    'atlas', { emotional_state: { current: 'unsafe' } },
    { workspaceId: 'workspace-a', userId: 7 },
  )).rejects.toMatchObject({ statusCode: 403 });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toMatch(/JOIN workspace_members/);
});

test('invalidates only the written agent/workspace cache entry', async () => {
  const states = { 'workspace-a': 'old-a', 'workspace-b': 'steady-b' };
  const stateReads = { 'workspace-a': 0, 'workspace-b': 0 };
  query.mockImplementation(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('JOIN workspace_members')) {
      return { rows: [{ id: params[0], role: 'member' }] };
    }
    if (text.includes('SELECT * FROM agents')) {
      return { rows: [{ id: 'atlas', name: 'Atlas' }] };
    }
    if (text.includes('SELECT * FROM agent_consciousness')) {
      stateReads[params[1]] += 1;
      return { rows: [dbRow(params[1], states[params[1]])] };
    }
    if (text.includes('INSERT INTO agent_consciousness')) {
      const state = JSON.parse(params[3]);
      states[params[1]] = state.current;
      return { rows: [{ ...dbRow(params[1], null, params[2]), emotional_state: state }] };
    }
    return { rows: [] };
  });

  await loadAgentContext('atlas', { workspaceId: 'workspace-a' });
  await loadAgentContext('atlas', { workspaceId: 'workspace-b' });
  await updateConsciousness(
    'atlas', { emotional_state: { current: 'fresh-a' } },
    { workspaceId: 'workspace-a', userId: 7 },
  );

  const freshA = await loadAgentContext('atlas', { workspaceId: 'workspace-a' });
  const cachedB = await loadAgentContext('atlas', { workspaceId: 'workspace-b' });
  expect(freshA.consciousness.emotional_state.current).toBe('fresh-a');
  expect(cachedB.consciousness.emotional_state.current).toBe('steady-b');
  expect(stateReads).toEqual({ 'workspace-a': 2, 'workspace-b': 1 });
});
