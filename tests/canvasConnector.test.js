import { jest } from '@jest/globals';
import request from 'supertest';

const mockPool = { query: jest.fn(), connect: jest.fn() };
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));

const { default: express } = await import('express');
const { canvasRouter } = await import('../server/routes/canvas.js');
const {
  createCanvasIntegrationToken,
  hashCanvasToken,
} = await import('../server/security/canvasTokens.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', canvasRouter);
  return app;
}

describe('External Agent Canvas Connector (v1)', () => {
  const workspaceId = 'test-canvas-workspace';

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  describe('POST /api/canvas/cards — Authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(createApp())
        .post('/api/canvas/cards')
        .send({ title: 'Test', body: 'Content' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthenticated');
      expect(res.body.message).toMatch(/Bearer token is required/i);
    });

    it('returns 403 when token is invalid or non-existent', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_invalidtoken1234567890')
        .send({ title: 'Test', body: 'Content' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toMatch(/Invalid or expired token/i);
    });

    it('returns 403 when token lacks canvas:write scope', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'token-uuid-1',
          name: 'ReadOnly Integration',
          workspace_id: workspaceId,
          scopes: ['canvas:read'],
          pre_approved: true,
        }],
      });

      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_validtoken123')
        .send({ title: 'Test', body: 'Content' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toMatch(/missing required scope: canvas:write/i);
    });
  });

  describe('POST /api/canvas/cards — Payload Validation (422)', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'token-uuid-1',
          name: 'Valid Integration',
          workspace_id: workspaceId,
          scopes: ['canvas:write'],
          pre_approved: true,
        }],
      });
    });

    it('returns 422 when title is missing or empty', async () => {
      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_validtoken123')
        .send({ title: '   ', body: 'Valid Body' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Unprocessable Entity');
      expect(res.body.details).toContain('title must be a non-empty string');
    });

    it('returns 422 when body is missing', async () => {
      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_validtoken123')
        .send({ title: 'Title Only' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Unprocessable Entity');
      expect(res.body.details).toContain('body must be a string');
    });

    it('returns 422 when kind is invalid', async () => {
      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_validtoken123')
        .send({ title: 'Title', body: 'Body', kind: 'invalid_kind' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Unprocessable Entity');
      expect(res.body.details[0]).toMatch(/kind must be one of/i);
    });

    it('returns 422 when position is malformed', async () => {
      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_validtoken123')
        .send({ title: 'Title', body: 'Body', position: 'not-an-object' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Unprocessable Entity');
      expect(res.body.details).toContain('position must be an object with numeric x and y properties');
    });
  });

  describe('POST /api/canvas/cards — Happy Path (201)', () => {
    it('creates a doc card on the workspace canvas and returns card id + URLs', async () => {
      // 1. verify token query
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'token-uuid-1',
          name: 'Muse External Agent',
          workspace_id: workspaceId,
          scopes: ['canvas:write'],
          pre_approved: true,
        }],
      });

      // 2. Client queries inside transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ value: { wins: [] }, revision: 1 }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ revision: 2 }] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const payload = {
        title: 'Module Catalog Spec',
        body: '# Catalog\n\n- Auth Service\n- Canvas Connector',
        kind: 'doc',
        position: { x: 300, y: 200 },
        tags: ['docs', 'architecture'],
      };

      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_validtoken123')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Module Catalog Spec');
      expect(res.body.kind).toBe('doc');
      expect(res.body.workspaceId).toBe(workspaceId);
      expect(res.body.url).toBe(`hb://doc/${encodeURIComponent('Module Catalog Spec')}`);
      expect(res.body.deepLink).toBe(`hb://doc/${encodeURIComponent('Module Catalog Spec')}`);
      expect(res.body.position).toEqual({ x: 300, y: 200 });
    });
  });

  describe('POST /api/canvas/cards — Approval-Gated (202)', () => {
    it('surfaces an approval request when token preApproved is false', async () => {
      // 1. verify token query (pre_approved = false)
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'token-uuid-2',
            name: 'Untrusted Agent',
            workspace_id: workspaceId,
            scopes: ['canvas:write'],
            pre_approved: false,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'approval-uuid-999',
            status: 'pending',
            created_at: new Date().toISOString(),
          }],
        });

      const payload = {
        title: 'Sensitive Build Notes',
        body: 'Confidential system configuration',
      };

      const res = await request(createApp())
        .post('/api/canvas/cards')
        .set('Authorization', 'Bearer cit_untrusted123')
        .send(payload);

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('pending_approval');
      expect(res.body.approvalId).toBe('approval-uuid-999');
      expect(res.body.workspaceId).toBe(workspaceId);
    });
  });

  describe('canvasTokens security functions', () => {
    test('creates and verifies integration token correctly', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          token_prefix: 'cit_1234',
          name: 'Test Token',
          workspace_id: 'ws-1',
          scopes: ['canvas:write'],
          pre_approved: true,
          created_at: '2025-01-01',
        }],
      });

      const created = await createCanvasIntegrationToken(mockPool, {
        workspaceId: 'ws-1',
        name: 'Test Token',
      });

      expect(created.token).toMatch(/^cit_/);
      expect(created.workspaceId).toBe('ws-1');

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          name: 'Test Token',
          workspace_id: 'ws-1',
          scopes: ['canvas:write'],
          pre_approved: true,
        }],
      });

      const verified = await (await import('../server/security/canvasTokens.js')).verifyCanvasIntegrationToken(
        mockPool,
        created.token,
        'canvas:write'
      );

      expect(verified.valid).toBe(true);
      expect(verified.workspaceId).toBe('ws-1');
    });
  });
});
