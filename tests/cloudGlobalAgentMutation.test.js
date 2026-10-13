import { jest } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const upsertAgent = jest.fn(async agent => agent);

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));
jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady: () => true,
  setDbReady: jest.fn(),
}));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgents: jest.fn().mockResolvedValue([]),
  getAgent: jest.fn().mockResolvedValue(null),
  upsertAgent,
}));
jest.unstable_mockModule('../server/tools.js', () => ({
  listToolCatalog: jest.fn(() => ({ tools: [], categories: [] })),
  filterToolsForAgent: jest.fn().mockResolvedValue([]),
}));

const { default: express } = await import('express');
const { coreRouter } = await import('../server/routes/agents/core.js');

const priorMode = process.env.CENSAI_MODE;

function app(session = { userId: 7, userRole: 'admin' }) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.session = session;
    next();
  });
  instance.use('/api', coreRouter);
  return instance;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CENSAI_MODE = 'cloud_saas';
  query.mockResolvedValue({ rows: [{ role: 'user' }] });
});

afterAll(() => {
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

test.each([
  ['post', '/api/agents', { id: 'custom-global', name: 'Global' }],
  ['put', '/api/agents/custom-global', { name: 'Changed' }],
])('ordinary cloud users cannot %s global agent state at %s', async (method, path, body) => {
  const response = await request(app())[method](path).send(body);

  expect(response.status).toBe(403);
  expect(response.body).toEqual({
    error: 'Global agents are operator-managed in cloud mode. Create a workspace-scoped sub-agent instead.',
    code: 'GLOBAL_AGENT_MUTATION_DENIED',
  });
  expect(query).toHaveBeenCalledWith('SELECT role FROM users WHERE id = $1', [7]);
  expect(upsertAgent).not.toHaveBeenCalled();
});

test('cloud authorization ignores a spoofed session role and requires an authenticated principal', async () => {
  const spoofed = await request(app({ userId: 7, userRole: 'admin' }))
    .post('/api/agents')
    .send({ id: 'custom-global', name: 'Global' });
  expect(spoofed.status).toBe(403);

  const missing = await request(app({}))
    .post('/api/agents')
    .send({ id: 'custom-global', name: 'Global' });
  expect(missing.status).toBe(401);
  expect(missing.body.code).toBe('AUTHENTICATION_REQUIRED');
  expect(upsertAgent).not.toHaveBeenCalled();
});

test.each(['admin', 'operator'])(
  'DB-verified %s can create a noncanonical global agent',
  async (role) => {
    query.mockResolvedValueOnce({ rows: [{ role }] });
    const payload = { id: `global-${role}`, name: `Global ${role}` };

    const response = await request(app({ userId: 7, userRole: 'user' }))
      .post('/api/agents')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(upsertAgent).toHaveBeenCalledWith(payload);
  },
);

test('a DB-verified cloud operator can update a noncanonical global agent', async () => {
  query.mockResolvedValueOnce({ rows: [{ role: 'operator' }] });

  const response = await request(app({ userId: 7, userRole: 'user' }))
    .put('/api/agents/custom-global')
    .send({ name: 'Updated Global' });

  expect(response.status).toBe(200);
  expect(upsertAgent).toHaveBeenCalledWith({ id: 'custom-global', name: 'Updated Global' });
});

test('canonical agents are rejected before cloud role authorization', async () => {
  const response = await request(app())
    .put('/api/agents/atlas')
    .send({ name: 'Changed' });

  expect(response.status).toBe(409);
  expect(response.body.code).toBe('CANONICAL_AGENT_IMMUTABLE');
  expect(query).not.toHaveBeenCalled();
  expect(upsertAgent).not.toHaveBeenCalled();
});

test('private-server mode preserves the existing noncanonical mutation path', async () => {
  process.env.CENSAI_MODE = 'private_server';
  const payload = { id: 'private-global', name: 'Private Global' };

  const response = await request(app()).post('/api/agents').send(payload);

  expect(response.status).toBe(200);
  expect(response.body).toEqual(payload);
  expect(query).not.toHaveBeenCalled();
  expect(upsertAgent).toHaveBeenCalledWith(payload);
});

test('cloud authorization store failures fail closed before mutation', async () => {
  query.mockRejectedValueOnce(new Error('database internals'));

  const response = await request(app())
    .post('/api/agents')
    .send({ id: 'custom-global', name: 'Global' });

  expect(response.status).toBe(503);
  expect(response.body).toEqual({
    error: 'Global agent authorization is temporarily unavailable.',
    code: 'GLOBAL_AGENT_AUTHORIZATION_UNAVAILABLE',
  });
  expect(upsertAgent).not.toHaveBeenCalled();
});
