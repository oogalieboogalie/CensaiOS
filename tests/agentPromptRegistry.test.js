import { jest } from '@jest/globals';
import { REVIEWED_MINDSET_SOURCES } from '../server/attributes/reviewedMindsetSources.js';

const mockPool = {
  query: jest.fn(),
  on: jest.fn(),
  end: jest.fn(),
};

jest.unstable_mockModule('../server/db.js', () => ({
  default: mockPool,
  createDbPool: () => mockPool,
}));

jest.unstable_mockModule('../server/embeddings.js', () => ({
  embeddingsAvailable: () => false,
}));

jest.unstable_mockModule('../server/memory/core.js', () => ({
  loadAgentContext: jest.fn(async () => ({
    agent: {
      id: 'censai',
      name: 'Censai',
      role: 'Editorial lead',
      system_prompt: 'You are Censai. {{ Work style: $meticulous. }}',
    },
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

const buildSubAgentRosterPrompt = jest.fn(async () => '');
jest.unstable_mockModule('../server/memory/subagentRoster.js', () => ({ buildSubAgentRosterPrompt }));

const { buildSystemPrompt } = await import('../server/memory/prompt.js');
const strategicSource = REVIEWED_MINDSET_SOURCES.mindset_strategic_foresight;

describe('system prompt registry context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses code-owned family identity and appends equipped registry context', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [
        {
          id: 'meticulous',
          name: 'Meticulous',
          value: 'detail-oriented and careful about verification',
          type: 'attribute',
        },
        {
          id: 'mindset_strategic_foresight',
          name: 'Strategic Foresight',
          value: 'Adopt a long-horizon executive posture.',
          type: 'mindset',
          category: 'executive',
          validation: {
            source: strategicSource.source,
            source_family: strategicSource.sourceFamily,
            issues: strategicSource.issues.map(([number]) => number),
            report: strategicSource.report,
          },
        },
      ] })
      .mockResolvedValueOnce({ rows: [] });

    const prompt = await buildSystemPrompt('censai', 'hello', { workspaceId: 'workspace-1' });

    expect(mockPool.query.mock.calls[0][0]).toContain('workspace_agent_equipped_items');
    expect(mockPool.query.mock.calls[0][1]).toEqual(['censai', 'workspace-1', expect.any(Array)]);
    expect(prompt).toContain('## Product-owned family blueprint');
    expect(prompt).toContain('Meticulous: detail-oriented and careful about verification');
    expect(prompt).not.toContain('Work style:');
    expect(prompt).toContain('## Operating mindsets');
    expect(prompt).toContain('Strategic Foresight: Adopt a long-horizon executive posture.');
    expect(prompt).not.toContain('$meticulous');
  });

  test('injects no equipment when the runtime has no verified workspace', async () => {
    const prompt = await buildSystemPrompt('censai', 'hello');
    expect(prompt).not.toContain('## Operating mindsets');
    expect(prompt).not.toContain('Work style:');
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test('prewarms only explicitly authorized workspace project context', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          workspace_id: 'workspace-1',
          project_id: 'project-1',
          agent_id: 'censai',
          permission: 'read',
          source_kind: 'canvas',
          source_id: 'workspace-1',
          project_name: 'Dream Machine',
          project_path: null,
          project_repo: null,
          project_summary: 'A proactive product-development workspace.',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ agent_id: 'architect', action: 'planned', detail: 'Defined beta milestone.' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const prompt = await buildSystemPrompt('censai', 'what should we build?', {
      workspaceId: 'workspace-1',
    });

    expect(buildSubAgentRosterPrompt).toHaveBeenCalledWith(
      'censai', expect.objectContaining({ workspaceId: 'workspace-1' }),
    );
    expect(prompt).toContain('## Authorized project context');
    expect(prompt).toContain('### Dream Machine');
    expect(prompt).toContain('Permission: read');
    expect(prompt).toContain('A proactive product-development workspace.');
    expect(prompt).toContain('architect planned: Defined beta milestone.');
    expect(mockPool.query.mock.calls.at(-1)[0]).toContain('last_prewarmed_at = NOW()');
  });
});
