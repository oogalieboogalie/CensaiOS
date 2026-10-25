// Every agent card change leaves one 'agent-registry' log line: card id, what
// changed (field names only), the account id, worked or why not. Never the
// card's instructions or other text.
import { jest } from '@jest/globals';
import request from 'supertest';

const cards = new Map();
jest.unstable_mockModule('../server/agent-registry/factories.js', () => ({
  createAgentCard: jest.fn(async (input) => { cards.set(input.id, { ...input }); return cards.get(input.id); }),
  getAgentCard: jest.fn(async (id) => cards.get(id) || null),
  listAgentCards: jest.fn(async () => [...cards.values()]),
  updateAgentCard: jest.fn(async (id, patch) => { cards.set(id, { ...cards.get(id), ...patch }); return cards.get(id); }),
  deleteAgentCard: jest.fn(async (id) => { const had = cards.delete(id); return had ? { id } : null; }),
  upsertSystemAgentCard: jest.fn(),
}));
jest.unstable_mockModule('../server/agent-registry/schema.js', () => ({ ensureAgentCardSchema: jest.fn() }));
jest.unstable_mockModule('../server/agent-registry/access.js', () => ({
  actorWithWorkspaceAccess: async (actor) => ({ ...actor, workspaceIds: ['ws-1'] }),
  canActorReadCard: async () => true,
  canActorInvokeCard: async () => true,
  resolveRegistryWorkspace: async ({ workspaceId }) => ({ id: workspaceId || 'ws-1' }),
}));
class AgentCardInstallError extends Error {
  constructor(message, statusCode, code) { super(message); this.statusCode = statusCode; this.code = code; }
}
jest.unstable_mockModule('../server/agent-registry/installStore.js', () => ({
  AgentCardInstallError,
  installAgentCard: async (_pool, { cardId }) => ({ created: true, install: { cardId } }),
  listAgentCardInstalls: async () => ({ installs: [] }),
  removeAgentCardInstall: async (_pool, { cardId }) => ({ removed: true, cardId }),
}));
const logged = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => ({
    info: (m) => logged.push([name, 'info', m]), warn: (m) => logged.push([name, 'warn', m]),
    error: () => {}, debug: () => {},
  }),
}));

const { default: express } = await import('express');
const { agentRegistryRouter } = await import('../server/routes/agentRegistry/index.js');

function appFor(userId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId }; next(); });
  app.use('/api/agent-registry', agentRegistryRouter);
  return app;
}

const lines = () => logged.filter(([name]) => name === 'agent-registry').map(([, level, line]) => `${level} ${line}`);
const SECRET = 'You are Testco Helper. Use key sk-demo-pat-123.';

beforeEach(() => { cards.clear(); logged.length = 0; });

test('publish, edit, install, remove and delete leave five lines, with no card text', async () => {
  const published = await request(appFor(7)).post('/api/agent-registry/cards')
    .send({ id: 'ext:7:testco-helper', name: 'Testco Helper', description: SECRET, metadata: { instructions: SECRET } });
  expect(published.status).toBe(201);
  expect((await request(appFor(7)).patch('/api/agent-registry/cards/ext:7:testco-helper').send({ name: 'Testco Helper 2', description: SECRET })).status).toBe(200);
  expect((await request(appFor(7)).put('/api/agent-registry/installs/ext:7:testco-helper?workspaceId=ws-1')).status).toBe(201);
  expect((await request(appFor(7)).delete('/api/agent-registry/installs/ext:7:testco-helper?workspaceId=ws-1')).status).toBe(200);
  expect((await request(appFor(7)).delete('/api/agent-registry/cards/ext:7:testco-helper')).status).toBe(204);
  expect(lines()).toEqual([
    'info publish card ext:7:testco-helper by account 7: done',
    'info edit card ext:7:testco-helper by account 7: done (changed name, description)',
    'info install card ext:7:testco-helper on board ws-1 by account 7: done',
    'info remove card ext:7:testco-helper on board ws-1 by account 7: done',
    'info delete card ext:7:testco-helper by account 7: done',
  ]);
  expect(JSON.stringify(logged)).not.toMatch(/sk-demo|You are|Testco Helper/);
});

test('a teammate\'s edit is refused and the line says why', async () => {
  await request(appFor(7)).post('/api/agent-registry/cards').send({ id: 'ext:7:testco-helper', name: 'Testco Helper' });
  logged.length = 0;
  const res = await request(appFor(8)).patch('/api/agent-registry/cards/ext:7:testco-helper').send({ name: 'Sam was here' });
  expect(res.status).toBe(403);
  expect(lines()).toEqual(['warn edit card ext:7:testco-helper by account 8: refused (403, Only the owner can update this card)']);
});
