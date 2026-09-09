import { jest } from '@jest/globals';
import { REVIEWED_MINDSET_SOURCES } from '../server/attributes/reviewedMindsetSources.js';

const mockPool = { query: jest.fn(), on: jest.fn(), end: jest.fn() };
jest.unstable_mockModule('../server/db.js', () => ({
  default: mockPool,
  createDbPool: () => mockPool,
}));
jest.unstable_mockModule('../server/embeddings.js', () => ({ embeddingsAvailable: () => false }));
jest.unstable_mockModule('../server/memory/core.js', () => ({
  loadAgentContext: jest.fn(async () => ({
    agent: { id: 'atlas', name: 'Atlas', role: 'Backend', system_prompt: 'You are Atlas.' },
    consciousness: null,
    genetics: null,
    watching: [],
    watchedBy: [],
    recentConvos: [],
    topMemories: [],
    sharedMemories: [],
    compressionMemories: [],
    unreadMessages: [],
    nuggets: [],
    journalEntries: [],
    knowledgeTriples: [],
    topAssociations: [],
  })),
  recallMemories: jest.fn(),
  loadCapabilities: jest.fn(async () => ''),
}));
jest.unstable_mockModule('../server/memory/subagentRoster.js', () => ({
  buildSubAgentRosterPrompt: jest.fn(async () => ''),
}));

const { buildSystemPrompt } = await import('../server/memory/prompt.js');
const mindsetId = 'mindset_first_principles_decomposition';
const source = REVIEWED_MINDSET_SOURCES[mindsetId];

describe('workspace equipment prompt isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('workspace_agent_equipped_items')) {
        return params[1] === 'workspace-a'
          ? { rows: [{
            id: mindsetId,
            name: 'First Principles',
            value: 'Separate facts from assumptions.',
            type: 'mindset',
            validation: {
              source: source.source,
              source_family: source.sourceFamily,
              issues: source.issues.map(([number]) => number),
              report: source.report,
            },
          }] }
          : { rows: [] };
      }
      return { rows: [] };
    });
  });

  test('injects only the exact workspace selection and injects nothing unscoped', async () => {
    const workspaceA = await buildSystemPrompt('atlas', null, { workspaceId: 'workspace-a' });
    const workspaceB = await buildSystemPrompt('atlas', null, { workspaceId: 'workspace-b' });
    const unscoped = await buildSystemPrompt('atlas', null);
    expect(workspaceA).toContain('First Principles: Separate facts from assumptions.');
    expect(workspaceB).not.toContain('First Principles');
    expect(unscoped).not.toContain('First Principles');
    const equipmentCalls = mockPool.query.mock.calls.filter(([sql]) =>
      String(sql).includes('workspace_agent_equipped_items'));
    expect(equipmentCalls.map(([, params]) => params)).toEqual([
      ['atlas', 'workspace-a', expect.any(Array)],
      ['atlas', 'workspace-b', expect.any(Array)],
    ]);
    expect(equipmentCalls[0][0]).toContain('d.id = ANY($3::text[])');
  });
});
