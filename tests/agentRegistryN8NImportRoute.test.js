import { jest } from '@jest/globals';
import request from 'supertest';

const pool = { query: jest.fn() };
const requireWorkspaceMember = jest.fn();
const normalizeN8NImportInput = jest.fn((value) => ({
  name: value.name, description: value.description, webhookUrl: value.webhookUrl,
}));
const inspectN8NImport = jest.fn();
const upsertN8NImport = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));
jest.unstable_mockModule('../server/agent-registry/adapters/n8nImport.js', () => ({
  N8NAdapterError: class extends Error {
    constructor(message, code, statusCode) {
      super(message); this.code = code; this.statusCode = statusCode;
    }
  },
  normalizeN8NImportInput,
  inspectN8NImport,
  upsertN8NImport,
}));

const { default: express } = await import('express');
const { importN8NChat } = await import('../server/routes/agentRegistry/imports.js');

function app() {
  const value = express();
  value.use(express.json());
  value.post('/import', (req, _res, next) => {
    req.agentActor = { id: 7 };
    next();
  }, importN8NChat);
  return value;
}

describe('POST n8n Chat Trigger import route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    normalizeN8NImportInput.mockImplementation((value) => ({
      name: value.name, description: value.description, webhookUrl: value.webhookUrl,
    }));
    requireWorkspaceMember.mockResolvedValue({ id: 'ws-1', role: 'owner' });
    inspectN8NImport.mockResolvedValue({ protocolVersion: 'n8n-chat-v1' });
    upsertN8NImport.mockResolvedValue({
      created: true, card: { id: 'ext:n8n:abc', name: 'Research workflow' },
    });
  });

  test('authorizes before endpoint inspection and ignores forged fields', async () => {
    const response = await request(app()).post('/import').send({
      workspaceId: 'ws-1', name: 'Research workflow', description: 'Researches.',
      webhookUrl: 'https://n8n.example/webhook/chat',
      ownerId: 99, metadata: { executor: { kind: 'forged' } }, auth: { type: 'bearer' },
    });
    expect(response.status).toBe(201);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(pool, {
      userId: 7, workspaceId: 'ws-1', roles: ['owner', 'admin'],
    });
    expect(requireWorkspaceMember.mock.invocationCallOrder[0])
      .toBeLessThan(inspectN8NImport.mock.invocationCallOrder[0]);
    expect(inspectN8NImport).toHaveBeenCalledWith(expect.not.objectContaining({ auth: expect.anything() }));
    expect(response.body).toEqual(expect.objectContaining({
      imported: true, executable: true, endpointVerification: 'first_call',
    }));
  });

  test('does not resolve or save when workspace access is denied', async () => {
    const denied = new Error('Workspace role does not allow this operation');
    denied.statusCode = 403;
    requireWorkspaceMember.mockRejectedValueOnce(denied);
    const response = await request(app()).post('/import').send({
      workspaceId: 'ws-1', name: 'Workflow', description: 'Does work.',
      webhookUrl: 'https://n8n.example/webhook/chat',
    });
    expect(response.status).toBe(403);
    expect(inspectN8NImport).not.toHaveBeenCalled();
    expect(upsertN8NImport).not.toHaveBeenCalled();
  });

  test('rejects missing workspace before authorization', async () => {
    const response = await request(app()).post('/import').send({ name: 'Workflow' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('N8N_IMPORT_INPUT_REQUIRED');
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
  });
});
