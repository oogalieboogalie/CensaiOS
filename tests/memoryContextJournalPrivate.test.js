import { jest } from '@jest/globals';
import request from 'supertest';

// An agent's journal is private: over HTTP its words are always "[private]".
// The agent context answer carries the latest journal entries too, so it must
// hide them the same way the journal list does.
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));

const DIARY = 'Made-up private thought about Sam Example';
const context = {
  agent: { id: 'atlas' },
  journalEntries: [{ id: 'journal-1', entry_type: 'reflection', content: DIARY }],
  topMemories: [{ content: 'a shared memory' }],
};
const loadAgentContext = jest.fn(async () => context);
jest.unstable_mockModule('../server/memory.js', () => ({
  storeMemory: jest.fn(), recallMemories: jest.fn(), loadAgentContext, writeJournal: jest.fn(),
  readJournals: jest.fn(), countJournals: jest.fn(), storeCompressionMemory: jest.fn(),
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn(async (_db, { workspaceId }) => ({ id: workspaceId })),
}));

const { default: express } = await import('express');
const { memoryRouter } = await import('../server/routes/agents/memory.js');

const app = express();
app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
app.use('/api', memoryRouter);

test('agent context never sends journal words', async () => {
  const res = await request(app).get('/api/memory/context/atlas').query({ workspaceId: 'made-up-board' }).expect(200);
  expect(JSON.stringify(res.body)).not.toContain(DIARY);
  expect(res.body.journalEntries).toEqual([{ id: 'journal-1', entry_type: 'reflection', content: '[private]' }]);
  expect(res.body.topMemories).toEqual(context.topMemories);
  // The kept context the chat loop reuses still has the real words.
  expect(context.journalEntries[0].content).toBe(DIARY);
});
