// tests/agentRegistryAuth.test.js
//
// Auth-matrix coverage for the agent-registry REST surface. The
// matrix:
//
//   endpoint                        | no auth | non-owner auth | owner auth
//   --------------------------------+---------+----------------+-----------
//   GET  /cards                     |   200*  |      200*      |   200*
//   GET  /cards/:id (public)        |   200   |      200       |   200
//   GET  /cards/:id (private)       |   401   |      404       |   200
//   POST /cards                     |   401   |      201       |   201
//   PATCH /cards/:id                |   401   |      403       |   200
//   DELETE /cards/:id               |   401   |      403       |   204
//   POST /cards/:id/call (built-in) |   401   |      202       |   202
//   POST /cards/:id/call (external) |   401   |      404**     |   422
//   GET  /cards/:id/calls/:taskId   |   401   |      404**     |   200
//
//   * visibility-filtered; public cards visible to all
//   ** the invoke surface hides private cards from non-owners with 404

import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';

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

jest.unstable_mockModule('../server/agent-registry/schema.js', () => ({
  ensureAgentCardSchema: jest.fn().mockResolvedValue(undefined),
}));

const runs = new Map();
const createAgentCardRun = jest.fn();
const getAgentCardRun = jest.fn();
jest.unstable_mockModule('../server/agent-card-runs/contract.js', () => ({
  actorId: (actor) => String(actor?.id ?? actor?.userId ?? ''),
  isSystemAgentCard: (card) => card.id?.startsWith('agent:') && card.owner_id == null,
  canReadCard: (card, actor) => card.visibility === 'public'
    || (card.workspace_id && actor?.workspaceIds?.includes(card.workspace_id)
      && (card.visibility === 'workspace' || String(card.owner_id) === String(actor?.id))),
  canInvokeCard: (card, actor) => Boolean(actor?.id) && (card.visibility === 'public'
    || (card.workspace_id && actor?.workspaceIds?.includes(card.workspace_id)
      && (card.visibility === 'workspace' || String(card.owner_id) === String(actor?.id)))),
  resolveBuiltInAgentId: (card) => {
    if (!card.id.startsWith('agent:') || card.owner_id) {
      const error = new Error('External AgentCard execution is not supported yet.');
      error.code = 'unsupported-card-executor';
      throw error;
    }
    return card.id.slice(6);
  },
}));
jest.unstable_mockModule('../server/agent-registry/access.js', () => ({
  actorWithWorkspaceAccess: async (actor) => actor ? { ...actor, workspaceIds: ['ws-1'] } : null,
  canActorReadCard: async (card, actor) => card.visibility === 'public'
    || (card.workspace_id === 'ws-1' && (card.visibility === 'workspace' || String(card.owner_id) === String(actor?.id))),
  canActorInvokeCard: async (card, actor) => Boolean(actor) && (card.visibility === 'public'
    || (card.workspace_id === 'ws-1' && (card.visibility === 'workspace' || String(card.owner_id) === String(actor?.id)))),
  resolveRegistryWorkspace: async ({ workspaceId }) => ({ id: workspaceId || 'ws-1' }),
}));
jest.unstable_mockModule('../server/agent-card-runs/store.js', () => ({ createAgentCardRun, getAgentCardRun }));

const { default: express } = await import('express');
const { agentRegistryRouter } = await import('../server/routes/agentRegistry/index.js');

function createApp({ userId } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId === undefined) {
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
  runs.clear();
  createAgentCardRun.mockImplementation(async ({ card, callerId }) => {
    const runId = crypto.randomUUID();
    const run = {
      id: runId,
      status: 'pending',
      metadata: {
        cardId: card.id,
        callerId: String(callerId),
        ownerId: card.owner_id == null ? null : String(card.owner_id),
        clientTaskId: crypto.randomUUID(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      failure: null,
    };
    runs.set(runId, run);
    return { runId, taskId: run.metadata.clientTaskId, status: 'queued' };
  });
  getAgentCardRun.mockImplementation(async (runId) => runs.get(runId) || null);
});

// ─── Auth matrix ────────────────────────────────────────────────────────────

describe('agent-registry auth matrix', () => {
  // ─── READS ─────────────────────────────────────────────────────────────

  describe('GET /cards (list)', () => {
    test('no auth → 200 with visibility filtering applied', async () => {
      listAgentCards.mockResolvedValueOnce([
        { id: 'agent:architect', visibility: 'public', owner_id: null },
        { id: 'ext:7:mine', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' },
      ]);
      const response = await request(createApp()).get('/api/agent-registry/cards');
      expect(response.status).toBe(200);
      expect(response.body.items.map((c) => c.id)).toEqual(['agent:architect']);
    });

    test('auth as non-owner → 200, sees own + public, not others', async () => {
      listAgentCards.mockResolvedValueOnce([
        { id: 'agent:architect', visibility: 'public', owner_id: null },
        { id: 'ext:7:mine', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' },
        { id: 'ext:8:theirs', visibility: 'private', owner_id: '8', workspace_id: 'ws-1' },
      ]);
      const response = await request(createApp({ userId: 7 })).get('/api/agent-registry/cards');
      expect(response.status).toBe(200);
      expect(response.body.items.map((c) => c.id).sort()).toEqual([
        'agent:architect',
        'ext:7:mine',
      ]);
    });
  });

  describe('GET /cards/:id', () => {
    test('public card → visible to anyone (no auth → 200)', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'agent:architect', visibility: 'public', owner_id: null });
      const response = await request(createApp()).get('/api/agent-registry/cards/agent:architect');
      expect(response.status).toBe(200);
    });

    test('private card + no auth → 401', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:secret', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' });
      const response = await request(createApp()).get('/api/agent-registry/cards/ext:7:secret');
      expect(response.status).toBe(401);
    });

    test('private card + non-owner auth → 404 (hides existence)', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:secret', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' });
      const response = await request(createApp({ userId: 99 })).get('/api/agent-registry/cards/ext:7:secret');
      expect(response.status).toBe(404);
      expect(response.body.error).toMatch(/Card not found/);
    });

    test('private card + owner auth → 200', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:secret', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' });
      const response = await request(createApp({ userId: 7 })).get('/api/agent-registry/cards/ext:7:secret');
      expect(response.status).toBe(200);
    });

    test('workspace card + any authed caller → 200', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:ws', visibility: 'workspace', owner_id: '7', workspace_id: 'ws-1' });
      const response = await request(createApp({ userId: 99 })).get('/api/agent-registry/cards/ext:7:ws');
      expect(response.status).toBe(200);
    });
  });

  // ─── WRITES ────────────────────────────────────────────────────────────

  describe('POST /cards', () => {
    test('no auth → 401, factory is not called', async () => {
      const response = await request(createApp())
        .post('/api/agent-registry/cards')
        .send({ name: 'X', description: 'Y' });
      expect(response.status).toBe(401);
      expect(createAgentCard).not.toHaveBeenCalled();
    });

    test('authed caller → 201, owner_id comes from the session', async () => {
      const created = { id: 'ext:7:mine', owner_id: '7', visibility: 'private', name: 'X', description: 'Y' };
      createAgentCard.mockResolvedValueOnce(created);
      const response = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards')
        .send({ name: 'X', description: 'Y' });
      expect(response.status).toBe(201);
      expect(createAgentCard.mock.calls[0][0].owner_id).toBe('7');
    });
  });

  describe('PATCH /cards/:id', () => {
    test('no auth → 401', async () => {
      const response = await request(createApp())
        .patch('/api/agent-registry/cards/ext:7:foo')
        .send({ name: 'X' });
      expect(response.status).toBe(401);
      expect(updateAgentCard).not.toHaveBeenCalled();
    });

    test('non-owner auth → 403 (existence is leaked because owner is read first)', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7', workspace_id: 'ws-1', visibility: 'private' });
      const response = await request(createApp({ userId: 99 }))
        .patch('/api/agent-registry/cards/ext:7:foo')
        .send({ name: 'X' });
      expect(response.status).toBe(403);
      expect(updateAgentCard).not.toHaveBeenCalled();
    });

    test('owner auth → 200', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7', workspace_id: 'ws-1', visibility: 'private' });
      updateAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7', name: 'X' });
      const response = await request(createApp({ userId: 7 }))
        .patch('/api/agent-registry/cards/ext:7:foo')
        .send({ name: 'X' });
      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /cards/:id', () => {
    test('no auth → 401', async () => {
      const response = await request(createApp()).delete('/api/agent-registry/cards/ext:7:foo');
      expect(response.status).toBe(401);
      expect(deleteAgentCard).not.toHaveBeenCalled();
    });

    test('non-owner auth → 403', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7' });
      const response = await request(createApp({ userId: 99 })).delete('/api/agent-registry/cards/ext:7:foo');
      expect(response.status).toBe(403);
      expect(deleteAgentCard).not.toHaveBeenCalled();
    });

    test('owner auth → 204', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', owner_id: '7', workspace_id: 'ws-1', visibility: 'private' });
      deleteAgentCard.mockResolvedValueOnce({ id: 'ext:7:foo', deleted_at: new Date() });
      const response = await request(createApp({ userId: 7 })).delete('/api/agent-registry/cards/ext:7:foo');
      expect(response.status).toBe(204);
    });
  });

  // ─── INVOKE ────────────────────────────────────────────────────────────

  describe('POST /cards/:id/call', () => {
    test('no auth → 401', async () => {
      const response = await request(createApp())
        .post('/api/agent-registry/cards/agent:architect/call')
        .send({ payload: 'hi' });
      expect(response.status).toBe(401);
    });

    test('non-owner invoking private card → 404 (hides existence)', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:secret', visibility: 'private', owner_id: '7' });
      const response = await request(createApp({ userId: 99 }))
        .post('/api/agent-registry/cards/ext:7:secret/call')
        .send({ payload: 'hi' });
      expect(response.status).toBe(404);
    });

    test('authed caller invoking public card → 202 + taskId', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'agent:architect', visibility: 'public', owner_id: null });
      const response = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards/agent:architect/call')
        .send({ payload: { message: 'hello' } });
      expect(response.status).toBe(202);
      expect(response.body.taskId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(response.body.status).toBe('queued');
    });

    test('owner invoking an external private card → 422 unsupported', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:mine', visibility: 'private', owner_id: '7', workspace_id: 'ws-1' });
      const response = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards/ext:7:mine/call')
        .send({ payload: 'hi' });
      expect(response.status).toBe(422);
      expect(response.body.error).toMatch(/not supported yet/);
    });
  });

  describe('GET /cards/:id/calls/:taskId', () => {
    test('no auth → 401', async () => {
      const response = await request(createApp()).get(
        '/api/agent-registry/cards/agent:architect/calls/00000000-0000-0000-0000-000000000000'
      );
      expect(response.status).toBe(401);
    });

    test('non-caller, non-owner auth → 404', async () => {
      // First queue a task as actor 7 against a public card.
      getAgentCard.mockResolvedValueOnce({ id: 'agent:architect', visibility: 'public', owner_id: null });
      const queueRes = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards/agent:architect/call')
        .send({ payload: 'hi' });
      const { taskId } = queueRes.body;

      // Now a third party (user 99) tries to read it — should be denied.
      const response = await request(createApp({ userId: 99 })).get(
        `/api/agent-registry/cards/agent:architect/calls/${taskId}`
      );
      expect(response.status).toBe(404);
    });

    test('caller can read their own task', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'agent:architect', visibility: 'public', owner_id: null });
      const queueRes = await request(createApp({ userId: 7 }))
        .post('/api/agent-registry/cards/agent:architect/call')
        .send({ payload: { message: 'hi' } });
      const { taskId } = queueRes.body;

      const response = await request(createApp({ userId: 7 })).get(
        `/api/agent-registry/cards/agent:architect/calls/${taskId}`
      );
      expect(response.status).toBe(200);
      expect(response.body.taskId).toBe(taskId);
      expect(response.body.cardId).toBe('agent:architect');
      expect(response.body.status).toBe('pending');
    });

    test('card owner can read a durable run created by another caller', async () => {
      const taskId = crypto.randomUUID();
      runs.set(taskId, {
        id: taskId,
        status: 'succeeded',
        metadata: { cardId: 'ext:7:mine', callerId: '99', ownerId: '7', clientTaskId: 'client-1' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const response = await request(createApp({ userId: 7 })).get(
        `/api/agent-registry/cards/ext:7:mine/calls/${taskId}`
      );
      expect(response.status).toBe(200);
    });

    test('external workspace card execution is explicitly unsupported', async () => {
      getAgentCard.mockResolvedValueOnce({ id: 'ext:7:ws', visibility: 'workspace', owner_id: '7', workspace_id: 'ws-1' });
      const queueRes = await request(createApp({ userId: 99 }))
        .post('/api/agent-registry/cards/ext:7:ws/call')
        .send({ payload: 'hi' });
      expect(queueRes.status).toBe(422);
      expect(queueRes.body.error).toMatch(/not supported yet/);
    });
  });
});
