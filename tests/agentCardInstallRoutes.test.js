import { jest } from '@jest/globals';
import request from 'supertest';

const listAgentCardInstalls = jest.fn();
const installAgentCard = jest.fn();
const removeAgentCardInstall = jest.fn();
jest.unstable_mockModule('../server/agent-registry/installStore.js', () => ({
  AgentCardInstallError: class extends Error {
    constructor(message, statusCode = 400, code = 'INVALID') {
      super(message); this.statusCode = statusCode; this.code = code;
    }
  },
  listAgentCardInstalls, installAgentCard, removeAgentCardInstall,
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));

const { default: express } = await import('express');
const { listInstalls, installCard, removeInstall } = await import('../server/routes/agentRegistry/installs.js');

function app() {
  const result = express(); result.use(express.json());
  result.use((req, _res, next) => { req.agentActor = { kind: 'user', id: '7' }; next(); });
  result.get('/api/agent-registry/installs', listInstalls);
  result.put('/api/agent-registry/installs/:id', installCard);
  result.delete('/api/agent-registry/installs/:id', removeInstall);
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  listAgentCardInstalls.mockResolvedValue({ canManage: true, items: [] });
  installAgentCard.mockResolvedValue({ created: true, install: { card_id: 'agent:architect' } });
  removeAgentCardInstall.mockResolvedValue({ removed: true });
});

test('list and mutations derive the signed actor and explicit workspace', async () => {
  const read = await request(app()).get('/api/agent-registry/installs?workspaceId=ws-a');
  const put = await request(app()).put('/api/agent-registry/installs/agent%3Aarchitect').send({ workspaceId: 'ws-a' });
  const remove = await request(app()).delete('/api/agent-registry/installs/agent%3Aarchitect?workspaceId=ws-a');
  expect(read.status).toBe(200);
  expect(put.status).toBe(201);
  expect(remove.status).toBe(200);
  expect(listAgentCardInstalls).toHaveBeenCalledWith({}, { workspaceId: 'ws-a', userId: 7 });
  expect(installAgentCard).toHaveBeenCalledWith({}, {
    workspaceId: 'ws-a', userId: 7, cardId: 'agent:architect',
  });
});

test('missing and conflicting scope fail before store access', async () => {
  expect((await request(app()).get('/api/agent-registry/installs')).status).toBe(400);
  expect((await request(app()).put('/api/agent-registry/installs/agent%3Aarchitect?workspaceId=ws-a')
    .send({ workspaceId: 'ws-b' })).status).toBe(400);
  expect(installAgentCard).not.toHaveBeenCalled();
});

test('stable policy errors pass through without database details', async () => {
  const error = new Error('Workspace role does not allow this operation');
  error.statusCode = 403; error.code = 'FORBIDDEN';
  installAgentCard.mockRejectedValueOnce(error);
  const denied = await request(app()).put('/api/agent-registry/installs/agent%3Aarchitect')
    .send({ workspaceId: 'ws-a', userId: 999 });
  expect(denied.status).toBe(403);
  expect(denied.body).toEqual({ error: error.message, code: 'FORBIDDEN' });
});

test('unexpected failures use a non-disclosing response', async () => {
  listAgentCardInstalls.mockRejectedValueOnce(new Error('database internals'));
  const response = await request(app()).get('/api/agent-registry/installs?workspaceId=ws-a');
  expect(response.status).toBe(500);
  expect(response.body.error).toBe('AgentCard installs are temporarily unavailable.');
});
