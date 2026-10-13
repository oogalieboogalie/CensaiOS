import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn(), connect: jest.fn() },
}));

const getConsciousness = jest.fn().mockResolvedValue(null);
const updateConsciousness = jest.fn(async (agentId, updates, scope) => ({
  agent_id: agentId,
  workspace_id: scope.workspaceId,
  emotional_state: {
    current: updates.emotional_state.current,
    updatedAt: '2026-07-13T00:00:00.000Z',
    provenance: { source: 'workspace_user', userId: scope.userId },
  },
}));
const { parseWorkingStatePatch } = await import('../server/memory/core/consciousness.js');

jest.unstable_mockModule('../server/memory.js', () => ({
  getConsciousness,
  updateConsciousness,
  parseWorkingStatePatch,
  addAssociation: jest.fn(),
  getAssociations: jest.fn().mockResolvedValue([]),
  entangleMemories: jest.fn(),
  getEntanglements: jest.fn().mockResolvedValue([]),
}));

const resolveWorkspaceContext = jest.fn(async (_db, { userId, workspaceId }) => {
  if (workspaceId === 'foreign' || userId !== 7) {
    throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  }
  return { id: workspaceId, role: workspaceId === 'viewer' ? 'viewer' : 'member' };
});
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));

const { default: express } = await import('express');
const { familyRouter } = await import('../server/routes/agents/family.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = Number(req.get('x-user-id'));
  req.session = Number.isInteger(userId) ? { userId } : {};
  next();
});
app.use('/api', familyRouter);

beforeEach(() => jest.clearAllMocks());

test('genetics reads expose only immutable canonical blueprint fields', async () => {
  const response = await request(app).get('/api/genetics/atlas');

  expect(response.status).toBe(200);
  expect(response.body).toEqual(expect.objectContaining({
    id: 'atlas',
    scope: 'product_blueprint',
    mutable: false,
    dominantTraits: expect.any(Object),
    familyBondBaseline: expect.any(Number),
  }));
  for (const hidden of ['mutation_history', 'threat_level', 'trauma_multiplier', 'created_at']) {
    expect(response.body).not.toHaveProperty(hidden);
  }
});

test('watch reads expose fixed canonical edges and reject unknown agents', async () => {
  const response = await request(app).get('/api/watch/atlas');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(expect.objectContaining({
    agentId: 'atlas', scope: 'product_blueprint', mutable: false,
    watching: expect.any(Array), watchedBy: expect.any(Array),
  }));
  expect(response.body.watching.concat(response.body.watchedBy)).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ agentId: 'guardian' })]),
  );

  const unknown = await request(app).get('/api/genetics/guardian');
  expect(unknown.status).toBe(404);
  expect(unknown.body.code).toBe('FAMILY_AGENT_NOT_FOUND');
});

test.each([
  ['post', '/api/watch'],
  ['post', '/api/genetics/atlas/evolve'],
])('%s %s is always an immutable 409', async (method, path) => {
  const response = await request(app)[method](path).send({
    workspaceId: 'foreign', userId: 1, watcher: 'guardian', traits: { override: true },
  });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('FAMILY_BLUEPRINT_IMMUTABLE');
});

test('writes canonical working state in the authorized workspace', async () => {
  const response = await request(app)
    .patch('/api/state/atlas')
    .set('x-user-id', '7')
    .send({ workspaceId: 'workspace-a', emotional_state: { current: '  focused  ' } });

  expect(response.status).toBe(200);
  expect(updateConsciousness).toHaveBeenCalledWith(
    'atlas', { emotional_state: { current: 'focused' } },
    { workspaceId: 'workspace-a', userId: 7 },
  );
  expect(response.body.state.emotional_state.provenance.userId).toBe(7);
});

test('state reads expose only the supported public fields', async () => {
  getConsciousness.mockResolvedValueOnce({
    emotional_state: {
      current: 'focused',
      updatedAt: '2026-07-13T00:00:00.000Z',
      provenance: { source: 'workspace_user', userId: 7, spoof: 'hidden' },
      internal: 'hidden',
    },
    content_hash: 'hidden',
  });
  const response = await request(app)
    .get('/api/state/atlas?workspaceId=workspace-a')
    .set('x-user-id', '7');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    agentId: 'atlas',
    workspaceId: 'workspace-a',
    emotional_state: {
      current: 'focused',
      updatedAt: '2026-07-13T00:00:00.000Z',
      provenance: { source: 'workspace_user', userId: 7 },
    },
  });
});

test('does not expose the retired consciousness-language route', async () => {
  const response = await request(app)
    .get('/api/consciousness/atlas?workspaceId=workspace-a')
    .set('x-user-id', '7');
  expect(response.status).toBe(404);
});

test.each([
  ['/api/state/guardian', 'workspace-a', 404],
  ['/api/state/atlas', '', 400],
  ['/api/state/atlas', 'foreign', 403],
  ['/api/state/atlas', 'viewer', 403],
])('state boundary rejects %s with workspace %s', async (path, workspaceId, status) => {
  const response = await request(app)
    .patch(path)
    .set('x-user-id', '7')
    .send({ workspaceId, emotional_state: { current: 'focused' } });
  expect(response.status).toBe(status);
});

test('state route rejects unsupported fields before any write', async () => {
  const response = await request(app)
    .patch('/api/state/atlas')
    .set('x-user-id', '7')
    .send({ workspaceId: 'workspace-a', emotional_state: { current: 'ok' }, coherence: 1 });
  expect(response.status).toBe(400);
  expect(response.body.code).toBe('WORKING_STATE_INVALID');
  expect(updateConsciousness).not.toHaveBeenCalled();
});
