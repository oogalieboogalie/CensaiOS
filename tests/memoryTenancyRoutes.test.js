import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn(), on: jest.fn(), end: jest.fn() },
}));

const storeMemory = jest.fn().mockResolvedValue('memory-1');
const recallMemories = jest.fn().mockResolvedValue([]);
const loadAgentContext = jest.fn().mockResolvedValue({ agent: { id: 'atlas' } });
const writeJournal = jest.fn().mockResolvedValue({ id: 'journal-1' });
const readJournals = jest.fn().mockResolvedValue([{ id: 'journal-1', content: 'secret' }]);
const countJournals = jest.fn().mockResolvedValue(1);
const storeCompressionMemory = jest.fn().mockResolvedValue('compression-1');

jest.unstable_mockModule('../server/memory.js', () => ({
  storeMemory,
  recallMemories,
  loadAgentContext,
  writeJournal,
  readJournals,
  countJournals,
  storeCompressionMemory,
}));

const resolveWorkspaceContext = jest.fn(async (_db, { userId, workspaceId }) => {
  if (workspaceId === 'workspace-owner' && Number(userId) !== 7) {
    const error = new Error('Workspace not found or access denied');
    error.statusCode = 403;
    throw error;
  }
  return { id: workspaceId };
});
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));

const { memoryRouter } = await import('../server/routes/agents/memory.js');

describe('agent memory route tenancy', () => {
  let app;
  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const userId = Number(req.get('x-user-id'));
      req.session = Number.isInteger(userId) && userId > 0 ? { userId } : {};
      next();
    });
    app.use('/api', memoryRouter);
  });

  beforeEach(() => jest.clearAllMocks());

  test('derives workspace and creator from the authenticated request', async () => {
    const response = await request(app)
      .post('/api/memory')
      .set('x-user-id', '7')
      .send({
        agentId: 'atlas', content: 'Scoped fact', workspaceId: 'workspace-owner',
        workspace_id: 'workspace-foreign', created_by_user_id: 99,
      });

    expect(response.status).toBe(200);
    expect(storeMemory).toHaveBeenCalledWith(
      'atlas', 'Scoped fact', undefined,
      expect.objectContaining({ workspaceId: 'workspace-owner', userId: 7 }),
    );
  });

  test('denies a foreign workspace before memory access', async () => {
    const response = await request(app)
      .get('/api/memory/atlas?workspaceId=workspace-owner')
      .set('x-user-id', '8');

    expect(response.status).toBe(403);
    expect(recallMemories).not.toHaveBeenCalled();
  });

  test('names missing workspace scope instead of returning a false empty result', async () => {
    const response = await request(app)
      .get('/api/memory/atlas')
      .set('x-user-id', '7');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/open a workspace/i);
  });

  test('keeps journal plaintext redacted inside the authorized workspace', async () => {
    const response = await request(app)
      .get('/api/journals/atlas?workspaceId=workspace-owner')
      .set('x-user-id', '7');

    expect(response.status).toBe(200);
    expect(readJournals).toHaveBeenCalledWith('atlas', expect.objectContaining({
      workspaceId: 'workspace-owner', userId: 7,
    }));
    expect(response.body[0].content).toBe('[private]');
  });
});
