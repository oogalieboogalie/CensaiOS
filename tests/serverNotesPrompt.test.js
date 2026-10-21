import { jest } from '@jest/globals';
import { consoleCalls, stubLogger, watchConsole } from './support/serverNotes.js';

const { lines, logger } = stubLogger();
jest.unstable_mockModule('../server/logger.js', () => logger);
const mockPool = { query: jest.fn(async () => ({ rows: [] })), on: jest.fn(), end: jest.fn() };
jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool, createDbPool: () => mockPool }));
jest.unstable_mockModule('../server/embeddings.js', () => ({ embeddingsAvailable: () => false }));
jest.unstable_mockModule('../server/memory/core.js', () => ({
  loadAgentContext: jest.fn(async () => ({
    agent: { id: 'made-up', name: 'Made Up', role: 'Helper', system_prompt: 'You are a made-up helper.' },
    consciousness: null, recentConvos: [], topMemories: [], sharedMemories: [], compressionMemories: [],
    unreadMessages: [], nuggets: [], journalEntries: [], knowledgeTriples: [], topAssociations: [],
  })),
  recallMemories: jest.fn(),
  loadCapabilities: jest.fn(async () => ''),
}));
jest.unstable_mockModule('../server/skillSets/store.js', () => ({ loadEquippedSkillSets: jest.fn(async () => []) }));
const lookupBlueprintsForMessage = jest.fn();
jest.unstable_mockModule('../server/blueprints/store.js', () => ({ lookupBlueprintsForMessage }));
jest.unstable_mockModule('../server/memory/subagentRoster.js', () => ({ buildSubAgentRosterPrompt: jest.fn(async () => '') }));
const { buildSystemPrompt } = await import('../server/memory/prompt.js');

test('a failed blueprint lookup leaves one memory line, without the message', async () => {
  const spies = watchConsole();
  lookupBlueprintsForMessage.mockRejectedValueOnce(Object.assign(new Error('made-up failure'), { code: '42P01' }));
  const prompt = await buildSystemPrompt('made-up', 'Pat asks about the made-up invoice', {});
  expect(prompt).toContain('made-up helper');
  const blueprintLines = lines.filter((l) => l.msg === 'blueprint lookup failed');
  expect(blueprintLines).toEqual([{ namespace: 'memory', level: 'error', msg: 'blueprint lookup failed', meta: { code: '42P01' } }]);
  expect(JSON.stringify(lines)).not.toMatch(/Pat|invoice/);
  expect(consoleCalls(spies)).toBe(0);
});
