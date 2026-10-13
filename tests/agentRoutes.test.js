import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => true,
  setDbReady: jest.fn(),
}));

const getDbAgents = jest.fn().mockResolvedValue([{ id: 'atlas', name: 'Atlas' }]);

jest.unstable_mockModule('../server/memory.js', () => ({
  getAgents: getDbAgents,
  getAgent: jest.fn().mockResolvedValue({ id: 'atlas', name: 'Atlas' }),
  upsertAgent: jest.fn(async (agent) => agent),
}));

jest.unstable_mockModule('../server/tools.js', () => ({
  listToolCatalog: jest.fn(() => ({ tools: [], categories: [] })),
  filterToolsForAgent: jest.fn().mockResolvedValue([]),
}));

const { coreRouter } = await import('../server/routes/agents/core.js');

describe('split agent routes', () => {
  let app;

  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    app.use('/api', coreRouter);
  });

  test('GET /api/agents is served by the split core router', async () => {
    const response = await request(app).get('/api/agents');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      id: 'atlas',
      name: 'Atlas',
      identity: { class: 'family', betaVisible: true, canonicalId: 'atlas', cardId: 'agent:atlas' },
    }]);
  });

  test('GET /api/agents?scope=beta excludes classified development identities', async () => {
    getDbAgents.mockResolvedValueOnce([
      { id: 'atlas', name: 'Atlas' },
      { id: 'atlas-1', name: 'Atlas' },
      { id: 'test_fixture', name: 'test' },
    ]);
    const response = await request(app).get('/api/agents?scope=beta');
    expect(response.body.map((agent) => agent.id)).toEqual(['atlas']);
  });

  test('PUT /api/agents/:id uses the mounted path without duplicate /api', async () => {
    const response = await request(app)
      .put('/api/agents/custom-agent')
      .send({ name: 'Custom Agent Prime' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'custom-agent', name: 'Custom Agent Prime' });
  });

  test('duplicate /api/api/agents/:id route is not registered', async () => {
    const response = await request(app)
      .put('/api/api/agents/atlas')
      .send({ name: 'Wrong Path' });

    expect(response.status).toBe(404);
  });
});
