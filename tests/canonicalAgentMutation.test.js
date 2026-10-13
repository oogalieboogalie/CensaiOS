import { jest } from '@jest/globals';
import request from 'supertest';
import { FAMILY_AGENT_IDS } from '../src/data/family-agents.js';

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => true,
  setDbReady: jest.fn(),
}));

const getAgents = jest.fn().mockResolvedValue([{ id: 'atlas', name: 'Atlas' }]);
const getAgent = jest.fn().mockResolvedValue({ id: 'atlas', name: 'Atlas' });
const upsertAgent = jest.fn(async (agent) => agent);

jest.unstable_mockModule('../server/memory.js', () => ({ getAgents, getAgent, upsertAgent }));
jest.unstable_mockModule('../server/tools.js', () => ({
  listToolCatalog: jest.fn(() => ({ tools: [], categories: [] })),
  filterToolsForAgent: jest.fn().mockResolvedValue([]),
}));

const { coreRouter } = await import('../server/routes/agents/core.js');

function immutableBody(agentId) {
  return {
    error: 'Canonical family agents are product-owned and cannot be modified at runtime.',
    code: 'CANONICAL_AGENT_IMMUTABLE',
    agentId,
  };
}

describe('canonical core-agent mutation boundary', () => {
  let app;

  beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    app.use('/api', coreRouter);
  });

  beforeEach(() => jest.clearAllMocks());

  test.each(FAMILY_AGENT_IDS)('POST rejects canonical agent %s with stable 409', async (agentId) => {
    const response = await request(app).post('/api/agents').send({ id: agentId, name: 'Changed' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(immutableBody(agentId));
    expect(upsertAgent).not.toHaveBeenCalled();
  });

  test.each(FAMILY_AGENT_IDS)('PUT rejects canonical agent %s with stable 409', async (agentId) => {
    const response = await request(app).put(`/api/agents/${agentId}`).send({ id: 'custom', name: 'Changed' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(immutableBody(agentId));
    expect(upsertAgent).not.toHaveBeenCalled();
  });

  test('canonical matching is normalized before mutation', async () => {
    const response = await request(app).post('/api/agents').send({ id: ' ATLAS ', name: 'Changed' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(immutableBody('atlas'));
    expect(upsertAgent).not.toHaveBeenCalled();
  });

  test('canonical reads remain available', async () => {
    const response = await request(app).get('/api/agents/atlas');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'atlas', name: 'Atlas' });
    expect(getAgent).toHaveBeenCalledWith('atlas');
  });

  test('non-canonical POST retains the current authenticated mutation path', async () => {
    const payload = { id: 'custom-researcher', name: 'Custom Researcher' };
    const response = await request(app).post('/api/agents').send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(upsertAgent).toHaveBeenCalledWith(payload);
  });

  test('non-canonical PUT keeps the route id authoritative over the body', async () => {
    const response = await request(app)
      .put('/api/agents/custom-researcher')
      .send({ id: 'atlas', name: 'Updated Researcher' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'custom-researcher', name: 'Updated Researcher' });
    expect(upsertAgent).toHaveBeenCalledWith({ id: 'custom-researcher', name: 'Updated Researcher' });
  });
});
