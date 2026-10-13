import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn() };
const requireWorkspaceMember = jest.fn();
const fetchA2AImport = jest.fn();
const upsertA2AImport = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/agent-registry/adapters/a2aImport.js', () => ({
  fetchA2AImport,
  upsertA2AImport,
}));

const { default: express } = await import('express');
const { importA2ACard } = await import('../server/routes/agentRegistry/imports.js');

function app() {
  const value = express();
  value.use(express.json());
  value.post('/import', (req, _res, next) => {
    req.agentActor = { id: 7 };
    next();
  }, importA2ACard);
  return value;
}

describe('POST A2A import route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireWorkspaceMember.mockResolvedValue({ id: 'ws-1', role: 'owner' });
    fetchA2AImport.mockResolvedValue({
      executable: true, protocolVersion: '0.3.0', name: 'Remote',
    });
    upsertA2AImport.mockResolvedValue({
      created: true, card: { id: 'ext:a2a:abc', name: 'Remote' },
    });
  });

  test('requires workspace administration and imports only the supplied URL', async () => {
    const response = await request(app()).post('/import').send({
      workspaceId: 'ws-1',
      cardUrl: 'https://agent.example/.well-known/agent-card.json',
      ownerId: 99,
      metadata: { executor: { kind: 'forged' } },
    });
    expect(response.status).toBe(201);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(pool, {
      userId: 7, workspaceId: 'ws-1', roles: ['owner', 'admin'],
    });
    expect(fetchA2AImport).toHaveBeenCalledWith(
      'https://agent.example/.well-known/agent-card.json'
    );
    expect(upsertA2AImport).toHaveBeenCalledWith(expect.objectContaining({
      db: pool, workspaceId: 'ws-1', userId: 7,
    }));
    expect(response.body).toEqual(expect.objectContaining({
      imported: true, executable: true, protocolVersion: '0.3.0',
    }));
  });

  test('does not fetch when workspace access is denied', async () => {
    const denied = new Error('Workspace role does not allow this operation');
    denied.statusCode = 403;
    requireWorkspaceMember.mockRejectedValueOnce(denied);
    const response = await request(app()).post('/import').send({
      workspaceId: 'ws-1', cardUrl: 'https://agent.example/card',
    });
    expect(response.status).toBe(403);
    expect(fetchA2AImport).not.toHaveBeenCalled();
  });

  test('rejects incomplete input without touching the workspace or network', async () => {
    const response = await request(app()).post('/import').send({ workspaceId: 'ws-1' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('A2A_IMPORT_INPUT_REQUIRED');
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
    expect(fetchA2AImport).not.toHaveBeenCalled();
  });
});
