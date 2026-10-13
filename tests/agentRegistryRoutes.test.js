// tests/agentRegistryRoutes.test.js
//
// Integration tests for the agent-registry REST surface. Mocks the
// factory module so we can exercise the route layer without standing
// up a real DB. The session middleware in `createApp` mirrors the
// pattern used in tests/operationalIntelligenceRoutes.test.js and
// tests/userApiKeysRoute.test.js — req.session.userId is the actor id.

import { jest } from '@jest/globals';
import request from 'supertest';

const createAgentCard = jest.fn();
const getAgentCard = jest.fn();
const listAgentCards = jest.fn();
const updateAgentCard = jest.fn();
const deleteAgentCard = jest.fn();

jest.unstable_mockModule('../server/agent-registry/factories.js', () => ({
  createAgentCard,
  getAgentCard,
  listAgentCards,
  updateAgentCard,
  deleteAgentCard,
  upsertSystemAgentCard: jest.fn(),
}));

// Schema bootstrap is a one-shot idempotent. We stub it so calls are cheap.
jest.unstable_mockModule('../server/agent-registry/schema.js', () => ({
  ensureAgentCardSchema: jest.fn().mockResolvedValue(undefined),
}));

const actorWithWorkspaceAccess = jest.fn();
const canActorReadCard = jest.fn();
const canActorInvokeCard = jest.fn();
const resolveRegistryWorkspace = jest.fn();
jest.unstable_mockModule('../server/agent-registry/access.js', () => ({
  actorWithWorkspaceAccess,
  canActorReadCard,
  canActorInvokeCard,
  resolveRegistryWorkspace,
}));

const { default: express } = await import('express');
const { agentRegistryRouter } = await import('../server/routes/agentRegistry/index.js');

function createApp({ userId = 7 } = {}) {
  const app = express();
  app.use(express.json());
  // Session stub mirrors the test environment convention: set
  // req.session.userId if a userId is provided, otherwise leave it
  // blank to simulate an unauthenticated caller.
  app.use((req, _res, next) => {
    if (userId === null) {
      req.session = {};
    } else {
      req.session = { userId };
    }
    next();
  });
  app.use('/api/agent-registry', agentRegistryRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default returns so the handlers always get a well-shaped value when
  // a test forgets to set up a specific mock. Tests that need a
  // different value override with mockResolvedValueOnce.
  listAgentCards.mockResolvedValue([]);
  getAgentCard.mockResolvedValue(null);
  createAgentCard.mockImplementation(async (input) => ({ id: input.id, ...input }));
  updateAgentCard.mockImplementation(async (id, patch) => ({ id, ...patch }));
  deleteAgentCard.mockResolvedValue({ id: 'mock', deleted_at: new Date() });
  actorWithWorkspaceAccess.mockImplementation(async (actor) => ({ ...actor, workspaceIds: ['ws-1'] }));
  canActorReadCard.mockImplementation(async (card, actor) => {
    if (card.visibility === 'public') return true;
    if (!card.workspace_id || !actor) return false;
    if (card.visibility === 'workspace') return true;
    return String(card.owner_id) === String(actor.id);
  });
  canActorInvokeCard.mockImplementation(async (card, actor) => {
    if (!actor) return false;
    if (card.visibility === 'public') return true;
    if (!card.workspace_id) return false;
    if (card.visibility === 'workspace') return true;
    return String(card.owner_id) === String(actor.id);
  });
  resolveRegistryWorkspace.mockImplementation(async ({ workspaceId }) => ({ id: workspaceId || 'ws-1' }));
});

describe('agent-registry REST routes', () => {
  // ─── LIST ──────────────────────────────────────────────────────────────

  describe('GET /api/agent-registry/cards', () => {
    test('returns the 7 system agents when called by an unauthenticated caller', async () => {
      const systemAgents = [
        { id: 'agent:architect', visibility: 'public', owner_id: null },
        { id: 'agent:atlas', visibility: 'public', owner_id: null },
        { id: 'agent:censai', visibility: 'public', owner_id: null },
        { id: 'agent:echo', visibility: 'public', owner_id: null },
        { id: 'agent:foundation', visibility: 'public', owner_id: null },
        { id: 'agent:genesis', visibility: 'public', owner_id: null },
        { id: 'agent:nexus', visibility: 'public', owner_id: null },
      ];
      listAgentCards.mockResolvedValueOnce(systemAgents);

      const response = await request(createApp({ userId: null })).get('/api/agent-registry/cards');
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(7);
      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(0);
    });

    test('drops non-public cards for unauthenticated callers', async () => {
      const cards = [
        { id: 'agent:architect', visibility: 'public', owner_id: null },
        { id: 'ext:7:private-1', visibility: 'private', owner_id: '7' },
        { id: 'ext:8:private-2', visibility: 'private', owner_id: '8' },
      ];
      listAgentCards.mockResolvedValueOnce(cards);

      const response = await request(createApp({ userId: null })).get('/api/agent-registry/cards');
      expect(response.status).toBe(200);
      // Only the public card survives visibility filtering.
      expect(response.body.items.map((c) => c.id)).toEqual(['agent:architect']);
    });

    test('passes through visibility/owner/workspace filters and pagination', async () => {
      listAgentCards.mockResolvedValueOnce([]);
      const response = await request(createApp({ userId: 7 }))
        .get('/api/agent-registry/cards')
        .query({ visibility: 'private', owner_id: '7', workspace_id: 'ws-1', limit: 50, offset: 10 });

      expect(response.status).toBe(200);
      expect(listAgentCards).toHaveBeenCalledWith({
        visibility: 'private',
        owner_id: '7',
        limit: 500,
        offset: 0,
      });
      expect(response.body).toEqual({ items: [], total: 0, limit: 50, offset: 10 });
    });

    test('clamps limit to [1, 100]', async () => {
      const over = await request(createApp({ userId: 7 }))
        .get('/api/agent-registry/cards')
        .query({ limit: 9999 });
      expect(over.body.limit).toBe(100);

      const under = await request(createApp({ userId: 7 }))
        .get('/api/agent-registry/cards')
        .query({ limit: 0 });
      // Below the minimum the value is clamped to 1, not silently
      // replaced with the default — the caller asked for 0 of
      // something, we deliver 1 of something.
      expect(under.body.limit).toBe(1);
    });

    test('rejects an invalid visibility filter with 400', async () => {
      // The real factory throws on bad visibility. We simulate that
      // here so the route's error-mapping is exercised end-to-end.
      listAgentCards.mockRejectedValueOnce(new Error('visibility must be one of private, workspace, public'));
      const response = await request(createApp({ userId: 7 }))
        .get('/api/agent-registry/cards')
        .query({ visibility: 'global' });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/visibility must be one of/);
    });
  });

  // ─── READ ONE ──────────────────────────────────────────────────────────

  describe('GET /api/agent-registry/cards/:id', () => {
    test('returns a public card to anyone (including unauthenticated)', async () => {
      const card = { id: 'agent:architect', visibility: 'public', owner_id: null };
      getAgentCard.mockResolvedValueOnce(card);

      const response = await request(createApp({ userId: null })).get('/api/agent-registry/cards/agent:architect');
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('agent:architect');
    });

    test('returns 404 for a non-existent card', async () => {
      getAgentCard.mockResolvedValueOnce(null);
      const response = await request(createApp({ userId: 7 })).get('/api/agent-registry/cards/agent:ghost');
      expect(response.status).toBe(404);
    });

    test('hides a private card from non-owners (404, not 403)', async () => {
      const card = { id: 'ext:7:secret', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' };
      getAgentCard.mockResolvedValueOnce(card);

      const response = await request(createApp({ userId: 99 })).get('/api/agent-registry/cards/ext:7:secret');
      expect(response.status).toBe(404);
      expect(response.body.error).toMatch(/Card not found/);
    });

    test('returns a private card to its owner', async () => {
      const card = { id: 'ext:7:secret', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' };
      getAgentCard.mockResolvedValueOnce(card);

      const response = await request(createApp({ userId: 7 })).get('/api/agent-registry/cards/ext:7:secret');
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('ext:7:secret');
    });
  });

  // ─── CREATE ────────────────────────────────────────────────────────────

  describe('POST /api/agent-registry/cards', () => {
    test('rejects unauthenticated callers with 401', async () => {
      const response = await request(createApp({ userId: null }))
        .post('/api/agent-registry/cards')
        .send({ name: 'Test', description: 'Test' });
      expect(response.status).toBe(401);
      expect(createAgentCard).not.toHaveBeenCalled();
    });

    test('mints an owner-scoped id when the body omits one', async () => {
      const created = {
        id: 'ext:7:minted-id',
        name: 'Test',
        description: 'Test',
        visibility: 'private',
        owner_id: '7',
      };
      createAgentCard.mockResolvedValueOnce(created);

      const response = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards')
        .send({ name: 'Test', description: 'Test' });

      expect(response.status).toBe(201);
      expect(createAgentCard).toHaveBeenCalledTimes(1);
      const arg = createAgentCard.mock.calls[0][0];
      expect(arg.owner_id).toBe('7');
      expect(arg.id).toMatch(/^ext:7:/);
      expect(arg.name).toBe('Test');
      expect(arg.description).toBe('Test');
      expect(arg.visibility).toBe('private');
      expect(arg.workspace_id).toBe('ws-1');
    });

    test('rejects caller-supplied ids in the reserved built-in namespace', async () => {
      const response = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards')
        .send({ id: 'agent:custom', name: 'Custom', description: 'Hello' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/namespace is reserved/);
      expect(createAgentCard).not.toHaveBeenCalled();
    });

    test('returns 400 when the factory rejects (e.g. invalid visibility)', async () => {
      createAgentCard.mockRejectedValueOnce(new Error('visibility must be one of private, workspace, public'));
      const response = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards')
        .send({ name: 'X', description: 'Y', visibility: 'global' });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/visibility/);
    });
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────

  describe('PATCH /api/agent-registry/cards/:id', () => {
    test('rejects unauthenticated callers with 401', async () => {
      const response = await request(createApp({ userId: null }))
        .patch('/api/agent-registry/cards/ext:7:foo')
        .send({ name: 'X' });
      expect(response.status).toBe(401);
      expect(updateAgentCard).not.toHaveBeenCalled();
    });

    test('returns 403 when the caller is not the owner', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7', workspace_id: 'ws-1', visibility: 'private' });
      const response = await request(createApp({ userId: 99 }))
        .patch('/api/agent-registry/cards/ext:7:foo')
        .send({ name: 'X' });
      expect(response.status).toBe(403);
      expect(updateAgentCard).not.toHaveBeenCalled();
    });

    test('returns 404 when the card does not exist', async () => {
      getAgentCard.mockResolvedValueOnce(null);
      const response = await request(createApp({ userId: 7 }))
        .patch('/api/agent-registry/cards/agent:ghost')
        .send({ name: 'X' });
      expect(response.status).toBe(404);
    });

    test('updates and strips id/owner_id from the patch', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7', workspace_id: 'ws-1', visibility: 'private' });
      const updated = { id: 'ext:7:foo', owner_id: '7', name: 'New name' };
      updateAgentCard.mockResolvedValueOnce(updated);

      const response = await request(createApp({ userId: 7 }))
        .patch('/api/agent-registry/cards/ext:7:foo')
        .send({ id: 'hijacked', owner_id: 'attacker', workspace_id: 'ws-2', name: 'New name' });

      expect(response.status).toBe(200);
      expect(updateAgentCard).toHaveBeenCalledWith('ext:7:foo', { name: 'New name' });
      expect(response.body.name).toBe('New name');
    });
  });

  // ─── SOFT DELETE ───────────────────────────────────────────────────────

  describe('DELETE /api/agent-registry/cards/:id', () => {
    test('returns 204 for the owner and soft-deletes the card', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7', workspace_id: 'ws-1', visibility: 'private' });
      deleteAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', deleted_at: new Date() });

      const response = await request(createApp({ userId: 7 })).delete('/api/agent-registry/cards/ext:7:foo');
      expect(response.status).toBe(204);
      expect(deleteAgentCard).toHaveBeenCalledWith('ext:7:foo');
    });

    test('returns 403 for a non-owner', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7' });
      const response = await request(createApp({ userId: 99 })).delete('/api/agent-registry/cards/ext:7:foo');
      expect(response.status).toBe(403);
      expect(deleteAgentCard).not.toHaveBeenCalled();
    });

    test('returns 404 when the card does not exist', async () => {
      getAgentCard.mockResolvedValueOnce(null);
      const response = await request(createApp({ userId: 7 })).delete('/api/agent-registry/cards/agent:ghost');
      expect(response.status).toBe(404);
    });
  });

  // ─── CREATE → GET → UPDATE → DELETE → LIST (gone) flow ─────────────────

  test('full CRUD lifecycle for a user-published card', async () => {
    const created = {
      id: 'ext:7:lifecycle',
      name: 'Lifecycle',
      description: 'Test',
      visibility: 'private',
      owner_id: '7',
      workspace_id: 'ws-1',
    };
    const updated = { ...created, name: 'Lifecycle v2' };

    createAgentCard.mockResolvedValueOnce(created);
    const createRes = await request(createApp({ userId: 7 }))
      .post('/api/agent-registry/cards')
      .send({ name: 'Lifecycle', description: 'Test' });
    expect(createRes.status).toBe(201);

    // GET works for the owner.
    getAgentCard.mockResolvedValueOnce(created);
    const getRes = await request(createApp({ userId: 7 })).get('/api/agent-registry/cards/ext:7:lifecycle');
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe('ext:7:lifecycle');

    // UPDATE changes name and bumps the field.
    getAgentCard.mockResolvedValueOnce(created);
    updateAgentCard.mockResolvedValueOnce(updated);
    const updateRes = await request(createApp({ userId: 7 }))
      .patch('/api/agent-registry/cards/ext:7:lifecycle')
      .send({ name: 'Lifecycle v2' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Lifecycle v2');

    // DELETE soft-deletes.
    getAgentCard.mockResolvedValueOnce(updated);
    deleteAgentCard.mockResolvedValueOnce({ ...updated, deleted_at: new Date() });
    const delRes = await request(createApp({ userId: 7 })).delete('/api/agent-registry/cards/ext:7:lifecycle');
    expect(delRes.status).toBe(204);

    // GET returns 404 once deleted (factory returns null).
    getAgentCard.mockResolvedValueOnce(null);
    const afterRes = await request(createApp({ userId: 7 })).get('/api/agent-registry/cards/ext:7:lifecycle');
    expect(afterRes.status).toBe(404);

    // LIST no longer includes the deleted card (factory filters deleted_at).
    listAgentCards.mockResolvedValueOnce([{ id: 'agent:architect', visibility: 'public', owner_id: null }]);
    const listRes = await request(createApp({ userId: 7 })).get('/api/agent-registry/cards');
    expect(listRes.body.items.map((c) => c.id)).not.toContain('ext:7:lifecycle');
  });
});
