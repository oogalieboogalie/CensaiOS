import { jest } from '@jest/globals';
import request from 'supertest';

const discoverAgents = jest.fn();
const helpRequests = {
  cancelHelpRequest: jest.fn(), createHelpRequest: jest.fn(), decideHelpRequest: jest.fn(),
  getHelpRequest: jest.fn(), listHelpRequests: jest.fn(),
};
class AgentHelpError extends Error {
  constructor(message, statusCode = 400, code = 'X') { super(message); this.statusCode = statusCode; this.code = code; }
}
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/agent-registry/discovery.js', () => ({ discoverAgents }));
jest.unstable_mockModule('../server/agent-registry/helpRequests.js', () => ({ AgentHelpError, ...helpRequests }));

const { default: express } = await import('express');
const network = await import('../server/routes/agentRegistry/network.js');

const ID = '3f1c9a52-6a7e-4c1b-9a51-2d3e4f5a6b7c';

function app() {
  const result = express(); result.use(express.json());
  result.use((req, _res, next) => { req.agentActor = { kind: 'user', id: '7' }; next(); });
  result.get('/discover', network.discover);
  result.get('/help-requests', network.listRequests);
  result.post('/help-requests', network.createRequest);
  result.get('/help-requests/:id', network.readRequest);
  result.post('/help-requests/:id/decision', network.decideRequest);
  result.post('/help-requests/:id/cancel', network.cancelRequest);
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  discoverAgents.mockResolvedValue({ query: 'db', tags: [], items: [] });
  helpRequests.listHelpRequests.mockResolvedValue({ outgoing: [], incoming: [] });
  helpRequests.createHelpRequest.mockResolvedValue({ id: ID, status: 'queued' });
  helpRequests.decideHelpRequest.mockResolvedValue({ id: ID, status: 'declined' });
});

test('discover passes the signed user, workspace, query and parsed tags', async () => {
  const res = await request(app()).get('/discover?workspaceId=ws-a&q=db&tags=sql,%20postgres,&limit=3');
  expect(res.status).toBe(200);
  expect(discoverAgents).toHaveBeenCalledWith({}, {
    workspaceId: 'ws-a', userId: 7, query: 'db', tags: ['sql', 'postgres'], limit: '3',
  });
});

test('create derives the requester from the session, optionally on behalf of a family agent', async () => {
  const res = await request(app()).post('/help-requests').send({ workspaceId: 'ws-a', cardId: 'agent:nexus', task: 't', userId: 999 });
  expect(res.status).toBe(201);
  expect(helpRequests.createHelpRequest).toHaveBeenCalledWith({}, expect.objectContaining({
    workspaceId: 'ws-a', userId: 7, cardId: 'agent:nexus', requester: { kind: 'user', id: '7' },
  }));
  expect(network.requesterFrom({ onBehalfOf: 'Atlas' }, 7)).toEqual({ kind: 'agent', id: 'atlas' });
  expect(network.requesterFrom({ onBehalfOf: 'evil-bot' }, 7)).toEqual({ kind: 'user', id: '7' });
});

test('decisions come from the session user, not the body', async () => {
  const res = await request(app()).post(`/help-requests/${ID}/decision`).send({ decision: 'decline', userId: 1 });
  expect(res.status).toBe(200);
  expect(helpRequests.decideHelpRequest).toHaveBeenCalledWith({}, { id: ID, userId: 7, decision: 'decline', note: undefined });
});

test('scope and id are validated before the store is touched', async () => {
  expect((await request(app()).get('/discover?q=db')).status).toBe(400);
  expect((await request(app()).get('/help-requests?workspaceId=a').send({ workspaceId: 'b' })).status).toBe(400);
  expect((await request(app()).get('/help-requests/not-a-uuid?workspaceId=ws-a')).status).toBe(404);
  expect((await request(app()).post('/help-requests/1/cancel').send({ workspaceId: 'ws-a' })).status).toBe(404);
  expect(discoverAgents).not.toHaveBeenCalled();
  expect(helpRequests.getHelpRequest).not.toHaveBeenCalled();
  expect(helpRequests.cancelHelpRequest).not.toHaveBeenCalled();
});

test('policy errors pass through; unexpected errors do not leak', async () => {
  helpRequests.createHelpRequest.mockRejectedValueOnce(new AgentHelpError('Agents can only ask pinned agents.', 403, 'AGENT_HELP_PIN_REQUIRED'));
  const denied = await request(app()).post('/help-requests').send({ workspaceId: 'ws-a', cardId: 'x', task: 't' });
  expect(denied.status).toBe(403);
  expect(denied.body).toEqual({ error: 'Agents can only ask pinned agents.', code: 'AGENT_HELP_PIN_REQUIRED' });
  helpRequests.listHelpRequests.mockRejectedValueOnce(new Error('relation does not exist'));
  const broken = await request(app()).get('/help-requests?workspaceId=ws-a');
  expect(broken.status).toBe(500);
  expect(broken.body.error).toBe('The agent network is temporarily unavailable.');
});
