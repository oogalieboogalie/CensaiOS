import { jest } from '@jest/globals';
import request from 'supertest';

const loadAgentEquippedMindsetIds = jest.fn().mockResolvedValue(['mindset_strategic_foresight']);
const saveAgentMindsetIds = jest.fn().mockResolvedValue(undefined);
const listMindsetDefinitions = jest.fn().mockResolvedValue([{ id: 'mindset_strategic_foresight' }]);
const requireWorkspaceMember = jest.fn().mockResolvedValue({ id: 'workspace-1', role: 'owner' });

jest.unstable_mockModule('../server/attributes/registry.js', () => ({
  loadAgentEquippedMindsetIds,
  saveAgentMindsetIds,
  listMindsetDefinitions,
}));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));

const { mindsetsRouter } = await import('../server/routes/agents/mindsets.js');

describe('agent mindset routes', () => {
  let app;

  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
    app.use('/api', mindsetsRouter);
  });

  beforeEach(() => jest.clearAllMocks());

  test('reads and saves explicit mindset IDs', async () => {
    const catalog = await request(app).get('/api/mindsets');
    expect(catalog.body).toEqual({ mindsets: [{ id: 'mindset_strategic_foresight' }], status: 'candidate' });
    const read = await request(app).get('/api/agents/atlas/mindsets?workspaceId=workspace-1');
    expect(read.body).toEqual({ mindsets: ['mindset_strategic_foresight'], workspaceId: 'workspace-1' });
    const write = await request(app).put('/api/agents/atlas/mindsets')
      .send({ mindsets: ['mindset_a'], workspaceId: 'workspace-1', userId: 99 });
    expect(write.body).toEqual({ ok: true, workspaceId: 'workspace-1' });
    expect(saveAgentMindsetIds).toHaveBeenCalledWith(
      'atlas', ['mindset_a'], expect.objectContaining({ workspaceId: 'workspace-1', userId: 7 })
    );
  });

  test('returns a validation code without disguising it as a server error', async () => {
    saveAgentMindsetIds.mockRejectedValueOnce(Object.assign(new Error('Unknown mindset'), {
      code: 'INVALID_DEFINITION_SELECTION', statusCode: 400,
    }));
    const response = await request(app).put('/api/agents/atlas/mindsets')
      .send({ mindsets: ['missing'], workspaceId: 'workspace-1' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Unknown mindset', code: 'INVALID_DEFINITION_SELECTION' });
  });

  test('does not expose internal catalog failures', async () => {
    listMindsetDefinitions.mockRejectedValueOnce(new Error('password=never-return SELECT private'));

    const response = await request(app).get('/api/mindsets');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Agent configuration is temporarily unavailable.' });
  });
});
